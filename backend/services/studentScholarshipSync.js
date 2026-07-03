const { masterPool } = require('../config/database');
const {
  normalizeRtfReleasedDate,
  clampScholarshipAmount
} = require('../utils/scholarshipValidation');

const VALID_ELIGIBLE = ['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied'];
const SCHOLARSHIP_INELIGIBLE_QUOTA_CODES = new Set(['MANG', 'MQ', 'SPOT', 'LSPOT']);
const DEFAULT_TOTAL_YEARS = 4;
const DEFAULT_SEMESTERS_PER_YEAR = 2;

const normalizeStudTypeCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  if (code === 'MQ') return 'MANG';
  return code;
};

const isScholarshipIneligibleQuota = (studType) => (
  SCHOLARSHIP_INELIGIBLE_QUOTA_CODES.has(normalizeStudTypeCode(studType))
);

const normalizeEligible = (value) => {
  let normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'not eligible' || normalized === 'not-eligible') {
    normalized = 'not_eligible';
  }
  if (normalized === 'not applied' || normalized === 'not-applied') {
    normalized = 'not_applied';
  }
  return VALID_ELIGIBLE.includes(normalized) ? normalized : null;
};

const normalizeScholarStatusForResponse = (value) => normalizeEligible(value);

const STANDARD_SCHOLAR_STATUS_FILTER_OPTIONS = ['eligible', 'pending', 'rejected', 'not_eligible'];

const getScholarStatusColumnFilterClause = (filterValue) => {
  const normalized = String(filterValue || '').trim().toLowerCase();
  if (!normalized) return { clause: '', params: [] };
  if (normalized === 'not_eligible' || normalized === 'not eligible') {
    return {
      clause: ` AND LOWER(TRIM(IFNULL(scholar_status,''))) IN ('not eligible', 'not_eligible')`,
      params: []
    };
  }
  if (normalized === 'rejected') {
    return {
      clause: ` AND LOWER(TRIM(IFNULL(scholar_status,''))) = 'rejected'`,
      params: []
    };
  }
  if (normalized === 'pending') {
    return {
      clause: ` AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '' OR LOWER(TRIM(scholar_status)) = 'pending')`,
      params: []
    };
  }
  if (normalized === 'eligible' || normalized === 'rejected' || normalized === 'not_eligible') {
    return { clause: ' AND LOWER(TRIM(scholar_status)) = ?', params: [normalized] };
  }
  return { clause: ' AND scholar_status = ?', params: [String(filterValue).trim()] };
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatDbDate = (value) => {
  if (value == null || value === '') return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const extractBatchStartYear = (batch) => {
  if (!batch) return null;
  const batchText = String(batch).trim();
  if (!batchText) return null;

  const fullYearMatch = batchText.match(/^(\d{4})/);
  if (fullYearMatch) return Number(fullYearMatch[1]);

  const shortYearMatch = batchText.match(/^(\d{2})/);
  if (shortYearMatch) {
    const shortYear = Number(shortYearMatch[1]);
    return shortYear <= 50 ? 2000 + shortYear : 1900 + shortYear;
  }

  return null;
};

const formatAcademicYearLabel = (batchStartYear, studentYear) => {
  const yearIndex = Math.max(1, Number(studentYear) || 1);
  if (!batchStartYear) return `Year ${yearIndex}`;
  const fromYear = batchStartYear + yearIndex - 1;
  return `${fromYear}-${fromYear + 1}`;
};

const buildAcademicYearContext = (batch, totalYears) => {
  const startYear = extractBatchStartYear(batch);
  const labels = {};
  const safeTotalYears = Math.max(1, Number(totalYears) || 1);

  for (let studentYear = 1; studentYear <= safeTotalYears; studentYear += 1) {
    labels[studentYear] = formatAcademicYearLabel(startYear, studentYear);
  }

  return {
    batchStartYear: startYear,
    firstAcademicYear: labels[1] || 'Year 1',
    labels
  };
};

const mapReleaseRowForApi = (row) => ({
  id: row.id,
  academic_year: row.academic_year || null,
  rtf_released_date: formatDbDate(row.from_date),
  rtf_date: formatDbDate(row.from_date),
  from_date: formatDbDate(row.from_date),
  paid_date: formatDbDate(row.to_date),
  to_date: formatDbDate(row.to_date),
  released_amount: toNumber(row.released_amount),
  paid_amount: toNumber(row.paid_amount)
});

const normalizeReleaseForSave = (release = {}) => ({
  rtf_released_date: normalizeRtfReleasedDate(
    release.rtf_released_date ?? release.rtf_date ?? release.from_date
  ),
  paid_date: normalizeRtfReleasedDate(
    release.paid_date ?? release.to_date
  ),
  released_amount: clampScholarshipAmount(release.released_amount),
  paid_amount: clampScholarshipAmount(release.paid_amount)
});

const enrichScholarshipYears = (student, years, totalYears) => {
  const academicContext = buildAcademicYearContext(student?.batch, totalYears);

  return (years || []).map((year) => {
    const studentYear = Math.max(1, Number(year.student_year) || 1);
    const academicYearLabel = academicContext.labels[studentYear]
      || formatAcademicYearLabel(academicContext.batchStartYear, studentYear);

    return {
      ...year,
      academic_year_label: academicYearLabel,
      semesters: year.semesters || buildDefaultSemesters(DEFAULT_SEMESTERS_PER_YEAR),
      releases: (year.releases || []).map((release) => ({
        ...mapReleaseRowForApi(release),
        academic_year: release.academic_year || academicYearLabel
      })),
      paid_transactions: (Array.isArray(year.paid_transactions) && year.paid_transactions.length
        ? year.paid_transactions
        : (year.releases || []).filter(
          (entry) => Number(entry.paid_amount) > 0 || entry.paid_date || entry.to_date
        )
      ).map((transaction) => ({
        id: transaction.id,
        academic_year: transaction.academic_year || academicYearLabel,
        paid_date: formatDbDate(transaction.paid_date || transaction.to_date),
        paid_amount: toNumber(transaction.paid_amount)
      }))
    };
  });
};

const resolveTotalYears = async (pool, student) => {
  const currentYear = Math.max(1, toNumber(student.current_year) || 1);
  let configuredYears = 0;

  if (student.course) {
    const [courseRows] = await pool.query(
      `SELECT c.total_years, cb.total_years AS branch_total_years
       FROM courses c
       LEFT JOIN course_branches cb ON cb.course_id = c.id AND cb.name = ?
       WHERE c.name = ?
       LIMIT 1`,
      [student.branch || '', student.course]
    );

    if (courseRows.length > 0) {
      configuredYears = toNumber(courseRows[0].branch_total_years) || toNumber(courseRows[0].total_years);
    }
  }

  const totalYears = Math.max(DEFAULT_TOTAL_YEARS, configuredYears || DEFAULT_TOTAL_YEARS, currentYear);
  return Math.min(totalYears, 10);
};

const resolveSemestersPerYear = async (pool, student) => {
  let configuredSemesters = 0;

  if (student?.course) {
    const [courseRows] = await pool.query(
      `SELECT c.semesters_per_year, cb.semesters_per_year AS branch_semesters_per_year
       FROM courses c
       LEFT JOIN course_branches cb ON cb.course_id = c.id AND cb.name = ?
       WHERE c.name = ?
       LIMIT 1`,
      [student.branch || '', student.course]
    );

    if (courseRows.length > 0) {
      configuredSemesters = toNumber(courseRows[0].branch_semesters_per_year)
        || toNumber(courseRows[0].semesters_per_year);
    }
  }

  const currentSemester = Math.max(1, toNumber(student?.current_semester) || 1);
  const semestersPerYear = Math.max(
    DEFAULT_SEMESTERS_PER_YEAR,
    configuredSemesters || DEFAULT_SEMESTERS_PER_YEAR,
    currentSemester
  );
  return Math.min(semestersPerYear, 4);
};

const buildDefaultSemesters = (semestersPerYear, eligible = '') => (
  Array.from({ length: Math.max(1, semestersPerYear) }, (_, index) => ({
    student_semester: index + 1,
    eligible
  }))
);

const isReleaseRow = (row) => (
  Number(row.released_amount) > 0
  || Number(row.paid_amount) > 0
  || row.from_date
  || row.to_date
  || row.rtf_released_date
  || row.rtf_date
);

const isSemesterSummaryRow = (row) => (
  row.student_semester != null
  && !isReleaseRow(row)
);

const buildIneligibleQuotaYearEntry = (studentYear, semestersPerYear = DEFAULT_SEMESTERS_PER_YEAR) => ({
  student_year: studentYear,
  application_id: '',
  eligible: 'not_eligible',
  sanctioned_amount: 0,
  released_amount: 0,
  semesters: buildDefaultSemesters(semestersPerYear, 'not_eligible'),
  releases: []
});

const scholarshipRowHasExtraData = (row) => (
  (row.application_id && String(row.application_id).trim())
  || (normalizeEligible(row.eligible) !== 'rejected' && normalizeEligible(row.eligible) !== 'not_eligible')
  || toNumber(row.sanctioned_amount) > 0
  || toNumber(row.released_amount) > 0
  || row.from_date
  || row.to_date
  || (row.proceeding && String(row.proceeding).trim())
);

const buildIneligibleQuotaYears = (totalYears, semestersPerYear = DEFAULT_SEMESTERS_PER_YEAR) => (
  Array.from({ length: totalYears }, (_, index) => (
    buildIneligibleQuotaYearEntry(index + 1, semestersPerYear)
  ))
);

const upsertScholarshipEligible = async (pool, studentId, studentYear, eligible) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const normalized = normalizeEligible(eligible);

  const [rows] = await pool.query(
    'SELECT id FROM student_scholarship WHERE student_id = ? AND student_year = ? LIMIT 1',
    [studentId, year]
  );

  if (rows.length > 0) {
    await pool.query(
      'UPDATE student_scholarship SET eligible = ?, updated_at = NOW() WHERE student_id = ? AND student_year = ?',
      [normalized, studentId, year]
    );
    return;
  }

  if (normalized) {
    await pool.query(
      `INSERT INTO student_scholarship
       (student_id, student_year, eligible, sanctioned_amount, released_amount)
       VALUES (?, ?, ?, 0, 0)`,
      [studentId, year, normalized]
    );
  }
};

const syncScholarStatusColumn = async (pool, studentId, eligible) => {
  const normalized = normalizeEligible(eligible);
  await pool.query('UPDATE students SET scholar_status = ? WHERE id = ?', [normalized, studentId]);
};

const ensureIneligibleQuotaScholarship = async (pool, student, totalYears) => {
  if (!isScholarshipIneligibleQuota(student.stud_type)) return false;

  const [rows] = await pool.query(
    `SELECT student_year, eligible, application_id, sanctioned_amount, released_amount,
            from_date, to_date, proceeding
     FROM student_scholarship
     WHERE student_id = ?`,
    [student.id]
  );

  const cleanRejectedYears = new Set(
    rows
      .filter((row) => !scholarshipRowHasExtraData(row))
      .map((row) => row.student_year)
  );

  let needsSync = rows.some(scholarshipRowHasExtraData);
  for (let year = 1; year <= totalYears; year += 1) {
    if (!cleanRejectedYears.has(year)) {
      needsSync = true;
      break;
    }
  }

  if (!needsSync) return false;

  await pool.query('DELETE FROM student_scholarship WHERE student_id = ?', [student.id]);
  const semestersPerYear = await resolveSemestersPerYear(pool, student);
  for (let year = 1; year <= totalYears; year += 1) {
    for (let semester = 1; semester <= semestersPerYear; semester += 1) {
      await pool.query(
        `INSERT INTO student_scholarship
         (student_id, student_year, student_semester, eligible, sanctioned_amount, released_amount)
         VALUES (?, ?, ?, 'not_eligible', 0, 0)`,
        [student.id, year, semester]
      );
    }
  }

  await syncScholarStatusColumn(pool, student.id, 'not_eligible');
  return true;
};

const syncIneligibleQuotaScholarshipForStudent = async (pool, student) => {
  if (!student?.id || !isScholarshipIneligibleQuota(student.stud_type)) return false;
  const totalYears = await resolveTotalYears(pool, student);
  return ensureIneligibleQuotaScholarship(pool, student, totalYears);
};

const INELIGIBLE_QUOTA_STUD_TYPE_SQL = `UPPER(TRIM(IFNULL(stud_type, ''))) IN ('MANG', 'MQ', 'SPOT', 'LSPOT')`;

const syncIneligibleQuotaScholarshipsForStudents = async (pool, students = []) => {
  const targets = (students || []).filter(
    (student) => student?.id && isScholarshipIneligibleQuota(student.stud_type)
  );
  if (targets.length === 0) {
    return { checked: 0, updated: 0 };
  }

  let updated = 0;
  for (const student of targets) {
    if (await syncIneligibleQuotaScholarshipForStudent(pool, student)) {
      updated += 1;
    }
  }
  return { checked: targets.length, updated };
};

const syncAllIneligibleQuotaScholarships = async (pool, options = {}) => {
  const { admissionNumber = null } = options;
  let query = `
    SELECT id, admission_number, stud_type, course, branch, current_year
    FROM students
    WHERE ${INELIGIBLE_QUOTA_STUD_TYPE_SQL}`;
  const params = [];

  if (admissionNumber) {
    query += ' AND admission_number = ?';
    params.push(admissionNumber);
  }

  const [students] = await pool.query(query, params);
  const result = await syncIneligibleQuotaScholarshipsForStudents(pool, students);
  return { ...result, total: students.length };
};

const resolveScholarStatusForStudent = (student, parsedData = null) => {
  if (isScholarshipIneligibleQuota(student?.stud_type)) {
    return 'not_eligible';
  }
  const data = parsedData || {};
  const rawScholarStatus = student?.scholar_status
    || data?.scholar_status
    || data?.['Scholar Status']
    || '';
  return normalizeScholarStatusForResponse(rawScholarStatus);
};

const getScholarshipEligibleForYear = async (
  pool,
  studentId,
  studentYear,
  studType = null,
  studentSemester = null
) => {
  const year = Math.max(1, Number(studentYear) || 1);

  let quotaCode = studType;
  let semester = Math.max(1, Number(studentSemester) || 0);
  if (!quotaCode || !semester) {
    const [studentRows] = await pool.query(
      'SELECT stud_type, current_semester FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (!quotaCode) quotaCode = studentRows[0]?.stud_type;
    if (!semester) semester = Math.max(1, toNumber(studentRows[0]?.current_semester) || 1);
  }

  if (isScholarshipIneligibleQuota(quotaCode)) {
    return 'not_eligible';
  }

  const [rows] = await pool.query(
    `SELECT eligible, student_semester
     FROM student_scholarship
     WHERE student_id = ? AND student_year = ?
       AND eligible IS NOT NULL AND TRIM(eligible) != ''
     ORDER BY
       CASE
         WHEN student_semester = ? THEN 0
         WHEN student_semester IS NULL THEN 1
         ELSE 2
       END,
       updated_at DESC,
       id DESC
     LIMIT 1`,
    [studentId, year, semester]
  );
  return normalizeEligible(rows[0]?.eligible);
};

const isScholarshipCompleteForRegistration = (eligible) => (
  VALID_ELIGIBLE.includes(String(eligible || '').trim().toLowerCase())
);

const resolveHistoryActor = (user) => {
  if (!user?.id) return { adminId: null, rbacId: null };
  const adminRoles = new Set(['admin', 'superadmin', 'super_admin']);
  if (adminRoles.has(String(user.role || '').toLowerCase())) {
    return { adminId: user.id, rbacId: null };
  }
  return { adminId: null, rbacId: user.id };
};

const buildYearSnapshotFromRows = (rows, semestersPerYear = DEFAULT_SEMESTERS_PER_YEAR) => {
  let applicationId = '';
  let sanctionedAmount = 0;
  const semesterMap = {};
  let legacyEligible = '';
  const releases = [];
  const paidTransactions = [];

  for (const row of rows) {
    if (!applicationId && row.application_id) applicationId = row.application_id;
    if (!sanctionedAmount && row.sanctioned_amount) {
      sanctionedAmount = Number(row.sanctioned_amount) || 0;
    }

    if (isReleaseRow(row)) {
      const apiRow = mapReleaseRowForApi(row);
      const label = row.academic_year || null;
      if (Number(row.released_amount) > 0 || apiRow.rtf_released_date) {
        releases.push({
          academic_year: label,
          rtf_released_date: apiRow.rtf_released_date || null,
          from_date: row.from_date || null,
          released_amount: Number(row.released_amount) || 0,
          paid_amount: 0,
          paid_date: null,
          to_date: null
        });
      }
      if (Number(row.paid_amount) > 0 || apiRow.paid_date) {
        paidTransactions.push({
          academic_year: label,
          paid_date: apiRow.paid_date || null,
          to_date: row.to_date || null,
          paid_amount: Number(row.paid_amount) || 0,
          released_amount: 0,
          rtf_released_date: null,
          from_date: null
        });
      }
    } else if (isSemesterSummaryRow(row)) {
      semesterMap[row.student_semester] = row.eligible || '';
    } else if (row.eligible) {
      legacyEligible = row.eligible;
    }
  }

  if (!Object.keys(semesterMap).length && legacyEligible) {
    semesterMap[1] = legacyEligible;
  }

  const semesters = buildDefaultSemesters(semestersPerYear).map((semester) => ({
    student_semester: semester.student_semester,
    eligible: semesterMap[semester.student_semester] || ''
  }));

  // Financial data counts only when EVERY semester in the year is eligible.
  const allEligible = semesters.length > 0 && semesters.every(
    (semester) => normalizeEligible(semester.eligible) === 'eligible'
  );

  return {
    application_id: applicationId || null,
    eligible: semesters[0]?.eligible || legacyEligible || null,
    sanctioned_amount: allEligible ? sanctionedAmount : 0,
    released_amount: allEligible
      ? releases.reduce((sum, row) => sum + row.released_amount, 0)
      : 0,
    paid_amount: allEligible
      ? paidTransactions.reduce((sum, row) => sum + row.paid_amount, 0)
      : 0,
    semesters,
    releases: allEligible ? releases : [],
    paid_transactions: allEligible ? paidTransactions : []
  };
};

const archiveScholarshipYear = async (connection, student, studentYear, actor = null) => {
  const [rows] = await connection.query(
    `SELECT application_id, eligible, sanctioned_amount, released_amount, paid_amount, student_semester,
            DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
            DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
            proceeding
     FROM student_scholarship
     WHERE student_id = ? AND student_year = ?`,
    [student.id, studentYear]
  );
  if (rows.length === 0) return false;

  const snapshot = buildYearSnapshotFromRows(rows);
  let notes = JSON.stringify(snapshot);
  if (notes.length > 255) {
    notes = JSON.stringify({
      application_id: snapshot.application_id,
      eligible: snapshot.eligible,
      sanctioned_amount: snapshot.sanctioned_amount,
      released_amount: snapshot.released_amount,
      release_count: snapshot.releases.length
    }).slice(0, 255);
  }

  const { adminId, rbacId } = actor || {};

  await connection.query(
    `INSERT INTO student_scholarship_history
     (student_id, admission_number, scholar_status, academic_year, academic_semester,
      source, notes, recorded_by_admin_id, recorded_by_rbac_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      student.id,
      student.admission_number,
      snapshot.eligible,
      studentYear,
      student.current_semester || null,
      'scholarship_overwrite',
      notes,
      adminId,
      rbacId
    ]
  );
  return true;
};

const REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY = '—';

const SCHOLARSHIP_YEAR_MATCH_SQL = 'ss.student_year = GREATEST(1, IFNULL(students.current_year, 1))';
const SCHOLARSHIP_SEMESTER_MATCH_SQL = `(
  ss.student_semester = GREATEST(1, IFNULL(students.current_semester, 1))
  OR (
    ss.student_semester IS NULL
    AND IFNULL(ss.released_amount, 0) = 0
    AND ss.from_date IS NULL
  )
)`;

/**
 * A student is considered to have a scholarship status if:
 *   1. They have a matching row in student_scholarship for their current year + current semester, OR
 *   2. They have any row in student_scholarship for their current year (any semester), OR
 *   3. They have ANY row in student_scholarship for ANY year (history fallback — covers students
 *      whose current year has no data yet, e.g. Year 4 but only Years 1-3 entered), OR
 *   4. Their scholar_status column on students is a known non-empty value
 */
const scholarshipHasCurrentYearStatusSql = `(
  EXISTS (
    SELECT 1 FROM student_scholarship ss
    WHERE ss.student_id = students.id
      AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
      AND ${SCHOLARSHIP_SEMESTER_MATCH_SQL}
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
  )
  OR EXISTS (
    SELECT 1 FROM student_scholarship ss
    WHERE ss.student_id = students.id
      AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
  )
  OR EXISTS (
    SELECT 1 FROM student_scholarship ss
    WHERE ss.student_id = students.id
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
  )
  OR (
    students.scholar_status IS NOT NULL
    AND TRIM(students.scholar_status) != ''
    AND LOWER(TRIM(students.scholar_status)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
  )
)`;

const getScholarshipFilterClause = (filter) => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (normalized === 'pending') {
    // pending = no year-wise row (any semester) AND no scholar_status fallback
    return ` AND NOT (${scholarshipHasCurrentYearStatusSql})`;
  }
  if (normalized === 'eligible') {
    return ` AND (
      EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = students.id
          AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
          AND LOWER(TRIM(ss.eligible)) = 'eligible'
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = students.id
            AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
            AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
            AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
        )
        AND LOWER(TRIM(IFNULL(students.scholar_status, ''))) = 'eligible'
      )
    )`;
  }
  if (normalized === 'not_eligible') {
    return ` AND (
      EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = students.id
          AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
          AND LOWER(TRIM(ss.eligible)) IN ('not_eligible', 'not eligible')
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = students.id
            AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
            AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
            AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
        )
        AND LOWER(TRIM(IFNULL(students.scholar_status, ''))) IN ('not_eligible', 'not eligible')
      )
    )`;
  }
  if (normalized === 'rejected') {
    return ` AND (
      EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = students.id
          AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
          AND LOWER(TRIM(ss.eligible)) = 'rejected'
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = students.id
            AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
            AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
            AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
        )
        AND LOWER(TRIM(IFNULL(students.scholar_status, ''))) = 'rejected'
      )
    )`;
  }
  return '';
};

const scholarshipAssignedSumSql = `SUM(CASE WHEN ${scholarshipHasCurrentYearStatusSql} THEN 1 ELSE 0 END)`;
const scholarshipPendingSumSql = `SUM(CASE WHEN NOT (${scholarshipHasCurrentYearStatusSql}) THEN 1 ELSE 0 END)`;

const resolveRegistrationScholarshipStage = (eligible) => {
  const normalized = normalizeEligible(eligible);
  if (!normalized) {
    return {
      display: REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY,
      status: 'pending',
      completed: false
    };
  }
  return {
    display: normalized,
    status: 'completed',
    completed: true
  };
};

const isScholarshipDisplayUnassigned = (display) => (
  !display
  || display === REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY
  || String(display).trim().toLowerCase() === 'pending'
);

const buildCurrentYearScholarshipMap = async (pool, students) => {
  const map = new Map();
  if (!students?.length) return map;

  const studentIds = students.map((student) => student.id);

  // Step 1: Try exact match — current year AND current semester
  const [rows] = await pool.query(
    `SELECT ss.student_id, ss.eligible
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE ss.student_id IN (?)
       AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
       AND (
         ss.student_semester = GREATEST(1, IFNULL(s.current_semester, 1))
         OR (
           ss.student_semester IS NULL
           AND IFNULL(ss.released_amount, 0) = 0
           AND ss.from_date IS NULL
         )
       )
       AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
       AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
     ORDER BY
       ss.student_id ASC,
       CASE
         WHEN ss.student_semester = GREATEST(1, IFNULL(s.current_semester, 1)) THEN 0
         ELSE 1
       END,
       ss.updated_at DESC,
       ss.id DESC`,
    [studentIds]
  );

  for (const row of rows) {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, normalizeEligible(row.eligible));
    }
  }

  // Step 2: For students still missing, try any semester of the current year
  // (mirrors fetchScholarshipPayload's fallback: currentYearData?.eligible)
  // This handles the case where the current semester row was never inserted
  // (empty eligible = no DB row) but another semester in the same year has a value.
  const afterStep1Missing = studentIds.filter((id) => !map.has(id));
  if (afterStep1Missing.length > 0) {
    const [yearRows] = await pool.query(
      `SELECT ss.student_id, ss.eligible
       FROM student_scholarship ss
       INNER JOIN students s ON s.id = ss.student_id
       WHERE ss.student_id IN (?)
         AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
         AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
         AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
       ORDER BY
         ss.student_id ASC,
         ss.student_semester ASC,
         ss.updated_at DESC,
         ss.id DESC`,
      [afterStep1Missing]
    );
    for (const row of yearRows) {
      if (!map.has(row.student_id)) {
        map.set(row.student_id, normalizeEligible(row.eligible));
      }
    }
  }

  // Step 3: Final fallback — use the most recent year's scholarship data from student_scholarship,
  // OR scholar_status from students table (whichever applies).
  // Covers: students whose current_year has no data yet (Year 4 but only Years 1-3 entered),
  // last-year students after course completion, batch rollover cases.
  const afterStep2Missing = studentIds.filter((id) => !map.has(id));
  if (afterStep2Missing.length > 0) {
    // Try most recent year's data from student_scholarship (any year, highest first)
    const [historyRows] = await pool.query(
      `SELECT ss.student_id, ss.eligible
       FROM student_scholarship ss
       WHERE ss.student_id IN (?)
         AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
         AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
       ORDER BY
         ss.student_id ASC,
         ss.student_year DESC,
         ss.student_semester ASC,
         ss.updated_at DESC,
         ss.id DESC`,
      [afterStep2Missing]
    );
    for (const row of historyRows) {
      if (!map.has(row.student_id)) {
        const normalized = normalizeEligible(row.eligible);
        if (normalized) map.set(row.student_id, normalized);
      }
    }

    // Final: scholar_status column for any still-missing students
    const studentMap = new Map(students.map((s) => [s.id, s]));
    for (const id of afterStep2Missing) {
      if (!map.has(id)) {
        const student = studentMap.get(id);
        if (student) {
          const fallback = normalizeEligible(student.scholar_status);
          if (fallback) map.set(id, fallback);
        }
      }
    }
  }

  return map;
};

module.exports = {
  VALID_ELIGIBLE,
  SCHOLARSHIP_INELIGIBLE_QUOTA_CODES,
  REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY,
  normalizeStudTypeCode,
  isScholarshipIneligibleQuota,
  normalizeEligible,
  upsertScholarshipEligible,
  syncScholarStatusColumn,
  resolveTotalYears,
  resolveSemestersPerYear,
  buildDefaultSemesters,
  buildIneligibleQuotaYearEntry,
  buildIneligibleQuotaYears,
  ensureIneligibleQuotaScholarship,
  syncIneligibleQuotaScholarshipForStudent,
  syncIneligibleQuotaScholarshipsForStudents,
  syncAllIneligibleQuotaScholarships,
  resolveScholarStatusForStudent,
  INELIGIBLE_QUOTA_STUD_TYPE_SQL,
  normalizeScholarStatusForResponse,
  STANDARD_SCHOLAR_STATUS_FILTER_OPTIONS,
  getScholarStatusColumnFilterClause,
  getScholarshipEligibleForYear,
  isScholarshipCompleteForRegistration,
  archiveScholarshipYear,
  resolveHistoryActor,
  buildYearSnapshotFromRows,
  scholarshipHasCurrentYearStatusSql,
  getScholarshipFilterClause,
  scholarshipAssignedSumSql,
  scholarshipPendingSumSql,
  resolveRegistrationScholarshipStage,
  isScholarshipDisplayUnassigned,
  buildCurrentYearScholarshipMap,
  extractBatchStartYear,
  formatAcademicYearLabel,
  buildAcademicYearContext,
  enrichScholarshipYears,
  mapReleaseRowForApi,
  normalizeReleaseForSave,
  formatDbDate,
  isReleaseRow,
  isSemesterSummaryRow
};

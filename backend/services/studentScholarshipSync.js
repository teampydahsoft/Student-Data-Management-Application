const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = ['eligible', 'pending', 'rejected'];
const SCHOLARSHIP_INELIGIBLE_QUOTA_CODES = new Set(['MANG', 'MQ', 'SPOT', 'LSPOT']);
const DEFAULT_TOTAL_YEARS = 4;

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
  if (normalized === 'not eligible' || normalized === 'not_eligible') {
    normalized = 'rejected';
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
      clause: ` AND LOWER(TRIM(IFNULL(scholar_status,''))) IN ('rejected', 'not eligible', 'not_eligible')`,
      params: []
    };
  }
  if (normalized === 'pending') {
    return {
      clause: ` AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '' OR LOWER(TRIM(scholar_status)) = 'pending')`,
      params: []
    };
  }
  if (normalized === 'eligible' || normalized === 'rejected') {
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
  released_amount: toNumber(row.released_amount)
});

const normalizeReleaseForSave = (release = {}) => ({
  rtf_released_date: formatDbDate(
    release.rtf_released_date ?? release.rtf_date ?? release.from_date
  ),
  released_amount: toNumber(release.released_amount)
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
      releases: (year.releases || []).map((release) => ({
        ...mapReleaseRowForApi(release),
        academic_year: release.academic_year || academicYearLabel
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

const buildIneligibleQuotaYearEntry = (studentYear) => ({
  student_year: studentYear,
  application_id: '',
  eligible: 'rejected',
  sanctioned_amount: 0,
  released_amount: 0,
  releases: []
});

const scholarshipRowHasExtraData = (row) => (
  (row.application_id && String(row.application_id).trim())
  || normalizeEligible(row.eligible) !== 'rejected'
  || toNumber(row.sanctioned_amount) > 0
  || toNumber(row.released_amount) > 0
  || row.from_date
  || row.to_date
  || (row.proceeding && String(row.proceeding).trim())
);

const buildIneligibleQuotaYears = (totalYears) => (
  Array.from({ length: totalYears }, (_, index) => buildIneligibleQuotaYearEntry(index + 1))
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
  for (let year = 1; year <= totalYears; year += 1) {
    await pool.query(
      `INSERT INTO student_scholarship
       (student_id, student_year, eligible, sanctioned_amount, released_amount)
       VALUES (?, ?, 'rejected', 0, 0)`,
      [student.id, year]
    );
  }

  await syncScholarStatusColumn(pool, student.id, 'rejected');
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
    return 'rejected';
  }
  const data = parsedData || {};
  const rawScholarStatus = student?.scholar_status
    || data?.scholar_status
    || data?.['Scholar Status']
    || '';
  return normalizeScholarStatusForResponse(rawScholarStatus);
};

const getScholarshipEligibleForYear = async (pool, studentId, studentYear, studType = null) => {
  const year = Math.max(1, Number(studentYear) || 1);

  let quotaCode = studType;
  if (!quotaCode) {
    const [studentRows] = await pool.query(
      'SELECT stud_type FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    quotaCode = studentRows[0]?.stud_type;
  }

  if (isScholarshipIneligibleQuota(quotaCode)) {
    return 'rejected';
  }

  const [rows] = await pool.query(
    `SELECT eligible
     FROM student_scholarship
     WHERE student_id = ? AND student_year = ?
       AND eligible IS NOT NULL AND TRIM(eligible) != ''
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [studentId, year]
  );
  return normalizeEligible(rows[0]?.eligible);
};

const isScholarshipCompleteForRegistration = (eligible) => (
  VALID_ELIGIBLE.includes(String(eligible || '').trim().toLowerCase())
);

const isReleaseRow = (row) => (
  Number(row.released_amount) > 0
  || row.from_date
  || row.rtf_released_date
  || row.rtf_date
);

const resolveHistoryActor = (user) => {
  if (!user?.id) return { adminId: null, rbacId: null };
  const adminRoles = new Set(['admin', 'superadmin', 'super_admin']);
  if (adminRoles.has(String(user.role || '').toLowerCase())) {
    return { adminId: user.id, rbacId: null };
  }
  return { adminId: null, rbacId: user.id };
};

const buildYearSnapshotFromRows = (rows) => {
  let applicationId = '';
  let eligible = '';
  let sanctionedAmount = 0;
  const releases = [];

  for (const row of rows) {
    if (!applicationId && row.application_id) applicationId = row.application_id;
    if (row.eligible) eligible = row.eligible;
    if (!sanctionedAmount && row.sanctioned_amount) {
      sanctionedAmount = Number(row.sanctioned_amount) || 0;
    }
    if (isReleaseRow(row)) {
      releases.push({
        academic_year: row.academic_year || null,
        rtf_released_date: formatDbDate(row.from_date) || null,
        from_date: row.from_date || null,
        released_amount: Number(row.released_amount) || 0
      });
    }
  }

  return {
    application_id: applicationId || null,
    eligible: eligible || null,
    sanctioned_amount: sanctionedAmount,
    released_amount: releases.reduce((sum, row) => sum + row.released_amount, 0),
    releases
  };
};

const archiveScholarshipYear = async (connection, student, studentYear, actor = null) => {
  const [rows] = await connection.query(
    `SELECT application_id, eligible, sanctioned_amount, released_amount,
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

const scholarshipHasCurrentYearStatusSql = `EXISTS (
  SELECT 1 FROM student_scholarship ss
  WHERE ss.student_id = students.id
    AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
    AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
    AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'pending', 'rejected')
)`;

const getScholarshipFilterClause = (filter) => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (normalized === 'pending') {
    return ` AND NOT (${scholarshipHasCurrentYearStatusSql})`;
  }
  if (normalized === 'eligible') {
    return ` AND EXISTS (
      SELECT 1 FROM student_scholarship ss
      WHERE ss.student_id = students.id
        AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
        AND LOWER(TRIM(ss.eligible)) = 'eligible'
    )`;
  }
  if (normalized === 'not_eligible') {
    return ` AND EXISTS (
      SELECT 1 FROM student_scholarship ss
      WHERE ss.student_id = students.id
        AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
        AND LOWER(TRIM(ss.eligible)) = 'rejected'
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
  const [rows] = await pool.query(
    `SELECT ss.student_id, ss.eligible
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE ss.student_id IN (?)
       AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
       AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
     ORDER BY ss.student_id ASC, ss.updated_at DESC, ss.id DESC`,
    [studentIds]
  );

  for (const row of rows) {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, normalizeEligible(row.eligible));
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
  formatDbDate
};

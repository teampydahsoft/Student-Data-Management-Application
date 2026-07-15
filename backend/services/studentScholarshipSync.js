const { masterPool } = require('../config/database');
const {
  normalizeRtfReleasedDate,
  clampScholarshipAmount,
  allSemestersEligible,
  allSemestersStatusAssigned,
  isYearFeeOnlyScholarshipMode,
  hasYearScholarshipFinancialTracking
} = require('../utils/scholarshipValidation');
const {
  DEFAULT_TOTAL_YEARS,
  DEFAULT_SEMESTERS_PER_YEAR,
  buildStructureFromDbRow
} = require('../utils/courseAcademicStructure');

const VALID_ELIGIBLE = ['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied'];
const SCHOLARSHIP_INELIGIBLE_QUOTA_CODES = new Set(['MANG', 'MQ', 'SPOT', 'LSPOT']);

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

const SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR = 2026;

const getAcademicYearStartYear = (batch, studentYear) => {
  const batchStart = extractBatchStartYear(batch);
  const yearIndex = Math.max(1, Number(studentYear) || 1);
  if (!batchStart) return null;
  return batchStart + yearIndex - 1;
};

const usesSemesterWiseScholarshipStatus = (batch, studentYear) => {
  const startYear = getAcademicYearStartYear(batch, studentYear);
  return startYear != null && startYear >= SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR;
};

const yearHasAssignedScholarshipStatus = (yearEntry = {}) => {
  if (normalizeEligible(yearEntry.eligible)) return true;
  return (yearEntry.semesters || []).some((semester) => normalizeEligible(semester.eligible));
};

const resolveLegacyYearEligible = (student, studentYear, archivedHistory = []) => {
  const historyForYear = (archivedHistory || []).filter(
    (entry) => Number(entry.academic_year) === Number(studentYear)
  );
  if (historyForYear.length > 0) {
    const latest = historyForYear[0];
    const snapshot = typeof latest.snapshot === 'object' && latest.snapshot
      ? latest.snapshot
      : {};
    const fromHistory = normalizeEligible(latest.scholar_status || snapshot.eligible);
    if (fromHistory) return fromHistory;
  }
  return normalizeEligible(student?.scholar_status) || null;
};

const applyLegacyYearDisplay = (yearEntry, legacyEligible, semestersPerYear) => ({
  ...yearEntry,
  eligible: legacyEligible || yearEntry.eligible || '',
  semesters: buildDefaultSemesters(semestersPerYear, legacyEligible || ''),
  semesterWiseStatus: false,
  legacyScholarshipYear: true
});

const enrichYearWithScholarshipMode = (
  yearEntry,
  student,
  archivedHistory,
  semestersPerYear
) => {
  const studentYear = Math.max(1, Number(yearEntry.student_year) || 1);
  if (usesSemesterWiseScholarshipStatus(student?.batch, studentYear)) {
    return {
      ...yearEntry,
      semesterWiseStatus: true,
      legacyScholarshipYear: false
    };
  }

  if (yearHasAssignedScholarshipStatus(yearEntry)) {
    return {
      ...yearEntry,
      semesterWiseStatus: false,
      legacyScholarshipYear: true
    };
  }

  const legacyEligible = resolveLegacyYearEligible(student, studentYear, archivedHistory);
  return applyLegacyYearDisplay(yearEntry, legacyEligible, semestersPerYear);
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

const mapReleaseRowForApi = (row) => {
  const rtfDate = formatDbDate(row.from_date)
    || formatDbDate(row.rtf_released_date)
    || formatDbDate(row.rtf_date);
  const paidDate = formatDbDate(row.to_date)
    || formatDbDate(row.paid_date);
  return {
    id: row.id,
    academic_year: row.academic_year || null,
    rtf_released_date: rtfDate,
    rtf_date: rtfDate,
    from_date: rtfDate,
    paid_date: paidDate,
    to_date: paidDate,
    released_amount: toNumber(row.released_amount),
    paid_amount: toNumber(row.paid_amount)
  };
};

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

/**
 * Max sanctioned amount per student_year from any student in the same batch + program + branch.
 * Uses semester-1 summary rows and release rows that carry sanctioned_amount.
 */
const fetchBatchSanctionedAmountsByYear = async (pool, student) => {
  const batch = String(student?.batch || '').trim();
  const course = String(student?.course || '').trim();
  const branch = String(student?.branch || '').trim();
  if (!batch || !course || !branch) return {};

  const [rows] = await pool.query(
    `SELECT ss.student_year, MAX(ss.sanctioned_amount) AS sanctioned_amount
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE s.batch = ? AND s.course = ? AND s.branch = ?
       AND ss.sanctioned_amount > 0
     GROUP BY ss.student_year`,
    [batch, course, branch]
  );

  const map = {};
  for (const row of rows) {
    const year = Math.max(1, toNumber(row.student_year));
    const amount = toNumber(row.sanctioned_amount);
    if (year && amount > 0) map[year] = amount;
  }
  return map;
};

/** Apply a sanctioned amount to every student in the same batch + program + branch for one year. */
const propagateBatchSanctionedAmount = async (connection, student, studentYear, sanctionedAmount) => {
  const batch = String(student?.batch || '').trim();
  const course = String(student?.course || '').trim();
  const branch = String(student?.branch || '').trim();
  const amount = toNumber(sanctionedAmount);
  const year = Math.max(1, toNumber(studentYear));

  if (!batch || !course || !branch || !year || amount <= 0) return;

  await connection.query(
    `UPDATE student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     SET ss.sanctioned_amount = ?
     WHERE s.batch = ? AND s.course = ? AND s.branch = ?
       AND ss.student_year = ?
       AND ss.sanctioned_amount IS NOT NULL`,
    [amount, batch, course, branch, year]
  );
};

const resolveTotalYears = async (pool, student) => {
  const structure = await resolveCourseAcademicStructure(pool, student);
  const currentYear = Math.max(1, toNumber(student.current_year) || 1);
  return Math.min(Math.max(structure.totalYears, currentYear), 10);
};

const fetchCourseBranchRow = async (pool, student) => {
  if (!student?.course) return null;

  const [courseRows] = await pool.query(
    `SELECT c.total_years, c.semesters_per_year, c.year_semester_config,
            cb.total_years AS branch_total_years,
            cb.semesters_per_year AS branch_semesters_per_year,
            cb.year_semester_config AS branch_year_semester_config
     FROM courses c
     LEFT JOIN course_branches cb ON cb.course_id = c.id AND cb.name = ?
     WHERE c.name = ?
     LIMIT 1`,
    [student.branch || '', student.course]
  );

  return courseRows[0] || null;
};

const resolveCourseAcademicStructure = async (pool, student) => {
  const row = await fetchCourseBranchRow(pool, student);
  return buildStructureFromDbRow(row);
};

const resolveSemestersPerYear = async (pool, student, studentYear = null) => {
  const structure = await resolveCourseAcademicStructure(pool, student);
  const currentYear = Math.max(1, toNumber(student?.current_year) || 1);
  const targetYear = studentYear != null
    ? Math.max(1, toNumber(studentYear) || 1)
    : currentYear;
  const configured = structure.getSemestersForYear(targetYear);
  const currentSemester = Math.max(1, toNumber(student?.current_semester) || 1);

  if (targetYear === currentYear) {
    return Math.min(Math.max(configured, currentSemester), 4);
  }

  return configured;
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

const buildIneligibleQuotaYears = (totalYears, getSemestersForYear, startYear = 1) => {
  const firstYear = Math.max(1, Number(startYear) || 1);
  const count = Math.max(0, Number(totalYears) - firstYear + 1);
  return Array.from({ length: count }, (_, index) => {
    const studentYear = firstYear + index;
    const semestersPerYear = typeof getSemestersForYear === 'function'
      ? getSemestersForYear(studentYear)
      : (getSemestersForYear || DEFAULT_SEMESTERS_PER_YEAR);
    return buildIneligibleQuotaYearEntry(studentYear, semestersPerYear);
  });
};

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

  // Lateral-entry ineligible quotas (LSPOT) join in Year 2 — never create a Year 1 row.
  const startYear = resolveScholarshipStartYear(student.stud_type);

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

  // Any row before the lateral start year (a stale Year 1) forces a resync to clean it up.
  let needsSync = rows.some(scholarshipRowHasExtraData)
    || rows.some((row) => Number(row.student_year) < startYear);
  for (let year = startYear; year <= totalYears; year += 1) {
    if (!cleanRejectedYears.has(year)) {
      needsSync = true;
      break;
    }
  }

  if (!needsSync) return false;

  await pool.query('DELETE FROM student_scholarship WHERE student_id = ?', [student.id]);
  const structure = await resolveCourseAcademicStructure(pool, student);
  for (let year = startYear; year <= totalYears; year += 1) {
    const semestersForYear = structure.getSemestersForYear(year);
    for (let semester = 1; semester <= semestersForYear; semester += 1) {
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

const resolveRegistrationScholarStatusDisplay = (student, scholarshipMap = null, parsedData = null) => {
  if (isScholarshipIneligibleQuota(student?.stud_type)) {
    return 'not_eligible';
  }
  if (scholarshipMap?.has(student.id)) {
    return normalizeScholarStatusForResponse(scholarshipMap.get(student.id));
  }
  const currentYear = Math.max(1, Number(student.current_year) || 1);
  if (usesSemesterWiseScholarshipStatus(student.batch, currentYear)) {
    return normalizeScholarStatusForResponse('');
  }
  return resolveScholarStatusForStudent(student, parsedData);
};

const getScholarshipEligibleForYear = async (
  pool,
  studentId,
  studentYear,
  studType = null,
  studentSemester = null,
  batch = null
) => {
  const year = Math.max(1, Number(studentYear) || 1);

  let quotaCode = studType;
  let semester = Math.max(1, Number(studentSemester) || 0);
  let studentBatch = batch;

  if (!quotaCode || !semester || !studentBatch) {
    const [studentRows] = await pool.query(
      'SELECT stud_type, current_semester, batch FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (!quotaCode) quotaCode = studentRows[0]?.stud_type;
    if (!semester) semester = Math.max(1, toNumber(studentRows[0]?.current_semester) || 1);
    if (!studentBatch) studentBatch = studentRows[0]?.batch;
  }

  if (isScholarshipIneligibleQuota(quotaCode)) {
    return 'not_eligible';
  }

  // For academic years 2026+ (semester-wise mode), only the specific semester row counts.
  // For pre-2026 (legacy), fall through to the broader year query below.
  const isSemesterWise = usesSemesterWiseScholarshipStatus(studentBatch, year);

  if (isSemesterWise) {
    // Must find an exact match for the current year AND current semester.
    const [rows] = await pool.query(
      `SELECT eligible
       FROM student_scholarship
       WHERE student_id = ? AND student_year = ? AND student_semester = ?
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [studentId, year, semester]
    );
    return normalizeEligible(rows[0]?.eligible);
  }

  // Legacy path: any row for the year (semester match preferred).
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

const isScholarshipCompleteForRegistration = (eligible, feePaid = null, studType = null) => {
  // 'pending' means the admin has not made a final decision yet — not complete.
  // Only definitive statuses count: eligible, not_eligible, rejected, not_applied.
  const normalized = String(eligible || '').trim().toLowerCase();
  if (!['eligible', 'not_eligible', 'rejected', 'not_applied'].includes(normalized)) {
    return false;
  }
  // CONV quota: fee_paid is required for every final status except eligible.
  const isConv = ['conv', 'cq'].includes(String(studType || '').trim().toLowerCase());
  if (isConv && normalized !== 'eligible') {
    return feePaid === true || feePaid === 1;
  }
  return true;
};

/**
 * When scholarship is optional in registration config, it never blocks registration
 * (same as other optional stages: verification, fee, etc.).
 */
const isScholarshipOptionalForRegistration = (optionalStages) => (
  Array.isArray(optionalStages) && optionalStages.includes('scholarship')
);

const {
  resolveRegistrationBranchYear,
  resolveScholarshipLookupYears,
  resolveOptionalStagesFromConfig,
  isLateralEntryQuota,
  resolveScholarshipStartYear
} = require('../utils/registrationBranchYear');

const resolveRegistrationScholarshipTarget = (currentYear, optionalStages) => {
  const year = Math.max(1, Number(currentYear) || 1);
  if (!isScholarshipOptionalForRegistration(optionalStages)) {
    return { mode: 'current', checkYear: year, fullyOptional: false };
  }
  return { mode: 'fully_optional', checkYear: null, fullyOptional: true };
};

/** Students in a 2026+ academic year must use student_scholarship rows only (no scholar_status). */
const registrationUsesScholarshipTableOnly = (student, branchProgramYear = null) => {
  const programYear = branchProgramYear ?? resolveRegistrationBranchYear(
    student?.branch,
    student?.current_year
  );
  return usesSemesterWiseScholarshipStatus(student?.batch, programYear);
};

const isScholarshipOptionalForBranchYear = (stageConfig, student, studentYear) => (
  isScholarshipOptionalForRegistration(
    resolveOptionalStagesFromConfig(stageConfig, student?.branch, studentYear)
  )
);

const getScholarshipSemestersForYearData = (
  scholarshipData,
  studentYear,
  fallback = DEFAULT_SEMESTERS_PER_YEAR
) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const structureYear = scholarshipData?.academicStructure?.years?.find(
    (entry) => Number(entry.yearNumber) === year
  );
  if (Array.isArray(structureYear?.semesters) && structureYear.semesters.length > 0) {
    return structureYear.semesters.length;
  }

  const configuredYear = scholarshipData?.yearSemesterConfig?.find(
    (entry) => Number(entry.year) === year
  );
  if (Number(configuredYear?.semesters) > 0) {
    return Number(configuredYear.semesters);
  }

  return Math.max(1, Number(fallback) || DEFAULT_SEMESTERS_PER_YEAR);
};

const isRegistrationScholarshipSatisfied = (
  eligible,
  feePaid,
  studType,
  currentYear,
  optionalStages
) => {
  const target = resolveRegistrationScholarshipTarget(currentYear, optionalStages);
  if (target.fullyOptional) return true;
  return isScholarshipCompleteForRegistration(eligible, feePaid, studType);
};

const isPriorYearScholarshipYearComplete = (
  yearData,
  studType,
  semestersPerYear = DEFAULT_SEMESTERS_PER_YEAR
) => {
  if (!yearData) return false;

  const semesters = Array.isArray(yearData.semesters) ? yearData.semesters : [];
  const semCount = Math.max(1, Number(semestersPerYear) || DEFAULT_SEMESTERS_PER_YEAR);

  if (!semesters.length) {
    return isScholarshipCompleteForRegistration(yearData.eligible, null, studType);
  }

  for (let sem = 1; sem <= semCount; sem += 1) {
    const semesterRow = semesters.find((entry) => Number(entry.student_semester) === sem);
    if (!semesterRow) return false;
    const feePaid = semesterRow.fee_paid === true || semesterRow.fee_paid === 1;
    if (!isScholarshipCompleteForRegistration(semesterRow.eligible, feePaid, studType)) {
      return false;
    }
  }
  return true;
};

const isPriorScholarshipYearCompleteForRegistration = (
  yearData,
  student,
  studentYear,
  semestersPerYear = DEFAULT_SEMESTERS_PER_YEAR
) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const batch = student?.batch;
  const studType = student?.stud_type || student?.StudType;
  const currentProgramYear = resolveRegistrationBranchYear(student?.branch, student?.current_year);
  const tableOnlyRegistration = registrationUsesScholarshipTableOnly(student, currentProgramYear);

  if (usesSemesterWiseScholarshipStatus(batch, year) || tableOnlyRegistration) {
    return isPriorYearScholarshipYearComplete(yearData, studType, semestersPerYear);
  }

  const eligible = normalizeEligible(yearData?.eligible)
    || (year === 1 ? normalizeEligible(student?.scholar_status) : '');
  const feePaid = yearData?.fee_paid === true || yearData?.fee_paid === 1 ? true : null;
  return isScholarshipCompleteForRegistration(eligible, feePaid, studType);
};

const findFirstIncompletePriorScholarshipYear = (
  scholarshipData,
  student,
  stageConfig = null
) => {
  const branchProgramYear = resolveRegistrationBranchYear(
    student?.branch || scholarshipData?.student?.branch,
    student?.current_year
  );
  const batch = student?.batch || scholarshipData?.student?.batch;
  if (!usesSemesterWiseScholarshipStatus(batch, branchProgramYear)) return null;
  if (branchProgramYear <= 1) return null;

  // Lateral-entry students (LATER / LSPOT) have no Year 1 — start prior-year checks at Year 2.
  const startYear = resolveScholarshipStartYear(
    student?.stud_type || student?.StudType || scholarshipData?.student?.stud_type
  );

  const years = scholarshipData?.years || [];
  for (let year = startYear; year < branchProgramYear; year += 1) {
    if (isScholarshipOptionalForBranchYear(stageConfig, student, year)) continue;
    const yearData = years.find((entry) => Number(entry.student_year) === year);
    const semestersForYear = getScholarshipSemestersForYearData(
      scholarshipData,
      year,
      scholarshipData?.semestersPerYear
    );
    if (!isPriorScholarshipYearCompleteForRegistration(yearData, student, year, semestersForYear)) {
      return year;
    }
  }
  return null;
};

const semCountFromYearData = (yearData, semestersPerYear) => {
  const configured = Math.max(1, Number(semestersPerYear) || DEFAULT_SEMESTERS_PER_YEAR);
  const fromRows = Array.isArray(yearData?.semesters) ? yearData.semesters.length : 0;
  return Math.max(configured, fromRows || configured);
};

const resolveRegistrationScholarshipDisplayFromYearData = (
  scholarshipData,
  student,
  optionalStages = [],
  stageConfig = null
) => {
  const branchProgramYear = resolveRegistrationBranchYear(
    student?.branch,
    student?.current_year
  );
  const target = resolveRegistrationScholarshipTarget(branchProgramYear, optionalStages);
  const studType = student?.stud_type || student?.StudType || scholarshipData?.student?.stud_type;
  const semestersPerYear = scholarshipData?.semestersPerYear || DEFAULT_SEMESTERS_PER_YEAR;

  if (target.fullyOptional) {
    return {
      eligible: '',
      feePaid: null,
      checkYear: null,
      fullyOptional: true,
      satisfied: true,
      displayLabel: null
    };
  }

  if (isScholarshipIneligibleQuota(studType) || scholarshipData?.scholarshipQuotaLocked) {
    return {
      eligible: 'not_eligible',
      feePaid: null,
      checkYear: target.checkYear,
      fullyOptional: false,
      satisfied: true,
      displayLabel: target.mode === 'prior_year' ? `Year ${target.checkYear}` : null
    };
  }

  const incompletePriorYear = findFirstIncompletePriorScholarshipYear(
    scholarshipData,
    student,
    stageConfig
  );
  if (incompletePriorYear != null) {
    return {
      eligible: 'pending',
      feePaid: null,
      checkYear: incompletePriorYear,
      fullyOptional: false,
      satisfied: false,
      displayLabel: `Year ${incompletePriorYear}`,
      pendingPriorYear: true
    };
  }

  const yearData = scholarshipData?.years?.find(
    (entry) => Number(entry.student_year) === Number(target.checkYear)
  );
  const batch = student?.batch || scholarshipData?.student?.batch;

  if (target.mode === 'prior_year' && usesSemesterWiseScholarshipStatus(batch, target.checkYear)) {
    const satisfied = isPriorYearScholarshipYearComplete(yearData, studType, semestersPerYear);
    const lastSemester = Math.max(1, semCountFromYearData(yearData, semestersPerYear));
    const lastSemesterRow = yearData?.semesters?.find(
      (entry) => Number(entry.student_semester) === lastSemester
    );
    return {
      eligible: normalizeEligible(lastSemesterRow?.eligible) || normalizeEligible(yearData?.eligible) || '',
      feePaid: lastSemesterRow?.fee_paid === true || lastSemesterRow?.fee_paid === 1 ? true : null,
      checkYear: target.checkYear,
      fullyOptional: false,
      satisfied,
      displayLabel: `Year ${target.checkYear}`
    };
  }

  const checkSemester = target.mode === 'prior_year'
    ? Math.max(1, Number(semestersPerYear) || 1)
    : Math.max(1, Number(student?.current_semester) || 1);
  const semesterRow = yearData?.semesters?.find(
    (entry) => Number(entry.student_semester) === checkSemester
  );
  const eligible = normalizeEligible(semesterRow?.eligible)
    || normalizeEligible(yearData?.eligible)
    || '';
  const feePaid = semesterRow?.fee_paid === true || semesterRow?.fee_paid === 1 ? true : null;
  const satisfied = target.mode === 'prior_year'
    ? isPriorYearScholarshipYearComplete(yearData, studType, semestersPerYear)
    : isScholarshipCompleteForRegistration(eligible, feePaid, studType);

  return {
    eligible,
    feePaid,
    checkYear: target.checkYear,
    fullyOptional: false,
    satisfied,
    displayLabel: target.mode === 'prior_year' ? `Year ${target.checkYear}` : null
  };
};

const pickScholarshipEligibleFromRows = (
  rows,
  studentYear,
  studentSemester,
  batch,
  studType
) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const semester = Math.max(1, Number(studentSemester) || 1);

  if (isScholarshipIneligibleQuota(studType)) {
    return 'not_eligible';
  }

  const yearRows = rows.filter((row) => Number(row.student_year) === year);
  if (!yearRows.length) return '';

  const isSemesterWise = usesSemesterWiseScholarshipStatus(batch, year);
  if (isSemesterWise) {
    const semesterRow = yearRows.find((row) => Number(row.student_semester) === semester);
    return normalizeEligible(semesterRow?.eligible) || '';
  }

  const ranked = [...yearRows].sort((a, b) => {
    const score = (row) => {
      if (Number(row.student_semester) === semester) return 0;
      if (row.student_semester == null) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  return normalizeEligible(ranked[0]?.eligible) || '';
};

const pickScholarshipFeePaidFromRows = (rows, studentYear, studentSemester) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const semester = Math.max(1, Number(studentSemester) || 1);
  const row = rows.find(
    (entry) => Number(entry.student_year) === year && Number(entry.student_semester) === semester
  );
  if (!row) return null;
  return row.fee_paid === 1 || row.fee_paid === true;
};

const buildPriorScholarshipYearDataFromRows = (rows, student, studentYear) => {
  const lookupYears = resolveScholarshipLookupYears(student.branch, studentYear);
  let yearRows = [];
  for (const lookupYear of lookupYears) {
    yearRows = rows.filter((row) => Number(row.student_year) === lookupYear);
    if (yearRows.length) break;
  }

  return {
    eligible: pickScholarshipEligibleFromRows(
      rows,
      lookupYears[0],
      1,
      student.batch,
      student.stud_type
    ),
    semesters: yearRows
      .filter((row) => row.student_semester != null)
      .map((row) => ({
        student_semester: row.student_semester,
        eligible: row.eligible,
        fee_paid: row.fee_paid
      }))
  };
};

const findFirstIncompletePriorScholarshipYearFromRows = (
  rows,
  student,
  getSemestersForYear = () => DEFAULT_SEMESTERS_PER_YEAR,
  stageConfig = null
) => {
  const branchProgramYear = resolveRegistrationBranchYear(student.branch, student.current_year);
  if (!usesSemesterWiseScholarshipStatus(student.batch, branchProgramYear)) return null;
  if (branchProgramYear <= 1) return null;

  // Lateral-entry students (LATER / LSPOT) have no Year 1 — start prior-year checks at Year 2.
  const startYear = resolveScholarshipStartYear(student.stud_type || student.StudType);

  for (let year = startYear; year < branchProgramYear; year += 1) {
    if (isScholarshipOptionalForBranchYear(stageConfig, student, year)) continue;
    const yearData = buildPriorScholarshipYearDataFromRows(rows, student, year);
    const semestersForYear = Math.max(
      1,
      Number(getSemestersForYear(year)) || DEFAULT_SEMESTERS_PER_YEAR
    );
    if (!isPriorScholarshipYearCompleteForRegistration(yearData, student, year, semestersForYear)) {
      return year;
    }
  }
  return null;
};

const areAllPriorScholarshipYearsCompleteFromRows = (
  rows,
  student,
  getSemestersForYear = () => DEFAULT_SEMESTERS_PER_YEAR,
  stageConfig = null
) => (
  findFirstIncompletePriorScholarshipYearFromRows(
    rows,
    student,
    getSemestersForYear,
    stageConfig
  ) == null
);

/**
 * Batch-load scholarship context for registration reports (one IN query instead of N+1).
 * Returns Map<studentId, { eligible, feePaid }>.
 */
const buildRegistrationScholarshipContextMap = async (
  pool,
  students,
  stageConfig,
  resolveOptionalStagesFn
) => {
  const map = new Map();
  if (!students?.length) return map;

  const needsLookup = [];

  for (const student of students) {
    const optionalStages = resolveOptionalStagesFn(stageConfig, student);
    const branchProgramYear = resolveRegistrationBranchYear(student.branch, student.current_year);
    const target = resolveRegistrationScholarshipTarget(branchProgramYear, optionalStages);

    if (target.fullyOptional) {
      map.set(student.id, { eligible: '', feePaid: null });
      continue;
    }
    if (isScholarshipIneligibleQuota(student.stud_type)) {
      map.set(student.id, { eligible: 'not_eligible', feePaid: null });
      continue;
    }
    needsLookup.push({ student, branchProgramYear });
  }

  if (!needsLookup.length) return map;

  const studentIds = needsLookup.map((entry) => entry.student.id);
  const [allRows] = await pool.query(
    `SELECT student_id, student_year, student_semester, eligible, fee_paid, updated_at, id
     FROM student_scholarship
     WHERE student_id IN (?)
       AND eligible IS NOT NULL AND TRIM(eligible) != ''
     ORDER BY student_id ASC, student_year ASC, student_semester ASC, updated_at DESC, id DESC`,
    [studentIds]
  );

  const rowsByStudent = new Map();
  for (const row of allRows) {
    if (!rowsByStudent.has(row.student_id)) rowsByStudent.set(row.student_id, []);
    rowsByStudent.get(row.student_id).push(row);
  }

  const structureByCourseBranch = new Map();
  for (const { student, branchProgramYear } of needsLookup) {
    const rows = rowsByStudent.get(student.id) || [];
    const checkSemester = Math.max(1, Number(student.current_semester) || 1);
    const lookupYears = resolveScholarshipLookupYears(student.branch, branchProgramYear);
    const structureKey = `${student.course || ''}\0${student.branch || ''}`;
    if (!structureByCourseBranch.has(structureKey)) {
      structureByCourseBranch.set(
        structureKey,
        await resolveCourseAcademicStructure(pool, student)
      );
    }
    const academicStructure = structureByCourseBranch.get(structureKey);

    let eligible = '';
    for (const lookupYear of lookupYears) {
      eligible = pickScholarshipEligibleFromRows(
        rows,
        lookupYear,
        checkSemester,
        student.batch,
        student.stud_type
      );
      if (eligible) break;
    }

    if (
      !eligible
      && !registrationUsesScholarshipTableOnly(student, branchProgramYear)
    ) {
      eligible = normalizeEligible(student.scholar_status) || '';
    }

    let feePaid = null;
    for (const lookupYear of lookupYears) {
      const found = pickScholarshipFeePaidFromRows(rows, lookupYear, checkSemester);
      if (found !== null) {
        feePaid = found;
        break;
      }
    }

    const incompletePriorYear = findFirstIncompletePriorScholarshipYearFromRows(
      rows,
      student,
      (year) => academicStructure.getSemestersForYear(year),
      stageConfig
    );
    const currentSatisfied = isScholarshipCompleteForRegistration(eligible, feePaid, student.stud_type);
    map.set(student.id, {
      eligible: incompletePriorYear != null ? 'pending' : eligible,
      feePaid,
      satisfied: incompletePriorYear == null && currentSatisfied,
      pendingPriorYear: incompletePriorYear != null
    });
  }

  return map;
};

const resolveRegistrationScholarshipForStudent = async (
  pool,
  student,
  optionalStages = [],
  stageConfig = null
) => {
  const branchProgramYear = resolveRegistrationBranchYear(
    student?.branch,
    student?.current_year
  );
  const target = resolveRegistrationScholarshipTarget(branchProgramYear, optionalStages);

  if (target.fullyOptional) {
    return {
      eligible: '',
      feePaid: null,
      satisfied: true,
      checkYear: null,
      displayLabel: null
    };
  }

  if (isScholarshipIneligibleQuota(student?.stud_type)) {
    return {
      eligible: 'not_eligible',
      feePaid: null,
      satisfied: true,
      checkYear: target.checkYear,
      displayLabel: target.mode === 'prior_year' ? `Year ${target.checkYear}` : null
    };
  }

  const academicStructure = await resolveCourseAcademicStructure(pool, student);
  const semestersPerYear = Math.max(
    academicStructure.getSemestersForYear(branchProgramYear),
    Math.max(1, Number(student?.current_semester) || 1)
  );

  if (usesSemesterWiseScholarshipStatus(student.batch, branchProgramYear) && branchProgramYear > 1) {
    const [allRows] = await pool.query(
      `SELECT student_year, student_semester, eligible, fee_paid
       FROM student_scholarship
       WHERE student_id = ?
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY student_year ASC, student_semester ASC`,
      [student.id]
    );
    const incompletePriorYear = findFirstIncompletePriorScholarshipYearFromRows(
      allRows,
      student,
      (year) => academicStructure.getSemestersForYear(year),
      stageConfig
    );
    if (incompletePriorYear != null) {
      return {
        eligible: 'pending',
        feePaid: null,
        satisfied: false,
        checkYear: incompletePriorYear,
        displayLabel: `Year ${incompletePriorYear}`,
        pendingPriorYear: true
      };
    }
  }

  const checkSemester = target.mode === 'prior_year'
    ? semestersPerYear
    : Math.max(1, Number(student?.current_semester) || 1);

  if (target.mode === 'prior_year' && usesSemesterWiseScholarshipStatus(student.batch, target.checkYear)) {
    let rows = [];
    const lookupYears = resolveScholarshipLookupYears(student.branch, target.checkYear);
    for (const lookupYear of lookupYears) {
      const [yearRows] = await pool.query(
        `SELECT student_semester, eligible, fee_paid
         FROM student_scholarship
         WHERE student_id = ? AND student_year = ? AND student_semester IS NOT NULL
           AND eligible IS NOT NULL AND TRIM(eligible) != ''
         ORDER BY student_semester ASC`,
        [student.id, lookupYear]
      );
      if (yearRows.length > 0) {
        rows = yearRows;
        break;
      }
    }
    const yearData = {
      semesters: rows.map((row) => ({
        student_semester: row.student_semester,
        eligible: row.eligible,
        fee_paid: row.fee_paid
      }))
    };
    const satisfied = isPriorYearScholarshipYearComplete(yearData, student.stud_type, semestersPerYear);
    const lastRow = rows[rows.length - 1] || {};
    return {
      eligible: normalizeEligible(lastRow.eligible) || '',
      feePaid: lastRow.fee_paid === 1 ? true : null,
      satisfied,
      checkYear: target.checkYear,
      displayLabel: `Year ${target.checkYear}`
    };
  }

  let eligible = '';
  const lookupYears = target.mode === 'prior_year'
    ? resolveScholarshipLookupYears(student.branch, target.checkYear)
    : resolveScholarshipLookupYears(student.branch, branchProgramYear);
  for (const lookupYear of lookupYears) {
    const found = await getScholarshipEligibleForYear(
      pool,
      student.id,
      lookupYear,
      student.stud_type,
      checkSemester,
      student.batch
    );
    if (found) {
      eligible = found;
      break;
    }
  }

  let feePaid = null;
  for (const lookupYear of lookupYears) {
    const [feePaidRows] = await pool.query(
      `SELECT fee_paid FROM student_scholarship
       WHERE student_id = ? AND student_year = ? AND student_semester = ?
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [student.id, lookupYear, checkSemester]
    );
    if (feePaidRows.length > 0) {
      feePaid = feePaidRows[0].fee_paid === 1;
      break;
    }
  }

  const satisfied = target.mode === 'prior_year'
    ? isScholarshipCompleteForRegistration(eligible, feePaid, student.stud_type)
    : isRegistrationScholarshipSatisfied(
      eligible,
      feePaid,
      student.stud_type,
      branchProgramYear,
      optionalStages
    );

  return {
    eligible,
    feePaid,
    satisfied,
    checkYear: target.checkYear,
    displayLabel: target.mode === 'prior_year' ? `Year ${target.checkYear}` : null
  };
};

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
      semesterMap[row.student_semester] = {
        eligible: row.eligible || '',
        fee_paid: row.fee_paid ? 1 : 0
      };
    } else if (row.eligible) {
      legacyEligible = row.eligible;
    }
  }

  if (!Object.keys(semesterMap).length && legacyEligible) {
    semesterMap[1] = { eligible: legacyEligible, fee_paid: 0 };
  }

  const semesters = buildDefaultSemesters(semestersPerYear).map((semester) => ({
    student_semester: semester.student_semester,
    eligible: (semesterMap[semester.student_semester]?.eligible) || '',
    fee_paid: semesterMap[semester.student_semester]?.fee_paid || 0
  }));

  // Eligible years: full RTF flow. Fee-only years: sanctioned + paid only (no RTF / advance).
  const allEligible = allSemestersEligible(semesters);
  const feeOnlyMode = isYearFeeOnlyScholarshipMode(semesters);
  const hasFinancialTracking = hasYearScholarshipFinancialTracking(semesters);

  return {
    application_id: applicationId || null,
    eligible: semesters[0]?.eligible || legacyEligible || null,
    sanctioned_amount: hasFinancialTracking ? sanctionedAmount : 0,
    released_amount: allEligible
      ? releases.reduce((sum, row) => sum + row.released_amount, 0)
      : 0,
    paid_amount: hasFinancialTracking
      ? paidTransactions.reduce((sum, row) => sum + row.paid_amount, 0)
      : 0,
    semesters,
    releases: allEligible ? releases : [],
    paid_transactions: hasFinancialTracking ? paidTransactions : []
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

const studentAcademicYearFromYearSql = (alias = 'students') => `(
  CAST(REGEXP_SUBSTR(${alias}.batch, '[0-9]{4}') AS UNSIGNED)
  + GREATEST(1, IFNULL(${alias}.current_year, 1)) - 1
)`;

const semesterWiseRegistrationStatusSql = (alias = 'students') => `(
  EXISTS (
    SELECT 1 FROM student_scholarship ss
    WHERE ss.student_id = ${alias}.id
      AND ss.student_year = GREATEST(1, IFNULL(${alias}.current_year, 1))
      AND (
        ss.student_semester = GREATEST(1, IFNULL(${alias}.current_semester, 1))
        OR (
          ss.student_semester IS NULL
          AND IFNULL(ss.released_amount, 0) = 0
          AND ss.from_date IS NULL
        )
      )
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'not_applied')
  )
  OR EXISTS (
    SELECT 1 FROM student_scholarship ss
    WHERE ss.student_id = ${alias}.id
      AND ss.student_year = GREATEST(1, IFNULL(${alias}.current_year, 1))
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'not_applied')
  )
)`;

const legacyRegistrationStatusSql = (alias = 'students') => `(
  ${alias}.scholar_status IS NOT NULL
  AND TRIM(${alias}.scholar_status) != ''
  AND LOWER(TRIM(${alias}.scholar_status)) IN ('eligible', 'not_eligible', 'rejected', 'not_applied')
)`;

const buildRegistrationScholarshipHasStatusSql = (academicYearFromYear = null, alias = 'students') => {
  if (academicYearFromYear != null && Number(academicYearFromYear) < SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR) {
    return legacyRegistrationStatusSql(alias);
  }
  if (academicYearFromYear != null && Number(academicYearFromYear) >= SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR) {
    return semesterWiseRegistrationStatusSql(alias);
  }
  return `CASE
    WHEN ${studentAcademicYearFromYearSql(alias)} >= ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
      THEN ${semesterWiseRegistrationStatusSql(alias)}
    ELSE ${legacyRegistrationStatusSql(alias)}
  END`;
};

const getRegistrationScholarshipFilterClause = (filter, academicYearFromYear = null, alias = 'students') => {
  const normalized = String(filter || '').trim().toLowerCase();
  const hasStatusSql = buildRegistrationScholarshipHasStatusSql(academicYearFromYear, alias);
  const semesterWiseOnly = academicYearFromYear != null
    && Number(academicYearFromYear) >= SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR;
  const legacyOnly = academicYearFromYear != null
    && Number(academicYearFromYear) < SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR;
  const yearMatchSql = `ss.student_year = GREATEST(1, IFNULL(${alias}.current_year, 1))`;

  if (normalized === 'pending') {
    return ` AND NOT (${hasStatusSql})`;
  }

  if (normalized === 'eligible') {
    if (legacyOnly) {
      return ` AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) = 'eligible'`;
    }
    if (semesterWiseOnly) {
      return ` AND EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = ${alias}.id
          AND ${yearMatchSql}
          AND LOWER(TRIM(ss.eligible)) = 'eligible'
      )`;
    }
    return ` AND (
      (
        ${studentAcademicYearFromYearSql(alias)} >= ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = ${alias}.id
            AND ${yearMatchSql}
            AND LOWER(TRIM(ss.eligible)) = 'eligible'
        )
      )
      OR (
        ${studentAcademicYearFromYearSql(alias)} < ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) = 'eligible'
      )
    )`;
  }

  if (normalized === 'not_eligible') {
    if (legacyOnly) {
      return ` AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) IN ('not_eligible', 'not eligible')`;
    }
    if (semesterWiseOnly) {
      return ` AND EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = ${alias}.id
          AND ${yearMatchSql}
          AND LOWER(TRIM(ss.eligible)) IN ('not_eligible', 'not eligible')
      )`;
    }
    return ` AND (
      (
        ${studentAcademicYearFromYearSql(alias)} >= ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = ${alias}.id
            AND ${yearMatchSql}
            AND LOWER(TRIM(ss.eligible)) IN ('not_eligible', 'not eligible')
        )
      )
      OR (
        ${studentAcademicYearFromYearSql(alias)} < ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) IN ('not_eligible', 'not eligible')
      )
    )`;
  }

  if (normalized === 'rejected') {
    if (legacyOnly) {
      return ` AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) = 'rejected'`;
    }
    if (semesterWiseOnly) {
      return ` AND EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = ${alias}.id
          AND ${yearMatchSql}
          AND LOWER(TRIM(ss.eligible)) = 'rejected'
      )`;
    }
    return ` AND (
      (
        ${studentAcademicYearFromYearSql(alias)} >= ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND EXISTS (
          SELECT 1 FROM student_scholarship ss
          WHERE ss.student_id = ${alias}.id
            AND ${yearMatchSql}
            AND LOWER(TRIM(ss.eligible)) = 'rejected'
        )
      )
      OR (
        ${studentAcademicYearFromYearSql(alias)} < ${SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR}
        AND LOWER(TRIM(IFNULL(${alias}.scholar_status, ''))) = 'rejected'
      )
    )`;
  }

  return '';
};

const buildRegistrationScholarshipAssignedSumSql = (academicYearFromYear = null, alias = 'students') => (
  `SUM(CASE WHEN ${buildRegistrationScholarshipHasStatusSql(academicYearFromYear, alias)} THEN 1 ELSE 0 END)`
);

const buildRegistrationScholarshipPendingSumSql = (academicYearFromYear = null, alias = 'students') => (
  `SUM(CASE WHEN NOT (${buildRegistrationScholarshipHasStatusSql(academicYearFromYear, alias)}) THEN 1 ELSE 0 END)`
);

const shouldUseRegistrationSemesterWise = (student, academicYearFromYear = null) => {
  if (academicYearFromYear != null) {
    return Number(academicYearFromYear) >= SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR;
  }
  const currentYear = Math.max(1, Number(student.current_year) || 1);
  return usesSemesterWiseScholarshipStatus(student.batch, currentYear);
};

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

const buildRegistrationScholarshipMap = async (pool, students, { academicYearFromYear = null } = {}) => {
  const map = new Map();
  if (!students?.length) return map;

  const semesterWiseStudents = [];
  const legacyStudents = [];

  for (const student of students) {
    if (shouldUseRegistrationSemesterWise(student, academicYearFromYear)) {
      semesterWiseStudents.push(student);
    } else {
      legacyStudents.push(student);
    }
  }

  for (const student of legacyStudents) {
    const fallback = normalizeEligible(student.scholar_status);
    if (fallback) map.set(student.id, fallback);
  }

  if (!semesterWiseStudents.length) return map;

  const studentIds = semesterWiseStudents.map((student) => student.id);

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

  return map;
};

const buildCurrentYearScholarshipMap = buildRegistrationScholarshipMap;

/**
 * Build a map of student_id → fee_paid (boolean) for the current semester.
 * Used in registration reports to determine if scholarship Step 5 is complete for eligible students.
 */
const buildRegistrationFeePaidMap = async (pool, students) => {
  const map = new Map();
  if (!students?.length) return map;

  const studentIds = students.map((student) => student.id);

  const [rows] = await pool.query(
    `SELECT ss.student_id, ss.fee_paid
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE ss.student_id IN (?)
       AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
       AND ss.student_semester = GREATEST(1, IFNULL(s.current_semester, 1))
       AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
     ORDER BY
       ss.student_id ASC,
       ss.updated_at DESC,
       ss.id DESC`,
    [studentIds]
  );

  for (const row of rows) {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, row.fee_paid === 1);
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
  isLateralEntryQuota,
  resolveScholarshipStartYear,
  normalizeEligible,
  upsertScholarshipEligible,
  syncScholarStatusColumn,
  resolveTotalYears,
  resolveSemestersPerYear,
  resolveCourseAcademicStructure,
  buildDefaultSemesters,
  buildIneligibleQuotaYearEntry,
  buildIneligibleQuotaYears,
  ensureIneligibleQuotaScholarship,
  syncIneligibleQuotaScholarshipForStudent,
  syncIneligibleQuotaScholarshipsForStudents,
  syncAllIneligibleQuotaScholarships,
  resolveScholarStatusForStudent,
  resolveRegistrationScholarStatusDisplay,
  INELIGIBLE_QUOTA_STUD_TYPE_SQL,
  normalizeScholarStatusForResponse,
  STANDARD_SCHOLAR_STATUS_FILTER_OPTIONS,
  getScholarStatusColumnFilterClause,
  getScholarshipEligibleForYear,
  isScholarshipCompleteForRegistration,
  isScholarshipOptionalForRegistration,
  resolveRegistrationScholarshipTarget,
  registrationUsesScholarshipTableOnly,
  isRegistrationScholarshipSatisfied,
  isPriorYearScholarshipYearComplete,
  resolveRegistrationScholarshipDisplayFromYearData,
  buildRegistrationScholarshipContextMap,
  resolveRegistrationScholarshipForStudent,
  archiveScholarshipYear,
  resolveHistoryActor,
  buildYearSnapshotFromRows,
  allSemestersEligible,
  allSemestersStatusAssigned,
  isYearFeeOnlyScholarshipMode,
  hasYearScholarshipFinancialTracking,
  scholarshipHasCurrentYearStatusSql,
  getScholarshipFilterClause,
  scholarshipAssignedSumSql,
  scholarshipPendingSumSql,
  resolveRegistrationScholarshipStage,
  isScholarshipDisplayUnassigned,
  buildCurrentYearScholarshipMap,
  buildRegistrationScholarshipMap,
  buildRegistrationFeePaidMap,
  buildRegistrationScholarshipHasStatusSql,
  getRegistrationScholarshipFilterClause,
  buildRegistrationScholarshipAssignedSumSql,
  buildRegistrationScholarshipPendingSumSql,
  extractBatchStartYear,
  getAcademicYearStartYear,
  usesSemesterWiseScholarshipStatus,
  enrichYearWithScholarshipMode,
  resolveLegacyYearEligible,
  SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR,
  studentAcademicYearFromYearSql,
  formatAcademicYearLabel,
  buildAcademicYearContext,
  enrichScholarshipYears,
  fetchBatchSanctionedAmountsByYear,
  propagateBatchSanctionedAmount,
  mapReleaseRowForApi,
  normalizeReleaseForSave,
  formatDbDate,
  isReleaseRow,
  isSemesterSummaryRow
};

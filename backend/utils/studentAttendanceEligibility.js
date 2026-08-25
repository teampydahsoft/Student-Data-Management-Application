const { parseDateString } = require('./dateUtils');
const { extractBatchStartYear } = require('../services/studentScholarshipSync');
const { isLateralEntryQuota } = require('./registrationBranchYear');

/**
 * 2026-batch students use join-date attendance rules so late admissions
 * are not penalised for days before they existed in the system.
 */
const ATTENDANCE_JOIN_DATE_BATCH_YEAR = 2026;

/**
 * JNTU/APSCHE lateral PIN: YY + college(2) + 5A + branch/roll.
 * Example: 246T5A0501 (regular equivalent would be 246T1A0501).
 */
const LATERAL_PIN_PATTERN = /[0-9]{2}[A-Z0-9]{2}5A/i;

const isJoinDateScopedBatch = (batch) =>
  extractBatchStartYear(batch) === ATTENDANCE_JOIN_DATE_BATCH_YEAR;

const isLateralAdmissionNumber = (value) => {
  const text = String(value || '').trim().toUpperCase();
  return Boolean(text) && LATERAL_PIN_PATTERN.test(text);
};

const isLateralEntryStudent = (row) => {
  if (!row) return false;
  if (isLateralEntryQuota(row.stud_type || row.StudType)) return true;
  return isLateralAdmissionNumber(row.admission_number)
    || isLateralAdmissionNumber(row.pin_no)
    || isLateralAdmissionNumber(row.admission_no);
};

const isJoinDateScopedStudent = (row) =>
  Boolean(row) && (isJoinDateScopedBatch(row.batch) || isLateralEntryStudent(row));

const ATTENDANCE_START_DATE_SQL = (alias = 's') => `DATE(${alias}.created_at)`;

const LATERAL_STUDENT_SQL = (alias = 's') => `
  (
    UPPER(TRIM(IFNULL(${alias}.stud_type, ''))) IN ('LATER', 'LSPOT')
    OR IFNULL(${alias}.admission_number, '') REGEXP '[0-9]{2}[A-Za-z0-9]{2}5A'
    OR IFNULL(${alias}.pin_no, '') REGEXP '[0-9]{2}[A-Za-z0-9]{2}5A'
  )
`;

const parseStartDate = (value) => {
  if (value == null || value === '') return null;
  return parseDateString(value) || null;
};

const resolveAttendanceStartDate = (row) => {
  if (!row || !isJoinDateScopedStudent(row)) return null;
  return parseStartDate(row.created_at);
};

/**
 * Laterals are admitted into program Year 2. If current_year was left at the
 * default (1), attendance history must still use the Year 2 academic calendar
 * so their % matches the rest of the batch.
 */
const resolveAttendanceProgramYear = (row) => {
  const year = Number(row?.current_year);
  const safeYear = Number.isInteger(year) && year > 0 ? year : 1;
  if (isLateralEntryStudent(row)) return Math.max(2, safeYear);
  return safeYear;
};

const isAttendanceEligibleOnDate = (attendanceDate, startDate) => {
  if (!attendanceDate || !startDate) return true;
  return attendanceDate >= startDate;
};

const appendAttendanceJoinDateClause = (attendanceDate, alias = 's') => ({
  sql: ` AND (
    (
      COALESCE(CAST(REGEXP_SUBSTR(${alias}.batch, '[0-9]{4}') AS UNSIGNED), 0) != ?
      AND NOT ${LATERAL_STUDENT_SQL(alias)}
    )
    OR ? >= ${ATTENDANCE_START_DATE_SQL(alias)}
  )`,
  params: [ATTENDANCE_JOIN_DATE_BATCH_YEAR, attendanceDate]
});

const filterEligibleDates = (dateSet, startDate) => {
  if (!startDate) return dateSet;
  const filtered = new Set();
  dateSet.forEach((date) => {
    if (isAttendanceEligibleOnDate(date, startDate)) {
      filtered.add(date);
    }
  });
  return filtered;
};

const countEligibleStudentsOnDate = (studentRows, date) => {
  if (!date) return studentRows.length;
  return studentRows.filter((row) =>
    isAttendanceEligibleOnDate(date, resolveAttendanceStartDate(row))
  ).length;
};

module.exports = {
  ATTENDANCE_JOIN_DATE_BATCH_YEAR,
  isJoinDateScopedBatch,
  isLateralEntryStudent,
  isJoinDateScopedStudent,
  ATTENDANCE_START_DATE_SQL,
  resolveAttendanceStartDate,
  resolveAttendanceProgramYear,
  isAttendanceEligibleOnDate,
  appendAttendanceJoinDateClause,
  filterEligibleDates,
  countEligibleStudentsOnDate
};

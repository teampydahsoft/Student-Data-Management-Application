const { parseDateString } = require('./dateUtils');
const { extractBatchStartYear } = require('../services/studentScholarshipSync');

/**
 * Only 2026-batch students use join-date attendance rules.
 * Older batches keep the original behaviour (no created_at cutoff).
 */
const ATTENDANCE_JOIN_DATE_BATCH_YEAR = 2026;

const isJoinDateScopedBatch = (batch) =>
  extractBatchStartYear(batch) === ATTENDANCE_JOIN_DATE_BATCH_YEAR;

const ATTENDANCE_START_DATE_SQL = (alias = 's') => `DATE(${alias}.created_at)`;

const resolveAttendanceStartDate = (row) => {
  if (!row || !isJoinDateScopedBatch(row.batch)) return null;
  return parseDateString(row.created_at);
};

const isAttendanceEligibleOnDate = (attendanceDate, startDate) => {
  if (!attendanceDate || !startDate) return true;
  return attendanceDate >= startDate;
};

const appendAttendanceJoinDateClause = (attendanceDate, alias = 's') => ({
  sql: ` AND (
    COALESCE(CAST(REGEXP_SUBSTR(${alias}.batch, '[0-9]{4}') AS UNSIGNED), 0) != ?
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
  ATTENDANCE_START_DATE_SQL,
  resolveAttendanceStartDate,
  isAttendanceEligibleOnDate,
  appendAttendanceJoinDateClause,
  filterEligibleDates,
  countEligibleStudentsOnDate
};

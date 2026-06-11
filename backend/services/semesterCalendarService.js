const { masterPool } = require('../config/database');

const deriveBatchLabel = (academicYearLabel, yearOfStudy) => {
  const label = academicYearLabel != null ? String(academicYearLabel).trim().replace(/\s/g, '') : '';
  const year = parseInt(yearOfStudy, 10);
  if (!label || !year || year < 1) return null;
  let startYear = null;
  const rangeMatch = label.match(/^(\d{4})-(\d{2,4})$/);
  if (rangeMatch) {
    startYear = parseInt(rangeMatch[1], 10);
  } else {
    const singleYearMatch = label.match(/^(\d{4})$/);
    if (singleYearMatch) startYear = parseInt(singleYearMatch[1], 10);
  }
  if (startYear == null) return null;
  return String(startYear - year + 1);
};

const deriveAcademicYearLabel = (batch, yearOfStudy) => {
  const batchYear = parseInt(batch, 10);
  const year = parseInt(yearOfStudy, 10);
  if (!batchYear || !year || year < 1) return null;
  const startYear = batchYear + year - 1;
  return `${startYear}-${startYear + 1}`;
};

const resolveCourseId = async (courseName) => {
  if (!courseName) return null;
  const [rows] = await masterPool.query(
    'SELECT id FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
    [courseName]
  );
  return rows.length > 0 ? rows[0].id : null;
};

const resolveCollegeId = async (collegeName) => {
  if (!collegeName) return null;
  const [rows] = await masterPool.query(
    'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
    [collegeName]
  );
  return rows.length > 0 ? rows[0].id : null;
};

/**
 * Resolve semester calendar dates for attendance filters.
 * Matches by course + batch + year of study + semester number (+ college when available).
 */
const resolveSemesterCalendarForFilters = async ({
  college,
  course,
  batch,
  currentYear,
  currentSemester,
  attendanceDate
}) => {
  if (!course || !batch || currentYear == null || currentSemester == null) {
    return { configured: false, startDate: null, endDate: null };
  }

  const courseId = await resolveCourseId(course);
  if (!courseId) {
    return { configured: false, startDate: null, endDate: null };
  }

  const collegeId = await resolveCollegeId(college);
  const yearOfStudy = parseInt(currentYear, 10);
  const semesterNumber = parseInt(currentSemester, 10);
  const batchLabel = String(batch).trim();

  const baseParams = [courseId, batchLabel, yearOfStudy, semesterNumber];
  let whereClause = `
    course_id = ?
    AND (batch = ? OR batch IS NULL)
    AND year_of_study = ?
    AND semester_number = ?
  `;

  if (collegeId != null) {
    whereClause = `(college_id = ? OR college_id IS NULL) AND ${whereClause}`;
    baseParams.unshift(collegeId);
  }

  const dateKey = attendanceDate || new Date().toISOString().slice(0, 10);
  const activeParams = [...baseParams, dateKey, dateKey];
  const [activeRows] = await masterPool.query(
    `SELECT start_date, end_date, batch
     FROM semesters
     WHERE ${whereClause}
       AND start_date IS NOT NULL
       AND end_date IS NOT NULL
       AND start_date <= ?
       AND end_date >= ?
     ORDER BY college_id DESC, batch DESC, start_date DESC
     LIMIT 1`,
    activeParams
  );

  let row = activeRows[0] || null;

  if (!row) {
    const [recentRows] = await masterPool.query(
      `SELECT start_date, end_date, batch
       FROM semesters
       WHERE ${whereClause}
         AND start_date IS NOT NULL
         AND end_date IS NOT NULL
       ORDER BY college_id DESC, batch DESC, start_date DESC
       LIMIT 1`,
      baseParams
    );
    row = recentRows[0] || null;
  }

  if (!row) {
    return { configured: false, startDate: null, endDate: null };
  }

  const startDate = row.start_date instanceof Date
    ? row.start_date.toISOString().slice(0, 10)
    : String(row.start_date).slice(0, 10);
  const endDate = row.end_date instanceof Date
    ? row.end_date.toISOString().slice(0, 10)
    : String(row.end_date).slice(0, 10);

  return {
    configured: true,
    startDate,
    endDate,
    batch: row.batch || batchLabel
  };
};

const isDateWithinSemesterCalendar = (date, startDate, endDate) => {
  if (!date || !startDate || !endDate) return true;
  return date >= startDate && date <= endDate;
};

/**
 * SQL fragment: include student only when no semester calendar exists for their
 * year/semester, OR the attendance date falls within the saved semester dates.
 */
const SEMESTER_CALENDAR_CONFIGURED_EXISTS = `
  SELECT 1 FROM semesters sem
  INNER JOIN courses co ON co.id = sem.course_id
    AND co.name COLLATE utf8mb4_unicode_ci = s.course COLLATE utf8mb4_unicode_ci
  WHERE (sem.batch COLLATE utf8mb4_unicode_ci = s.batch COLLATE utf8mb4_unicode_ci OR sem.batch IS NULL)
    AND sem.year_of_study = s.current_year
    AND sem.semester_number = s.current_semester
    AND sem.start_date IS NOT NULL
    AND sem.end_date IS NOT NULL
    AND (
      sem.college_id IS NULL
      OR EXISTS (
        SELECT 1 FROM colleges cl
        WHERE cl.name COLLATE utf8mb4_unicode_ci = s.college COLLATE utf8mb4_unicode_ci
          AND cl.id = sem.college_id
      )
    )
`;

const getSemesterCalendarVisibilityClause = (attendanceDate) => ({
  sql: `
    AND (
      s.current_year IS NULL
      OR s.current_semester IS NULL
      OR s.course IS NULL
      OR s.batch IS NULL
      OR NOT EXISTS (${SEMESTER_CALENDAR_CONFIGURED_EXISTS})
      OR EXISTS (
        ${SEMESTER_CALENDAR_CONFIGURED_EXISTS}
        AND ? BETWEEN sem.start_date AND sem.end_date
      )
    )
  `,
  params: [attendanceDate]
});

/**
 * SQL fragment for date-range reports: include student when no semester calendar
 * exists, OR configured semester dates overlap the report range.
 */
const getSemesterCalendarRangeVisibilityClause = (fromDate, toDate) => ({
  sql: `
    AND (
      s.current_year IS NULL
      OR s.current_semester IS NULL
      OR s.course IS NULL
      OR s.batch IS NULL
      OR NOT EXISTS (${SEMESTER_CALENDAR_CONFIGURED_EXISTS})
      OR EXISTS (
        ${SEMESTER_CALENDAR_CONFIGURED_EXISTS}
        AND sem.start_date <= ?
        AND sem.end_date >= ?
      )
    )
  `,
  params: [toDate, fromDate]
});

const appendSemesterCalendarFilter = (query, params, attendanceDate) => {
  const { sql, params: clauseParams } = getSemesterCalendarVisibilityClause(attendanceDate);
  params.push(...clauseParams);
  return query + sql;
};

const appendSemesterCalendarRangeFilter = (query, params, fromDate, toDate) => {
  const { sql, params: clauseParams } = getSemesterCalendarRangeVisibilityClause(fromDate, toDate);
  params.push(...clauseParams);
  return query + sql;
};

/**
 * Resolve the exact semester calendar row for a student (no date-based fallback).
 */
const resolveSemesterCalendarForStudent = async (student) => {
  if (!student?.course || student.current_year == null || student.current_semester == null || !student.batch) {
    return { configured: false, startDate: null, endDate: null };
  }

  const courseId = await resolveCourseId(student.course);
  if (!courseId) {
    return { configured: false, startDate: null, endDate: null };
  }

  const collegeId = await resolveCollegeId(student.college);
  const params = [courseId, String(student.batch).trim(), student.current_year, student.current_semester];
  let whereClause = `
    course_id = ?
    AND (batch = ? OR batch IS NULL)
    AND year_of_study = ?
    AND semester_number = ?
  `;

  if (collegeId != null) {
    whereClause = `(college_id = ? OR college_id IS NULL) AND ${whereClause}`;
    params.unshift(collegeId);
  }

  const [rows] = await masterPool.query(
    `SELECT start_date, end_date
     FROM semesters
     WHERE ${whereClause}
       AND start_date IS NOT NULL
       AND end_date IS NOT NULL
     ORDER BY college_id DESC, batch DESC, start_date DESC
     LIMIT 1`,
    params
  );

  if (!rows.length) {
    return { configured: false, startDate: null, endDate: null };
  }

  const row = rows[0];
  const startDate = row.start_date instanceof Date
    ? row.start_date.toISOString().slice(0, 10)
    : String(row.start_date).slice(0, 10);
  const endDate = row.end_date instanceof Date
    ? row.end_date.toISOString().slice(0, 10)
    : String(row.end_date).slice(0, 10);

  return { configured: true, startDate, endDate };
};

/**
 * Validate a student's attendance date against their semester calendar row.
 */
const validateStudentAttendanceDate = async (student, attendanceDate) => {
  const calendar = await resolveSemesterCalendarForStudent(student);

  if (!calendar.configured) {
    return { allowed: true, configured: false };
  }

  const allowed = isDateWithinSemesterCalendar(attendanceDate, calendar.startDate, calendar.endDate);
  return {
    allowed,
    configured: true,
    startDate: calendar.startDate,
    endDate: calendar.endDate
  };
};

module.exports = {
  deriveBatchLabel,
  deriveAcademicYearLabel,
  resolveSemesterCalendarForFilters,
  resolveSemesterCalendarForStudent,
  getSemesterCalendarVisibilityClause,
  getSemesterCalendarRangeVisibilityClause,
  appendSemesterCalendarFilter,
  appendSemesterCalendarRangeFilter,
  isDateWithinSemesterCalendar,
  validateStudentAttendanceDate
};

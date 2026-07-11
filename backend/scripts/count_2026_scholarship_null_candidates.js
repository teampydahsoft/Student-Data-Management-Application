/**
 * Count semester-wise scholarship rows marked "eligible" for students in
 * academic year 2026-2027 that would have eligible cleared to NULL.
 *
 * Only LOWER(TRIM(eligible)) = 'eligible' is targeted.
 * not_eligible, pending, rejected, etc. are left unchanged.
 *
 * Usage:
 *   node scripts/count_2026_scholarship_null_candidates.js
 */
require('dotenv').config();
const { masterPool } = require('../config/database');

const TARGET_ACADEMIC_START = 2026; // 2026-2027

const academicYearSql = `
  (
    CAST(REGEXP_SUBSTR(s.batch, '[0-9]{4}') AS UNSIGNED)
    + GREATEST(1, IFNULL(s.current_year, 1)) - 1
  ) = ?
`;

const activeStudentSql = `
  (s.student_status IS NULL
   OR s.student_status NOT IN ('Admission Cancelled', 'Discontinued', 'Course Completed'))
`;

/** Only rows explicitly marked eligible — not_eligible and others are excluded. */
const markedEligibleSql = `LOWER(TRIM(ss.eligible)) = 'eligible'`;

const semesterWiseRowSql = `
  ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
  AND ss.student_semester IS NOT NULL
`;

(async () => {
  const [studentsIn2026] = await masterPool.query(`
    SELECT
      s.id,
      s.admission_number,
      s.pin_no,
      s.student_name,
      s.batch,
      s.current_year,
      s.current_semester,
      s.stud_type,
      s.scholar_status
    FROM students s
    WHERE ${activeStudentSql}
      AND ${academicYearSql.replace('?', TARGET_ACADEMIC_START)}
  `, [TARGET_ACADEMIC_START]);

  const [rowsToNull] = await masterPool.query(`
    SELECT
      ss.id,
      ss.student_id,
      ss.student_year,
      ss.student_semester,
      ss.eligible,
      s.current_semester,
      s.batch,
      s.current_year,
      s.pin_no,
      s.admission_number
    FROM student_scholarship ss
    INNER JOIN students s ON s.id = ss.student_id
    WHERE ${activeStudentSql}
      AND ${academicYearSql.replace('?', TARGET_ACADEMIC_START)}
      AND ${semesterWiseRowSql}
      AND ${markedEligibleSql}
  `, [TARGET_ACADEMIC_START]);

  const [preservedNotEligible] = await masterPool.query(`
    SELECT COUNT(*) AS rows_preserved, COUNT(DISTINCT ss.student_id) AS students_preserved
    FROM student_scholarship ss
    INNER JOIN students s ON s.id = ss.student_id
    WHERE ${activeStudentSql}
      AND ${academicYearSql.replace('?', TARGET_ACADEMIC_START)}
      AND ${semesterWiseRowSql}
      AND LOWER(TRIM(ss.eligible)) = 'not_eligible'
  `, [TARGET_ACADEMIC_START]);

  const studentsAffected = new Set(rowsToNull.map((r) => r.student_id));

  const semesterBreakdown = {};
  for (const row of rowsToNull) {
    const key = `Sem ${row.student_semester}`;
    semesterBreakdown[key] = (semesterBreakdown[key] || 0) + 1;
  }

  const currentSemesterRows = rowsToNull.filter(
    (r) => Number(r.student_semester) === Math.max(1, Number(r.current_semester) || 1)
  );
  const studentsCurrentSemOnly = new Set(currentSemesterRows.map((r) => r.student_id));

  const [byBatch] = await masterPool.query(`
    SELECT
      s.batch,
      s.current_year,
      COUNT(DISTINCT s.id) AS students_in_ay,
      COUNT(DISTINCT CASE
        WHEN ss.student_semester IS NOT NULL AND ${markedEligibleSql} THEN s.id
      END) AS students_to_null,
      SUM(CASE
        WHEN ss.student_semester IS NOT NULL AND ${markedEligibleSql} THEN 1
        ELSE 0
      END) AS eligible_rows_to_null,
      SUM(CASE
        WHEN ss.student_semester IS NOT NULL AND LOWER(TRIM(ss.eligible)) = 'not_eligible' THEN 1
        ELSE 0
      END) AS not_eligible_rows_preserved
    FROM students s
    LEFT JOIN student_scholarship ss
      ON ss.student_id = s.id
     AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
    WHERE ${activeStudentSql}
      AND ${academicYearSql.replace('?', TARGET_ACADEMIC_START)}
    GROUP BY s.batch, s.current_year
    ORDER BY s.batch, s.current_year
  `, [TARGET_ACADEMIC_START]);

  console.log(JSON.stringify({
    academicYear: '2026-2027',
    academicYearStart: TARGET_ACADEMIC_START,
    target: 'Semester-wise rows marked eligible only (LOWER(TRIM(eligible)) = \'eligible\')',
    scope: {
      table: 'student_scholarship',
      studentYear: 'current_year',
      rowType: 'student_semester IS NOT NULL',
      nullField: 'eligible → NULL',
      untouched: ['not_eligible', 'pending', 'rejected', 'not_applied', 'legacy year-level rows']
    },
    studentsInAcademicYear: studentsIn2026.length,
    toNull: {
      semesterWiseEligibleRows: rowsToNull.length,
      studentsAffected: studentsAffected.size
    },
    preserved: {
      semesterWiseNotEligibleRows: preservedNotEligible[0].rows_preserved,
      studentsWithNotEligible: preservedNotEligible[0].students_preserved,
      note: 'These not_eligible semester-wise rows will NOT be changed'
    },
    bySemesterNumber: semesterBreakdown,
    currentSemesterSubset: {
      eligibleRows: currentSemesterRows.length,
      students: studentsCurrentSemOnly.size,
      note: 'Rows matching each student\'s current_semester only'
    },
    sampleStudentsToNull: rowsToNull.slice(0, 10).map((r) => ({
      pin: r.pin_no,
      admission: r.admission_number,
      batch: r.batch,
      year: r.current_year,
      sem: r.student_semester,
      eligible: r.eligible
    }))
  }, null, 2));

  console.log('\nBreakdown by batch / program year (eligible → null only):');
  console.table(byBatch);

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

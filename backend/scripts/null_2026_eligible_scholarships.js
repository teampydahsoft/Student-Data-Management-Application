/**
 * Null semester-wise scholarship eligible values for 2026-2027 AY students
 * where LOWER(TRIM(eligible)) = 'eligible'. not_eligible rows are untouched.
 *
 * Usage:
 *   node scripts/null_2026_eligible_scholarships.js          # dry-run (default)
 *   node scripts/null_2026_eligible_scholarships.js --apply    # execute update
 */
require('dotenv').config();
const { masterPool } = require('../config/database');

const TARGET_ACADEMIC_START = 2026;
const APPLY = process.argv.includes('--apply');

const activeStudentSql = `
  (s.student_status IS NULL
   OR s.student_status NOT IN ('Admission Cancelled', 'Discontinued', 'Course Completed'))
`;

const buildTargetJoinSql = () => `
  FROM student_scholarship ss
  INNER JOIN students s ON s.id = ss.student_id
  WHERE ${activeStudentSql}
    AND (
      CAST(REGEXP_SUBSTR(s.batch, '[0-9]{4}') AS UNSIGNED)
      + GREATEST(1, IFNULL(s.current_year, 1)) - 1
    ) = ?
    AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
    AND ss.student_semester IS NOT NULL
    AND LOWER(TRIM(ss.eligible)) = 'eligible'
`;

(async () => {
  const connection = await masterPool.getConnection();
  try {
    const [before] = await connection.query(`
      SELECT
        COUNT(*) AS rows_to_update,
        COUNT(DISTINCT ss.student_id) AS students_affected
      ${buildTargetJoinSql()}
    `, [TARGET_ACADEMIC_START]);

    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log('Before update:', before[0]);

    if (!APPLY) {
      console.log('\nNo changes made. Re-run with --apply to execute.');
      process.exit(0);
    }

    if (before[0].rows_to_update === 0) {
      console.log('Nothing to update.');
      process.exit(0);
    }

    await connection.beginTransaction();

    const [updateResult] = await connection.query(`
      UPDATE student_scholarship ss
      INNER JOIN students s ON s.id = ss.student_id
      SET ss.eligible = NULL,
          ss.updated_at = CURRENT_TIMESTAMP
      WHERE ${activeStudentSql}
        AND (
          CAST(REGEXP_SUBSTR(s.batch, '[0-9]{4}') AS UNSIGNED)
          + GREATEST(1, IFNULL(s.current_year, 1)) - 1
        ) = ?
        AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
        AND ss.student_semester IS NOT NULL
        AND LOWER(TRIM(ss.eligible)) = 'eligible'
    `, [TARGET_ACADEMIC_START]);

    const [afterEligible] = await connection.query(`
      SELECT COUNT(*) AS remaining_eligible_rows
      ${buildTargetJoinSql()}
    `, [TARGET_ACADEMIC_START]);

    const [preservedNotEligible] = await connection.query(`
      SELECT COUNT(*) AS not_eligible_rows
      FROM student_scholarship ss
      INNER JOIN students s ON s.id = ss.student_id
      WHERE ${activeStudentSql}
        AND (
          CAST(REGEXP_SUBSTR(s.batch, '[0-9]{4}') AS UNSIGNED)
          + GREATEST(1, IFNULL(s.current_year, 1)) - 1
        ) = ?
        AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
        AND ss.student_semester IS NOT NULL
        AND LOWER(TRIM(ss.eligible)) = 'not_eligible'
    `, [TARGET_ACADEMIC_START]);

    await connection.commit();

    console.log('\nUpdate complete:');
    console.log({
      rowsUpdated: updateResult.affectedRows,
      studentsExpected: before[0].students_affected,
      remainingEligibleSemesterRows: afterEligible[0].remaining_eligible_rows,
      notEligibleRowsPreserved: preservedNotEligible[0].not_eligible_rows
    });

    if (Number(afterEligible[0].remaining_eligible_rows) !== 0) {
      console.warn('Warning: some eligible semester rows still remain after update.');
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

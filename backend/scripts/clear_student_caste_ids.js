/**
 * Clear students.caste_id → NULL for all students (undo backfill).
 * Does NOT drop the column. Does NOT change the caste name column.
 *
 * Usage:
 *   node backend/scripts/clear_student_caste_ids.js
 *   node backend/scripts/clear_student_caste_ids.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

const formatStudent = (student) =>
  [
    student.admission_number || '-',
    student.pin_no || '-',
    student.student_name || '-',
    student.college || '-',
    student.course || '-',
    student.branch || '-',
    `caste="${student.caste == null || String(student.caste).trim() === '' ? '' : String(student.caste).trim()}"`,
    `caste_id=${student.caste_id}`
  ].join(' | ');

(async () => {
  try {
    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );

    if (Number(cols[0]?.count || 0) === 0) {
      console.error('students.caste_id column does not exist. Nothing to clear.');
      process.exit(1);
    }

    const [withId] = await masterPool.query(
      `SELECT id, admission_number, pin_no, student_name, college, course, branch, caste, caste_id
       FROM students
       WHERE caste_id IS NOT NULL
       ORDER BY id ASC`
    );

    const [alreadyNullRows] = await masterPool.query(
      `SELECT COUNT(*) AS count FROM students WHERE caste_id IS NULL`
    );
    const alreadyNull = Number(alreadyNullRows[0]?.count || 0);

    console.log(`Mode: ${reportOnly ? 'REPORT ONLY (no updates)' : 'CLEAR caste_id → NULL'}`);
    console.log(`Students with caste_id set : ${withId.length}`);
    console.log(`Students already NULL      : ${alreadyNull}\n`);

    if (!withId.length) {
      console.log('Nothing to clear. All caste_id values are already NULL.');
      process.exit(0);
    }

    console.log(`========== WILL CLEAR (${withId.length}) ==========`);
    withId.forEach((student) => console.log(formatStudent(student)));

    if (reportOnly) {
      console.log('\nReport only — no rows were updated.');
      process.exit(0);
    }

    console.log('\nClearing caste_id...');
    const [result] = await masterPool.query(
      `UPDATE students SET caste_id = NULL WHERE caste_id IS NOT NULL`
    );

    console.log('\n----- Summary -----');
    console.log(`Cleared to NULL : ${result.affectedRows}`);
    console.log(`Listed          : ${withId.length}`);
    console.log('Done. caste name column was not changed.');
  } catch (error) {
    console.error('Clear failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();

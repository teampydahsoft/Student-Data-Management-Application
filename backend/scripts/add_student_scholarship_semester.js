/**
 * Add student_semester column to student_scholarship for per-semester eligible status.
 *
 * Usage (from backend folder):
 *   node scripts/add_student_scholarship_semester.js
 */

const { masterPool } = require('../config/database');

const run = async () => {
  const [columns] = await masterPool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_scholarship'
       AND COLUMN_NAME = 'student_semester'`
  );

  if (columns.length > 0) {
    console.log('student_semester column already exists on student_scholarship');
    return;
  }

  await masterPool.query(
    `ALTER TABLE student_scholarship
     ADD COLUMN student_semester INT NULL DEFAULT NULL AFTER student_year`
  );
  console.log('Added student_semester column to student_scholarship');
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Add paid_amount column to student_scholarship for tracking actual payments.
 *
 * Usage (from backend folder):
 *   node scripts/add_scholarship_paid_amount.js
 */

const { masterPool } = require('../config/database');

const run = async () => {
  const [columns] = await masterPool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_scholarship'
       AND COLUMN_NAME = 'paid_amount'`
  );

  if (columns.length > 0) {
    console.log('paid_amount column already exists on student_scholarship');
    return;
  }

  await masterPool.query(
    `ALTER TABLE student_scholarship
     ADD COLUMN paid_amount INT NOT NULL DEFAULT 0 AFTER released_amount`
  );
  console.log('Added paid_amount column to student_scholarship');
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

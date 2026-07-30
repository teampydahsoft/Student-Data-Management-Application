/**
 * Add students.category_id (FK-style link to caste_categories.id).
 * Does NOT rename or drop students.caste — other apps keep using caste text.
 * Does NOT backfill (run backfill_student_category_ids.js after).
 *
 * Prefer stopping heavy API traffic first to avoid lock waits.
 *
 * Usage:
 *   node backend/scripts/add_student_category_id_column.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const columnExists = async (columnName) => {
  const [rows] = await masterPool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'students'
       AND COLUMN_NAME = ?`,
    [columnName]
  );
  return Number(rows[0]?.count || 0) > 0;
};

const indexExists = async (indexName) => {
  const [rows] = await masterPool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'students'
       AND INDEX_NAME = ?`,
    [indexName]
  );
  return Number(rows[0]?.count || 0) > 0;
};

(async () => {
  let connection;
  try {
    connection = await masterPool.getConnection();
    await connection.query('SET SESSION lock_wait_timeout = 15');
    await connection.query('SET SESSION innodb_lock_wait_timeout = 15');

    if (await columnExists('category_id')) {
      console.log('Column category_id already exists.');
    } else {
      console.log('Adding column category_id...');
      try {
        await connection.query(`
          ALTER TABLE students
          ADD COLUMN category_id INT NULL DEFAULT NULL,
          ALGORITHM=INPLACE, LOCK=NONE
        `);
      } catch (onlineErr) {
        console.warn('Online DDL failed, falling back:', onlineErr.message);
        await connection.query(`
          ALTER TABLE students
          ADD COLUMN category_id INT NULL DEFAULT NULL
        `);
      }
      console.log('Column category_id added.');
    }

    if (!(await indexExists('idx_students_category_id'))) {
      console.log('Adding index idx_students_category_id...');
      try {
        await connection.query(`
          ALTER TABLE students
          ADD INDEX idx_students_category_id (category_id),
          ALGORITHM=INPLACE, LOCK=NONE
        `);
      } catch (onlineErr) {
        console.warn('Online index DDL failed, falling back:', onlineErr.message);
        await connection.query(`
          ALTER TABLE students
          ADD INDEX idx_students_category_id (category_id)
        `);
      }
      console.log('Index added.');
    } else {
      console.log('Index idx_students_category_id already exists.');
    }

    console.log('Done. Next: node backend/scripts/backfill_student_category_ids.js');
    process.exit(0);
  } catch (error) {
    console.error('Failed to add category_id:', error.message || error);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

/**
 * Step 1 only: add students.caste_id column (NO data backfill).
 *
 * IMPORTANT — avoid deadlocks:
 * 1. Stop the backend / any app using the students table first
 * 2. Then run this script
 * 3. Restart backend after it succeeds
 *
 * Usage:
 *   node backend/scripts/add_student_caste_id_column.js
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

const showBlockingLocks = async () => {
  try {
    const [rows] = await masterPool.query(`
      SELECT
        r.trx_id waiting_trx,
        r.trx_mysql_thread_id waiting_thread,
        r.trx_query waiting_query,
        b.trx_id blocking_trx,
        b.trx_mysql_thread_id blocking_thread,
        b.trx_query blocking_query
      FROM information_schema.innodb_lock_waits w
      JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
      JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id
      LIMIT 10
    `);
    if (rows.length) {
      console.log('Current lock waits (sample):');
      console.table(rows);
    }
  } catch (_) {
    // Older MySQL / permissions — ignore
  }
};

(async () => {
  let connection;
  try {
    connection = await masterPool.getConnection();

    // Fail fast instead of waiting forever / deadlocking with live API traffic
    await connection.query('SET SESSION lock_wait_timeout = 5');
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5');

    if (await columnExists('caste_id')) {
      console.log('Column caste_id already exists.');
    } else {
      console.log('Checking for blocking locks before ALTER...');
      await showBlockingLocks();

      console.log('Adding column caste_id only (no index yet, low lock)...');
      try {
        // Prefer online DDL when supported (MySQL 5.6+ / 8.0)
        await connection.query(`
          ALTER TABLE students
          ADD COLUMN caste_id INT NULL DEFAULT NULL,
          ALGORITHM=INPLACE, LOCK=NONE
        `);
      } catch (onlineErr) {
        console.warn(
          'Online DDL not available, falling back to standard ADD COLUMN:',
          onlineErr.message
        );
        await connection.query(`
          ALTER TABLE students
          ADD COLUMN caste_id INT NULL DEFAULT NULL
        `);
      }
      console.log('Column caste_id added.');
    }

    if (!(await indexExists('idx_students_caste_id'))) {
      console.log('Adding index idx_students_caste_id separately...');
      try {
        await connection.query(`
          ALTER TABLE students
          ADD INDEX idx_students_caste_id (caste_id),
          ALGORITHM=INPLACE, LOCK=NONE
        `);
      } catch (onlineErr) {
        console.warn(
          'Online index DDL not available, falling back:',
          onlineErr.message
        );
        await connection.query(`
          ALTER TABLE students
          ADD INDEX idx_students_caste_id (caste_id)
        `);
      }
      console.log('Index added.');
    } else {
      console.log('Index idx_students_caste_id already exists.');
    }

    console.log('Done. No student data was modified.');
  } catch (error) {
    console.error('Failed to add caste_id column:', error.message || error);
    if (
      String(error.message || '').includes('Lock wait timeout') ||
      error.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      error.code === 'ER_LOCK_DEADLOCK'
    ) {
      console.error(`
Deadlock / lock wait detected.
1. Stop backend (and any other app using student_database)
2. Wait a few seconds
3. Re-run: node backend/scripts/add_student_caste_id_column.js
`);
    }
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    process.exit();
  }
})();

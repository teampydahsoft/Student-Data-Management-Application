/**
 * One-time helper to allow 'holiday' in attendance_records.status
 *
 * Usage:
 *   cd backend
 *   node scripts/updateAttendanceStatusEnum.js
 *
 * Requires DB connection env vars to be set (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT).
 */
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_PORT
  } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error('Missing DB connection env vars (DB_HOST, DB_USER, DB_NAME)');
  }

  const maxAttempts = 5;
  const delayMs = 5000;
  let attempt = 0;
  let connection = null;

  while (!connection && attempt < maxAttempts) {
    attempt += 1;
    try {
      console.log(`Connecting to DB (attempt ${attempt}/${maxAttempts})...`);
      connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD || '',
        database: DB_NAME,
        port: DB_PORT ? Number(DB_PORT) : 3306,
        multipleStatements: true,
        connectTimeout: 10000
      });
    } catch (err) {
      console.error(`Connection attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxAttempts) {
        throw err;
      }
      console.log(`Waiting ${delayMs / 1000}s before retry...`);
      await sleep(delayMs);
    }
  }

  try {
    console.log('Updating attendance_records.status enum to include holiday and pending...');
    await connection.query(`
      ALTER TABLE attendance_records
      MODIFY COLUMN status ENUM('present','absent','holiday','pending') NOT NULL;
    `);
    console.log('Done. status now accepts present, absent, holiday, pending.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});


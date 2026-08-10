const mysql = require('mysql2/promise');
require('dotenv').config({path: './.env'});

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const [updateResult] = await conn.execute(`
      UPDATE students s
      JOIN castes c ON s.caste_id = c.id
      SET s.category_id = c.category_id
      WHERE s.category_id IS NULL AND s.caste_id IS NOT NULL
    `);
    console.log('Migration complete. Rows affected:', updateResult.affectedRows);
  } catch (err) {
    console.error(err);
  } finally {
    conn.end();
  }
}

run();

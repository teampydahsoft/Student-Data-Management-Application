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
    const [students] = await conn.execute('SELECT caste, category_id, COUNT(*) as count FROM students GROUP BY caste, category_id');
    console.log('Students distribution by category_id:', students);
  } catch (err) {
    console.error(err);
  } finally {
    conn.end();
  }
}

run();

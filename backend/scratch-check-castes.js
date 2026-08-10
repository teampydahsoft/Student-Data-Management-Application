const mysql = require('mysql2/promise');
require('dotenv').config({path: './backend/.env'});

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [categories] = await conn.execute('SELECT * FROM caste_categories');
    console.log('Categories:', categories);

    const [castes] = await conn.execute('SELECT * FROM castes');
    console.log('Castes:', castes);

    const [students] = await conn.execute('SELECT caste, caste_id, COUNT(*) as count FROM students GROUP BY caste, caste_id');
    console.log('Students distribution:', students);
  } catch (err) {
    console.error(err);
  } finally {
    conn.end();
  }
}

run();

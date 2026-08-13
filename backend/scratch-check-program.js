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
    const [rows] = await conn.execute('DESCRIBE students');
    const cols = rows.map(r => r.Field);
    console.log("Columns:", cols.join(", "));
    
    const [courseStudents] = await conn.execute(`SELECT * FROM students WHERE course LIKE '%AAAAA%' OR branch LIKE '%AAAAA%'`);
    if (courseStudents.length > 0) {
        console.log(`Students with AAAAA in course/branch:`, courseStudents.map(s => ({id: s.id, name: s.student_name, course: s.course, branch: s.branch})));
    } else {
        console.log("No students found with AAAAA in course or branch");
    }

    const [jsonStudents] = await conn.execute(`SELECT id, student_name, student_data FROM students WHERE student_data LIKE '%AAAAA%'`);
    if (jsonStudents.length > 0) {
        console.log(`Students with AAAAA in student_data JSON:`, jsonStudents.map(s => ({id: s.id, name: s.student_name})));
    } else {
        console.log("No students found with AAAAA in student_data");
    }

  } catch (err) {
    console.error(err);
  } finally {
    conn.end();
  }
}

run();

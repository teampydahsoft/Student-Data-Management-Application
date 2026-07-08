const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com',
    port: 3306, user: 'admin', password: 'Student!0000',
    database: 'student_database', ssl: { rejectUnauthorized: false }
  });

  // What is stored in students.branch for AGRD students?
  const [r1] = await conn.query(
    "SELECT DISTINCT branch FROM students WHERE branch LIKE '%Agriculture%' OR branch LIKE '%Rural%' LIMIT 5"
  );
  console.log('students.branch values:', JSON.stringify(r1));

  // What is the registration_stage_config setting?
  const [r2] = await conn.query("SELECT value FROM settings WHERE `key` = 'registration_stage_config'");
  console.log('registration_stage_config:', r2[0]?.value || '(not found)');

  await conn.end();
}
main().catch(console.error);

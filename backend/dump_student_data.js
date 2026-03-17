const { masterPool } = require('./config/database');

async function checkStudentData() {
  try {
    const [rows] = await masterPool.execute("SELECT admission_number, student_data, course FROM students WHERE student_data LIKE '%Yes%' LIMIT 5");
    
    rows.forEach((row) => {
      const data = typeof row.student_data === 'string' ? JSON.parse(row.student_data) : row.student_data;
      console.log(`\n--- Student ${row.admission_number} (${row.course}) ---`);
      console.log(data);
    });
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

checkStudentData();

const { masterPool } = require('./config/database');

async function verify() {
  try {
    const [c] = await masterPool.query(`SELECT id, name, code, total_years FROM courses WHERE id = 20`);
    const [cb] = await masterPool.query(`SELECT id, name, code, total_years FROM course_branches WHERE id = 211`);
    console.log('Course total_years:', c[0].total_years);
    console.log('CourseBranch total_years:', cb[0].total_years);

    const [students] = await masterPool.query(`
      SELECT id, admission_number, student_name, current_year, current_semester, student_data
      FROM students
      WHERE batch = '2022' AND branch = 'DAE-KKD'
    `);

    console.log(`Total students verified: ${students.length}`);
    const unupdated = students.filter(s => s.current_year !== 3 || s.current_semester !== 2);
    console.log(`Unupdated students count: ${unupdated.length}`);

    // Check JSON of first student
    const data = typeof students[0].student_data === 'string' ? JSON.parse(students[0].student_data) : students[0].student_data;
    console.log('Sample student 13652 JSON fields:', {
      current_year: data.current_year,
      current_semester: data.current_semester,
      'Current Academic Year': data['Current Academic Year'],
      'Current Semester': data['Current Semester']
    });

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

verify();

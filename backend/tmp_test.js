const { masterPool } = require('./config/database');
async function run() {
  try {
    const [c] = await masterPool.query(`SELECT id, name FROM colleges`);
    console.log('Colleges:', c);
    
    const [s] = await masterPool.query(`SELECT s.id, c.name AS college_name, s.college AS legacy_college, s.student_status FROM students s LEFT JOIN colleges c ON s.college_id = c.id LIMIT 10`);
    console.log('Students:', s);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();

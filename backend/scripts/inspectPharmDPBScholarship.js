require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production') });
require('dotenv').config();
const { masterPool } = require('../config/database');

(async () => {
  const [rows] = await masterPool.query(`
    SELECT s.admission_number, s.branch, s.current_year, s.current_semester,
           ss.student_year, ss.student_semester, ss.eligible
    FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
    LEFT JOIN student_scholarship ss ON ss.student_id = s.id
    WHERE s.branch = 'Pharm D PB'
    ORDER BY s.admission_number, ss.student_year, ss.student_semester
  `);
  console.log(JSON.stringify(rows, null, 2));
  await masterPool.end();
})();

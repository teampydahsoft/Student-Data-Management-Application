require('dotenv').config();
const { masterPool } = require('../config/database');

(async () => {
  try {
    console.log('='.repeat(50));
    console.log('ACTIVE BRANCHES FOR DIPLOMA');
    console.log('='.repeat(50));
    
    const [rows] = await masterPool.query(`
      SELECT cb.name, cb.id
      FROM course_branches cb 
      JOIN courses c ON cb.course_id = c.id 
      WHERE c.name = 'Diploma' AND cb.is_active = 1 
      ORDER BY cb.name
    `);
    
    if (rows.length === 0) {
      console.log('No active branches found for Diploma!');
    } else {
      rows.forEach(r => console.log(`  - ${r.name}`));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('STUDENTS WITH ORPHANED BRANCHES');
    console.log('='.repeat(50));
    
    const [orphaned] = await masterPool.query(`
      SELECT DISTINCT s.branch, COUNT(*) as cnt
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      WHERE s.course = 'Diploma'
        AND s.branch NOT IN (
          SELECT cb.name FROM course_branches cb 
          JOIN courses c ON cb.course_id = c.id 
          WHERE c.name = 'Diploma' AND cb.is_active = 1
        )
      GROUP BY s.branch
    `);
    
    if (orphaned.length === 0) {
      console.log('No orphaned branches found!');
    } else {
      orphaned.forEach(o => console.log(`  - "${o.branch}" (${o.cnt} students)`));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await masterPool.end();
    process.exit(0);
  }
})();


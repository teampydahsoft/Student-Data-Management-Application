require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production') });
require('dotenv').config();
const { masterPool } = require('../config/database');

(async () => {
  const [students] = await masterPool.query(`
    SELECT branch, batch, current_year, current_semester, registration_status, admission_number, student_name
    FROM students
    WHERE branch = 'Pharm D PB'
    ORDER BY batch, current_year, admission_number
  `);
  console.log('Pharm D PB students:', students.length);
  students.forEach((s) => {
    console.log(`  ${s.admission_number} | batch ${s.batch} | Y${s.current_year} S${s.current_semester} | ${s.registration_status}`);
  });

  const [allPharm] = await masterPool.query(`
    SELECT branch, batch, current_year, COUNT(*) c
    FROM students
    WHERE branch LIKE '%Pharm%'
    GROUP BY branch, batch, current_year
    ORDER BY branch, current_year
  `);
  console.log('\nPharm branches year distribution:', JSON.stringify(allPharm, null, 2));

  const [branches] = await masterPool.query(`
    SELECT cb.name, cb.total_years, cb.year_semester_config, cb.metadata, c.name AS course_name, c.total_years AS course_total_years
    FROM course_branches cb
    LEFT JOIN courses c ON c.id = cb.course_id
    WHERE cb.name LIKE '%Pharm%' OR cb.name LIKE '%PB%'
  `);
  console.log('\nBranch/course config:');
  console.log(JSON.stringify(branches, null, 2));

  const [cfg] = await masterPool.query(
    "SELECT value FROM settings WHERE `key` = 'registration_stage_config'"
  );
  const reg = JSON.parse(cfg[0]?.value || '{}');
  console.log('\nRegistration optional keys for Pharm:');
  Object.keys(reg).filter((k) => k.toLowerCase().includes('pharm')).forEach((k) => {
    console.log(`  ${k}:`, reg[k]);
  });

  await masterPool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

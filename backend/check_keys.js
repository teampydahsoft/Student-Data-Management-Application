const { masterPool } = require('./config/database');

const knownKeys = new Set([
  '10th_tc', '10th_study', 'inter_diploma_tc', 'inter_diploma_study',
  'ug_study', 'ug_tc', 'ug_pc', 'ug_cmm', 'ug_od'
]);

async function findMismatches() {
  try {
    const [rows] = await masterPool.execute("SELECT admission_number, student_data, course FROM students WHERE student_data LIKE '%Yes%' LIMIT 20");
    
    rows.forEach((row) => {
      const data = typeof row.student_data === 'string' ? JSON.parse(row.student_data) : row.student_data;
      const yesKeys = Object.entries(data)
        .filter(([k, v]) => v === 'Yes')
        .map(([k, v]) => k);
      
      const unknownYesKeys = yesKeys.filter(k => !knownKeys.has(k) && !k.startsWith('custom_'));
      
      if (unknownYesKeys.length > 0) {
        console.log(`\nStudent ${row.admission_number} (${row.course}) has unknown "Yes" keys:`, unknownYesKeys);
      }
    });
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

findMismatches();

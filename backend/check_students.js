const { masterPool } = require('./config/database');

async function check() {
  try {
    const [students] = await masterPool.query(`
      SELECT id, admission_number, student_name, branch, branch_id, student_data
      FROM students 
      WHERE branch = 'DAIM' AND batch = '2026'
    `);
    
    let wrongBranchIdCount = 0;
    let wrongJsonCount = 0;
    let jsonErrorCount = 0;

    for (const student of students) {
      if (student.branch_id != 51) {
        wrongBranchIdCount++;
      }
      try {
        if (student.student_data) {
          const data = JSON.parse(student.student_data);
          let isWrong = false;
          if (data.courseInfo && (data.courseInfo.branch !== 'DAIM' || data.courseInfo.branchId !== "51")) isWrong = true;
          if (data._crm_managed_branch_id != "51") isWrong = true;
          if (data.Branch !== 'DAIM') isWrong = true;
          if (isWrong) wrongJsonCount++;
        }
      } catch (e) {
        jsonErrorCount++;
      }
    }
    
    console.log(`wrongBranchIdCount: ${wrongBranchIdCount}`);
    console.log(`wrongJsonCount: ${wrongJsonCount}`);
    console.log(`jsonErrorCount: ${jsonErrorCount}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();

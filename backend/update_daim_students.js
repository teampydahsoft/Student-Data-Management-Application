const { masterPool } = require('./config/database');

async function updateStudents() {
  try {
    const [students] = await masterPool.query(`
      SELECT id, admission_number, student_name, branch, branch_id, student_data
      FROM students 
      WHERE branch = 'DAIM' AND batch = '2026'
    `);
    
    console.log(`Found ${students.length} students to update.`);

    let updateCount = 0;
    let errorCount = 0;

    for (const student of students) {
      let data = {};
      try {
        if (student.student_data) {
          data = JSON.parse(student.student_data);
        }
      } catch (e) {
        console.error(`Invalid JSON for student ID ${student.id} (${student.admission_number}). Skipping JSON update.`);
        errorCount++;
        // Still update the branch_id in the row if needed, but not student_data
        if (student.branch_id != 51) {
          await masterPool.query(
            `UPDATE students SET branch_id = 51 WHERE id = ?`,
            [student.id]
          );
          updateCount++;
        }
        continue;
      }

      let isModified = false;

      if (student.branch_id != 51) {
        isModified = true;
      }

      if (data.courseInfo) {
        if (data.courseInfo.branch !== 'DAIM' || data.courseInfo.branchId !== "51") {
          data.courseInfo.branch = 'DAIM';
          data.courseInfo.branchId = "51";
          isModified = true;
        }
      }

      if (data._crm_managed_branch_id != "51") {
        data._crm_managed_branch_id = "51";
        isModified = true;
      }

      if (data.Branch !== 'DAIM') {
        data.Branch = 'DAIM';
        isModified = true;
      }

      if (isModified) {
        const studentDataStr = JSON.stringify(data);
        await masterPool.query(
          `UPDATE students SET branch_id = 51, student_data = ? WHERE id = ?`,
          [studentDataStr, student.id]
        );
        updateCount++;
      }
    }
    
    console.log(`Successfully updated ${updateCount} students. Skipped ${errorCount} due to JSON errors.`);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
updateStudents();

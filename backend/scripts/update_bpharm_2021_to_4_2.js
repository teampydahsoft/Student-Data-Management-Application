/**
 * Script to find and update 2021 batch B.Pharm students in Pharmacy College
 * from Year 2-2 (and any remaining non 4-2) to Year 4-2 (Course Completed).
 *
 * Usage:
 *   node scripts/update_bpharm_2021_to_4_2.js            # Runs in DRY-RUN mode (safe preview)
 *   node scripts/update_bpharm_2021_to_4_2.js --execute  # Applies updates to database
 */

require('dotenv').config();
const { masterPool } = require('../config/database');

const isExecute = process.argv.includes('--execute');
const TARGET_YEAR = 4;
const TARGET_SEMESTER = 2;

async function run() {
  console.log('='.repeat(70));
  console.log(`🎓 B.PHARM 2021 BATCH YEAR & SEMESTER MIGRATION TO ${TARGET_YEAR}-${TARGET_SEMESTER}`);
  console.log(`MODE: ${isExecute ? '⚡ LIVE EXECUTION (Writing to database)' : '🔍 DRY-RUN PREVIEW (No changes made)'}`);
  console.log('='.repeat(70));

  try {
    // 1. Fetch all B.Pharm 2021 batch students from Pydah College of Pharmacy
    const [students] = await masterPool.query(`
      SELECT 
        id, 
        admission_number, 
        pin_no, 
        student_name, 
        batch, 
        college, 
        course, 
        branch, 
        current_year, 
        current_semester, 
        student_data
      FROM students 
      WHERE (batch = '2021' OR batch LIKE '%2021%')
        AND (course = 'B.Pharm' OR branch = 'B.Pharm' OR course LIKE '%B%Pharm%')
        AND (college LIKE '%Pharm%' OR college_id = 3)
      ORDER BY id ASC
    `);

    console.log(`\n📋 Found ${students.length} total B.Pharm 2021 students in Pharmacy College.`);

    // 2. Classify students by current stage
    const studentsIn22 = students.filter(s => s.current_year === 2 && s.current_semester === 2);
    const studentsIn41 = students.filter(s => s.current_year === 4 && s.current_semester === 1);
    const studentsAlready42 = students.filter(s => s.current_year === 4 && s.current_semester === 2);
    const otherStudents = students.filter(s => 
      !(s.current_year === 2 && s.current_semester === 2) &&
      !(s.current_year === 4 && s.current_semester === 1) &&
      !(s.current_year === 4 && s.current_semester === 2)
    );

    console.log(`   - In Year 2, Semester 2 (2-2): ${studentsIn22.length}`);
    console.log(`   - In Year 4, Semester 1 (4-1): ${studentsIn41.length}`);
    console.log(`   - Already in 4-2:               ${studentsAlready42.length}`);
    if (otherStudents.length > 0) {
      console.log(`   - Other stages:                ${otherStudents.length}`);
    }

    // Target students: All students who need to be moved to 4-2
    // Primarily the 107 in 2-2, and also the 9 in 4-1
    const studentsToUpdate = students.filter(
      s => s.current_year !== TARGET_YEAR || s.current_semester !== TARGET_SEMESTER
    );

    console.log(`\n🎯 Total students requiring update to ${TARGET_YEAR}-${TARGET_SEMESTER}: ${studentsToUpdate.length}`);

    if (studentsToUpdate.length === 0) {
      console.log('✅ All B.Pharm 2021 students are already in 4-2. Nothing to do.');
      return;
    }

    // Display sample / preview table
    console.log('\nPreview of students to be updated:');
    console.table(
      studentsToUpdate.map((s, idx) => ({
        '#': idx + 1,
        ID: s.id,
        'Admission No': s.admission_number,
        PIN: s.pin_no || 'N/A',
        Name: s.student_name,
        'Current Stage': `${s.current_year}-${s.current_semester}`,
        'New Stage': `${TARGET_YEAR}-${TARGET_SEMESTER}`
      }))
    );

    // 3. Perform updates if in execute mode
    let updatedCount = 0;
    let jsonErrorCount = 0;

    for (const student of studentsToUpdate) {
      let data = {};
      let hasValidJson = false;

      if (student.student_data) {
        try {
          data = JSON.parse(student.student_data);
          if (data && typeof data === 'object') {
            hasValidJson = true;
          }
        } catch (err) {
          console.warn(`⚠️ Warning: Could not parse JSON for Student ID ${student.id} (${student.admission_number}). Will only update DB columns.`);
          jsonErrorCount++;
        }
      }

      if (hasValidJson) {
        data.current_year = TARGET_YEAR;
        data.current_semester = TARGET_SEMESTER;
        data['Current Academic Year'] = TARGET_YEAR;
        data['Current Semester'] = TARGET_SEMESTER;
      }

      if (isExecute) {
        const updatedJsonStr = hasValidJson ? JSON.stringify(data) : student.student_data;
        await masterPool.query(
          `UPDATE students 
           SET current_year = ?, current_semester = ?, student_data = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [TARGET_YEAR, TARGET_SEMESTER, updatedJsonStr, student.id]
        );
      }
      updatedCount++;
    }

    console.log('\n' + '='.repeat(70));
    if (isExecute) {
      console.log(`🎉 SUCCESS: Successfully updated ${updatedCount} students to Year ${TARGET_YEAR}, Semester ${TARGET_SEMESTER}!`);
      if (jsonErrorCount > 0) {
        console.log(`⚠️ ${jsonErrorCount} students had invalid JSON and had only DB columns updated.`);
      }
    } else {
      console.log(`ℹ️ DRY-RUN COMPLETE: ${updatedCount} students would be updated.`);
      console.log(`👉 To apply these changes to the database, run:`);
      console.log(`   node scripts/update_bpharm_2021_to_4_2.js --execute`);
    }
    console.log('='.repeat(70));

  } catch (err) {
    console.error('❌ Error executing migration script:', err);
  } finally {
    process.exit(0);
  }
}

run();

/**
 * Migration script to update 2022 batch DAE-KKD course total duration to 3 years
 * and move all 2022 batch DAE-KKD students to 3-2 (Year 3, Semester 2).
 *
 * Usage:
 *   node scripts/update_2022_dae_students_to_3_2.js            # Dry-run mode
 *   node scripts/update_2022_dae_students_to_3_2.js --execute  # Execute DB updates
 */

require('dotenv').config();
const { masterPool } = require('../config/database');

const isExecute = process.argv.includes('--execute');
const TARGET_YEAR = 3;
const TARGET_SEMESTER = 2;

async function run() {
  console.log('='.repeat(70));
  console.log(`🎓 DAE-KKD 2022 BATCH COURSE & STUDENT MIGRATION TO ${TARGET_YEAR}-${TARGET_SEMESTER}`);
  console.log(`MODE: ${isExecute ? '⚡ LIVE EXECUTION (Writing to database)' : '🔍 DRY-RUN PREVIEW (No changes made)'}`);
  console.log('='.repeat(70));

  try {
    // 1. Update total_years for courses (id 20) and course_branches (id 211)
    console.log('\n--- Step 1: Checking Course & Branch Total Duration ---');
    const [courseRows] = await masterPool.query(`SELECT id, name, code, total_years FROM courses WHERE id = 20 OR name = 'DAE-KKD'`);
    const [branchRows] = await masterPool.query(`SELECT id, name, code, total_years FROM course_branches WHERE id = 211 OR name = 'DAE-KKD'`);

    console.log('Current Course Record:', courseRows);
    console.log('Current Branch Record:', branchRows);

    if (isExecute) {
      await masterPool.query(`UPDATE courses SET total_years = 3, updated_at = CURRENT_TIMESTAMP WHERE id = 20 OR name = 'DAE-KKD'`);
      await masterPool.query(`UPDATE course_branches SET total_years = 3, updated_at = CURRENT_TIMESTAMP WHERE id = 211 OR name = 'DAE-KKD'`);
      console.log('✅ Updated total_years = 3 in courses and course_branches tables.');
    } else {
      console.log('🔍 [Dry-Run] Would update total_years = 3 in courses and course_branches tables.');
    }

    // 2. Fetch all 2022 batch DAE-KKD students
    console.log('\n--- Step 2: Fetching 2022 Batch DAE-KKD Students ---');
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
      WHERE (batch = '2022' OR batch LIKE '%2022%')
        AND (branch = 'DAE-KKD' OR course = 'DAE-KKD' OR branch LIKE '%DAE%' OR pin_no LIKE '%DAE/22%')
      ORDER BY id ASC
    `);

    console.log(`📋 Found ${students.length} total 2022 DAE students.`);

    const studentsToUpdate = students.filter(
      s => s.current_year !== TARGET_YEAR || s.current_semester !== TARGET_SEMESTER
    );

    console.log(`🎯 Students requiring update to ${TARGET_YEAR}-${TARGET_SEMESTER}: ${studentsToUpdate.length}`);

    if (studentsToUpdate.length === 0) {
      console.log('✅ All 2022 DAE-KKD students are already in 3-2. Nothing to do.');
      return;
    }

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

    // 3. Update student records
    let updatedCount = 0;
    let jsonErrorCount = 0;

    for (const student of studentsToUpdate) {
      let data = {};
      let hasValidJson = false;

      if (student.student_data) {
        try {
          data = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
          if (data && typeof data === 'object') {
            hasValidJson = true;
          }
        } catch (err) {
          console.warn(`⚠️ Warning: Could not parse JSON for Student ID ${student.id} (${student.admission_number}).`);
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
      console.log(`   node scripts/update_2022_dae_students_to_3_2.js --execute`);
    }
    console.log('='.repeat(70));

  } catch (err) {
    console.error('❌ Error executing migration script:', err);
  } finally {
    process.exit(0);
  }
}

run();

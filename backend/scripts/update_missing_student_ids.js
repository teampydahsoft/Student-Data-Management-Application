require('dotenv').config();
const { masterPool } = require('../config/database');

function normalizeStr(str) {
  if (!str) return '';
  return str.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function run() {
  console.log('🔍 Starting script to update missing student IDs (college_id, course_id, branch_id)...');

  try {
    // 1. Fetch reference tables
    const [colleges] = await masterPool.query('SELECT id, name, code FROM colleges WHERE is_active = 1');
    const [courses] = await masterPool.query('SELECT id, college_id, name, code FROM courses WHERE is_active = 1');
    const [branches] = await masterPool.query('SELECT id, course_id, name, code FROM course_branches WHERE is_active = 1');

    console.log(`Loaded: ${colleges.length} colleges, ${courses.length} courses, ${branches.length} branches.`);

    // 2. Fetch students missing any of the three IDs
    const [students] = await masterPool.query(`
      SELECT id, admission_number, student_name, college, college_id, course, course_id, branch, branch_id, student_data
      FROM students
      WHERE college_id IS NULL OR college_id = 0 
         OR course_id IS NULL OR course_id = 0 
         OR branch_id IS NULL OR branch_id = 0
    `);

    console.log(`Found ${students.length} students missing academic IDs.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      let currentCollegeId = student.college_id && student.college_id > 0 ? student.college_id : null;
      let currentCourseId = student.course_id && student.course_id > 0 ? student.course_id : null;
      let currentBranchId = student.branch_id && student.branch_id > 0 ? student.branch_id : null;

      let currentCollegeName = student.college || null;
      let currentCourseName = student.course || null;
      let currentBranchName = student.branch || null;

      // 1. Match College by name/code
      if (!currentCollegeId && currentCollegeName) {
        const normCol = normalizeStr(currentCollegeName);
        const colMatch = colleges.find(c => 
          normalizeStr(c.name) === normCol || 
          normalizeStr(c.code) === normCol
        );
        if (colMatch) {
          currentCollegeId = colMatch.id;
          currentCollegeName = colMatch.name;
        }
      }

      // 2. Match Course
      let courseMatch = null;
      if (!currentCourseId && currentCourseName) {
        const normCrs = normalizeStr(currentCourseName);
        // Prefer matching within the same college if known
        if (currentCollegeId) {
          courseMatch = courses.find(cr => 
            cr.college_id === currentCollegeId && 
            (normalizeStr(cr.name) === normCrs || normalizeStr(cr.code) === normCrs)
          );
        }
        // Fallback: any active course matching name/code
        if (!courseMatch) {
          courseMatch = courses.find(cr => 
            normalizeStr(cr.name) === normCrs || normalizeStr(cr.code) === normCrs
          );
        }

        if (courseMatch) {
          currentCourseId = courseMatch.id;
          currentCourseName = courseMatch.name;
          // If college was missing, derive it from course!
          if (!currentCollegeId && courseMatch.college_id) {
            currentCollegeId = courseMatch.college_id;
            const parentCol = colleges.find(c => c.id === currentCollegeId);
            if (parentCol) {
              currentCollegeName = parentCol.name;
            }
          }
        }
      } else if (currentCourseId) {
        courseMatch = courses.find(cr => cr.id === currentCourseId);
        if (courseMatch && !currentCollegeId && courseMatch.college_id) {
          currentCollegeId = courseMatch.college_id;
          const parentCol = colleges.find(c => c.id === currentCollegeId);
          if (parentCol) {
            currentCollegeName = parentCol.name;
          }
        }
      }

      // 3. Match Branch
      let branchMatch = null;
      if (!currentBranchId && currentBranchName) {
        const normBr = normalizeStr(currentBranchName);
        // Prefer matching within the course
        if (currentCourseId) {
          branchMatch = branches.find(b => 
            b.course_id === currentCourseId && 
            (normalizeStr(b.name) === normBr || (b.code && normalizeStr(b.code) === normBr))
          );
        }
        // If still not matched, check all branches
        if (!branchMatch) {
          branchMatch = branches.find(b => 
            normalizeStr(b.name) === normBr || (b.code && normalizeStr(b.code) === normBr)
          );
          if (branchMatch && !currentCourseId) {
            currentCourseId = branchMatch.course_id;
            const brCourse = courses.find(cr => cr.id === currentCourseId);
            if (brCourse) {
              currentCourseName = brCourse.name;
              if (!currentCollegeId && brCourse.college_id) {
                currentCollegeId = brCourse.college_id;
                const parentCol = colleges.find(c => c.id === currentCollegeId);
                if (parentCol) {
                  currentCollegeName = parentCol.name;
                }
              }
            }
          }
        }

        if (branchMatch) {
          currentBranchId = branchMatch.id;
          currentBranchName = branchMatch.name;
        }
      }

      // Check if we made any changes/improvements
      const hasChanges = (
        (currentCollegeId && currentCollegeId !== student.college_id) ||
        (currentCourseId && currentCourseId !== student.course_id) ||
        (currentBranchId && currentBranchId !== student.branch_id) ||
        (currentCollegeName && currentCollegeName !== student.college)
      );

      if (!hasChanges && student.college_id && student.course_id && student.branch_id) {
        skippedCount++;
        continue;
      }

      // Parse and update student_data JSON
      let studentData = {};
      try {
        if (student.student_data) {
          studentData = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
        }
      } catch (e) {
        studentData = {};
      }

      if (currentCollegeId) {
        studentData._crm_managed_college_id = String(currentCollegeId);
        studentData.college_id = currentCollegeId;
        studentData.college = currentCollegeName;
        studentData.College = currentCollegeName;
      }
      if (currentCourseId) {
        studentData._crm_managed_course_id = String(currentCourseId);
        studentData.course_id = currentCourseId;
        studentData.course = currentCourseName;
        studentData.Course = currentCourseName;
      }
      if (currentBranchId) {
        studentData._crm_managed_branch_id = String(currentBranchId);
        studentData.branch_id = currentBranchId;
        studentData.branch = currentBranchName;
        studentData.Branch = currentBranchName;
      }

      studentData.courseInfo = {
        college: currentCollegeName || studentData.courseInfo?.college,
        collegeId: currentCollegeId ? String(currentCollegeId) : studentData.courseInfo?.collegeId,
        course: currentCourseName || studentData.courseInfo?.course,
        courseId: currentCourseId ? String(currentCourseId) : studentData.courseInfo?.courseId,
        branch: currentBranchName || studentData.courseInfo?.branch,
        branchId: currentBranchId ? String(currentBranchId) : studentData.courseInfo?.branchId
      };

      const updatedJsonStr = JSON.stringify(studentData);

      await masterPool.query(`
        UPDATE students
        SET college = COALESCE(?, college),
            college_id = COALESCE(?, college_id),
            course = COALESCE(?, course),
            course_id = COALESCE(?, course_id),
            branch = COALESCE(?, branch),
            branch_id = COALESCE(?, branch_id),
            student_data = ?
        WHERE id = ?
      `, [
        currentCollegeName,
        currentCollegeId,
        currentCourseName,
        currentCourseId,
        currentBranchName,
        currentBranchId,
        updatedJsonStr,
        student.id
      ]);

      updatedCount++;
      console.log(`✅ [${student.admission_number}] ${student.student_name}: College (${currentCollegeId}: ${currentCollegeName}), Course (${currentCourseId}: ${currentCourseName}), Branch (${currentBranchId}: ${currentBranchName})`);
    }

    console.log(`\n🎉 Completed! Updated: ${updatedCount} students, Skipped: ${skippedCount} students.`);
  } catch (err) {
    console.error('❌ Script failed:', err);
  } finally {
    process.exit(0);
  }
}

run();

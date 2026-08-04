const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { masterPool } = require('../config/database');

/**
 * Script to find students in Semester 2 (Regular) who likely failed credential generation.
 * Checks for missing mobile, missing name, or missing PIN/Mobile for username.
 */
async function findFailedSem2Students() {
    let connection;

    try {
        connection = await masterPool.getConnection();
        console.log('📦 Connected to database');
        console.log('\n🔍 Checking for students with missing data (Potential Failures)...');

        // Fetch same target group
        const [students] = await connection.query(`
      SELECT s.id, s.admission_number, s.pin_no, s.student_name, s.student_mobile, s.current_semester, s.student_status
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      WHERE (s.current_semester = '2' OR s.current_semester = 2)
      AND (s.student_status = 'Regular' OR s.student_status = 'regular')
      ORDER BY s.id
    `);

        console.log(`Checking ${students.length} students...`);

        const failedStudents = [];

        for (const student of students) {
            const reasons = [];

            // Check 1: Mobile Number
            if (!student.student_mobile || student.student_mobile.trim() === '') {
                reasons.push('Missing Mobile Number');
            }

            // Check 2: Student Name
            if (!student.student_name || student.student_name.trim() === '') {
                reasons.push('Missing Student Name');
            }

            // Check 3: Username source (PIN or Mobile digits)
            let usernameCandidate = '';
            if (student.pin_no && student.pin_no.trim() !== '') {
                usernameCandidate = student.pin_no.trim();
            } else if (student.student_mobile && student.student_mobile.trim() !== '') {
                usernameCandidate = student.student_mobile.replace(/\D/g, '');
            }

            if (!usernameCandidate) {
                // This is redundant if mobile is missing, but covers "Mobile exists but no digits?" edge case
                if (!reasons.includes('Missing Mobile Number')) {
                    reasons.push('No PIN and Valid Mobile Digits for Username');
                }
            }

            if (reasons.length > 0) {
                failedStudents.push({
                    admission_number: student.admission_number,
                    name: student.student_name,
                    mobile: student.student_mobile,
                    reasons: reasons.join(', ')
                });
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`❌ Found ${failedStudents.length} students with missing data:`);
        console.log('='.repeat(60));

        if (failedStudents.length > 0) {
            console.log('Admission No | Name | Mobile | Reason');
            console.log('-'.repeat(60));
            failedStudents.forEach(s => {
                console.log(`${s.admission_number} | ${s.name || 'N/A'} | ${s.mobile || 'N/A'} | ${s.reasons}`);
            });
        } else {
            console.log("✅ No obvious data issues found. If you had failures, check logs for DB errors.");
        }
        console.log('='.repeat(60));


    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        if (connection) {
            connection.release();
        }
        process.exit(0);
    }
}

findFailedSem2Students();

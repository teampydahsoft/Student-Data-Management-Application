const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { masterPool } = require('../config/database');
const xlsx = require('xlsx');
const fs = require('fs');

/**
 * Script to find students in Semester 2 (Regular) who likely failed credential generation
 * and export their details to an Excel file.
 */
async function exportFailedSem2Students() {
    let connection;

    try {
        connection = await masterPool.getConnection();
        console.log('📦 Connected to database');
        console.log('\n🔍 Fetching failed students and generating Excel...');

        // Fetch same target group with additional details
        // We assume columns 'college', 'course', 'branch' exist on students table based on controller mapping
        const [students] = await connection.query(`
      SELECT 
        s.id, 
        s.admission_number, 
        s.pin_no, 
        s.student_name, 
        s.student_mobile, 
        s.college, 
        s.course, 
        s.branch,
        s.current_semester, 
        s.student_status
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      WHERE (s.current_semester = '2' OR s.current_semester = 2)
      AND (s.student_status = 'Regular' OR s.student_status = 'regular')
      ORDER BY s.college, s.course, s.branch, s.id
    `);

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

            // Check 3: Username source
            let usernameCandidate = '';
            if (student.pin_no && student.pin_no.trim() !== '') {
                usernameCandidate = student.pin_no.trim();
            } else if (student.student_mobile && student.student_mobile.trim() !== '') {
                usernameCandidate = student.student_mobile.replace(/\D/g, '');
            }

            if (!usernameCandidate) {
                if (!reasons.includes('Missing Mobile Number')) {
                    reasons.push('No PIN and Valid Mobile Digits');
                }
            }

            if (reasons.length > 0) {
                failedStudents.push({
                    'College': student.college || 'N/A',
                    'Course': student.course || 'N/A',
                    'Branch': student.branch || 'N/A',
                    'Student Name': student.student_name || 'N/A',
                    'Pin Number': student.pin_no || 'N/A',
                    'Admission Number': student.admission_number,
                    'Reason': reasons.join(', ')
                });
            }
        }

        if (failedStudents.length > 0) {
            // Create Workbook
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(failedStudents);

            // Auto-width columns (heuristic)
            const colWidths = [
                { wch: 15 }, // College
                { wch: 10 }, // Course
                { wch: 15 }, // Branch
                { wch: 30 }, // Name
                { wch: 15 }, // Pin
                { wch: 15 }, // Admission
                { wch: 40 }  // Reason
            ];
            ws['!cols'] = colWidths;

            xlsx.utils.book_append_sheet(wb, ws, 'Failed Students');

            // Write to file
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `failed_students_${dateStr}.xlsx`;
            const filePath = path.join(__dirname, '..', fileName);

            xlsx.writeFile(wb, filePath);

            console.log(`\n✅ Successfully exported ${failedStudents.length} failed students.`);
            console.log(`📁 File created: ${filePath}`);
        } else {
            console.log('\n✅ No failed students found to export.');
        }

    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        if (connection) {
            connection.release();
        }
        process.exit(0);
    }
}

exportFailedSem2Students();

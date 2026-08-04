require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { masterPool } = require('../config/database');

async function checkStudentPasswordStatus() {
    let connection;
    try {
        connection = await masterPool.getConnection();
        console.log('📦 Connected to database');

        // Query to get counts for 'Regular' students
        // Using UPPER to be case-insensitive just in case, though usually it is capitalized as 'Regular'
        const query = `
      SELECT 
        COUNT(*) as total_regular_students,
        COUNT(sc.id) as students_with_password,
        (COUNT(*) - COUNT(sc.id)) as students_without_password
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      LEFT JOIN student_credentials sc ON s.id = sc.student_id
      WHERE s.student_status = 'Regular'
    `;

        const [rows] = await connection.query(query);
        const result = rows[0];

        console.log('\n📊 Student Password Status (Status: Regular)');
        console.log('============================================');
        console.log(`Total Regular Students:     ${result.total_regular_students}`);
        console.log(`✅ Have Password:           ${result.students_with_password}`);
        console.log(`❌ Missing Password:        ${result.students_without_password}`);
        console.log('============================================\n');

        if (result.students_without_password > 0) {
            console.log('Fetching detailed breakdown of students without password...\n');

            const missingQuery = `
            SELECT s.admission_number, s.student_name, s.student_mobile, s.current_year, s.branch, s.college, s.batch
            FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
            LEFT JOIN student_credentials sc ON s.id = sc.student_id
            WHERE s.student_status = 'Regular' AND sc.id IS NULL
            ORDER BY s.college, s.branch, s.current_year
            LIMIT 1000;
        `;

            const [missingRows] = await connection.query(missingQuery);

            if (missingRows.length > 0) {
                const fs = require('fs');
                let output = `List of students without password (Total: ${missingRows.length}):\n`;
                output += '--------------------------------------------------------------------------------------------------------------------------\n';
                output += String('Admission No').padEnd(15) +
                    String('Name').padEnd(30) +
                    String('Mobile').padEnd(15) +
                    String('Year').padEnd(8) +
                    String('Branch').padEnd(10) +
                    String('Batch').padEnd(10) +
                    String('College').padEnd(30) + '\n';
                output += '--------------------------------------------------------------------------------------------------------------------------\n';

                missingRows.forEach(row => {
                    output += String(row.admission_number || '').padEnd(15) +
                        String((row.student_name || '').substring(0, 28)).padEnd(30) +
                        String(row.student_mobile || '').padEnd(15) +
                        String(row.current_year || '').padEnd(8) +
                        String(row.branch || '').padEnd(10) +
                        String(row.batch || '').padEnd(10) +
                        String(row.college || '').padEnd(30) + '\n';
                });
                output += '--------------------------------------------------------------------------------------------------------------------------\n';

                fs.writeFileSync('missing_students.txt', output);
                console.log('✅ Output written to missing_students.txt');
                console.log('\nMissing Students (showing up to 20 rows):');
                console.table(missingRows.slice(0, 20));

                if (result.students_without_password > 1000) {
                    console.log(`... and ${result.students_without_password - 1000} more.`);
                }
            }
        }

        console.log('\n============================================');
        console.log('RECAP:');
        console.log(`Total Regular Students:     ${result.total_regular_students}`);
        console.log(`✅ Have Password:           ${result.students_with_password}`);
        console.log(`❌ Missing Password:        ${result.students_without_password}`);
        console.log('============================================\n');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

checkStudentPasswordStatus();

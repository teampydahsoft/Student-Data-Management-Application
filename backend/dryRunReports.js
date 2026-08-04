const { masterPool } = require('./config/database');
const { getAllNotificationUsers, filterAttendanceByUserScope } = require('./services/getUserScopeAttendance');
require('dotenv').config();

async function dryRun() {
    console.log('🔍 Starting COMPREHENSIVE Dry Run for Attendance Reports...');
    console.log('--------------------------------------------------');
    
    try {
        const attendanceDate = new Date().toISOString().split('T')[0];
        console.log(`📅 Date: ${attendanceDate}`);

        // 1. Fetch Global Data (matching schedulerService.js grouping)
        const [groupedRows] = await masterPool.query(`
            SELECT 
                s.college AS college,
                s.course AS course,
                s.branch AS branch,
                COUNT(*) AS total_students
            FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
            WHERE s.student_status = 'Regular'
            GROUP BY s.college, s.course, s.branch
        `);

        console.log(`\n📊 System has ${groupedRows.length} College/Course groups.`);

        // 2. Fetch Users via Centralized Service (Refactored to include AOs)
        const { principals, aos } = await getAllNotificationUsers();
        const notificationRecipients = [...principals, ...aos];

        console.log(`👤 Found ${notificationRecipients.length} recipients (AOs: ${aos.length}, Principals: ${principals.length})`);
        
        // 3. Simulate Splitting Logic
        console.log('\n🚀 Simulation Results (RBAC Scope + Report Splitting):');
        console.log('==================================================');

        for (const user of notificationRecipients) {
            console.log(`\nUser: ${user.name} | Role: ${user.role} | Email: ${user.email}`);
            console.log(`Authorized Colleges: ${user.collegeNames.join(', ')}`);
            console.log(`Authorized Courses: ${user.allCourses ? 'All Courses' : user.courseNames.join(', ') || 'None'}`);
            console.log(`Authorized Branches: ${user.allBranches ? 'All Branches' : user.branchNames.join(', ') || 'None'}`);

            const authorizedRows = filterAttendanceByUserScope(groupedRows, user);

            if (authorizedRows.length > 0) {
                const isDiplomaRow = (row) => {
                    const isDiplomaCourse = (row.course || '').toLowerCase().includes('diploma') || 
                                          (row.course || '').startsWith('DAP') || 
                                          (row.course || '').startsWith('DAE');
                    const isPolytechnicCollege = (row.college || '').toLowerCase().includes('polytechnic') || 
                                               row.college === 'Diploma College';
                    return isDiplomaCourse || isPolytechnicCollege;
                };

                const diplomaRows = authorizedRows.filter(r => isDiplomaRow(r));
                const mainstreamRows = authorizedRows.filter(r => !isDiplomaRow(r));

                const hasPceMain = mainstreamRows.some(r => r.college === 'Pydah College of Engineering');
                const hasAnyDiploma = diplomaRows.length > 0;

                if (hasPceMain && hasAnyDiploma) {
                    console.log('✅ MULTIPLE EMAILS DETECTED (Split for Engineering vs Diploma)');
                    console.log('  📧 Email 1 (Engineering):');
                    mainstreamRows.forEach(r => console.log(`     - [${r.college}] ${r.course}`));
                    console.log('  📧 Email 2 (Diploma):');
                    diplomaRows.forEach(r => console.log(`     - [${r.college}] ${r.course}`));
                } else {
                    console.log('✅ SINGLE EMAIL:');
                    authorizedRows.forEach(r => {
                        const isSpecial = isDiplomaRow(r) && !user.collegeNames.includes(r.college);
                        console.log(`   - [${r.college}] ${r.course} ${isSpecial ? '(Mapped via Diploma Rule)' : ''}`);
                    });
                }
            } else {
                console.log('❌ No reports matched for this user\'s scope.');
            }
        }
        console.log('\n==================================================');

    } catch (error) {
        console.error('❌ Dry run failed:', error);
    } finally {
        await masterPool.end();
    }
}

dryRun();

const cron = require('node-cron');
const { masterPool } = require('../config/database');
const { sendBrevoEmail } = require('../utils/emailService');
const { checkAndSendBirthdayNotifications } = require('./birthdayNotificationService');
const { createBroadcastNotification } = require('./notificationService');
const { getNonWorkingDayInfo } = require('./nonWorkingDayService');
const { getAllNotificationUsers, filterAttendanceByUserScope } = require('./getUserScopeAttendance');

// Helper to check if a form falls due today based on recurrence config
const isFormDue = (form, today) => {
    try {
        const config = JSON.parse(form.recurrence_config);
        if (!config || !config.enabled) return false;

        const recurrenceType = config.frequency; // daily, weekly, monthly
        const interval = parseInt(config.interval) || 1;

        const createdAt = new Date(form.created_at);
        const todayDate = new Date(today);

        // Normalize time to midnight
        createdAt.setHours(0, 0, 0, 0);
        todayDate.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(todayDate - createdAt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (recurrenceType === 'daily') {
            return diffDays % interval === 0;
        } else if (recurrenceType === 'weekly') {
            const currentDay = todayDate.getDay(); // 0 (Sun) - 6 (Sat)
            // Frontend days: 1 (Mon) - 7 (Sun)
            const adjustedDay = currentDay === 0 ? 7 : currentDay;
            if (!config.days || !config.days.includes(adjustedDay)) return false;

            const diffWeeks = Math.floor(diffDays / 7);
            return diffWeeks % interval === 0;
        } else if (recurrenceType === 'monthly') {
            const currentDayOfMonth = todayDate.getDate();
            // Assuming created date's day as anchor if not specified, or 1st?
            // Or config.days usually not used for monthly.
            // If today matches creation day?
            if (currentDayOfMonth !== createdAt.getDate()) return false;

            const monthsDiff = (todayDate.getFullYear() - createdAt.getFullYear()) * 12 + (todayDate.getMonth() - createdAt.getMonth());
            return monthsDiff % interval === 0;
        }
        return false;

    } catch (e) {
        console.error('Error checking recurrence for form:', form.form_id, e);
        return false;
    }
};

const checkAndResendRecurringForms = async () => {
    console.log('⏰ Checking for recurring feedback forms...');
    try {
        const today = new Date();
        const [forms] = await masterPool.query(
            "SELECT * FROM forms WHERE is_active = 1 AND recurrence_config IS NOT NULL"
        );

        for (const form of forms) {
            if (isFormDue(form, today)) {
                console.log(`🚀 Form ${form.form_name} (${form.form_id}) is due for resending.`);
                // Send notification to all Regular students
                // Optimization: In production, batch this or use specific target groups
                const [students] = await masterPool.query("SELECT id FROM students WHERE student_status = 'Regular'");
                const studentIds = students.map(s => s.id);

                await createBroadcastNotification(studentIds, {
                    title: 'Feedback Form Reminder',
                    message: `Please complete the feedback form: ${form.form_name}`,
                    category: 'Feedback'
                });
                console.log(`✅ Sent notification for form ${form.form_name} to ${studentIds.length} students.`);
            }
        }
    } catch (error) {
        console.error('❌ Error in checkAndResendRecurringForms:', error);
    }
};

// Helper to get today's date in YYYY-MM-DD format (IST)
const getTodayDate = () => {
    const today = new Date();
    return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
};

/**
 * Generate Report HTML
 */
/**
 * Generate Report HTML with Multiple Tables (Grouped by College)
 */
const generateReportHtml = (rows, title, attendanceDate) => {
    // Group rows by college
    const rowsByCollege = rows.reduce((acc, row) => {
        const college = row.college || 'Unknown College';
        if (!acc[college]) acc[college] = [];
        acc[college].push(row);
        return acc;
    }, {});

    const colleges = Object.keys(rowsByCollege).sort();

    // Calculate Global Totals
    let globalStats = {
        totalStudents: 0,
        totalPresent: 0,
        totalAbsent: 0,
        totalHoliday: 0,
        totalMarked: 0,
        totalUnmarked: 0
    };

    rows.forEach(row => {
        globalStats.totalStudents += Number(row.total_students) || 0;
        globalStats.totalPresent += Number(row.present) || 0;
        globalStats.totalAbsent += Number(row.absent) || 0;
        globalStats.totalHoliday += Number(row.holiday) || 0;
    });
    globalStats.totalMarked = globalStats.totalPresent + globalStats.totalAbsent + globalStats.totalHoliday;
    globalStats.totalUnmarked = Math.max(0, globalStats.totalStudents - globalStats.totalMarked);

    // Generate Tables for each college
    const collegeTables = colleges.map(college => {
        const collegeRows = rowsByCollege[college];

        let collegeStats = {
            totalStudents: 0,
            present: 0,
            absent: 0,
            holiday: 0,
            marked: 0,
            unmarked: 0
        };

        const tableBody = collegeRows.map(row => {
            const rowTotal = Number(row.total_students) || 0;
            const rowPresent = Number(row.present) || 0;
            const rowAbsent = Number(row.absent) || 0;
            const rowHoliday = Number(row.holiday) || 0;
            const rowMarked = rowPresent + rowAbsent + rowHoliday;
            const rowUnmarked = Math.max(0, rowTotal - rowMarked);

            collegeStats.totalStudents += rowTotal;
            collegeStats.present += rowPresent;
            collegeStats.absent += rowAbsent;
            collegeStats.holiday += rowHoliday;
            collegeStats.marked += rowMarked;
            collegeStats.unmarked += rowUnmarked;

            const timeStamp = row.last_updated
                ? new Date(row.last_updated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                : '-';

            // Calculate Attendance % for the row
            const attPercent = rowTotal > 0 ? ((rowPresent / rowTotal) * 100).toFixed(1) + '%' : '0.0%';

            return `
                <tr>
                    <td style="padding: 4px; border: 1px solid #ddd;">${row.batch || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #ddd;">${row.course || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #ddd;">${row.branch || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: center;">${row.year || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: center;">${row.semester || '-'}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${rowTotal}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${rowPresent}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${rowAbsent}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${rowMarked}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${rowUnmarked}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: right;">${attPercent}</td>
                    <td style="padding: 4px; border: 1px solid #ddd; text-align: center;">${timeStamp}</td>
                </tr>
            `;
        }).join('');

        return `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #444; border-bottom: 2px solid #ddd; padding-bottom: 5px; margin-bottom: 10px;">${college}</h3>
                
                <div style="margin-bottom: 10px; font-size: 11px; background: #f8f9fa; padding: 5px; border-radius: 4px;">
                    <strong>Summary:</strong> 
                    Total: ${collegeStats.totalStudents} | 
                    Marked: ${collegeStats.marked} | 
                    <span style="color: green;">Present: ${collegeStats.present}</span> | 
                    <span style="color: red;">Absent: ${collegeStats.absent}</span> | 
                    <span style="color: orange;">Pending: ${collegeStats.unmarked}</span>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 10%;">Batch</th>
                            <th style="width: 20%;">Course</th>
                            <th style="width: 15%;">Branch</th>
                            <th style="width: 5%;">Yr</th>
                            <th style="width: 5%;">Sem</th>
                            <th style="width: 7%; text-align: right;">Total</th>
                            <th style="width: 7%; text-align: right;">Pres</th>
                            <th style="width: 7%; text-align: right;">Abs</th>
                            <th style="width: 7%; text-align: right;">Mkrd</th>
                            <th style="width: 7%; text-align: right;">Pend</th>
                            <th style="width: 7%; text-align: right;">%</th>
                            <th style="width: 10%; text-align: center;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBody}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
                .header { background-color: #f8f9fa; padding: 10px; border-bottom: 2px solid #007bff; margin-bottom: 15px; }
                .title { font-size: 18px; font-weight: bold; color: #007bff; margin: 0; }
                .subtitle { font-size: 12px; color: #666; margin: 5px 0 0; }
                .stats-box { display: flex; gap: 15px; margin-bottom: 15px; background: #e9ecef; padding: 10px; border-radius: 6px; }
                .stat { font-weight: bold; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th { background-color: #343a40; color: white; padding: 6px; text-align: left; }
                .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 class="title">${title}</h1>
                <p class="subtitle">Date: ${attendanceDate} | Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>

            <div class="stats-box">
                <span class="stat">Global Total: ${globalStats.totalStudents}</span>
                <span class="stat">Marked: ${globalStats.totalMarked}</span>
                <span class="stat" style="color: green;">Present: ${globalStats.totalPresent}</span>
                <span class="stat" style="color: red;">Absent: ${globalStats.totalAbsent}</span>
                <span class="stat" style="color: orange;">Pending: ${globalStats.totalUnmarked}</span>
            </div>

            ${collegeTables}

            <div class="footer">
                This is an automated report sent at 4:00 PM IST.
            </div>
        </body>
        </html>
    `;
};

/**
 * Mark pending (unmarked) students as pending attendance for the given date.
 * - Excluded courses and excluded students (attendance_config) are NOT touched; they remain as-is.
 * - Only Regular + in-scope students (i.e. not in excluded courses / excluded students) who are
 *   still unmarked (no attendance_record for this date) are marked pending.
 * Runs before sending 4 PM reports.
 */
const markPendingStudentsAsPending = async (attendanceDate, excludedCourses, excludedStudents) => {
    try {
        // Excluded courses: we never touch them; students in these courses are left unchanged.
        let excludeCourseClause = '';
        let excludeStudentClause = '';
        const params = [attendanceDate, attendanceDate];
        if (excludedCourses && excludedCourses.length > 0) {
            excludeCourseClause = ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
            params.push(...excludedCourses);
        }
        if (excludedStudents && excludedStudents.length > 0) {
            excludeStudentClause = ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
            params.push(...excludedStudents);
        }

        // Only: Regular + in-scope (non-excluded) + unmarked (no record for this date) → mark pending.
        // marked_by NULL = system/4PM auto-mark.
        const [result] = await masterPool.query(
            `INSERT INTO attendance_records (student_id, admission_number, attendance_date, \`year\`, semester, status, marked_by)
             SELECT s.id, s.admission_number, ?, s.current_year, s.current_semester, 'pending', NULL
             FROM students s
             LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.attendance_date = ?
             WHERE s.student_status = 'Regular'
               AND ar.id IS NULL
             ${excludeCourseClause}
             ${excludeStudentClause}`,
            params
        );

        const affected = result.affectedRows || 0;
        if (affected > 0) {
            console.log(`✅ Marked ${affected} unmarked student(s) as pending attendance for ${attendanceDate} before sending reports.`);
        }
        return affected;
    } catch (err) {
        // If year/semester columns don't exist, retry without them (same exclusion rules apply)
        if (err.code === 'ER_BAD_FIELD_ERROR' && (err.sqlMessage || '').match(/'year'|'semester'/)) {
            let excludeCourseClause = '';
            let excludeStudentClause = '';
            const params = [attendanceDate, attendanceDate];
            if (excludedCourses && excludedCourses.length > 0) {
                excludeCourseClause = ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
                params.push(...excludedCourses);
            }
            if (excludedStudents && excludedStudents.length > 0) {
                excludeStudentClause = ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
                params.push(...excludedStudents);
            }
            // Same rule: only Regular + in-scope + pending; excluded courses/students untouched
            const [result] = await masterPool.query(
                `INSERT INTO attendance_records (student_id, admission_number, attendance_date, status, marked_by)
                 SELECT s.id, s.admission_number, ?, 'pending', NULL
                 FROM students s
                 LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.attendance_date = ?
                 WHERE s.student_status = 'Regular'
                   AND ar.id IS NULL
                 ${excludeCourseClause}
                 ${excludeStudentClause}`,
                params
            );
            const affected = result.affectedRows || 0;
            if (affected > 0) {
                console.log(`✅ Marked ${affected} unmarked student(s) as pending attendance for ${attendanceDate} (no year/semester).`);
            }
            return affected;
        }
        throw err;
    }
};

/**
 * Send Daily Attendance Reports (Super Admin + AOs)
 * Runs at 4 PM IST.
 * Before sending: marks any unmarked students as pending attendance for the day.
 * Sends global report to all active users with role super_admin (by email).
 */
const sendDailyAttendanceReports = async () => {
    try {
        console.log('⏳ Starting Daily Attendance Report generation...');

        const attendanceDate = getTodayDate();

        // 0. Fetch Excluded Courses/Students Config
        let excludedCourses = [];
        let excludedStudents = [];
        try {
            const [settings] = await masterPool.query(
                'SELECT value FROM settings WHERE `key` = ?',
                ['attendance_config']
            );
            if (settings && settings.length > 0) {
                const config = JSON.parse(settings[0].value);
                if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
                if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
            }
        } catch (err) {
            console.warn('Failed to fetch attendance config for daily report:', err);
        }

        // 0.5. Mark unmarked students as pending attendance before sending reports
        // Skip auto-marking on Sundays and holidays (non-working days)
        try {
            const nonWorkingInfo = await getNonWorkingDayInfo(attendanceDate);
            if (nonWorkingInfo && nonWorkingInfo.isNonWorkingDay) {
                const reasons = (nonWorkingInfo.reasons || []).join(', ') || 'non-working day';
                console.log(`⏭️ Skipping auto-pending marking for ${attendanceDate} — it is a ${reasons}.`);
            } else {
                await markPendingStudentsAsPending(attendanceDate, excludedCourses, excludedStudents);
            }
        } catch (err) {
            console.error('❌ Failed to mark unmarked students as pending attendance:', err);
            // Continue to send reports with current data
        }

        // 1. Fetch Day End Report Data (Grouped Summary) with Exclusions
        let query = `
              SELECT 
                s.college AS college,
                s.batch AS batch,
                s.course AS course,
                s.branch AS branch,
                s.current_year AS year,
                s.current_semester AS semester,
                COUNT(*) AS total_students,
                SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN ar.status = 'holiday' THEN 1 ELSE 0 END) AS holiday,
                SUM(CASE WHEN ar.status = 'pending' OR ar.id IS NULL THEN 1 ELSE 0 END) AS pending,
                DATE_FORMAT(MAX(ar.updated_at), '%Y-%m-%dT%H:%i:%s+05:30') AS last_updated
              FROM students s
              LEFT JOIN attendance_records ar 
                ON ar.student_id = s.id 
                AND ar.attendance_date = ?
              WHERE s.student_status = 'Regular'
        `;
        const params = [attendanceDate];

        // Apply Exclusions
        if (excludedCourses.length > 0) {
            query += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
            params.push(...excludedCourses);
        }

        if (excludedStudents.length > 0) {
            query += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
            params.push(...excludedStudents);
        }

        query += `
              GROUP BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
              ORDER BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
        `;

        const [groupedRows] = await masterPool.query(query, params);

        // 2. Send Super Admin Report (Global) to all users with role super_admin
        const globalHtml = generateReportHtml(groupedRows, 'Day End Attendance Report (Global)', attendanceDate);

        const [superAdmins] = await masterPool.query(
            `SELECT id, name, email FROM rbac_users 
             WHERE role = 'super_admin' AND is_active = 1 AND email IS NOT NULL AND TRIM(email) != ''`
        );

        console.log(`ℹ️ Found ${superAdmins.length} active Super Admin(s) to notify.`);
        for (const admin of superAdmins) {
            const toEmail = (admin.email || '').trim().toLowerCase();
            if (!toEmail) continue;
            try {
                console.log(`📧 Sending Super Admin report to ${admin.name} (${toEmail})`);
                const adminEmailResult = await sendBrevoEmail({
                    to: toEmail,
                    toName: admin.name || 'Super Admin',
                    subject: `Day End Attendance Report (Global) - ${attendanceDate}`,
                    htmlContent: globalHtml
                });
                if (adminEmailResult.success) {
                    console.log(`✅ Super Admin report sent to ${admin.name} (${toEmail}).`);
                } else {
                    console.error(`❌ Failed to send to ${toEmail}:`, adminEmailResult.message);
                }
            } catch (err) {
                console.error(`❌ Error sending Super Admin report to ${toEmail}:`, err.message);
            }
        }

        // 3. Send AO and Principal Reports (College Specific with RBAC Scope)
        const { principals, aos } = await getAllNotificationUsers();
        const notificationRecipients = [...principals, ...aos];

        console.log(`ℹ️ Found ${notificationRecipients.length} active AOs and Principals to notify.`);

        for (const user of notificationRecipients) {
            // Step 1: Filter global rows based on user's authorized access scope
            const authorizedRows = filterAttendanceByUserScope(groupedRows, user);

            if (authorizedRows.length > 0) {
                // Step 2: Determine if we need to split reports (e.g., PCE Engineering vs PCE Diploma)
                
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

                const sendReport = async (rows, typeLabel) => {
                    const collegeDisplay = user.collegeNames[0] || 'College';
                    const titlePrefix = typeLabel ? `${typeLabel} - ` : '';
                    const html = generateReportHtml(rows, `Day End Attendance Report - ${titlePrefix}${collegeDisplay}`, attendanceDate);
                    
                    console.log(`📧 Sending ${typeLabel || 'Regular'} report to ${user.email} (${user.role})`);
                    await sendBrevoEmail({
                        to: user.email,
                        toName: user.name || 'User',
                        subject: `Day End Attendance Report - ${typeLabel ? typeLabel + ' - ' : ''}${attendanceDate}`,
                        htmlContent: html
                    });
                };

                // Logic for splitting Pydah College of Engineering reports due to heavy strength
                const hasPceMain = mainstreamRows.some(r => r.college === 'Pydah College of Engineering');
                const hasAnyDiploma = diplomaRows.length > 0;

                if (hasPceMain && hasAnyDiploma) {
                    // Send separate emails for Engineering and Diploma/Polytechnic categories
                    await sendReport(mainstreamRows, 'Engineering');
                    await sendReport(diplomaRows, 'Diploma');
                } else {
                    // Send as one consolidated email if no splitting is needed or if it's only one category
                    await sendReport(authorizedRows, '');
                }
            } else {
                console.log(`⚠️ No data found within scope for ${user.role} ${user.email}, skipping.`);
            }
        }

    } catch (error) {
        console.error('❌ Error generating Daily Attendance Reports:', error);
    }
};

const initScheduledJobs = () => {
    console.log('🕒 Initializing Scheduled Jobs...');

    // Schedule for 4:00 PM IST
    cron.schedule('0 16 * * *', () => {
        console.log('⏰ Triggering 4 PM Scheduled Task...');
        sendDailyAttendanceReports();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log('✅ 4 PM Daily Attendance Report scheduled.');

    // Schedule Birthday Check for 12:00 AM IST (midnight)
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ Triggering 12 AM IST Birthday Check...');
        try {
            await checkAndSendBirthdayNotifications();
        } catch (err) {
            console.error("❌ Scheduled birthday check failed:", err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log('✅ 12 AM IST Birthday Check (push + SMS) scheduled.');

    // Schedule Feedback Form Resend Check for 9:00 AM IST
    cron.schedule('0 9 * * *', async () => {
        console.log('⏰ Triggering 9 AM IST Feedback Form Check...');
        try {
            await checkAndResendRecurringForms();
        } catch (err) {
            console.error("❌ Scheduled feedback form check failed:", err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log('✅ 9 AM IST Feedback Form Check scheduled.');
};

module.exports = {
    initScheduledJobs,
    sendDailyAttendanceReports: sendDailyAttendanceReports // Export for testing
};

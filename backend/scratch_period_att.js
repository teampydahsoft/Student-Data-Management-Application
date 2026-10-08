const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectPeriodLogs() {
    const academicConfig = {
        host: process.env.ACADEMIC_DB_HOST || process.env.DB_HOST,
        user: process.env.ACADEMIC_DB_USER || process.env.DB_USER,
        password: process.env.ACADEMIC_DB_PASSWORD || process.env.DB_PASSWORD,
        database: process.env.ACADEMIC_DB_NAME || 'academic_portal',
        port: process.env.ACADEMIC_DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    };

    let conn;
    try {
        conn = await mysql.createConnection(academicConfig);
        console.log('--- SAMPLE PERIOD-WISE ATTENDANCE LOGS FOR ALL STUDENTS ---');

        const [rows] = await conn.query(`
            SELECT 
                aps.id as record_id,
                aps.attendance_post_id,
                aps.student_db_id,
                aps.admission_number,
                LOWER(aps.status) as status,
                DATE_FORMAT(cs.session_date, '%Y-%m-%d') as attendance_date,
                cs.day_of_week,
                cs.period_slot_id,
                cs.timing_slot_id,
                cs.start_time,
                cs.end_time,
                cs.subject_code,
                cs.subject_name,
                sl.display_name as faculty_name
            FROM ap_attendance_post_students aps
            JOIN ap_attendance_posts ap ON aps.attendance_post_id = ap.id
            JOIN ap_class_sessions cs ON ap.class_session_id = cs.id
            LEFT JOIN ap_staff_link sl ON sl.id = cs.faculty_staff_link_id
            LIMIT 15
        `);
        console.log(JSON.stringify(rows, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (conn) await conn.end();
    }
}

inspectPeriodLogs();

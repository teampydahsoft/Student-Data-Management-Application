const mysql = require('mysql2/promise');
require('dotenv').config();

async function testFetchAcademicTimetable() {
    const academicConfig = {
        host: process.env.ACADEMIC_DB_HOST || process.env.DB_HOST,
        user: process.env.ACADEMIC_DB_USER || process.env.DB_USER,
        password: process.env.ACADEMIC_DB_PASSWORD || process.env.DB_PASSWORD,
        database: process.env.ACADEMIC_DB_NAME || 'academic_portal',
        port: process.env.ACADEMIC_DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    };

    const conn = await mysql.createConnection(academicConfig);

    // Let's test finding plans for branch_id 41 (or any published plan)
    const [plans] = await conn.query(
        `SELECT * FROM ap_timetable_plans ORDER BY id DESC LIMIT 5`
    );
    console.log('--- LATEST TIMETABLE PLANS ---');
    console.log(plans);

    if (plans.length > 0) {
        const plan = plans[0];
        console.log(`\nFetching entries for Plan ID ${plan.id} (Branch: ${plan.branch_id}, Yr: ${plan.year_of_study}, Sem: ${plan.semester_number}):`);
        
        const [entries] = await conn.query(
            `SELECT te.*, 
                    ts.label as slot_label, ts.start_time, ts.end_time, ts.slot_order
             FROM ap_timetable_entries te
             LEFT JOIN ap_timing_template_slots ts ON (ts.id = te.period_slot_id OR ts.id = te.timing_slot_id)
             WHERE te.plan_id = ?
             ORDER BY te.day_of_week, ts.slot_order`,
            [plan.id]
        );
        console.log(`Found ${entries.length} entries:`);
        console.log(JSON.stringify(entries.slice(0, 5), null, 2));

        // Fetch slots for this plan's timing_template_id
        if (plan.timing_template_id) {
            const [slots] = await conn.query(
                `SELECT DISTINCT slot_order, label as slot_name, MIN(start_time) as start_time, MAX(end_time) as end_time, slot_type
                 FROM ap_timing_template_slots
                 WHERE template_id = ? AND is_active = 1
                 GROUP BY slot_order, label, slot_type
                 ORDER BY slot_order`,
                [plan.timing_template_id]
            );
            console.log(`\nFound ${slots.length} timing template slots:`);
            console.log(JSON.stringify(slots, null, 2));
        }
    }

    await conn.end();
}

testFetchAcademicTimetable();

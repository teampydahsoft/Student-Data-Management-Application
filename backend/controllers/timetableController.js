const { masterPool, academicPool } = require('../config/database');

exports.list = async (req, res) => {
    try {
        const { branch_id, year, semester, faculty_id } = req.query;

        // 1. Try querying Academic Portal DB (ap_timetable_plans & ap_timetable_entries)
        if (year && semester) {
            try {
                let plans = [];
                if (branch_id) {
                    [plans] = await academicPool.query(
                        `SELECT id, timing_template_id, batch, year_of_study, semester_number
                         FROM ap_timetable_plans
                         WHERE branch_id = ? AND year_of_study = ? AND semester_number = ?
                         ORDER BY (status = 'published') DESC, version_no DESC, id DESC
                         LIMIT 1`,
                        [branch_id, year, semester]
                    );
                }

                if (!plans || plans.length === 0) {
                    [plans] = await academicPool.query(
                        `SELECT id, timing_template_id, batch, year_of_study, semester_number
                         FROM ap_timetable_plans
                         WHERE year_of_study = ? AND semester_number = ?
                         ORDER BY (status = 'published') DESC, version_no DESC, id DESC
                         LIMIT 1`,
                        [year, semester]
                    );
                }

                if (plans && plans.length > 0) {
                    const planId = plans[0].id;
                    const [apRows] = await academicPool.query(
                        `SELECT 
                            e.*,
                            sl.display_name as faculty_name,
                            sl.display_name as teacher_name,
                            sl.display_name as faculty,
                            sl.display_name as staff_name,
                            ts.slot_order,
                            COALESCE(ts.slot_order, e.period_slot_id, e.timing_slot_id) as slot_order_id,
                            ts.label as slot_label,
                            ts.start_time,
                            ts.end_time,
                            COALESCE(e.entry_type, 'subject') as type,
                            COALESCE(e.span, 1) as span
                         FROM ap_timetable_entries e
                         LEFT JOIN ap_timing_template_slots ts ON (ts.id = e.period_slot_id OR ts.id = e.timing_slot_id)
                         LEFT JOIN ap_staff_link sl ON sl.id = e.faculty_staff_link_id
                         WHERE e.plan_id = ?
                         ORDER BY e.day_of_week, ts.slot_order`,
                        [planId]
                    );

                    if (apRows.length > 0) {
                        return res.json({ success: true, data: apRows, source: 'academic_portal' });
                    }
                }
            } catch (apErr) {
                console.warn('Academic Portal DB timetable fetch notice:', apErr.message);
            }
        }

        // 2. Fallback to SDMS Master DB (student_database)
        let query = `SELECT te.*, s.name as subject_name, s.code as subject_code, b.name as branch_name
                     FROM timetable_entries te
                     LEFT JOIN subjects s ON s.id = te.subject_id
                     LEFT JOIN course_branches b ON b.id = te.branch_id`;
        let params = [];
        let conditions = [];

        if (branch_id && year && semester) {
            conditions.push(`te.branch_id = ? AND te.year_of_study = ? AND te.semester_number = ?`);
            params.push(branch_id, year, semester);
        } else if (faculty_id) {
            conditions.push(`te.subject_id IN (SELECT subject_id FROM faculty_subjects WHERE rbac_user_id = ?)`);
            params.push(faculty_id);
        } else {
            return res.status(400).json({ success: false, message: 'branch context or faculty_id is required' });
        }

        query += ` WHERE ` + conditions.join(' AND ') + ` ORDER BY te.day_of_week, te.period_slot_id`;
        const [rows] = await masterPool.query(query, params);

        res.json({ success: true, data: rows, source: 'master' });
    } catch (error) {
        console.error('timetable list error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch timetable' });
    }
};

exports.updateBulk = async (req, res) => {
    try {
        const { branch_id, year, semester, entries } = req.body;
        if (!branch_id || !year || !semester || !Array.isArray(entries)) {
            return res.status(400).json({ success: false, message: 'branch_id, year, semester, and entries array are required' });
        }

        // Use a transaction for bulk update
        const connection = await masterPool.getConnection();
        await connection.beginTransaction();

        try {
            // Option 1: Delete existing for this context and re-insert
            await connection.query(
                'DELETE FROM timetable_entries WHERE branch_id = ? AND year_of_study = ? AND semester_number = ?',
                [branch_id, year, semester]
            );

            if (entries.length > 0) {
                const values = entries.map(e => [
                    branch_id,
                    year,
                    semester,
                    e.day_of_week,
                    e.period_slot_id,
                    e.subject_id || null,
                    e.type || 'subject',
                    e.custom_label || null,
                    e.span || 1
                ]);

                await connection.query(
                    `INSERT INTO timetable_entries (branch_id, year_of_study, semester_number, day_of_week, period_slot_id, subject_id, type, custom_label, span)
           VALUES ?`,
                    [values]
                );
            }

            await connection.commit();
            res.json({ success: true, message: 'Timetable updated successfully' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('timetable bulk update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update timetable' });
    }
};

exports.saveEntry = async (req, res) => {
    try {
        const { branch_id, year, semester, day_of_week, period_slot_id, subject_id, type, custom_label, span } = req.body;

        await masterPool.query(
            `INSERT INTO timetable_entries (branch_id, year_of_study, semester_number, day_of_week, period_slot_id, subject_id, type, custom_label, span)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                subject_id = VALUES(subject_id),
                type = VALUES(type),
                custom_label = VALUES(custom_label),
                span = VALUES(span)`,
            [branch_id, year, semester, day_of_week, period_slot_id, subject_id || null, type || 'subject', custom_label || null, span || 1]
        );

        res.json({ success: true, message: 'Entry saved' });
    } catch (error) {
        console.error('timetable save entry error:', error);
        res.status(500).json({ success: false, message: 'Failed to save entry' });
    }
};

exports.removeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        await masterPool.query('DELETE FROM timetable_entries WHERE id = ?', [id]);
        res.json({ success: true, message: 'Entry removed' });
    } catch (error) {
        console.error('timetable remove entry error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove entry' });
    }
};

const { masterPool } = require('../config/database');
const { sendNotificationToUser } = require('./pushController');
const { createBroadcastNotification } = require('../services/notificationService');

const serializeTarget = (target) => {
    if (Array.isArray(target) && target.length > 0) {
        return JSON.stringify(target);
    }
    return null;
};

const resolveLegacyAdminId = async (user) => {
    if (!user) {
        return null;
    }

    if (user.role === 'admin') {
        return user.id || null;
    }

    if (!user.username) {
        return null;
    }

    const [admins] = await masterPool.query(
        'SELECT id FROM admins WHERE username = ? LIMIT 1',
        [user.username]
    );

    return admins.length > 0 ? admins[0].id : null;
};

exports.createEvent = async (req, res) => {
    try {
        const {
            title,
            description,
            event_date,
            start_time,
            end_time,
            event_type, // 'academic', 'holiday', 'exam', 'other'
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester
        } = req.body;

        // `events.created_by` still references the legacy `admins` table.
        // RBAC/HRMS users may not have a matching admin row, so store NULL
        // instead of failing the insert with a foreign key error.
        const createdBy = await resolveLegacyAdminId(req.user || req.admin);

        const [result] = await masterPool.query(
            `INSERT INTO events 
            (title, description, event_date, end_date, start_time, end_time, event_type, created_by, target_college, target_batch, target_course, target_branch, target_year, target_semester) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                description,
                event_date,
                req.body.end_date || null,
                start_time || null,
                end_time || null,
                event_type || 'other',
                createdBy,
                serializeTarget(target_college),
                serializeTarget(target_batch),
                serializeTarget(target_course),
                serializeTarget(target_branch),
                serializeTarget(target_year),
                serializeTarget(target_semester)
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
        });

        // Send Push Notifications (Async)
        notifyTargetedStudents({
            title,
            description,
            event_date,
            event_type,
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester
        }).catch(err => console.error('Event notification failed:', err));

    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ success: false, message: 'Failed to create event' });
    }
};

exports.getEvents = async (req, res) => {
    try {
        // Admin View: Get all
        const query = `
            SELECT 
                e.*, 
                u.username as created_by_name 
            FROM events e
            LEFT JOIN admins u ON e.created_by = u.id
            ORDER BY e.event_date DESC
        `;

        const [rows] = await masterPool.query(query);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch events' });
    }
};

exports.getStudentEvents = async (req, res) => {
    try {
        const { admission_number, admissionNumber } = req.user;
        const studentAdmNum = admission_number || admissionNumber;

        const [studentRows] = await masterPool.query(
            'SELECT college, course, branch, batch, current_year, current_semester, student_status FROM students WHERE admission_number = ? OR admission_no = ?',
            [studentAdmNum, studentAdmNum]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const student = studentRows[0];

        const query = `
            SELECT * FROM events
            WHERE is_active = 1
            AND (
                (event_type = 'holiday') -- Show all holidays (logic can be refined if holidays are college specific)
                OR
                (
                    (target_college IS NULL OR JSON_CONTAINS(target_college, JSON_QUOTE(?)))
                    AND (target_batch IS NULL OR JSON_CONTAINS(target_batch, JSON_QUOTE(?)))
                    AND (target_course IS NULL OR JSON_CONTAINS(target_course, JSON_QUOTE(?)))
                    AND (target_branch IS NULL OR JSON_CONTAINS(target_branch, JSON_QUOTE(?)))
                    AND (target_year IS NULL OR JSON_CONTAINS(target_year, JSON_QUOTE(?)))
                    AND (target_semester IS NULL OR JSON_CONTAINS(target_semester, JSON_QUOTE(?)))
                )
            )
            ORDER BY event_date ASC
        `;

        const params = [
            student.college || '',
            student.batch || '',
            student.course || '',
            student.branch || '',
            String(student.current_year || ''),
            String(student.current_semester || '')
        ];

        const [rows] = await masterPool.query(query, params);

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Get student events error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch events' });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            event_date,
            start_time,
            end_time,
            event_type,
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester
        } = req.body;

        await masterPool.query(
            `UPDATE events SET 
                title = ?, 
                description = ?, 
                event_date = ?, 
                end_date = ?,
                start_time = ?, 
                end_time = ?, 
                event_type = ?,
                target_college = ?, 
                target_batch = ?, 
                target_course = ?, 
                target_branch = ?, 
                target_year = ?, 
                target_semester = ? 
            WHERE id = ?`,
            [
                title,
                description,
                event_date,
                req.body.end_date || null,
                start_time || null,
                end_time || null,
                event_type,
                serializeTarget(target_college),
                serializeTarget(target_batch),
                serializeTarget(target_course),
                serializeTarget(target_branch),
                serializeTarget(target_year),
                serializeTarget(target_semester),
                id
            ]
        );

        res.json({ success: true, message: 'Event updated' });
    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ success: false, message: 'Failed to update event' });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        await masterPool.query('DELETE FROM events WHERE id = ?', [id]);
        res.json({ success: true, message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete event' });
    }
};

exports.toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await masterPool.query('UPDATE events SET is_active = ? WHERE id = ?', [is_active, id]);
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
};

// Helper: Notify targeted students
const notifyTargetedStudents = async (event) => {
    // 1. Build query to find matching students
    let query = `SELECT id FROM students WHERE student_status = 'Regular'`;
    const params = [];

    const addCondition = (field, values) => {
        if (values && Array.isArray(values) && values.length > 0) {
            query += ` AND ${field} IN (${values.map(() => '?').join(',')})`;
            params.push(...values);
        } else if (values && typeof values === 'string') {
            query += ` AND ${field} = ?`;
            params.push(values);
        }
    };

    addCondition('college', event.target_college);
    addCondition('batch', event.target_batch);
    addCondition('course', event.target_course);
    addCondition('branch', event.target_branch);
    addCondition('current_year', event.target_year);
    addCondition('current_semester', event.target_semester);

    const [students] = await masterPool.query(query, params);

    if (students.length === 0) return;

    console.log(`Sending event notification to ${students.length} students...`);

    const payload = {
        title: `New Event: ${event.title}`,
        body: `${event.description ? event.description.substring(0, 50) + '...' : 'Check event calendar for details.'}`,
        icon: '/icon-192x192.png',
        data: {
            url: 'https://pydahgroup.com/student/events'
        }
    };

    // Send Web Notifications
    const studentIds = students.map(s => s.id);
    await createBroadcastNotification(studentIds, {
        title: `New Event: ${event.title}`,
        message: event.description ? event.description.substring(0, 100) : 'Check event calendar',
        category: 'Event'
    });

    // Send in batches to avoid overwhelming (basic batching is handled by Node event loop naturally here for simple map)
    const promises = students.map(student => sendNotificationToUser(student.id, payload));
    await Promise.allSettled(promises);
    console.log('Event notifications sent.');
};

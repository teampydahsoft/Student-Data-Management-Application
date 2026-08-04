const { masterPool } = require('../config/database');

const smsService = require('../services/smsService');
const pushController = require('./pushController');
const fs = require('fs');

// Helper to delete local file
const deleteLocalFile = (path) => {
    if (path && fs.existsSync(path)) {
        fs.unlinkSync(path);
    }
};

exports.createAnnouncement = async (req, res) => {
    let localFilePath = null;
    try {
        const {
            title,
            content,
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester
        } = req.body;

        const createdBy = req.user?.id || 1;

        let imageUrl = null;

        // Handle Image Upload
        if (req.file) {
            localFilePath = req.file.path;
            const fileData = fs.readFileSync(localFilePath);
            const base64Image = fileData.toString('base64');
            const mimeType = req.file.mimetype;
            imageUrl = `data:${mimeType};base64,${base64Image}`;
        }

        // Calculate audience count first
        let countQuery = 'SELECT COUNT(*) as count FROM students WHERE student_status = "Regular"';
        const queryParams = [];

        const parseParam = (val) => {
            if (!val) return null;
            if (Array.isArray(val)) return val.length ? val : null;
            try { const parsed = JSON.parse(val); return parsed.length ? parsed : null; } catch (e) { return null; }
        };

        const colleges = parseParam(target_college);
        const batches = parseParam(target_batch);
        const courses = parseParam(target_course);
        const branches = parseParam(target_branch);
        const years = parseParam(target_year);
        const semesters = parseParam(target_semester);

        if (colleges) { countQuery += ' AND college IN (?)'; queryParams.push(colleges); }
        if (batches) { countQuery += ' AND batch IN (?)'; queryParams.push(batches); }
        if (courses) { countQuery += ' AND course IN (?)'; queryParams.push(courses); }
        if (branches) { countQuery += ' AND branch IN (?)'; queryParams.push(branches); }
        if (years) { countQuery += ' AND current_year IN (?)'; queryParams.push(years); }
        if (semesters) { countQuery += ' AND current_semester IN (?)'; queryParams.push(semesters); }

        const [countRow] = await masterPool.query(countQuery, queryParams);
        const audienceCount = countRow[0].count;

        const [result] = await masterPool.query(
            `INSERT INTO announcements 
            (title, content, image_url, target_college, target_batch, target_course, target_branch, target_year, target_semester, created_by, audience_count) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                content,
                imageUrl,
                target_college || null,
                target_batch || null,
                target_course || null,
                target_branch || null,
                target_year || null,
                target_semester || null,
                createdBy,
                audienceCount
            ]
        );

        // Trigger Push Notifications (Background)
        (async () => {
            try {
                if (audienceCount === 0) return;

                // For large lists, we skip the memory-heavy id fetching if we can,
                // but since sendBatchNotification needs IDs, we fetch them efficiently.
                let idQuery = 'SELECT id FROM students WHERE student_status = "Regular"';
                if (colleges) idQuery += ' AND college IN (?)';
                if (batches) idQuery += ' AND batch IN (?)';
                if (courses) idQuery += ' AND course IN (?)';
                if (branches) idQuery += ' AND branch IN (?)';
                if (years) idQuery += ' AND current_year IN (?)';
                if (semesters) idQuery += ' AND current_semester IN (?)';

                const [students] = await masterPool.query(idQuery, queryParams);
                const userIds = students.map(s => s.id);

                if (userIds.length > 0) {
                    await pushController.sendBatchNotification(userIds, {
                        title: `New Announcement: ${title}`,
                        body: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                        icon: '/icon-192x192.png',
                        data: { url: '/student/announcements' }
                    });
                }
            } catch (err) {
                console.error('Push notification trigger error:', err);
            }
        })();

        res.status(201).json({
            success: true,
            message: 'Announcement created successfully',
            data: { id: result.insertId, title, imageUrl, audience_count: audienceCount }
        });

    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ success: false, message: 'Failed to create announcement' });
    } finally {
        if (localFilePath) deleteLocalFile(localFilePath);
    }
};

exports.getAnnouncements = async (req, res) => {
    try {
        // Admin View: Get all or filter
        const { college, course, branch } = req.query;
        let query = `
            SELECT 
                a.*, 
                u.username as created_by_name 
            FROM announcements a
            LEFT JOIN admins u ON a.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (college) {
            query += ' AND (a.target_college = ? OR a.target_college IS NULL)';
            params.push(college);
        }
        // Additional filters can be added here

        query += ' ORDER BY a.created_at DESC';

        const [rows] = await masterPool.query(query, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Get announcements error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch announcements' });
    }
};


exports.getStudentAnnouncements = async (req, res) => {
    try {
        const { admission_number, admissionNumber } = req.user;
        const studentAdmNum = admission_number || admissionNumber;
        const limit = parseInt(req.query.limit, 10) || 5;
        const offset = parseInt(req.query.offset, 10) || 0;
        // Debug log removed

        const [studentRows] = await masterPool.query(
            'SELECT college, course, branch, batch, current_year, current_semester, student_status FROM students WHERE admission_number = ? OR admission_no = ?',
            [studentAdmNum, studentAdmNum]
        );

        if (studentRows.length === 0) {
            console.error(`Student not found for admission number: ${studentAdmNum}`);
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const student = studentRows[0];

        // "Regular Only" Constraint: Check student_status
        // DB stores 'Regular' (Title Case)
        if (!student.student_status || student.student_status !== 'Regular') {
            // console.log(`Student ${studentAdmNum} status is '${student.student_status}', not 'Regular'. returning empty.`);
            return res.json({ success: true, data: [], hasMore: false });
        }

        // Match Logic:
        // Use JSON_CONTAINS to check if student's attribute exists in the target array
        // Schema uses TEXT columns for targets, storing JSON strings e.g., '["CSE","ECE"]'

        const query = `
            SELECT * FROM announcements
            WHERE is_active = 1
            AND (target_college IS NULL OR JSON_CONTAINS(target_college, JSON_QUOTE(?)))
            AND (target_batch IS NULL OR JSON_CONTAINS(target_batch, JSON_QUOTE(?)))
            AND (target_course IS NULL OR JSON_CONTAINS(target_course, JSON_QUOTE(?)))
            AND (target_branch IS NULL OR JSON_CONTAINS(target_branch, JSON_QUOTE(?)))
            AND (target_year IS NULL OR JSON_CONTAINS(target_year, JSON_QUOTE(?)))
            AND (target_semester IS NULL OR JSON_CONTAINS(target_semester, JSON_QUOTE(?)))
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;

        const params = [
            student.college || '',
            student.batch || '',
            student.course || '',
            student.branch || '',
            String(student.current_year || ''),
            String(student.current_semester || ''),
            limit,
            offset
        ];

        const [rows] = await masterPool.query(query, params);

        res.json({
            success: true,
            data: rows,
            hasMore: rows.length === limit
        });

    } catch (error) {
        console.error('Get student announcements error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch announcements' });
    }
};

exports.calculateRecipientCount = async (req, res) => {
    try {
        const { target_college, target_batch, target_course, target_branch, target_year, target_semester } = req.body;

        // Build dynamic query
        // Force "Regular" status only
        let query = 'SELECT COUNT(*) as count FROM students WHERE student_status = "Regular"';
        const params = [];

        // Parse JSON arrays if they come as strings, or use directly if array
        const parseParam = (val) => {
            if (!val) return null;
            if (Array.isArray(val)) return val.length ? val : null;
            try {
                const parsed = JSON.parse(val);
                return parsed.length ? parsed : null;
            } catch (e) { return null; }
        };

        const colleges = parseParam(target_college);
        const batches = parseParam(target_batch);
        const courses = parseParam(target_course);
        const branches = parseParam(target_branch);
        const years = parseParam(target_year);
        const semesters = parseParam(target_semester);

        if (colleges) { query += ' AND college IN (?)'; params.push(colleges); }
        if (batches) { query += ' AND batch IN (?)'; params.push(batches); }
        if (courses) {
            // Map course names to filtering if needed, assumes column 'course' holds names
            query += ' AND course IN (?)'; params.push(courses);
        }
        if (branches) { query += ' AND branch IN (?)'; params.push(branches); }
        if (years) { query += ' AND current_year IN (?)'; params.push(years); }
        if (semesters) { query += ' AND current_semester IN (?)'; params.push(semesters); }

        const [rows] = await masterPool.query(query, params);
        res.json({ success: true, count: rows[0].count });

    } catch (error) {
        console.error('Count calculation error:', error);
        res.status(500).json({ success: false, count: 0 });
    }
};

exports.updateAnnouncement = async (req, res) => {
    let localFilePath = null;
    try {
        const { id } = req.params;
        const {
            title,
            content,
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester,
            existing_image_url
        } = req.body;

        let imageUrl = existing_image_url; // Default to keeping existing

        if (req.file) {
            localFilePath = req.file.path;
            const fileData = fs.readFileSync(localFilePath);
            const base64Image = fileData.toString('base64');
            const mimeType = req.file.mimetype;
            imageUrl = `data:${mimeType};base64,${base64Image}`;
        }

        // Calculate audience count
        let countQuery = 'SELECT COUNT(*) as count FROM students WHERE student_status = "Regular"';
        const queryParams = [];

        const parseParam = (val) => {
            if (!val) return null;
            if (Array.isArray(val)) return val.length ? val : null;
            try { const parsed = JSON.parse(val); return parsed.length ? parsed : null; } catch (e) { return null; }
        };

        const colleges = parseParam(target_college);
        const batches = parseParam(target_batch);
        const courses = parseParam(target_course);
        const branches = parseParam(target_branch);
        const years = parseParam(target_year);
        const semesters = parseParam(target_semester);

        if (colleges) { countQuery += ' AND college IN (?)'; queryParams.push(colleges); }
        if (batches) { countQuery += ' AND batch IN (?)'; queryParams.push(batches); }
        if (courses) { countQuery += ' AND course IN (?)'; queryParams.push(courses); }
        if (branches) { countQuery += ' AND branch IN (?)'; queryParams.push(branches); }
        if (years) { countQuery += ' AND current_year IN (?)'; queryParams.push(years); }
        if (semesters) { countQuery += ' AND current_semester IN (?)'; queryParams.push(semesters); }

        const [countRow] = await masterPool.query(countQuery, queryParams);
        const audienceCount = countRow[0].count;

        await masterPool.query(
            `UPDATE announcements SET 
                title = ?, 
                content = ?, 
                image_url = ?, 
                target_college = ?, 
                target_batch = ?, 
                target_course = ?, 
                target_branch = ?, 
                target_year = ?, 
                target_semester = ?,
                audience_count = ?
            WHERE id = ?`,
            [
                title,
                content,
                imageUrl,
                target_college || null,
                target_batch || null,
                target_course || null,
                target_branch || null,
                target_year || null,
                target_semester || null,
                audienceCount,
                id
            ]
        );

        res.json({ success: true, message: 'Announcement updated', audience_count: audienceCount });

    } catch (error) {
        console.error('Update announcement error:', error);
        res.status(500).json({ success: false, message: 'Failed to update announcement' });
    } finally {
        if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    }
};

exports.toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        await masterPool.query(
            'UPDATE announcements SET is_active = ? WHERE id = ?',
            [is_active, id]
        );

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
};

exports.deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        await masterPool.query('DELETE FROM announcements WHERE id = ?', [id]);
        res.json({ success: true, message: 'Announcement deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete announcement' });
    }
};

// Metadata functions
exports.getBranches = async (req, res) => {
    try {
        const [rows] = await masterPool.query('SELECT DISTINCT branch, course FROM students WHERE branch IS NOT NULL AND branch != "" ORDER BY branch');
        // Return structured data: { name: 'BranchName', course_id: 'CourseName' } 
        // Note: Students table stores course NAME in 'course' column usually.
        // We'll map course name to "courseId" for frontend filtering simulation basically
        // Or better yet, just return the name and let frontend filter by string matching?
        // Frontend expects { value, label, courseId }.
        // We'll assume 'course' column holds the Course Name.
        const branches = rows.map(r => ({
            name: r.branch,
            course_id: r.course // Using course name as ID for filtering since frontend logic uses strings/ids
        }));
        res.json({ success: true, data: branches });
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ success: false, data: [] });
    }
};

exports.getBatches = async (req, res) => {
    try {
        const [rows] = await masterPool.query('SELECT DISTINCT batch FROM students WHERE batch IS NOT NULL AND batch != "" ORDER BY batch DESC');
        const batches = rows.map(r => ({ name: r.batch }));
        res.json({ success: true, data: batches });
    } catch (error) {
        console.error('Get batches error:', error);
        res.status(500).json({ success: false, data: [] });
    }
};

exports.getYears = async (req, res) => {
    try {
        // Return year associated with batch to allow filtering
        const [rows] = await masterPool.query('SELECT DISTINCT current_year, batch FROM students WHERE current_year IS NOT NULL ORDER BY current_year');
        const years = rows.map(r => ({ name: String(r.current_year), batch_id: r.batch }));
        res.json({ success: true, data: years });
    } catch (error) {
        console.error('Get years error:', error);
        res.status(500).json({ success: false, data: [] });
    }
};

exports.getSemesters = async (req, res) => {
    try {
        const [rows] = await masterPool.query('SELECT DISTINCT current_semester, batch FROM students WHERE current_semester IS NOT NULL ORDER BY current_semester');
        const semesters = rows.map(r => ({ name: String(r.current_semester), batch_id: r.batch }));
        res.json({ success: true, data: semesters });
    } catch (error) {
        console.error('Get semesters error:', error);
        res.status(500).json({ success: false, data: [] });
    }
};

exports.sendSMSAnnouncement = async (req, res) => {
    try {
        const {
            template_id,
            template_content,
            variable_mappings,
            target_college,
            target_batch,
            target_course,
            target_branch,
            target_year,
            target_semester
        } = req.body;

        if (!template_id || !template_content) {
            return res.status(400).json({ success: false, message: 'Template ID and content are required' });
        }

        // 1. Fetch Recipients
        let query = 'SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE student_status = "Regular"';
        const params = [];

        const parseParam = (val) => {
            if (!val) return null;
            if (Array.isArray(val)) return val.length ? val : null;
            try {
                const parsed = JSON.parse(val);
                return parsed.length ? parsed : null;
            } catch (e) { return null; }
        };

        const colleges = parseParam(target_college);
        const batches = parseParam(target_batch);
        const courses = parseParam(target_course);
        const branches = parseParam(target_branch);
        const years = parseParam(target_year);
        const semesters = parseParam(target_semester);

        if (colleges) { query += ' AND college IN (?)'; params.push(colleges); }
        if (batches) { query += ' AND batch IN (?)'; params.push(batches); }
        if (courses) { query += ' AND course IN (?)'; params.push(courses); }
        if (branches) { query += ' AND branch IN (?)'; params.push(branches); }
        if (years) { query += ' AND current_year IN (?)'; params.push(years); }
        if (semesters) { query += ' AND current_semester IN (?)'; params.push(semesters); }

        const [students] = await masterPool.query(query, params);

        if (students.length === 0) {
            return res.json({ success: true, message: 'No students found matching criteria', count: 0 });
        }

        // Return response immediately to prevent timeout
        res.json({
            success: true,
            message: `SMS broadcast started for ${students.length} recipients. System will process them in the background.`,
            count: students.length
        });

        // 2. Process and Send (Background)
        (async () => {
            console.log(`🚀 Starting background SMS broadcast for ${students.length} students...`);
            let sentCount = 0;
            let failedCount = 0;
            const startTime = Date.now();

            // Process in chunks
            const chunkSize = 50;
            for (let i = 0; i < students.length; i += chunkSize) {
                const chunk = students.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (student) => {
                    try {
                        // Resolve variables
                        let message = template_content;
                        if (Array.isArray(variable_mappings)) {
                            let varIndex = 0;
                            message = message.replace(/\{#var#\}/g, () => {
                                const mapping = variable_mappings[varIndex];
                                varIndex++;

                                if (!mapping) return '';

                                if (mapping.type === 'static') {
                                    return mapping.value || '';
                                } else if (mapping.type === 'field') {
                                    const key = mapping.value;
                                    if (key === 'current_date') {
                                        return new Date().toLocaleDateString('en-IN');
                                    }
                                    if (key === 'login_link') {
                                        return process.env.LOGIN_LINK || 'pydahgroup.com';
                                    }
                                    if (key === 'default_password') {
                                        const namePart = (student.student_name || '').substring(0, 4);
                                        const mobileStr = String(student.student_mobile || '');
                                        const mobilePart = mobileStr.length >= 4 ? mobileStr.slice(-4) : mobileStr;
                                        return namePart + mobilePart;
                                    }
                                    const val = student[key] || (student.student_data && student.student_data[key]) || '';
                                    return String(val).trim();
                                }
                                return '';
                            });
                        }

                        // Send SMS to parent mobile only
                        let mobile = student.parent_mobile1 || student.parent_mobile2;
                        if (!mobile && student.student_data) {
                            mobile = student.student_data['Parent Mobile Number 1'] || student.student_data['Parent Mobile Number 2'];
                        }
                        // Do NOT fall back to student mobile — parent-only policy

                        if (mobile) {
                            const cleanMobile = String(mobile).replace(/[^0-9]/g, '');
                            if (cleanMobile.length >= 10) {
                                await smsService.sendSms({
                                    to: cleanMobile,
                                    message: message,
                                    templateId: template_id,
                                    peId: process.env.SMS_PE_ID,
                                    meta: {
                                        category: 'Announcement',
                                        student: {
                                            id: student.id,
                                            admissionNumber: student.admission_number,
                                            currentYear: student.current_year,
                                            currentSemester: student.current_semester
                                        }
                                    }
                                });
                                sentCount++;
                            } else {
                                failedCount++;
                            }
                        } else {
                            failedCount++;
                        }

                    } catch (e) {
                        console.error(`Failed to send SMS to student ${student.admission_number}:`, e);
                        failedCount++;
                    }
                }));

                // Optional: small delay between chunks to be nice to the SMS provider/Database?
                // await new Promise(r => setTimeout(r, 100));
            }

            const duration = (Date.now() - startTime) / 1000;
            console.log(`✅ Background SMS broadcast completed in ${duration}s. Sent: ${sentCount}, Failed: ${failedCount}`);
        })().catch(err => {
            console.error('❌ Background SMS broadcast critical failure:', err);
        });

    } catch (error) {
        console.error('SMS Announcement Error:', error);
        // Only verify if headers sent? No, because we send res.json early in the happy path.
        // But if error occurs BEFORE res.json (in fetch phase), we must send error.
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to process SMS announcement' });
        }
    }
};

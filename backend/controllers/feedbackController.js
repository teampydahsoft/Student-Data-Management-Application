const { masterPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { writeAuditLog } = require('../services/auditLogService');

// Helper to get admin ID
const getAdminIdForDb = (req) => (req.admin && req.admin.role === 'admin' ? req.admin.id : null);

// Create new feedback form
exports.createFeedbackForm = async (req, res) => {
    let conn;
    try {
        const { formName, formDescription, formFields, recurrence } = req.body;

        if (!formName || !formFields || !Array.isArray(formFields)) {
            return res.status(400).json({
                success: false,
                message: 'Form name and fields are required'
            });
        }

        const formId = uuidv4();
        // Use the primary frontend URL for QR codes
        const frontendUrl = process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL.split(',')[0].trim()
            : (process.env.NODE_ENV === 'production'
                ? 'https://pydahsdbms.vercel.app'
                : 'http://localhost:3000');

        const formUrl = `${frontendUrl}/form/${formId}`;

        const qrCodeData = await QRCode.toDataURL(formUrl);

        conn = await masterPool.getConnection();
        await conn.beginTransaction();

        const adminIdForDb = getAdminIdForDb(req);

        await conn.query(
            `INSERT INTO forms (form_id, form_name, form_description, form_fields, qr_code_data, created_by, recurrence_config, form_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [formId, formName, formDescription || '', JSON.stringify(formFields), qrCodeData, adminIdForDb, recurrence ? JSON.stringify(recurrence) : null, 'feedback']
        );

        await writeAuditLog(conn, {
            actionType: 'CREATE',
            entityType: 'FEEDBACK_FORM',
            entityId: formId,
            req,
            details: { formName }
        });

        await conn.commit();

        res.status(201).json({
            success: true,
            message: 'Feedback form created successfully',
            data: {
                formId,
                formName,
                formUrl,
                qrCodeData
            }
        });

    } catch (error) {
        if (conn) await conn.rollback();
        console.error('Create feedback form error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating feedback form'
        });
    } finally {
        if (conn) conn.release();
    }
};

// Get all feedback forms
exports.getAllFeedbackForms = async (req, res) => {
    try {
        const [forms] = await masterPool.query(`
      SELECT f.*, a.username as created_by_name
      FROM forms f
      LEFT JOIN admins a ON f.created_by = a.id
      WHERE f.form_category = 'feedback'
      ORDER BY f.created_at DESC
    `);

        // Parse JSON fields
        const parsedForms = forms.map(form => ({
            ...form,
            form_fields: typeof form.form_fields === 'string' ? JSON.parse(form.form_fields) : form.form_fields
        }));

        res.json({
            success: true,
            data: parsedForms
        });
    } catch (error) {
        console.error('Get feedback forms error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching feedback forms'
        });
    }
};

// Get feedback form by ID
exports.getFeedbackFormById = async (req, res) => {
    try {
        const { formId } = req.params;
        const [forms] = await masterPool.query('SELECT * FROM forms WHERE form_id = ? AND form_category = "feedback"', [formId]);

        if (forms.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Feedback form not found'
            });
        }

        const form = forms[0];

        // Parse JSON fields
        form.form_fields = typeof form.form_fields === 'string' ? JSON.parse(form.form_fields) : form.form_fields;
        form.recurrence = form.recurrence_config ? (typeof form.recurrence_config === 'string' ? JSON.parse(form.recurrence_config) : form.recurrence_config) : null;

        res.json({
            success: true,
            data: form
        });
    } catch (error) {
        console.error('Get feedback form error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Update feedback form
exports.updateFeedbackForm = async (req, res) => {
    try {
        const { formId } = req.params;
        const { formName, formDescription, formFields, isActive, recurrence } = req.body;

        const [existing] = await masterPool.query('SELECT * FROM forms WHERE form_id = ? AND form_category = "feedback"', [formId]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Feedback form not found'
            });
        }

        const updates = [];
        const params = [];

        if (formName) {
            updates.push('form_name = ?');
            params.push(formName);
        }
        if (formDescription !== undefined) {
            updates.push('form_description = ?');
            params.push(formDescription);
        }
        if (formFields) {
            updates.push('form_fields = ?');
            params.push(JSON.stringify(formFields));
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive);
        }
        if (recurrence !== undefined) {
            updates.push('recurrence_config = ?');
            params.push(recurrence ? JSON.stringify(recurrence) : null);
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'No changes to update' });
        }

        params.push(formId);

        await masterPool.query(
            `UPDATE forms SET ${updates.join(', ')} WHERE form_id = ?`,
            params
        );

        res.json({
            success: true,
            message: 'Feedback form updated successfully'
        });
    } catch (error) {
        console.error('Update feedback form error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Delete feedback form
exports.deleteFeedbackForm = async (req, res) => {
    try {
        const { formId } = req.params;

        // Check if form exists and is feedback category
        const [existing] = await masterPool.query('SELECT * FROM forms WHERE form_id = ? AND form_category = "feedback"', [formId]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Feedback form not found'
            });
        }

        // Delete associated submissions? 
        // Assuming cascade delete or managed separately. For now just delete form.
        await masterPool.query('DELETE FROM forms WHERE form_id = ?', [formId]);

        res.json({
            success: true,
            message: 'Feedback form deleted successfully'
        });
    } catch (error) {
        console.error('Delete feedback form error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Get pending feedback for student
exports.getMyPendingFeedback = async (req, res) => {
    try {
        const studentId = req.user.id; // From token

        // verify student exists
        const [students] = await masterPool.query('SELECT * FROM students WHERE id = ?', [studentId]);
        if (!students.length) return res.status(404).json({ success: false, message: 'Student not found' });
        const student = students[0];

        const currentYear = student.current_year;
        const currentSemester = student.current_semester;

        // Find Branch ID
        const [branches] = await masterPool.query('SELECT id FROM course_branches WHERE name = ? OR code = ?', [student.branch, student.branch]);
        if (!branches.length) {
            return res.json({ success: true, data: [] });
        }
        const branchId = branches[0].id;

        // Get Subjects for this branch/year/sem with type and details
        const [subjects] = await masterPool.query(`
            SELECT s.id, s.name, s.code, s.subject_type, s.units, s.experiments_count, s.credits
            FROM branch_semester_subjects bss
            JOIN subjects s ON bss.subject_id = s.id
            WHERE bss.branch_id = ? AND bss.year_of_study = ? AND bss.semester_number = ?
        `, [branchId, currentYear, currentSemester]);

        if (!subjects.length) {
            return res.json({ success: true, data: [] });
        }

        // Get Faculty for these subjects
        const subjectIds = subjects.map(s => s.id);
        const [faculties] = await masterPool.query(`
            SELECT fs.subject_id, u.id as faculty_id, u.name, u.username
            FROM faculty_subjects fs
            JOIN rbac_users u ON fs.rbac_user_id = u.id
            WHERE fs.subject_id IN (?)
        `, [subjectIds]);

        // Get active feedback form
        const [forms] = await masterPool.query(`
            SELECT form_id, form_name, form_fields 
            FROM forms 
            WHERE form_category = 'feedback' AND is_active = 1 
            ORDER BY created_at DESC LIMIT 1
        `);

        if (!forms.length) {
            return res.json({ success: true, message: 'No active feedback form', data: [] });
        }
        const feedbackForm = forms[0];
        feedbackForm.form_fields = typeof feedbackForm.form_fields === 'string' ? JSON.parse(feedbackForm.form_fields) : feedbackForm.form_fields;

        // Check existing submissions
        const [submissions] = await masterPool.query(`
            SELECT faculty_id, subject_id 
            FROM feedback_responses 
            WHERE student_id = ? AND form_id = ? AND academic_year = ? AND semester = ?
        `, [studentId, feedbackForm.form_id, String(currentYear), currentSemester]);

        const submissionMap = new Set(submissions.map(s => `${s.subject_id}-${s.faculty_id}`));

        // Build Response List
        const feedbackList = [];

        for (const subj of subjects) {
            const subjectFaculties = faculties.filter(f => f.subject_id === subj.id);
            for (const fac of subjectFaculties) {
                const isSubmitted = submissionMap.has(`${subj.id}-${fac.faculty_id}`);
                feedbackList.push({
                    subjectId: subj.id,
                    subjectName: subj.name,
                    subjectCode: subj.code,
                    subjectType: subj.subject_type,
                    units: subj.units,
                    experimentsCount: subj.experiments_count,
                    credits: subj.credits,
                    facultyId: fac.faculty_id,
                    facultyName: fac.name || fac.username,
                    isSubmitted,
                    formId: feedbackForm.form_id,
                    formName: feedbackForm.form_name,
                    questions: feedbackForm.form_fields
                });
            }
        }

        res.json({ success: true, data: feedbackList });

    } catch (e) {
        console.error('Get my feedback error:', e);
        res.status(500).json({ success: false, message: 'Error fetching feedback' });
    }
};

// Submit feedback
exports.submitFeedback = async (req, res) => {
    let conn;
    try {
        const studentId = req.user.id;
        const { formId, facultyId, subjectId, responses } = req.body;

        if (!formId || !facultyId || !subjectId || !responses) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Verify student for context (year/sem)
        const [students] = await masterPool.query('SELECT current_year, current_semester FROM students WHERE id = ?', [studentId]);
        if (!students.length) return res.status(404).json({ success: false, message: 'Student not found' });
        const { current_year, current_semester } = students[0];

        conn = await masterPool.getConnection();
        await conn.beginTransaction();

        // Check if already submitted
        const [existing] = await conn.query(`
            SELECT id FROM feedback_responses 
            WHERE student_id = ? AND faculty_id = ? AND subject_id = ? AND form_id = ? AND academic_year = ? AND semester = ?
        `, [studentId, facultyId, subjectId, formId, String(current_year), current_semester]);

        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Feedback already submitted for this faculty and subject' });
        }

        // Insert
        await conn.query(`
            INSERT INTO feedback_responses (form_id, student_id, faculty_id, subject_id, responses, academic_year, semester)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [formId, studentId, facultyId, subjectId, JSON.stringify(responses), String(current_year), current_semester]);

        await conn.commit();
        res.json({ success: true, message: 'Feedback submitted successfully' });

    } catch (e) {
        if (conn) await conn.rollback();
        console.error('Submit feedback error:', e);
        res.status(500).json({ success: false, message: 'Error submitting feedback' });
    } finally {
        if (conn) conn.release();
    }
};

// Get analytics for feedback responses
exports.getAnalytics = async (req, res) => {
    try {
        const { formId, year, semester, course, branch } = req.query;

        if (!formId) {
            return res.status(400).json({ success: false, message: 'Form ID is required' });
        }

        let whereConditions = ['fr.form_id = ?'];
        let params = [formId];

        if (year) {
            whereConditions.push('fr.academic_year = ?');
            params.push(year);
        }
        if (semester) {
            whereConditions.push('fr.semester = ?');
            params.push(semester);
        }
        if (branch) {
            whereConditions.push('s.branch = ?');
            params.push(branch);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total responses
        const [totalResult] = await masterPool.query(`
            SELECT COUNT(*) as total
            FROM feedback_responses fr
            JOIN students s ON fr.student_id = s.id
            WHERE ${whereClause}
        `, params);

        // Get unique students
        const [uniqueStudents] = await masterPool.query(`
            SELECT COUNT(DISTINCT fr.student_id) as count
            FROM feedback_responses fr
            JOIN students s ON fr.student_id = s.id
            WHERE ${whereClause}
        `, params);

        // Get subject breakdown with faculty and average ratings
        const [subjectBreakdown] = await masterPool.query(`
            SELECT 
                subj.id as subjectId,
                subj.name as subjectName,
                subj.code as subjectCode,
                u.name as facultyName,
                COUNT(fr.id) as responseCount,
                fr.faculty_id as facultyId
            FROM feedback_responses fr
            JOIN students s ON fr.student_id = s.id
            JOIN subjects subj ON fr.subject_id = subj.id
            JOIN rbac_users u ON fr.faculty_id = u.id
            WHERE ${whereClause}
            GROUP BY subj.id, fr.faculty_id
            ORDER BY subj.name, facultyName
        `, params);

        // Calculate average ratings for each subject-faculty pair
        const breakdownWithRatings = await Promise.all(
            subjectBreakdown.map(async (item) => {
                const [responses] = await masterPool.query(`
                    SELECT responses
                    FROM feedback_responses
                    WHERE form_id = ? AND subject_id = ? AND faculty_id = ?
                `, [formId, item.subjectId, item.facultyId]);

                let totalRating = 0;
                let ratingCount = 0;

                responses.forEach(r => {
                    const responseData = typeof r.responses === 'string' ? JSON.parse(r.responses) : r.responses;
                    Object.values(responseData).forEach(value => {
                        if (typeof value === 'number' && value >= 1 && value <= 5) {
                            totalRating += value;
                            ratingCount++;
                        }
                    });
                });

                const averageRating = ratingCount > 0 ? totalRating / ratingCount : null;

                return {
                    ...item,
                    averageRating,
                    remarks: averageRating >= 4 ? 'Excellent' : averageRating >= 3 ? 'Good' : averageRating >= 2 ? 'Average' : 'Needs Improvement'
                };
            })
        );

        // Get unique subjects and courses count
        const [subjectsCount] = await masterPool.query(`
            SELECT COUNT(DISTINCT fr.subject_id) as count
            FROM feedback_responses fr
            JOIN students s ON fr.student_id = s.id
            WHERE ${whereClause}
        `, params);

        const [coursesCount] = await masterPool.query(`
            SELECT COUNT(DISTINCT s.course) as count
            FROM feedback_responses fr
            JOIN students s ON fr.student_id = s.id
            WHERE ${whereClause}
        `, params);

        res.json({
            success: true,
            data: {
                totalResponses: totalResult[0].total,
                uniqueStudents: uniqueStudents[0].count,
                subjectsCount: subjectsCount[0].count,
                coursesCount: coursesCount[0].count,
                subjectBreakdown: breakdownWithRatings
            }
        });

    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ success: false, message: 'Error fetching analytics' });
    }
};


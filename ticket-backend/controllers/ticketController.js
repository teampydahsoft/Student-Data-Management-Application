const { masterPool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { enrichTicketsRequesterNames, normalizeRequesterFields } = require('../utils/requesterNames');

const MAX_PHOTO_BYTES = 1024 * 1024;

// tickets.raised_by_hrms_id and rbac_users.hrms_id may use different collations on MySQL 8
const HRMS_USER_JOIN = `LEFT JOIN rbac_users ru_hrms ON t.raised_by_hrms_id COLLATE utf8mb4_unicode_ci = ru_hrms.hrms_id COLLATE utf8mb4_unicode_ci`;

// Configure multer for ticket photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/tickets';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_PHOTO_BYTES
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Export multer upload for routes
exports.upload = upload;

/**
 * Generate unique ticket number
 */
const generateTicketNumber = async () => {
    const prefix = 'TKT';
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${year}-${timestamp}-${random}`;
};

/**
 * Create a new ticket (student or staff raises complaint)
 */
exports.createTicket = async (req, res) => {
    try {
        const { category_id, sub_category_id, title, description } = req.body;
        const user = req.user || req.student;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const isStudent = user.role === 'student' || user.admission_number || user.admissionNumber;
        const isHrmsSession = !!(user.is_hrms_session || user.hrmsId);
        const isStaffRequester = !isStudent && (
            isHrmsSession ||
            (user.id && user.role !== 'super_admin' && user.role !== 'admin' && !user.is_worker)
        );

        if (!isStudent && !isStaffRequester) {
            return res.status(403).json({
                success: false,
                message: 'Only students and staff can raise tickets through this endpoint'
            });
        }

        if (!category_id || !title) {
            return res.status(400).json({
                success: false,
                message: 'Category and title are required'
            });
        }

        // Verify category exists and is active
        const [category] = await masterPool.query(
            'SELECT id, parent_id, is_active FROM complaint_categories WHERE id = ?',
            [category_id]
        );

        if (category.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid complaint category'
            });
        }

        if (!category[0].is_active) {
            return res.status(400).json({
                success: false,
                message: 'This complaint category is not available'
            });
        }

        // If sub_category_id is provided, verify it belongs to the category
        if (sub_category_id) {
            const [subCategory] = await masterPool.query(
                'SELECT id, parent_id, is_active FROM complaint_categories WHERE id = ? AND parent_id = ?',
                [sub_category_id, category_id]
            );

            if (subCategory.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid sub-category for selected category'
                });
            }

            if (!subCategory[0].is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'This sub-category is not available'
                });
            }
        }

        let studentId = null;
        let admissionNumber = null;
        let requesterType = 'student';
        let raisedByRbacId = null;
        let raisedByHrmsId = null;
        let requesterDisplayName = null;

        if (isStudent) {
            const admissionNo = user.admission_number || user.admissionNumber;
            const [studentData] = await masterPool.query(
                'SELECT id, admission_number, student_name FROM students WHERE admission_number = ?',
                [admissionNo]
            );

            if (studentData.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Student not found in database. Please contact admin.'
                });
            }

            studentId = studentData[0].id;
            admissionNumber = studentData[0].admission_number;
            requesterDisplayName = studentData[0].student_name || user.name || null;
        } else if (isHrmsSession) {
            requesterType = 'staff';
            raisedByHrmsId = user.hrmsId;
            requesterDisplayName = user.name || null;
            admissionNumber = user.username || user.email || `HRMS-${user.hrmsId}`;
        } else {
            let [staffUser] = await masterPool.query(
                'SELECT id, username, email, name FROM rbac_users WHERE id = ? LIMIT 1',
                [user.id]
            );

            if (staffUser.length === 0 && user.username) {
                [staffUser] = await masterPool.query(
                    'SELECT id, username, email, name FROM rbac_users WHERE username = ? OR email = ? LIMIT 1',
                    [user.username, user.username]
                );
            }

            if (staffUser.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Staff profile not found. Please contact admin.'
                });
            }

            requesterType = 'staff';
            raisedByRbacId = staffUser[0].id;
            requesterDisplayName = staffUser[0].name || user.name || null;
            admissionNumber = staffUser[0].username || staffUser[0].email || `STAFF-${staffUser[0].id}`;
        }

        // Handle photo upload — store file path (not base64) for faster uploads
        let photoUrl = null;
        if (req.file) {
            photoUrl = `/uploads/tickets/${req.file.filename}`;
        }

        // Generate ticket number
        const ticketNumber = await generateTicketNumber();

        // Create ticket — support legacy schema before staff-requester migration completes
        let result;
        try {
            [result] = await masterPool.query(
                `INSERT INTO tickets 
           (ticket_number, student_id, admission_number, requester_type, raised_by_rbac_id, raised_by_hrms_id, requester_display_name, category_id, sub_category_id, title, description, photo_url, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    ticketNumber,
                    studentId,
                    admissionNumber,
                    requesterType,
                    raisedByRbacId,
                    raisedByHrmsId,
                    requesterDisplayName,
                    category_id,
                    sub_category_id || null,
                    title.trim(),
                    description ? description.trim() : '',
                    photoUrl
                ]
            );
        } catch (insertError) {
            if (insertError.code !== 'ER_BAD_FIELD_ERROR') {
                throw insertError;
            }

            if (raisedByHrmsId) {
                [result] = await masterPool.query(
                    `INSERT INTO tickets 
               (ticket_number, student_id, admission_number, requester_type, raised_by_rbac_id, raised_by_hrms_id, category_id, sub_category_id, title, description, photo_url, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                    [
                        ticketNumber,
                        studentId,
                        admissionNumber,
                        requesterType,
                        raisedByRbacId,
                        raisedByHrmsId,
                        category_id,
                        sub_category_id || null,
                        title.trim(),
                        description ? description.trim() : '',
                        photoUrl
                    ]
                );
            } else if (isStaffRequester) {
                return res.status(503).json({
                    success: false,
                    message: 'Staff ticket support is still initializing. Please try again in a moment.'
                });
            } else {
                [result] = await masterPool.query(
                    `INSERT INTO tickets 
               (ticket_number, student_id, admission_number, category_id, sub_category_id, title, description, photo_url, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                    [
                        ticketNumber,
                        studentId,
                        admissionNumber,
                        category_id,
                        sub_category_id || null,
                        title.trim(),
                        description ? description.trim() : '',
                        photoUrl
                    ]
                );
            }
        }

        // Keep uploaded file on disk when stored as path URL

        // --- AUTO-ASSIGNMENT LOGIC ---
        // Find managers (staff) who are assigned to this category
        try {
            const [managers] = await masterPool.query(`
                SELECT rbac_user_id, assigned_categories 
                FROM ticket_employees 
                WHERE role = 'staff' AND is_active = 1
            `);

            const assignedManagerIds = [];

            for (const manager of managers) {
                let categories = [];
                try {
                    categories = typeof manager.assigned_categories === 'string'
                        ? JSON.parse(manager.assigned_categories)
                        : manager.assigned_categories;
                } catch (e) {
                    console.error('Error parsing categories for auto-assign:', e);
                    continue;
                }

                if (Array.isArray(categories)) {
                    // Convert all to numbers for comparison
                    const categoryIds = categories.map(c => Number(c));
                    const targetCategoryId = Number(category_id);

                    console.log(`Checking manager ${manager.rbac_user_id} with categories:`, categoryIds, `against ${targetCategoryId}`);

                    if (categoryIds.includes(targetCategoryId)) {
                        assignedManagerIds.push(manager.rbac_user_id);
                        console.log(`>> MATCH! Auto-assigning manager ${manager.rbac_user_id}`);
                    }
                }
            }

            if (assignedManagerIds.length > 0) {
                // Insert assignments
                const assignmentValues = assignedManagerIds.map(userId => [
                    result.insertId,
                    userId,
                    null, // assigned_by is null for system/auto-assignment
                    'Auto-assigned based on Category'
                ]);

                await masterPool.query(
                    `INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by, notes) VALUES ?`,
                    [assignmentValues]
                );

                // Update status to 'approaching' since it's assigned
                await masterPool.query(
                    `UPDATE tickets SET status = 'approaching' WHERE id = ?`,
                    [result.insertId]
                );
            } else {
                console.log('No managers found for auto-assignment for category:', category_id);
            }
        } catch (assignError) {
            console.error('Auto-assignment failed:', assignError);
            // Don't fail the request, just log it
        }
        // -----------------------------

        // Get created ticket
        const [ticket] = await masterPool.query(
            `SELECT t.*, 
        c.name as category_name,
        sc.name as sub_category_name
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      WHERE t.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            data: ticket[0]
        });
    } catch (error) {
        console.error('Error creating ticket:', error);

        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Error creating ticket',
            error: error.message
        });
    }
};

/**
 * Get all tickets (admin view with filters)
 */
exports.getTickets = async (req, res) => {
    try {
        const { status, category_id, assigned_to, student_id, requester_type, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
      SELECT 
        t.id,
        t.ticket_number,
        t.student_id,
        t.admission_number,
        t.requester_type,
        t.raised_by_rbac_id,
        t.raised_by_hrms_id,
        t.requester_display_name,
        t.category_id,
        t.sub_category_id,
        t.title,
        t.description,
        (CASE WHEN t.photo_url IS NOT NULL AND t.photo_url != '' THEN 1 ELSE 0 END) as has_photo,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        t.closed_at,
        c.name as category_name,
        sc.name as sub_category_name,
        s.student_name,
        s.student_mobile,
        ru_requester.name as staff_requester_name,
        ru_hrms.name as hrms_linked_name,
        COALESCE(s.student_name, ru_requester.name, ru_hrms.name, t.requester_display_name) as requester_name,
        GROUP_CONCAT(DISTINCT CONCAT(ru.name, ' (', ru.username, ')') SEPARATOR ', ') as assigned_users,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', ta_sub.id,
                    'assigned_to', ta_sub.assigned_to,
                    'assigned_at', ta_sub.assigned_at,
                    'assigned_to_name', ru_sub.name,
                    'assigned_to_role', ru_sub.role
                )
            )
            FROM ticket_assignments ta_sub
            JOIN rbac_users ru_sub ON ta_sub.assigned_to = ru_sub.id
            WHERE ta_sub.ticket_id = t.id AND ta_sub.is_active = TRUE
        ) as assignments
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN rbac_users ru_requester ON t.raised_by_rbac_id = ru_requester.id
      ${HRMS_USER_JOIN}
      LEFT JOIN ticket_assignments ta ON t.id = ta.ticket_id AND ta.is_active = TRUE
      LEFT JOIN rbac_users ru ON ta.assigned_to = ru.id
    `;

        const conditions = [];
        const params = [];

        if (status) {
            conditions.push('t.status = ?');
            params.push(status);
        }

        if (category_id) {
            conditions.push('t.category_id = ?');
            params.push(category_id);
        }

        if (student_id) {
            conditions.push('t.student_id = ?');
            params.push(student_id);
        }

        if (requester_type === 'student') {
            conditions.push("(t.requester_type = 'student' OR t.requester_type IS NULL)");
        } else if (requester_type === 'staff' || requester_type === 'faculty') {
            conditions.push("t.requester_type = 'staff'");
        }

        if (assigned_to) {
            conditions.push('ta.assigned_to = ?');
            params.push(assigned_to);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY t.id ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [tickets] = await masterPool.query(query, params);
        const enrichedTickets = await enrichTicketsRequesterNames(tickets);

        // Get total count
        let countQuery = 'SELECT COUNT(DISTINCT t.id) as total FROM tickets t';
        if (assigned_to) {
            countQuery += ' LEFT JOIN ticket_assignments ta ON t.id = ta.ticket_id AND ta.is_active = TRUE';
        }
        if (conditions.length > 0) {
            countQuery += ' WHERE ' + conditions.join(' AND ');
        }

        const [countResult] = await masterPool.query(countQuery, params.slice(0, -2));
        const total = countResult && countResult[0] ? countResult[0].total : 0;

        res.json({
            success: true,
            data: enrichedTickets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tickets',
            error: error.message
        });
    }
};

/**
 * Get single ticket with full details
 */
exports.getTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user || req.admin;

        const [tickets] = await masterPool.query(
            `SELECT 
        t.*,
        c.name as category_name,
        c.description as category_description,
        sc.name as sub_category_name,
        sc.description as sub_category_description,
        s.student_name,
        s.student_mobile,
        ru_requester.name as staff_requester_name,
        ru_hrms.name as hrms_linked_name,
        COALESCE(s.student_name, ru_requester.name, ru_hrms.name, t.requester_display_name) as requester_name
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN rbac_users ru_requester ON t.raised_by_rbac_id = ru_requester.id
      ${HRMS_USER_JOIN}
      WHERE t.id = ?`,
            [id]
        );

        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const [normalizedTicket] = await enrichTicketsRequesterNames([tickets[0]]);
        const ticketRecord = normalizedTicket || normalizeRequesterFields(tickets[0]);

        // Check if user is a requester trying to access their own ticket
        if (user.role === 'student' || user.admission_number || user.admissionNumber) {
            const studentAdmissionNumber = user.admission_number || user.admissionNumber;
            if (tickets[0].admission_number !== studentAdmissionNumber) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You can only view your own tickets.'
                });
            }
        } else if (tickets[0].requester_type === 'staff') {
            const ownsByRbac = user.id && tickets[0].raised_by_rbac_id === user.id;
            const ownsByHrms = user.hrmsId && tickets[0].raised_by_hrms_id === user.hrmsId;
            if (!ownsByRbac && !ownsByHrms) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You can only view your own tickets.'
                });
            }
        }

        // Get assignments
        const [assignments] = await masterPool.query(
            `SELECT 
        ta.*,
        ru.name as assigned_to_name,
        ru.username as assigned_to_username,
        ru.email as assigned_to_email,
        ru.role as assigned_to_role,
        assigned_by_ru.name as assigned_by_name
      FROM ticket_assignments ta
      LEFT JOIN rbac_users ru ON ta.assigned_to = ru.id
      LEFT JOIN rbac_users assigned_by_ru ON ta.assigned_by = assigned_by_ru.id
      WHERE ta.ticket_id = ? AND ta.is_active = TRUE
      ORDER BY ta.assigned_at DESC`,
            [id]
        );

        // Get status history
        const [statusHistory] = await masterPool.query(
            `SELECT 
        tsh.*,
        ru.name as changed_by_name,
        ru.username as changed_by_username
      FROM ticket_status_history tsh
      LEFT JOIN rbac_users ru ON tsh.changed_by = ru.id
      WHERE tsh.ticket_id = ?
      ORDER BY tsh.created_at DESC`,
            [id]
        );

        // Get comments
        const [comments] = await masterPool.query(
            `SELECT 
        tc.*,
        CASE 
          WHEN tc.user_type = 'admin' THEN ru.name
          ELSE s.student_name
        END as user_name,
        CASE 
          WHEN tc.user_type = 'admin' THEN ru.username
          ELSE s.admission_number
        END as user_identifier
      FROM ticket_comments tc
      LEFT JOIN rbac_users ru ON tc.user_type = 'admin' AND tc.user_id = ru.id
      LEFT JOIN students s ON tc.user_type = 'student' AND tc.user_id = s.id
      WHERE tc.ticket_id = ?
      ORDER BY tc.created_at ASC`,
            [id]
        );

        // Get feedback if ticket is completed
        let feedback = null;
        if (tickets[0].status === 'completed') {
            const [feedbackData] = await masterPool.query(
                'SELECT * FROM ticket_feedback WHERE ticket_id = ?',
                [id]
            );
            if (feedbackData.length > 0) {
                feedback = feedbackData[0];
            }
        }

        res.json({
            success: true,
            data: {
                ...ticketRecord,
                assignments,
                status_history: statusHistory,
                comments,
                feedback
            }
        });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching ticket',
            error: error.message
        });
    }
};

/**
 * Get tickets for a student
 */
exports.getStudentTickets = async (req, res) => {
    try {
        const user = req.user || req.student;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const isStudent = user.role === 'student' || user.admission_number || user.admissionNumber;
        const isHrmsSession = !!(user.is_hrms_session || user.hrmsId);
        const admissionNumber = user.admission_number || user.admissionNumber;

        let tickets;
        if (isStudent) {
            if (!admissionNumber) {
                return res.status(401).json({
                    success: false,
                    message: 'Student authentication required'
                });
            }

            [tickets] = await masterPool.query(
                `SELECT
        t.id,
        t.ticket_number,
        t.student_id,
        t.admission_number,
        t.requester_type,
        t.category_id,
        t.sub_category_id,
        t.title,
        t.description,
        (CASE WHEN t.photo_url IS NOT NULL AND t.photo_url != '' THEN 1 ELSE 0 END) as has_photo,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        t.closed_at,
        c.name as category_name,
        sc.name as sub_category_name,
        (
            SELECT JSON_OBJECT(
                'id', tf_sub.id,
                'rating', tf_sub.rating,
                'feedback_text', tf_sub.feedback_text
            )
            FROM ticket_feedback tf_sub
            WHERE tf_sub.ticket_id = t.id
            LIMIT 1
        ) as feedback
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      WHERE t.admission_number = ? AND (t.requester_type = 'student' OR t.requester_type IS NULL)
      ORDER BY t.created_at DESC`,
                [admissionNumber]
            );
        } else if (isHrmsSession) {
            try {
                [tickets] = await masterPool.query(
                    `SELECT
        t.id,
        t.ticket_number,
        t.student_id,
        t.admission_number,
        t.requester_type,
        t.category_id,
        t.sub_category_id,
        t.title,
        t.description,
        (CASE WHEN t.photo_url IS NOT NULL AND t.photo_url != '' THEN 1 ELSE 0 END) as has_photo,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        t.closed_at,
        c.name as category_name,
        sc.name as sub_category_name,
        (
            SELECT JSON_OBJECT(
                'id', tf_sub.id,
                'rating', tf_sub.rating,
                'feedback_text', tf_sub.feedback_text
            )
            FROM ticket_feedback tf_sub
            WHERE tf_sub.ticket_id = t.id
            LIMIT 1
        ) as feedback
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      WHERE t.raised_by_hrms_id = ? AND t.requester_type = 'staff'
      ORDER BY t.created_at DESC`,
                    [user.hrmsId]
                );
            } catch (queryError) {
                if (queryError.code === 'ER_BAD_FIELD_ERROR') {
                    [tickets] = await masterPool.query(
                        `SELECT t.*, c.name as category_name, sc.name as sub_category_name
                         FROM tickets t
                         LEFT JOIN complaint_categories c ON t.category_id = c.id
                         LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
                         WHERE t.admission_number = ? AND t.requester_type = 'staff'
                         ORDER BY t.created_at DESC`,
                        [user.username || user.email || `HRMS-${user.hrmsId}`]
                    );
                } else {
                    throw queryError;
                }
            }
        } else {
            [tickets] = await masterPool.query(
                `SELECT
        t.*,
        c.name as category_name,
        sc.name as sub_category_name,
        (
            SELECT JSON_OBJECT(
                'id', tf_sub.id,
                'rating', tf_sub.rating,
                'feedback_text', tf_sub.feedback_text
            )
            FROM ticket_feedback tf_sub
            WHERE tf_sub.ticket_id = t.id
            LIMIT 1
        ) as feedback
      FROM tickets t
      LEFT JOIN complaint_categories c ON t.category_id = c.id
      LEFT JOIN complaint_categories sc ON t.sub_category_id = sc.id
      WHERE t.raised_by_rbac_id = ? AND t.requester_type = 'staff'
      ORDER BY t.created_at DESC`,
                [user.id]
            );
        }

        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        console.error('Error fetching student tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tickets',
            error: error.message
        });
    }
};

/**
 * Assign ticket to RBAC user(s)
 */
exports.assignTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { assigned_to, notes } = req.body;
        const user = req.user || req.admin;

        if (!assigned_to || !Array.isArray(assigned_to) || assigned_to.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one user must be assigned'
            });
        }

        // Verify ticket exists
        const [tickets] = await masterPool.query('SELECT id, status FROM tickets WHERE id = ?', [id]);
        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Verify all assigned users exist
        const placeholders = assigned_to.map(() => '?').join(',');
        const [users] = await masterPool.query(
            `SELECT id FROM rbac_users WHERE id IN (${placeholders})`,
            assigned_to
        );

        if (users.length !== assigned_to.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more assigned users not found'
            });
        }

        // Deactivate existing assignments
        await masterPool.query(
            'UPDATE ticket_assignments SET is_active = FALSE WHERE ticket_id = ?',
            [id]
        );

        // Create new assignments
        const assignments = [];
        for (const userId of assigned_to) {
            const [result] = await masterPool.query(
                `INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by, notes)
         VALUES (?, ?, ?, ?)`,
                [id, userId, user.id, notes || null]
            );
            assignments.push(result.insertId);
        }

        // Update ticket status to 'approaching' if it was 'pending'
        if (tickets[0].status === 'pending') {
            await updateTicketStatus(id, 'approaching', user.id, 'Ticket assigned to staff');
        }

        res.json({
            success: true,
            message: 'Ticket assigned successfully',
            data: { assignment_ids: assignments }
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning ticket',
            error: error.message
        });
    }
};

/**
 * Update ticket status
 */
const updateTicketStatus = async (ticketId, newStatus, changedBy, notes = null) => {
    const connection = await masterPool.getConnection();
    try {
        await connection.beginTransaction();

        // Get current status
        const [tickets] = await connection.query(
            'SELECT status FROM tickets WHERE id = ?',
            [ticketId]
        );

        if (tickets.length === 0) {
            throw new Error('Ticket not found');
        }

        const oldStatus = tickets[0].status;

        // Update ticket status
        const updateFields = ['status = ?'];
        const updateValues = [newStatus];

        if (newStatus === 'completed') {
            updateFields.push('resolved_at = NOW()');
        } else if (newStatus === 'closed') {
            updateFields.push('closed_at = NOW()');
        }

        updateValues.push(ticketId);

        await connection.query(
            `UPDATE tickets SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Record status history
        await connection.query(
            `INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
            [ticketId, oldStatus, newStatus, changedBy, notes]
        );

        await connection.commit();
        return { success: true };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Update ticket status (API endpoint)
 */
exports.changeTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const user = req.user || req.admin;

        const validStatuses = ['pending', 'approaching', 'resolving', 'completed', 'closed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }

        // We pass user.id even if it's a student to satisfy the NOT NULL constraint on changed_by.
        // Although this might conceptually conflict with RBAC user IDs in history joins, 
        // the notes field will clarify that this was a student action.
        const isStudent = !!(user.role === 'student' || user.admission_number);
        const changedBy = user.id;
        const statusNotes = notes || (isStudent ? 'Status updated by student' : null);
        let finalStatus = status;
        let finalNotes = statusNotes;

        // Reopen Logic: If student reopens (pending), try to auto-assign based on configuration
        if (status === 'pending' && isStudent) {
            try {
                // Get ticket category
                const [ticketInfo] = await masterPool.query('SELECT category_id FROM tickets WHERE id = ?', [id]);

                if (ticketInfo.length > 0) {
                    const category_id = ticketInfo[0].category_id;

                    // Find managers (staff) for this category
                    const [managers] = await masterPool.query(`
                        SELECT rbac_user_id, assigned_categories 
                        FROM ticket_employees 
                        WHERE role = 'staff' AND is_active = 1
                    `);

                    const assignedManagerIds = [];

                    for (const manager of managers) {
                        let categories = [];
                        try {
                            categories = typeof manager.assigned_categories === 'string'
                                ? JSON.parse(manager.assigned_categories)
                                : manager.assigned_categories;
                        } catch (e) {
                            continue;
                        }

                        if (Array.isArray(categories)) {
                            const categoryIds = categories.map(c => Number(c));
                            const targetCategoryId = Number(category_id);

                            if (categoryIds.includes(targetCategoryId)) {
                                assignedManagerIds.push(manager.rbac_user_id);
                            }
                        }
                    }

                    if (assignedManagerIds.length > 0) {
                        // Deactivate old assignments first? Maybe good practice.
                        await masterPool.query('UPDATE ticket_assignments SET is_active = FALSE WHERE ticket_id = ?', [id]);

                        const assignmentValues = assignedManagerIds.map(userId => [
                            id,
                            userId,
                            null, // assigned_by is null for system
                            'Auto-assigned on Reopen (Not Satisfied)'
                        ]);

                        await masterPool.query(
                            `INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by, notes) VALUES ?`,
                            [assignmentValues]
                        );

                        finalStatus = 'approaching';
                        finalNotes += ' (Auto-assigned to manager)';
                    }
                }
            } catch (assignError) {
                console.error('Reopen auto-assignment failed:', assignError);
            }
        }

        await updateTicketStatus(id, finalStatus, changedBy, finalNotes);

        res.json({
            success: true,
            message: 'Ticket status updated successfully'
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating ticket status',
            error: error.message
        });
    }
};

/**
 * Add comment to ticket
 */
exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment_text, is_internal } = req.body;
        const user = req.user || req.admin || req.student;

        if (!comment_text || comment_text.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required'
            });
        }

        // Verify ticket exists
        const [tickets] = await masterPool.query('SELECT id FROM tickets WHERE id = ?', [id]);
        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Determine user type and ID
        let userId, userType;
        if (user.role === 'student' || user.admission_number) {
            const [studentData] = await masterPool.query(
                'SELECT id FROM students WHERE admission_number = ?',
                [user.admission_number]
            );
            if (studentData.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found'
                });
            }
            userId = studentData[0].id;
            userType = 'student';
        } else {
            userId = user.id;
            userType = 'admin';
        }

        const [result] = await masterPool.query(
            `INSERT INTO ticket_comments (ticket_id, user_id, user_type, comment_text, is_internal)
       VALUES (?, ?, ?, ?, ?)`,
            [id, userId, userType, comment_text.trim(), is_internal || false]
        );

        const [comment] = await masterPool.query(
            'SELECT * FROM ticket_comments WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            data: comment[0]
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding comment',
            error: error.message
        });
    }
};

/**
 * Submit feedback for completed ticket
 */
exports.submitFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, feedback_text } = req.body;
        const student = req.user || req.student;

        if (!student || !student.admission_number) {
            return res.status(401).json({
                success: false,
                message: 'Student authentication required'
            });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Verify ticket exists and belongs to student
        const [tickets] = await masterPool.query(
            'SELECT id, status, student_id FROM tickets WHERE id = ? AND admission_number = ?',
            [id, student.admission_number]
        );

        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found or access denied'
            });
        }

        if (tickets[0].status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Feedback can only be submitted for completed tickets'
            });
        }

        // Check if feedback already exists
        const [existing] = await masterPool.query(
            'SELECT id FROM ticket_feedback WHERE ticket_id = ?',
            [id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Feedback already submitted for this ticket'
            });
        }

        const [result] = await masterPool.query(
            `INSERT INTO ticket_feedback (ticket_id, student_id, rating, feedback_text)
       VALUES (?, ?, ?, ?)`,
            [id, tickets[0].student_id, rating, feedback_text || null]
        );

        const [feedback] = await masterPool.query(
            'SELECT * FROM ticket_feedback WHERE id = ?',
            [result.insertId]
        );

        // Auto-close ticket after feedback
        await masterPool.query(
            "UPDATE tickets SET status = 'closed' WHERE id = ?",
            [id]
        );

        // Record status change in history
        await masterPool.query(
            `INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by, notes)
             VALUES (?, 'completed', 'closed', ?, 'Ticket closed automatically after student feedback')`,
            [id, student.id] // Using student ID as they triggered the feedback
        );

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully',
            data: feedback[0]
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting feedback',
            error: error.message
        });
    }
};

/**
 * Get ticket statistics
 */
exports.getTicketStats = async (req, res) => {
    try {
        const [stats] = await masterPool.query(
            `SELECT 
        status,
        COUNT(*) as count
      FROM tickets
      GROUP BY status`
        );

        const [categoryStats] = await masterPool.query(
            `SELECT 
        c.name as category_name,
        COUNT(t.id) as count
      FROM complaint_categories c
      LEFT JOIN tickets t ON c.id = t.category_id
      WHERE c.parent_id IS NULL
      GROUP BY c.id, c.name
      ORDER BY count DESC
      LIMIT 10`
        );

        res.json({
            success: true,
            data: {
                by_status: stats,
                by_category: categoryStats
            }
        });
    } catch (error) {
        console.error('Error fetching ticket stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching ticket stats',
            error: error.message
        });
    }
};

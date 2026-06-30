const { masterPool } = require('../config/database');
const { parseDateString } = require('../utils/dateUtils');

const safeParseJson = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const formatDateKey = (value) => parseDateString(value);

const findBulkInternshipAssignLog = (assignment, bulkLogs) => {
    if (!bulkLogs?.length) return null;

    const internshipId = String(assignment.internship_id);
    const startDate = formatDateKey(assignment.start_date);
    const endDate = formatDateKey(assignment.end_date);
    const createdMs = new Date(assignment.created_at).getTime();

    const candidates = bulkLogs.filter(
        (log) => log.action_type === 'ASSIGN' && String(log.entity_id) === internshipId
    );

    const exact = candidates.find(
        (log) => new Date(log.created_at).getTime() === createdMs
    );
    if (exact) return exact;

    let best = null;
    let bestDiff = Infinity;
    for (const log of candidates) {
        const details = safeParseJson(log.details) || {};
        const logStart = details.startDate ? String(details.startDate).slice(0, 10) : null;
        const logEnd = details.endDate ? String(details.endDate).slice(0, 10) : null;
        const diff = Math.abs(new Date(log.created_at).getTime() - createdMs);
        if (diff <= 10000 && logStart === startDate && logEnd === endDate && diff < bestDiff) {
            best = log;
            bestDiff = diff;
        }
    }
    return best;
};

const applyPerformerFromBulkLog = (entry, bulkLog) => {
    if (!bulkLog) return entry;
    return {
        ...entry,
        admin_id: bulkLog.admin_id,
        rbac_user_id: bulkLog.rbac_user_id,
        performed_by_name: bulkLog.performed_by_name,
        performed_by_role: bulkLog.performed_by_role,
        admin_full_name: bulkLog.performed_by_name,
        admin_role: bulkLog.performed_by_role,
        admin_username: bulkLog.rbac_username || bulkLog.admin_username
    };
};

const parseAllowedDays = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

const internshipAuditKey = (details) => {
    if (!details || typeof details !== 'object') return null;
    if (details.assignmentId) return `assignment:${details.assignmentId}`;
    if (details.internshipId && details.startDate && details.endDate) {
        return `internship:${details.internshipId}:${details.startDate}:${details.endDate}`;
    }
    return null;
};

const mapAuditRow = (row) => ({
    ...row,
    admin_full_name: row.performed_by_name,
    admin_role: row.performed_by_role,
    admin_username: row.rbac_username || row.admin_username,
    details: safeParseJson(row.details)
});

// Helper to determine category from role
const getCategoryFromRole = (role) => {
    switch (role) {
        case 'college_principal': return 'Principal';
        case 'college_ao': return 'AO';
        case 'branch_hod': return 'HOD';
        case 'cashier': return 'Accountant';
        case 'super_admin':
        case 'admin': return 'Admin';
        default: return 'Other';
    }
};

// Get Filtered Regular Students
exports.getStudentsForHistory = async (req, res) => {
    try {
        const { college, course, branch, batch, year, semester } = req.query;

        let query = `
            SELECT id, admission_number, student_name, student_photo, 
                   college, course, branch, batch, current_year, current_semester, student_status
            FROM students 
            WHERE student_status = 'Regular'
        `;
        const params = [];

        if (college) { query += ' AND college = ?'; params.push(college); }
        if (course) { query += ' AND course = ?'; params.push(course); }
        if (branch) { query += ' AND branch = ?'; params.push(branch); }
        if (batch) { query += ' AND batch = ?'; params.push(batch); }
        if (year) { query += ' AND current_year = ?'; params.push(year); }
        if (semester) { query += ' AND current_semester = ?'; params.push(semester); }

        query += ' ORDER BY student_name ASC LIMIT 500'; // Limit to prevent overload

        const [rows] = await masterPool.query(query, params);
        res.json({ success: true, data: rows });

    } catch (error) {
        console.error('Get students history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
};

// Add a new remark to a student's history
exports.addRemark = async (req, res) => {
    try {
        const { admission_number, remark, student_year, student_semester, remark_category } = req.body;

        if (!admission_number || !remark) {
            return res.status(400).json({
                success: false,
                message: 'Admission number and remark content are required'
            });
        }

        // Get student's current year and semester
        const [studentRows] = await masterPool.query(
            'SELECT current_year, current_semester, remarks FROM students WHERE admission_number = ?',
            [admission_number]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const student = studentRows[0];
        const targetYear = student_year != null && student_year !== ''
            ? Number(student_year)
            : student.current_year;
        const targetSemester = student_semester != null && student_semester !== ''
            ? Number(student_semester)
            : student.current_semester;
        const isScholarshipRemark = String(remark_category || '').trim().toLowerCase() === 'scholarship';
        const legacyRemark = student.remarks;

        // Preserve legacy remark if it exists and hasn't been saved to student_remarks yet
        if (!isScholarshipRemark && legacyRemark && legacyRemark.trim() !== '') {
            const [existingLegacy] = await masterPool.query(
                'SELECT id FROM student_remarks WHERE admission_number = ? AND remark = ?',
                [admission_number, legacyRemark]
            );
            if (existingLegacy.length === 0) {
                // Save legacy remark into history permanently before overwriting
                await masterPool.query(
                    `INSERT INTO student_remarks 
                     (admission_number, remark, remark_category, created_by_name, created_at) 
                     VALUES (?, ?, 'Initial', 'System', DATE_SUB(NOW(), INTERVAL 1 SECOND))`
                    , [admission_number, legacyRemark]
                );
            }
        }

        // Get user info from request (populated by auth middleware)
        const createdBy = req.user.id;
        const createdByName = req.user.username;
        const resolvedCategory = remark_category || getCategoryFromRole(req.user.role);

        const [result] = await masterPool.query(
            `INSERT INTO student_remarks 
             (admission_number, remark, remark_category, student_year, student_semester, created_by, created_by_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [admission_number, remark, resolvedCategory, targetYear, targetSemester, createdBy, createdByName]
        );

        // SYNC: Update the main students table with the latest general remark only
        if (!isScholarshipRemark) {
            await masterPool.query(
                'UPDATE students SET remarks = ? WHERE admission_number = ?',
                [remark, admission_number]
            );
        }

        res.status(201).json({
            success: true,
            message: 'Remark added successfully',
            data: {
                id: result.insertId,
                admission_number,
                remark,
                remark_category: resolvedCategory,
                student_year: targetYear,
                student_semester: targetSemester,
                created_by: createdBy,
                created_by_name: createdByName,
                created_at: new Date()
            }
        });

    } catch (error) {
        console.error('Add remark error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add remark'
        });
    }
};

// Update a remark (only by the creator or super admin)
exports.updateRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;

        if (!remark) {
            return res.status(400).json({
                success: false,
                message: 'Remark content is required'
            });
        }

        // Get the existing remark
        const [existingRemarks] = await masterPool.query(
            'SELECT * FROM student_remarks WHERE id = ?',
            [id]
        );

        if (existingRemarks.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Remark not found'
            });
        }

        const existingRemark = existingRemarks[0];

        // Check if user has permission to edit
        const isSuperAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
        const isCreator = existingRemark.created_by === req.user.id;

        if (!isSuperAdmin && !isCreator) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own remarks'
            });
        }

        // Update the remark
        await masterPool.query(
            `UPDATE student_remarks 
             SET remark = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [remark, req.user.username, id]
        );

        // SYNC: Check if this is the most recent remark for the student; if so, update students table
        const [latestRemarkRows] = await masterPool.query(
            'SELECT id FROM student_remarks WHERE admission_number = ? ORDER BY created_at DESC LIMIT 1',
            [existingRemark.admission_number]
        );

        if (latestRemarkRows.length > 0 && latestRemarkRows[0].id === parseInt(id)) {
            await masterPool.query(
                'UPDATE students SET remarks = ? WHERE admission_number = ?',
                [remark, existingRemark.admission_number]
            );
        }

        res.json({
            success: true,
            message: 'Remark updated successfully'
        });

    } catch (error) {
        console.error('Update remark error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update remark'
        });
    }
};

// Delete a remark (only by the creator or super admin)
exports.deleteRemark = async (req, res) => {
    try {
        const { id } = req.params;

        // Get the existing remark
        const [existingRemarks] = await masterPool.query(
            'SELECT * FROM student_remarks WHERE id = ?',
            [id]
        );

        if (existingRemarks.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Remark not found'
            });
        }

        const existingRemark = existingRemarks[0];

        // Check if user has permission to delete
        const isSuperAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
        const isCreator = existingRemark.created_by === req.user.id;

        if (!isSuperAdmin && !isCreator) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own remarks'
            });
        }

        // Delete the remark
        await masterPool.query(
            'DELETE FROM student_remarks WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Remark deleted successfully'
        });

    } catch (error) {
        console.error('Delete remark error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete remark'
        });
    }
};

// Get all remarks for a specific student
exports.getRemarks = async (req, res) => {
    try {
        const { admission_number } = req.params;

        if (!admission_number) {
            return res.status(400).json({
                success: false,
                message: 'Admission number is required'
            });
        }

        const [rows] = await masterPool.query(
            `SELECT * FROM student_remarks 
             WHERE admission_number = ? 
             ORDER BY created_at DESC`,
            [admission_number]
        );

        // Fetch the legacy remark from the students table to see if it should be included
        const [legacyRows] = await masterPool.query(
            'SELECT remarks, created_at FROM students WHERE admission_number = ?',
            [admission_number]
        );

        const legacyRemark = legacyRows.length > 0 ? legacyRows[0].remarks : null;

        // If there's a legacy remark and it's not already in the history logs, add it as an "Initial Remark"
        // We compare against the list of remarks to avoid duplicates if they were already synced
        if (legacyRemark && legacyRemark.trim() !== '') {
            const alreadyExists = rows.some(r => r.remark === legacyRemark);
            if (!alreadyExists) {
                rows.push({
                    id: 'legacy-' + admission_number,
                    admission_number,
                    remark: legacyRemark,
                    remark_category: 'Initial',
                    created_by_name: 'System',
                    created_at: legacyRows[0].created_at || new Date(0), // Fallback to epoch if unknown
                    is_legacy: true
                });
                // Sort again to ensure legacy remark is in correct chronological position
                rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        }

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Get remarks error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch remarks'
        });
    }
};

/**
 * GET /api/student-history/audit/:admission_number
 * All audit log entries for a student with performer (admin / RBAC user) details.
 */
exports.getStudentAuditLogs = async (req, res) => {
    try {
        const { admission_number: admissionNumber } = req.params;
        const parsedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(parsedLimit) || parsedLimit <= 0
            ? 300
            : Math.min(parsedLimit, 500);

        if (!admissionNumber) {
            return res.status(400).json({
                success: false,
                message: 'Admission number is required'
            });
        }

        const [students] = await masterPool.query(
            `SELECT id, admission_number, admission_no, pin_no
             FROM students
             WHERE admission_number = ? OR admission_no = ? OR pin_no = ?
             LIMIT 1`,
            [admissionNumber, admissionNumber, admissionNumber]
        );

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const student = students[0];
        const entityIds = [...new Set(
            [student.admission_number, student.admission_no, student.pin_no]
                .filter((value) => value != null && String(value).trim() !== '')
                .map((value) => String(value).trim())
        )];

        const idPlaceholders = entityIds.map(() => '?').join(', ');
        const detailParams = [...entityIds, ...entityIds, ...entityIds];

        const [rows] = await masterPool.query(
            `SELECT
                al.id,
                al.action_type,
                al.entity_type,
                al.entity_id,
                al.admin_id,
                al.rbac_user_id,
                al.details,
                al.ip_address,
                al.created_at,
                a.username AS admin_username,
                ru.username AS rbac_username,
                ru.name AS rbac_user_name,
                ru.role AS rbac_user_role,
                COALESCE(ru.name, a.username) AS performed_by_name,
                COALESCE(ru.role, CASE WHEN al.admin_id IS NOT NULL THEN 'admin' ELSE NULL END) AS performed_by_role
             FROM audit_logs al
             LEFT JOIN admins a ON al.admin_id = a.id
             LEFT JOIN rbac_users ru ON al.rbac_user_id = ru.id
             WHERE al.entity_type = 'STUDENT'
               AND (
                 al.entity_id IN (${idPlaceholders})
                 OR JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.admission_number')) IN (${idPlaceholders})
                 OR JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.admissionNumber')) IN (${idPlaceholders})
               )
             ORDER BY al.created_at DESC
             LIMIT ?`,
            [...detailParams, limit]
        );

        const auditData = rows.map(mapAuditRow);

        const auditInternshipKeys = new Set(
            auditData
                .filter((row) => ['INTERNSHIP_ASSIGN', 'INTERNSHIP_UPDATE', 'INTERNSHIP_REMOVE'].includes(row.action_type))
                .map((row) => internshipAuditKey(row.details))
                .filter(Boolean)
        );

        const [assignmentRows] = await masterPool.query(
            `SELECT
                ia.id AS assignment_id,
                ia.internship_id,
                ia.start_date,
                ia.end_date,
                ia.allowed_days,
                ia.created_at,
                il.company_name
             FROM internship_assignments ia
             INNER JOIN internship_locations il ON il.id = ia.internship_id
             WHERE ia.student_id = ?
             ORDER BY ia.created_at DESC`,
            [student.id]
        );

        let bulkAssignLogs = [];
        if (assignmentRows.length > 0) {
            const internshipIds = [...new Set(assignmentRows.map((row) => String(row.internship_id)))];
            const placeholders = internshipIds.map(() => '?').join(', ');
            const [bulkRows] = await masterPool.query(
                `SELECT
                    al.id,
                    al.action_type,
                    al.entity_type,
                    al.entity_id,
                    al.admin_id,
                    al.rbac_user_id,
                    al.details,
                    al.created_at,
                    a.username AS admin_username,
                    ru.username AS rbac_username,
                    COALESCE(ru.name, a.username) AS performed_by_name,
                    COALESCE(ru.role, CASE WHEN al.admin_id IS NOT NULL THEN 'admin' ELSE NULL END) AS performed_by_role
                 FROM audit_logs al
                 LEFT JOIN admins a ON al.admin_id = a.id
                 LEFT JOIN rbac_users ru ON al.rbac_user_id = ru.id
                 WHERE al.entity_type = 'INTERNSHIP_ASSIGNMENT'
                   AND al.action_type = 'ASSIGN'
                   AND al.entity_id IN (${placeholders})
                 ORDER BY al.created_at DESC`,
                internshipIds
            );
            bulkAssignLogs = bulkRows;
        }

        const synthesizedInternshipEntries = assignmentRows
            .map((assignment) => {
                const bulkLog = findBulkInternshipAssignLog(assignment, bulkAssignLogs);
                const details = {
                    assignmentId: assignment.assignment_id,
                    internshipId: assignment.internship_id,
                    companyName: assignment.company_name,
                    startDate: formatDateKey(assignment.start_date),
                    endDate: formatDateKey(assignment.end_date),
                    allowedDays: parseAllowedDays(assignment.allowed_days),
                    fromAssignmentRecord: true
                };
                const entry = {
                    id: `internship-assignment-${assignment.assignment_id}`,
                    action_type: 'INTERNSHIP_ASSIGN',
                    entity_type: 'STUDENT',
                    entity_id: student.admission_number,
                    admin_id: null,
                    rbac_user_id: null,
                    details,
                    ip_address: null,
                    created_at: assignment.created_at,
                    performed_by_name: null,
                    performed_by_role: null,
                    admin_full_name: null,
                    admin_role: null,
                    admin_username: null,
                    _synthesized: true
                };
                return applyPerformerFromBulkLog(entry, bulkLog);
            })
            .filter((entry) => {
                const key = internshipAuditKey(entry.details);
                return !key || !auditInternshipKeys.has(key);
            });

        const data = [...auditData, ...synthesizedInternshipEntries]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);

        res.json({
            success: true,
            data,
            meta: {
                admissionNumber: student.admission_number,
                total: data.length,
                limit,
                synthesizedInternshipCount: synthesizedInternshipEntries.length
            }
        });
    } catch (error) {
        console.error('Get student audit logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch student audit history'
        });
    }
};

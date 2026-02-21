const { masterPool } = require('../config/database');

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
        const { admission_number, remark } = req.body;

        if (!admission_number || !remark) {
            return res.status(400).json({
                success: false,
                message: 'Admission number and remark content are required'
            });
        }

        // Get student's current year and semester
        const [studentRows] = await masterPool.query(
            'SELECT current_year, current_semester FROM students WHERE admission_number = ?',
            [admission_number]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const student = studentRows[0];

        // Get user info from request (populated by auth middleware)
        const createdBy = req.user.id;
        const createdByName = req.user.username;
        const remarkCategory = getCategoryFromRole(req.user.role);

        const [result] = await masterPool.query(
            `INSERT INTO student_remarks 
             (admission_number, remark, remark_category, student_year, student_semester, created_by, created_by_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [admission_number, remark, remarkCategory, student.current_year, student.current_semester, createdBy, createdByName]
        );

        // SYNC: Update the main students table with the latest remark
        await masterPool.query(
            'UPDATE students SET remarks = ? WHERE admission_number = ?',
            [remark, admission_number]
        );

        res.status(201).json({
            success: true,
            message: 'Remark added successfully',
            data: {
                id: result.insertId,
                admission_number,
                remark,
                remark_category: remarkCategory,
                student_year: student.current_year,
                student_semester: student.current_semester,
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

const { masterPool } = require('../config/database');
const { buildScopeConditions } = require('../utils/scoping');

/** Admission number from student JWT only — never from request body (prevents IDOR). */
function getStudentAdmissionFromToken(user) {
    if (!user || user.role !== 'student') return null;
    const admission = user.admissionNumber || user.admission_number;
    return admission ? String(admission).trim() : null;
}

/**
 * Ensure a student (by admission number) falls within the caller's RBAC scope.
 * Returns { allowed, student } or sends 403/404 via res when not allowed.
 */
async function ensureStudentInScope(connection, admissionNumber, userScope, res) {
    let query = `
        SELECT s.admission_number, s.student_name, s.college, s.course, s.branch
        FROM students s
        WHERE s.admission_number = ?
    `;
    const params = [admissionNumber];

    if (userScope) {
        const { conditions, params: scopeParams } = buildScopeConditions(userScope, 's');
        if (conditions.length > 0) {
            query += ` AND ${conditions.join(' AND ')}`;
            params.push(...scopeParams);
        }
    }

    const [rows] = await connection.query(query, params);
    if (rows.length === 0) {
        // Distinguish not-found vs out-of-scope
        const [any] = await connection.query(
            'SELECT admission_number FROM students WHERE admission_number = ? LIMIT 1',
            [admissionNumber]
        );
        if (any.length === 0) {
            res.status(404).json({ success: false, message: 'Student not found' });
        } else {
            res.status(403).json({
                success: false,
                message: 'Access denied. Student is outside your assigned scope'
            });
        }
        return { allowed: false };
    }
    return { allowed: true, student: rows[0] };
}

async function insertPendingRequest(admissionNumber, requested_changes) {
    const [existing] = await masterPool.query(
        'SELECT id FROM profile_change_requests WHERE admission_number = ? AND status = "pending"',
        [admissionNumber]
    );

    if (existing.length > 0) {
        return { conflict: true };
    }

    await masterPool.query(
        'INSERT INTO profile_change_requests (admission_number, requested_changes, status) VALUES (?, ?, "pending")',
        [admissionNumber, JSON.stringify(requested_changes)]
    );

    return { conflict: false };
}

// Student submits a profile change request (own admission from JWT only)
exports.submitRequest = async (req, res) => {
    try {
        const admissionNumber = getStudentAdmissionFromToken(req.user);
        const { requested_changes } = req.body;

        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        if (!requested_changes || Object.keys(requested_changes).length === 0) {
            return res.status(400).json({ success: false, message: 'No changes provided' });
        }

        const result = await insertPendingRequest(admissionNumber, requested_changes);
        if (result.conflict) {
            return res.status(400).json({ success: false, message: 'You already have a pending change request' });
        }

        res.status(201).json({ success: true, message: 'Profile change request submitted successfully' });
    } catch (error) {
        console.error('Error submitting profile change request:', error);
        res.status(500).json({ success: false, message: 'Server error while submitting request' });
    }
};

// Staff submits a profile change request on behalf of a scoped student
exports.submitRequestByAdmin = async (req, res) => {
    try {
        const admissionNumber = req.body?.admission_number
            ? String(req.body.admission_number).trim()
            : null;
        const { requested_changes } = req.body;

        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        if (!requested_changes || Object.keys(requested_changes).length === 0) {
            return res.status(400).json({ success: false, message: 'No changes provided' });
        }

        const scopeCheck = await ensureStudentInScope(masterPool, admissionNumber, req.userScope, res);
        if (!scopeCheck.allowed) return;

        const result = await insertPendingRequest(admissionNumber, requested_changes);
        if (result.conflict) {
            return res.status(400).json({
                success: false,
                message: 'This student already has a pending change request'
            });
        }

        res.status(201).json({ success: true, message: 'Profile change request submitted successfully' });
    } catch (error) {
        console.error('Error submitting profile change request (admin):', error);
        res.status(500).json({ success: false, message: 'Server error while submitting request' });
    }
};

// Student fetches their own requests
exports.getStudentRequests = async (req, res) => {
    try {
        const admissionNumber = getStudentAdmissionFromToken(req.user);
        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        const [requests] = await masterPool.query(
            'SELECT * FROM profile_change_requests WHERE admission_number = ? ORDER BY created_at DESC',
            [admissionNumber]
        );

        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching student requests:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching requests' });
    }
};

// Admin fetches all requests (scoped + optional course/branch filters)
exports.getAllRequests = async (req, res) => {
    try {
        const { status, course, branch } = req.query;
        let query = `
            SELECT p.*, s.student_name, s.course, s.branch, s.current_year, s.current_semester 
            FROM profile_change_requests p
            JOIN students s ON p.admission_number = s.admission_number
        `;
        const params = [];
        const conditions = [];

        if (status) {
            conditions.push('p.status = ?');
            params.push(status);
        }

        if (course) {
            conditions.push('s.course = ?');
            params.push(String(course).trim());
        }

        if (branch) {
            conditions.push('s.branch = ?');
            params.push(String(branch).trim());
        }

        if (req.userScope) {
            const { conditions: scopeConditions, params: scopeParams } =
                buildScopeConditions(req.userScope, 's');
            conditions.push(...scopeConditions);
            params.push(...scopeParams);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ' ORDER BY p.created_at DESC';

        const [requests] = await masterPool.query(query, params);
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching requests' });
    }
};

// Admin updates request status (must be in scope)
exports.updateRequestStatus = async (req, res) => {
    const connection = await masterPool.getConnection();
    try {
        const { id } = req.params;
        const { status, comments } = req.body;

        // Ensure status is valid
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Get the request details joined with student for scope check
        let requestQuery = `
            SELECT p.*, s.college, s.course, s.branch
            FROM profile_change_requests p
            JOIN students s ON p.admission_number = s.admission_number
            WHERE p.id = ?
        `;
        const requestParams = [id];

        if (req.userScope) {
            const { conditions: scopeConditions, params: scopeParams } =
                buildScopeConditions(req.userScope, 's');
            if (scopeConditions.length > 0) {
                requestQuery += ` AND ${scopeConditions.join(' AND ')}`;
                requestParams.push(...scopeParams);
            }
        }

        const [requests] = await connection.query(requestQuery, requestParams);

        if (requests.length === 0) {
            // Check if request exists at all (out of scope vs missing)
            const [any] = await connection.query(
                'SELECT id FROM profile_change_requests WHERE id = ?',
                [id]
            );
            if (any.length === 0) {
                return res.status(404).json({ success: false, message: 'Request not found' });
            }
            return res.status(403).json({
                success: false,
                message: 'Access denied. Request is outside your assigned scope'
            });
        }

        const request = requests[0];

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Request is already processed' });
        }

        await connection.beginTransaction();

        // If approved, update the student record
        if (status === 'approved') {
            let changes = request.requested_changes;
            if (typeof changes === 'string') {
                changes = JSON.parse(changes);
            }

            // Construct UPDATE query dynamically based on the requested changes
            const validStudentColumns = [
                'student_name', 'student_mobile', 'father_name', 'dob', 'adhar_no',
                'parent_mobile1', 'parent_mobile2', 'student_address', 'city_village',
                'mandal_name', 'district', 'caste', 'gender', 'blood_group'
            ];

            // Mapping dictionary from common form keys/JSON keys -> Database columns
            const keyMappingsToDB = {
                'aadhar_no': 'adhar_no',
                'adhar': 'adhar_no',
                'gender': 'gender',
                'sex': 'gender',
                'date of birth': 'dob',
                'dob': 'dob',
                'caste': 'caste',
                'category': 'caste',
                'blood_group': 'blood_group',
                'student_name': 'student_name',
                'father_name': 'father_name',
                'student_mobile': 'student_mobile',
                'student_address': 'student_address',
                'city_village': 'city_village',
                'mandal_name': 'mandal_name',
                'district': 'district',
                'parent_mobile1': 'parent_mobile1',
                'parent_mobile2': 'parent_mobile2'
            };

            const updates = [];
            const updateValues = [];

            // Normalize changes object first to redirect standard fields to DB columns
            let jsonOnlyChanges = {};

            // Sort changes into main DB columns vs JSON columns
            for (const [key, value] of Object.entries(changes)) {
                // Try case insensitive match against the mapping dictionary
                let matchedDBCol = null;
                const lowerKey = String(key).toLowerCase();

                if (validStudentColumns.includes(key)) {
                    matchedDBCol = key;
                } else {
                    for (const [mapKey, dbCol] of Object.entries(keyMappingsToDB)) {
                        if (lowerKey === mapKey || lowerKey.includes(mapKey)) {
                            matchedDBCol = dbCol;
                            break;
                        }
                    }
                }

                if (matchedDBCol && validStudentColumns.includes(matchedDBCol)) {
                    // For dates, format correctly if it's a date string
                    let formattedValue = value;
                    if (matchedDBCol === 'dob' && value && value.includes('T')) {
                        formattedValue = value.split('T')[0];
                    }

                    // Normalize gender
                    if (matchedDBCol === 'gender' && value) {
                        const s = String(value).trim().toUpperCase();
                        if (['M', 'MALE', 'BOY', '1'].includes(s)) formattedValue = 'M';
                        else if (['F', 'FEMALE', 'GIRL', '2'].includes(s)) formattedValue = 'F';
                        else formattedValue = 'Other';
                    }

                    if (!updates.includes(`${matchedDBCol} = ?`)) { // Prevent duplicate DB updates
                        updates.push(`${matchedDBCol} = ?`);
                        updateValues.push(formattedValue);
                    }
                }

                // Keep it in jsonOnlyChanges as well so the verbatim form JSON record matches 
                // what the student actually typed into the UI
                jsonOnlyChanges[key] = value;
            }

            if (updates.length > 0) {
                // Ensure we add admission_number at the very end
                updateValues.push(request.admission_number);

                const updateQuery = `UPDATE students SET ${updates.join(', ')} WHERE admission_number = ?`;
                await connection.query(updateQuery, updateValues);
            }

            // Also update the JSON column 'student_data' if it exists. 
            // Using a safe approach to merge json
            const [studentRows] = await connection.query('SELECT student_data FROM students WHERE admission_number = ?', [request.admission_number]);
            if (studentRows.length > 0) {
                let stData = studentRows[0].student_data;
                if (typeof stData === 'string') {
                    try { stData = JSON.parse(stData); } catch (e) { stData = {}; }
                }
                if (!stData) stData = {};

                let dataChanged = false;
                for (const [key, value] of Object.entries(jsonOnlyChanges)) {
                    stData[key] = value;
                    dataChanged = true;
                }

                if (dataChanged) {
                    await connection.query('UPDATE students SET student_data = ? WHERE admission_number = ?', [JSON.stringify(stData), request.admission_number]);
                }
            }
        }

        // Update the request status
        const adminName = req.admin?.name || req.user?.username || req.user?.name || 'Admin';
        await connection.query(
            'UPDATE profile_change_requests SET status = ?, comments = ?, reviewed_by = ? WHERE id = ?',
            [status, comments || '', adminName, id]
        );

        await connection.commit();
        res.json({ success: true, message: `Request ${status} successfully` });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating request status:', error);
        res.status(500).json({ success: false, message: 'Server error while updating request' });
    } finally {
        connection.release();
    }
};

// Admin fetches all requests for a specific student (by admission number, scoped)
exports.getRequestsByAdmission = async (req, res) => {
    try {
        const { admission_number } = req.params;
        if (!admission_number) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        const scopeCheck = await ensureStudentInScope(masterPool, admission_number, req.userScope, res);
        if (!scopeCheck.allowed) return;

        const [requests] = await masterPool.query(
            `SELECT p.id, p.admission_number, p.requested_changes, p.status,
                    p.created_at, p.updated_at, p.reviewed_by, p.comments
             FROM profile_change_requests p
             WHERE p.admission_number = ?
             ORDER BY p.created_at DESC`,
            [admission_number]
        );

        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching requests by admission number:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching requests' });
    }
};

// Student marks profile as verified (no changes needed) — own JWT admission only
exports.markVerified = async (req, res) => {
    try {
        const admissionNumber = getStudentAdmissionFromToken(req.user);

        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        const [rows] = await masterPool.query('SELECT student_data FROM students WHERE admission_number = ?', [admissionNumber]);
        let stData = {};
        if (rows.length > 0 && rows[0].student_data) {
            let existingData = rows[0].student_data;
            if (typeof existingData === 'string') {
                try { stData = JSON.parse(existingData); } catch (e) { stData = {}; }
            } else {
                stData = existingData;
            }
        }

        stData.profile_verified = true;
        stData.profile_verified_at = new Date().toISOString();

        await masterPool.query('UPDATE students SET student_data = ? WHERE admission_number = ?', [JSON.stringify(stData), admissionNumber]);

        res.json({ success: true, message: 'Profile marked as verified successfully' });
    } catch (error) {
        console.error('Error marking profile as verified:', error);
        res.status(500).json({ success: false, message: 'Server error while verifying profile' });
    }
};

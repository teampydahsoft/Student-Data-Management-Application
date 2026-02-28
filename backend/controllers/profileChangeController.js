const { masterPool } = require('../config/database');

// Student submits a profile change request
exports.submitRequest = async (req, res) => {
    try {
        const admissionNumber = req.user?.admission_number || req.body?.admission_number;
        const { requested_changes } = req.body;

        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'Admission number is required' });
        }

        if (!requested_changes || Object.keys(requested_changes).length === 0) {
            return res.status(400).json({ success: false, message: 'No changes provided' });
        }

        // Check if there is already a pending request
        const [existing] = await masterPool.query(
            'SELECT id FROM profile_change_requests WHERE admission_number = ? AND status = "pending"',
            [admissionNumber]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have a pending change request' });
        }

        await masterPool.query(
            'INSERT INTO profile_change_requests (admission_number, requested_changes, status) VALUES (?, ?, "pending")',
            [admissionNumber, JSON.stringify(requested_changes)]
        );

        res.status(201).json({ success: true, message: 'Profile change request submitted successfully' });
    } catch (error) {
        console.error('Error submitting profile change request:', error);
        res.status(500).json({ success: false, message: 'Server error while submitting request' });
    }
};

// Student fetches their own requests
exports.getStudentRequests = async (req, res) => {
    try {
        const admissionNumber = req.user.admission_number;
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

// Admin fetches all requests
exports.getAllRequests = async (req, res) => {
    try {
        const status = req.query.status;
        let query = `
            SELECT p.*, s.student_name, s.course, s.branch, s.current_year, s.current_semester 
            FROM profile_change_requests p
            JOIN students s ON p.admission_number = s.admission_number
        `;
        const params = [];

        if (status) {
            query += ' WHERE p.status = ?';
            params.push(status);
        }

        query += ' ORDER BY p.created_at DESC';

        const [requests] = await masterPool.query(query, params);
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching requests' });
    }
};

// Admin updates request status
exports.updateRequestStatus = async (req, res) => {
    const connection = await masterPool.getConnection();
    try {
        const { id } = req.params;
        const { status, comments } = req.body;

        // Ensure status is valid
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Get the request details
        const [requests] = await connection.query(
            'SELECT * FROM profile_change_requests WHERE id = ?',
            [id]
        );

        if (requests.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];

        if (request.status !== 'pending') {
            connection.release();
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
            let normalizedChanges = { ...changes };
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
        const adminName = req.admin?.name || req.user?.username || 'Admin';
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

// Student marks profile as verified (no changes needed)
exports.markVerified = async (req, res) => {
    try {
        const admissionNumber = req.user?.admission_number || req.body?.admission_number;

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

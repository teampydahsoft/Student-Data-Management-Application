const { masterPool } = require('../config/database');
const { syncStudentToAdmissions, triggerAdmissionsSyncAsync } = require('../services/admissionsSyncService');
const { buildScopeConditions } = require('../utils/scoping');

let profileReportStudentColumnsPromise;

const getProfileReportStudentColumns = async () => {
    if (!profileReportStudentColumnsPromise) {
        profileReportStudentColumnsPromise = masterPool.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'`
        ).then(([rows]) => new Set(rows.map(row => row.COLUMN_NAME)));
    }
    try {
        return await profileReportStudentColumnsPromise;
    } catch (error) {
        profileReportStudentColumnsPromise = null;
        throw error;
    }
};

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
        FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
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

const PROFILE_COMPLETION_FIELDS = [
    { key: 'student_name', label: 'Student Name', altKeys: ['Student Name', 'studentname'] },
    { key: 'pin_no', label: 'PIN Number', altKeys: ['Pin Number', 'PIN Number', 'pin_no'] },
    { key: 'dob', label: 'Date of Birth', altKeys: ['DOB (Date of Birth - DD-MM-YYYY)', 'DOB (Date-Month-Year) Ex: 09-Sep-2003)', 'date_of_birth'] },
    { key: 'adhar_no', label: 'Aadhaar Number', altKeys: ['ADHAR No', 'aadhar_no', 'aadhaar_no'] },
    { key: 'apaar_id', label: 'APAAR ID', altKeys: ['APAAR ID', 'apaar id'] },
    { key: 'father_name', label: 'Father Name', altKeys: ['Father Name', 'fathername'] },
    { key: 'gender', label: 'Gender', altKeys: ['M/F', 'Gender'] },
    { key: 'category_id', label: 'Category', altKeys: ['Category'] },
    { key: 'admission_number', label: 'Admission Number', altKeys: ['Admission Number', 'Admission No', 'admission_no'] },
    { key: 'course', label: 'Program', altKeys: ['Program', 'Program Name'] },
    { key: 'branch', label: 'Branch', altKeys: ['Branch', 'Branch Name'] },
    { key: 'batch', label: 'Batch', altKeys: ['Batch'] },
    { key: 'college', label: 'College', altKeys: ['College', 'College Name'] },
    { key: 'stud_type', label: 'Quota', altKeys: ['StudType', 'Student Type', 'student_type'] },
    { key: 'current_year', label: 'Current Year', altKeys: ['Current Academic Year', 'Current Year', 'Year'] },
    { key: 'current_semester', label: 'Current Semester', altKeys: ['Current Semester', 'Semester', 'Semister'] },
    { key: 'admission_date', label: 'Admission Date', altKeys: ['Admission Date', 'admission_date'] },
    { key: 'parent_mobile1', label: 'Parent Mobile 1', altKeys: ['Parent Mobile Number 1', 'Parent Mobile 1', 'parent_mobile_1'] },
    { key: 'parent_mobile2', label: 'Parent Mobile 2', altKeys: ['Parent Mobile Number 2', 'Parent Mobile 2', 'parent_mobile_2'] },
    { key: 'student_address', label: 'Permanent Address', altKeys: ['Student Address (D.No, Str name, Village, Mandal, Dist)', 'Student Address', 'address'] },
    { key: 'city_village', label: 'City/Village', altKeys: ['City/Village', 'City/Village Name', 'city_village_name'] },
    { key: 'mandal_name', label: 'Mandal', altKeys: ['Mandal Name', 'Mandal', 'mandal'] },
    { key: 'district', label: 'District', altKeys: ['District', 'District Name'] },
    { key: 'student_status', label: 'Student Status', altKeys: ['Student Status', 'studentstatus'] },
    { key: 'scholar_status', label: 'Scholar Status', altKeys: ['Scholar Status', 'scholarstatus'] },
    { key: 'certificates_status', label: 'Certificate Status', altKeys: ['Certificates Status', 'Certificate Status', 'certificatesstatus'] },
    { key: 'previous_college', label: 'Previous College', altKeys: ['Previous College Name', 'Previous College', 'previouscollege'] },
    { key: 'student_photo', label: 'Student Photo', altKeys: ['Student Photo', 'photo', 'studentphoto'] }
];

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

// Report profile completion using the same fields and value rules as the Students page.
exports.getProfileCompletionReport = async (req, res) => {
    try {
        const { status, college, batch, course, branch, year, semester, search } = req.query;
        const page = Number.parseInt(req.query.page, 10) || 1;
        const pageSizeParam = req.query.pageSize || '25';
        const pageSize = pageSizeParam === 'all' ? null : Number.parseInt(pageSizeParam, 10);
        if (status && !['all', 'completed', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid profile completion status' });
        }
        if (page < 1 || (pageSize !== null && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100))) {
            return res.status(400).json({ success: false, message: 'Invalid pagination parameters' });
        }

        const conditions = ["LOWER(TRIM(s.student_status)) = 'regular'"];
        const params = [];
        const isNumeric = (value) => /^\d+$/.test(String(value));

        if (req.userScope) {
            const { conditions: scopeConditions, params: scopeParams } =
                buildScopeConditions(req.userScope, 's');
            conditions.push(...scopeConditions);
            params.push(...scopeParams);
        }

        if (college) {
            if (isNumeric(college)) {
                conditions.push('s.college_id = ?');
                params.push(parseInt(college, 10));
            } else {
                conditions.push('s.college = ?');
                params.push(String(college).trim());
            }
        }
        if (batch) {
            conditions.push('s.batch = ?');
            params.push(String(batch).trim());
        }
        if (course) {
            conditions.push(isNumeric(course) ? 's.course_id = ?' : 's.course = ?');
            params.push(isNumeric(course) ? parseInt(course, 10) : String(course).trim());
        }
        if (branch) {
            conditions.push(isNumeric(branch) ? 's.branch_id = ?' : 's.branch = ?');
            params.push(isNumeric(branch) ? parseInt(branch, 10) : String(branch).trim());
        }
        if (year) {
            if (!isNumeric(year)) {
                return res.status(400).json({ success: false, message: 'Invalid year filter' });
            }
            conditions.push('s.current_year = ?');
            params.push(parseInt(year, 10));
        }
        if (semester) {
            if (!isNumeric(semester)) {
                return res.status(400).json({ success: false, message: 'Invalid semester filter' });
            }
            conditions.push('s.current_semester = ?');
            params.push(parseInt(semester, 10));
        }
        if (search && String(search).trim()) {
            const searchTerm = `%${String(search).trim()}%`;
            conditions.push('(s.student_name LIKE ? OR s.admission_number LIKE ? OR s.admission_no LIKE ?)');
            params.push(searchTerm, searchTerm, searchTerm);
        }

        const availableStudentColumns = await getProfileReportStudentColumns();
        const selectedColumns = new Set([
            'id',
            'admission_number',
            'admission_no',
            'student_name',
            'student_status',
            'college_id',
            'college',
            'course_id',
            'course',
            'branch_id',
            'branch',
            'batch',
            'current_year',
            'current_semester',
            'student_data'
        ]);
        for (const field of PROFILE_COMPLETION_FIELDS) {
            if (availableStudentColumns.has(field.key) && field.key !== 'student_photo') {
                selectedColumns.add(field.key);
            }
            for (const alias of field.altKeys || []) {
                if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias) && availableStudentColumns.has(alias)) {
                    selectedColumns.add(alias);
                }
            }
        }
        const studentColumnsSql = [...selectedColumns]
            .filter(column => availableStudentColumns.has(column))
            .map(column => `s.\`${column}\``);
        if (availableStudentColumns.has('student_photo')) {
            studentColumnsSql.push(`
                CASE
                    WHEN s.student_photo IS NOT NULL
                     AND TRIM(s.student_photo) NOT IN ('', 'n/a', '-', '{}', 'null', 'undefined')
                    THEN 'present'
                    ELSE NULL
                END AS student_photo
            `);
        }

        let query = `
            SELECT ${studentColumnsSql.join(', ')},
                   COALESCE(c.name, s.college) AS resolved_college,
                   COALESCE(co.name, s.course) AS resolved_course,
                   COALESCE(cb.name, s.branch) AS resolved_branch
            FROM students s
            LEFT JOIN colleges c ON s.college_id = c.id
            LEFT JOIN courses co ON s.course_id = co.id
            LEFT JOIN course_branches cb ON s.branch_id = cb.id
        `;
        if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ' ORDER BY s.student_name ASC, s.admission_number ASC';

        const [students] = await masterPool.query(query, params);
        const reportRows = students.map(student => {
            let studentData = student.student_data;
            if (typeof studentData === 'string') {
                try { studentData = JSON.parse(studentData); } catch { studentData = {}; }
            }
            if (!studentData || typeof studentData !== 'object') studentData = {};
            Object.assign(studentData, student.student_data && typeof student.student_data === 'object'
                ? student.student_data
                : {});
            const completionStudent = {
                ...student,
                college: student.resolved_college,
                course: student.resolved_course,
                branch: student.resolved_branch
            };
            const getFieldValue = (key, altKeys) => {
                const directValue = completionStudent[key];
                if (directValue !== undefined && directValue !== null && directValue !== '') return directValue;
                const jsonValue = studentData[key];
                if (jsonValue !== undefined && jsonValue !== null && jsonValue !== '') return jsonValue;
                for (const altKey of altKeys) {
                    const studentValue = completionStudent[altKey];
                    if (studentValue !== undefined && studentValue !== null && studentValue !== '') return studentValue;
                    const alternateJsonValue = studentData[altKey];
                    if (alternateJsonValue !== undefined && alternateJsonValue !== null && alternateJsonValue !== '') {
                        return alternateJsonValue;
                    }
                }
                return null;
            };
            const isValidValue = value => {
                if (value === null || value === undefined) return false;
                const normalized = String(value).trim().toLowerCase();
                return !['', 'n/a', '-', '{}', 'null', 'undefined'].includes(normalized);
            };
            const missingFields = [];
            let completedFields = 0;
            for (const field of PROFILE_COMPLETION_FIELDS) {
                const value = getFieldValue(field.key, field.altKeys || []);
                if (isValidValue(value)) completedFields += 1;
                else missingFields.push(field.label);
            }
            const totalFields = PROFILE_COMPLETION_FIELDS.length;
            const completionPercentage = totalFields > 0
                ? Math.round((completedFields / totalFields) * 100)
                : 0;

            return {
                id: student.id,
                student_name: student.student_name,
                admission_number: student.admission_number || student.admission_no,
                college: student.resolved_college,
                batch: student.batch,
                course: student.resolved_course,
                branch: student.resolved_branch,
                current_year: student.current_year,
                current_semester: student.current_semester,
                completion_percentage: completionPercentage,
                total_fields: totalFields,
                completed_fields: completedFields,
                pending_fields: missingFields,
                profile_status: completionPercentage === 100 ? 'completed' : 'pending'
            };
        });

        const summary = reportRows.reduce((totals, student) => {
            totals.total += 1;
            totals[student.profile_status] += 1;
            return totals;
        }, { total: 0, completed: 0, pending: 0 });
        const filteredRows = status && status !== 'all'
            ? reportRows.filter(student => student.profile_status === status)
            : reportRows;
        const totalPages = pageSize === null ? 1 : Math.ceil(filteredRows.length / pageSize);
        const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
        const paginatedRows = pageSize === null
            ? filteredRows
            : filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

        res.json({
            success: true,
            data: paginatedRows,
            summary,
            pagination: {
                page: safePage,
                pageSize: pageSize || filteredRows.length,
                total: filteredRows.length,
                totalPages
            }
        });
    } catch (error) {
        console.error('Error fetching profile completion report:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching profile completion report' });
    }
};

// Admin fetches all requests (scoped + optional course/branch filters)
exports.getAllRequests = async (req, res) => {
    try {
        const { status, college, batch, course, branch, year, semester, search } = req.query;
        let query = `
            SELECT p.*, s.student_name, s.admission_number, s.college, s.batch,
                   s.course, s.branch, s.current_year, s.current_semester
            FROM profile_change_requests p
            JOIN students s ON p.admission_number = s.admission_number
        `;
        const params = [];
        const conditions = [];

        if (status && status !== 'all') {
            if (!['pending', 'approved', 'rejected'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid request status' });
            }
            conditions.push('p.status = ?');
            params.push(status);
        }

        if (college) {
            if (/^\d+$/.test(college)) {
                conditions.push('s.college_id = ?');
                params.push(parseInt(college, 10));
            } else {
                conditions.push('s.college = ?');
                params.push(String(college).trim());
            }
        }

        if (batch) {
            conditions.push('s.batch = ?');
            params.push(String(batch).trim());
        }

        if (course) {
            if (/^\d+$/.test(course)) {
                conditions.push('s.course_id = ?');
            } else {
                conditions.push('s.course = ?');
            }
            params.push(String(course).trim());
        }

        if (branch) {
            if (/^\d+$/.test(branch)) {
                conditions.push('s.branch_id = ?');
            } else {
                conditions.push('s.branch = ?');
            }
            params.push(String(branch).trim());
        }

        if (year) {
            if (!/^\d+$/.test(year)) {
                return res.status(400).json({ success: false, message: 'Invalid year filter' });
            }
            conditions.push('s.current_year = ?');
            params.push(parseInt(year, 10));
        }

        if (semester) {
            if (!/^\d+$/.test(semester)) {
                return res.status(400).json({ success: false, message: 'Invalid semester filter' });
            }
            conditions.push('s.current_semester = ?');
            params.push(parseInt(semester, 10));
        }

        if (search && String(search).trim()) {
            const searchTerm = `%${String(search).trim()}%`;
            conditions.push(`(
                s.student_name LIKE ? OR s.admission_number LIKE ? OR
                s.course LIKE ? OR s.branch LIKE ? OR s.college LIKE ? OR
                CAST(p.requested_changes AS CHAR) LIKE ?
            )`);
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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
        if (status === 'approved' && request.admission_number) {
            try {
                await syncStudentToAdmissions(request.admission_number);
            } catch (syncErr) {
                console.error(`Direct admissions DB update error for ${request.admission_number}:`, syncErr.message);
            }
        }
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

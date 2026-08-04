const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { masterPool } = require('../config/database');
const { ROLE_LABELS } = require('../constants/rbac');

// Special key for public (no-auth) field config
const PUBLIC_CONFIG_KEY = '__public__';

// Auto-create qr_role_config table if it doesn't exist
const CREATE_QR_ROLE_CONFIG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS qr_role_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_key VARCHAR(64) NOT NULL UNIQUE,
  visible_fields JSON NOT NULL DEFAULT ('[]'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const ensureQrConfigTable = async () => {
    try {
        await masterPool.query(CREATE_QR_ROLE_CONFIG_TABLE_SQL);
    } catch (e) {
        console.error('ensureQrConfigTable error:', e.message);
        throw e;
    }
};

/**
 * Ensure students table has a qr_token column (UUID).
 * Generates tokens for any students that don't have one yet.
 */
const ensureQrToken = async () => {
    try {
        // Add column if missing. (IF NOT EXISTS is not supported in MySQL < 8.0)
        await masterPool.query(
            `ALTER TABLE students ADD COLUMN qr_token VARCHAR(64) UNIQUE DEFAULT NULL`
        );
    } catch (e) {
        // Ignore if already exists
        if (!e.message?.includes('Duplicate column') && e.code !== 'ER_DUP_FIELDNAME') {
            const msg = e.message || '';
            if (!msg.includes('already exists')) {
                // Non-fatal: column might already exist
                console.warn('ensureQrToken column warning:', e.message);
            }
        }
    }
    // Bulk-assign tokens to students that don't have one (up to 500 at a time)
    try {
        const [missing] = await masterPool.query(
            'SELECT id FROM students WHERE qr_token IS NULL LIMIT 500'
        );
        for (const row of (missing || [])) {
            const token = crypto.randomUUID().replace(/-/g, '');
            await masterPool.query(
                'UPDATE students SET qr_token = ? WHERE id = ? AND qr_token IS NULL',
                [token, row.id]
            );
        }
    } catch (_) { }
};

/**
 * GET /api/qr/token/:admissionNumber  (PROTECTED - requires auth via settings route)
 * Returns (or generates) the opaque QR token for a student.
 */
exports.getStudentQrToken = async (req, res) => {
    try {
        await ensureQrToken();
        const { admissionNumber } = req.params;
        if (!admissionNumber) {
            return res.status(400).json({ success: false, message: 'admissionNumber is required' });
        }

        // Authorization check: User must be admin/faculty OR the student requesting their own token
        const user = req.user;
        const isSelf = user && (
            user.admissionNumber === admissionNumber ||
            user.admission_no === admissionNumber ||
            user.admission_number === admissionNumber
        );
        const isAdminOrFaculty = user && ['admin', 'superadmin', 'faculty', 'branch_faculty'].includes(user.role);

        if (!isSelf && !isAdminOrFaculty) {
            return res.status(403).json({ success: false, message: 'Unauthorized to get token for this student' });
        }

        let student = null;
        try {
            // Use SELECT * to avoid ER_BAD_FIELD_ERROR if qr_token column creation had a warning/delay
            const [rows] = await masterPool.query(
                'SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE admission_number = ? OR admission_no = ? LIMIT 1',
                [admissionNumber.trim(), admissionNumber.trim()]
            );
            student = rows?.[0] || null;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE') return res.status(404).json({ success: false, message: 'Student not found' });
            throw e;
        }

        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        // Generate token if not assigned yet
        if (!student.qr_token) {
            student.qr_token = crypto.randomUUID().replace(/-/g, '');
            await masterPool.query('UPDATE students SET qr_token = ? WHERE id = ?', [student.qr_token, student.id]);
        }

        return res.json({ success: true, data: { token: student.qr_token } });
    } catch (error) {
        console.error('getStudentQrToken error:', error);
        res.status(500).json({ success: false, message: 'Failed to get QR token' });
    }
};

// All student fields that can be selectively displayed
const ALL_STUDENT_FIELDS = [
    { key: 'student_name', label: 'Student Name' },
    { key: 'admission_no', label: 'Admission Number' },
    { key: 'student_photo', label: 'Student Photo' },
    { key: 'father_name', label: 'Father Name' },
    { key: 'mother_name', label: 'Mother Name' },
    { key: 'gender', label: 'Gender' },
    { key: 'dob', label: 'Date of Birth' },
    { key: 'adhar_no', label: 'Aadhar Number' },
    { key: 'college', label: 'College' },
    { key: 'batch', label: 'Batch' },
    { key: 'course', label: 'Program' },
    { key: 'branch', label: 'Branch' },
    { key: 'current_year', label: 'Current Year' },
    { key: 'current_semester', label: 'Current Semester' },
    { key: 'stud_type', label: 'Student Type' },
    { key: 'student_status', label: 'Status' },
    { key: 'scholar_status', label: 'Scholar Status' },
    { key: 'caste', label: 'Caste' },
    { key: 'student_mobile', label: 'Student Mobile' },
    { key: 'parent_mobile1', label: 'Parent Mobile 1' },
    { key: 'parent_mobile2', label: 'Parent Mobile 2' },
    { key: 'student_address', label: 'Address' },
    { key: 'city_village', label: 'City/Village' },
    { key: 'mandal_name', label: 'Mandal' },
    { key: 'district', label: 'District' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'pin_no', label: 'PIN Number' },
    { key: 'apaar', label: 'APAAR ID' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'previous_college', label: 'Previous College' },
];

module.exports.ALL_STUDENT_FIELDS = ALL_STUDENT_FIELDS;
module.exports.PUBLIC_CONFIG_KEY = PUBLIC_CONFIG_KEY;

// Helper: parse visible_fields from DB row
const parseVisibleFields = (raw) => {
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    } catch (_) {
        return [];
    }
};

// Helper: build a filtered student object from field keys
const buildFilteredStudent = (student, fieldKeys) => {
    const fieldMetaMap = {};
    ALL_STUDENT_FIELDS.forEach(f => { fieldMetaMap[f.key] = f.label; });

    const result = {};
    fieldKeys.forEach(key => {
        if (student[key] !== undefined && student[key] !== null && student[key] !== '') {
            result[key] = {
                label: fieldMetaMap[key] || key,
                value: student[key]
            };
        }
    });
    return result;
};

/**
 * GET /api/settings/qr-config
 * Returns QR role config + public fields config for all roles (admin only).
 */
exports.getQrConfig = async (req, res) => {
    try {
        await ensureQrConfigTable();

        let rows = [];
        try {
            const [r] = await masterPool.query(
                'SELECT role_key, visible_fields FROM qr_role_config'
            );
            rows = r || [];
        } catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
        }

        // Build a map: roleKey → fields[]
        const configMap = {};
        let publicFields = [];
        rows.forEach(r => {
            const fields = parseVisibleFields(r.visible_fields);
            if (r.role_key === PUBLIC_CONFIG_KEY) {
                publicFields = fields;
            } else {
                configMap[r.role_key] = fields;
            }
        });

        res.json({
            success: true,
            data: {
                roleConfigs: configMap,
                publicFields,
                availableFields: ALL_STUDENT_FIELDS
            }
        });
    } catch (error) {
        console.error('getQrConfig error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get QR config' });
    }
};

/**
 * POST /api/settings/qr-config
 * Save QR config per role AND public fields.
 * Body: { roleConfigs: { role_key: ['field1',...] }, publicFields: ['field1',...] }
 */
exports.saveQrConfig = async (req, res) => {
    try {
        await ensureQrConfigTable();

        const { roleConfigs, publicFields } = req.body || {};
        const validFieldKeys = new Set(ALL_STUDENT_FIELDS.map(f => f.key));

        // Save per-role configs
        if (roleConfigs && typeof roleConfigs === 'object') {
            for (const [roleKey, fields] of Object.entries(roleConfigs)) {
                if (!Array.isArray(fields)) continue;
                const filtered = fields.filter(f => validFieldKeys.has(f));
                await masterPool.query(
                    `INSERT INTO qr_role_config (role_key, visible_fields)
                     VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE visible_fields = VALUES(visible_fields), updated_at = CURRENT_TIMESTAMP`,
                    [roleKey, JSON.stringify(filtered)]
                );
            }
        }

        // Save public fields using special key
        if (Array.isArray(publicFields)) {
            const filteredPublic = publicFields.filter(f => validFieldKeys.has(f));
            await masterPool.query(
                `INSERT INTO qr_role_config (role_key, visible_fields)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE visible_fields = VALUES(visible_fields), updated_at = CURRENT_TIMESTAMP`,
                [PUBLIC_CONFIG_KEY, JSON.stringify(filteredPublic)]
            );
        }

        res.json({ success: true, message: 'QR configuration saved successfully' });
    } catch (error) {
        console.error('saveQrConfig error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to save QR config' });
    }
};

/**
 * GET /api/qr/public/:qrToken  (PUBLIC - no auth required)
 * Returns publicly-visible student fields for QR scan page.
 * Uses an opaque UUID token (qr_token) — NOT the admission number.
 */
exports.getPublicStudentData = async (req, res) => {
    try {
        const { qrToken } = req.params;

        if (!qrToken) {
            return res.status(400).json({ success: false, message: 'token is required' });
        }

        // Lookup by opaque UUID token or fallback to admission number
        let student = null;
        try {
            const isToken = qrToken.trim().length > 30; // UUIDs without dashes are 32 chars
            let queryUrl = '';
            let queryParams = [];

            if (isToken) {
                queryUrl = `SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE qr_token = ? LIMIT 1`;
                queryParams = [qrToken.trim()];
            } else {
                queryUrl = `SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE admission_number = ? OR admission_no = ? LIMIT 1`;
                queryParams = [qrToken.trim(), qrToken.trim()];
            }

            const [rows] = await masterPool.query(queryUrl, queryParams);
            student = rows?.[0] || null;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
                return res.status(404).json({ success: false, message: 'Student not found' });
            }
            throw e;
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Get public fields config
        await ensureQrConfigTable();
        let publicFieldKeys = [];
        try {
            const [configRows] = await masterPool.query(
                'SELECT visible_fields FROM qr_role_config WHERE role_key = ? LIMIT 1',
                [PUBLIC_CONFIG_KEY]
            );
            if (configRows?.[0]) {
                publicFieldKeys = parseVisibleFields(configRows[0].visible_fields);
            }
        } catch (_) { }

        // Default public fields if not configured
        if (publicFieldKeys.length === 0) {
            publicFieldKeys = ['student_name', 'admission_no', 'college', 'course', 'branch', 'current_year', 'current_semester', 'student_status'];
        }

        const publicData = buildFilteredStudent(student, publicFieldKeys);

        // Always ensure name is present
        if (!publicData.student_name && student.student_name) {
            publicData.student_name = { label: 'Student Name', value: student.student_name };
        }
        const admNo = student.admission_no || student.admission_number;
        if (!publicData.admission_no && admNo) {
            publicData.admission_no = { label: 'Admission Number', value: admNo };
        }
        // Include photo if configured
        if (publicFieldKeys.includes('student_photo') && student.student_photo) {
            publicData.student_photo = { label: 'Student Photo', value: student.student_photo };
        }

        res.json({
            success: true,
            data: {
                student: publicData,
                // Return qrToken so frontend can use it for the verify call
                qrToken,
                publicFields: publicFieldKeys,
                hasPrivateView: true
            }
        });
    } catch (error) {
        console.error('getPublicStudentData error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching student data' });
    }
};

/**
 * POST /api/qr/verify  (PUBLIC - no auth required)
 * Body: { qrToken, username, password }
 * Verifies RBAC user credentials and returns PRIVATE fields.
 */
exports.verifyQrAccess = async (req, res) => {
    try {
        const { qrToken, username, password } = req.body || {};

        if (!qrToken || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'qrToken, username, and password are required'
            });
        }

        // 1. Find RBAC user by username
        let rbacUser = null;
        try {
            const [rows] = await masterPool.query(
                'SELECT id, username, password, role, is_active FROM rbac_users WHERE username = ? LIMIT 1',
                [username.trim()]
            );
            rbacUser = rows?.[0] || null;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE') {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            throw e;
        }

        if (!rbacUser || !rbacUser.is_active) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // 2. Verify password (bcrypt)
        let passwordMatch = false;
        try {
            passwordMatch = await bcrypt.compare(password, rbacUser.password);
        } catch (_) { }
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // 3. Fetch student by opaque token or fallback to admission number
        let student = null;
        try {
            const isToken = qrToken.trim().length > 30; // UUIDs without dashes are 32 chars
            let queryUrl = '';
            let queryParams = [];

            if (isToken) {
                queryUrl = `SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE qr_token = ? LIMIT 1`;
                queryParams = [qrToken.trim()];
            } else {
                queryUrl = `SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE admission_number = ? OR admission_no = ? LIMIT 1`;
                queryParams = [qrToken.trim(), qrToken.trim()];
            }

            const [studentRows] = await masterPool.query(queryUrl, queryParams);
            student = studentRows?.[0] || null;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
                return res.status(404).json({ success: false, message: 'Student not found' });
            }
            throw e;
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // 4. Get QR role config for this role
        await ensureQrConfigTable();
        let roleFieldKeys = [];
        let publicFieldKeys = [];
        try {
            const [configRows] = await masterPool.query(
                'SELECT role_key, visible_fields FROM qr_role_config WHERE role_key IN (?, ?)',
                [rbacUser.role, PUBLIC_CONFIG_KEY]
            );
            configRows.forEach(row => {
                const fields = parseVisibleFields(row.visible_fields);
                if (row.role_key === PUBLIC_CONFIG_KEY) {
                    publicFieldKeys = fields;
                } else {
                    roleFieldKeys = fields;
                }
            });
        } catch (_) { }

        // Default private fields if unconfigured
        if (roleFieldKeys.length === 0) {
            roleFieldKeys = ['father_name', 'mother_name', 'student_mobile', 'parent_mobile1', 'parent_mobile2', 'adhar_no', 'caste', 'student_address', 'district', 'scholar_status', 'remarks'];
        }

        const allRoleFields = buildFilteredStudent(student, roleFieldKeys);

        // Only return fields NOT already in the public set
        const privateOnlyFields = {};
        const publicFieldSet = new Set(publicFieldKeys);
        Object.entries(allRoleFields).forEach(([key, val]) => {
            if (!publicFieldSet.has(key)) privateOnlyFields[key] = val;
        });

        res.json({
            success: true,
            data: {
                privateFields: privateOnlyFields,
                allRoleFields,
                roleFieldKeys,
                scannedBy: {
                    role: rbacUser.role,
                    roleLabel: ROLE_LABELS[rbacUser.role] || rbacUser.role
                }
            }
        });
    } catch (error) {
        console.error('verifyQrAccess error:', error);
        res.status(500).json({ success: false, message: 'Server error during QR verification' });
    }
};

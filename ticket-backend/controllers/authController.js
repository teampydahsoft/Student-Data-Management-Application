const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Student } = require('../models');
const { authenticateHRMSUser } = require('../utils/hrmsAuth');
const { verifySsoToken, resolveUserFromSsoPayload } = require('../utils/hrmsSso');
const { resolveTicketAccessMode } = require('../utils/ticketAccess');

// --- Helper Functions for Response Building ---

// Mock permissions for Super Admin to ensure they have access to everything in Ticket App
const MOCK_SUPER_ADMIN_PERMISSIONS = {
    dashboard: { view: true }, // Changed from ticket_dashboard to dashboard to match frontend
    ticket_management: { read: true, write: true },
    settings: { view: true, edit: true },
    reports: { view: true, download: true },
    user_management: { view: true, control: true },
    student_management: { view: true, add_student: true, bulk_upload: true, delete_student: true, update_pin: true, export: true, view_sms: true },
    employee_management: { read: true, write: true, delete: true }, // If used
    category_management: { read: true, write: true, delete: true }  // If used
};

const buildAdminResponse = (admin) => ({
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: 'super_admin',
    name: admin.username,
    permissions: MOCK_SUPER_ADMIN_PERMISSIONS // Explicitly return full permissions object
});

const buildStaffResponse = (staffRow) => {
    // Basic staff response, expand if modules are needed
    return {
        id: staffRow.id,
        username: staffRow.username,
        email: staffRow.email,
        role: 'staff',
        permissions: [] // Staff permissions/modules handled by frontend logic
    };
};

const buildRBACUserResponse = (rbacUser) => {
    let permissions = {};

    // If Super Admin, FORCE full permissions regardless of DB value
    if (rbacUser.role === 'super_admin') {
        permissions = MOCK_SUPER_ADMIN_PERMISSIONS;
    } else {
        try {
            permissions = typeof rbacUser.permissions === 'string'
                ? JSON.parse(rbacUser.permissions)
                : (rbacUser.permissions || {});
        } catch (e) {
            console.error('Error parsing RBAC permissions:', e);
            permissions = {};
        }
    }

    return {
        id: rbacUser.id,
        name: rbacUser.name,
        username: rbacUser.username,
        email: rbacUser.email,
        phone: rbacUser.phone,
        role: rbacUser.role,
        collegeId: rbacUser.college_id,
        courseId: rbacUser.course_id,
        branchId: rbacUser.branch_id,
        permissions: permissions,
        isActive: rbacUser.is_active,
        ...(rbacUser.hrms_id ? { hrmsId: rbacUser.hrms_id, is_hrms_user: true } : {})
    };
};

const buildTicketEmployeeResponse = (emp) => ({
    id: emp.id,
    name: emp.name,
    username: emp.username,
    email: emp.email,
    role: emp.role,
    is_worker: true,
    permissions: [] // Ticket employees have specific role-based access
});

const attachTicketAccess = async (userPayload, masterPool, options = {}) => {
    const { id, role, is_worker: isWorker, is_hrms_session: isHrmsSession, hrmsId } = userPayload;
    if (role === 'student') {
        return { ...userPayload, ticketAccess: 'request' };
    }
    if ((isHrmsSession || hrmsId) && !id) {
        return { ...userPayload, ticketAccess: 'request' };
    }
    const ticketAccess = await resolveTicketAccessMode(masterPool, id, role, isWorker || options.isWorker);
    return { ...userPayload, ticketAccess };
};

const buildTokenPayload = (user) => ({
    id: user.id || null,
    role: user.role,
    username: user.username,
    name: user.name,
    email: user.email,
    ...(user.hrmsId && !user.id
        ? { hrmsId: user.hrmsId, is_hrms_session: true }
        : user.hrmsId
            ? { hrmsId: user.hrmsId, is_hrms_user: true }
            : {}),
    ...(user.is_hrms_user ? { is_hrms_user: true } : {}),
    ...(user.is_worker ? { is_worker: true } : {}),
    ...(user.admission_number ? { admissionNumber: user.admission_number } : {})
});

const issueAuthResponse = async (res, userPayload, masterPool, options = {}) => {
    const user = await attachTicketAccess(userPayload, masterPool, options);
    const token = jwt.sign(
        buildTokenPayload(user),
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '24h' }
    );

    return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user
    });
};


// --- Controllers ---

// Verify Token & Helper to return user info
exports.verifyToken = async (req, res) => {
    try {
        const authUser = req.user;

        if (!authUser) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        const { masterPool } = require('../config/database');

        // HRMS-only SSO (no linked rbac id) — not portal admins with hrms_id on their account
        if ((authUser.is_hrms_session || authUser.hrmsId) && !authUser.id) {
            return res.status(200).json({
                success: true,
                user: {
                    hrmsId: authUser.hrmsId,
                    name: authUser.name,
                    username: authUser.username,
                    email: authUser.email,
                    role: authUser.role || 'faculty',
                    is_hrms_session: true,
                    is_hrms_user: true,
                    ticketAccess: 'request'
                }
            });
        }

        // 1. Check if user is a student
        if (authUser.role === 'student') {
            try {
                // The token payload has { id: student_id, role: 'student', username... }
                // So use authUser.id first as it is the most reliable (students.id).

                const [students] = await masterPool.query(
                    `SELECT s.id, s.student_name, s.admission_number, s.student_photo, s.course, s.branch, s.college,
                    s.current_year, s.current_semester, sc.username
                    FROM students s
                    LEFT JOIN student_credentials sc ON sc.student_id = s.id
                    WHERE s.id = ? LIMIT 1`,
                    [authUser.id]
                );

                if (students && students.length > 0) {
                    const s = students[0];
                    return res.status(200).json({
                        success: true,
                        user: {
                            id: s.id,
                            name: s.student_name,
                            username: s.username,
                            admission_number: s.admission_number,
                            role: 'student',
                            student_photo: s.student_photo,
                            course: s.course || 'N/A',
                            branch: s.branch || 'N/A',
                            college: s.college || 'N/A',
                            current_year: s.current_year || 1,
                            current_semester: s.current_semester || 1
                        }
                    });
                }
            } catch (error) {
                console.error('Error fetching student details:', error);
            }
        }

        // 2. Check explicitly for standalone worker
        if (authUser.is_worker) {
            const [employees] = await masterPool.query(
                'SELECT id, name, username, email, role, is_active FROM ticket_employees WHERE id = ? LIMIT 1',
                [authUser.id]
            );

            if (employees && employees.length > 0) {
                if (!employees[0].is_active) {
                    return res.status(403).json({ success: false, message: 'Worker account deactivated' });
                }
                return res.status(200).json({
                    success: true,
                    user: await attachTicketAccess(buildTicketEmployeeResponse(employees[0]), masterPool, { isWorker: true })
                });
            }
        }

        // 3. Check RBAC Users
        const [rbacRows] = await masterPool.query(
            'SELECT id, name, username, email, role, permissions, college_id, course_id, branch_id, is_active, hrms_id FROM rbac_users WHERE id = ? LIMIT 1',
            [authUser.id]
        );

        if (rbacRows && rbacRows.length > 0) {
            const rbacUser = rbacRows[0];
            if (!rbacUser.is_active) {
                return res.status(403).json({ success: false, message: 'Account deactivated' });
            }

            // Check if this RBAC user has been explicitly deactivated in Ticket App
            const [ticketEmp] = await masterPool.query(
                'SELECT is_active FROM ticket_employees WHERE rbac_user_id = ? LIMIT 1',
                [rbacUser.id]
            );

            // If a ticket employee record exists and is deactivated, deny access to Ticket App
            if (ticketEmp.length > 0 && !ticketEmp[0].is_active) {
                return res.status(403).json({
                    success: false,
                    message: 'Ticket Management access has been revoked'
                });
            }

            return res.status(200).json({
                success: true,
                user: await attachTicketAccess(buildRBACUserResponse(rbacUser), masterPool)
            });
        }

        // 4. Check Legacy Staff Users
        const [staffRows] = await masterPool.query(
            'SELECT id, username, email, assigned_modules, is_active FROM staff_users WHERE id = ? LIMIT 1',
            [authUser.id]
        );

        if (staffRows && staffRows.length > 0) {
            const staffUser = staffRows[0];
            if (!staffUser.is_active) {
                return res.status(403).json({ success: false, message: 'Account deactivated' });
            }
            const staffResponse = await attachTicketAccess(buildStaffResponse(staffUser), masterPool);
            return res.status(200).json({ success: true, user: staffResponse });
        }

        // 5. Check Admins (Legacy)
        const [admins] = await masterPool.query(
            'SELECT id, username, email, password FROM admins WHERE id = ? LIMIT 1',
            [authUser.id]
        );

        if (admins && admins.length > 0) {
            const adminResponse = await attachTicketAccess(buildAdminResponse(admins[0]), masterPool);
            return res.status(200).json({
                success: true,
                user: adminResponse
            });
        }

        // Fallback to token data
        res.status(200).json({
            success: true,
            user: {
                id: authUser.id,
                username: authUser.username,
                email: authUser.email,
                role: authUser.role,
                name: authUser.name,
                admission_number: authUser.admission_number,
            }
        });
    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during verification'
        });
    }
};

// Unified Login
exports.unifiedLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        const { masterPool } = require('../config/database');

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        // 1. Check Legacy Admins
        const [admins] = await masterPool.query('SELECT * FROM admins WHERE username = ? LIMIT 1', [username]);
        if (admins && admins.length > 0) {
            const admin = admins[0];
            if (await bcrypt.compare(password, admin.password)) {

                // Check if this admin is also an RBAC user (Upgrade Path)
                const [rbacAdmin] = await masterPool.query(
                    'SELECT * FROM rbac_users WHERE username = ? AND role = ? LIMIT 1',
                    [admin.username, 'super_admin']
                );

                if (rbacAdmin && rbacAdmin.length > 0) {
                    const rbacUser = rbacAdmin[0];
                    if (!rbacUser.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

                    return issueAuthResponse(res, buildRBACUserResponse(rbacUser), masterPool);
                }

                return issueAuthResponse(res, buildAdminResponse(admin), masterPool);
            }
        }

        // 2. HRMS MongoDB authentication (same flow as Student Database portal)
        try {
            const hrmsResult = await authenticateHRMSUser(username, password, masterPool);
            if (hrmsResult?.rbacUser) {
                const rbacUser = hrmsResult.rbacUser;
                if (!rbacUser.is_active) {
                    return res.status(403).json({ success: false, message: 'Account deactivated' });
                }
                return issueAuthResponse(res, { ...buildRBACUserResponse(rbacUser), is_hrms_user: true }, masterPool);
            }
            if (hrmsResult?.hrmsProfile) {
                return issueAuthResponse(res, { ...hrmsResult.hrmsProfile, is_hrms_user: true }, masterPool);
            }
        } catch (hrmsError) {
            if (hrmsError.statusCode) {
                return res.status(hrmsError.statusCode).json({ success: false, message: hrmsError.message });
            }
        }

        // 3. Check traditional local RBAC Users
        const [rbacUsers] = await masterPool.query(
            `SELECT id, username, password, role, name, email, permissions, is_active, phone,
                    college_id, course_id, branch_id
             FROM rbac_users WHERE username = ? OR email = ? LIMIT 1`,
            [username, username]
        );

        if (rbacUsers.length > 0) {
            const user = rbacUsers[0];
            if (user.password && await bcrypt.compare(password, user.password)) {
                if (!user.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

                return issueAuthResponse(res, buildRBACUserResponse(user), masterPool);
            }
        }

        // 4. Check Ticket Employees
        const [employees] = await masterPool.query(
            'SELECT id, username, password_hash, role, name, email FROM ticket_employees WHERE username = ? AND is_active = 1',
            [username]
        );

        if (employees.length > 0) {
            const employee = employees[0];
            if (employee.password_hash && await bcrypt.compare(password, employee.password_hash)) {
                return issueAuthResponse(
                    res,
                    buildTicketEmployeeResponse(employee),
                    masterPool,
                    { isWorker: true }
                );
            }
        }

        // 5. Check Legacy Staff Users (from Main App)
        const [staffRows] = await masterPool.query(
            'SELECT id, username, email, password_hash, assigned_modules, is_active FROM staff_users WHERE username = ? LIMIT 1',
            [username]
        );

        if (staffRows && staffRows.length > 0) {
            const staffUser = staffRows[0];
            if (await bcrypt.compare(password, staffUser.password_hash)) {
                if (!staffUser.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

                return issueAuthResponse(res, buildStaffResponse(staffUser), masterPool);
            }
        }

        // 6. Check Students
        const [credentials] = await masterPool.query(
            `SELECT id, student_id, admission_number, username, password_hash 
             FROM student_credentials 
             WHERE username = ? OR admission_number = ? 
             LIMIT 1`,
            [username, username]
        );

        if (credentials && credentials.length > 0) {
            const cred = credentials[0];

            if (cred.password_hash && await bcrypt.compare(password, cred.password_hash)) {

                // Fetch student profile details
                const [students] = await masterPool.query(
                    `SELECT student_name, student_photo, course, branch, college, current_year, current_semester
                     FROM students 
                     WHERE id = ? LIMIT 1`,
                    [cred.student_id]
                );

                if (students && students.length > 0) {
                    const s = students[0];

                    return issueAuthResponse(res, {
                        id: cred.student_id,
                        username: cred.username,
                        admission_number: cred.admission_number,
                        role: 'student',
                        name: s.student_name,
                        course: s.course,
                        branch: s.branch,
                        college: s.college,
                        current_year: s.current_year,
                        current_semester: s.current_semester,
                        student_photo: s.student_photo,
                        ticketAccess: 'request'
                    }, masterPool);
                }
            }
        }

        return res.status(401).json({ success: false, message: 'Invalid credentials' });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

/**
 * Exchange an HRMS / portal SSO JWT for a ticket-app session (no password).
 * HRMS signs the incoming token with JWT_SECRET or HRMS_SSO_SECRET.
 * @route POST /api/auth/hrms-sso-session
 */
exports.hrmsSsoSession = async (req, res) => {
    try {
        const token = req.body.token || req.body.ssoToken;
        if (!token) {
            return res.status(400).json({ success: false, message: 'SSO token is required' });
        }

        const { masterPool } = require('../config/database');
        let payload;

        try {
            payload = verifySsoToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired SSO token'
            });
        }

        const resolved = await resolveUserFromSsoPayload(payload, masterPool);
        if (!resolved) {
            const hrmsId = payload.hrmsId || payload.hrms_id;
            if (!hrmsId && !payload.id && payload.role !== 'student') {
                return res.status(403).json({
                    success: false,
                    message: 'HRMS SSO token must include hrmsId'
                });
            }
            return res.status(403).json({
                success: false,
                message: 'Unable to resolve user from SSO token'
            });
        }

        if (resolved.type === 'rbac') {
            const rbacUser = resolved.user;
            if (!rbacUser.is_active) {
                return res.status(403).json({ success: false, message: 'Account deactivated' });
            }
            return issueAuthResponse(
                res,
                { ...buildRBACUserResponse(rbacUser), is_hrms_user: true },
                masterPool
            );
        }

        if (resolved.type === 'hrms') {
            return issueAuthResponse(
                res,
                { ...resolved.profile, is_hrms_user: true },
                masterPool
            );
        }

        if (resolved.type === 'student') {
            const s = resolved.student;
            return issueAuthResponse(res, {
                id: s.id,
                username: s.username,
                admission_number: s.admission_number,
                role: 'student',
                name: s.student_name,
                course: s.course,
                branch: s.branch,
                college: s.college,
                current_year: s.current_year,
                current_semester: s.current_semester,
                student_photo: s.student_photo
            }, masterPool);
        }

        return res.status(403).json({ success: false, message: 'Unsupported SSO user type' });
    } catch (error) {
        console.error('HRMS SSO session error:', error);
        res.status(500).json({ success: false, message: 'Server error during SSO login' });
    }
};

/**
 * Public SSO integration info for HRMS / portal developers.
 * @route GET /api/auth/sso-config
 */
exports.getSsoConfig = (req, res) => {
    const ticketAppUrl = (process.env.TICKET_APP_URL || 'http://localhost:5174').replace(/\/$/, '');
    const hrmsPortalUrl = (process.env.HRMS_PORTAL_URL || 'https://hrms.pydah.edu.in').replace(/\/$/, '');

    res.json({
        success: true,
        data: {
            ticketAppUrl,
            callbackPath: '/auth-callback',
            callbackExample: `${ticketAppUrl}/auth-callback?token={jwt}&from=hrms&redirect=/student/my-tickets`,
            exchangeEndpoint: '/api/auth/hrms-sso-session',
            verifyEndpoint: '/api/auth/verify',
            inboundFlow: {
                urlParams: ['token', 'from=hrms', 'redirect (optional, allowlisted)'],
                verifyWith: ['JWT_SECRET', 'HRMS_SSO_SECRET (optional)'],
                requiredClaims: ['hrmsId'],
                recommendedClaims: ['role', 'username', 'name', 'email'],
                defaultRedirect: '/student/my-tickets',
            },
            hrmsReturnUrl: `${hrmsPortalUrl}/dashboard`,
            hrmsReturnNote: 'No return SSO — plain link only; HRMS session persists in same browser localStorage.',
            signingSecrets: [
                'JWT_SECRET (shared with HRMS production — must match exactly)',
                'HRMS_SSO_SECRET (optional dedicated secret for token exchange)'
            ],
            requiredEnv: {
                JWT_SECRET: 'shared production secret (not a placeholder)',
                TICKET_APP_URL: ticketAppUrl,
            },
            doNotUseForReturn: [
                'https://hrms.pydah.edu.in/login?token=...',
                'ticket-maintenance-backend.pydah.edu.in for browser redirects'
            ]
        }
    });
};

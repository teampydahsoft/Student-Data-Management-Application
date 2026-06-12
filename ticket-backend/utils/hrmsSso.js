const jwt = require('jsonwebtoken');
const { findLocalRbacUser, buildHrmsSessionProfile } = require('./hrmsAuth');

function verifySsoToken(ssoToken) {
    const secrets = [
        process.env.JWT_SECRET,
        process.env.HRMS_SSO_SECRET,
        process.env.JWT_SECRET || 'secret_key'
    ].filter(Boolean);

    const uniqueSecrets = [...new Set(secrets)];
    let lastError = null;

    for (const secret of uniqueSecrets) {
        try {
            return jwt.verify(ssoToken, secret);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Invalid SSO token');
}

/**
 * Build a ticket-app user from an HRMS / portal SSO JWT payload (no password).
 */
async function resolveUserFromSsoPayload(payload, masterPool) {
    const hrmsId = payload.hrmsId || payload.hrms_id || null;
    const rbacId = payload.id || payload.userId || payload.rbacUserId || null;
    const username = payload.username || payload.emp_no || null;
    const email = payload.email || null;

    if (rbacId) {
        const [rows] = await masterPool.query(
            `SELECT id, name, username, email, phone, role, permissions, college_id, course_id, branch_id,
                    is_active, hrms_id
             FROM rbac_users WHERE id = ? LIMIT 1`,
            [rbacId]
        );
        if (rows.length > 0) {
            return { type: 'rbac', user: rows[0] };
        }
    }

    if (hrmsId) {
        const existing = await findLocalRbacUser(masterPool, { hrmsIdStr: hrmsId, email, username });
        if (existing) {
            return { type: 'rbac', user: existing };
        }
    }

    if (email || username) {
        const existing = await findLocalRbacUser(masterPool, { hrmsIdStr: hrmsId, email, username });
        if (existing) {
            return { type: 'rbac', user: existing };
        }
    }

    if (hrmsId) {
        return {
            type: 'hrms',
            profile: buildHrmsSessionProfile({
                hrmsIdStr: hrmsId,
                mappedName: payload.name || payload.employee_name || username || 'HRMS User',
                mappedEmail: email || username || hrmsId,
                mappedPhone: payload.phone || payload.phone_number || null,
                mappedUsername: username || email?.split('@')?.[0] || `hrms_${hrmsId.slice(-8)}`,
                mappedRole: payload.role || 'faculty'
            })
        };
    }

    if (payload.role === 'student' || payload.admissionNumber || payload.admission_number) {
        const admissionNumber = payload.admissionNumber || payload.admission_number;
        const [students] = await masterPool.query(
            `SELECT s.id, s.student_name, s.admission_number, s.student_photo, s.course, s.branch, s.college,
                    s.current_year, s.current_semester, sc.username
             FROM students s
             LEFT JOIN student_credentials sc ON sc.student_id = s.id
             WHERE s.id = ? OR s.admission_number = ? LIMIT 1`,
            [rbacId || payload.id, admissionNumber]
        );
        if (students.length > 0) {
            return { type: 'student', student: students[0] };
        }
    }

    return null;
}

module.exports = { verifySsoToken, resolveUserFromSsoPayload };

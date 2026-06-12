const bcrypt = require('bcryptjs');
const { getHRMSConnection } = require('../config/mongoConfig');
const { getModel: getHRMSUserModel } = require('../models/HRMSUser');
const { getModel: getHRMSEmployeeModel } = require('../models/HRMSEmployee');

const DEFAULT_HRMS_ROLE = 'faculty';

function normalizeEmail(value, fallbackKey) {
    if (value && String(value).includes('@')) {
        return String(value).trim().toLowerCase();
    }
    const key = String(fallbackKey || value || 'user').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return `${key || 'user'}@hrms.ticket.local`;
}

function normalizeUsername(empDoc, userDoc, email, hrmsIdStr) {
    const candidates = [
        empDoc?.emp_no,
        userDoc?.employeeId,
        email?.split('@')?.[0],
        empDoc?.email?.split('@')?.[0],
        userDoc?.email?.split('@')?.[0],
        hrmsIdStr ? `hrms_${hrmsIdStr.slice(-8)}` : null
    ].filter(Boolean);

    return String(candidates[0]).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 100);
}

function resolveHrmsRole(hrmsMatchedObj, empDoc, userDoc) {
    const role = hrmsMatchedObj?.role || userDoc?.role;
    if (role === 'super_admin' || hrmsMatchedObj?.roles?.includes?.('super_admin')) {
        return 'super_admin';
    }
    return role || DEFAULT_HRMS_ROLE;
}

async function findLocalRbacUser(masterPool, { hrmsIdStr, email, username }) {
    const [byHrmsId] = await masterPool.query(
        'SELECT * FROM rbac_users WHERE hrms_id = ? LIMIT 1',
        [hrmsIdStr]
    );
    if (byHrmsId.length > 0) return byHrmsId[0];

    if (email && email.includes('@') && !email.endsWith('@hrms.ticket.local')) {
        const [byEmail] = await masterPool.query(
            'SELECT * FROM rbac_users WHERE email = ? LIMIT 1',
            [email]
        );
        if (byEmail.length > 0) return byEmail[0];
    }

    if (username) {
        const [byUsername] = await masterPool.query(
            'SELECT * FROM rbac_users WHERE username = ? LIMIT 1',
            [username]
        );
        if (byUsername.length > 0) return byUsername[0];
    }

    return null;
}

async function syncExistingRbacUser(masterPool, existing, {
    hrmsIdStr,
    mappedName,
    mappedEmail,
    mappedPhone,
    mappedUsername
}) {
    await masterPool.query(
        `UPDATE rbac_users
         SET hrms_id = ?, name = COALESCE(?, name), email = ?, phone = COALESCE(?, phone),
             username = COALESCE(?, username), updated_at = NOW()
         WHERE id = ?`,
        [hrmsIdStr, mappedName, mappedEmail, mappedPhone, mappedUsername, existing.id]
    );

    const [syncedUsers] = await masterPool.query(
        'SELECT * FROM rbac_users WHERE id = ? LIMIT 1',
        [existing.id]
    );
    return syncedUsers[0];
}

function buildHrmsSessionProfile({
    hrmsIdStr,
    mappedName,
    mappedEmail,
    mappedPhone,
    mappedUsername,
    mappedRole
}) {
    return {
        hrmsId: hrmsIdStr,
        name: mappedName,
        username: mappedUsername,
        email: mappedEmail,
        phone: mappedPhone,
        role: mappedRole,
        is_hrms_session: true,
        ticketAccess: 'request'
    };
}

/**
 * Authenticate against HRMS MongoDB.
 * - If a linked rbac_users row exists: sync profile fields only (no new User Management rows).
 * - Otherwise: return a ticket-only HRMS session profile (no rbac_users INSERT).
 *
 * @returns {Promise<{ rbacUser?: object, hrmsProfile?: object } | null>}
 */
async function authenticateHRMSUser(username, password, masterPool) {
    const hrmsConn = getHRMSConnection();
    if (!hrmsConn) return null;

    let isHRMSLogin = false;
    let hrmsMatchedObj = null;
    let empDoc = null;
    let userDoc = null;
    let mappedName = 'HRMS User';
    let mappedEmail = username;
    let mappedPhone = null;

    try {
        const HRMSUser = getHRMSUserModel(hrmsConn);
        const HRMSEmployee = getHRMSEmployeeModel(hrmsConn);

        empDoc = await HRMSEmployee.findOne({
            $or: [{ emp_no: username }, { email: username }]
        }).select('+password').lean().exec();

        if (empDoc) {
            const isEmpPassValid = await bcrypt.compare(password, empDoc.password);
            if (isEmpPassValid) {
                isHRMSLogin = true;
                hrmsMatchedObj = empDoc;
                mappedName = empDoc.employee_name || mappedName;
                mappedEmail = empDoc.email || empDoc.emp_no || mappedEmail;
                mappedPhone = empDoc.phone_number || null;
            }
        }

        if (!isHRMSLogin && empDoc) {
            const userSearchCriteria = [
                { employeeId: empDoc.emp_no },
                { employeeRef: empDoc._id }
            ];
            if (empDoc.email) {
                userSearchCriteria.push({ email: empDoc.email });
            }

            userDoc = await HRMSUser.findOne({ $or: userSearchCriteria })
                .select('+password').lean().exec();

            if (userDoc) {
                const isUserPassValid = await bcrypt.compare(password, userDoc.password);
                if (isUserPassValid) {
                    isHRMSLogin = true;
                    hrmsMatchedObj = userDoc;
                    mappedName = userDoc.name || empDoc.employee_name || mappedName;
                    mappedEmail = userDoc.email || empDoc.email || mappedEmail;
                    mappedPhone = empDoc.phone_number || null;
                }
            }
        }

        if (!isHRMSLogin) {
            userDoc = await HRMSUser.findOne({ email: username })
                .select('+password').lean().exec();

            if (userDoc) {
                const isDirectUserPassValid = await bcrypt.compare(password, userDoc.password);
                if (isDirectUserPassValid) {
                    isHRMSLogin = true;
                    hrmsMatchedObj = userDoc;
                    mappedName = userDoc.name || mappedName;
                    mappedEmail = userDoc.email || mappedEmail;
                }
            }
        }

        if (!isHRMSLogin) return null;

        const hrmsIdStr = hrmsMatchedObj._id.toString();

        if (hrmsMatchedObj.isActive === false || hrmsMatchedObj.is_active === false) {
            const err = new Error('Account deactivated centrally');
            err.statusCode = 403;
            throw err;
        }

        const mappedRole = resolveHrmsRole(hrmsMatchedObj, empDoc, userDoc);
        const normalizedEmail = normalizeEmail(mappedEmail, empDoc?.emp_no || hrmsIdStr);
        const normalizedUsername = normalizeUsername(empDoc, userDoc, normalizedEmail, hrmsIdStr);

        const existing = await findLocalRbacUser(masterPool, {
            hrmsIdStr,
            email: normalizedEmail,
            username: normalizedUsername
        });

        if (existing) {
            const rbacUser = await syncExistingRbacUser(masterPool, existing, {
                hrmsIdStr,
                mappedName,
                mappedEmail: normalizedEmail,
                mappedPhone,
                mappedUsername: normalizedUsername
            });

            if (!rbacUser.is_active) {
                const err = new Error('Account deactivated');
                err.statusCode = 403;
                throw err;
            }

            return { rbacUser };
        }

        return {
            hrmsProfile: buildHrmsSessionProfile({
                hrmsIdStr,
                mappedName,
                mappedEmail: normalizedEmail,
                mappedPhone,
                mappedUsername: normalizedUsername,
                mappedRole
            })
        };
    } catch (error) {
        if (error.statusCode) throw error;
        console.error('HRMS Login Error:', error);
        return null;
    }
}

module.exports = {
    authenticateHRMSUser,
    findLocalRbacUser,
    buildHrmsSessionProfile
};

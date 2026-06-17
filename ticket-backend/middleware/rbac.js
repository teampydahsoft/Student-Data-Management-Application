const { USER_ROLES, canCreateRole, hasPermission, validateRoleRequirements } = require('../constants/rbac');
const { masterPool } = require('../config/database');

/**
 * Check if user is a super admin (including legacy 'admin' role)
 */
const isSuperAdmin = (user) => {
    return user && (user.role === USER_ROLES.SUPER_ADMIN || user.role === 'admin');
};

/**
 * Parse JSON array data from database
 */
const parseArrayData = (data) => {
    if (!data) return [];
    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return data ? [data] : [];
    }
};

/**
 * Verify user has required role
 * Usage: verifyRole('super_admin', 'campus_principal')
 */
const verifyRole = (...allowedRoles) => {
    return (req, res, next) => {
        const user = req.user || req.admin;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Super admin (including legacy 'admin') bypasses all role checks
        if (isSuperAdmin(user)) {
            return next();
        }

        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * Verify user has permission for a module
 * Usage: verifyPermission('student_management', 'write')
 */
const verifyPermission = (module, operation = 'read') => {
    return async (req, res, next) => {
        const user = req.user || req.admin;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Super admin (including legacy 'admin') has all permissions
        if (isSuperAdmin(user)) {
            return next();
        }

        let userPerms = user.permissions || {};

        // Fetch permissions from database if not present in token or if we want to ensure they are up-to-date
        if (user.id) {
            try {
                // 1. Fetch from rbac_users
                const [rbacRows] = await masterPool.query('SELECT permissions FROM rbac_users WHERE id = ?', [user.id]);
                if (rbacRows.length > 0 && rbacRows[0].permissions) {
                    const rawPerms = rbacRows[0].permissions;
                    const parsedPerms = typeof rawPerms === 'string' ? JSON.parse(rawPerms) : rawPerms;
                    userPerms = { ...userPerms, ...parsedPerms };
                }

                // 2. Fetch from ticket_employees -> ticket_roles
                const [empRows] = await masterPool.query(`
                    SELECT tr.permissions, te.role as employee_role 
                    FROM ticket_employees te
                    LEFT JOIN ticket_roles tr ON te.custom_role_id = tr.id AND tr.is_active = 1
                    WHERE te.rbac_user_id = ? AND te.is_active = 1
                `, [user.id]);

                if (empRows.length > 0) {
                    const emp = empRows[0];
                    // If they are 'staff' or 'manager' and no custom role, we might give them default ticket access
                    // But we rely on either their rbac_users permissions or custom role permissions.
                    if (emp.permissions) {
                        const rolePerms = typeof emp.permissions === 'string' ? JSON.parse(emp.permissions) : emp.permissions;
                        // Merge permissions (OR logic)
                        for (const mod in rolePerms) {
                            if (!userPerms[mod]) userPerms[mod] = {};
                            for (const op in rolePerms[mod]) {
                                userPerms[mod][op] = userPerms[mod][op] || rolePerms[mod][op];
                            }
                        }
                    }
                    
                    // Fallback: If they are assigned as 'staff' in ticket_employees but have no explicit ticket_management perms,
                    // grant them basic ticket management access so they can assign/update tickets.
                    if (module === 'ticket_management' || module === 'ticket_dashboard') {
                        if (!userPerms[module]) userPerms[module] = {};
                        userPerms[module]['read'] = true;
                        userPerms[module]['write'] = true;
                    }
                }
            } catch (error) {
                console.error('Error fetching user permissions in rbac middleware:', error);
            }
        }

        // Check if user has the required permission
        if (!hasPermission(userPerms, module, operation)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required permission: ${module} (${operation})`
            });
        }

        next();
    };
};

// ... (Other functions like allowStudentOwnProfileOrPermission, attachUserScope, verifyCanManageUser could be added if needed)
// For Ticket App, we mainly need Role and Permission checks.

module.exports = {
    isSuperAdmin,
    verifyRole,
    verifyPermission,
    parseArrayData
};

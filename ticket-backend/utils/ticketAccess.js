const TICKET_MANAGER_ROLES = new Set(['super_admin', 'admin', 'sub_admin']);

// Ticket-app specific module keys from constants/rbac.js
const TICKET_MODULES = new Set([
    'ticket_dashboard',
    'ticket_management',
    'employee_management',
    'category_management',
    'ticket_reports',
    'ticket_settings'
]);

/**
 * Determine whether a logged-in user manages tickets or raises them as a requester.
 * @returns {'manage'|'request'}
 */
async function resolveTicketAccessMode(masterPool, userId, role, isWorker = false, permissions = null) {
    if (isWorker) return 'manage';
    if (TICKET_MANAGER_ROLES.has(role)) return 'manage';

    // Check ticket_employees table (staff/worker assigned to ticket app)
    const [rows] = await masterPool.query(
        'SELECT id FROM ticket_employees WHERE rbac_user_id = ? AND is_active = 1 LIMIT 1',
        [userId]
    );
    if (rows.length > 0) return 'manage';

    // Check if user has any ticket module permissions (roles created via Role Management)
    if (permissions && typeof permissions === 'object') {
        const hasTicketAccess = Array.from(TICKET_MODULES).some(module => {
            const perm = permissions[module];
            if (!perm || typeof perm !== 'object') return false;
            return Object.values(perm).some(v => v === true);
        });
        if (hasTicketAccess) return 'manage';
    }

    return 'request';
}

module.exports = { resolveTicketAccessMode };

const TICKET_MANAGER_ROLES = new Set(['super_admin', 'admin']);

/**
 * Determine whether a logged-in user manages tickets or raises them as a requester.
 * @returns {'manage'|'request'}
 */
async function resolveTicketAccessMode(masterPool, userId, role, isWorker = false) {
    if (isWorker) return 'manage';
    if (TICKET_MANAGER_ROLES.has(role)) return 'manage';

    const [rows] = await masterPool.query(
        'SELECT id FROM ticket_employees WHERE rbac_user_id = ? AND is_active = 1 LIMIT 1',
        [userId]
    );
    if (rows.length > 0) return 'manage';

    return 'request';
}

module.exports = { resolveTicketAccessMode };

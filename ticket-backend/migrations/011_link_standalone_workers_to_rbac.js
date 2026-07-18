const { masterPool } = require('../config/database');

/**
 * Standalone workers (created directly in ticket_employees) had no rbac_users row,
 * but ticket_assignments.assigned_to has a FK to rbac_users.id. Assigning them either
 * failed ("user not found") or silently pointed at an unrelated rbac user with the
 * same numeric id. This migration creates a login-less rbac_users row for each
 * standalone employee and links it via ticket_employees.rbac_user_id.
 */
async function up() {
    const [workers] = await masterPool.query(`
        SELECT id, name, email, phone, username
        FROM ticket_employees
        WHERE rbac_user_id IS NULL
    `);

    if (workers.length === 0) {
        console.log('✓ No standalone employees to link');
        return;
    }

    for (const worker of workers) {
        let username = worker.username || `ticket-worker-${worker.id}`;
        const [usernameTaken] = await masterPool.query(
            'SELECT id FROM rbac_users WHERE username = ?',
            [username]
        );
        if (usernameTaken.length > 0) {
            username = `${username}.w${worker.id}`;
        }

        let email = worker.email || null;
        if (email) {
            const [emailTaken] = await masterPool.query(
                'SELECT id FROM rbac_users WHERE email = ?',
                [email]
            );
            if (emailTaken.length > 0) {
                email = null;
            }
        }
        if (!email) {
            email = `${username}@ticket-workers.local`;
        }

        // password stays NULL so this row can never be used to log in;
        // standalone workers keep logging in through ticket_employees.
        const [result] = await masterPool.query(
            `INSERT INTO rbac_users
                (name, email, phone, username, password, role, permissions, college_ids, course_ids, branch_ids, is_active)
             VALUES (?, ?, ?, ?, NULL, 'worker', '{}', '[]', '[]', '[]', 1)`,
            [worker.name || username, email, worker.phone || null, username]
        );

        await masterPool.query(
            'UPDATE ticket_employees SET rbac_user_id = ? WHERE id = ?',
            [result.insertId, worker.id]
        );

        console.log(`✓ Linked employee #${worker.id} (${worker.name}) to rbac user #${result.insertId}`);
    }

    console.log(`✓ Linked ${workers.length} standalone employee(s) to rbac_users`);
}

async function down() {
    // Irreversible in a safe way (created rbac_users rows may already be referenced
    // by ticket_assignments). Intentionally a no-op.
    console.log('⚠️  011_link_standalone_workers_to_rbac has no rollback');
}

module.exports = { up, down };

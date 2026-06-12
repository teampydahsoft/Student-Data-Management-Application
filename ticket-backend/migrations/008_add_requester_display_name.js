const { masterPool } = require('../config/database');

/**
 * Store requester display name for HRMS-only staff tickets.
 */
async function up() {
    const [columns] = await masterPool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME = 'requester_display_name'
    `);

    if (columns.length === 0) {
        await masterPool.query(`
            ALTER TABLE tickets
                ADD COLUMN requester_display_name VARCHAR(255) NULL AFTER raised_by_hrms_id
        `);
        console.log('✓ Added requester_display_name column to tickets');
    } else {
        console.log('✓ requester_display_name column already exists');
    }

    await masterPool.query(`
        UPDATE tickets t
        INNER JOIN rbac_users ru ON t.raised_by_rbac_id = ru.id
        SET t.requester_display_name = ru.name
        WHERE t.requester_display_name IS NULL
          AND t.requester_type = 'staff'
          AND ru.name IS NOT NULL
    `).catch(() => {});

    await masterPool.query(`
        UPDATE tickets t
        INNER JOIN rbac_users ru ON t.raised_by_hrms_id COLLATE utf8mb4_unicode_ci = ru.hrms_id COLLATE utf8mb4_unicode_ci
        SET t.requester_display_name = ru.name
        WHERE t.requester_display_name IS NULL
          AND t.requester_type = 'staff'
          AND ru.hrms_id IS NOT NULL
          AND ru.name IS NOT NULL
    `).catch(() => {});
}

async function down() {
    await masterPool.query(`
        ALTER TABLE tickets DROP COLUMN requester_display_name
    `).catch((err) => {
        console.warn('Rollback warning:', err.message);
    });
}

module.exports = { up, down };

const { masterPool } = require('../config/database');

/**
 * Align tickets.raised_by_hrms_id collation with rbac_users.hrms_id (utf8mb4_unicode_ci).
 */
async function up() {
    const [columns] = await masterPool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME = 'raised_by_hrms_id'
    `);

    if (columns.length === 0) {
        console.log('ℹ raised_by_hrms_id column not found, skipping collation fix');
        return;
    }

    await masterPool.query(`
        ALTER TABLE tickets
            MODIFY COLUMN raised_by_hrms_id VARCHAR(24)
            CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    `);
    console.log('✓ Aligned raised_by_hrms_id collation with rbac_users.hrms_id');
}

async function down() {
    // Collation alignment is safe to leave in place
}

module.exports = { up, down };

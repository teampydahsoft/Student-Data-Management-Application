const { masterPool } = require('../config/database');

/**
 * Track HRMS-only ticket requesters without creating rbac_users rows.
 */
async function up() {
    const [columns] = await masterPool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME = 'raised_by_hrms_id'
    `);

    if (columns.length > 0) {
        console.log('✓ raised_by_hrms_id column already exists');
        return;
    }

    await masterPool.query(`
        ALTER TABLE tickets
            ADD COLUMN raised_by_hrms_id VARCHAR(24) NULL AFTER raised_by_rbac_id,
            ADD INDEX idx_raised_by_hrms_id (raised_by_hrms_id)
    `);
    console.log('✓ Added raised_by_hrms_id column to tickets');
}

async function down() {
    await masterPool.query(`
        ALTER TABLE tickets
            DROP COLUMN raised_by_hrms_id
    `).catch((err) => {
        console.warn('Rollback warning:', err.message);
    });
}

module.exports = { up, down };

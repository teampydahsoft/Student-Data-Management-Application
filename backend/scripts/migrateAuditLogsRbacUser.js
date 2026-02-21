/**
 * Migration: Add rbac_user_id column to audit_logs
 * Allows tracking edits by RBAC users (principal, AO, cashier, etc.)
 * who live in rbac_users table rather than the legacy admins table.
 */

const { masterPool } = require('../config/database');

const runMigration = async () => {
    try {
        // Check if column already exists
        const [cols] = await masterPool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audit_logs'
        AND COLUMN_NAME = 'rbac_user_id'
    `);

        if (cols.length > 0) {
            console.log('[Migration] audit_logs.rbac_user_id already exists, skipping.');
            return;
        }

        // Add the column
        await masterPool.query(`
      ALTER TABLE audit_logs
        ADD COLUMN rbac_user_id INT NULL AFTER admin_id
    `);
        console.log('[Migration] Added rbac_user_id column to audit_logs.');

        // Add FK constraint (ignore if rbac_users table doesn't exist yet)
        try {
            await masterPool.query(`
        ALTER TABLE audit_logs
          ADD CONSTRAINT fk_audit_logs_rbac_user
          FOREIGN KEY (rbac_user_id) REFERENCES rbac_users(id) ON DELETE SET NULL
      `);
            console.log('[Migration] Added FK constraint for audit_logs.rbac_user_id.');
        } catch (fkErr) {
            console.warn('[Migration] Could not add FK constraint (rbac_users may not exist yet):', fkErr.message);
        }

        // Add index
        try {
            await masterPool.query(`
        CREATE INDEX idx_audit_rbac_user ON audit_logs (rbac_user_id)
      `);
        } catch (idxErr) {
            // Index might already exist
        }

        console.log('[Migration] rbac_user_id migration complete.');
    } catch (err) {
        console.error('[Migration] Error running rbac_user_id migration:', err.message);
    }
};

module.exports = { runMigration };

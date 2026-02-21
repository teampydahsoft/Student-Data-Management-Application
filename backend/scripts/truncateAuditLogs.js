/**
 * One-time script: Truncate audit_logs table
 * Run: node scripts/truncateAuditLogs.js
 */
const { masterPool } = require('../config/database');

(async () => {
    try {
        console.log('🗑️  Truncating audit_logs table...');
        await masterPool.query('TRUNCATE TABLE audit_logs');
        console.log('✅ audit_logs table cleared successfully.');
    } catch (err) {
        console.error('❌ Failed to truncate audit_logs:', err.message);
    } finally {
        process.exit(0);
    }
})();

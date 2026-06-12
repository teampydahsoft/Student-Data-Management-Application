const { masterPool } = require('../config/database');
const { backfillStaffRequesterNames } = require('../utils/requesterNames');
const { getHRMSConnection } = require('../config/mongoConfig');

/**
 * Backfill requester_display_name for existing staff/faculty tickets.
 */
async function up() {
    getHRMSConnection();
    await backfillStaffRequesterNames();
}

async function down() {
    // Non-destructive backfill — no rollback needed
}

module.exports = { up, down };

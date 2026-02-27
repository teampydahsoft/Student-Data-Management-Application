const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const run = async () => {
    try {
        console.log('Adding composite index on announcements (is_active, created_at DESC)...');
        await masterPool.query('ALTER TABLE announcements ADD INDEX idx_active_date (is_active, created_at DESC);');
        console.log('✅ Index added successfully.');
        process.exit(0);
    } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME') {
            console.log('✅ Index already exists. Skipping.');
            process.exit(0);
        } else {
            console.error('❌ Error adding index:', e);
            process.exit(1);
        }
    }
};

run();

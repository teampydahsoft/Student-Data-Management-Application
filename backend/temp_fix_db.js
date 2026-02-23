const { masterPool } = require('./config/database');

(async () => {
    try {
        console.log('Checking for audience_count column...');
        const [cols] = await masterPool.query('SHOW COLUMNS FROM announcements LIKE "audience_count"');

        if (cols.length === 0) {
            console.log('Adding audience_count column...');
            await masterPool.query('ALTER TABLE announcements ADD COLUMN audience_count INT DEFAULT 0 AFTER target_semester');
            console.log('Column added successfully');
        } else {
            console.log('Column audience_count already exists');
        }
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();

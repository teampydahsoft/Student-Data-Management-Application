// Migration script to create attendance_report_emails_sent table
// Run with: node migrations/run_email_tracking_migration.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function runMigration() {
    let connection;
    try {
        console.log('🔄 Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        });

        console.log('✅ Connected to database');
        console.log('🔄 Creating attendance_report_emails_sent table...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS attendance_report_emails_sent (
                id INT AUTO_INCREMENT PRIMARY KEY,
                report_date DATE NOT NULL,
                college VARCHAR(255) NOT NULL,
                course VARCHAR(255) NOT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_type ENUM('principal', 'hod', 'super_admin') NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_daily_report (report_date, college, course, recipient_email),
                INDEX idx_report_date (report_date),
                INDEX idx_recipient (recipient_email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('✅ Table created successfully!');
        console.log('📊 Verifying table structure...');

        const [rows] = await connection.query(`
            DESCRIBE attendance_report_emails_sent
        `);

        console.log('Table structure:');
        console.table(rows);

        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

runMigration();

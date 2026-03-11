const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runRoleUpdateMigration() {
    let connection;
    try {
        console.log('🔄 Connecting to AWS RDS...');
        // Create connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            multipleStatements: true
        });

        console.log('✅ Connected to database:', process.env.DB_NAME);

        // Read migration file
        const migrationPath = path.join(__dirname, 'migration_update_role_column.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Running migration: migration_update_role_column.sql');

        // Execute migration
        await connection.query(sql);

        console.log('✅ Migration completed successfully!');
        console.log('📊 Column "role" in "rbac_users" has been changed to VARCHAR(64).');

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

runRoleUpdateMigration();

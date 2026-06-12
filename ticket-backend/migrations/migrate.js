const fs = require('fs');
const path = require('path');
const { masterPool, testConnection } = require('../config/database');

/**
 * Migration Runner
 * Executes all pending migrations in order
 */
async function runMigrations() {
    try {
        console.log('🚀 Starting migration process...\n');

        // Test database connection
        console.log('Testing database connection...');
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Database connection failed');
        }
        console.log('✓ Database connected\n');

        // Create migrations tracking table if it doesn't exist
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✓ Migrations tracking table ready\n');

        // Get list of migration files
        const migrationsDir = __dirname;
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.js') && file !== 'migrate.js')
            .sort();

        if (files.length === 0) {
            console.log('No migration files found.');
            return;
        }

        // Get already executed migrations
        const [executedMigrations] = await masterPool.query(
            'SELECT name FROM migrations'
        );
        const executedNames = executedMigrations.map(m => m.name);

        // Run pending migrations
        let executedCount = 0;
        for (const file of files) {
            const migrationName = file.replace('.js', '');

            if (executedNames.includes(migrationName)) {
                console.log(`⏭️  Skipping ${migrationName} (already executed)`);
                continue;
            }

            console.log(`\n📝 Running migration: ${migrationName}`);
            console.log('─'.repeat(50));

            const migration = require(path.join(migrationsDir, file));

            if (typeof migration.up !== 'function') {
                console.warn(`⚠️  Warning: ${file} does not export an 'up' function. Skipping.`);
                continue;
            }

            // Execute migration
            await migration.up();

            // Record migration as executed
            await masterPool.query(
                'INSERT INTO migrations (name) VALUES (?)',
                [migrationName]
            );

            console.log(`✅ Completed: ${migrationName}`);
            executedCount++;
        }

        console.log('\n' + '='.repeat(50));
        if (executedCount === 0) {
            console.log('✨ All migrations are up to date!');
        } else {
            console.log(`✨ Successfully executed ${executedCount} migration(s)!`);
        }
        console.log('='.repeat(50) + '\n');

    } catch (error) {
        console.error('\n❌ Migration process failed:', error.message);
        console.error(error);
        if (require.main === module) {
            process.exit(1);
        }
        throw error;
    }
}

/**
 * Rollback the last migration
 */
async function rollbackMigration() {
    try {
        console.log('🔄 Starting rollback process...\n');

        // Test database connection
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Database connection failed');
        }

        // Get the last executed migration
        const [lastMigration] = await masterPool.query(
            'SELECT name FROM migrations ORDER BY id DESC LIMIT 1'
        );

        if (lastMigration.length === 0) {
            console.log('No migrations to rollback.');
            return;
        }

        const migrationName = lastMigration[0].name;
        const migrationFile = `${migrationName}.js`;

        console.log(`📝 Rolling back: ${migrationName}`);
        console.log('─'.repeat(50));

        const migration = require(path.join(__dirname, migrationFile));

        if (typeof migration.down !== 'function') {
            throw new Error(`Migration ${migrationFile} does not export a 'down' function`);
        }

        // Execute rollback
        await migration.down();

        // Remove migration record
        await masterPool.query(
            'DELETE FROM migrations WHERE name = ?',
            [migrationName]
        );

        console.log(`✅ Rolled back: ${migrationName}\n`);

    } catch (error) {
        console.error('\n❌ Rollback failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'rollback') {
        rollbackMigration().then(() => process.exit(0));
    } else {
        runMigrations().then(() => process.exit(0));
    }
}

module.exports = { runMigrations, rollbackMigration };

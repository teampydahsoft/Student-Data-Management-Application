const { masterPool } = require('../config/database');

/**
 * Allow staff (HRMS / RBAC users) to raise tickets alongside students.
 */
async function up() {
    const [columns] = await masterPool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME = 'raised_by_rbac_id'
    `);

    if (columns.length > 0) {
        console.log('✓ Staff ticket requester columns already exist');
        return;
    }

    await masterPool.query('SET SESSION lock_wait_timeout = 30');

    const [foreignKeys] = await masterPool.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tickets'
          AND COLUMN_NAME = 'student_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    for (const fk of foreignKeys) {
        console.log(`Dropping FK ${fk.CONSTRAINT_NAME}...`);
        await masterPool.query(`ALTER TABLE tickets DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
        console.log(`✓ Dropped foreign key ${fk.CONSTRAINT_NAME} on tickets.student_id`);
    }

    console.log('Altering tickets table for staff requesters...');
    await masterPool.query(`ALTER TABLE tickets MODIFY COLUMN student_id INT NULL`);
    await masterPool.query(`ALTER TABLE tickets MODIFY COLUMN admission_number VARCHAR(100) NULL`);
    await masterPool.query(`
        ALTER TABLE tickets
            ADD COLUMN requester_type ENUM('student', 'staff') NOT NULL DEFAULT 'student' AFTER admission_number,
            ADD COLUMN raised_by_rbac_id INT NULL AFTER requester_type,
            ADD INDEX idx_raised_by_rbac_id (raised_by_rbac_id),
            ADD INDEX idx_requester_type (requester_type)
    `);
    console.log('✓ Added staff requester columns to tickets');

    await masterPool.query(`
        ALTER TABLE tickets
            ADD CONSTRAINT fk_tickets_student
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
    `).catch(() => {
        console.log('ℹ Skipped re-adding student FK (may already exist)');
    });

    await masterPool.query(`
        ALTER TABLE tickets
            ADD CONSTRAINT fk_tickets_raised_by_rbac
                FOREIGN KEY (raised_by_rbac_id) REFERENCES rbac_users(id) ON DELETE SET NULL
    `).catch(() => {
        console.log('ℹ Skipped adding raised_by_rbac FK (may already exist)');
    });

    console.log('✓ Staff ticket requester migration complete');
}

async function down() {
    await masterPool.query(`
        ALTER TABLE tickets
            DROP FOREIGN KEY fk_tickets_raised_by_rbac,
            DROP FOREIGN KEY fk_tickets_student,
            DROP COLUMN raised_by_rbac_id,
            DROP COLUMN requester_type,
            MODIFY COLUMN student_id INT NOT NULL,
            MODIFY COLUMN admission_number VARCHAR(100) NOT NULL
    `).catch((err) => {
        console.warn('Rollback warning:', err.message);
    });
}

module.exports = { up, down };

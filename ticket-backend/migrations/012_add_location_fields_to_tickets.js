const { masterPool } = require('../config/database');

/**
 * Migration: Add location fields (college, block_no, floor_no, room_no) to tickets table
 */
async function up() {
    console.log('Adding location fields (college, block_no, floor_no, room_no) to tickets table...');

    const columnsToAdd = [
        { name: 'college_id', spec: 'INT NULL AFTER sub_category_id' },
        { name: 'college_name', spec: 'VARCHAR(255) NULL AFTER college_id' },
        { name: 'block_no', spec: 'VARCHAR(100) NULL AFTER college_name' },
        { name: 'floor_no', spec: 'VARCHAR(100) NULL AFTER block_no' },
        { name: 'room_no', spec: 'VARCHAR(100) NULL AFTER floor_no' }
    ];

    for (const col of columnsToAdd) {
        try {
            await masterPool.query(`ALTER TABLE tickets ADD COLUMN ${col.name} ${col.spec}`);
            console.log(`✓ Added column '${col.name}' to tickets table`);
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log(`ℹ️ Column '${col.name}' already exists in tickets table`);
            } else {
                console.error(`⚠️ Error adding column '${col.name}':`, error.message);
            }
        }
    }

    console.log('✓ Migration 012_add_location_fields_to_tickets completed successfully.');
}

async function down() {
    console.log('Reverting 012_add_location_fields_to_tickets migration...');
    const columnsToDrop = ['room_no', 'floor_no', 'block_no', 'college_name', 'college_id'];
    for (const col of columnsToDrop) {
        try {
            await masterPool.query(`ALTER TABLE tickets DROP COLUMN ${col}`);
        } catch (_) {}
    }
}

module.exports = { up, down };

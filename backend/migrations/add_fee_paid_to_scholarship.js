/**
 * Migration: Add fee_paid column to student_scholarship table
 * 
 * Purpose: Track whether scholarship fee has been paid per semester.
 * For Year 1 eligible students, registration Step 5 (scholarship) will only be
 * complete when fee_paid = 1 for the current semester.
 */

const { masterPool } = require('../config/database');

const up = async () => {
  const connection = await masterPool.getConnection();
  try {
    console.log('Adding fee_paid column to student_scholarship table...');
    
    await connection.query(`
      ALTER TABLE student_scholarship
      ADD COLUMN fee_paid TINYINT(1) DEFAULT 0
      COMMENT 'Whether scholarship fee has been paid for this semester (0=No, 1=Yes)'
      AFTER paid_amount
    `);
    
    console.log('✓ fee_paid column added successfully');
    console.log('✓ Default value is 0 (not paid)');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

const down = async () => {
  const connection = await masterPool.getConnection();
  try {
    console.log('Removing fee_paid column from student_scholarship table...');
    
    await connection.query(`
      ALTER TABLE student_scholarship
      DROP COLUMN fee_paid
    `);
    
    console.log('✓ fee_paid column removed successfully');
    
  } catch (error) {
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// Run migration if executed directly
if (require.main === module) {
  const command = process.argv[2] || 'up';
  
  (async () => {
    try {
      if (command === 'up') {
        await up();
        console.log('\n✓ Migration completed successfully');
      } else if (command === 'down') {
        await down();
        console.log('\n✓ Rollback completed successfully');
      } else {
        console.log('Usage: node add_fee_paid_to_scholarship.js [up|down]');
      }
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Migration failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };

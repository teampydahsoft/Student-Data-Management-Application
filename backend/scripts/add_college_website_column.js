const { masterPool } = require('../config/database');

async function addWebsiteToColleges() {
  try {
    console.log('🔄 Checking colleges table schema for website column...');

    await masterPool.query('SET SESSION lock_wait_timeout = 5');

    const [columns] = await masterPool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'colleges' 
      AND COLUMN_NAME = 'website'
    `);

    if (columns.length === 0) {
      console.log('Adding website column to colleges table...');
      await masterPool.query(`
        ALTER TABLE colleges 
        ADD COLUMN website VARCHAR(255) NULL AFTER address
      `);
      console.log('✅ Successfully added website column to colleges table');
    } else {
      console.log('ℹ️ website column already exists in colleges table');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding website column to colleges table:', error);
    process.exit(1);
  }
}

addWebsiteToColleges();

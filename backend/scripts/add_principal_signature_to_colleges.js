const { masterPool } = require('../config/database');

async function addPrincipalSignatureToColleges() {
  try {
    console.log('🔄 Checking colleges table schema for principal_signature...');

    // Set lock wait timeout to 5s so we don't hang indefinitely
    await masterPool.query('SET SESSION lock_wait_timeout = 5');

    const [columns] = await masterPool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'colleges' 
      AND COLUMN_NAME IN ('principal_signature', 'principal_signature_type')
    `);

    const existingCols = columns.map(c => c.COLUMN_NAME);

    if (!existingCols.includes('principal_signature')) {
      console.log('Adding principal_signature column...');
      await masterPool.query(`
        ALTER TABLE colleges 
        ADD COLUMN principal_signature LONGBLOB DEFAULT NULL
      `);
      console.log('✓ Added principal_signature column');
    } else {
      console.log('ℹ️ principal_signature column already exists');
    }

    if (!existingCols.includes('principal_signature_type')) {
      console.log('Adding principal_signature_type column...');
      await masterPool.query(`
        ALTER TABLE colleges 
        ADD COLUMN principal_signature_type VARCHAR(50) DEFAULT NULL
      `);
      console.log('✓ Added principal_signature_type column');
    } else {
      console.log('ℹ️ principal_signature_type column already exists');
    }

    console.log('✅ Colleges table successfully updated with principal_signature.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding principal_signature to colleges table:', error);
    process.exit(1);
  }
}

addPrincipalSignatureToColleges();

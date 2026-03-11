const { masterPool } = require('./config/database');
require('dotenv').config();

async function checkSchema() {
  try {
    const [rows] = await masterPool.query('DESCRIBE rbac_users');
    console.log('--- rbac_users SCHEMA ---');
    rows.forEach(row => {
      console.log(`${row.Field} (${row.Type})`);
    });

    const [users] = await masterPool.query('SELECT * FROM rbac_users LIMIT 5');
    console.log('\n--- SAMPLE DATA ---');
    console.log(users);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();

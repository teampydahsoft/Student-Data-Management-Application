const { masterPool } = require('./config/database');
require('dotenv').config();

async function checkUsers() {
  try {
    const [users] = await masterPool.query('SELECT id, name, username, email, role, hrms_id FROM rbac_users');
    console.log('--- ALL USERS ---');
    users.forEach(u => {
      console.log(`${u.id}: ${u.name} (${u.username}) - Role: [${u.role}] - HRMS: [${u.hrms_id}]`);
    });

    const [missingRole] = await masterPool.query('SELECT * FROM rbac_users WHERE role IS NULL OR role = ""');
    if (missingRole.length > 0) {
      console.log('\n--- USERS WITH MISSING ROLES ---');
      console.log(missingRole);
    } else {
      console.log('\nNo users found with missing roles.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkUsers();

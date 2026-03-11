const { masterPool } = require('./config/database');
const { getHRMSConnection } = require('./config/mongoConfig');
const { getModel: getHRMSEmployeeModel } = require('./models/HRMSEmployee');
require('dotenv').config();

async function checkPotentialLinks() {
  const hrmsConn = getHRMSConnection();
  if (!hrmsConn) {
    console.log('No HRMS connection');
    process.exit();
  }
  const HRMSEmployee = getHRMSEmployeeModel(hrmsConn);

  try {
    const [users] = await masterPool.query('SELECT id, name, username, hrms_id FROM rbac_users WHERE hrms_id IS NULL');
    console.log(`Checking ${users.length} users for potential HRMS links...`);

    let potentialLinks = 0;
    for (const user of users) {
      const emp = await HRMSEmployee.findOne({ emp_no: user.username }).lean().exec();
      if (emp) {
        potentialLinks++;
        // console.log(`Match found: ${user.name} (${user.username}) -> HRMS ID: ${emp._id}`);
      }
    }
    console.log(`Found ${potentialLinks} potential matches!`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

// Wait a bit for connection
setTimeout(checkPotentialLinks, 2000);

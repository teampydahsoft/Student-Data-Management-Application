const mongoose = require('mongoose');
const { hrmsUserSchema } = require('./backend/models/HRMSUser');
const { hrmsEmployeeSchema } = require('./backend/models/HRMSEmployee');
require('dotenv').config({ path: './backend/.env' });

async function debug() {
  const conn = await mongoose.createConnection(process.env.HRMS_MONGO_URL).asPromise();
  const User = conn.model('User', hrmsUserSchema, 'users');
  const Employee = conn.model('Employee', hrmsEmployeeSchema, 'employees');

  console.log('--- EMPLOYEE SEARCH (1434) ---');
  const emp = await Employee.findOne({ emp_no: '1434' }).lean().exec();
  console.log(JSON.stringify(emp, null, 2));

  console.log('\n--- USER SEARCH (Bashir) ---');
  const user = await User.findOne({ name: /Bashir/i }).lean().exec();
  console.log(JSON.stringify(user, null, 2));

  await conn.close();
}

debug().catch(console.error);

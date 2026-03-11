const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function debug() {
  console.log('Connecting to:', process.env.HRMS_MONGO_URL);
  const conn = await mongoose.createConnection(process.env.HRMS_MONGO_URL).asPromise();
  
  // Use loose schemas to see all fields
  const User = conn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const Employee = conn.model('Employee', new mongoose.Schema({}, { strict: false }), 'employees');

  console.log('--- EMPLOYEE SEARCH (1434) ---');
  const emp = await Employee.findOne({ emp_no: '1434' }).lean().exec();
  console.log(emp);

  console.log('\n--- USER SEARCH (Bashir) ---');
  const user = await User.findOne({ 
      $or: [
          { name: /Bashir/i },
          { email: /ao\.poly/i }
      ]
  }).lean().exec();
  console.log(user);

  await conn.close();
}

debug().catch(console.error);

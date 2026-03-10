const mongoose = require('mongoose');

const hrmsEmployeeSchema = new mongoose.Schema({
  emp_no: String,
  employee_name: String,
  email: String,
  phone_number: String,
  designation_id: mongoose.Schema.Types.ObjectId,
  department_id: mongoose.Schema.Types.ObjectId,
  division_id: mongoose.Schema.Types.ObjectId,
  is_active: Boolean,
  password: { type: String, select: true }
}, { timestamps: true });

// Export the schema and a factory function
module.exports = {
  hrmsEmployeeSchema,
  getModel: (connection) => {
    if (!connection) throw new Error("Connection is required for HRMSEmployee model");
    return connection.model('Employee', hrmsEmployeeSchema, 'employees');
  }
};

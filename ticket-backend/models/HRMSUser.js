const mongoose = require('mongoose');

const hrmsUserSchema = new mongoose.Schema({
    email: String,
    password: { type: String, select: true },
    name: String,
    role: String,
    roles: [String],
    isActive: Boolean,
    employeeId: String,
    employeeRef: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

module.exports = {
    hrmsUserSchema,
    getModel: (connection) => {
        if (!connection) throw new Error('Connection is required for HRMSUser model');
        return connection.model('User', hrmsUserSchema, 'users');
    }
};

const mongoose = require('mongoose');

const studentFeeSchema = mongoose.Schema({
  studentId: {
    type: String, // Admission Number
    required: true,
  },
  studentName: { // Snapshot for display convenience
    type: String,
  },
  feeHead: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'FeeHead',
  },
  structureId: { // Optional ref to the template used
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeStructure',
  },
  college: {
    type: String,
    required: true,
  },
  course: {
    type: String,
    required: true,
  },
  branch: {
    type: String,
    required: true,
  },
  academicYear: {
    type: String, // e.g., "2024-2025"
    required: true,
  },
  studentYear: {
    type: Number, // e.g., 1
    required: true,
  },
  semester: {
    type: Number, // 1 or 2. Optional
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'transferred'],
    default: 'active',
  },
  remarks: {
    type: String,
  }
}, {
  timestamps: true,
});

// Compound index to prevent duplicate fee of same head for same student/year/semester (Including remarks to allow different clubs)
studentFeeSchema.index({ studentId: 1, feeHead: 1, academicYear: 1, studentYear: 1, semester: 1, remarks: 1 }, { unique: true });

module.exports = mongoose.model('StudentFee', studentFeeSchema);

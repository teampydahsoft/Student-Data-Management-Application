const mongoose = require('mongoose');
const { getHostelConnection } = require('../config/mongoConfig');

const HOSTEL_REQUEST_STATUSES = ['active', 'expired', 'cancelled'];

const hostelRequestSchema = new mongoose.Schema({
  studentMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMaster',
    required: true,
    index: true
  },
  admissionNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  academicYear: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: HOSTEL_REQUEST_STATUSES,
    default: 'active',
    index: true
  },
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hostel',
    required: true,
    index: true
  },
  hostelCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HostelCategory',
    required: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: false,
    index: true
  },
  roomNumber: { type: String, required: false, trim: true },
  bedNumber: { type: String, trim: true },
  lockerNumber: { type: String, trim: true },
  collegeCode: { type: String, required: true, trim: true, uppercase: true },
  courseCode: { type: String, required: true, trim: true, uppercase: true },
  hostelCode: { type: String, required: true, trim: true, uppercase: true },
  yearlySequenceNumber: { type: Number, required: true, min: 1 },
  hostelSequenceId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  sdmsRollNumber: { type: String, trim: true, uppercase: true },
  sdmsName: { type: String, trim: true },
  sdmsGender: {
    type: String,
    enum: ['Male', 'Female'],
    required: false
  },
  sdmsCourse: { type: String, trim: true },
  sdmsBranch: { type: String, trim: true },
  sdmsYearOfStudy: { type: Number, min: 1, max: 10 },
  sdmsBatch: { type: String, trim: true },
  sdmsCollegeName: { type: String, trim: true },
  sdmsSyncedAt: { type: Date },
  mealType: {
    type: String,
    enum: ['veg', 'non-veg'],
    default: 'veg'
  },
  parentPermissionForOuting: {
    type: Boolean,
    default: true
  },
  concession: { type: Number, default: 0, min: 0 },
  admitDate: { type: Date, default: Date.now },
  joiningDate: { type: Date, default: null },
  leftDate: { type: Date, default: null },
  allocatedAt: { type: Date, default: Date.now },
  expiredAt: { type: Date },
  cancelledAt: { type: Date },
  statusReason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' }
}, {
  timestamps: true
});

// Helper function to get model bound to hostelConnection
function getHostelRequestModel() {
  const conn = getHostelConnection();
  if (!conn) return null;
  if (conn.models && conn.models.HostelRequest) {
    return conn.models.HostelRequest;
  }
  return conn.model('HostelRequest', hostelRequestSchema, 'hostelrequests');
}

module.exports = {
  HOSTEL_REQUEST_STATUSES,
  hostelRequestSchema,
  getHostelRequestModel
};

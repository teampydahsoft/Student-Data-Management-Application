const mongoose = require('mongoose');
const { getHostelConnection } = require('../config/mongoConfig');

const hostelCategorySchema = new mongoose.Schema({
  hostel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hostel',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

function getHostelCategoryModel() {
  const conn = getHostelConnection();
  if (!conn) return null;
  if (conn.models && conn.models.HostelCategory) {
    return conn.models.HostelCategory;
  }
  return conn.model('HostelCategory', hostelCategorySchema, 'hostelcategories');
}

module.exports = {
  hostelCategorySchema,
  getHostelCategoryModel
};

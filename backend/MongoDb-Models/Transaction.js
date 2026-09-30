const mongoose = require('mongoose');

const transactionSchema = mongoose.Schema({
  studentId: {
    type: String, // Admission Number (from SQL)
    required: true,
  },
  studentName: {
    type: String, // Snapshot of name
  },
  feeHead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeHead',
  },
  amount: {
    type: Number,
    required: true,
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  transactionType: {
    type: String,
    enum: ['DEBIT', 'CREDIT'],
    default: 'DEBIT',
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'transferred'],
    default: 'active',
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'UPI', 'Cheque', 'DD', 'Card', 'Net Banking', 'Adjustment', 'Waiver', 'Refund', 'Credit'],
    default: 'Cash',
  },
  bankName: {
    type: String, // For Cheque or DD
  },
  instrumentDate: {
    type: Date, // For Cheque/DD Date
  },
  referenceNo: {
    type: String, // Bank RRN (Retrieval Reference Number) or Txn ID from Bank
  },
  gatewayPaymentId: {
    type: String, // Razorpay Payment ID or Gateway Reference
    unique: true,
    sparse: true
  },
  remarks: {
    type: String,
  },
  semester: {
    type: String, // e.g., "1", "2"
  },
  studentYear: {
    type: String, // e.g., "1", "2", "3", "4"
  },
  receiptNumber: {
    type: String,
    // unique: true, // Removed to allow multiple transactions to share the same receipt number
  },
  collectedBy: {
    type: String, // Username (e.g., 'admin')
  },
  collectedByName: {
    type: String, // Full Name (e.g., 'Administrator')
  },
  paymentConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentConfig'
  },
  depositedToAccount: {
    type: String // Snapshot of account name
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Transaction', transactionSchema);

const mongoose = require('mongoose');
const transportConnection = require('../config/transportDb');

const transportRequestSchema = new mongoose.Schema({
    id: {
        type: Number,
        unique: true,
        sparse: true,
        default: null
    },
    admission_number: {
        type: String,
        trim: true,
        default: null
    },
    student_name: {
        type: String,
        trim: true,
        default: null
    },
    route_id: {
        type: String,
        required: true,
        trim: true,
        default: null
    },
    route_name: {
        type: String,
        trim: true,
        default: null
    },
    stage_name: {
        type: String,
        trim: true,
        default: null
    },
    bus_id: {
        type: String,
        trim: true,
        default: null
    },
    fare: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled', 'expired'],
        default: 'pending'
    },
    cancellation_reason: {
        type: String,
        default: null
    },
    cancelled_at: {
        type: Date,
        default: null
    },
    request_date: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    semester_id: {
        type: Number,
        default: null
    },
    semester_start_date: {
        type: Date,
        default: null
    },
    semester_end_date: {
        type: Date,
        default: null
    },
    expiry_date: {
        type: Date,
        default: null
    },
    academic_year_id: {
        type: Number,
        default: null
    },
    year_of_study: {
        type: Number,
        default: null
    },
    academic_year: {
        type: String,
        trim: true,
        default: null
    },
    application_number: {
        type: String,
        trim: true,
        default: null
    },
    application_serial: {
        type: Number,
        default: null
    },
    application_college_code: {
        type: String,
        trim: true,
        default: null
    },
    application_course_code: {
        type: String,
        trim: true,
        default: null
    },
    physical_card_qr: {
        type: String,
        trim: true,
        default: null
    },
    semester_number: {
        type: Number,
        default: null
    },
    raised_by: {
        type: String,
        trim: true,
        default: 'student'
    },
    raised_by_id: {
        type: Number,
        default: null
    },
    new_id_card_needed: {
        type: Boolean,
        default: false
    },
    expiry_reason: {
        type: String,
        default: null
    },
    not_interested: {
        type: Boolean,
        default: false
    },
    not_interested_reason: {
        type: String,
        default: null
    },
    is_detained: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: 'request_date', updatedAt: 'updated_at' },
    collection: 'transport_requests'
});

// Avoid recompiling model if already exists on transportConnection
const TransportRequest = transportConnection.models.TransportRequest || transportConnection.model('TransportRequest', transportRequestSchema, 'transport_requests');

module.exports = TransportRequest;

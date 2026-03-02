const express = require('express');
const router = express.Router();
const qrConfigController = require('../controllers/qrConfigController');
const authMiddleware = require('../middleware/auth');

// Public routes - no auth middleware required

// GET /api/qr/public/:qrToken
// Looks up student by opaque UUID token (not admission number) — safe to expose publicly
router.get('/public/:qrToken', qrConfigController.getPublicStudentData);

// POST /api/qr/verify
// Verifies RBAC credentials and returns private (role-configured) fields
router.post('/verify', qrConfigController.verifyQrAccess);

// Protected routes - requires admin/RBAC auth

// GET /api/qr/token/:admissionNumber
// Returns (or generates) the opaque QR token for a student — used by DigitalStudentCard
router.get('/token/:admissionNumber', authMiddleware, qrConfigController.getStudentQrToken);

module.exports = router;

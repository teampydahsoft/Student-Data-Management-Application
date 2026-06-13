const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Debugging: Ensure controller functions exist
if (!authController.verifyToken) {
    console.error("CRITICAL ERROR: authController.verifyToken is undefined!");
}
if (!authController.unifiedLogin) {
    console.error("CRITICAL ERROR: authController.unifiedLogin is undefined!");
}

// Verify token (Protected route)
router.get('/verify', authMiddleware, authController.verifyToken);

// Login (Public route)
router.post('/unified-login', authController.unifiedLogin);

// HRMS / portal SSO (no password)
router.post('/hrms-sso-session', authController.hrmsSsoSession);
router.get('/sso-config', authController.getSsoConfig);

module.exports = router;

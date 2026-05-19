const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const rbacUserController = require('../controllers/rbacUserController');
const parentAuthController = require('../controllers/parentAuthController');

const { attachUserScope } = require('../middleware/rbac');

// Public routes
router.post('/login', authController.login);
router.post('/unified-login', authController.unifiedLogin);
router.post('/sso-session', authController.createSSOSession);
router.post('/rbac/forgot-password', rbacUserController.forgotPassword);
router.get('/login-stats', authController.getStudentLoginStats); // Currently public for testing
router.post('/parent/otp/send', parentAuthController.sendParentOtp);
router.post('/parent/otp/verify', parentAuthController.verifyParentOtp);
router.post('/parent/select-student', parentAuthController.selectParentStudent);


// Protected routes
router.get('/verify', authMiddleware, authController.verifyToken);
router.post('/change-password', authMiddleware, authController.changePassword);
router.put('/profile', authMiddleware, authController.updateProfile);
router.get('/profile/stats', authMiddleware, attachUserScope, rbacUserController.getStudentStats);

module.exports = router;

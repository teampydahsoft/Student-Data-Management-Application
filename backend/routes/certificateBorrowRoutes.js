const express = require('express');
const router = express.Router();
const certificateBorrowController = require('../controllers/certificateBorrowController');
const verifyToken = require('../middleware/auth');
const { verifyPermission: checkPermission, attachUserScope } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

// Student endpoints
router.get('/student/submitted-certificates/:admissionNumber', verifyToken, certificateBorrowController.getSubmittedCertificates);
router.post('/student/request', verifyToken, certificateBorrowController.createRequest);
router.get('/student/history/:admissionNumber', verifyToken, certificateBorrowController.getStudentHistory);

// Admin endpoints
router.get('/admin/all-requests', verifyToken, checkPermission(MODULES.SERVICES, 'manage_certificate_borrow'), attachUserScope, certificateBorrowController.getAllRequests);
router.put('/admin/update-status/:id', verifyToken, checkPermission(MODULES.SERVICES, 'manage_certificate_borrow'), certificateBorrowController.updateStatus);

module.exports = router;

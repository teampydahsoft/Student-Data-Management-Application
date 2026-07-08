const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const documentSettingsController = require('../controllers/documentSettingsController');
const qrConfigController = require('../controllers/qrConfigController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Notification settings routes
router.get('/notifications', settingsController.getNotificationSettings);
router.put('/notifications', settingsController.updateNotificationSettings);

// Attendance settings routes
router.get('/attendance', settingsController.getAttendanceSettings);
router.put('/attendance', settingsController.updateAttendanceSettings);

// Student Portal Layout settings routes
router.get('/student-layout', settingsController.getStudentLayoutSettings);
router.put('/student-layout', settingsController.updateStudentLayoutSettings);

// Certificate configuration routes
router.get('/certificates', settingsController.getCertificateSettings);
router.put('/certificates', settingsController.updateCertificateSettings);

// Document requirements settings routes (new CRUD API)
router.get('/documents', documentSettingsController.getAllDocumentRequirements);
router.get('/documents/:courseType/:academicStage', documentSettingsController.getDocumentRequirements);
router.post('/documents', documentSettingsController.upsertDocumentRequirements);
router.delete('/documents/:courseType/:academicStage', documentSettingsController.deleteDocumentRequirements);

// Legacy document requirements routes (for backward compatibility)
router.get('/document-requirements', documentSettingsController.getDocumentRequirementsLegacy);
router.put('/document-requirements', documentSettingsController.updateDocumentRequirements);
router.get('/document-requirements/:courseType', documentSettingsController.getDocumentRequirementsByCourseType);

// QR Code Configuration routes
router.get('/qr-config', qrConfigController.getQrConfig);
router.post('/qr-config', qrConfigController.saveQrConfig);

// Frozen Batches Configuration routes
router.get('/frozen-batches', settingsController.getFrozenBatches);
router.put('/frozen-batches', settingsController.updateFrozenBatches);

// Profile update field settings routes
router.get('/profile-update-fields', settingsController.getProfileUpdateFields);
router.put('/profile-update-fields', settingsController.updateProfileUpdateFields);

// RTF Amount Setup routes
router.get('/rtf-amount', settingsController.getRtfAmountConfig);
router.put('/rtf-amount', settingsController.updateRtfAmountConfig);
router.post('/rtf-amount/apply', settingsController.applyRtfAmountToStudents);

// Registration Stage Config routes (optional stages per branch + student year 1/2/3/4)
router.get('/registration-stage-config', settingsController.getRegistrationStageConfig);
router.put('/registration-stage-config', settingsController.updateRegistrationStageConfig);
router.get('/registration-stage-config/branch/:branchCode', settingsController.getRegistrationStageConfigForBranch);

module.exports = router;



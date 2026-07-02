const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

const authMiddleware = require('../middleware/auth');
const { attachUserScope, verifyPermission, allowStudentOwnProfileOrPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');
const multer = require('multer');

// Configure multer for photo uploads
const photoUpload = multer({ dest: 'uploads/' });

// Configure multer for document uploads (multiple files)
// Also allow larger text fields (for base64 photos in student_data)
const documentUpload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024,      // 10MB per file
    fieldSize: 15 * 1024 * 1024      // Allow larger text fields like base64 images
  }
});

// Public student login
router.post('/login', studentController.login);
router.post('/forgot-password', studentController.forgotPassword); // Public forgot password

// Protected Change Password Route (Student)
router.post(
  '/change-password',
  authMiddleware,
  studentController.changePassword
);

// All routes are protected and scoped by user's assigned colleges/courses/branches
// View-only access
router.get(
  '/',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getAllStudents
);
router.get(
  '/filter-fields',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getFilterFields
);
router.get(
  '/filter-options',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getFilterOptions
);
router.get(
  '/quick-filters',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getQuickFilterOptions
);
router.put(
  '/filter-fields/:fieldName',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  studentController.updateFilterField
);
router.get(
  '/stats',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getDashboardStats
);

router.get(
  '/batches',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getBatches
);

router.get(
  '/distinct-castes',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getDistinctCastes
);

router.get(
  '/batch-status',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getBatchAcademicStatus
);

router.get(
  '/section-partition',
  authMiddleware,
  verifyPermission(MODULES.SECTION_PARTITION, 'view'),
  attachUserScope,
  studentController.getSectionPartitionStudents
);

router.post(
  '/section-partition/save',
  authMiddleware,
  verifyPermission(MODULES.SECTION_PARTITION, 'manage'),
  attachUserScope,
  studentController.bulkSaveSectionPartition
);

router.use('/reports', require('./reports'));

router.get(
  '/dashboard-stats',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getDashboardStats
);
router.post(
  '/bulk-upload/preview',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'bulk_upload'),
  attachUserScope,
  studentController.uploadMiddleware,
  studentController.previewBulkUploadStudents
);
router.post(
  '/bulk-upload/commit',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'bulk_upload'),
  attachUserScope,
  studentController.commitBulkUploadStudents
);
router.post(
  '/bulk-update-pin-numbers',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'update_pin'),
  attachUserScope,
  studentController.uploadMiddleware,
  studentController.bulkUpdatePinNumbers
);
router.post(
  '/bulk-delete',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'delete_student'),
  attachUserScope,
  studentController.bulkDeleteStudents
);
router.post(
  '/upload-photo',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  photoUpload.single('photo'),
  studentController.uploadStudentPhoto
);
router.post(
  '/promotions/bulk',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.bulkPromoteStudents
);
router.post(
  '/transfers/bulk',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.bulkTransferStudents
);
router.post(
  '/',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'add_student'),
  attachUserScope,
  documentUpload.any(),
  studentController.createStudent
);
router.post(
  '/:admissionNumber/promote',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.promoteStudent
);
router.get(
  '/:admissionNumber',
  authMiddleware,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getStudentByAdmission
);

router.get(
  '/:admissionNumber/photo',
  authMiddleware,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  attachUserScope,
  studentController.getStudentPhoto
);
router.put(
  '/:admissionNumber',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.updateStudent
);
router.put(
  '/:admissionNumber/pin-number',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'update_pin'),
  attachUserScope,
  studentController.updatePinNumber
);
router.patch(
  '/:admissionNumber/section',
  authMiddleware,
  verifyPermission(MODULES.SECTION_PARTITION, 'manage'),
  attachUserScope,
  studentController.updateStudentSection
);
router.get(
  '/:admissionNumber/password',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.viewStudentPassword
);
router.post(
  '/:admissionNumber/reset-password',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.resetStudentPassword
);
router.put(
  '/:admissionNumber/fee-status',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.updateFeeStatus
);
router.put(
  '/:admissionNumber/registration-status',
  authMiddleware,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.updateRegistrationStatus
);
router.post(
  '/:admissionNumber/registration/acknowledge-promotion',
  authMiddleware,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.acknowledgeRegistrationPromotion
);
router.post(
  '/check-expired-permits',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.checkExpiredPermits
);

// Verify Mobile (Admin Override)
router.post(
  '/verify-mobile',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.adminVerifyMobile
);

router.post('/otp/send', authMiddleware, studentController.sendOtp);
router.post('/otp/verify', authMiddleware, studentController.verifyOtp);
router.get(
  '/:admissionNumber/sms-logs',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view_sms'),
  attachUserScope,
  studentController.getStudentSmsLogs
);
router.delete(
  '/:admissionNumber',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'delete_student'),
  attachUserScope,
  studentController.deleteStudent
);

router.post(
  '/bulk-resend-passwords',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'), // Requires edit_student permission
  attachUserScope,
  studentController.bulkResendPasswords
);

// Student rejoin endpoint
router.post(
  '/:admissionNumber/rejoin',
  authMiddleware,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  attachUserScope,
  studentController.rejoinStudent
);





module.exports = router;

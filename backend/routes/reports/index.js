const express = require('express');
const router = express.Router();
const studentController = require('../../controllers/studentController');
const categoryReportController = require('../../controllers/reports/categoryReportController');
const smsReportController = require('../../controllers/reports/smsReportController');
const scholarshipReportController = require('../../controllers/reports/scholarshipReportController');
const authMiddleware = require('../../middleware/auth');
const { attachUserScope, verifyPermission } = require('../../middleware/rbac');
const { MODULES } = require('../../constants/rbac');

// Registration reports (delegate to studentController)
router.get(
  '/registration/abstract',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_registration'),
  attachUserScope,
  studentController.getRegistrationAbstract
);
router.get(
  '/registration',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_registration'),
  attachUserScope,
  studentController.getRegistrationReport
);
router.get(
  '/registration/export',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_registration'),
  attachUserScope,
  studentController.exportRegistrationReport
);

// Category (Caste) report - counts per category with Excel/PDF export
router.get(
  '/category',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_category'),
  attachUserScope,
  categoryReportController.getCategoryReport
);
router.get(
  '/category/export',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_category'),
  attachUserScope,
  categoryReportController.exportCategoryReport
);

// SMS reports — sent counts and account credits
router.get(
  '/sms',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_sms_reports'),
  attachUserScope,
  smsReportController.getSmsReport
);
router.get(
  '/sms/logs',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_sms_reports'),
  attachUserScope,
  smsReportController.getSmsReportLogs
);

// Scholarship report — per-student year-wise sanctioned, released, due
router.get(
  '/scholarship',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_scholarship'),
  attachUserScope,
  scholarshipReportController.getScholarshipReport
);
router.get(
  '/scholarship/export',
  authMiddleware,
  verifyPermission(MODULES.REPORTS, 'view_scholarship'),
  attachUserScope,
  scholarshipReportController.exportScholarshipReport
);

module.exports = router;

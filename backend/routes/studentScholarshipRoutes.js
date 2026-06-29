const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { verifyPermission, allowStudentOwnProfileOrPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');
const studentScholarshipController = require('../controllers/studentScholarshipController');

router.get(
  '/:admission_number',
  protect,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  studentScholarshipController.getScholarshipHistory
);

router.put(
  '/:admission_number',
  protect,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  studentScholarshipController.saveScholarshipHistory
);

module.exports = router;

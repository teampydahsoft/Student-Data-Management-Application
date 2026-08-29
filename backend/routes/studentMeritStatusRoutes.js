const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { verifyPermission, allowStudentOwnProfileOrPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');
const studentMeritStatusController = require('../controllers/studentMeritStatusController');

router.get(
  '/:admission_number',
  protect,
  allowStudentOwnProfileOrPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  studentMeritStatusController.getMeritStatus
);

router.put(
  '/:admission_number',
  protect,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
  studentMeritStatusController.saveMeritStatus
);

module.exports = router;

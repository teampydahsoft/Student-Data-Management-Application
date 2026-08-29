const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');
const studentMeritStatusController = require('../controllers/studentMeritStatusController');

router.get(
  '/:admission_number',
  protect,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view_merit_status'),
  studentMeritStatusController.getMeritStatus
);

router.put(
  '/:admission_number',
  protect,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_merit_status'),
  studentMeritStatusController.saveMeritStatus
);

module.exports = router;

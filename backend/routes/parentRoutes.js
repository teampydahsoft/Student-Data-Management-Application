const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const parentController = require('../controllers/parentController');
const { attachUserScope, verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

router.use(authMiddleware);
router.get('/profile', parentController.getProfile);
router.get('/attendance', parentController.getAttendance);
router.post('/view-log', parentController.logView);

router.get(
  '/engagement/:studentId',
  attachUserScope,
  verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'),
  parentController.getEngagement
);

module.exports = router;

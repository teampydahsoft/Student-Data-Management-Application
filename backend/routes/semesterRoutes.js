const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');
const authMiddleware = require('../middleware/auth');
const { attachUserScope, verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

// All routes require authentication
router.use(authMiddleware);

// Academic Calendar RBAC: view/edit_academic_calendar + college/course scope
router.get(
  '/',
  verifyPermission(MODULES.SETTINGS, 'view_academic_calendar'),
  attachUserScope,
  semesterController.getSemesters
);
router.get(
  '/:semesterId',
  verifyPermission(MODULES.SETTINGS, 'view_academic_calendar'),
  attachUserScope,
  semesterController.getSemester
);
router.post(
  '/',
  verifyPermission(MODULES.SETTINGS, 'edit_academic_calendar'),
  attachUserScope,
  semesterController.createSemester
);
router.put(
  '/:semesterId',
  verifyPermission(MODULES.SETTINGS, 'edit_academic_calendar'),
  attachUserScope,
  semesterController.updateSemester
);
router.delete(
  '/:semesterId',
  verifyPermission(MODULES.SETTINGS, 'edit_academic_calendar'),
  attachUserScope,
  semesterController.deleteSemester
);

module.exports = router;

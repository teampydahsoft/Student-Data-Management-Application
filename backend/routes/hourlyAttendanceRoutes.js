const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { attachUserScope, verifyPermission, verifyPermissionAny } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');
const hourlyAttendanceController = require('../controllers/hourlyAttendanceController');

router.use(authMiddleware);
router.use(attachUserScope);

router.post('/', verifyPermission('faculty_academics', 'post_attendance'), hourlyAttendanceController.post);
router.get('/', verifyPermissionAny([['faculty_academics', 'view_attendance'], [MODULES.ATTENDANCE, 'view'], [MODULES.ATTENDANCE, 'view_hourly']]), hourlyAttendanceController.list);
router.get('/students', verifyPermission('faculty_academics', 'view_attendance'), hourlyAttendanceController.listStudents);
router.get('/student-summary', hourlyAttendanceController.studentSummary);
router.get('/student/:studentId', verifyPermissionAny([['faculty_academics', 'view_attendance'], [MODULES.ATTENDANCE, 'view'], [MODULES.ATTENDANCE, 'view_hourly']]), hourlyAttendanceController.getByStudent);

module.exports = router;

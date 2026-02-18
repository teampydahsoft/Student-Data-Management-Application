const express = require('express');
const attendanceController = require('../controllers/attendanceController');
const authMiddleware = require('../middleware/auth');
const { attachUserScope, verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

const router = express.Router();

router.use(authMiddleware);

// All attendance routes should be scoped
router.get('/filters', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getFilterOptions);
router.get('/summary', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getAttendanceSummary);
router.get('/student/:studentId/history', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getStudentAttendanceHistory);
router.get('/download', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'download'), attendanceController.downloadAttendanceReport);
router.get('/day-end-download', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.downloadDayEndReport);
router.get('/report-for-students', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getAttendanceReportForStudents);
router.get('/report/abstract', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getAttendanceAbstract);
router.get('/student', attachUserScope, attendanceController.getStudentAttendance);
router.get('/', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.getAttendance);
router.post('/', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'mark'), attendanceController.markAttendance);
router.delete('/', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'mark'), attendanceController.deleteAttendanceForDate);
router.post('/retry-sms', verifyPermission(MODULES.ATTENDANCE, 'mark'), attendanceController.retrySms);
router.post('/send-day-end-reports', attachUserScope, verifyPermission(MODULES.ATTENDANCE, 'view'), attendanceController.sendDayEndReports);

module.exports = router;

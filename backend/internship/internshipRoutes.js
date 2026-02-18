const express = require('express');
const router = express.Router();
const internshipController = require('./internshipController');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

// Student Specific
router.get('/my-assignment', authMiddleware, internshipController.getMyAssignment);

// Admin Routes
router.post('/create', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.createInternship);
router.get('/report', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getAttendanceReport);
router.get('/day-end-report', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getDayEndReport);
router.get('/day-end-download', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.downloadDayEndReport);
// Route to get filter options based on active internships
router.get('/filters', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getInternshipFilters);

// Route to get all regular students eligible for assignment (based on filters)
router.get('/eligible-students', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getEligibleStudents);
router.post('/assign', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.assignInternship);
router.get('/:id/students', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getAssignedStudents);
router.put('/location/:id', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.updateInternshipLocation);
router.delete('/location/:id', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.deleteInternshipLocation);
router.get('/attendance-details/:id', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getAttendanceDetails);

// Modify Assignment
router.get('/student-assignment', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.getStudentAssignment);
router.put('/assignment', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.updateStudentAssignment);
router.delete('/assignment/:assignmentId', authMiddleware, verifyPermission(MODULES.ATTENDANCE, 'view_internship'), internshipController.removeStudentAssignment);


// Shared Routes (Student needs to see list too, but maybe filter active ones)
router.get('/list', authMiddleware, internshipController.getInternships);

// Student Routes
router.post('/mark-attendance', authMiddleware, internshipController.markAttendance);
router.get('/status', authMiddleware, internshipController.getStudentStatus);

module.exports = router;

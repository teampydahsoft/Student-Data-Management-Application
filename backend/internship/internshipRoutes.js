const express = require('express');
const router = express.Router();
const internshipController = require('./internshipController');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');

// Student Specific
router.get('/my-assignment', authMiddleware, internshipController.getMyAssignment);

// Admin Routes
router.post('/create', authMiddleware, requireAdmin, internshipController.createInternship);
router.get('/report', authMiddleware, requireAdmin, internshipController.getAttendanceReport);
router.get('/day-end-report', authMiddleware, requireAdmin, internshipController.getDayEndReport);
router.get('/day-end-download', authMiddleware, requireAdmin, internshipController.downloadDayEndReport);
// Route to get filter options based on active internships
router.get('/filters', authMiddleware, requireAdmin, internshipController.getInternshipFilters);

// Route to get all regular students eligible for assignment (based on filters)
router.get('/eligible-students', authMiddleware, requireAdmin, internshipController.getEligibleStudents);
router.post('/assign', authMiddleware, requireAdmin, internshipController.assignInternship);
router.get('/:id/students', authMiddleware, requireAdmin, internshipController.getAssignedStudents);
router.put('/location/:id', authMiddleware, requireAdmin, internshipController.updateInternshipLocation);
router.get('/attendance-details/:id', authMiddleware, requireAdmin, internshipController.getAttendanceDetails);

// Modify Assignment
router.get('/student-assignment', authMiddleware, requireAdmin, internshipController.getStudentAssignment);
router.put('/assignment', authMiddleware, requireAdmin, internshipController.updateStudentAssignment);
router.delete('/assignment/:assignmentId', authMiddleware, requireAdmin, internshipController.removeStudentAssignment);


// Shared Routes (Student needs to see list too, but maybe filter active ones)
router.get('/list', authMiddleware, internshipController.getInternships);

// Student Routes
router.post('/mark-attendance', authMiddleware, internshipController.markAttendance);
router.get('/status', authMiddleware, internshipController.getStudentStatus);

module.exports = router;

const express = require('express');
const router = express.Router();

const courseController = require('../controllers/courseController');
const authMiddleware = require('../middleware/auth');
const { attachUserScope } = require('../middleware/rbac');
const upload = require('../config/uploadConfig');

// Public configuration route (used by forms and public consumers)
router.get('/options', courseController.getCourseOptions);

// Public fee QR image route (used by student fee pages and img tags)
router.get('/:courseId/fee-qr', courseController.getFeeQr);

// All routes below require admin authentication
router.use(authMiddleware);

// Fee QR upload (require auth)
router.post('/:courseId/upload-fee-qr', upload.single('feeQr'), courseController.uploadFeeQr);

// Apply scope filtering for listing routes
router.get('/', attachUserScope, courseController.getCourses);
router.post('/', courseController.createCourse);
router.put('/:courseId', courseController.updateCourse);
router.delete('/:courseId', courseController.deleteCourse);

// Branches with scope filtering
router.get('/:courseId/branches', attachUserScope, courseController.getBranches);
router.post('/:courseId/branches', courseController.createBranch);
router.put('/:courseId/branches/:branchId', courseController.updateBranch);
router.delete('/:courseId/branches/:branchId', courseController.deleteBranch);
router.post('/:courseId/branches/:branchId/assign-sections', courseController.assignSectionsToStudents);

// Preview affected students endpoints
router.get('/:courseId/affected-students', courseController.getAffectedStudentsByCourse);
router.get('/:courseId/branches/:branchId/affected-students', courseController.getAffectedStudentsByBranch);

module.exports = router;

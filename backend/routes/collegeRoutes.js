const express = require('express');
const router = express.Router();

const collegeController = require('../controllers/collegeController');
const authMiddleware = require('../middleware/auth');
const { attachUserScope } = require('../middleware/rbac');
const upload = require('../config/uploadConfig');

// Public routes (no auth required)
router.get('/public', collegeController.getPublicColleges);

// Image retrieval routes - PUBLIC (no auth) so they can be embedded in img tags
router.get('/:id/header-image', collegeController.getHeaderImage);
router.get('/:id/footer-image', collegeController.getFooterImage);

// All routes below require admin authentication
router.use(authMiddleware);

// Image upload routes (require auth)
router.post('/:id/upload-header', upload.single('header'), collegeController.uploadHeaderImage);
router.post('/:id/upload-footer', upload.single('footer'), collegeController.uploadFooterImage);

// Super admin dashboard stats (college-wise) — must be before /:collegeId
router.get('/dashboard-stats', collegeController.getCollegeDashboardStats);

// College list (no param)
router.get('/', attachUserScope, collegeController.getColleges);
router.post('/', collegeController.createCollege);

// Specific named routes before :collegeId
router.get('/:collegeId/courses', attachUserScope, collegeController.getCollegeCourses);
router.get('/:collegeId/branches', attachUserScope, collegeController.getCollegeBranches);
router.get('/:collegeId/branches-with-hods', attachUserScope, collegeController.getBranchesWithHodStatus);
router.get('/:collegeId/affected-students', collegeController.getAffectedStudentsByCollege);

// Generic :collegeId routes LAST
router.get('/:collegeId', collegeController.getCollege);
router.put('/:collegeId', collegeController.updateCollege);
router.delete('/:collegeId', collegeController.deleteCollege);

module.exports = router;

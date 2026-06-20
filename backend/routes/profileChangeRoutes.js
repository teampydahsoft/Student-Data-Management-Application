const express = require('express');
const router = express.Router();
const profileChangeController = require('../controllers/profileChangeController');
const authMiddleware = require('../middleware/auth');
const { verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

// Student Routes
router.post('/request', authMiddleware, profileChangeController.submitRequest);
router.get('/my-requests', authMiddleware, profileChangeController.getStudentRequests);
router.post('/mark-verified', authMiddleware, profileChangeController.markVerified);

// Admin Routes
router.get(
    '/all',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'), // Requires user to have student editing capabilities
    profileChangeController.getAllRequests
);

// Admin: fetch all profile change requests for a specific student
router.get(
    '/by-student/:admission_number',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    profileChangeController.getRequestsByAdmission
);

router.put(
    '/:id/status',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    profileChangeController.updateRequestStatus
);

module.exports = router;

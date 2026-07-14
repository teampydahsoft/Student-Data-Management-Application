const express = require('express');
const router = express.Router();
const profileChangeController = require('../controllers/profileChangeController');
const authMiddleware = require('../middleware/auth');
const { verifyPermission, attachUserScope } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

const requireStudent = (req, res, next) => {
    if (req.user && req.user.role === 'student') {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: 'Student access required'
    });
};

// Student Routes — own profile only (identity from JWT)
router.post('/request', authMiddleware, requireStudent, profileChangeController.submitRequest);
router.get('/my-requests', authMiddleware, requireStudent, profileChangeController.getStudentRequests);
router.post('/mark-verified', authMiddleware, requireStudent, profileChangeController.markVerified);

// Admin Routes — edit_student + college/course/branch scope
router.get(
    '/all',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    attachUserScope,
    profileChangeController.getAllRequests
);

router.get(
    '/by-student/:admission_number',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    attachUserScope,
    profileChangeController.getRequestsByAdmission
);

// Staff can submit a change request on behalf of a student (e.g. during mobile verification)
router.post(
    '/submit',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    attachUserScope,
    profileChangeController.submitRequestByAdmin
);

router.put(
    '/:id/status',
    authMiddleware,
    verifyPermission(MODULES.STUDENT_MANAGEMENT, 'edit_student'),
    attachUserScope,
    profileChangeController.updateRequestStatus
);

module.exports = router;

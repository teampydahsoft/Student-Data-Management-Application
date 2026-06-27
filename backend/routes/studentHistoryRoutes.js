const express = require('express');
const router = express.Router();
const studentHistoryController = require('../controllers/studentHistoryController');
const protect = require('../middleware/auth');

// Protect all routes
// Assuming 'protect' verifies the token and 'authorize' checks roles
// Allowed roles: superadmin, admin, principal, hod, ao (adjust based on actual role names in system)
// Based on typical setup: 'admin' usually covers superadmin/admin. 'principal', 'hod', 'ao' might be specific.
// I will check constants/rbac.js later if needed, but for now assuming standard roles.
// Only "users" (staff) should access this, not students.

const { verifyPermission } = require('../middleware/rbac');
const { MODULES } = require('../constants/rbac');

router.get('/', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'), studentHistoryController.getStudentsForHistory);
router.post('/remarks', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'add_remarks'), studentHistoryController.addRemark);
router.get('/remarks/:admission_number', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'), studentHistoryController.getRemarks);
router.get('/audit/:admission_number', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'view'), studentHistoryController.getStudentAuditLogs);
router.put('/remarks/:id', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'manage_remarks'), studentHistoryController.updateRemark);
router.delete('/remarks/:id', protect, verifyPermission(MODULES.STUDENT_MANAGEMENT, 'manage_remarks'), studentHistoryController.deleteRemark);

module.exports = router;

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { verifyRole, verifyPermission, verifyCanCreateRole, verifyCanManageUser } = require('../middleware/rbac');
const { USER_ROLES } = require('../constants/rbac');
const rbacUserController = require('../controllers/rbacUserController');
const studentFieldsController = require('../controllers/studentFieldsController');

// All routes require authentication
router.use(authMiddleware);

// Get available student fields (for field-level permissions)
router.get('/student-fields', studentFieldsController.getStudentFields);

// Get available roles and modules (for user creation form)
router.get('/roles/available', rbacUserController.getAvailableRoles);
router.get('/modules', rbacUserController.getModules);

// Get all users (filtered by scope)
// Requires user_management view permission
router.get(
  '/',
  verifyPermission('user_management', 'view'),
  rbacUserController.getUsers
);

// Search HRMS Employees (for pre-mapping users)
// Requires user_management control permission
router.get(
  '/search-hrms-employee',
  verifyPermission('user_management', 'control'),
  rbacUserController.searchHRMSEmployee
);

// Get single user
router.get(
  '/:id',
  verifyPermission('user_management', 'view'),
  rbacUserController.getUser
);

// Create user
// Requires user_management write permission and role creation check
router.post(
  '/',
  verifyPermission('user_management', 'control'),
  verifyCanCreateRole,
  rbacUserController.createUser
);

// Update user
// Requires user_management write permission and management check
router.put(
  '/:id',
  verifyPermission('user_management', 'control'),
  verifyCanManageUser,
  rbacUserController.updateUser
);

// Delete user (soft delete)
// Requires user_management write permission and management check
router.delete(
  '/:id',
  verifyPermission('user_management', 'control'),
  verifyCanManageUser,
  rbacUserController.deleteUser
);

// Permanently delete user
// Requires user_management write permission and super admin role
router.delete(
  '/:id/permanent',
  verifyPermission('user_management', 'control'),
  verifyCanManageUser,
  rbacUserController.permanentDeleteUser
);

// Reset user password and send email
// Requires user_management write permission
router.post(
  '/:id/reset-password',
  verifyPermission('user_management', 'control'),
  verifyCanManageUser,
  rbacUserController.resetPassword
);

module.exports = router;


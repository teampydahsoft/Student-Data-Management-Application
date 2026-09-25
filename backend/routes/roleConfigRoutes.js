const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { verifyPermission } = require('../middleware/rbac');
const roleConfigController = require('../controllers/roleConfigController');

router.use(authMiddleware);

router.get(
  '/',
  verifyPermission('user_management', 'view'),
  roleConfigController.getRoleConfigs
);

router.get(
  '/:roleKey/users',
  verifyPermission('user_management', 'view'),
  roleConfigController.getRoleUsers
);

router.get(
  '/:roleKey',
  verifyPermission('user_management', 'view'),
  roleConfigController.getRoleConfigByRole
);

router.post(
  '/',
  verifyPermission('user_management', 'control'),
  roleConfigController.createRoleConfig
);

router.put(
  '/:roleKey',
  verifyPermission('user_management', 'control'),
  roleConfigController.updateRoleConfig
);

router.delete(
  '/:roleKey',
  verifyPermission('user_management', 'control'),
  roleConfigController.deleteRoleConfig
);

module.exports = router;

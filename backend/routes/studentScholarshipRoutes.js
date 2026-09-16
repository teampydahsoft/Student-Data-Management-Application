const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/rbac');
const { MODULES, parsePermissions } = require('../constants/rbac');
const studentScholarshipController = require('../controllers/studentScholarshipController');

// Verification for viewing scholarship
const verifyScholarshipReadPermission = (req, res, next) => {
  const user = req.user || req.admin;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Super admin (including legacy 'admin') has full access
  if (isSuperAdmin(user)) {
    return next();
  }

  // Students can view their own scholarship history
  if (user.role === 'student') {
    const admissionNumber = req.params.admissionNumber
      || req.params.admission_number
      || req.params.id
      || req.params.studentId;
    const studentAdmissionNumber = user.admission_number || user.admissionNumber;

    if (admissionNumber && studentAdmissionNumber) {
      if (String(admissionNumber).trim().toLowerCase() === String(studentAdmissionNumber).trim().toLowerCase()) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own scholarship profile.'
    });
  }

  const permissions = parsePermissions(user.permissions);
  const smPerms = permissions[MODULES.STUDENT_MANAGEMENT];
  if (!smPerms) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Required permission: student_management (view_scholarship)'
    });
  }

  // If explicit scholarship permission is configured (view_scholarship or edit_scholarship)
  if (smPerms.view_scholarship !== undefined || smPerms.edit_scholarship !== undefined) {
    if (smPerms.view_scholarship === true || smPerms.edit_scholarship === true) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Access denied. Required permission: student_management (view_scholarship)'
    });
  }

  // Legacy fallback: users with general view or edit permissions can view
  if (smPerms.view === true || smPerms.edit_student === true) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Required permission: student_management (view_scholarship)'
  });
};

// Verification for editing/saving scholarship
const verifyScholarshipWritePermission = (req, res, next) => {
  const user = req.user || req.admin;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Super admin (including legacy 'admin') has full access
  if (isSuperAdmin(user)) {
    return next();
  }

  const permissions = parsePermissions(user.permissions);
  const smPerms = permissions[MODULES.STUDENT_MANAGEMENT];
  if (!smPerms) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Required permission: student_management (edit_scholarship)'
    });
  }

  // If explicit edit_scholarship permission is configured
  if (smPerms.edit_scholarship !== undefined) {
    if (smPerms.edit_scholarship === true) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Access denied. Required permission: student_management (edit_scholarship)'
    });
  }

  // Legacy fallback: users with edit_student permission can edit
  if (smPerms.edit_student === true) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Required permission: student_management (edit_scholarship)'
  });
};

router.get(
  '/check-application-id',
  protect,
  verifyScholarshipWritePermission,
  studentScholarshipController.checkApplicationId
);

router.get(
  '/:admission_number',
  protect,
  verifyScholarshipReadPermission,
  studentScholarshipController.getScholarshipHistory
);

router.put(
  '/:admission_number',
  protect,
  verifyScholarshipWritePermission,
  studentScholarshipController.saveScholarshipHistory
);

module.exports = router;

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const versantTestResultsController = require('../controllers/versantTestResultsController');

function requireStudentRole(req, res, next) {
  const isStudent =
    req.user?.role === 'student' ||
    req.user?.admissionNumber ||
    req.user?.admission_number;
  if (!isStudent) {
    return res.status(403).json({
      success: false,
      message: 'Only logged-in students can access CRT test results',
    });
  }
  next();
}

// Student portal only — SDMS PIN/admission matched to AI-VERSANT roll/PIN
router.get(
  '/me',
  protect,
  requireStudentRole,
  versantTestResultsController.getMyTestResults,
);

router.get(
  '/me/:id',
  protect,
  requireStudentRole,
  versantTestResultsController.getMyTestResultById,
);

module.exports = router;

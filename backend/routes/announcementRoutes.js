const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

// Configure multer
const upload = require('../config/multer.js');
const { verifyPermission } = require('../middleware/rbac');

// Public/Student Routes
router.get(
    '/student',
    authMiddleware,
    announcementController.getStudentAnnouncements
);

// Public Announcement Image Route (Cached)
router.get(
    '/:id/image',
    announcementController.getAnnouncementImage
);

// Admin Routes (RBAC Protected)
router.get(
    '/admin',
    authMiddleware,
    verifyPermission('announcements', 'view'),
    announcementController.getAnnouncements
);

router.post(
    '/sms',
    authMiddleware,
    verifyPermission('announcements', 'create'),
    announcementController.sendSMSAnnouncement
);

router.post(
    '/',
    authMiddleware,
    verifyPermission('announcements', 'create'),
    upload.single('image'),
    announcementController.createAnnouncement
);

router.patch(
    '/:id/status',
    authMiddleware,
    verifyPermission('announcements', 'edit'),
    announcementController.toggleStatus
);

router.delete(
    '/:id',
    authMiddleware,
    verifyPermission('announcements', 'delete'),
    announcementController.deleteAnnouncement
);

// Count Route
router.post(
    '/count',
    authMiddleware,
    verifyPermission('announcements', 'create'),
    announcementController.calculateRecipientCount
);

// Metadata Routes
router.get(
    '/branches',
    authMiddleware,
    verifyPermission('announcements', 'view'),
    announcementController.getBranches
);
router.get(
    '/batches',
    authMiddleware,
    verifyPermission('announcements', 'view'),
    announcementController.getBatches
);
router.get(
    '/years',
    authMiddleware,
    verifyPermission('announcements', 'view'),
    announcementController.getYears
);
router.get(
    '/semesters',
    authMiddleware,
    verifyPermission('announcements', 'view'),
    announcementController.getSemesters
);

router.put(
    '/:id',
    authMiddleware,
    verifyPermission('announcements', 'edit'),
    upload.single('image'),
    announcementController.updateAnnouncement
);

module.exports = router;

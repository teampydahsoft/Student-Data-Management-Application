const express = require('express');
const router = express.Router();
const clubController = require('../controllers/clubController');
const verifyToken = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const upload = require('../config/multer');

const isAdmin = requireAdmin;

const isStudent = (req, res, next) => {
    if (req.user && req.user.role === 'student') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Student access required' });
    }
};

// Public/Shared
router.get('/', verifyToken, clubController.getClubs);
router.get('/:clubId/image', clubController.getClubImage);
router.get('/:clubId', verifyToken, clubController.getClubDetails);

// Student
router.post('/:clubId/join', verifyToken, isStudent, clubController.joinClub);

// Admin
router.post('/', verifyToken, isAdmin, upload.single('image'), clubController.createClub);
router.patch('/:clubId/members', verifyToken, isAdmin, clubController.updateMembershipStatus); // Body: { studentId, status }
router.post('/:clubId/activities', verifyToken, isAdmin, upload.single('image'), clubController.createActivity);
router.put('/:clubId', verifyToken, isAdmin, upload.single('image'), clubController.updateClub);
router.delete('/:clubId', verifyToken, isAdmin, clubController.deleteClub);
router.patch('/:clubId/status', verifyToken, isAdmin, clubController.toggleClubStatus);
router.put('/:clubId/activities/:activityId', verifyToken, isAdmin, upload.single('image'), clubController.updateActivity);
router.delete('/:clubId/activities/:activityId', verifyToken, isAdmin, clubController.deleteActivity);

module.exports = router;

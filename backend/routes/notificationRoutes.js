const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const verifyToken = require('../middleware/auth'); // Check middleware name, assumed verifyToken or authMiddleware

// All routes require authentication
router.use(verifyToken);

// Get notifications
router.get('/', notificationController.getNotifications);

// Mark as read
router.patch('/:id/read', notificationController.markAsRead);

// Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// Clear all notifications
router.delete('/clear-all', notificationController.clearAllNotifications);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;

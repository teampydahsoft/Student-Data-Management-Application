const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authMiddleware = require('../middleware/auth');
const { verifyPermission, verifyRole } = require('../middleware/rbac');
const { MODULES, PERMISSIONS, USER_ROLES } = require('../constants/rbac');

// Protect all routes
router.use(authMiddleware);

// Routes
router.post(
    '/',
    (req, res, next) => {
        ticketController.upload.single('photo')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Photo must be 1MB or smaller'
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: err.message || 'Invalid photo upload'
                });
            }
            next();
        });
    },
    ticketController.createTicket
);

router.get(
    '/',
    // Allow students to view their own, admins to view all (controller handles filtering)
    ticketController.getTickets
);

router.get(
    '/stats',
    ticketController.getTicketStats
);

router.get(
    '/student',
    ticketController.getStudentTickets
);

router.get(
    '/:id',
    ticketController.getTicket
);

router.post(
    '/:id/assign',
    verifyPermission(MODULES.TICKET_MANAGEMENT, PERMISSIONS.WRITE),
    ticketController.assignTicket
);

router.delete(
    '/:id/assign/:assignmentId',
    verifyPermission(MODULES.TICKET_MANAGEMENT, PERMISSIONS.WRITE),
    ticketController.removeAssignment
);

router.put(
    '/:id/status',
    // Students can close their own tickets, Admins can update any status
    // ticketController handles permissions logic or we add more middleware here
    ticketController.changeTicketStatus
);

router.post(
    '/:id/comments',
    ticketController.addComment
);

router.post(
    '/:id/feedback',
    ticketController.submitFeedback
);

module.exports = router;

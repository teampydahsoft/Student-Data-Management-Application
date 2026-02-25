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
    ticketController.upload.single('photo'),
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
    verifyPermission(MODULES.TICKETS, PERMISSIONS.WRITE),
    ticketController.assignTicket
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

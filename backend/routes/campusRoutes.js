const express = require('express');
const router = express.Router();
const campusController = require('../controllers/campusController');
const authMiddleware = require('../middleware/auth');

// All campus routes require authentication
router.use(authMiddleware);

router.get('/', campusController.getCampuses);
router.post('/', campusController.createCampus);
router.put('/:id', campusController.updateCampus);
router.delete('/:id', campusController.deleteCampus);

module.exports = router;

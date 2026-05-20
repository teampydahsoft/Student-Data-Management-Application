const express = require('express');
const router = express.Router();
const quotaController = require('../controllers/quotaController');
const authMiddleware = require('../middleware/auth');

router.get('/public', quotaController.getPublicQuotas);

router.use(authMiddleware);
router.get('/', quotaController.getQuotas);
router.post('/', quotaController.createQuota);
router.put('/:id', quotaController.updateQuota);
router.delete('/:id', quotaController.deleteQuota);

module.exports = router;

const express = require('express');
const router = express.Router();
const casteCategoryController = require('../controllers/casteCategoryController');
const authMiddleware = require('../middleware/auth');

router.get('/public', casteCategoryController.getPublicCasteCategories);

router.use(authMiddleware);

router.get('/', casteCategoryController.getCasteCategories);
router.get('/existing-from-students', casteCategoryController.getExistingStudentCastes);
router.post('/import-from-students', casteCategoryController.importExistingStudentCastes);
router.post('/', casteCategoryController.createCasteCategory);
router.put('/:id', casteCategoryController.updateCasteCategory);
router.delete('/:id', casteCategoryController.deleteCasteCategory);

router.post('/:id/castes', casteCategoryController.createCaste);
router.put('/:id/castes/:casteId', casteCategoryController.updateCaste);
router.delete('/:id/castes/:casteId', casteCategoryController.deleteCaste);

module.exports = router;

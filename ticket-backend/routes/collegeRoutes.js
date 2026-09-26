const express = require('express');
const router = express.Router();
const { masterPool } = require('../config/database');

const DEFAULT_COLLEGES = [
    { id: 1, name: 'Pydah College of Engineering', code: 'PCE' },
    { id: 2, name: 'Pydah Degree College', code: 'PDC' },
    { id: 3, name: 'Pydah College of Pharmacy', code: 'PCP' },
    { id: 4, name: 'Pydah College of Education', code: 'PCOE' },
    { id: 5, name: 'Pydah Polytechnic', code: 'POLY' }
];

/**
 * GET /api/colleges/active or /api/colleges/public
 * Get all active colleges for dropdown selections
 */
const getActiveColleges = async (req, res) => {
    try {
        const [colleges] = await masterPool.query(
            'SELECT id, name, code, is_active FROM colleges ORDER BY name ASC'
        );
        
        let result = colleges;
        if (!colleges || colleges.length === 0) {
            result = DEFAULT_COLLEGES;
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching active colleges:', error);
        res.json({
            success: true,
            data: DEFAULT_COLLEGES
        });
    }
};

router.get('/active', getActiveColleges);
router.get('/public', getActiveColleges);
router.get('/', getActiveColleges);

module.exports = router;

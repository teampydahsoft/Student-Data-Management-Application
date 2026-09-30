const express = require('express');
const router = express.Router();
const clubController = require('../controllers/clubController');
const verifyToken = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { hasPermission } = require('../constants/rbac');
const upload = require('../config/multer');

const isAdmin = requireAdmin;

const isStudent = (req, res, next) => {
    if (req.user && req.user.role === 'student') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Student access required' });
    }
};

const CLUB_PAGE_KEYS = ['management', 'students', 'settings'];
const CLUB_PAGE_PERMISSIONS = {
    management: { read: ['view', 'manage'], write: ['manage'] },
    students: { read: ['view_students', 'manage_students'], write: ['manage_students'] },
    settings: { read: ['view_settings', 'manage_settings'], write: ['manage_settings'] }
};
const isGlobalAdmin = user => ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());
const getPagePermission = (assignment, pageKey) => {
    const configured = assignment.pagePermissions?.[pageKey];
    if (configured && typeof configured === 'object') {
        const write = configured.write === true;
        return { read: configured.read === true || write, write };
    }
    const pages = Array.isArray(assignment.pages) ? assignment.pages : CLUB_PAGE_KEYS;
    const legacyAccess = pages.includes(pageKey);
    return { read: legacyAccess, write: legacyAccess };
};

const requireAnyClubPermission = (...permissions) => (req, res, next) => {
    const user = req.user || req.admin;
    const hasRequiredPermission = permissions.some(permission => hasPermission(user?.permissions, 'clubs', permission));
    if (hasRequiredPermission) return next();
    const requiresMutation = permissions.some(permission => permission !== 'view_seminar_halls' && permission !== 'view');
    const hasExplicitSeminarGrant = ['view_seminar_halls', 'create_seminar_hall_request', 'manage_seminar_halls']
        .some(permission => hasPermission(user?.permissions, 'clubs', permission));
    if (requiresMutation && hasExplicitSeminarGrant) {
        return res.status(403).json({ success: false, message: 'The required Seminar Hall permission is not assigned' });
    }
    if (isGlobalAdmin(user)) return next();
    return res.status(403).json({ success: false, message: 'Club permission required' });
};

const requireClubPage = (pageKey = null, access = 'read') => async (req, res, next) => {
    const user = req.user || req.admin;
    if (isGlobalAdmin(user)) return next();
    if (!user) return res.status(403).json({ success: false, message: 'Club access required' });
    if (user.role === 'student' && access === 'read' && !pageKey) return next();

    const globalPermissions = pageKey
        ? CLUB_PAGE_PERMISSIONS[pageKey]?.[access] || []
        : [
            ...Object.values(CLUB_PAGE_PERMISSIONS).flatMap(pagePermissions => pagePermissions.read),
            'view_seminar_halls',
            'create_seminar_hall_request',
            'manage_seminar_halls'
        ];
    if (globalPermissions.some(permission => hasPermission(user.permissions, 'clubs', permission))) {
        return next();
    }

    try {
        const { masterPool } = require('../config/database');
        const targetClubId = req.params.clubId || req.query.club_id;
        const [clubs] = await masterPool.query(
            `SELECT id, admin_roles FROM clubs WHERE is_active = 1${targetClubId ? ' AND id = ?' : ''}`,
            targetClubId ? [targetClubId] : []
        );
        const assignedClubIds = [];
        const permissionsByClubId = {};
        (clubs || []).forEach(club => {
            let assignments = [];
            try {
                assignments = typeof club.admin_roles === 'string' ? JSON.parse(club.admin_roles) : (club.admin_roles || []);
            } catch (error) {
                assignments = [];
            }
            const userAssignments = (assignments || []).filter(assignment => {
                if (!assignment) return false;
                const isAssigned = String(assignment.userId || '') === String(user.id || '') ||
                    (assignment.empNo && String(assignment.empNo).toLowerCase() === String(user.username || '').toLowerCase()) ||
                    (assignment.email && String(assignment.email).toLowerCase() === String(user.email || '').toLowerCase()) ||
                    (assignment.hrmsId && String(assignment.hrmsId) === String(user.hrms_id || ''));
                return isAssigned;
            });
            const clubPermissions = Object.fromEntries(CLUB_PAGE_KEYS.map(key => [key, { read: false, write: false }]));
            userAssignments.forEach(assignment => {
                CLUB_PAGE_KEYS.forEach(key => {
                    const permission = getPagePermission(assignment, key);
                    clubPermissions[key].read ||= permission.read;
                    clubPermissions[key].write ||= permission.write;
                });
            });
            const hasRequiredAccess = pageKey
                ? (access === 'write' ? clubPermissions[pageKey].write : clubPermissions[pageKey].read)
                : CLUB_PAGE_KEYS.some(key => clubPermissions[key].read);
            if (hasRequiredAccess) {
                assignedClubIds.push(club.id);
                permissionsByClubId[club.id] = clubPermissions;
            }
        });

        if (assignedClubIds.length === 0) {
            return res.status(403).json({ success: false, message: 'This Club page is not assigned to your account' });
        }
        req.clubAdminClubIds = assignedClubIds;
        req.clubPagePermissionsByClubId = permissionsByClubId;
        req.clubPagePermissions = targetClubId ? permissionsByClubId[targetClubId] : null;
        return next();
    } catch (error) {
        console.error('Failed to validate club page access:', error);
        return res.status(500).json({ success: false, message: 'Failed to validate club access' });
    }
};

// Public/Shared
router.get('/', verifyToken, requireClubPage(), clubController.getClubs);
router.get('/roles', verifyToken, requireClubPage('settings', 'read'), clubController.getClubRoles);
router.get('/check-hrms-user', verifyToken, clubController.checkHrmsUserAccount);
router.get('/students/all', verifyToken, requireClubPage('students', 'read'), clubController.getAllClubStudents);
router.get('/seminar-halls/list', verifyToken, requireAnyClubPermission('view_seminar_halls', 'create_seminar_hall_request', 'manage_seminar_halls', 'view'), clubController.getSeminarHalls);
router.get('/seminar-halls', verifyToken, requireAnyClubPermission('view_seminar_halls', 'create_seminar_hall_request', 'manage_seminar_halls', 'view'), clubController.getSeminarHallRequests);
router.get('/:clubId/image', clubController.getClubImage);
router.get('/:clubId', verifyToken, requireClubPage(), clubController.getClubDetails);

// Student
router.post('/:clubId/join', verifyToken, isStudent, clubController.joinClub);

// Admin
router.post('/seminar-halls/list', verifyToken, requireAnyClubPermission('manage_seminar_halls'), clubController.createSeminarHall);
router.put('/seminar-halls/list/:hallId', verifyToken, requireAnyClubPermission('manage_seminar_halls'), clubController.updateSeminarHall);
router.delete('/seminar-halls/list/:hallId', verifyToken, requireAnyClubPermission('manage_seminar_halls'), clubController.deleteSeminarHall);
router.post('/seminar-halls/estimate', verifyToken, requireAnyClubPermission('create_seminar_hall_request'), clubController.getSeminarHallAudienceEstimate);
router.post('/seminar-halls', verifyToken, requireAnyClubPermission('create_seminar_hall_request'), clubController.createSeminarHallRequest);
router.patch('/seminar-halls/:requestId', verifyToken, requireAnyClubPermission('manage_seminar_halls'), clubController.updateSeminarHallRequestStatus);
router.post('/', verifyToken, isAdmin, upload.single('image'), clubController.createClub);
router.post('/roles', verifyToken, isAdmin, clubController.createClubRole);
router.put('/roles/:roleId', verifyToken, isAdmin, clubController.updateClubRole);
router.delete('/roles/:roleId', verifyToken, isAdmin, clubController.deleteClubRole);
router.patch('/:clubId/members', verifyToken, requireClubPage('students', 'write'), clubController.updateMembershipStatus); // Body: { studentId, status }
router.post('/:clubId/activities', verifyToken, requireClubPage('management', 'write'), upload.single('image'), clubController.createActivity);
router.put('/:clubId', verifyToken, requireClubPage('settings', 'write'), upload.single('image'), clubController.updateClub);
router.delete('/:clubId', verifyToken, isAdmin, clubController.deleteClub);
router.patch('/:clubId/status', verifyToken, isAdmin, clubController.toggleClubStatus);
router.put('/:clubId/activities/:activityId', verifyToken, requireClubPage('management', 'write'), upload.single('image'), clubController.updateActivity);
router.delete('/:clubId/activities/:activityId', verifyToken, requireClubPage('management', 'write'), clubController.deleteActivity);

module.exports = router;

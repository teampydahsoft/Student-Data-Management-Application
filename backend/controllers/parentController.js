const { masterPool } = require('../config/database');
const attendanceController = require('./attendanceController');
const { PARENT_PROFILE_FIELDS } = require('../utils/parentAuth');

const requireParent = (req, res) => {
  if (!req.user || req.user.role !== 'parent') {
    res.status(403).json({ success: false, message: 'Parent access required' });
    return false;
  }
  return true;
};

exports.getProfile = async (req, res) => {
  try {
    if (!requireParent(req, res)) return;

    const studentId = req.user.studentId || req.user.id;
    const baseFields = PARENT_PROFILE_FIELDS.join(', ');
    const extraFields = [
      'pin_no', 'admission_no', 'caste', 'adhar_no', 'admission_date', 'mandal_name',
      'student_status', 'scholar_status', 'fee_status', 'certificates_status',
      'registration_status', 'previous_college', 'stud_type', 'student_data'
    ].join(', ');

    let rows;
    try {
      [rows] = await masterPool.query(
        `SELECT ${baseFields}, ${extraFields} FROM students WHERE id = ? LIMIT 1`,
        [studentId]
      );
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR') {
        [rows] = await masterPool.query(
          `SELECT ${baseFields}, student_data FROM students WHERE id = ? LIMIT 1`,
          [studentId]
        );
      } else {
        throw colErr;
      }
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = rows[0];
    let studentData = {};
    try {
      studentData = typeof student.student_data === 'string'
        ? JSON.parse(student.student_data)
        : (student.student_data || {});
    } catch {
      studentData = {};
    }

    res.json({
      success: true,
      data: {
        ...student,
        student_data: studentData,
        parent_mobile: req.user.parent_mobile
      }
    });
  } catch (error) {
    console.error('Parent get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    if (!requireParent(req, res)) return;

    req.params.studentId = String(req.user.studentId || req.user.id);
    return attendanceController.getStudentAttendanceHistory(req, res);
  } catch (error) {
    console.error('Parent get attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to load attendance' });
  }
};

exports.logView = async (req, res) => {
  try {
    if (!requireParent(req, res)) return;

    const { page } = req.body;
    if (!page || !['profile', 'attendance'].includes(page)) {
      return res.status(400).json({ success: false, message: 'Invalid page type' });
    }

    const studentId = req.user.studentId || req.user.id;
    const parentMobile = req.user.parent_mobile || '';

    await masterPool.query(
      `INSERT INTO parent_view_logs (student_id, parent_mobile, page) VALUES (?, ?, ?)`,
      [studentId, parentMobile, page]
    );

    const countColumn = page === 'profile' ? 'profile_view_count' : 'attendance_view_count';
    await masterPool.query(
      `INSERT INTO parent_engagement (student_id, ${countColumn}, last_viewed_at, last_parent_mobile)
       VALUES (?, 1, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         ${countColumn} = ${countColumn} + 1,
         last_viewed_at = NOW(),
         last_parent_mobile = VALUES(last_parent_mobile)`,
      [studentId, parentMobile]
    );

    res.json({ success: true, message: 'View logged' });
  } catch (error) {
    console.error('Parent log view error:', error);
    res.status(500).json({ success: false, message: 'Failed to log view' });
  }
};

exports.getEngagement = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    const [engagement] = await masterPool.query(
      `SELECT student_id, profile_view_count, attendance_view_count, last_viewed_at,
              last_parent_mobile, last_login_at
       FROM parent_engagement WHERE student_id = ?`,
      [studentId]
    );

    const [studentRows] = await masterPool.query(
      'SELECT parent_mobile1, parent_mobile2, student_data FROM students WHERE id = ?',
      [studentId]
    );

    let isParentVerified = false;
    if (studentRows.length) {
      try {
        const data = typeof studentRows[0].student_data === 'string'
          ? JSON.parse(studentRows[0].student_data)
          : (studentRows[0].student_data || {});
        isParentVerified = data.is_parent_mobile_verified === true;
      } catch {
        isParentVerified = false;
      }
    }

    const stats = engagement[0] || {
      profile_view_count: 0,
      attendance_view_count: 0,
      last_viewed_at: null,
      last_parent_mobile: null,
      last_login_at: null
    };

    res.json({
      success: true,
      data: {
        ...stats,
        is_parent_mobile_verified: isParentVerified,
        parent_mobile1: studentRows[0]?.parent_mobile1 || null,
        parent_mobile2: studentRows[0]?.parent_mobile2 || null,
        total_views: (stats.profile_view_count || 0) + (stats.attendance_view_count || 0)
      }
    });
  } catch (error) {
    console.error('Parent engagement error:', error);
    res.status(500).json({ success: false, message: 'Failed to load parent engagement' });
  }
};

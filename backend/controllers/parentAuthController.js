const jwt = require('jsonwebtoken');
const { masterPool } = require('../config/database');
const { otpCache } = require('../services/cache');
const smsService = require('../services/smsService');
const { normalizeMobile, mobilesMatch, STUDENT_SELECT_FIELDS } = require('../utils/parentAuth');

const OTP_SEND_LIMIT = 5;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const otpSendAttempts = new Map();

const buildParentUser = (student, parentMobile) => ({
  id: student.id,
  studentId: student.id,
  role: 'parent',
  admission_number: student.admission_number,
  student_name: student.student_name,
  parent_mobile: parentMobile,
  student_photo: student.student_photo,
  college: student.college,
  course: student.course,
  branch: student.branch,
  current_year: student.current_year,
  current_semester: student.current_semester
});

const issueParentToken = (student, parentMobile) => {
  const payload = {
    id: student.id,
    studentId: student.id,
    role: 'parent',
    admission_number: student.admission_number,
    parent_mobile: parentMobile
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15d' });
};

/**
 * Fast SQL lookup by last 10 digits on indexed parent_mobile columns.
 * Falls back to a narrow JSON check only when column match returns nothing.
 */
const findStudentsByParentMobile = async (mobileNumber) => {
  const normalized = normalizeMobile(mobileNumber);
  if (!normalized) return [];

  const likePattern = `%${normalized}`;

  const [rows] = await masterPool.query(
    `SELECT ${STUDENT_SELECT_FIELDS}
     FROM students
     WHERE parent_mobile1 LIKE ? OR parent_mobile2 LIKE ?
        OR parent_mobile1 LIKE ? OR parent_mobile2 LIKE ?`,
    [likePattern, likePattern, normalized, normalized]
  );

  const matched = rows.filter((row) =>
    mobilesMatch(row.parent_mobile1, mobileNumber) || mobilesMatch(row.parent_mobile2, mobileNumber)
  );

  if (matched.length > 0) {
    return matched;
  }

  // Rare: number only stored inside student_data JSON
  const [jsonRows] = await masterPool.query(
    `SELECT ${STUDENT_SELECT_FIELDS}, student_data
     FROM students
     WHERE student_data IS NOT NULL
       AND (
         student_data LIKE ?
         OR student_data LIKE ?
       )
     LIMIT 50`,
    [`%${normalized}%`, `%${mobileNumber}%`]
  );

  return jsonRows.filter((row) => {
    let data = {};
    try {
      data = typeof row.student_data === 'string' ? JSON.parse(row.student_data) : (row.student_data || {});
    } catch {
      return false;
    }
    return mobilesMatch(data.parent_mobile1, mobileNumber)
      || mobilesMatch(data['Parent Mobile Number 1'], mobileNumber)
      || mobilesMatch(data.parent_mobile2, mobileNumber)
      || mobilesMatch(data['Parent Mobile Number 2'], mobileNumber);
  });
};

const checkOtpRateLimit = (mobile) => {
  const key = normalizeMobile(mobile);
  const now = Date.now();
  const entry = otpSendAttempts.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > OTP_SEND_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  if (entry.count >= OTP_SEND_LIMIT) {
    return false;
  }
  entry.count += 1;
  otpSendAttempts.set(key, entry);
  return true;
};

const recordParentLogin = async (studentId, parentMobile) => {
  await masterPool.query(
    `INSERT INTO parent_engagement (student_id, last_login_at, last_parent_mobile)
     VALUES (?, NOW(), ?)
     ON DUPLICATE KEY UPDATE last_login_at = NOW(), last_parent_mobile = VALUES(last_parent_mobile)`,
    [studentId, parentMobile]
  );
};

const sendSmsInBackground = (mobileNumber, message) => {
  smsService.sendSms({
    to: mobileNumber,
    message,
    templateId: '1707176605569953063',
    peId: process.env.OTP_PE_ID
  }).catch((err) => {
    console.error('[Parent OTP] Background SMS failed:', err.message);
  });
};

exports.sendParentOtp = async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    if (!checkOtpRateLimit(mobileNumber)) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again after an hour.'
      });
    }

    const students = await findStudentsByParentMobile(mobileNumber);
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student record found for this mobile number. Contact the college office.'
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `parent_otp:${normalizeMobile(mobileNumber)}`;

    // Cache OTP + linked students so verify does not re-scan the whole table
    otpCache.set(cacheKey, {
      otp,
      studentIds: students.map((s) => s.id),
      students: students.map((s) => ({
        id: s.id,
        admission_number: s.admission_number,
        student_name: s.student_name,
        student_photo: s.student_photo,
        college: s.college,
        course: s.course,
        branch: s.branch,
        current_year: s.current_year,
        current_semester: s.current_semester
      }))
    });

    const message = `Your Parent Portal OTP is ${otp}. Valid for 5 minutes -Pydah College`;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Parent OTP] ${normalizeMobile(mobileNumber)} => ${otp} (${students.length} student(s))`);
    }

    // Respond immediately; SMS gateway can be slow (30s+)
    sendSmsInBackground(mobileNumber, message);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      studentCount: students.length
    });
  } catch (error) {
    console.error('Parent send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

exports.verifyParentOtp = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;
    if (!mobileNumber || !otp) {
      return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
    }

    const cacheKey = `parent_otp:${normalizeMobile(mobileNumber)}`;
    const cached = otpCache.get(cacheKey);

    if (!cached) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found' });
    }

    const storedOtp = typeof cached === 'string' ? cached : cached.otp;
    if (storedOtp !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    otpCache.delete(cacheKey);

    const parentMobile = normalizeMobile(mobileNumber);
    let studentList = typeof cached === 'object' && cached.students ? cached.students : null;

    if (!studentList || studentList.length === 0) {
      const students = await findStudentsByParentMobile(mobileNumber);
      if (students.length === 0) {
        return res.status(404).json({ success: false, message: 'No linked student found' });
      }
      studentList = students.map((s) => ({
        id: s.id,
        admission_number: s.admission_number,
        student_name: s.student_name,
        student_photo: s.student_photo,
        college: s.college,
        course: s.course,
        branch: s.branch,
        current_year: s.current_year,
        current_semester: s.current_semester
      }));
    }

    if (studentList.length === 1) {
      const s = studentList[0];
      await recordParentLogin(s.id, parentMobile);
      const token = issueParentToken(s, parentMobile);
      return res.json({
        success: true,
        message: 'Login successful',
        requiresSelection: false,
        token,
        user: buildParentUser(s, parentMobile)
      });
    }

    const selectionToken = jwt.sign(
      { role: 'parent_pending', parent_mobile: parentMobile, studentIds: studentList.map((s) => s.id) },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'OTP verified. Please select a student.',
      requiresSelection: true,
      selectionToken,
      students: studentList
    });
  } catch (error) {
    console.error('Parent verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
};

exports.selectParentStudent = async (req, res) => {
  try {
    const { selectionToken, studentId } = req.body;
    if (!selectionToken || !studentId) {
      return res.status(400).json({ success: false, message: 'Selection token and student are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(selectionToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Selection session expired. Please login again.' });
    }

    if (decoded.role !== 'parent_pending' || !decoded.parent_mobile) {
      return res.status(401).json({ success: false, message: 'Invalid selection session' });
    }

    const allowedIds = Array.isArray(decoded.studentIds) ? decoded.studentIds.map(Number) : [];
    if (allowedIds.length > 0 && !allowedIds.includes(Number(studentId))) {
      return res.status(403).json({ success: false, message: 'This student is not linked to your mobile number' });
    }

    const [rows] = await masterPool.query(
      `SELECT ${STUDENT_SELECT_FIELDS}, student_data
       FROM students WHERE id = ? LIMIT 1`,
      [studentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = rows[0];
    if (allowedIds.length === 0) {
      const linked = await findStudentsByParentMobile(decoded.parent_mobile);
      if (!linked.some((s) => s.id === student.id)) {
        return res.status(403).json({ success: false, message: 'This student is not linked to your mobile number' });
      }
    } else if (
      !mobilesMatch(student.parent_mobile1, decoded.parent_mobile)
      && !mobilesMatch(student.parent_mobile2, decoded.parent_mobile)
    ) {
      return res.status(403).json({ success: false, message: 'This student is not linked to your mobile number' });
    }

    await recordParentLogin(student.id, decoded.parent_mobile);
    const token = issueParentToken(student, decoded.parent_mobile);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: buildParentUser(student, decoded.parent_mobile)
    });
  } catch (error) {
    console.error('Parent select student error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete login' });
  }
};

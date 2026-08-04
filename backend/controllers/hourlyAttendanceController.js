/**
 * Hourly Attendance Controller (Pydah v2.0)
 * Faculty posts per-period attendance; list by date/period; student view.
 */

const { masterPool } = require('../config/database');
const { buildScopeConditions } = require('../utils/scoping');

const ER_NO_SUCH_TABLE = 'ER_NO_SUCH_TABLE';
function isTableMissing(err) {
  return err && (err.code === ER_NO_SUCH_TABLE || err.errno === 1146);
}

function buildStudentWhere(scope, filters) {
  const { conditions, params } = buildScopeConditions(scope || {}, 's');
  const parts = ['s.student_status = ?'];
  const prms = ['Regular'];
  if (conditions.length) {
    parts.push(...conditions);
    prms.push(...params);
  }
  if (filters.course) { if (/^\d+$/.test(course)) {
        parts.push('s.course_id = ?');
      } else {
        parts.push('s.course = ?');
      } prms.push(filters.course); }
  if (filters.branch) { if (/^\d+$/.test(branch)) {
        parts.push('s.branch_id = ?');
      } else {
        parts.push('s.branch = ?');
      } prms.push(filters.branch); }
  if (filters.batch) { parts.push('s.batch = ?'); prms.push(filters.batch); }
  if (filters.year) { parts.push('s.current_year = ?'); prms.push(filters.year); }
  if (filters.semester) { parts.push('s.current_semester = ?'); prms.push(filters.semester); }
  return { where: parts.join(' AND '), params: prms };
}

/** POST /api/hourly-attendance - Faculty post attendance for a date + period */
exports.post = async (req, res) => {
  try {
    const { date, period_slot_id, course, branch, batch, year, semester, entries } = req.body || {};
    const userId = req.user?.id || req.admin?.id;
    if (!date || !period_slot_id || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'date, period_slot_id, and entries (array of { student_id, status }) required' });
    }
    const scope = req.userScope || {};
    const { where, params: whereParams } = buildStudentWhere(scope, { course, branch, batch, year, semester });
    const allowedIds = new Set();
    const [students] = await masterPool.query(
      `SELECT id FROM students WHERE ${where}`,
      whereParams
    );
    students.forEach((s) => allowedIds.add(s.id));
    const validStatuses = new Set(['present', 'absent']);
    const toInsert = [];
    for (const e of entries) {
      const sid = Number(e.student_id);
      const st = (e.status || '').toLowerCase();
      if (!allowedIds.has(sid) || !validStatuses.has(st)) continue;
      toInsert.push([sid, date, period_slot_id, st, userId]);
    }
    if (toInsert.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid entries or scope mismatch' });
    }
    await masterPool.query(
      `INSERT INTO hourly_attendance_records (student_id, attendance_date, period_slot_id, status, marked_by)
       VALUES ? ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
      [toInsert]
    );
    res.json({ success: true, message: 'Attendance saved', count: toInsert.length });
  } catch (error) {
    if (isTableMissing(error)) {
      return res.status(503).json({ success: false, message: 'Hourly attendance not set up. Run the v2 database migration.' });
    }
    console.error('hourlyAttendance post error:', error);
    res.status(500).json({ success: false, message: 'Failed to save attendance' });
  }
};

/** GET /api/hourly-attendance - List by date, optional period_slot_id, course, branch */
exports.list = async (req, res) => {
  try {
    const { date, period_slot_id, course, branch } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date required' });
    const scope = req.userScope || {};
    const { where, params: whereParams } = buildStudentWhere(scope, { course, branch });
    let sql = `SELECT h.id, h.student_id, h.attendance_date, h.period_slot_id, h.status, h.marked_by, h.created_at,
               s.student_name, s.admission_number, s.course, s.branch
               FROM hourly_attendance_records h
               JOIN students s ON s.id = h.student_id
               WHERE h.attendance_date = ? AND (${where})`;
    const params = [date, ...whereParams];
    if (period_slot_id) { sql += ' AND h.period_slot_id = ?'; params.push(period_slot_id); }
    sql += ' ORDER BY s.student_name';
    const [rows] = await masterPool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    if (isTableMissing(error)) {
      return res.json({ success: true, data: [], migrationRequired: true });
    }
    console.error('hourlyAttendance list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hourly attendance' });
  }
};

/** GET /api/hourly-attendance/student/:studentId - Student's own hourly attendance */
exports.getByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { from, to } = req.query;
    const user = req.user || req.admin;
    let studentIdNum = Number(studentId);
    if (!studentIdNum && (user?.role === 'student' || user?.admission_number)) {
      const [s] = await masterPool.query(
        'SELECT id FROM students WHERE admission_number = ? OR admission_no = ? LIMIT 1',
        [user.admission_number || user.admissionNumber, user.admission_number || user.admissionNo]
      );
      if (s.length) studentIdNum = s[0].id;
    }
    if (!studentIdNum) return res.status(400).json({ success: false, message: 'Student not found' });
    const scope = req.userScope || {};
    if (scope.isStudent && user?.admission_number) {
      const [check] = await masterPool.query(
        'SELECT id FROM students WHERE (admission_number = ? OR admission_no = ?) AND id = ?',
        [user.admission_number, user.admission_number, studentIdNum]
      );
      if (!check.length) return res.status(403).json({ success: false, message: 'Access denied' });
    }
    let sql = `SELECT h.attendance_date, h.period_slot_id, h.status, p.name AS period_name, p.start_time, p.end_time
               FROM hourly_attendance_records h
               LEFT JOIN period_slots p ON p.id = h.period_slot_id
               WHERE h.student_id = ?`;
    const params = [studentIdNum];
    if (from) { sql += ' AND h.attendance_date >= ?'; params.push(from); }
    if (to) { sql += ' AND h.attendance_date <= ?'; params.push(to); }
    sql += ' ORDER BY h.attendance_date DESC, p.sort_order ASC';
    const [rows] = await masterPool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    if (isTableMissing(error)) {
      return res.json({ success: true, data: [] });
    }
    console.error('hourlyAttendance getByStudent error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
};

/** GET /api/hourly-attendance/students - List students for a course/branch (for faculty marking) */
exports.listStudents = async (req, res) => {
  try {
    const { course, branch, batch, year, semester } = req.query;
    const scope = req.userScope || {};
    const { where, params } = buildStudentWhere(scope, { course, branch, batch, year, semester });
    const [rows] = await masterPool.query(
      `SELECT s.id AS student_id, s.student_name, s.admission_number, s.course, s.branch, s.batch, s.current_year, s.current_semester
       FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id WHERE ${where} ORDER BY s.student_name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('hourlyAttendance listStudents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch students' });
  }
};

/** GET /api/hourly-attendance/student-summary - For student dashboard: percentage etc */
exports.studentSummary = async (req, res) => {
  try {
    const user = req.user || req.admin;
    if (user?.role !== 'student' && !user?.admission_number) {
      return res.status(403).json({ success: false, message: 'Student access only' });
    }
    const [s] = await masterPool.query(
      'SELECT id FROM students WHERE admission_number = ? OR admission_no = ? LIMIT 1',
      [user.admission_number || user.admissionNumber, user.admission_number || user.admissionNo]
    );
    if (!s.length) return res.json({ success: true, data: { percentage: 0, present: 0, absent: 0 } });
    const studentId = s[0].id;
    let rows = [];
    try {
      const [r] = await masterPool.query(
        `SELECT status FROM hourly_attendance_records WHERE student_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
        [studentId]
      );
      rows = r;
    } catch (err) {
      if (isTableMissing(err)) {
        return res.json({ success: true, data: { percentage: '0.0', present: 0, absent: 0, total: 0 } });
      }
      throw err;
    }
    let present = 0, absent = 0;
    rows.forEach((r) => { if (r.status === 'present') present++; else absent++; });
    const total = present + absent;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
    res.json({ success: true, data: { percentage, present, absent, total } });
  } catch (error) {
    console.error('hourlyAttendance studentSummary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch summary' });
  }
};

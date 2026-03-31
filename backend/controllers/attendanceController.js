const { masterPool } = require('../config/database');
const { sendAbsenceNotification } = require('../services/smsService');
const { createNotification } = require('../services/notificationService');
const { getNotificationSetting } = require('./settingsController');
const { sendBrevoEmail } = require('../utils/emailService');
const { sendAttendanceReportNotifications } = require('../services/attendanceNotificationService');
const { getAllAttendanceForDate, areAllBatchesMarked, areAllBatchesMarkedForCollege, areAllBatchesMarkedForCollegeCourseBranch } = require('../services/getAllAttendanceForDate');
const {
  getNonWorkingDayInfo,
  getNonWorkingDaysForRange,
  clearCache
} = require('../services/nonWorkingDayService');
const { listCustomHolidays } = require('../services/customHolidayService');
const { getPublicHolidaysForYear } = require('../services/holidayService');
const { getScopeConditionString } = require('../utils/scoping');
const { generateAttendanceReportPDF } = require('../services/pdfService');

/** Build scope condition for students table using college_id (use when students has no 'college' column) */
function getScopeConditionByCollegeId(userScope) {
  if (!userScope || userScope.unrestricted) return { scopeCondition: '', params: [] };
  if (userScope.collegeNames && userScope.collegeNames.length > 0) {
    const placeholders = userScope.collegeNames.map(() => '?').join(',');
    return { scopeCondition: `s.college_id IN (SELECT id FROM colleges WHERE name IN (${placeholders}))`, params: [...userScope.collegeNames] };
  }
  if (userScope.collegeIds && userScope.collegeIds.length > 0) {
    const placeholders = userScope.collegeIds.map(() => '?').join(',');
    return { scopeCondition: `s.college_id IN (${placeholders})`, params: [...userScope.collegeIds] };
  }
  return { scopeCondition: '', params: [] };
}
const {
  processAttendanceData,
  getHolidayInfoForRange
} = require('../services/attendancePercentageService');

// Helper function to replace template variables
const replaceTemplateVariables = (template, variables) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
};

// ========== EMAIL TRACKING HELPERS (Prevent Duplicate Day-End Reports) ==========

/**
 * Check if an email has already been sent today for a specific college/course/recipient
 * @param {string} college - College name
 * @param {string} course - Course name
 * @param {string} recipientEmail - Recipient email address
 * @returns {Promise<boolean>} - True if email already sent today
 */
async function hasEmailBeenSentToday(college, course, recipientEmail) {
  try {
    const [rows] = await masterPool.query(`
      SELECT id FROM attendance_report_emails_sent
      WHERE report_date = CURDATE()
      AND college = ?
      AND course = ?
      AND recipient_email = ?
    `, [college, course, recipientEmail]);
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking email sent status:', error);
    return false; // On error, allow sending to avoid blocking
  }
}

/**
 * Track that an email has been sent today for a specific college/course/recipient
 * @param {string} college - College name
 * @param {string} course - Course name
 * @param {string} recipientEmail - Recipient email address
 * @param {string} recipientType - Type: 'principal', 'hod', or 'super_admin'
 */
async function trackEmailSent(college, course, recipientEmail, recipientType) {
  try {
    await masterPool.query(`
      INSERT IGNORE INTO attendance_report_emails_sent 
      (report_date, college, course, recipient_email, recipient_type)
      VALUES (CURDATE(), ?, ?, ?, ?)
    `, [college, course, recipientEmail, recipientType]);
  } catch (error) {
    console.error('Error tracking email sent:', error);
    // Non-critical error, don't throw
  }
}

// ========== END EMAIL TRACKING HELPERS ==========


// Helper function to convert plain text to HTML (basic conversion)
const textToHtml = (text) => {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '<p></p>';
      return `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
    })
    .join('\n');
};

// Helper function to resolve parent email
const resolveParentEmail = (student) => {
  if (!student) return '';

  const data = student.student_data || {};
  return (
    student.parent_email ||
    data['Parent Email'] ||
    data['Parent Email Address'] ||
    data['parent_email'] ||
    ''
  );
};

const VALID_STATUSES = new Set(['present', 'absent', 'holiday']);


const parseStudentData = (data) => {
  if (!data) return {};
  if (typeof data === 'object') return data;

  try {
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const getDateOnlyString = (input) => {
  if (!input) {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

exports.getFilterOptions = async (req, res) => {
  try {
    // Get filter parameters from query string
    const { course, branch, batch, year, semester, college, level } = req.query;

    // Fetch attendance configuration from DB
    let excludedCourses = [];
    let excludedStudents = [];

    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config, using defaults:', err);
      // Fallback - empty arrays
    }

    // Helper to build WHERE clause parts (User Scope + Excluded Courses/Students)
    const buildBaseWhere = () => {
      let clause = `WHERE 1=1 AND student_status = 'Regular'`;
      const params = [];

      if (excludedCourses.length > 0) {
        clause += ` AND course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
        params.push(...excludedCourses);
      }

      if (excludedStudents.length > 0) {
        // Exclude by admission number
        clause += ` AND admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
        params.push(...excludedStudents);
      }

      // Apply user scope filtering
      if (req.userScope) {
        const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
        if (scopeCondition) {
          clause += ` AND ${scopeCondition}`;
          params.push(...scopeParams);
        }
      }

      if (college) {
        clause += ' AND college = ?';
        params.push(college);
      }

      return { clause, params };
    };

    // Level 0: Scope + College (For Batches)
    const level0 = buildBaseWhere();

    // Level 1: + Batch (For Courses)
    const level1 = { clause: level0.clause, params: [...level0.params] };
    if (batch) {
      level1.clause += ' AND batch = ?';
      level1.params.push(batch);
    }

    // Level 2: + Course (For Branches)
    const level2 = { clause: level1.clause, params: [...level1.params] };
    if (course) {
      level2.clause += ' AND course = ?';
      level2.params.push(course);
    }

    // Level 3: + Branch (For Years/Semesters)
    const level3 = { clause: level2.clause, params: [...level2.params] };
    if (branch) {
      level3.clause += ' AND branch = ?';
      level3.params.push(branch);
    }

    // --- Queries ---


    // 0. Colleges (Independent)
    let collegeRowsRes = [];
    {
      let collegeQuery = 'SELECT id, name FROM colleges WHERE is_active = 1 ORDER BY name ASC';
      const [colleges] = await masterPool.query(collegeQuery);
      collegeRowsRes = colleges;
    }

    // 1. Batches (Use Level 0 - Independent of other filters except college/scope)
    const [batchRowsRes] = await masterPool.query(
      `SELECT DISTINCT batch FROM students ${level0.clause} AND batch IS NOT NULL AND batch <> '' ORDER BY batch ASC`,
      level0.params
    );

    // When level is provided, restrict to courses with that level (diploma/ug/pg)
    let levelCourseNames = null;
    if (level) {
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      levelCourseNames = levelCourses.map(c => c.name);
      if (levelCourseNames.length === 0) levelCourseNames = [];
    }

    // 2. Courses (Use Level 1 - Depend on Batch)
    let courseRowsRes;
    if (college) {
      const [collegeRows] = await masterPool.query(
        'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [college]
      );

      if (collegeRows.length > 0) {
        const collegeId = collegeRows[0].id;
        const [collegeCourses] = await masterPool.query(
          'SELECT name FROM courses WHERE college_id = ? AND is_active = 1 ORDER BY name ASC',
          [collegeId]
        );
        const validCourseNames = collegeCourses.map(c => c.name);

        if (validCourseNames.length > 0) {
          const placeholders = validCourseNames.map(() => '?').join(',');
          const courseWhereClause = `${level1.clause} AND course IN (${placeholders})`;
          const courseQueryParams = [...level1.params, ...validCourseNames];
          [courseRowsRes] = await masterPool.query(
            `SELECT DISTINCT course FROM students ${courseWhereClause} AND course IS NOT NULL AND course <> '' ORDER BY course ASC`,
            courseQueryParams
          );
        } else {
          courseRowsRes = [];
        }
      } else {
        courseRowsRes = [];
      }
    } else {
      [courseRowsRes] = await masterPool.query(
        `SELECT DISTINCT course FROM students ${level1.clause} AND course IS NOT NULL AND course <> '' ORDER BY course ASC`,
        level1.params
      );
    }
    // Apply level filter to courses when level is provided
    if (levelCourseNames && levelCourseNames.length > 0) {
      const levelSet = new Set(levelCourseNames);
      courseRowsRes = courseRowsRes.filter(r => levelSet.has(r.course));
    } else if (levelCourseNames && levelCourseNames.length === 0) {
      courseRowsRes = [];
    }

    // 3. Branches (Use Level 2 - Depend on Batch + Course)
    // If batch is selected, filter branches by batch through junction table
    let branchRowsRes;
    if (college) {
      const [collegeRows] = await masterPool.query(
        'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [college]
      );

      if (collegeRows.length > 0) {
        const collegeId = collegeRows[0].id;
        const [collegeCourses] = await masterPool.query(
          'SELECT id, name FROM courses WHERE college_id = ? AND is_active = 1 ORDER BY name ASC',
          [collegeId]
        );
        const validCourseNames = collegeCourses.map(c => c.name);
        const validCourseIds = collegeCourses.map(c => c.id);

        if (validCourseNames.length > 0) {
          if (course) {
            const selectedCourse = collegeCourses.find(c => c.name === course);
            if (selectedCourse) {
              // Query branches directly from students table
              // This ensures all branches load, regardless of junction table entries
              // The students table is the source of truth for what branches exist
              [branchRowsRes] = await masterPool.query(
                `SELECT DISTINCT branch FROM students ${level2.clause} AND branch IS NOT NULL AND branch <> '' ORDER BY branch ASC`,
                level2.params
              );
            } else {
              branchRowsRes = [];
            }
          } else {
            // No specific course selected, get branches from students table
            // Query directly from students table to ensure all branches load
            [branchRowsRes] = await masterPool.query(
              `SELECT DISTINCT branch FROM students ${level2.clause} AND branch IS NOT NULL AND branch <> '' ORDER BY branch ASC`,
              level2.params
            );
          }
        } else {
          branchRowsRes = [];
        }
      } else {
        branchRowsRes = [];
      }
    } else {
      // No college filter - query branches directly from students table
      // Do NOT require batch to exist in academic_years - students.batch is the source of truth
      if (batch || course) {
        // When batch and/or course is selected, use level2 to filter
        [branchRowsRes] = await masterPool.query(
          `SELECT DISTINCT branch FROM students ${level2.clause} AND branch IS NOT NULL AND branch <> '' ORDER BY branch ASC`,
          level2.params
        );
      } else {
        // No batch and no course selected, get all branches from students
        [branchRowsRes] = await masterPool.query(
          `SELECT DISTINCT branch FROM students ${level0.clause} AND branch IS NOT NULL AND branch <> '' ORDER BY branch ASC`,
          level0.params
        );
      }
    }

    // 4. Years and Semesters (Use Level 3 - Depend on Batch + Course + Branch)
    const [yearRows] = await masterPool.query(
      `SELECT DISTINCT current_year AS currentYear FROM students ${level3.clause} AND current_year IS NOT NULL AND current_year <> 0 ORDER BY current_year ASC`,
      level3.params
    );

    const [semesterRows] = await masterPool.query(
      `SELECT DISTINCT current_semester AS currentSemester FROM students ${level3.clause} AND current_semester IS NOT NULL AND current_semester <> 0 ORDER BY current_semester ASC`,
      level3.params
    );

    res.json({
      success: true,
      data: {
        colleges: collegeRowsRes,
        batches: batchRowsRes.map((row) => row.batch),
        years: yearRows.map((row) => row.currentYear),
        semesters: semesterRows.map((row) => row.currentSemester),
        courses: courseRowsRes.map((row) => row.course),
        branches: branchRowsRes.map((row) => row.branch)
      }
    });
  } catch (error) {
    console.error('Failed to fetch attendance filters:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance filters'
    });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const attendanceDate = getDateOnlyString(req.query.date);

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance date supplied'
      });
    }

    let holidayInfo = null;
    try {
      holidayInfo = await getNonWorkingDayInfo(attendanceDate);
    } catch (error) {
      holidayInfo = {
        date: attendanceDate,
        isNonWorkingDay: false,
        isSunday: false,
        publicHoliday: null,
        customHoliday: null,
        reasons: []
      };
    }

    const {
      batch,
      currentYear,
      currentSemester,
      studentName,
      parentMobile,
      course,
      branch,
      limit,
      offset
    } = req.query;

    let query = `
      SELECT
        s.id,
        s.admission_number,
        s.pin_no,
        s.student_name,
        s.parent_mobile1,
        s.parent_mobile2,
        s.current_year,
        s.current_semester,
        CASE
          WHEN
            (s.student_data LIKE '%"is_student_mobile_verified":true%' AND s.student_data LIKE '%"is_parent_mobile_verified":true%') AND
            (s.certificates_status LIKE '%Verified%' OR s.certificates_status = 'completed') AND
            (s.fee_status LIKE '%no_due%' OR s.fee_status LIKE '%no due%' OR s.fee_status LIKE '%permitted%' OR s.fee_status LIKE '%completed%' OR s.fee_status LIKE '%nodue%')
          THEN 'Completed'
          ELSE s.registration_status
        END AS registration_status,
        s.fee_status,
        s.student_data,
        s.batch,
        s.course,
        s.branch,
        ar.id AS attendance_record_id,
        ar.status AS attendance_status,
        ar.holiday_reason,
        COALESCE(ar.sms_sent, 0) AS sms_sent
      FROM students s
      LEFT JOIN attendance_records ar
        ON ar.student_id = s.id
       AND ar.attendance_date = ?
      WHERE 1=1
    `;

    const params = [attendanceDate];

    // Optimize: Order WHERE conditions to use composite index effectively
    // Start with indexed columns in order: student_status, course, batch, current_year, current_semester
    query += ` AND s.student_status = 'Regular'`;

    // EXCLUDE students with active INTERNSHIP assignments for this specific date (respecting allowed_days)
    query += `
      AND NOT EXISTS (
        SELECT 1 FROM internship_assignments ia 
        WHERE ia.student_id = s.id 
        AND ? BETWEEN ia.start_date AND ia.end_date
        AND JSON_CONTAINS(ia.allowed_days, JSON_QUOTE(DATE_FORMAT(?, '%a')))
      )
    `;
    params.push(attendanceDate, attendanceDate);

    // Apply indexed filters first (these use the composite index)
    if (course) {
      query += ' AND s.course = ?';
      params.push(course);
    }

    if (batch) {
      query += ' AND s.batch = ?';
      params.push(batch);
    }

    if (currentYear) {
      const parsedYear = parseInt(currentYear, 10);
      if (!Number.isNaN(parsedYear)) {
        query += ' AND s.current_year = ?';
        params.push(parsedYear);
      }
    }

    if (currentSemester) {
      const parsedSemester = parseInt(currentSemester, 10);
      if (!Number.isNaN(parsedSemester)) {
        query += ' AND s.current_semester = ?';
        params.push(parsedSemester);
      }
    }

    if (branch) {
      query += ' AND s.branch = ?';
      params.push(branch);
    }

    // Fetched dynamic exclusion config
    {
      let excludedCourses = [];
      let excludedStudents = [];
      try {
        const [settings] = await masterPool.query(
          'SELECT value FROM settings WHERE `key` = ?',
          ['attendance_config']
        );
        if (settings && settings.length > 0) {
          const config = JSON.parse(settings[0].value);
          if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
          if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
        }
      } catch (err) {
        console.warn('Failed to fetch attendance config in getAttendance, using defaults', err);
      }

      if (excludedCourses.length > 0) {
        query += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
        params.push(...excludedCourses);
      }

      if (excludedStudents.length > 0) {
        const placeholders = excludedStudents.map(() => '?').join(',');
        query += ` AND s.admission_number NOT IN (${placeholders})`;
        params.push(...excludedStudents);
      }
    }



    // Apply user scope filtering (after indexed filters)
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        query += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    if (studentName) {
      const keyword = `%${studentName}%`;
      // Optimize: Check indexed columns first (student_name, pin_no) for better performance
      // JSON extraction is expensive, so we prioritize fixed columns
      query += `
        AND (
          s.admission_number LIKE ? 
          OR s.admission_no LIKE ? 
          OR s.pin_no LIKE ? 
          OR s.student_name LIKE ?
        )
      `;
      params.push(keyword, keyword, keyword, keyword);
    }

    if (parentMobile) {
      const mobileLike = `%${parentMobile}%`;
      // Optimize: Check indexed columns first (parent_mobile1, parent_mobile2) for better performance
      query += `
        AND (
          s.parent_mobile1 LIKE ?
          OR s.parent_mobile2 LIKE ?
        )
      `;
      params.push(mobileLike, mobileLike);
    }

    const { attendanceStatus } = req.query;
    if (attendanceStatus) {
      if (attendanceStatus === 'unmarked') {
        query += ' AND ar.id IS NULL';
      } else if (attendanceStatus === 'marked') {
        query += ' AND ar.id IS NOT NULL';
      } else if (attendanceStatus === 'present') {
        query += " AND ar.status = 'present'";
      } else if (attendanceStatus === 'absent') {
        query += " AND ar.status = 'absent'";
      } else if (attendanceStatus === 'holiday') {
        query += " AND ar.status = 'holiday'";
      }
    }

    query += ' ORDER BY s.student_name ASC';

    // Build count query for pagination - use same WHERE clause but count distinct students
    // This ensures accurate pagination based on all applied filters (batch, course, branch, year, semester, etc.)
    let countQuery = `
      SELECT COUNT(DISTINCT s.id) AS total
      FROM students s
      LEFT JOIN attendance_records ar
        ON ar.student_id = s.id
        AND ar.attendance_date = ?
      WHERE 1=1
    `;

    const countParams = [attendanceDate];

    // Optimize: Order WHERE conditions to use composite index effectively
    countQuery += ` AND s.student_status = 'Regular'`;

    // EXCLUDE students with active INTERNSHIP assignments for this specific date (respecting allowed_days)
    countQuery += `
      AND NOT EXISTS (
        SELECT 1 FROM internship_assignments ia 
        WHERE ia.student_id = s.id 
        AND ? BETWEEN ia.start_date AND ia.end_date
        AND JSON_CONTAINS(ia.allowed_days, JSON_QUOTE(DATE_FORMAT(?, '%a')))
      )
    `;
    countParams.push(attendanceDate, attendanceDate);

    // Apply indexed filters first (these use the composite index)
    if (course) {
      countQuery += ' AND s.course = ?';
      countParams.push(course);
    }

    if (batch) {
      countQuery += ' AND s.batch = ?';
      countParams.push(batch);
    }

    if (currentYear) {
      const parsedYear = parseInt(currentYear, 10);
      if (!Number.isNaN(parsedYear)) {
        countQuery += ' AND s.current_year = ?';
        countParams.push(parsedYear);
      }
    }

    if (currentSemester) {
      const parsedSemester = parseInt(currentSemester, 10);
      if (!Number.isNaN(parsedSemester)) {
        countQuery += ' AND s.current_semester = ?';
        countParams.push(parsedSemester);
      }
    }

    if (branch) {
      countQuery += ' AND s.branch = ?';
      countParams.push(branch);
    }

    // Exclude certain courses (after course filter to use index)
    // Exclude certain courses (after course filter to use index)
    {
      let excludedCourses = [];
      let excludedStudents = [];
      try {
        const [settings] = await masterPool.query(
          'SELECT value FROM settings WHERE `key` = ?',
          ['attendance_config']
        );
        if (settings && settings.length > 0) {
          const config = JSON.parse(settings[0].value);
          if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
          if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
        }
      } catch (err) {
        console.warn('Failed to fetch attendance config in getAttendance count query', err);
      }

      if (excludedCourses.length > 0) {
        countQuery += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
        countParams.push(...excludedCourses);
      }

      if (excludedStudents.length > 0) {
        const placeholders = excludedStudents.map(() => '?').join(',');
        countQuery += ` AND s.admission_number NOT IN (${placeholders})`;
        countParams.push(...excludedStudents);
      }
    }

    // Apply user scope filtering (after indexed filters)
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        countQuery += ` AND ${scopeCondition}`;
        countParams.push(...scopeParams);
      }
    }

    if (studentName) {
      const keyword = `%${studentName}%`;
      // Optimize: Check indexed columns first for better performance
      countQuery += `
        AND (
          s.student_name LIKE ?
          OR s.pin_no LIKE ?
          OR (s.student_data IS NOT NULL AND (
            JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Student Name"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."student_name"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."PIN Number"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Pin Number"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."pin_number"')) LIKE ?
          ))
        )
      `;
      countParams.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }

    if (parentMobile) {
      const mobileLike = `%${parentMobile}%`;
      // Optimize: Check indexed columns first for better performance
      countQuery += `
        AND (
          s.parent_mobile1 LIKE ?
          OR s.parent_mobile2 LIKE ?
          OR (s.student_data IS NOT NULL AND (
            JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile Number 1"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile Number 2"')) LIKE ?
          ))
        )
      `;
      countParams.push(mobileLike, mobileLike, mobileLike, mobileLike);
    }

    if (attendanceStatus) {
      if (attendanceStatus === 'unmarked') {
        countQuery += ' AND ar.id IS NULL';
      } else if (attendanceStatus === 'marked') {
        countQuery += ' AND ar.id IS NOT NULL';
      } else if (attendanceStatus === 'present') {
        countQuery += " AND ar.status = 'present'";
      } else if (attendanceStatus === 'absent') {
        countQuery += " AND ar.status = 'absent'";
      } else if (attendanceStatus === 'holiday') {
        countQuery += " AND ar.status = 'holiday'";
      }
    }

    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    // Get total count with all filters applied
    const [countRows] = await masterPool.query(countQuery, countParams);
    const total = countRows?.[0]?.total || 0;

    // Optimize: Combine all statistics queries into a single query using conditional aggregation
    // This reduces database round trips from 3 queries to 1
    let statsQuery = `
      SELECT 
        COUNT(DISTINCT s.id) AS total_students,
        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN s.id END) AS present_count,
        COUNT(DISTINCT CASE WHEN ar.status = 'absent' THEN s.id END) AS absent_count,
        COUNT(DISTINCT CASE WHEN ar.id IS NOT NULL THEN s.id END) AS marked_count
      FROM students s
      LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.attendance_date = ?
      WHERE 1=1 AND s.student_status = 'Regular'
    `;

    const statsParams = [attendanceDate];

    // Optimize: Order WHERE conditions to use composite index effectively
    // Apply indexed filters first (these use the composite index)
    if (course) {
      statsQuery += ' AND s.course = ?';
      statsParams.push(course);
    }

    if (batch) {
      statsQuery += ' AND s.batch = ?';
      statsParams.push(batch);
    }

    if (currentYear) {
      const parsedYear = parseInt(currentYear, 10);
      if (!Number.isNaN(parsedYear)) {
        statsQuery += ' AND s.current_year = ?';
        statsParams.push(parsedYear);
      }
    }

    if (currentSemester) {
      const parsedSemester = parseInt(currentSemester, 10);
      if (!Number.isNaN(parsedSemester)) {
        statsQuery += ' AND s.current_semester = ?';
        statsParams.push(parsedSemester);
      }
    }

    if (branch) {
      statsQuery += ' AND s.branch = ?';
      statsParams.push(branch);
    }

    // Exclude certain courses (after course filter to use index)
    // Exclude certain courses (after course filter to use index)
    {
      let excludedCourses = [];
      let excludedStudents = [];
      try {
        const [settings] = await masterPool.query(
          'SELECT value FROM settings WHERE `key` = ?',
          ['attendance_config']
        );
        if (settings && settings.length > 0) {
          const config = JSON.parse(settings[0].value);
          if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
          if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
        }
      } catch (err) {
        console.warn('Failed to fetch attendance config in getAttendance stats query', err);
      }

      if (excludedCourses.length > 0) {
        statsQuery += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
        statsParams.push(...excludedCourses);
      }

      if (excludedStudents.length > 0) {
        const placeholders = excludedStudents.map(() => '?').join(',');
        statsQuery += ` AND s.admission_number NOT IN (${placeholders})`;
        statsParams.push(...excludedStudents);
      }
    }

    // Apply user scope filtering (after indexed filters)
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        statsQuery += ` AND ${scopeCondition}`;
        statsParams.push(...scopeParams);
      }
    }

    if (studentName) {
      const keyword = `%${studentName}%`;
      // Optimize: Check indexed columns first for better performance
      statsQuery += `
        AND (
          s.student_name LIKE ?
          OR s.pin_no LIKE ?
          OR (s.student_data IS NOT NULL AND (
            JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Student Name"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."student_name"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."PIN Number"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Pin Number"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."pin_number"')) LIKE ?
          ))
        )
      `;
      statsParams.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }

    if (parentMobile) {
      const mobileLike = `%${parentMobile}%`;
      // Optimize: Check indexed columns first for better performance
      statsQuery += `
        AND (
          s.parent_mobile1 LIKE ?
          OR s.parent_mobile2 LIKE ?
          OR (s.student_data IS NOT NULL AND (
            JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile Number 1"')) LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile Number 2"')) LIKE ?
          ))
        )
      `;
      statsParams.push(mobileLike, mobileLike, mobileLike, mobileLike);
    }

    // Execute single optimized stats query
    const [statsRows] = await masterPool.query(statsQuery, statsParams);
    const statsRow = statsRows[0] || {};

    const statisticsTotal = parseInt(statsRow.total_students || 0, 10);
    const presentCount = parseInt(statsRow.present_count || 0, 10);
    const absentCount = parseInt(statsRow.absent_count || 0, 10);
    const markedCount = parseInt(statsRow.marked_count || 0, 10);
    const unmarkedCount = Math.max(0, statisticsTotal - markedCount);

    const statistics = {
      total: total,
      present: presentCount,
      absent: absentCount,
      marked: markedCount,
      unmarked: unmarkedCount
    };

    // Apply pagination to data query
    if (parsedLimit && parsedLimit > 0) {
      query += ' LIMIT ? OFFSET ?';
      params.push(parsedLimit, parsedOffset);
    }

    const [rows] = await masterPool.query(query, params);

    const students = rows.map((row) => {
      const studentData = parseStudentData(row.student_data);

      const resolvedName =
        row.student_name ||
        studentData['Student Name'] ||
        studentData['student_name'] ||
        null;

      const parentMobile1 =
        row.parent_mobile1 ||
        studentData['Parent Mobile Number 1'] ||
        studentData['Parent Phone Number 1'] ||
        null;

      const parentMobile2 =
        row.parent_mobile2 ||
        studentData['Parent Mobile Number 2'] ||
        studentData['Parent Phone Number 2'] ||
        null;

      const courseValue =
        row.course || studentData.Course || studentData.course || null;

      const branchValue =
        row.branch || studentData.Branch || studentData.branch || null;

      const pinNumberValue =
        row.pin_no ||
        studentData['PIN Number'] ||
        studentData['Pin Number'] ||
        studentData['pin_number'] ||
        studentData.pin_no ||
        null;

      const resolvedRegistrationStatus =
        (row.registration_status && String(row.registration_status).trim().length > 0)
          ? row.registration_status
          : (studentData.registration_status || studentData['Registration Status'] || null);

      const resolvedFeeStatus =
        (row.fee_status && String(row.fee_status).trim().length > 0)
          ? row.fee_status
          : (studentData.fee_status || studentData['Fee Status'] || null);

      return {
        id: row.id,
        admissionNumber: row.admission_number || studentData['Admission Number'] || studentData.admission_number || null,
        pinNumber: pinNumberValue,
        studentName: resolvedName,
        parentMobile1,
        parentMobile2,
        photo: row.student_photo,
        batch: row.batch || studentData.Batch || null,
        course: courseValue,
        branch: branchValue,
        currentYear: row.current_year || studentData['Current Academic Year'] || null,
        currentSemester: row.current_semester || studentData['Current Semester'] || null,
        attendanceStatus: row.attendance_status || null,
        registration_status: resolvedRegistrationStatus,
        fee_status: resolvedFeeStatus,
        smsSent: row.sms_sent === 1 || row.sms_sent === true
      };
    });

    res.json({
      success: true,
      data: {
        date: attendanceDate,
        students,
        holiday: holidayInfo,
        statistics
      },
      pagination: {
        total,
        limit: parsedLimit || null,
        offset: parsedOffset
      }
    });
  } catch (error) {
    console.error('Failed to fetch attendance list:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance'
    });
  }
};

exports.deleteAttendanceForDate = async (req, res) => {
  try {
    const attendanceDate = getDateOnlyString(req.query.date || req.body.date);
    const countOnly = req.query.countOnly === 'true' || req.body.countOnly === true;

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance date supplied'
      });
    }

    // Extract filter parameters
    const {
      batch,
      currentYear,
      currentSemester,
      studentName,
      parentMobile,
      course,
      branch
    } = req.query;

    // Fetch excluded courses from attendance config (same as getFilterOptions)
    let excludedCourses = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
      }
    } catch (err) {
      // use empty array
    }

    // Build the WHERE clause for filtering students
    let whereConditions = [];
    const params = [];

    // Filter for regular students only
    whereConditions.push('s.student_status = ?');
    params.push('Regular');

    // Exclude certain courses
    if (excludedCourses.length > 0) {
      whereConditions.push(`s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`);
      params.push(...excludedCourses);
    }

    // Apply user scope filtering
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        whereConditions.push(scopeCondition);
        params.push(...scopeParams);
      }
    }

    // Apply filters
    if (batch) {
      whereConditions.push('s.batch = ?');
      params.push(batch);
    }

    if (currentYear) {
      const parsedYear = parseInt(currentYear, 10);
      if (!Number.isNaN(parsedYear)) {
        whereConditions.push('s.current_year = ?');
        params.push(parsedYear);
      }
    }

    if (currentSemester) {
      const parsedSemester = parseInt(currentSemester, 10);
      if (!Number.isNaN(parsedSemester)) {
        whereConditions.push('s.current_semester = ?');
        params.push(parsedSemester);
      }
    }

    if (course) {
      whereConditions.push('s.course = ?');
      params.push(course);
    }

    if (branch) {
      whereConditions.push('s.branch = ?');
      params.push(branch);
    }

    if (studentName) {
      const keyword = `%${studentName}%`;
      whereConditions.push(`(
        s.student_name LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Student Name"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."student_name"')) LIKE ?
        OR s.pin_no LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."PIN Number"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Pin Number"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."pin_number"')) LIKE ?
      )`);
      params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }

    if (parentMobile) {
      const mobileLike = `%${parentMobile}%`;
      whereConditions.push(`(
        s.parent_mobile1 LIKE ?
        OR s.parent_mobile2 LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile 1"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."Parent Mobile 2"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."parent_mobile1"')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$."parent_mobile2"')) LIKE ?
      )`);
      params.push(mobileLike, mobileLike, mobileLike, mobileLike, mobileLike, mobileLike);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : 'WHERE 1=1';

    // Build query to count/delete attendance records matching filters
    // We need to join with students table to apply filters
    const queryBase = `
      FROM attendance_records AS ar
      INNER JOIN students AS s ON s.id = ar.student_id
      ${whereClause}
      AND ar.attendance_date = ?
    `;

    params.push(attendanceDate);

    if (countOnly) {
      // Just return the count without deleting
      const [countResult] = await masterPool.query(
        `SELECT COUNT(*) AS count ${queryBase}`,
        params
      );

      return res.json({
        success: true,
        message: `Found ${countResult[0].count} attendance record(s) matching filters`,
        data: {
          date: attendanceDate,
          count: countResult[0].count,
          filters: {
            batch: batch || null,
            course: course || null,
            branch: branch || null,
            currentYear: currentYear || null,
            currentSemester: currentSemester || null,
            studentName: studentName || null,
            parentMobile: parentMobile || null
          }
        }
      });
    }

    // Delete the attendance records using JOIN
    // MySQL DELETE with JOIN syntax: DELETE alias FROM table AS alias INNER JOIN ...
    const [result] = await masterPool.query(
      `DELETE ar ${queryBase}`,
      params
    );

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} attendance record(s) for ${attendanceDate}`,
      data: {
        date: attendanceDate,
        deletedCount: result.affectedRows
      }
    });
  } catch (error) {
    console.error('Failed to delete attendance records:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting attendance records'
    });
  }
};

exports.markAttendance = async (req, res) => {
  const { attendanceDate, records } = req.body || {};
  const normalizedDate = getDateOnlyString(attendanceDate);

  if (!normalizedDate) {
    return res.status(400).json({
      success: false,
      message: 'Invalid attendance date supplied'
    });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Attendance records are required'
    });
  }

  const normalizedRecords = records
    .map((record) => ({
      studentId: Number(record.studentId),
      status: record.status ? String(record.status).toLowerCase() : null,
      holidayReason: record.holidayReason ? String(record.holidayReason).trim() : null
    }))
    .filter((record) => Number.isInteger(record.studentId) && VALID_STATUSES.has(record.status));

  let isHolidayDate = false;
  try {
    const holidayInfo = await getNonWorkingDayInfo(normalizedDate);
    isHolidayDate = Boolean(holidayInfo?.isNonWorkingDay);
    if (isHolidayDate && normalizedRecords.some((r) => r.status !== 'holiday')) {
      return res.status(400).json({
        success: false,
        message: 'On no class work days, only no class work status can be recorded'
      });
    }
  } catch (error) {
    console.warn('Holiday check failed during attendance mark:', error.message || error);
  }

  if (normalizedRecords.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid attendance records supplied'
    });
  }

  const uniqueStudentIds = [
    ...new Set(normalizedRecords.map((record) => record.studentId))
  ];

  let connection;

  try {
    connection = await masterPool.getConnection();
    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `
        SELECT
          s.id,
          s.admission_number,
          s.student_name,
          s.parent_mobile1,
          s.parent_mobile2,
          s.student_mobile,
          s.pin_no,
          s.batch,
          s.current_year,
          s.current_semester,
          s.college,
          s.course,
          s.branch,
          s.student_data
        FROM students s
        WHERE s.id IN (?)
          AND s.student_status = 'Regular'
      `,
      [uniqueStudentIds]
    );

    const studentMap = new Map(
      studentRows.map((row) => [
        row.id,
        {
          ...row,
          student_data: parseStudentData(row.student_data)
        }
      ])
    );

    const missingStudents = uniqueStudentIds.filter(
      (id) => !studentMap.has(id)
    );

    if (missingStudents.length > 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: `Students not found: ${missingStudents.join(', ')}`
      });
    }

    const [existingRows] = await connection.query(
      `
        SELECT id, student_id, status
        FROM attendance_records
        WHERE attendance_date = ?
          AND student_id IN (?)
      `,
      [normalizedDate, uniqueStudentIds]
    );

    const existingMap = new Map(
      existingRows.map((row) => [row.student_id, row])
    );

    const adminId = req.admin?.id || null;

    let updatedCount = 0;
    let insertedCount = 0;

    const smsQueue = [];
    let hasYearSemesterColumns = null; // null = unknown, true/false after first insert

    for (const record of normalizedRecords) {
      const student = studentMap.get(record.studentId);
      const existing = existingMap.get(record.studentId);

      if (existing) {
        if (existing.status === record.status) {
          // No change needed
          continue;
        }

        // Build UPDATE query - include holiday_reason if status is holiday
        let updateQuery = `
          UPDATE attendance_records
          SET status = ?, marked_by = ?`;
        let updateParams = [record.status, adminId];

        // Add holiday_reason if status is holiday and reason is provided
        if (record.status === 'holiday' && record.holidayReason) {
          updateQuery += `, holiday_reason = ?`;
          updateParams.push(record.holidayReason);
          console.log('Backend: Updating holiday reason for student', {
            studentId: record.studentId,
            holidayReason: record.holidayReason,
            updateQuery: updateQuery
          });
        } else if (record.status !== 'holiday') {
          // Clear holiday_reason if status is not holiday
          updateQuery += `, holiday_reason = NULL`;
          console.log('Backend: Clearing holiday reason for student', {
            studentId: record.studentId,
            status: record.status
          });
        }

        updateQuery += `, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        updateParams.push(existing.id);

        await connection.query(updateQuery, updateParams);

        // Debug: Verify holiday reason was actually updated
        if (record.status === 'holiday' && record.holidayReason) {
          const [verifyUpdateResult] = await connection.query(
            'SELECT holiday_reason FROM attendance_records WHERE student_id = ? AND attendance_date = ?',
            [record.studentId, normalizedDate]
          );
          console.log('Backend: Verified holiday reason update in DB:', {
            studentId: record.studentId,
            date: normalizedDate,
            savedHolidayReason: record.holidayReason,
            dbHolidayReason: verifyUpdateResult[0]?.holiday_reason,
            match: verifyUpdateResult[0]?.holiday_reason === record.holidayReason
          });
        }

        updatedCount += 1;

        if (record.status === 'absent') {
          smsQueue.push({ student, attendanceDate: normalizedDate });
        }
      } else {
        // Build INSERT query - include year/semester only if table has those columns
        const attYear = student.current_year != null ? student.current_year : null;
        const attSemester = student.current_semester != null ? student.current_semester : null;
        const includeYearSemester = hasYearSemesterColumns !== false;

        let insertCols = 'student_id, admission_number, attendance_date';
        let insertVals = [record.studentId, student.admission_number || null, normalizedDate];
        if (includeYearSemester) {
          insertCols += ', `year`, semester';
          insertVals.push(attYear, attSemester);
        }
        insertCols += ', status, marked_by';
        insertVals.push(record.status, adminId);

        if (record.status === 'holiday' && record.holidayReason) {
          insertCols += ', holiday_reason';
          insertVals.push(record.holidayReason);
          console.log('Backend: Inserting holiday reason for student', {
            studentId: record.studentId,
            holidayReason: record.holidayReason
          });
        }

        const insertQuery = `INSERT INTO attendance_records (${insertCols}) VALUES (${insertVals.map(() => '?').join(', ')})`;

        try {
          await connection.query(insertQuery, insertVals);
        } catch (insertErr) {
          // If year/semester columns don't exist, retry without them
          if (insertErr.code === 'ER_BAD_FIELD_ERROR' && (insertErr.sqlMessage || '').includes("'year'") && includeYearSemester) {
            hasYearSemesterColumns = false;
            const cols = 'student_id, admission_number, attendance_date, status, marked_by';
            const vals = [record.studentId, student.admission_number || null, normalizedDate, record.status, adminId];
            if (record.status === 'holiday' && record.holidayReason) {
              const cols2 = cols + ', holiday_reason';
              vals.push(record.holidayReason);
              await connection.query(`INSERT INTO attendance_records (${cols2}) VALUES (?,?,?,?,?,?)`, vals);
            } else {
              await connection.query(`INSERT INTO attendance_records (${cols}) VALUES (?,?,?,?,?)`, vals);
            }
          } else {
            throw insertErr;
          }
        }

        // Debug: Verify holiday reason was actually saved
        if (record.status === 'holiday' && record.holidayReason) {
          const [verifyResult] = await connection.query(
            'SELECT holiday_reason FROM attendance_records WHERE student_id = ? AND attendance_date = ?',
            [record.studentId, normalizedDate]
          );
          console.log('Backend: Verified holiday reason in DB:', {
            studentId: record.studentId,
            date: normalizedDate,
            savedHolidayReason: record.holidayReason,
            dbHolidayReason: verifyResult[0]?.holiday_reason,
            match: verifyResult[0]?.holiday_reason === record.holidayReason
          });
        }

        insertedCount += 1;

        if (record.status === 'absent') {
          smsQueue.push({ student, attendanceDate: normalizedDate });
        }
      }
    }

    await connection.commit();

    // Get notification settings for attendance
    let notificationSettings = null;
    try {
      notificationSettings = await getNotificationSetting('attendance_absent');
    } catch (error) {
      console.warn('Failed to load attendance notification settings, using defaults:', error);
    }

    const notificationResults = [];
    console.log(`\n========== NOTIFICATION DISPATCH LOG (${normalizedDate}) ==========`);
    console.log(`Total absent students to notify via SMS: ${smsQueue.length}`);
    // Web notifications have been removed for attendance as per user request.

    // Get connection again for updating SMS status
    const updateConnection = await masterPool.getConnection();

    for (const payload of smsQueue) {
      const student = payload.student;
      const studentData = student.student_data || {};

      // Extract student details for logging and response
      const studentDetails = {
        studentId: student.id,
        admissionNumber: student.admission_number || '',
        pinNumber: student.pin_no || studentData['PIN Number'] || studentData['Pin Number'] || '',
        studentName: student.student_name || studentData['Student Name'] || studentData['student_name'] || 'Unknown',
        college: student.college || studentData['College'] || studentData['college'] || '',
        course: student.course || studentData['Course'] || studentData['course'] || '',
        branch: student.branch || studentData['Branch'] || studentData['branch'] || '',
        year: student.current_year || studentData['Current Academic Year'] || '',
        semester: student.current_semester || studentData['Current Semester'] || '',
        parentMobile: student.parent_mobile1 || student.parent_mobile2 ||
          studentData['Parent Mobile Number 1'] || studentData['Parent Phone Number 1'] ||
          studentData['Parent Mobile Number'] || '',
        parentEmail: resolveParentEmail(student)
      };

      const result = {
        ...studentDetails,
        emailSent: false,
        smsSent: false,
        emailError: null,
        smsError: null
      };

      // Check if notifications are enabled
      const isEnabled = notificationSettings?.enabled !== false;

      if (isEnabled) {
        // Send SMS if enabled
        if (notificationSettings?.smsEnabled !== false && studentDetails.parentMobile) {
          try {
            const smsResult = await sendAbsenceNotification({
              ...payload,
              notificationSettings
            });

            // Web notification is now handled separately for all statuses
            result.smsSent = !!smsResult?.success;
            result.smsError = smsResult?.reason || null;
            result.sentTo = smsResult?.sentTo || studentDetails.parentMobile;
            result.apiResponse = smsResult?.data || null;

            // Update SMS status in database if SMS was sent successfully
            if (result.smsSent) {
              try {
                await updateConnection.query(
                  `
                    UPDATE attendance_records
                    SET sms_sent = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ? AND attendance_date = ?
                  `,
                  [student.id, normalizedDate]
                );
              } catch (updateError) {
                // If column doesn't exist, try to add it (graceful fallback)
                console.warn(`Could not update sms_sent for student ${student.id}:`, updateError.message);
              }
            }
          } catch (error) {
            console.error(`SMS notification failed for ${student.admission_number}:`, error);
            result.smsError = error.message || 'unknown_error';
          }
        }

        // Email notifications removed for attendance - only SMS is sent
      } else {
        // Notifications disabled - skip
        result.smsError = 'notifications_disabled';
        result.emailError = 'notifications_disabled';
      }

      notificationResults.push(result);
    }

    // Release update connection
    if (updateConnection) {
      updateConnection.release();
    }

    // Summary log
    const smsSuccessCount = notificationResults.filter(r => r.smsSent).length;
    const emailSuccessCount = notificationResults.filter(r => r.emailSent).length;
    const smsFailedCount = notificationResults.filter(r => !r.smsSent && r.smsError && r.smsError !== 'notifications_disabled').length;
    const emailFailedCount = notificationResults.filter(r => !r.emailSent && r.emailError && r.emailError !== 'notifications_disabled').length;

    console.log(`\n========== NOTIFICATION DISPATCH SUMMARY ==========`);
    console.log(`📱 SMS: ✅ ${smsSuccessCount} sent, ❌ ${smsFailedCount} failed`);
    console.log(`📧 Email: ✅ ${emailSuccessCount} sent, ❌ ${emailFailedCount} failed`);
    console.log(`==================================================\n`);

    // ============================================
    // GENERATE AND SEND ATTENDANCE REPORT PDFs
    // ============================================
    // Get all attendance data for the date
    const allAttendanceData = await getAllAttendanceForDate(normalizedDate);

    // Get all active Principals and HODs with their access scopes
    const { getAllNotificationUsers, filterAttendanceByUserScope, areAllBatchesMarkedForUserScope } = require('../services/getUserScopeAttendance');
    const { principals, hods } = await getAllNotificationUsers();

    console.log(`\n📊 Attendance Report Status for ${normalizedDate}:`);
    console.log(`   Total attendance groups: ${allAttendanceData.length}`);
    console.log(`   Total Principals: ${principals.length}`);
    console.log(`   Total HODs: ${hods.length}`);

    const reportResults = [];
    const processedUsers = new Set(); // Track which users received reports

    // Process each Principal
    for (const principal of principals) {
      // console.log(`\n👤 Checking Principal: ${principal.name} (${principal.email})`);
      // console.log(`   Scope: Colleges: ${principal.collegeNames.join(', ') || 'All'}, Courses: ${principal.allCourses ? 'All' : principal.courseNames.join(', ') || 'None'}, Branches: ${principal.allBranches ? 'All' : principal.branchNames.join(', ') || 'None'}`);

      // Filter attendance data by principal's scope
      const filteredGroups = filterAttendanceByUserScope(allAttendanceData, principal);

      if (filteredGroups.length === 0) {
        console.log(`   ⚠️  No attendance data found in principal's scope`);
        continue;
      }

      console.log(`   📋 Found ${filteredGroups.length} group(s) in principal's scope`);

      // Check if all batches in principal's scope are marked
      const allMarked = areAllBatchesMarkedForUserScope(filteredGroups);

      console.log(`   ${allMarked ? '✅ All batches marked' : '⏳ Not all batches marked yet'}`);

      if (allMarked) {
        // Group filtered groups by college for per-college reports
        const groupsByCollege = new Map();
        for (const group of filteredGroups) {
          const collegeKey = group.college || 'Unknown';
          if (!groupsByCollege.has(collegeKey)) {
            groupsByCollege.set(collegeKey, []);
          }
          groupsByCollege.get(collegeKey).push(group);
        }

        // Send separate report for each college in principal's scope
        for (const [collegeName, collegeGroups] of groupsByCollege) {
          // Combine all students and attendance records from all groups for this college
          const allStudents = [];
          const allAttendanceRecords = [];
          const allBatchesData = [];

          for (const group of collegeGroups) {
            allStudents.push(...group.students);
            allAttendanceRecords.push(...group.attendanceRecords);
            allBatchesData.push(group);
          }

          // Get college ID based on name match
          let collegeId = null;
          // Note context: principal.collegeNames and principal.collegeIds are parallel arrays
          const colIndex = principal.collegeNames.findIndex(name => name === collegeName);
          if (colIndex !== -1) {
            collegeId = principal.collegeIds[colIndex];
          }

          // Generate Unique Report ID using ID first, fallback to sanitized name
          const colIdentifier = collegeId ? collegeId : (collegeName || 'ALL').replace(/[^a-zA-Z0-9]/g, '_');
          const reportUniqueId = `REPORT_${principal.id}_${colIdentifier}_${normalizedDate}`;

          // RACE CONDITION HANDLING: Insert 'PENDING' state first
          // If insert fails (duplicate), request is already being processed or sent
          try {
            // Check if already sent or pending
            const [checkLogs] = await masterPool.query(
              'SELECT id, status FROM sms_logs WHERE message_id = ? LIMIT 1',
              [reportUniqueId]
            );

            if (checkLogs.length > 0) {
              // Determine log level - only log if status is pending (to debug stuck jobs) or sent (info)
              // To obey user request "dont needed to check r send... again", we SILENTLY skip.
              if (checkLogs[0].status === 'PENDING') {
                console.log(`   ⏳ Report for ${principal.name} (${collegeName}) is currently PENDING. Skipping.`);
              }
              // If SENT, we silently skip or log debug only
              // console.log(\`   Detailed report already sent today to Principal \${principal.name} for \${collegeName}. Skipping.\`);
              continue;
            }

            // Try to insert PENDING lock
            await masterPool.query(
              `INSERT INTO sms_logs (student_id, category, message, status, sent_at, message_id)
                 VALUES (?, 'ATTENDANCE_REPORT', ?, 'PENDING', NOW(), ?)`,
              [principal.id, `Attendance Report Generating for ${collegeName}`, reportUniqueId]
            );

          } catch (lockError) {
            console.warn('   ⚠️ Failed to acquire report lock (likely race condition):', lockError.message);
            continue; // Skip if we can't lock
          }

          // Determine report scope description for this college
          const scopeDescription = principal.allCourses && principal.allBranches
            ? 'All Courses & Branches'
            : principal.allCourses
              ? `All Courses${principal.branchNames.length > 0 ? ` - ${principal.branchNames.join(', ')}` : ''}`
              : principal.allBranches
                ? `${principal.courseNames.join(', ')} - All Branches`
                : `${principal.courseNames.join(', ')}${principal.branchNames.length > 0 ? ` - ${principal.branchNames.join(', ')}` : ''}`;



          try {
            const result = await sendAttendanceReportNotifications({
              collegeId,
              collegeName: collegeName,
              courseId: null, // Scope-based report
              courseName: scopeDescription,
              branchId: null, // Scope-based report
              branchName: principal.allBranches ? 'All Branches' : principal.branchNames.join(', ') || 'All Branches',
              batch: 'All Batches',
              year: 'All Years',
              semester: 'All Semesters',
              attendanceDate: normalizedDate,
              students: allStudents,
              attendanceRecords: allAttendanceRecords,
              allBatchesData: allBatchesData,
              recipientUser: principal // Pass user info for personalized email
            });

            reportResults.push({
              user: principal.name,
              userEmail: principal.email,
              role: 'Principal',
              college: collegeName,
              ...result
            });

            processedUsers.add(principal.email);
            console.log(`   📧 Report sent to Principal: ${principal.name} (${principal.email}) for ${collegeName}`);

            // UPDATE log status to 'Sent'
            try {
              await masterPool.query(
                `UPDATE sms_logs SET status = 'Sent', message = ? WHERE message_id = ?`,
                [`Attendance Report for ${collegeName} - ${normalizedDate}`, reportUniqueId]
              );
            } catch (logError) {
              console.warn('Failed to update report log to Sent:', logError.message);
            }
          } catch (error) {
            console.error(`   ❌ Error sending report to Principal ${principal.name} for ${collegeName}:`, error);

            // Revert PENDING status to 'FAILED' so it can be retried if needed, or stick to 'Failed'
            try {
              await masterPool.query(
                `UPDATE sms_logs SET status = 'Failed', error_details = ? WHERE message_id = ?`,
                [error.message, reportUniqueId]
              );
            } catch (revertError) {
              // ignore
            }

            reportResults.push({
              user: principal.name,
              userEmail: principal.email,
              role: 'Principal',
              college: collegeName,
              pdfGenerated: false,
              emailsSent: 0,
              emailsFailed: 0,
              errors: [error.message]
            });
          }
        }
      }
    }

    // Process each HOD
    for (const hod of hods) {
      // console.log(`\n👤 Checking HOD: ${hod.name} (${hod.email})`);
      // console.log(`   Scope: Colleges: ${hod.collegeNames.join(', ') || 'All'}, Courses: ${hod.allCourses ? 'All' : hod.courseNames.join(', ') || 'None'}, Branches: ${hod.branchNames.join(', ') || 'None'}`);

      // Filter attendance data by HOD's scope
      const filteredGroups = filterAttendanceByUserScope(allAttendanceData, hod);

      if (filteredGroups.length === 0) {
        console.log(`   ⚠️  No attendance data found in HOD's scope`);
        continue;
      }

      console.log(`   📋 Found ${filteredGroups.length} group(s) in HOD's scope`);

      // Check if all batches in HOD's scope are marked
      const allMarked = areAllBatchesMarkedForUserScope(filteredGroups);

      console.log(`   ${allMarked ? '✅ All batches marked' : '⏳ Not all batches marked yet'}`);

      if (allMarked) {
        // Combine all students and attendance records from all groups in HOD's scope
        const allStudents = [];
        const allAttendanceRecords = [];
        const allBatchesData = [];

        for (const group of filteredGroups) {
          allStudents.push(...group.students);
          allAttendanceRecords.push(...group.attendanceRecords);
          allBatchesData.push(group);
        }

        // Get IDs for recipient lookup
        let collegeId = null;
        let courseId = null;
        let branchId = null;

        if (hod.collegeIds.length > 0) {
          collegeId = hod.collegeIds[0];
        }

        if (!hod.allCourses && hod.courseIds.length > 0) {
          courseId = hod.courseIds[0];
        }

        if (!hod.allBranches && hod.branchIds.length > 0) {
          branchId = hod.branchIds[0];
        }

        // Get names for display
        const collegeName = hod.collegeNames[0] || 'Unknown';
        const courseName = hod.allCourses ? 'All Courses' : (hod.courseNames[0] || 'Unknown');
        const branchName = hod.allBranches ? 'All Branches' : (hod.branchNames[0] || 'Unknown');

        // Check if report already sent for this HOD/date
        // Check if report already sent for this HOD/date
        const reportUniqueId = `REPORT_HOD_${hod.id}_${normalizedDate}`;
        try {
          // Check if already sent or pending
          const [checkLogs] = await masterPool.query(
            'SELECT id, status FROM sms_logs WHERE message_id = ? LIMIT 1',
            [reportUniqueId]
          );

          if (checkLogs.length > 0) {
            // If PENDING, log it
            if (checkLogs[0].status === 'PENDING') {
              console.log(`   ⏳ Report for HOD ${hod.name} is currently PENDING. Skipping.`);
            }
            // Silently skip if SENT
            continue;
          }

          // Try to insert PENDING lock
          await masterPool.query(
            `INSERT INTO sms_logs (student_id, category, message, status, sent_at, message_id)
                 VALUES (?, 'ATTENDANCE_REPORT', ?, 'PENDING', NOW(), ?)`,
            [hod.id, `Attendance Report Generating for HOD`, reportUniqueId]
          );
        } catch (err) {
          console.warn('   ⚠️ Failed to acquire HOD report lock:', err.message);
          continue;
        }



        try {
          const result = await sendAttendanceReportNotifications({
            collegeId,
            collegeName,
            courseId,
            courseName,
            branchId,
            branchName,
            batch: 'All Batches',
            year: 'All Years',
            semester: 'All Semesters',
            attendanceDate: normalizedDate,
            students: allStudents,
            attendanceRecords: allAttendanceRecords,
            allBatchesData: allBatchesData,
            recipientUser: hod, // Pass user info for personalized email
            senderName: senderName // Pass sender name
          });

          reportResults.push({
            user: hod.name,
            userEmail: hod.email,
            role: 'HOD',
            ...result
          });

          processedUsers.add(hod.email);
          console.log(`   📧 Report sent to HOD: ${hod.name} (${hod.email})`);

          // UPDATE status to Sent
          try {
            await masterPool.query(
              `UPDATE sms_logs SET status = 'Sent', message = ? WHERE message_id = ?`,
              [`Attendance Report for ${courseName} - ${normalizedDate}`, reportUniqueId]
            );
          } catch (logError) {
            console.warn('Failed to update HOD report log:', logError.message);
          }
        } catch (error) {
          console.error(`   ❌ Error sending report to HOD ${hod.name}:`, error);

          // Revert PENDING to Failed
          try {
            await masterPool.query(
              `UPDATE sms_logs SET status = 'Failed', error_details = ? WHERE message_id = ?`,
              [error.message, reportUniqueId]
            );
          } catch (revertError) {
            // ignore
          }

          reportResults.push({
            user: hod.name,
            userEmail: hod.email,
            role: 'HOD',
            pdfGenerated: false,
            emailsSent: 0,
            emailsFailed: 0,
            errors: [error.message]
          });
        }
      }
    }

    // ============================================
    // GLOBAL REPORT FOR SUPER ADMIN (sriram@pydah.edu.in)
    // ============================================
    // Check if ALL batches across the ENTIRE system are marked
    const isGloballyFullyMarked = allAttendanceData.every(group => group.isFullyMarked);
    console.log(`\n🌍 Checking Global Report status: ${isGloballyFullyMarked ? '✅ All batches marked globally' : '⏳ Waiting for global completion'}`);

    if (isGloballyFullyMarked) {
      const SUPER_ADMIN_EMAIL = 'sriram@pydah.edu.in';
      console.log(`   🚀 Triggering Global Consolidated Report for ${SUPER_ADMIN_EMAIL}`);

      // Combine all students and attendance records from ALL groups
      const globalStudents = [];
      const globalAttendanceRecords = [];

      for (const group of allAttendanceData) {
        globalStudents.push(...group.students);
        globalAttendanceRecords.push(...group.attendanceRecords);
      }

      try {
        await sendAttendanceReportNotifications({
          collegeId: null,
          collegeName: 'All Colleges',
          courseId: null,
          courseName: 'All Courses',
          branchId: null,
          branchName: 'All Branches',
          batch: 'All Batches',
          year: 'All Years',
          semester: 'All Semesters',
          attendanceDate: normalizedDate,
          students: globalStudents,
          attendanceRecords: globalAttendanceRecords,
          allBatchesData: allAttendanceData, // Pass all batches data for summary table
          recipientUser: {
            name: 'Sriram',
            email: SUPER_ADMIN_EMAIL,
            role: 'super_admin' // Dummy role, bypassed by email check in service
          },
          senderName: senderName // Pass sender name
        });
        console.log(`   📧 Global Report sent successfully to ${SUPER_ADMIN_EMAIL}`);
        processedUsers.add(SUPER_ADMIN_EMAIL);
      } catch (error) {
        console.error(`   ❌ Error sending Global Report to ${SUPER_ADMIN_EMAIL}:`, error);
      }
    }

    // Log summary
    if (processedUsers.size > 0) {
      console.log(`\n📋 Summary: Reports sent to ${processedUsers.size} user(s)`);
    } else {
      console.log(`\n⏳ No reports sent - waiting for all batches to be marked in user scopes`);
    }

    // ============================================
    // AUTOMATIC DAY-END REPORT FOR COLLEGE/COURSE COMBINATIONS
    // ============================================
    // Check if all batches are marked for each college/course combination
    // If all batches are marked (pending = 0), automatically send day-end report
    console.log(`\n📊 Checking college/course combinations for automatic day-end reports...`);

    // Group attendance data by college/course
    const groupsByCollegeCourse = new Map();
    for (const group of allAttendanceData) {
      const college = group.college || 'Unknown';
      const course = group.course || 'Unknown';
      const key = `${college}|${course}`;

      if (!groupsByCollegeCourse.has(key)) {
        groupsByCollegeCourse.set(key, {
          college,
          course,
          groups: []
        });
      }

      groupsByCollegeCourse.get(key).groups.push(group);
    }

    const dayEndReportResults = [];
    const dayEndProcessedUsers = new Set();
    const superAdminEngineeringDiplomaSent = new Set(); // Track if Engineering College - Diploma report sent to super admin

    // Check each college/course combination
    for (const [key, collegeCourseData] of groupsByCollegeCourse) {
      const { college, course, groups } = collegeCourseData;

      // Check if all batches for this college/course are marked (pending = 0)
      const allBatchesMarked = groups.every(group => group.isFullyMarked);
      const totalGroups = groups.length;
      const markedGroups = groups.filter(g => g.isFullyMarked).length;

      console.log(`\n   📋 ${college} - ${course}: ${markedGroups}/${totalGroups} batches marked`);

      if (allBatchesMarked && totalGroups > 0) {
        console.log(`   ✅ All batches marked for ${college} - ${course}. Sending day-end report...`);

        // Combine all students and attendance records for this college/course
        const allStudents = [];
        const allAttendanceRecords = [];
        const allBatchesData = [];

        for (const group of groups) {
          allStudents.push(...group.students);
          allAttendanceRecords.push(...group.attendanceRecords);
          allBatchesData.push(group);
        }

        // Find relevant principals and HODs for this college/course
        const relevantPrincipals = principals.filter(principal => {
          // Check if principal has access to this college
          const hasCollegeAccess = principal.collegeNames.length === 0 ||
            principal.collegeNames.includes(college);

          // Check if principal has access to this course
          const hasCourseAccess = principal.allCourses ||
            principal.courseNames.includes(course);

          return hasCollegeAccess && hasCourseAccess;
        });

        const relevantHODs = hods.filter(hod => {
          // Check if HOD has access to this college
          const hasCollegeAccess = hod.collegeNames.length === 0 ||
            hod.collegeNames.includes(college);

          // Check if HOD has access to this course
          const hasCourseAccess = hod.allCourses ||
            hod.courseNames.includes(course);

          return hasCollegeAccess && hasCourseAccess;
        });

        // Send reports to relevant principals
        for (const principal of relevantPrincipals) {
          // Skip if already sent a report for this specific college/course combination
          const reportKey = `${principal.email}|${college}|${course}`;
          if (dayEndProcessedUsers.has(reportKey)) {
            continue;
          }

          // Get college ID
          let collegeId = null;
          if (principal.collegeNames.includes(college)) {
            const collegeIndex = principal.collegeNames.indexOf(college);
            collegeId = principal.collegeIds[collegeIndex] || null;
          }

          try {
            const result = await sendAttendanceReportNotifications({
              collegeId,
              collegeName: college,
              courseId: null,
              courseName: course,
              branchId: null,
              branchName: 'All Branches',
              batch: 'All Batches',
              year: 'All Years',
              semester: 'All Semesters',
              attendanceDate: normalizedDate,
              students: allStudents,
              attendanceRecords: allAttendanceRecords,
              allBatchesData: allBatchesData,
              recipientUser: principal
            });

            dayEndReportResults.push({
              user: principal.name,
              userEmail: principal.email,
              role: 'Principal',
              college,
              course,
              ...result
            });

            dayEndProcessedUsers.add(reportKey);
            console.log(`   📧 Day-end report sent to Principal: ${principal.name} (${principal.email}) for ${college} - ${course}`);
          } catch (error) {
            console.error(`   ❌ Error sending day-end report to Principal ${principal.name} for ${college} - ${course}:`, error);
            dayEndReportResults.push({
              user: principal.name,
              userEmail: principal.email,
              role: 'Principal',
              college,
              course,
              pdfGenerated: false,
              emailsSent: 0,
              emailsFailed: 0,
              errors: [error.message]
            });
          }
        }

        // Send reports to relevant HODs
        for (const hod of relevantHODs) {
          // Skip if already sent a report for this specific college/course combination
          const reportKey = `${hod.email}|${college}|${course}`;
          if (dayEndProcessedUsers.has(reportKey)) {
            continue;
          }

          // Get IDs for recipient lookup
          let collegeId = null;
          let courseId = null;
          let branchId = null;

          if (hod.collegeIds.length > 0 && hod.collegeNames.includes(college)) {
            const collegeIndex = hod.collegeNames.indexOf(college);
            collegeId = hod.collegeIds[collegeIndex] || null;
          }

          if (!hod.allCourses && hod.courseIds.length > 0 && hod.courseNames.includes(course)) {
            const courseIndex = hod.courseNames.indexOf(course);
            courseId = hod.courseIds[courseIndex] || null;
          }

          if (!hod.allBranches && hod.branchIds.length > 0) {
            branchId = hod.branchIds[0];
          }

          try {
            const result = await sendAttendanceReportNotifications({
              collegeId,
              collegeName: college,
              courseId,
              courseName: course,
              branchId,
              branchName: hod.allBranches ? 'All Branches' : (hod.branchNames[0] || 'All Branches'),
              batch: 'All Batches',
              year: 'All Years',
              semester: 'All Semesters',
              attendanceDate: normalizedDate,
              students: allStudents,
              attendanceRecords: allAttendanceRecords,
              allBatchesData: allBatchesData,
              recipientUser: hod
            });

            dayEndReportResults.push({
              user: hod.name,
              userEmail: hod.email,
              role: 'HOD',
              college,
              course,
              ...result
            });

            dayEndProcessedUsers.add(reportKey);
            console.log(`   📧 Day-end report sent to HOD: ${hod.name} (${hod.email}) for ${college} - ${course}`);
          } catch (error) {
            console.error(`   ❌ Error sending day-end report to HOD ${hod.name} for ${college} - ${course}:`, error);
            dayEndReportResults.push({
              user: hod.name,
              userEmail: hod.email,
              role: 'HOD',
              college,
              course,
              pdfGenerated: false,
              emailsSent: 0,
              emailsFailed: 0,
              errors: [error.message]
            });
          }
        }

        // ============================================
        // SPECIAL HANDLING: Send separate report to Super Admin for Engineering College - Diploma
        // ============================================
        const ENGINEERING_COLLEGE_NAME = 'Pydah College of Engineering';
        const DIPLOMA_COURSE_NAME = 'Diploma';
        const SUPER_ADMIN_EMAIL = 'sriram@pydah.edu.in';

        if (college === ENGINEERING_COLLEGE_NAME && course === DIPLOMA_COURSE_NAME) {
          // Check if already sent to avoid duplicates
          const reportKey = `${SUPER_ADMIN_EMAIL}|${ENGINEERING_COLLEGE_NAME}|${DIPLOMA_COURSE_NAME}`;
          if (superAdminEngineeringDiplomaSent.has(reportKey)) {
            console.log(`   ℹ️ Engineering College - Diploma report already sent to Super Admin, skipping duplicate`);
          } else {
            console.log(`   🎓 Sending separate Engineering College - Diploma report to Super Admin: ${SUPER_ADMIN_EMAIL}`);

            try {
              // Get college ID for Engineering College
              let engineeringCollegeId = null;
              try {
                const [collegeRows] = await masterPool.query(
                  'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
                  [ENGINEERING_COLLEGE_NAME]
                );
                if (collegeRows.length > 0) {
                  engineeringCollegeId = collegeRows[0].id;
                }
              } catch (err) {
                console.warn(`   ⚠️ Could not fetch college ID for ${ENGINEERING_COLLEGE_NAME}:`, err.message);
              }

              const result = await sendAttendanceReportNotifications({
                collegeId: engineeringCollegeId,
                collegeName: ENGINEERING_COLLEGE_NAME,
                courseId: null,
                courseName: DIPLOMA_COURSE_NAME,
                branchId: null,
                branchName: 'All Branches',
                batch: 'All Batches',
                year: 'All Years',
                semester: 'All Semesters',
                attendanceDate: normalizedDate,
                students: allStudents,
                attendanceRecords: allAttendanceRecords,
                allBatchesData: allBatchesData,
                recipientUser: {
                  name: 'Sriram',
                  email: SUPER_ADMIN_EMAIL,
                  role: 'super_admin'
                }
                // senderName removed - was undefined
              });

              dayEndReportResults.push({
                user: 'Sriram',
                userEmail: SUPER_ADMIN_EMAIL,
                role: 'Super Admin',
                college: ENGINEERING_COLLEGE_NAME,
                course: DIPLOMA_COURSE_NAME,
                ...result
              });

              superAdminEngineeringDiplomaSent.add(reportKey);
              console.log(`   📧 Engineering College - Diploma report sent successfully to Super Admin: ${SUPER_ADMIN_EMAIL}`);
            } catch (error) {
              console.error(`   ❌ Error sending Engineering College - Diploma report to Super Admin:`, error);
              dayEndReportResults.push({
                user: 'Sriram',
                userEmail: SUPER_ADMIN_EMAIL,
                role: 'Super Admin',
                college: ENGINEERING_COLLEGE_NAME,
                course: DIPLOMA_COURSE_NAME,
                pdfGenerated: false,
                emailsSent: 0,
                emailsFailed: 0,
                errors: [error.message]
              });
            }
          }
        }
      }
    }

    // Log day-end report summary
    const uniqueDayEndUsers = new Set();
    for (const key of dayEndProcessedUsers) {
      const email = key.split('|')[0];
      uniqueDayEndUsers.add(email);
    }

    if (dayEndProcessedUsers.size > 0) {
      console.log(`\n📋 Day-End Report Summary: ${dayEndReportResults.length} report(s) sent to ${uniqueDayEndUsers.size} unique user(s) for completed college/course combinations`);
    } else {
      console.log(`\n⏳ No day-end reports sent - no college/course combinations with all batches marked`);
    }

    // Combine report results
    const allReportResults = [...reportResults, ...dayEndReportResults];

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: {
        attendanceDate: normalizedDate,
        updatedCount,
        insertedCount,
        smsResults: notificationResults.map(r => ({
          ...r,
          success: r.smsSent || r.emailSent
        })),
        reportResults: allReportResults,
        dayEndReportResults
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Failed to mark attendance:', error);
    // Detect "holiday" enum missing - status column may not include 'holiday' yet
    const errMsg = (error.sqlMessage || error.message || '').toLowerCase();
    const isHolidayEnumError = errMsg.includes('status') && (
      errMsg.includes('truncated') ||
      errMsg.includes('invalid') ||
      errMsg.includes('enum') ||
      (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.errno === 1265)
    );
    const userMessage = isHolidayEnumError
      ? 'Database needs update to support "no class work" status. Please run: node backend/scripts/updateAttendanceStatusEnum.js (or restart the server to apply migrations)'
      : 'Server error while marking attendance';
    res.status(500).json({
      success: false,
      message: userMessage
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Manually send day-end reports to Principals and HODs
exports.sendDayEndReports = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    // Normalize date
    const normalizedDate = getDateOnlyString(date);

    if (!normalizedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    // Get sender information
    const sender = req.user || req.admin;
    if (!sender) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const senderName = sender.name || sender.username || 'System';
    const senderEmail = sender.email || '';

    console.log(`\n📧 Manual Day-End Report Request for ${normalizedDate}`);
    console.log(`   Sender: ${senderName} (${senderEmail})`);

    // Get all attendance data for the date
    const allAttendanceData = await getAllAttendanceForDate(normalizedDate);

    // Filter attendance data by sender's scope first
    let filteredAttendanceData = allAttendanceData;
    if (req.userScope && !req.userScope.unrestricted) {
      const { filterAttendanceByUserScope } = require('../services/getUserScopeAttendance');

      // Convert req.userScope to the format needed for filterAttendanceByUserScope
      const senderScope = {
        collegeNames: req.userScope.collegeNames || [],
        courseNames: req.userScope.courseNames || [],
        branchNames: req.userScope.branchNames || [],
        allCourses: req.userScope.allCourses || false,
        allBranches: req.userScope.allBranches || false,
        role: sender.role
      };

      filteredAttendanceData = filterAttendanceByUserScope(allAttendanceData, senderScope);
      console.log(`   📊 Filtered by sender scope: ${filteredAttendanceData.length}/${allAttendanceData.length} groups`);

      if (filteredAttendanceData.length === 0) {
        return res.json({
          success: true,
          message: 'No attendance data found in your scope',
          data: {
            attendanceDate: normalizedDate,
            reportResults: [],
            totalSent: 0,
            totalFailed: 0,
            totalRecipients: 0
          }
        });
      }
    }

    // Get all active Principals and HODs with their access scopes
    const { getAllNotificationUsers, filterAttendanceByUserScope } = require('../services/getUserScopeAttendance');
    const { principals, hods } = await getAllNotificationUsers();

    console.log(`📊 Manual Day-End Report Status for ${normalizedDate}:`);
    console.log(`   Total attendance groups (after sender scope filter): ${filteredAttendanceData.length}`);
    console.log(`   Total Principals: ${principals.length}`);
    console.log(`   Total HODs: ${hods.length}`);

    const reportResults = [];
    const processedUsers = new Set();

    // Group attendance data by college/course
    const groupsByCollegeCourse = new Map();
    for (const group of allAttendanceData) {
      const college = group.college || 'Unknown';
      const course = group.course || 'Unknown';
      const key = `${college}|${course}`;

      if (!groupsByCollegeCourse.has(key)) {
        groupsByCollegeCourse.set(key, {
          college,
          course,
          groups: []
        });
      }

      groupsByCollegeCourse.get(key).groups.push(group);
    }

    // Process each Principal with RBAC scope filtering
    for (const principal of principals) {
      console.log(`\n👤 Processing Principal: ${principal.name} (${principal.email})`);
      console.log(`   Scope: Colleges: ${principal.collegeNames.join(', ') || 'All'}, Courses: ${principal.allCourses ? 'All' : principal.courseNames.join(', ') || 'None'}, Branches: ${principal.allBranches ? 'All' : principal.branchNames.join(', ') || 'None'}`);

      // Filter attendance data by principal's scope (from already sender-filtered data)
      const filteredGroups = filterAttendanceByUserScope(filteredAttendanceData, principal);

      if (filteredGroups.length === 0) {
        console.log(`   ⚠️  No attendance data found in principal's scope`);
        continue;
      }

      console.log(`   📋 Found ${filteredGroups.length} group(s) in principal's scope`);

      // Group filtered groups by college for per-college reports
      const groupsByCollege = new Map();
      for (const group of filteredGroups) {
        const collegeKey = group.college || 'Unknown';
        if (!groupsByCollege.has(collegeKey)) {
          groupsByCollege.set(collegeKey, []);
        }
        groupsByCollege.get(collegeKey).push(group);
      }

      // Send separate report for each college in principal's scope
      for (const [collegeName, collegeGroups] of groupsByCollege) {
        // Combine all students and attendance records from all groups for this college
        const allStudents = [];
        const allAttendanceRecords = [];
        const allBatchesData = [];

        for (const group of collegeGroups) {
          allStudents.push(...group.students);
          allAttendanceRecords.push(...group.attendanceRecords);
          allBatchesData.push(group);
        }

        // Get actual courses from groups that have students (only courses with attendance data)
        const actualCourses = [...new Set(
          collegeGroups
            .filter(g => g.students && g.students.length > 0) // Only groups with students
            .map(g => g.course)
            .filter(c => c && c !== 'Unknown')
        )];
        const actualBranches = [...new Set(
          collegeGroups
            .filter(g => g.students && g.students.length > 0) // Only groups with students
            .map(g => g.branch)
            .filter(b => b && b !== 'Unknown')
        )];

        // Get college ID
        let collegeId = null;
        if (principal.collegeNames.includes(collegeName)) {
          const collegeIndex = principal.collegeNames.indexOf(collegeName);
          collegeId = principal.collegeIds[collegeIndex] || null;
        }

        // Determine report scope description based on actual courses in the data (sender's scope)
        // Don't include branches here - they will be added separately in email subject
        let scopeDescription;
        if (actualCourses.length === 0) {
          scopeDescription = 'All Courses';
        } else if (actualCourses.length === 1) {
          scopeDescription = actualCourses[0];
        } else if (actualCourses.length <= 5) {
          // Show courses if 5 or fewer
          scopeDescription = actualCourses.join(', ');
        } else {
          // Too many courses, show count
          scopeDescription = `${actualCourses.length} Courses`;
        }

        // Determine branch name from actual branches in the data
        let branchNameForReport;
        if (actualBranches.length === 0) {
          branchNameForReport = principal.allBranches ? 'All Branches' : (principal.branchNames.join(', ') || 'All Branches');
        } else if (actualBranches.length === 1) {
          branchNameForReport = actualBranches[0];
        } else if (actualBranches.length <= 5) {
          branchNameForReport = actualBranches.join(', ');
        } else {
          branchNameForReport = `${actualBranches.length} Branches`;
        }

        const reportKey = `${principal.email}|${collegeName}`;
        if (processedUsers.has(reportKey)) {
          continue;
        }

        try {
          const result = await sendAttendanceReportNotifications({
            collegeId,
            collegeName: collegeName,
            courseId: null, // Scope-based report
            courseName: scopeDescription,
            branchId: null, // Scope-based report
            branchName: branchNameForReport,
            batch: 'All Batches',
            year: 'All Years',
            semester: 'All Semesters',
            attendanceDate: normalizedDate,
            students: allStudents,
            attendanceRecords: allAttendanceRecords,
            allBatchesData: allBatchesData,
            recipientUser: principal, // Pass user info for personalized email
            senderName: senderName // Pass sender name
          });

          reportResults.push({
            user: principal.name,
            userEmail: principal.email,
            role: 'Principal',
            college: collegeName,
            course: scopeDescription,
            ...result
          });

          processedUsers.add(reportKey);
          console.log(`   📧 Day-end report sent to Principal: ${principal.name} (${principal.email}) for ${collegeName}`);
        } catch (error) {
          console.error(`   ❌ Error sending day-end report to Principal ${principal.name} for ${collegeName}:`, error);
          reportResults.push({
            user: principal.name,
            userEmail: principal.email,
            role: 'Principal',
            college: collegeName,
            course: scopeDescription,
            pdfGenerated: false,
            emailsSent: 0,
            emailsFailed: 0,
            errors: [error.message]
          });
        }
      }
    }

    // Process each HOD with RBAC scope filtering
    for (const hod of hods) {
      console.log(`\n👤 Processing HOD: ${hod.name} (${hod.email})`);
      console.log(`   Scope: Colleges: ${hod.collegeNames.join(', ') || 'All'}, Courses: ${hod.allCourses ? 'All' : hod.courseNames.join(', ') || 'None'}, Branches: ${hod.branchNames.join(', ') || 'None'}`);

      // Filter attendance data by HOD's scope (from already sender-filtered data)
      const filteredGroups = filterAttendanceByUserScope(filteredAttendanceData, hod);

      if (filteredGroups.length === 0) {
        console.log(`   ⚠️  No attendance data found in HOD's scope`);
        continue;
      }

      console.log(`   📋 Found ${filteredGroups.length} group(s) in HOD's scope`);

      // Combine all students and attendance records from all groups in HOD's scope
      const allStudents = [];
      const allAttendanceRecords = [];
      const allBatchesData = [];

      for (const group of filteredGroups) {
        allStudents.push(...group.students);
        allAttendanceRecords.push(...group.attendanceRecords);
        allBatchesData.push(group);
      }

      // Get actual courses from groups that have students (only courses with attendance data)
      const actualCourses = [...new Set(
        filteredGroups
          .filter(g => g.students && g.students.length > 0) // Only groups with students
          .map(g => g.course)
          .filter(c => c && c !== 'Unknown')
      )];
      const actualBranches = [...new Set(
        filteredGroups
          .filter(g => g.students && g.students.length > 0) // Only groups with students
          .map(g => g.branch)
          .filter(b => b && b !== 'Unknown')
      )];

      // Get IDs for recipient lookup
      let collegeId = null;
      let courseId = null;
      let branchId = null;

      if (hod.collegeIds.length > 0) {
        collegeId = hod.collegeIds[0];
      }

      if (!hod.allCourses && hod.courseIds.length > 0) {
        courseId = hod.courseIds[0];
      }

      if (!hod.allBranches && hod.branchIds.length > 0) {
        branchId = hod.branchIds[0];
      }

      // Get names for display - use actual courses and branches from filtered data (sender's scope)
      const collegeName = hod.collegeNames[0] || 'Unknown';
      let courseName;
      if (actualCourses.length === 0) {
        courseName = hod.allCourses ? 'All Courses' : (hod.courseNames[0] || 'Unknown');
      } else if (actualCourses.length === 1) {
        courseName = actualCourses[0];
      } else if (actualCourses.length <= 5) {
        courseName = actualCourses.join(', ');
      } else {
        courseName = `${actualCourses.length} Courses`;
      }

      // Determine branch name from actual branches in the data
      let branchName;
      if (actualBranches.length === 0) {
        branchName = hod.allBranches ? 'All Branches' : (hod.branchNames[0] || 'Unknown');
      } else if (actualBranches.length === 1) {
        branchName = actualBranches[0];
      } else if (actualBranches.length <= 5) {
        branchName = actualBranches.join(', ');
      } else {
        branchName = `${actualBranches.length} Branches`;
      }

      const reportKey = `${hod.email}|${collegeName}|${courseName}`;
      if (processedUsers.has(reportKey)) {
        continue;
      }

      try {
        const result = await sendAttendanceReportNotifications({
          collegeId,
          collegeName,
          courseId,
          courseName,
          branchId,
          branchName,
          batch: 'All Batches',
          year: 'All Years',
          semester: 'All Semesters',
          attendanceDate: normalizedDate,
          students: allStudents,
          attendanceRecords: allAttendanceRecords,
          allBatchesData: allBatchesData,
          recipientUser: hod, // Pass user info for personalized email
          senderName: senderName // Pass sender name
        });

        reportResults.push({
          user: hod.name,
          userEmail: hod.email,
          role: 'HOD',
          college: collegeName,
          course: courseName,
          ...result
        });

        processedUsers.add(reportKey);
        console.log(`   📧 Day-end report sent to HOD: ${hod.name} (${hod.email})`);
      } catch (error) {
        console.error(`   ❌ Error sending day-end report to HOD ${hod.name}:`, error);
        reportResults.push({
          user: hod.name,
          userEmail: hod.email,
          role: 'HOD',
          college: collegeName,
          course: courseName,
          pdfGenerated: false,
          emailsSent: 0,
          emailsFailed: 0,
          errors: [error.message]
        });
      }
    }

    // Log summary
    const totalSent = reportResults.filter(r => r.emailsSent > 0).length;
    const totalFailed = reportResults.filter(r => r.emailsFailed > 0).length;

    console.log(`\n📋 Manual Day-End Report Summary: ${totalSent} report(s) sent successfully, ${totalFailed} failed`);

    res.json({
      success: true,
      message: `Day-end reports sent to ${totalSent} recipient(s)`,
      data: {
        attendanceDate: normalizedDate,
        reportResults,
        totalSent,
        totalFailed,
        totalRecipients: processedUsers.size
      }
    });
  } catch (error) {
    console.error('Failed to send day-end reports:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending day-end reports'
    });
  }
};

// Retry SMS for a specific student
exports.retrySms = async (req, res) => {
  try {
    const { studentId, admissionNumber, attendanceDate, parentMobile } = req.body;

    if (!studentId && !admissionNumber) {
      return res.status(400).json({
        success: false,
        message: 'Student ID or admission number is required'
      });
    }

    // Get student details
    let query = 'SELECT * FROM students WHERE ';
    let params = [];

    if (studentId) {
      query += 'id = ?';
      params.push(studentId);
    } else {
      query += 'admission_number = ?';
      params.push(admissionNumber);
    }

    const [students] = await masterPool.query(query, params);

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = {
      ...students[0],
      student_data: parseStudentData(students[0].student_data)
    };

    // Resolve parent mobile
    const resolvedMobile = parentMobile ||
      student.parent_mobile1 ||
      student.parent_mobile2 ||
      student.student_data?.['Parent Mobile Number 1'] ||
      student.student_data?.['Parent Phone Number 1'] ||
      student.student_data?.['Parent Mobile Number'];

    if (!resolvedMobile) {
      return res.json({
        success: false,
        data: {
          studentId: student.id,
          success: false,
          skipped: true,
          reason: 'missing_parent_mobile'
        }
      });
    }

    console.log(`[SMS RETRY] Retrying notification for student ${student.admission_number}`);

    // Get notification settings
    let notificationSettings = null;
    try {
      notificationSettings = await getNotificationSetting('attendance_absent');
    } catch (error) {
      console.warn('Failed to load attendance notification settings:', error);
    }

    // Send SMS
    const normalizedDate = attendanceDate || getDateOnlyString();
    const result = await sendAbsenceNotification({
      student: {
        ...student,
        parent_mobile1: resolvedMobile
      },
      attendanceDate: normalizedDate,
      notificationSettings
    });

    // Send Web Notification
    createNotification({
      studentId: student.id,
      title: 'Attendance Alert',
      message: `You were marked absent for ${normalizedDate}.`,
      category: 'Attendance',
      type: 'WEB'
    }).catch(e => console.error('Web notification failed:', e));

    // Update SMS status in database if SMS was sent successfully
    if (result?.success) {
      try {
        await masterPool.query(
          `
            UPDATE attendance_records
            SET sms_sent = 1, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ? AND attendance_date = ?
          `,
          [student.id, normalizedDate]
        );
      } catch (updateError) {
        // If column doesn't exist, try to add it (graceful fallback)
        console.warn(`Could not update sms_sent for student ${student.id}:`, updateError.message);
      }
    }

    res.json({
      success: true,
      data: {
        studentId: student.id,
        ...result,
        sentTo: resolvedMobile
      }
    });

  } catch (error) {
    console.error('SMS retry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrying SMS'
    });
  }
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildDailySummary = (rows, totalStudents, options = {}) => {
  const summary = {
    present: 0,
    absent: 0,
    holiday: 0,
    marked: 0,
    pending: 0,
    totalStudents: totalStudents || 0,
    total: totalStudents || 0,
    percentage: 0,
    isHoliday: Boolean(options.isHoliday),
    holiday: options.holiday || null
  };

  rows.forEach((row) => {
    if (row.status === 'present') summary.present = row.count;
    if (row.status === 'absent') summary.absent = row.count;
    if (row.status === 'holiday') summary.holiday = row.count;
  });

  summary.marked = (summary.present || 0) + (summary.absent || 0) + (summary.holiday || 0);
  summary.pending = Math.max((summary.totalStudents || 0) - summary.marked, 0);

  const denominator = summary.totalStudents || summary.marked || 1;
  summary.percentage = Math.round(((summary.present || 0) / denominator) * 100);

  return summary;
};

const aggregateRowsByDate = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const dateKey = formatDateKey(new Date(row.attendance_date));
    const entry = grouped.get(dateKey) || { date: dateKey, present: 0, absent: 0, holiday: 0 };
    if (row.status === 'present') entry.present += row.count;
    if (row.status === 'absent') entry.absent += row.count;
    if (row.status === 'holiday') entry.holiday += row.count;
    grouped.set(dateKey, entry);
  });
  return Array.from(grouped.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
};

const ensureContinuousSeries = (rows, startDate, endDate, holidayInfo) => {
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  const map = new Map(rows.map((row) => [row.date, row]));
  const data = [];
  const holidayDates = holidayInfo?.dates || new Set();
  const holidayDetails = holidayInfo?.details || new Map();
  while (cursor <= end) {
    const key = formatDateKey(cursor);
    const row = map.get(key) || { date: key, present: 0, absent: 0 };
    const isHoliday = holidayDates.has(key);
    const details = holidayDetails.get(key) || null;
    data.push({
      date: key,
      present: row.present || 0,
      absent: row.absent || 0,
      total: (row.present || 0) + (row.absent || 0),
      isHoliday,
      holiday: details
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return data;
};

const parseOptionalInteger = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeTextFilter = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildStudentFilterConditions = (filters = {}, alias = 'students', options = {}) => {
  const prefix = alias ? `${alias}.` : '';
  const conditions = [];
  const params = [];

  const status = filters.studentStatus || filters.student_status;
  if (status) {
    conditions.push(`${prefix}student_status = ?`);
    params.push(status);
  }

  if (filters.college) {
    if (options.collegeJoinAlias) {
      conditions.push(`${options.collegeJoinAlias}.name = ?`);
    } else {
      conditions.push(`${prefix}college = ?`);
    }
    params.push(filters.college);
  }

  if (filters.batch) {
    conditions.push(`${prefix}batch = ?`);
    params.push(filters.batch);
  }

  if (filters.course) {
    conditions.push(`${prefix}course = ?`);
    params.push(filters.course);
  }



  if (filters.branch) {
    conditions.push(`${prefix}branch = ?`);
    params.push(filters.branch);
  }

  if (Number.isInteger(filters.year)) {
    conditions.push(`${prefix}current_year = ?`);
    params.push(filters.year);
  }

  if (Number.isInteger(filters.semester)) {
    conditions.push(`${prefix}current_semester = ?`);
    params.push(filters.semester);
  }

  return { conditions, params };
};

const buildWhereClause = (filters, alias, options = {}) => {
  const { conditions, params } = buildStudentFilterConditions(filters, alias, options);
  const clause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
  return { clause, params };
};

exports.getAttendanceSummary = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['attendance_config']
    );
    let excludedCourses = [];
    if (settings && settings.length > 0) {
      const config = JSON.parse(settings[0].value);
      if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
    }

    const referenceDate = safeDate(req.query.date) || new Date();
    const todayKey = formatDateKey(referenceDate);

    // Weekly should be current week Monday → Saturday (Mon–Sat).
    const weekStart = new Date(referenceDate);
    weekStart.setHours(0, 0, 0, 0);
    // getDay(): 0=Sun,1=Mon,...,6=Sat
    const dow = weekStart.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    weekStart.setDate(weekStart.getDate() + diffToMonday);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5); // Mon -> Sat
    weekEnd.setHours(23, 59, 59, 999);

    // Monthly should be current calendar month (1st → today).
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const filters = {
      batch: normalizeTextFilter(req.query.batch),
      course: normalizeTextFilter(req.query.course),
      branch: normalizeTextFilter(req.query.branch),
      year: parseOptionalInteger(req.query.year),
      semester: parseOptionalInteger(req.query.semester),
      studentStatus: 'Regular' // Day-end summary should only consider regular students
    };

    const { conditions, params } = buildStudentFilterConditions(filters, 's');

    if (excludedCourses.length > 0) {
      conditions.push(`s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`);
      params.push(...excludedCourses);
    }

    const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

    // Apply user scope filtering (uses s.college so compatible with students table without college_id)
    let scopeCondition = '';
    let scopeParams = [];
    if (req.userScope) {
      const { scopeCondition: scopeCond, params: scopeP } = getScopeConditionString(req.userScope, 's');
      if (scopeCond) {
        scopeCondition = ` AND ${scopeCond}`;
        scopeParams = scopeP;
      }
    }

    const [studentCountRows] = await masterPool.query(
      `SELECT COUNT(*) AS totalStudents FROM students s WHERE 1=1${whereClause}${scopeCondition}`,
      [...params, ...scopeParams]
    );
    const totalStudents = studentCountRows[0]?.totalStudents || 0;

    const dailyFilter = buildWhereClause(filters, 's');
    const [dailyRows] = await masterPool.query(
      `
        SELECT ar.status, COUNT(*) AS count
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        WHERE ar.attendance_date = ?${dailyFilter.clause}${scopeCondition}
        GROUP BY ar.status
      `,
      [todayKey, ...dailyFilter.params, ...scopeParams]
    );

    const windowFilter = buildWhereClause(filters, 's');
    const [weeklyRows] = await masterPool.query(
      `
        SELECT ar.attendance_date, ar.status, COUNT(*) AS count
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        WHERE ar.attendance_date BETWEEN ? AND ?${windowFilter.clause}${scopeCondition}
        GROUP BY attendance_date, status
        ORDER BY attendance_date ASC
      `,
      [formatDateKey(weekStart), todayKey, ...windowFilter.params, ...scopeParams]
    );

    const monthFilter = buildWhereClause(filters, 's');
    const [monthlyRows] = await masterPool.query(
      `
        SELECT ar.attendance_date, ar.status, COUNT(*) AS count
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        WHERE ar.attendance_date BETWEEN ? AND ?${monthFilter.clause}${scopeCondition}
        GROUP BY attendance_date, status
        ORDER BY attendance_date ASC
      `,
      [formatDateKey(monthStart), todayKey, ...monthFilter.params, ...scopeParams]
    );

    const [groupedRows] = await masterPool.query(
      `
        SELECT 
          s.college AS college,
          s.batch AS batch,
          s.course AS course,
          s.branch AS branch,
          s.current_year AS year,
          s.current_semester AS semester,
          COUNT(*) AS total_students,
          SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
          SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent,
          SUM(CASE WHEN ar.status = 'holiday' THEN 1 ELSE 0 END) AS holiday,
          GROUP_CONCAT(DISTINCT CASE WHEN ar.status = 'holiday' THEN ar.holiday_reason ELSE NULL END SEPARATOR ', ') AS holiday_reasons,
          DATE_FORMAT(MAX(ar.updated_at), '%Y-%m-%dT%H:%i:%s+05:30') AS last_updated
        FROM students s
        LEFT JOIN attendance_records ar 
          ON ar.student_id = s.id 
          AND ar.attendance_date = ?
        WHERE 1=1${whereClause}${scopeCondition}
        GROUP BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
        ORDER BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
      `,
      [todayKey, ...params, ...scopeParams]
    );




    let todayHolidayInfo = null;
    let weeklyHolidayInfo = { dates: new Set(), details: new Map() };
    let monthlyHolidayInfo = { dates: new Set(), details: new Map() };

    try {
      todayHolidayInfo = await getNonWorkingDayInfo(todayKey);
    } catch (error) {
      todayHolidayInfo = null;
      console.warn('Unable to determine holiday status for daily summary:', error.message || error);
    }

    try {
      // Include the full week window (Mon–Sat) so future weekdays can show holidays if applicable.
      weeklyHolidayInfo = await getNonWorkingDaysForRange(formatDateKey(weekStart), formatDateKey(weekEnd));
    } catch (error) {
      console.warn('Failed to resolve weekly holiday range:', error.message || error);
    }

    try {
      monthlyHolidayInfo = await getNonWorkingDaysForRange(formatDateKey(monthStart), todayKey);
    } catch (error) {
      console.warn('Failed to resolve monthly holiday range:', error.message || error);
    }

    const weeklyAggregated = aggregateRowsByDate(weeklyRows);
    const monthlyAggregated = aggregateRowsByDate(monthlyRows);

    const weeklySeries = ensureContinuousSeries(
      weeklyAggregated,
      weekStart,
      weekEnd,
      weeklyHolidayInfo
    );
    const monthlySeries = ensureContinuousSeries(
      monthlyAggregated,
      monthStart,
      referenceDate,
      monthlyHolidayInfo
    );

    const weeklyTotals = weeklySeries.reduce(
      (acc, entry) => {
        if (entry.isHoliday) {
          acc.holidays += 1;
          return acc;
        }
        acc.present += entry.present;
        acc.absent += entry.absent;
        return acc;
      },
      { present: 0, absent: 0, holidays: 0 }
    );
    weeklyTotals.total = weeklyTotals.present + weeklyTotals.absent;
    weeklyTotals.workingDays = weeklySeries.length - weeklyTotals.holidays;

    const monthlyTotals = monthlySeries.reduce(
      (acc, entry) => {
        if (entry.isHoliday) {
          acc.holidays += 1;
          return acc;
        }
        acc.present += entry.present;
        acc.absent += entry.absent;
        return acc;
      },
      { present: 0, absent: 0, holidays: 0 }
    );
    monthlyTotals.total = monthlyTotals.present + monthlyTotals.absent;
    monthlyTotals.workingDays = monthlySeries.length - monthlyTotals.holidays;

    res.json({
      success: true,
      data: {
        totalStudents,
        referenceDate: todayKey,
        filters: {
          batch: filters.batch,
          course: filters.course,
          branch: filters.branch,
          year: filters.year,
          semester: filters.semester
        },
        daily: {
          date: todayKey,
          ...buildDailySummary(dailyRows, totalStudents, {
            isHoliday: todayHolidayInfo?.isNonWorkingDay,
            holiday: todayHolidayInfo
          })
        },
        weekly: {
          startDate: formatDateKey(weekStart),
          endDate: formatDateKey(weekEnd),
          totals: weeklyTotals,
          series: weeklySeries,
          holidays: weeklySeries.filter((entry) => entry.isHoliday)
        },
        monthly: {
          startDate: formatDateKey(monthStart),
          endDate: todayKey,
          totals: monthlyTotals,
          series: monthlySeries,
          holidays: monthlySeries.filter((entry) => entry.isHoliday)
        },
        groupedSummary: groupedRows.map((row) => {
          const present = Number(row.present) || 0;
          const absent = Number(row.absent) || 0;
          const holiday = Number(row.holiday) || 0;
          const total = Number(row.total_students) || 0;
          const marked = present + absent + holiday;
          return {
            college: row.college || null,
            batch: row.batch || null,
            course: row.course || null,
            branch: row.branch || null,
            year: row.year || null,
            semester: row.semester || null,
            totalStudents: total,
            presentToday: present,
            absentToday: absent,
            holidayToday: holiday,
            holidayReasons: row.holiday_reasons || null,
            lastUpdated: row.last_updated || null,

            markedToday: marked,
            pendingToday: Math.max(0, total - marked)
          };
        })
      }
    });
  } catch (error) {
    console.error('Failed to fetch attendance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance summary'
    });
  }
};

const buildStudentSeries = (rows, startDate, endDate, holidayInfo) => {
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  const map = new Map(
    rows.map((row) => [formatDateKey(new Date(row.attendance_date)), row.status])
  );

  const series = [];
  const totals = { present: 0, absent: 0, unmarked: 0, holidays: 0 };
  const holidayDates = holidayInfo?.dates || new Set();
  const holidayDetails = holidayInfo?.details || new Map();

  while (cursor <= end) {
    const key = formatDateKey(cursor);
    const recordedStatus = map.get(key) || null;
    const isHoliday = holidayDates.has(key);
    const holiday = holidayDetails.get(key) || null;

    let status = recordedStatus || 'unmarked';

    if (isHoliday) {
      status = 'holiday';
      totals.holidays += 1;
    } else if (status === 'present') {
      totals.present += 1;
    } else if (status === 'absent') {
      totals.absent += 1;
    } else {
      totals.unmarked += 1;
    }

    series.push({ date: key, status, isHoliday, holiday });

    cursor.setDate(cursor.getDate() + 1);
  }

  return { series, totals };
};

exports.getStudentAttendanceHistory = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student id'
      });
    }

    const referenceDate = safeDate(req.query.date) || new Date();
    const todayKey = formatDateKey(referenceDate);

    let studentRows;
    try {
      [studentRows] = await masterPool.query(
        `SELECT s.id, s.student_name, s.pin_no, s.batch, s.course, s.branch, s.college, s.current_year, s.current_semester,
                col.id as college_id, cb.id as branch_id
         FROM students s
          LEFT JOIN colleges col ON s.college COLLATE utf8mb4_unicode_ci = col.name COLLATE utf8mb4_unicode_ci
          LEFT JOIN courses c ON s.course COLLATE utf8mb4_unicode_ci = c.name COLLATE utf8mb4_unicode_ci AND c.college_id = col.id
          LEFT JOIN course_branches cb ON s.branch COLLATE utf8mb4_unicode_ci = cb.name COLLATE utf8mb4_unicode_ci AND cb.course_id = c.id
         WHERE s.id = ?`,
        [studentId]
      );
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR' && (colErr.sqlMessage || '').includes('college')) {
        [studentRows] = await masterPool.query(
          'SELECT id, student_name, pin_no, batch, course, branch, current_year, current_semester FROM students WHERE id = ?',
          [studentId]
        );
      } else {
        throw colErr;
      }
    }

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = studentRows[0];
    let semesterStartDate = null;
    let semesterEndDate = null;
    let semesterInfo = null;
    let semesterSource = 'fallback';

    // Resolve semester start/end from Settings → Academic Calendar (semesters table)
    if (student.course && student.current_year != null && student.current_semester != null) {
      try {
        const collegeId = student.college_id;

        // Course: prefer course for this college when available
        let courseId = null;
        if (student.course) {
          const [courseRows] = await masterPool.query(
            collegeId
              ? 'SELECT id FROM courses WHERE name = ? AND college_id = ? AND is_active = 1 LIMIT 1'
              : 'SELECT id FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
            collegeId ? [student.course, collegeId] : [student.course]
          );
          if (courseRows.length > 0) courseId = courseRows[0].id;
        }

        // Branch
        let branchId = student.branch_id;

        if (courseId != null) {
          const semParams = [courseId, student.current_year, student.current_semester, todayKey, todayKey];
          let semWhere = 'course_id = ? AND year_of_study = ? AND semester_number = ? AND start_date <= ? AND end_date >= ?';
          if (collegeId != null) {
            semWhere = '(college_id = ? OR college_id IS NULL) AND ' + semWhere;
            semParams.unshift(collegeId);
          }

          const [semesterRows] = await masterPool.query(
            `SELECT start_date, end_date, academic_year_id, year_of_study, semester_number
             FROM semesters
             WHERE ${semWhere}
             ORDER BY college_id DESC, start_date DESC
             LIMIT 1`,
            semParams
          );

          if (semesterRows.length === 0) {
            const recentParams = [courseId, student.current_year, student.current_semester];
            let recentWhere = 'course_id = ? AND year_of_study = ? AND semester_number = ?';
            if (collegeId != null) {
              recentWhere = '(college_id = ? OR college_id IS NULL) AND ' + recentWhere;
              recentParams.unshift(collegeId);
            }
            const [recentSemesterRows] = await masterPool.query(
              `SELECT start_date, end_date, academic_year_id, year_of_study, semester_number
               FROM semesters
               WHERE ${recentWhere}
               ORDER BY college_id DESC, start_date DESC
               LIMIT 1`,
              recentParams
            );
            if (recentSemesterRows.length > 0) {
              semesterInfo = recentSemesterRows[0];
              semesterStartDate = new Date(semesterInfo.start_date);
              semesterEndDate = new Date(semesterInfo.end_date);
              semesterSource = 'academic_calendar';
            }
          } else {
            semesterInfo = semesterRows[0];
            semesterStartDate = new Date(semesterInfo.start_date);
            semesterEndDate = new Date(semesterInfo.end_date);
            semesterSource = 'academic_calendar';
          }
        }
      } catch (error) {
        console.warn('Failed to fetch semester dates from academic calendar:', error.message || error);
      }
    }

    // Compute weekStart = Monday of the current week
    // weekEnd = Saturday of the current week (Mon–Sat)
    // and monthStart = 1st day of the current calendar month
    let weekStart, weekEnd, monthStart;

    // Helper: Monday of the week containing `referenceDate`
    const getMondayOfWeek = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      // getDay() → 0=Sun,1=Mon,...,6=Sat; shift so Mon=0
      const dayOfWeek = d.getDay(); // 0=Sun
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diffToMonday);
      return d;
    };

    // Helper: 1st of the current calendar month
    const getFirstOfMonth = (date) => {
      const d = new Date(date);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    if (semesterStartDate && semesterEndDate) {
      // Weekly: Monday of current week, clamped to semester start
      weekStart = getMondayOfWeek(referenceDate);
      if (weekStart < semesterStartDate) {
        weekStart = new Date(semesterStartDate);
        weekStart.setHours(0, 0, 0, 0);
      }

      // Weekly end: Saturday of the same week, clamped to semester end
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 5); // Mon -> Sat
      weekEnd.setHours(23, 59, 59, 999);
      if (weekEnd > semesterEndDate) {
        weekEnd = new Date(semesterEndDate);
        weekEnd.setHours(23, 59, 59, 999);
      }

      // Monthly: 1st of current month, clamped to semester start
      monthStart = getFirstOfMonth(referenceDate);
      if (monthStart < semesterStartDate) {
        monthStart = new Date(semesterStartDate);
        monthStart.setHours(0, 0, 0, 0);
      }
    } else {
      // Fallback: same calendar-based logic without semester clamping
      weekStart = getMondayOfWeek(referenceDate);
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 5); // Mon -> Sat
      weekEnd.setHours(23, 59, 59, 999);
      monthStart = getFirstOfMonth(referenceDate);
    }

    // Determine the date range for fetching attendance.
    // We want to return every record the student has, regardless of semester
    // boundaries, so that past months behave exactly like the current one.
    //
    // Step 1: ask the database for the earliest attendance row for this student.
    let earliestDate = null;
    try {
      const [minRows] = await masterPool.query(
        'SELECT MIN(attendance_date) AS minDate FROM attendance_records WHERE student_id = ?',
        [studentId]
      );
      if (minRows && minRows[0] && minRows[0].minDate) {
        earliestDate = new Date(minRows[0].minDate);
        earliestDate.setHours(0, 0, 0, 0);
      }
    } catch (err) {
      console.warn('Could not fetch earliest attendance date:', err.message || err);
    }

    // Step 2: decide the query start.  Prefer the earliest record if available,
    // otherwise fall back to semester start or current window.
    let queryStartDate;
    if (earliestDate) {
      queryStartDate = new Date(earliestDate);
    } else if (semesterStartDate) {
      queryStartDate = new Date(semesterStartDate);
    } else {
      queryStartDate = monthStart < weekStart ? monthStart : weekStart;
    }

    // make sure we don't accidentally ask for dates after the semester start
    if (semesterStartDate && queryStartDate < semesterStartDate) {
      // even if earliestDate predates the semester, leaving it as-is is fine
      // because downstream logic will clamp weekly/monthly views to the
      // semester.  this check is mostly defensive.
      queryStartDate = new Date(semesterStartDate);
      queryStartDate.setHours(0, 0, 0, 0);
    }

    const [historyRows] = await masterPool.query(
      `
        SELECT attendance_date, status
        FROM attendance_records
        WHERE student_id = ?
          AND attendance_date BETWEEN ? AND ?
        ORDER BY attendance_date ASC
      `,
      [studentId, formatDateKey(queryStartDate), todayKey]
    );

    const weeklyRows = historyRows.filter((row) => {
      const rowDate = new Date(row.attendance_date);
      // Note: historyRows only goes up to "todayKey", so this will naturally exclude future dates.
      return rowDate >= weekStart && rowDate <= weekEnd;
    });

    const monthlyRows = historyRows.filter(
      (row) => {
        const rowDate = new Date(row.attendance_date);
        return rowDate >= monthStart && rowDate <= referenceDate;
      }
    );

    // Determine holiday range
    const holidayStartDate = monthStart < weekStart ? monthStart : weekStart;
    const holidayEndDate = weekEnd > referenceDate ? weekEnd : referenceDate;
    let holidayRangeInfo = { dates: new Set(), details: new Map() };
    try {
      holidayRangeInfo = await getNonWorkingDaysForRange(
        formatDateKey(holidayStartDate),
        formatDateKey(holidayEndDate)
      );
    } catch (error) {
      console.warn('Failed to fetch holiday range for student history:', error.message || error);
    }

    const weekly = buildStudentSeries(weeklyRows, weekStart, weekEnd, holidayRangeInfo);
    const monthly = buildStudentSeries(monthlyRows, monthStart, referenceDate, holidayRangeInfo);

    // Calculate attendance percentage based on semester dates
    let semesterAttendance = null;
    if (semesterStartDate && semesterEndDate) {
      const semesterRows = historyRows.filter(
        (row) => {
          const rowDate = new Date(row.attendance_date);
          return rowDate >= semesterStartDate && rowDate <= (semesterEndDate > referenceDate ? referenceDate : semesterEndDate);
        }
      );

      // Get holidays for semester range
      let semesterHolidayInfo = { dates: new Set(), details: new Map() };
      try {
        const semesterEndKey = semesterEndDate > referenceDate ? todayKey : formatDateKey(semesterEndDate);
        semesterHolidayInfo = await getNonWorkingDaysForRange(formatDateKey(semesterStartDate), semesterEndKey);
      } catch (error) {
        console.warn('Failed to fetch semester holiday range:', error.message || error);
      }

      const semesterSeries = buildStudentSeries(
        semesterRows,
        semesterStartDate,
        semesterEndDate > referenceDate ? referenceDate : semesterEndDate,
        semesterHolidayInfo
      );

      semesterAttendance = {
        startDate: formatDateKey(semesterStartDate),
        endDate: formatDateKey(semesterEndDate),
        totals: semesterSeries.totals,
        series: semesterSeries.series,
        holidays: semesterSeries.series.filter((entry) => entry.isHoliday),
        semesterSource: semesterSource
      };
    } else {
      // Fallback: No semester dates in Academic Calendar (Settings).
      // Previously we only pulled the last few weeks (current month or week),
      // which meant older months were invisible. Instead, determine the
      // earliest attendance record for this student and use that as the start
      // of the range so the portal can navigate to any month the student has
      // records for.
      let fallbackStart = monthStart < weekStart ? monthStart : weekStart;

      try {
        const [minRows] = await masterPool.query(
          'SELECT MIN(attendance_date) AS minDate FROM attendance_records WHERE student_id = ?',
          [studentId]
        );
        if (minRows && minRows[0] && minRows[0].minDate) {
          const minDate = new Date(minRows[0].minDate);
          minDate.setHours(0, 0, 0, 0);
          if (minDate < fallbackStart) {
            fallbackStart = minDate;
          }
        }
      } catch (err) {
        console.warn('Could not determine earliest attendance date:', err.message || err);
        // fall back to the prior behaviour if query fails
      }

      const fallbackEnd = referenceDate;
      const fallbackEndKey = formatDateKey(fallbackEnd);
      const fallbackStartKey = formatDateKey(fallbackStart);

      const fallbackRows = historyRows.filter((row) => {
        const rowDate = new Date(row.attendance_date);
        return rowDate >= fallbackStart && rowDate <= fallbackEnd;
      });

      let fallbackHolidayInfo = { dates: new Set(), details: new Map() };
      try {
        fallbackHolidayInfo = await getNonWorkingDaysForRange(fallbackStartKey, fallbackEndKey);
      } catch (error) {
        console.warn('Failed to fetch fallback holiday range:', error.message || error);
      }

      const fallbackSeries = buildStudentSeries(
        fallbackRows,
        fallbackStart,
        fallbackEnd,
        fallbackHolidayInfo
      );

      semesterAttendance = {
        startDate: fallbackStartKey,
        endDate: fallbackEndKey,
        totals: fallbackSeries.totals,
        series: fallbackSeries.series,
        holidays: fallbackSeries.series.filter((entry) => entry.isHoliday),
        isFallback: true,
        semesterSource: 'fallback'
      };
    }

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.student_name,
          pin: student.pin_no,
          batch: student.batch,
          course: student.course,
          branch: student.branch,
          currentYear: student.current_year,
          currentSemester: student.current_semester
        },
        weekly: {
          startDate: formatDateKey(weekStart),
          endDate: formatDateKey(weekEnd),
          totals: weekly.totals,
          series: weekly.series,
          holidays: weekly.series.filter((entry) => entry.isHoliday)
        },
        monthly: {
          startDate: formatDateKey(monthStart),
          endDate: todayKey,
          totals: monthly.totals,
          series: monthly.series,
          holidays: monthly.series.filter((entry) => entry.isHoliday)
        },
        semester: semesterAttendance
      }
    });
  } catch (error) {
    console.error('Failed to fetch student attendance history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching student attendance history'
    });
  }
};

const generateAggregatedReport = async (req, res, from, to, format, holidayInfo, publicHolidaysList, instituteHolidaysList) => {
  try {
    // First, get all students
    const [studentRows] = await masterPool.query(
      `
        SELECT
          s.id,
          s.batch,
          s.course,
          s.branch,
          s.current_year,
          s.current_semester
        FROM students s
        ORDER BY s.batch, s.course, s.branch, s.current_year, s.current_semester
      `
    );

    // Get all student IDs
    const studentIds = studentRows.map((row) => row.id);

    // Now get attendance records for these students in the date range
    let attendanceRows = [];
    if (studentIds.length > 0) {
      const [attendanceData] = await masterPool.query(
        `
          SELECT
            ar.student_id,
            ar.attendance_date,
            ar.status AS attendance_status
          FROM attendance_records ar
          WHERE ar.student_id IN (${studentIds.map(() => '?').join(',')})
            AND ar.attendance_date BETWEEN ? AND ?
          ORDER BY ar.student_id, ar.attendance_date
        `,
        [...studentIds, from, to]
      );
      attendanceRows = attendanceData;
    }

    // Initialize date set
    const dateSet = new Set();
    const cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
      dateSet.add(getDateOnlyString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Create a student map for quick lookup
    const studentMap = new Map(studentRows.map((row) => [row.id, row]));

    // Group by batch, course, branch, year, semester
    const groupMap = new Map();

    // First, initialize all groups with students
    studentRows.forEach((row) => {
      const batch = row.batch || 'N/A';
      const course = row.course || 'N/A';
      const branch = row.branch || 'N/A';
      const year = row.current_year || 0;
      const semester = row.current_semester || 0;

      const key = `${batch}|${course}|${branch}|${year}|${semester}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          batch,
          course,
          branch,
          year,
          semester,
          studentIds: new Set(),
          attendance: new Map() // date -> { present: count, absent: count }
        });
      }

      const group = groupMap.get(key);
      group.studentIds.add(row.id);
    });

    // Now process attendance records
    attendanceRows.forEach((row) => {
      // Find which group this student belongs to using the map
      const student = studentMap.get(row.student_id);
      if (!student) return;

      const batch = student.batch || 'N/A';
      const course = student.course || 'N/A';
      const branch = student.branch || 'N/A';
      const year = student.current_year || 0;
      const semester = student.current_semester || 0;

      const key = `${batch}|${course}|${branch}|${year}|${semester}`;
      const group = groupMap.get(key);

      if (group && row.attendance_date) {
        // Normalize date to ensure consistent format matching
        const normalizedDate = getDateOnlyString(row.attendance_date);
        if (normalizedDate) {
          if (!group.attendance.has(normalizedDate)) {
            group.attendance.set(normalizedDate, { present: 0, absent: 0 });
          }
          const dayStats = group.attendance.get(normalizedDate);
          if (row.attendance_status === 'present') {
            dayStats.present += 1;
          } else if (row.attendance_status === 'absent') {
            dayStats.absent += 1;
          }
        }
      }
    });

    // Calculate totals for each group
    const aggregatedData = Array.from(groupMap.values())
      .map((group) => {
        let totalPresent = 0;
        let totalAbsent = 0;
        let totalUnmarked = 0;

        dateSet.forEach((date) => {
          const isHoliday = holidayInfo.dates.has(date);
          if (!isHoliday) {
            const dayStats = group.attendance.get(date) || { present: 0, absent: 0 };
            totalPresent += dayStats.present;
            totalAbsent += dayStats.absent;
            const marked = dayStats.present + dayStats.absent;
            const totalStudents = group.studentIds.size;
            totalUnmarked += Math.max(0, totalStudents - marked);
          }
        });

        return {
          batch: group.batch,
          course: group.course,
          branch: group.branch,
          year: group.year,
          semester: group.semester,
          studentCount: group.studentIds.size,
          present: totalPresent,
          absent: totalAbsent,
          unmarked: totalUnmarked
        };
      })
      // Filter out rows with 0 students
      .filter((row) => row.studentCount > 0);

    // Sort aggregated data
    aggregatedData.sort((a, b) => {
      if (a.batch !== b.batch) return (a.batch || '').localeCompare(b.batch || '');
      if (a.course !== b.course) return (a.course || '').localeCompare(b.course || '');
      if (a.branch !== b.branch) return (a.branch || '').localeCompare(b.branch || '');
      if (a.year !== b.year) return a.year - b.year;
      return a.semester - b.semester;
    });

    const totalWorkingDays = dateSet.size - (holidayInfo.dates.size || 0);

    const reportData = {
      fromDate: from,
      toDate: to,
      aggregatedData,
      totalWorkingDays,
      publicHolidays: publicHolidaysList,
      instituteHolidays: instituteHolidaysList,
      totalHolidays: holidayInfo.dates.size || 0
    };

    // Normalize format: accept both 'excel' and 'xlsx' for Excel format
    let excelFormat = (format || 'json').toLowerCase();
    if (excelFormat === 'excel') {
      excelFormat = 'xlsx';
    }

    if (excelFormat === 'json') {
      return res.json({
        success: true,
        data: reportData
      });
    }

    if (excelFormat === 'xlsx') {
      const xlsx = require('xlsx');
      const workbook = xlsx.utils.book_new();

      // Calculate totals
      const totals = aggregatedData.reduce(
        (acc, row) => ({
          studentCount: acc.studentCount + row.studentCount,
          present: acc.present + row.present,
          absent: acc.absent + row.absent,
          unmarked: acc.unmarked + row.unmarked
        }),
        { studentCount: 0, present: 0, absent: 0, unmarked: 0 }
      );

      // Single sheet with all data
      const allRows = [];

      // Header section
      allRows.push(['Attendance Summary Report']);
      allRows.push(['']);
      allRows.push(['Report Period', `${from} to ${to}`]);
      allRows.push(['']);
      allRows.push(['Total Working Days', totalWorkingDays]);
      allRows.push(['Total No Class Work Days', reportData.totalHolidays]);
      allRows.push(['Total Public No Class Work Days', publicHolidaysList.length]);
      allRows.push(['Total Institute No Class Work Days', instituteHolidaysList.length]);
      allRows.push(['Total Groups', aggregatedData.length]);
      allRows.push(['Total Students', totals.studentCount]);
      allRows.push(['Total Present Records', totals.present]);
      allRows.push(['Total Absent Records', totals.absent]);
      allRows.push(['Total Unmarked Records', totals.unmarked]);
      allRows.push(['']);
      allRows.push(['']);

      // Attendance Summary Table
      const summaryHeader = [
        'Batch',
        'Course',
        'Branch',
        'Year',
        'Semester',
        'Student Count',
        'Total Present',
        'Total Absent',
        'Total Unmarked'
      ];
      allRows.push(summaryHeader);

      aggregatedData.forEach((row) => {
        allRows.push([
          row.batch,
          row.course,
          row.branch,
          row.year,
          row.semester,
          row.studentCount,
          row.present,
          row.absent,
          row.unmarked
        ]);
      });

      // Totals row
      allRows.push([
        'TOTAL',
        '',
        '',
        '',
        '',
        totals.studentCount,
        totals.present,
        totals.absent,
        totals.unmarked
      ]);

      allRows.push(['']);
      allRows.push(['']);

      // Holidays Section
      allRows.push(['No Class Work Days List']);
      allRows.push(['']);
      const holidaysHeader = ['Date', 'Month', 'Year', 'Reason', 'Type'];
      allRows.push(holidaysHeader);

      publicHolidaysList.forEach((holiday) => {
        allRows.push([
          holiday.date,
          holiday.month,
          holiday.year,
          holiday.name,
          'Public No Class Work'
        ]);
      });

      instituteHolidaysList.forEach((holiday) => {
        allRows.push([
          holiday.date,
          holiday.month,
          holiday.year,
          holiday.name,
          'Institute No Class Work'
        ]);
      });

      const mainSheet = xlsx.utils.aoa_to_sheet(allRows);
      xlsx.utils.book_append_sheet(workbook, mainSheet, 'Attendance Report');

      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance_summary_${from}_to_${to}.xlsx"`
      );
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    }

    // Default: return JSON
    return res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('Failed to generate aggregated report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating aggregated report'
    });
  }
};

exports.downloadAttendanceReport = async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      format,
      batch,
      course,
      branch,
      year,
      semester,
      student_status,
      studentStatus
    } = req.query;
    const statusFilter = student_status || studentStatus || null;
    // Normalize format: accept both 'excel' and 'xlsx' for Excel format
    let reportFormat = (format || 'xlsx').toLowerCase();
    if (reportFormat === 'excel') {
      reportFormat = 'xlsx';
    }

    if (reportFormat !== 'xlsx' && reportFormat !== 'json') {
      return res.status(400).json({
        success: false,
        message: 'Format must be either excel/xlsx or json'
      });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'From date and to date are required'
      });
    }

    const from = getDateOnlyString(fromDate);
    const to = getDateOnlyString(toDate);

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (new Date(from) > new Date(to)) {
      return res.status(400).json({
        success: false,
        message: 'From date must be before or equal to to date'
      });
    }

    // Check if all core filters are empty (all students selected)
    // We intentionally do NOT include statusFilter here so Regular-only can still use aggregated flow.
    const isAllStudents = !batch && !course && !branch && !year && !semester;

    // Get holiday info for the date range
    let holidayInfo = { dates: new Set(), details: new Map() };
    let publicHolidaysList = [];
    let instituteHolidaysList = [];

    try {
      holidayInfo = await getNonWorkingDaysForRange(from, to);

      // Get public holidays for the date range
      const fromYear = new Date(from).getFullYear();
      const toYear = new Date(to).getFullYear();
      const years = [];
      for (let y = fromYear; y <= toYear; y++) {
        years.push(y);
      }

      const allPublicHolidays = [];
      for (const year of years) {
        const { holidays } = await getPublicHolidaysForYear(year);
        allPublicHolidays.push(...(holidays || []));
      }

      publicHolidaysList = allPublicHolidays
        .filter((h) => h.date >= from && h.date <= to)
        .map((h) => ({
          date: h.date,
          name: h.localName || h.name,
          month: new Date(h.date).getMonth() + 1,
          year: new Date(h.date).getFullYear()
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Get institute holidays
      const customHolidays = await listCustomHolidays({ startDate: from, endDate: to });
      instituteHolidaysList = customHolidays.map((h) => ({
        date: h.date,
        name: h.title || 'Institute Holiday',
        month: new Date(h.date).getMonth() + 1,
        year: new Date(h.date).getFullYear()
      }));
    } catch (error) {
      console.warn('Failed to fetch holiday info for report:', error.message || error);
    }

    // If all students selected, generate aggregated summary report
    if (isAllStudents) {
      return await generateAggregatedReport(req, res, from, to, format, holidayInfo, publicHolidaysList, instituteHolidaysList);
    }

    // First, get all students matching filters (to include students with no attendance)
    // Fetch exclude settings
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for download report:', err);
    }

    let studentQuery = `
      SELECT
        s.id,
        s.admission_number,
        s.pin_no,
        s.student_name,
        s.batch,
        s.course,
        s.branch,
        s.current_year,
        s.current_semester,
        s.student_data
      FROM students s
      WHERE 1=1
    `;
    const studentParams = [];

    if (excludedCourses.length > 0) {
      studentQuery += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      studentParams.push(...excludedCourses);
    }

    if (excludedStudents.length > 0) {
      studentQuery += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      studentParams.push(...excludedStudents);
    }

    if (statusFilter) {
      studentQuery += ' AND s.student_status = ?';
      studentParams.push(statusFilter);
    }

    if (batch) {
      studentQuery += ' AND s.batch = ?';
      studentParams.push(batch);
    }

    if (course) {
      studentQuery += ' AND s.course = ?';
      studentParams.push(course);
    }

    if (branch) {
      studentQuery += ' AND s.branch = ?';
      studentParams.push(branch);
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        studentQuery += ' AND s.current_year = ?';
        studentParams.push(parsedYear);
      }
    }

    if (semester) {
      const parsedSemester = parseInt(semester, 10);
      if (!Number.isNaN(parsedSemester)) {
        studentQuery += ' AND s.current_semester = ?';
        studentParams.push(parsedSemester);
      }
    }

    // Get all students matching filters
    const [studentRows] = await masterPool.query(studentQuery, studentParams);

    // Now get attendance records for these students in the date range
    const studentIds = studentRows.map((row) => row.id);
    let attendanceRows = [];

    if (studentIds.length > 0) {
      let attendanceQuery = `
        SELECT
          ar.student_id,
          ar.attendance_date,
          ar.status AS attendance_status
        FROM attendance_records ar
        WHERE ar.student_id IN (${studentIds.map(() => '?').join(',')})
          AND ar.attendance_date BETWEEN ? AND ?
        ORDER BY ar.student_id, ar.attendance_date
      `;

      const attendanceParams = [...studentIds, from, to];
      [attendanceRows] = await masterPool.query(attendanceQuery, attendanceParams);
    }

    // Combine student data with attendance records
    const rows = studentRows.map((student) => {
      const studentAttendance = attendanceRows.filter((ar) => ar.student_id === student.id);
      if (studentAttendance.length === 0) {
        // Return student with null attendance
        return {
          ...student,
          attendance_date: null,
          attendance_status: null
        };
      }
      // Return one row per attendance record
      return studentAttendance.map((ar) => ({
        ...student,
        attendance_date: ar.attendance_date,
        attendance_status: ar.attendance_status
      }));
    }).flat();

    // holidayInfo is already fetched at the top of the function, reuse it

    // Organize data by student
    const studentMap = new Map();
    const dateSet = new Set();

    // Initialize date set
    const cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
      dateSet.add(getDateOnlyString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    rows.forEach((row) => {
      const studentId = row.id;
      if (!studentMap.has(studentId)) {
        const studentData = parseStudentData(row.student_data);
        studentMap.set(studentId, {
          id: studentId,
          admissionNumber: row.admission_number,
          pinNumber: row.pin_no || studentData['PIN Number'] || studentData['Pin Number'] || null,
          studentName: row.student_name || studentData['Student Name'] || studentData['student_name'] || 'Unknown',
          batch: row.batch || studentData.Batch || null,
          course: row.course || studentData.Course || studentData.course || null,
          branch: row.branch || studentData.Branch || studentData.branch || null,
          year: row.current_year || studentData['Current Academic Year'] || null,
          semester: row.current_semester || studentData['Current Semester'] || null,
          attendance: new Map()
        });
      }

      const student = studentMap.get(studentId);
      if (row.attendance_date) {
        // Normalize date to ensure consistent format matching
        const normalizedDate = getDateOnlyString(row.attendance_date);
        if (normalizedDate) {
          student.attendance.set(normalizedDate, row.attendance_status);
        }
      }
    });

    // Calculate statistics
    const students = Array.from(studentMap.values());
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalHolidays = 0;
    let totalUnmarked = 0;

    students.forEach((student) => {
      dateSet.forEach((date) => {
        const isHoliday = holidayInfo.dates.has(date);
        const status = student.attendance.get(date) || null;

        if (isHoliday) {
          totalHolidays += 1;
        } else if (status === 'present') {
          totalPresent += 1;
        } else if (status === 'absent') {
          totalAbsent += 1;
        } else {
          totalUnmarked += 1;
        }
      });
    });

    // Convert students Map to serializable format
    const studentsData = students.map((student) => ({
      ...student,
      attendance: Object.fromEntries(student.attendance)
    }));

    const reportData = {
      fromDate: from,
      toDate: to,
      students: studentsData,
      dates: Array.from(dateSet).sort(),
      statistics: {
        totalStudents: students.length,
        totalPresent,
        totalAbsent,
        totalHolidays,
        totalUnmarked,
        workingDays: dateSet.size - (holidayInfo.dates.size || 0)
      },
      holidayInfo: {
        dates: Array.from(holidayInfo.dates),
        details: Array.from(holidayInfo.details.entries()).map(([date, info]) => ({
          date,
          ...info
        }))
      },
      filters: {
        batch: batch || null,
        course: course || null,
        branch: branch || null,
        year: year || null,
        semester: semester || null
      }
    };

    // Normalize format: accept both 'excel' and 'xlsx' for Excel format
    let downloadFormat = (format || 'json').toLowerCase();
    if (downloadFormat === 'excel') {
      downloadFormat = 'xlsx';
    }

    if (downloadFormat === 'json') {
      return res.json({
        success: true,
        data: reportData
      });
    }

    // For Excel and PDF, we'll return JSON and let frontend handle generation
    // Or we can generate on backend - let's do backend for better control
    if (downloadFormat === 'xlsx') {
      const xlsx = require('xlsx');

      // Create workbook
      const workbook = xlsx.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['Attendance Report Summary'],
        [''],
        ['Report Period', `${from} to ${to}`],
        [''],
        ['Total Students', reportData.statistics.totalStudents],
        ['Total Present', reportData.statistics.totalPresent],
        ['Total Absent', reportData.statistics.totalAbsent],
        ['Total No Class Work Days', reportData.statistics.totalHolidays],
        ['Total Unmarked', reportData.statistics.totalUnmarked],
        ['Working Days', reportData.statistics.workingDays],
        [''],
        ['Filters Applied'],
        ['Batch', reportData.filters.batch || 'All'],
        ['Course', reportData.filters.course || 'All'],
        ['Branch', reportData.filters.branch || 'All'],
        ['Year', reportData.filters.year || 'All'],
        ['Semester', reportData.filters.semester || 'All']
      ];

      const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
      xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Detailed attendance sheet
      const headerRow = [
        'Admission Number',
        'PIN Number',
        'Student Name',
        'Batch',
        'Course',
        'Branch',
        'Year',
        'Semester',
        ...reportData.dates
      ];

      const attendanceRows = [headerRow];

      students.forEach((student) => {
        const row = [
          student.admissionNumber || '',
          student.pinNumber || '',
          student.studentName || '',
          student.batch || '',
          student.course || '',
          student.branch || '',
          student.year || '',
          student.semester || '',
          ...reportData.dates.map((date) => {
            const isHoliday = holidayInfo.dates.has(date);
            if (isHoliday) {
              return 'No Class Work';
            }
            const status = student.attendance.get(date);
            if (status === 'present') return 'Present';
            if (status === 'absent') return 'Absent';
            return 'Unmarked';
          })
        ];
        attendanceRows.push(row);
      });

      const attendanceSheet = xlsx.utils.aoa_to_sheet(attendanceRows);
      xlsx.utils.book_append_sheet(workbook, attendanceSheet, 'Attendance Details');

      // Generate buffer
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance_report_${from}_to_${to}.xlsx"`
      );
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    }

    // Default: return JSON
    return res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('Failed to generate attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating attendance report'
    });
  }
};

// Download day-end report in PDF or Excel format
exports.downloadDayEndReport = async (req, res) => {
  try {
    const {
      date,
      format,
      batch,
      course,
      branch,
      college,
      year,
      semester,
      student_status,
      studentStatus
    } = req.query;

    const statusFilter = student_status || studentStatus || 'Regular';
    const normalizedFormat = (format || 'xlsx').toLowerCase();
    const attendanceDate = getDateOnlyString(date || new Date());

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (normalizedFormat !== 'pdf' && normalizedFormat !== 'xlsx') {
      return res.status(400).json({
        success: false,
        message: 'Format must be either pdf or xlsx'
      });
    }

    // Fetch exclude settings
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for day-end report:', err);
    }

    const filters = {
      batch: normalizeTextFilter(batch),
      course: normalizeTextFilter(course),
      branch: normalizeTextFilter(branch),
      college: normalizeTextFilter(college),
      year: parseOptionalInteger(year),
      semester: parseOptionalInteger(semester),
      studentStatus: statusFilter
    };

    // Build filter conditions
    const countFilter = buildWhereClause(filters, 's');

    // Add exclusions to filter clause
    let exclusionClause = '';
    const exclusionParams = [];

    if (excludedCourses.length > 0) {
      exclusionClause += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      exclusionParams.push(...excludedCourses);
    }

    if (excludedStudents.length > 0) {
      exclusionClause += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      exclusionParams.push(...excludedStudents);
    }

    // Apply user scope filtering (uses s.college so compatible with students table without college_id)
    let scopeCondition = '';
    let scopeParams = [];
    if (req.userScope) {
      const { scopeCondition: scopeCond, params: scopeP } = getScopeConditionString(req.userScope, 's');
      if (scopeCond) {
        scopeCondition = ` AND ${scopeCond}`;
        scopeParams = scopeP;
      }
    }

    // Get grouped summary data (same query as getAttendanceSummary)
    const [groupedRows] = await masterPool.query(
      `
        SELECT 
          s.college AS college,
          s.batch AS batch,
          s.course AS course,
          s.branch AS branch,
          s.current_year AS year,
          s.current_semester AS semester,
          COUNT(*) AS total_students,
          SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
          SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent,
          SUM(CASE WHEN ar.status = 'holiday' THEN 1 ELSE 0 END) AS holiday,
          GROUP_CONCAT(DISTINCT CASE WHEN ar.status = 'holiday' THEN ar.holiday_reason ELSE NULL END SEPARATOR ', ') AS holiday_reasons,
          DATE_FORMAT(MAX(ar.updated_at), '%Y-%m-%dT%H:%i:%s+05:30') AS last_updated
        FROM students s
        LEFT JOIN attendance_records ar 
          ON ar.student_id = s.id 
          AND ar.attendance_date = ?
        WHERE 1=1${countFilter.clause}${exclusionClause}${scopeCondition}
        GROUP BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
        ORDER BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
      `,
      [attendanceDate, ...countFilter.params, ...exclusionParams, ...scopeParams]
    );

    // Transform grouped data to match frontend format
    const groupedData = groupedRows.map((row) => {
      const present = Number(row.present) || 0;
      const absent = Number(row.absent) || 0;
      const holiday = Number(row.holiday) || 0;
      const total = Number(row.total_students) || 0;
      const marked = present + absent + holiday;
      return {
        college: row.college || '—',
        batch: row.batch || '—',
        course: row.course || '—',
        branch: row.branch || '—',
        year: row.year || '—',
        semester: row.semester || '—',
        totalStudents: total,
        presentToday: present,
        absentToday: absent,
        holidayToday: holiday,
        markedToday: marked,
        pendingToday: Math.max(0, total - marked),
        lastUpdated: row.last_updated || null
      };
    });

    // Get total statistics
    const [countRows] = await masterPool.query(
      `SELECT COUNT(*) AS totalStudents FROM students s WHERE 1=1${countFilter.clause}${exclusionClause}${scopeCondition}`,
      [...countFilter.params, ...exclusionParams, ...scopeParams]
    );
    const totalStudents = countRows[0]?.totalStudents || 0;

    const [dailyRows] = await masterPool.query(
      `
        SELECT ar.status, COUNT(*) AS count
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        WHERE ar.attendance_date = ?${countFilter.clause}${exclusionClause}${scopeCondition}
        GROUP BY ar.status
      `,
      [attendanceDate, ...countFilter.params, ...exclusionParams, ...scopeParams]
    );

    const presentToday = Number(dailyRows.find(r => r.status === 'present')?.count || 0);
    const absentToday = Number(dailyRows.find(r => r.status === 'absent')?.count || 0);
    const holidayToday = Number(dailyRows.find(r => r.status === 'holiday')?.count || 0);
    const markedToday = presentToday + absentToday + holidayToday;
    const unmarkedToday = Math.max(0, totalStudents - markedToday);

    if (normalizedFormat === 'pdf') {
      // Use shared PDF service for consistent design with abstract
      const attendancePercentage = totalStudents > 0
        ? ((presentToday / totalStudents) * 100).toFixed(2) + '%'
        : '0.00%';

      const summaryStats = {
        totalStudents,
        markedCount: markedToday,
        unmarkedCount: unmarkedToday,
        presentCount: presentToday,
        absentCount: absentToday,
        attendancePercentage
      };

      try {
        const pdfPath = await generateAttendanceReportPDF({
          collegeName: college || 'All Colleges',
          attendanceDate,
          batch,
          courseName: course || 'All Courses',
          branchName: branch || 'All Branches',
          year,
          semester,
          students: [], // Not used when statsOnly is true
          attendanceRecords: [], // Not used when statsOnly is true
          allBatchesData: groupedData.map(d => ({
            ...d,
            total: d.totalStudents,
            present: d.presentToday,
            absent: d.absentToday
          })),
          summaryStats, // Pre-calculated stats
          statsOnly: true, // Do not list students
          excludeCourse: false // Include course column in table
        });

        const fileBuffer = require('fs').readFileSync(pdfPath);
        require('fs').unlinkSync(pdfPath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="day_end_report_${attendanceDate}.pdf"`);
        return res.send(fileBuffer);
      } catch (pdfError) {
        console.error('PDF Generation failed:', pdfError);
        return res.status(500).json({ success: false, message: 'PDF Generation failed' });
      }
    } else {
      // Generate Excel
      const XLSX = require('xlsx');

      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['Day End Attendance Report'],
        ['Date', attendanceDate],
        [''],
        ['Summary'],
        ['Total Students', totalStudents],
        ['Marked Today', markedToday],
        ['Present', presentToday],
        ['Absent', absentToday],
        ['No Class Work', holidayToday],
        ['Unmarked', unmarkedToday],
        [''],
        ['Filters'],
        ...(filters.batch ? [['Batch', filters.batch]] : []),
        ...(filters.course ? [['Course', filters.course]] : []),
        ...(filters.branch ? [['Branch', filters.branch]] : []),
        ...(filters.year ? [['Year', filters.year]] : []),
        ...(filters.semester ? [['Semester', filters.semester]] : [])
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Grouped data sheet
      const tableData = [
        ['College', 'Batch', 'Course', 'Branch', 'Year', 'Semester', 'Students', 'Present', 'Absent', 'Marked', 'Pending', 'No Class Work', 'Time Stamp'],
        ...groupedData.map(row => [
          row.college, row.batch, row.course, row.branch,
          row.year, row.semester,
          row.totalStudents, row.presentToday, row.absentToday,
          row.markedToday, row.pendingToday, row.holidayToday,
          row.lastUpdated ? new Date(row.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—'
        ])
      ];
      const tableSheet = XLSX.utils.aoa_to_sheet(tableData);

      // Set column widths
      tableSheet['!cols'] = [
        { wch: 15 }, // College
        { wch: 12 }, // Batch
        { wch: 20 }, // Course
        { wch: 15 }, // Branch
        { wch: 8 },  // Year
        { wch: 8 },  // Semester
        { wch: 10 }, // Students
        { wch: 10 }, // Present
        { wch: 10 }, // Absent
        { wch: 10 }, // Marked
        { wch: 10 }, // Pending
        { wch: 12 }, // No Class Work
        { wch: 15 }  // Time Stamp
      ];

      XLSX.utils.book_append_sheet(workbook, tableSheet, 'Grouped Summary');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="day_end_report_${attendanceDate}.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    console.error('Failed to download day-end report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating day-end report'
    });
  }
};

// Wrapper for logged-in student to get their own history
exports.getStudentAttendance = async (req, res) => {
  // Ensure user is authorized as student (or has ID)
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  // Inject ID into params for the shared function
  req.params.studentId = req.user.id;
  return exports.getStudentAttendanceHistory(req, res);
};

// Get attendance report for selected students with percentage calculation
// Get Attendance Abstract (Grouped by batch, college, branch, year, semester)
exports.getAttendanceAbstract = async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      batch,
      course,
      branch,
      year,
      semester,
      college,
      level
    } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'From date and to date are required'
      });
    }

    const from = getDateOnlyString(fromDate);
    const to = getDateOnlyString(toDate);

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (new Date(from) > new Date(to)) {
      return res.status(400).json({
        success: false,
        message: 'From date must be before or equal to to date'
      });
    }

    // Get holiday info for the date range
    const holidayInfo = await getHolidayInfoForRange(from, to);

    // Calculate working days (total days minus holidays)
    const startDate = new Date(from);
    const endDate = new Date(to);
    let totalDays = 0;
    const holidayDates = holidayInfo.dates || new Set();

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, '0'),
        String(currentDate.getDate()).padStart(2, '0')
      ].join('-');

      if (!holidayDates.has(dateStr)) {
        totalDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const workingDays = totalDays;

    // Fetch attendance configuration to exclude courses
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for abstract:', err);
    }

    // Build student query: try college_id + JOIN first; fallback to s.college if column missing
    const buildAbstractStudentQuery = (useCollegeId) => {
      if (useCollegeId) {
        let q = `
      SELECT
        s.id,
        c.name AS college,
        s.batch,
        s.course,
        s.branch,
        s.current_year,
        s.current_semester
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      WHERE s.student_status = 'Regular'
    `;
        const p = [];
        if (excludedCourses.length > 0) {
          q += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
          p.push(...excludedCourses);
        }
        if (excludedStudents.length > 0) {
          q += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
          p.push(...excludedStudents);
        }
        if (req.userScope && !req.userScope.unrestricted) {
          if (req.userScope.collegeNames && req.userScope.collegeNames.length > 0) {
            const ph = req.userScope.collegeNames.map(() => '?').join(',');
            q += ` AND s.college_id IN (SELECT id FROM colleges WHERE name IN (${ph}))`;
            p.push(...req.userScope.collegeNames);
          } else if (req.userScope.collegeIds && req.userScope.collegeIds.length > 0) {
            const ph = req.userScope.collegeIds.map(() => '?').join(',');
            q += ` AND s.college_id IN (${ph})`;
            p.push(...req.userScope.collegeIds);
          }
        }
        if (college) { q += ' AND c.name = ?'; p.push(college); }
        return { query: q, params: p };
      } else {
        let q = `
      SELECT
        s.id,
        s.college,
        s.batch,
        s.course,
        s.branch,
        s.current_year,
        s.current_semester
      FROM students s
      WHERE s.student_status = 'Regular'
    `;
        const p = [];
        if (excludedCourses.length > 0) {
          q += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
          p.push(...excludedCourses);
        }
        if (excludedStudents.length > 0) {
          q += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
          p.push(...excludedStudents);
        }
        if (req.userScope) {
          const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
          if (scopeCondition) { q += ` AND ${scopeCondition}`; p.push(...scopeParams); }
        }
        if (college) { q += ' AND s.college = ?'; p.push(college); }
        return { query: q, params: p };
      }
    };

    let studentQuery = buildAbstractStudentQuery(true).query;
    let studentParams = buildAbstractStudentQuery(true).params;

    if (batch) {
      studentQuery += ' AND s.batch = ?';
      studentParams.push(batch);
    }
    if (course) {
      studentQuery += ' AND s.course = ?';
      studentParams.push(course);
    }
    if (branch) {
      studentQuery += ' AND s.branch = ?';
      studentParams.push(branch);
    }
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        studentQuery += ' AND s.current_year = ?';
        studentParams.push(parsedYear);
      }
    }
    if (semester) {
      const parsedSemester = parseInt(semester, 10);
      if (!Number.isNaN(parsedSemester)) {
        studentQuery += ' AND s.current_semester = ?';
        studentParams.push(parsedSemester);
      }
    }

    // Apply level filter - filter by courses with the specified level
    if (level) {
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      const validCourseNames = levelCourses.map(c => c.name);
      if (validCourseNames.length > 0) {
        const placeholders = validCourseNames.map(() => '?').join(',');
        studentQuery += ` AND s.course IN (${placeholders})`;
        studentParams.push(...validCourseNames);
      } else {
        // No courses with this level, return empty result
        studentQuery += ' AND 1=0';
      }
    }

    // Get all students matching filters (retry with legacy s.college if college_id column missing)
    let studentRows;
    try {
      [studentRows] = await masterPool.query(studentQuery, studentParams);
    } catch (queryErr) {
      const isColumnError = queryErr.code === 'ER_BAD_FIELD_ERROR' && (queryErr.sqlMessage || '').toLowerCase().includes('college');
      if (isColumnError) {
        const legacy = buildAbstractStudentQuery(false);
        studentQuery = legacy.query;
        studentParams = [...legacy.params];
        if (batch) { studentQuery += ' AND s.batch = ?'; studentParams.push(batch); }
        if (course) { studentQuery += ' AND s.course = ?'; studentParams.push(course); }
        if (branch) { studentQuery += ' AND s.branch = ?'; studentParams.push(branch); }
        if (year) {
          const parsedYear = parseInt(year, 10);
          if (!Number.isNaN(parsedYear)) { studentQuery += ' AND s.current_year = ?'; studentParams.push(parsedYear); }
        }
        if (semester) {
          const parsedSemester = parseInt(semester, 10);
          if (!Number.isNaN(parsedSemester)) { studentQuery += ' AND s.current_semester = ?'; studentParams.push(parsedSemester); }
        }
        if (level) {
          const [levelCourses] = await masterPool.query('SELECT name FROM courses WHERE level = ? AND is_active = 1', [level]);
          const validCourseNames = (levelCourses || []).map(c => c.name);
          if (validCourseNames.length > 0) {
            studentQuery += ` AND s.course IN (${validCourseNames.map(() => '?').join(',')})`;
            studentParams.push(...validCourseNames);
          } else {
            studentQuery += ' AND 1=0';
          }
        }
        [studentRows] = await masterPool.query(studentQuery, studentParams);
      } else {
        throw queryErr;
      }
    }

    if (studentRows.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    const studentIdsList = studentRows.map(row => row.id);

    // Get attendance records for all students in date range
    let attendanceRows = [];
    if (studentIdsList.length > 0) {
      const attendanceQuery = `
        SELECT
          ar.student_id,
          ar.attendance_date,
          ar.status AS attendance_status
        FROM attendance_records ar
        WHERE ar.student_id IN (${studentIdsList.map(() => '?').join(',')})
          AND ar.attendance_date BETWEEN ? AND ?
        ORDER BY ar.student_id, ar.attendance_date
      `;
      const attendanceParams = [...studentIdsList, from, to];
      [attendanceRows] = await masterPool.query(attendanceQuery, attendanceParams);
    }

    // Group students by batch, college, branch, year, semester
    const groupedData = new Map();

    studentRows.forEach(student => {
      const key = `${student.college || 'N/A'}|${student.batch || 'N/A'}|${student.branch || 'N/A'}|${student.current_year || 'N/A'}|${student.current_semester || 'N/A'}`;

      if (!groupedData.has(key)) {
        groupedData.set(key, {
          college: student.college || 'N/A',
          batch: student.batch || 'N/A',
          branch: student.branch || 'N/A',
          year: student.current_year || 'N/A',
          semester: student.current_semester || 'N/A',
          studentIds: [],
          totalStudents: 0
        });
      }

      const group = groupedData.get(key);
      group.studentIds.push(student.id);
      group.totalStudents++;
    });

    // Calculate attendance statistics for each group
    const abstractData = [];

    for (const [key, group] of groupedData.entries()) {
      const groupStudentIds = new Set(group.studentIds);
      const groupAttendance = attendanceRows.filter(ar => groupStudentIds.has(ar.student_id));

      // Calculate present and absent days per student
      const studentAttendanceMap = new Map();

      groupAttendance.forEach(att => {
        if (!studentAttendanceMap.has(att.student_id)) {
          studentAttendanceMap.set(att.student_id, { present: 0, absent: 0 });
        }
        const studentAtt = studentAttendanceMap.get(att.student_id);
        if (att.attendance_status === 'present') {
          studentAtt.present++;
        } else if (att.attendance_status === 'absent') {
          studentAtt.absent++;
        }
      });

      // Calculate totals
      let totalPresentDays = 0;
      let totalAbsentDays = 0;
      let totalMarkedDays = 0;

      studentAttendanceMap.forEach((att, studentId) => {
        totalPresentDays += att.present;
        totalAbsentDays += att.absent;
        totalMarkedDays += (att.present + att.absent);
      });

      // Calculate percentages based on actual attendance vs working days
      // For each student, calculate their attendance percentage, then average
      let totalAttendancePercentage = 0;
      let studentCountWithAttendance = 0;

      studentAttendanceMap.forEach((att, studentId) => {
        const studentTotalDays = att.present + att.absent;
        if (studentTotalDays > 0 && workingDays > 0) {
          const studentAttendancePct = (att.present / studentTotalDays) * 100;
          totalAttendancePercentage += studentAttendancePct;
          studentCountWithAttendance++;
        }
      });

      const avgAttendancePercentage = studentCountWithAttendance > 0
        ? totalAttendancePercentage / studentCountWithAttendance
        : 0;

      // Calculate present and absent percentages based on total marked days
      const presentPercentage = totalMarkedDays > 0
        ? ((totalPresentDays / totalMarkedDays) * 100)
        : 0;
      const absentPercentage = totalMarkedDays > 0
        ? ((totalAbsentDays / totalMarkedDays) * 100)
        : 0;

      abstractData.push({
        college: group.college,
        batch: group.batch,
        branch: group.branch,
        year: group.year,
        semester: group.semester,
        totalStudents: group.totalStudents,
        workingDays: workingDays,
        totalPresentDays: totalPresentDays,
        totalAbsentDays: totalAbsentDays,
        totalMarkedDays: totalMarkedDays,
        attendancePercentage: parseFloat(avgAttendancePercentage.toFixed(2)),
        presentPercentage: parseFloat(presentPercentage.toFixed(2)),
        absentPercentage: parseFloat(absentPercentage.toFixed(2))
      });
    }

    // Sort by college, batch, branch, year, semester
    abstractData.sort((a, b) => {
      if (a.college !== b.college) return (a.college || '').localeCompare(b.college || '');
      if (a.batch !== b.batch) return (a.batch || '').localeCompare(b.batch || '');
      if (a.branch !== b.branch) return (a.branch || '').localeCompare(b.branch || '');
      if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
      return (a.semester || 0) - (b.semester || 0);
    });

    return res.json({
      success: true,
      data: abstractData
    });
  } catch (error) {
    console.error('Failed to get attendance abstract:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance abstract'
    });
  }
};

exports.getAttendanceReportForStudents = async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      studentIds, // Comma-separated student IDs
      batch,
      course,
      branch,
      year,
      semester,
      college,
      level
    } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'From date and to date are required'
      });
    }

    const from = getDateOnlyString(fromDate);
    const to = getDateOnlyString(toDate);

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (new Date(from) > new Date(to)) {
      return res.status(400).json({
        success: false,
        message: 'From date must be before or equal to to date'
      });
    }

    // Get holiday info for the date range
    const holidayInfo = await getHolidayInfoForRange(from, to);

    // Fetch attendance configuration to exclude courses
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for report:', err);
    }

    // Build student query (uses s.college so compatible with students table without college_id)
    let studentQuery = `
      SELECT
        s.id,
        s.admission_number,
        s.pin_no,
        s.student_name,
        s.batch,
        s.course,
        s.branch,
        s.current_year,
        s.current_semester,
        s.college,
        s.student_data
      FROM students s
      WHERE s.student_status = 'Regular'
    `;
    const studentParams = [];

    // Apply excluded courses
    if (excludedCourses.length > 0) {
      studentQuery += ` AND s.course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      studentParams.push(...excludedCourses);
    }

    // Apply excluded students
    if (excludedStudents.length > 0) {
      studentQuery += ` AND s.admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      studentParams.push(...excludedStudents);
    }

    // Apply user scope
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        studentQuery += ` AND ${scopeCondition}`;
        studentParams.push(...scopeParams);
      }
    }

    // If specific student IDs provided, filter by them
    if (studentIds) {
      const ids = studentIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !Number.isNaN(id));
      if (ids.length > 0) {
        studentQuery += ` AND s.id IN (${ids.map(() => '?').join(',')})`;
        studentParams.push(...ids);
      }
    }

    // Apply filters
    if (college) {
      studentQuery += ' AND s.college = ?';
      studentParams.push(college);
    }
    if (batch) {
      studentQuery += ' AND s.batch = ?';
      studentParams.push(batch);
    }
    if (course) {
      studentQuery += ' AND s.course = ?';
      studentParams.push(course);
    }
    if (branch) {
      studentQuery += ' AND s.branch = ?';
      studentParams.push(branch);
    }
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        studentQuery += ' AND s.current_year = ?';
        studentParams.push(parsedYear);
      }
    }
    if (semester) {
      const parsedSemester = parseInt(semester, 10);
      if (!Number.isNaN(parsedSemester)) {
        studentQuery += ' AND s.current_semester = ?';
        studentParams.push(parsedSemester);
      }
    }

    // Apply level filter - filter by courses with the specified level
    if (level) {
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      const validCourseNames = levelCourses.map(c => c.name);
      if (validCourseNames.length > 0) {
        const placeholders = validCourseNames.map(() => '?').join(',');
        studentQuery += ` AND s.course IN (${placeholders})`;
        studentParams.push(...validCourseNames);
      } else {
        // No courses with this level, return empty result
        studentQuery += ' AND 1=0';
      }
    }

    // Get students
    const [studentRows] = await masterPool.query(studentQuery, studentParams);

    if (studentRows.length === 0) {
      return res.json({
        success: true,
        data: {
          fromDate: from,
          toDate: to,
          students: [],
          dates: [],
          statistics: {
            totalStudents: 0,
            totalWorkingDays: 0,
            totalPresentDays: 0,
            totalAbsentDays: 0,
            presentStudentsPercentage: 0.00,
            absentStudentsPercentage: 0.00,
            overallAttendancePercentage: 0.00
          },
          holidayInfo: {
            dates: [],
            details: []
          }
        }
      });
    }

    const studentIdsList = studentRows.map(row => row.id);

    // Get attendance records
    let attendanceRows = [];
    if (studentIdsList.length > 0) {
      const attendanceQuery = `
        SELECT
          ar.student_id,
          ar.attendance_date,
          ar.status AS attendance_status
        FROM attendance_records ar
        WHERE ar.student_id IN (${studentIdsList.map(() => '?').join(',')})
          AND ar.attendance_date BETWEEN ? AND ?
        ORDER BY ar.student_id, ar.attendance_date
      `;
      const attendanceParams = [...studentIdsList, from, to];
      [attendanceRows] = await masterPool.query(attendanceQuery, attendanceParams);
    }

    // Process attendance data using the service
    const processedData = await processAttendanceData(
      studentRows,
      attendanceRows,
      from,
      to,
      holidayInfo,
      parseStudentData
    );

    const { students, dates, statistics } = processedData;

    return res.json({
      success: true,
      data: {
        fromDate: from,
        toDate: to,
        students,
        dates,
        statistics,
        holidayInfo: {
          dates: Array.from(holidayInfo.dates),
          details: Array.from(holidayInfo.details.entries()).map(([date, info]) => ({
            date,
            ...info
          }))
        }
      }
    });
  } catch (error) {
    console.error('Failed to get attendance report for students:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance report'
    });
  }
};

const { masterPool } = require('../config/database');
const { appendSemesterCalendarFilter } = require('./semesterCalendarService');
const { appendAttendanceJoinDateClause } = require('../utils/studentAttendanceEligibility');

// Exclude the same courses as in attendance page (must match frontend EXCLUDED_COURSES)
const EXCLUDED_COURSES = ['M.Tech', 'MBA', 'MCA', 'M Sc Aqua', 'MSC Aqua', 'MCS', 'M.Pharma', 'M Pharma'];

/**
 * Get all attendance data for a specific date, grouped by batch/course/branch/year/semester
 * This is used to check if all batches are marked and to generate comprehensive reports
 */
const getAllAttendanceForDate = async (attendanceDate) => {
  try {
    // Build query with course exclusions
    let query = `
      SELECT
        s.id,
        s.admission_number,
        s.student_name,
        s.pin_no,
        s.student_mobile,
        s.parent_mobile1,
        s.parent_mobile2,
        s.batch,
        s.course,
        s.branch,
        s.current_year,
        s.current_semester,
        s.college,
        s.student_data,
        s.student_status,
        ar.status AS attendance_status
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      LEFT JOIN attendance_records ar
        ON ar.student_id = s.id
       AND ar.attendance_date = ?
      WHERE s.student_status = 'Regular'
      -- EXCLUDE students with active INTERNSHIP assignments for this specific date (respecting allowed_days)
      AND NOT EXISTS (
        SELECT 1 FROM internship_assignments ia 
        WHERE ia.student_id = s.id 
        AND ? BETWEEN ia.start_date AND ia.end_date
        AND JSON_CONTAINS(ia.allowed_days, JSON_QUOTE(DATE_FORMAT(?, '%a')))
      )
    `;
    
    const params = [attendanceDate, attendanceDate, attendanceDate];
    
    // Exclude certain courses (same as attendance page)
    if (EXCLUDED_COURSES.length > 0) {
      query += ` AND s.course NOT IN (${EXCLUDED_COURSES.map(() => '?').join(',')})`;
      params.push(...EXCLUDED_COURSES);
    }

    // Exclude students outside configured semester dates (same as attendance page)
    query = appendSemesterCalendarFilter(query, params, attendanceDate);
    const { sql: joinDateSql, params: joinDateParams } = appendAttendanceJoinDateClause(attendanceDate, 's');
    query += joinDateSql;
    params.push(...joinDateParams);
    
    query += ` ORDER BY s.college, s.course, s.batch, s.branch, s.current_year, s.current_semester, s.student_name`;
    
    // Get all students with their attendance for the date
    const [rows] = await masterPool.query(query, params);

    // Group by College → Course → Batch → Branch → Year → Semester
    const groups = new Map();

    for (const row of rows) {
      const studentData = typeof row.student_data === 'string' 
        ? JSON.parse(row.student_data || '{}') 
        : (row.student_data || {});

      const college = row.college || studentData['College'] || studentData['college'] || 'Unknown';
      const course = row.course || studentData['Course'] || studentData['course'] || 'Unknown';
      const branch = row.branch || studentData['Branch'] || studentData['branch'] || 'Unknown';
      const batch = row.batch || studentData['Batch'] || studentData['batch'] || 'Unknown';
      const year = row.current_year || studentData['Current Academic Year'] || 'Unknown';
      const semester = row.current_semester || studentData['Current Semester'] || 'Unknown';

      const groupKey = `${college}|${course}|${batch}|${branch}|${year}|${semester}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          college,
          course,
          batch,
          branch,
          year,
          semester,
          students: [],
          attendanceRecords: []
        });
      }

      const group = groups.get(groupKey);
      group.students.push({
        id: row.id,
        admission_number: row.admission_number,
        student_name: row.student_name,
        pin_no: row.pin_no,
        student_mobile: row.student_mobile,
        parent_mobile1: row.parent_mobile1,
        parent_mobile2: row.parent_mobile2,
        student_data: studentData,
        student_status: row.student_status
      });

      if (row.attendance_status) {
        group.attendanceRecords.push({
          studentId: row.id,
          status: row.attendance_status
        });
      }
    }

    const FINALIZED_STATUSES = new Set(['present', 'absent', 'holiday']);

    // Convert to array and calculate statistics
    const result = Array.from(groups.values()).map(group => {
      const totalStudents = group.students.length;
      const finalizedRecords = group.attendanceRecords.filter((r) => FINALIZED_STATUSES.has(r.status));
      const markedCount = finalizedRecords.length;
      const presentCount = finalizedRecords.filter(r => r.status === 'present').length;
      const absentCount = finalizedRecords.filter(r => r.status === 'absent').length;
      const pendingCount = group.attendanceRecords.filter(r => r.status === 'pending').length;
      const unmarkedCount = Math.max(0, totalStudents - markedCount);
      const attendancePercentage = totalStudents > 0 
        ? ((presentCount / totalStudents) * 100).toFixed(2) 
        : '0.00';

      return {
        ...group,
        statistics: {
          totalStudents,
          markedCount,
          unmarkedCount,
          pendingCount,
          presentCount,
          absentCount,
          attendancePercentage: parseFloat(attendancePercentage)
        },
        isFullyMarked: unmarkedCount === 0 && totalStudents > 0
      };
    });

    return result;
  } catch (error) {
    console.error('Error getting all attendance for date:', error);
    throw error;
  }
};

/**
 * Check if all batches are marked for a specific date
 */
const areAllBatchesMarked = async (attendanceDate) => {
  try {
    const allAttendance = await getAllAttendanceForDate(attendanceDate);
    
    if (allAttendance.length === 0) {
      return false; // No students found
    }

    // Check if all groups are fully marked
    const allMarked = allAttendance.every(group => group.isFullyMarked);
    
    return allMarked;
  } catch (error) {
    console.error('Error checking if all batches are marked:', error);
    return false;
  }
};

/**
 * Check if all batches for a specific college are marked for a specific date
 */
const areAllBatchesMarkedForCollege = async (attendanceDate, collegeName) => {
  try {
    const allAttendance = await getAllAttendanceForDate(attendanceDate);
    
    if (allAttendance.length === 0) {
      return false; // No students found
    }

    // Filter groups by college
    const collegeGroups = allAttendance.filter(group => 
      group.college === collegeName || 
      group.college === 'Unknown' && collegeName === 'Unknown'
    );
    
    if (collegeGroups.length === 0) {
      return false; // No groups found for this college
    }

    // Check if all groups for this college are fully marked
    const allMarked = collegeGroups.every(group => group.isFullyMarked);
    
    return allMarked;
  } catch (error) {
    console.error(`Error checking if all batches are marked for college ${collegeName}:`, error);
    return false;
  }
};

/**
 * Check if all batches for a specific college+course+branch combination are marked
 */
const areAllBatchesMarkedForCollegeCourseBranch = async (attendanceDate, collegeName, courseName, branchName) => {
  try {
    const allAttendance = await getAllAttendanceForDate(attendanceDate);
    
    if (allAttendance.length === 0) {
      return false; // No students found
    }

    // Filter groups by college, course, and branch
    const filteredGroups = allAttendance.filter(group => {
      const collegeMatch = group.college === collegeName || 
                          (group.college === 'Unknown' && collegeName === 'Unknown');
      const courseMatch = group.course === courseName || 
                         (group.course === 'Unknown' && courseName === 'Unknown');
      const branchMatch = group.branch === branchName || 
                         (group.branch === 'Unknown' && branchName === 'Unknown');
      
      return collegeMatch && courseMatch && branchMatch;
    });
    
    if (filteredGroups.length === 0) {
      return false; // No groups found for this combination
    }

    // Check if all groups for this combination are fully marked
    const allMarked = filteredGroups.every(group => group.isFullyMarked);
    
    return allMarked;
  } catch (error) {
    console.error(`Error checking if all batches are marked for ${collegeName} - ${courseName} - ${branchName}:`, error);
    return false;
  }
};

module.exports = {
  getAllAttendanceForDate,
  areAllBatchesMarked,
  areAllBatchesMarkedForCollege,
  areAllBatchesMarkedForCollegeCourseBranch
};


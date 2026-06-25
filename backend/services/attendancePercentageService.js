/**
 * Service for calculating attendance percentages
 * Provides utilities for computing attendance statistics based on working days, present/absent days
 */

const { getNonWorkingDaysForRange } = require('./nonWorkingDayService');
const { parseDateString } = require('../utils/dateUtils');
const { resolveAttendanceDisplayNumberFromRow } = require('./rollNumberService');

/**
 * Get date only string in YYYY-MM-DD format (IST-aware)
 */
const getDateOnlyString = (input) => parseDateString(input);

/**
 * Build date set for a given date range
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Set<string>} Set of date strings
 */
const buildDateSet = (fromDate, toDate) => {
  const dateSet = new Set();
  const cursor = new Date(fromDate);
  const end = new Date(toDate);
  
  while (cursor <= end) {
    dateSet.add(getDateOnlyString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  
  return dateSet;
};

/**
 * Calculate attendance statistics for a single student
 * @param {Map<string, string>} attendanceMap - Map of date -> status (present/absent)
 * @param {Set<string>} dateSet - Set of all dates in range
 * @param {Set<string>} holidayDates - Set of holiday dates
 * @returns {Object} Statistics object with workingDays, presentDays, absentDays, holidays, unmarkedDays, attendancePercentage
 */
const calculateStudentAttendanceStats = (attendanceMap, dateSet, holidayDates) => {
  let presentDays = 0;
  let absentDays = 0;
  let workingDays = 0;
  let holidays = 0;
  let unmarkedDays = 0;

  dateSet.forEach((date) => {
    const status = attendanceMap.get(date) || null;
    // Treat a day as a holiday if:
    // (a) it appears in the calendar's holiday set (Sunday / public / institute), OR
    // (b) the attendance record itself has status='holiday'
    //     (safety net for records revoked when a holiday was retroactively added)
    const isHoliday = holidayDates.has(date) || status === 'holiday';

    if (isHoliday) {
      holidays += 1;
    } else {
      workingDays += 1;
      if (status === 'present') {
        presentDays += 1;
      } else if (status === 'absent') {
        absentDays += 1;
      } else {
        unmarkedDays += 1;
      }
    }
  });

  // Calculate percentage: (Present Days / Working Days) * 100
  const attendancePercentage = workingDays > 0
    ? parseFloat(((presentDays / workingDays) * 100).toFixed(2))
    : 0.00;

  return {
    workingDays,
    presentDays,
    absentDays,
    holidays,
    unmarkedDays,
    attendancePercentage
  };
};

/**
 * Calculate aggregate statistics for multiple students
 * @param {Array<Object>} students - Array of student objects with statistics
 * @param {Set<string>} markedDatesSet - Set of dates where attendance was actually marked
 * @param {Set<string>} holidayDates - Set of holiday dates
 * @returns {Object} Aggregate statistics
 */
const calculateAggregateStats = (students, markedDatesSet, holidayDates) => {
  // Calculate total working days as the number of unique dates where attendance was marked (excluding holidays)
  // This represents the actual number of days attendance was taken
  let totalWorkingDays = 0;
  markedDatesSet.forEach((date) => {
    if (!holidayDates.has(date)) {
      totalWorkingDays += 1;
    }
  });

  // Calculate percentage of students based on attendance percentage thresholds
  // Present Students: Students with attendance >= 75%
  // Absent Students: Students with attendance < 75%
  
  let studentsWithGoodAttendance = 0; // >= 75%
  let studentsWithPoorAttendance = 0; // < 75%
  let totalPresentDays = 0;
  let totalAbsentDays = 0;

  students.forEach((student) => {
    const attendancePct = student.statistics.attendancePercentage || 0;
    if (attendancePct >= 75) {
      studentsWithGoodAttendance += 1;
    } else {
      studentsWithPoorAttendance += 1;
    }
    totalPresentDays += student.statistics.presentDays;
    totalAbsentDays += student.statistics.absentDays;
  });

  // Calculate percentages
  const totalStudents = students.length;
  const presentStudentsPercentage = totalStudents > 0
    ? parseFloat(((studentsWithGoodAttendance / totalStudents) * 100).toFixed(2))
    : 0.00;
  
  const absentStudentsPercentage = totalStudents > 0
    ? parseFloat(((studentsWithPoorAttendance / totalStudents) * 100).toFixed(2))
    : 0.00;

  // Calculate overall attendance percentage
  // Total present days across all students / (working days * number of students)
  const totalPossibleDays = totalWorkingDays * totalStudents;
  const overallAttendancePercentage = totalPossibleDays > 0
    ? parseFloat(((totalPresentDays / totalPossibleDays) * 100).toFixed(2))
    : 0.00;

  return {
    totalWorkingDays,
    totalPresentDays,
    totalAbsentDays,
    presentStudentsPercentage,
    absentStudentsPercentage,
    overallAttendancePercentage,
    totalStudents
  };
};

/**
 * Process attendance data for students with date range and holiday info
 * @param {Array<Object>} studentRows - Array of student database rows
 * @param {Array<Object>} attendanceRows - Array of attendance database rows
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @param {Object} holidayInfo - Holiday info object with dates Set and details Map
 * @param {Function} parseStudentData - Function to parse student data
 * @returns {Object} Processed data with students array and statistics
 */
const processAttendanceData = async (studentRows, attendanceRows, fromDate, toDate, holidayInfo, parseStudentData) => {
  // Build date set (all dates in range)
  const dateSet = buildDateSet(fromDate, toDate);
  
  // Build set of dates where attendance was actually marked
  const markedDatesSet = new Set();
  attendanceRows.forEach((row) => {
    if (row.attendance_date) {
      const normalizedDate = getDateOnlyString(row.attendance_date);
      if (normalizedDate) {
        markedDatesSet.add(normalizedDate);
      }
    }
  });

  // Organize data by student
  const studentMap = new Map();
  studentRows.forEach((row) => {
    const studentData = parseStudentData(row.student_data);
    studentMap.set(row.id, {
      id: row.id,
      admissionNumber: row.admission_number,
      pinNumber: resolveAttendanceDisplayNumberFromRow(row, parseStudentData),
      studentName: row.student_name || studentData['Student Name'] || studentData['student_name'] || 'Unknown',
      batch: row.batch || studentData.Batch || null,
      course: row.course || studentData.Course || studentData.course || null,
      branch: row.branch || studentData.Branch || studentData.branch || null,
      year: row.current_year || studentData['Current Academic Year'] || null,
      semester: row.current_semester || studentData['Current Semester'] || null,
      college: row.college || null,
      attendance: new Map()
    });
  });

  // Populate attendance data
  attendanceRows.forEach((row) => {
    const student = studentMap.get(row.student_id);
    if (student && row.attendance_date) {
      const normalizedDate = getDateOnlyString(row.attendance_date);
      if (normalizedDate) {
        student.attendance.set(normalizedDate, row.attendance_status);
      }
    }
  });

  // Calculate statistics per student
  const students = Array.from(studentMap.values()).map((student) => {
    const stats = calculateStudentAttendanceStats(
      student.attendance,
      dateSet,
      holidayInfo.dates || new Set()
    );

    return {
      ...student,
      attendance: Object.fromEntries(student.attendance),
      statistics: stats
    };
  });

  // Calculate aggregate statistics
  // Use markedDatesSet to get the count of dates where attendance was actually marked
  const aggregateStats = calculateAggregateStats(students, markedDatesSet, holidayInfo.dates || new Set());

  return {
    students,
    dates: Array.from(dateSet).sort(),
    statistics: {
      totalStudents: students.length,
      ...aggregateStats
    }
  };
};

/**
 * Get holiday info for date range
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Holiday info object
 */
const getHolidayInfoForRange = async (fromDate, toDate) => {
  try {
    return await getNonWorkingDaysForRange(fromDate, toDate);
  } catch (error) {
    console.warn('Failed to fetch holiday info:', error.message || error);
    return { dates: new Set(), details: new Map() };
  }
};

module.exports = {
  getDateOnlyString,
  buildDateSet,
  calculateStudentAttendanceStats,
  calculateAggregateStats,
  processAttendanceData,
  getHolidayInfoForRange
};

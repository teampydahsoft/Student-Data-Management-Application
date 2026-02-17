const { getHolidaysForMonth } = require('../services/holidayService');
const {
  listCustomHolidays,
  upsertCustomHoliday,
  deleteCustomHoliday,
  normalizeDate
} = require('../services/customHolidayService');
const { getAttendanceStatusForRange } = require('../services/attendanceStatusService');
const { masterPool } = require('../config/database');
const { sendNotificationToUser } = require('./pushController');

const padMonth = (value) => String(value).padStart(2, '0');

const parseMonthParam = (monthParam, yearParam, numericMonthParam) => {
  if (typeof monthParam === 'string') {
    const match = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2])
      };
    }
  }

  if (yearParam && numericMonthParam) {
    const year = Number(yearParam);
    const month = Number(numericMonthParam);
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      return { year, month };
    }
  }

  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1
  };
};

const buildSundaysForMonth = (year, month) => {
  const sundays = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  while (cursor <= end) {
    if (cursor.getUTCDay() === 0) {
      sundays.push(
        `${cursor.getUTCFullYear()}-${padMonth(cursor.getUTCMonth() + 1)}-${padMonth(
          cursor.getUTCDate()
        )}`
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sundays;
};

exports.getNonWorkingDays = async (req, res) => {
  try {
    const { month: monthParam, year: yearParam, countryCode, regionCode } = req.query;
    const numericMonthParam = req.query.monthNumeric || req.query.monthNumber;

    const { year, month } = parseMonthParam(monthParam, yearParam, numericMonthParam);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      year < 2000 ||
      year > 2100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month or year supplied'
      });
    }

    const normalizedCountry = typeof countryCode === 'string' && countryCode.length === 2
      ? countryCode.toUpperCase()
      : 'IN';

    const { holidays, fromCache } = await getHolidaysForMonth({
      year,
      month,
      countryCode: normalizedCountry,
      regionCode: regionCode ? String(regionCode).toUpperCase() : undefined
    });

    const sundayList = buildSundaysForMonth(year, month);

    const monthStart = `${year}-${padMonth(month)}-01`;
    const monthEndDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${padMonth(month)}-${padMonth(monthEndDate)}`;

    const customHolidays = await listCustomHolidays({
      startDate: monthStart,
      endDate: monthEnd
    });

    const attendanceCountsMap = await getAttendanceStatusForRange(monthStart, monthEnd);
    const todayKey = new Date().toISOString().split('T')[0];

    const publicHolidays = holidays.map((holiday) => ({
      date: holiday.date,
      localName: holiday.localName,
      name: holiday.name,
      types: holiday.types,
      global: holiday.global,
      fixed: holiday.fixed,
      counties: holiday.counties,
      launchYear: holiday.launchYear
    }));

    const sundaySet = new Set(sundayList);
    const publicHolidaySet = new Set(publicHolidays.map((holiday) => holiday.date));
    const customHolidaySet = new Set(customHolidays.map((holiday) => holiday.date));

    const attendanceStatus = {};
    const attendanceCounts = {};
    const cursor = new Date(Date.UTC(year, month - 1, 1));
    const endCursor = new Date(Date.UTC(year, month, 0));
    while (cursor <= endCursor) {
      const dateIso = `${cursor.getUTCFullYear()}-${padMonth(cursor.getUTCMonth() + 1)}-${padMonth(
        cursor.getUTCDate()
      )}`;
      const countsData = attendanceCountsMap.get(dateIso);
      const hasRecords = countsData && countsData.total > 0;
      const isHoliday =
        sundaySet.has(dateIso) || publicHolidaySet.has(dateIso) || customHolidaySet.has(dateIso);

      let status = 'upcoming';
      if (isHoliday) {
        status = 'holiday';
      } else if (hasRecords) {
        status = 'submitted';
      } else if (dateIso < todayKey) {
        status = 'not_marked';
      } else if (dateIso === todayKey) {
        status = 'pending';
      }

      attendanceStatus[dateIso] = status;
      // Include counts for each date
      if (countsData) {
        attendanceCounts[dateIso] = {
          present: countsData.present,
          absent: countsData.absent,
          total: countsData.total
        };
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    console.log(`[Calendar] Sending response with ${Object.keys(attendanceCounts).length} dates with counts`);
    console.log(`[Calendar] Sample counts:`, Object.entries(attendanceCounts).slice(0, 3));

    res.json({
      success: true,
      data: {
        month: `${year}-${padMonth(month)}`,
        countryCode: normalizedCountry,
        regionCode: regionCode ? String(regionCode).toUpperCase() : null,
        sundays: sundayList,
        publicHolidays,
        attendanceStatus,
        attendanceCounts,
        customHolidays,
        fetchedAt: new Date().toISOString(),
        source: 'nager-date',
        fromCache
      }
    });
  } catch (error) {
    console.error('Failed to fetch non-working days:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch non-working days',
      error: error.message || 'unknown_error'
    });
  }
};

exports.getCustomHolidays = async (req, res) => {
  try {
    const { start, end } = req.query;

    const startDate = normalizeDate(start) || null;
    const endDate = normalizeDate(end) || null;

    const holidays = await listCustomHolidays({
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: holidays
    });
  } catch (error) {
    console.error('Failed to list custom holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch custom holidays',
      error: error.message || 'unknown_error'
    });
  }
};

// Helper: Notify all students about new activity/holiday
const notifyAllStudents = async (holiday) => {
  try {
    // Fetch all regular students
    const [students] = await masterPool.query("SELECT id FROM students WHERE student_status = 'Regular'");

    if (students.length === 0) return;

    const payload = {
      title: `New Activity: ${holiday.title}`,
      body: `${holiday.description ? holiday.description.substring(0, 50) + '...' : 'Check activity calendar.'}`,
      icon: '/icon-192x192.png',
      data: {
        url: 'https://pydahgroup.com/student/calendar'
      }
    };

    // Send notifications
    const promises = students.map(student => sendNotificationToUser(student.id, payload));
    await Promise.allSettled(promises);
    console.log(`Activity notifications sent to ${students.length} students.`);
  } catch (error) {
    console.error('Failed to send activity notifications:', error);
  }
};

exports.saveCustomHoliday = async (req, res) => {
  try {
    const { date, title, description } = req.body || {};
    const createdBy = req.admin?.id || req.user?.id || null;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Holiday date is required'
      });
    }

    const holiday = await upsertCustomHoliday({
      date,
      title,
      description,
      createdBy
    });

    res.json({
      success: true,
      data: holiday
    });

    // Send Notification
    // notifyAllStudents({ title, description }).catch(err => console.error(err));

  } catch (error) {
    console.error('Failed to save custom holiday:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to save custom holiday'
    });
  }
};

exports.deleteCustomHoliday = async (req, res) => {
  try {
    const { date } = req.params;
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Holiday date is required'
      });
    }

    const deleted = await deleteCustomHoliday(date);

    res.json({
      success: true,
      data: { deleted }
    });
  } catch (error) {
    console.error('Failed to delete custom holiday:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to delete custom holiday'
    });
  }
};


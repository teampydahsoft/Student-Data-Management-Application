const { getHolidaysForMonth } = require('../services/holidayService');
const {
  listCustomHolidays,
  saveCustomHoliday,
  deleteCustomHoliday,
  deleteCustomHolidayById,
  normalizeDate
} = require('../services/customHolidayService');
const {
  getNonWorkingDayInfo,
  clearCache
} = require('../services/nonWorkingDayService');
const { getAttendanceStatusForRange } = require('../services/attendanceStatusService');
const { masterPool } = require('../config/database');
const { sendNotificationToUser } = require('./pushController');
const {
  buildStudentWhereClause,
  isGlobalTarget,
  extractTargetsFromBody
} = require('../services/targetingService');
const { getISTDateString } = require('../utils/dateUtils');

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

const revokeAttendanceForHoliday = async (holiday) => {
  const normalizedDate = normalizeDate(holiday?.date);
  if (!normalizedDate) return 0;

  const holidayReason = (holiday.title && holiday.title.trim())
    ? holiday.title.trim()
    : 'Institute Holiday';
  const targets = extractTargetsFromBody(holiday);
  const { conditions, params } = buildStudentWhereClause(targets, 's');

  let query = `
    UPDATE attendance_records ar
    INNER JOIN students s ON s.id = ar.student_id
    SET ar.status = 'holiday', ar.holiday_reason = ?
    WHERE ar.attendance_date = ?
      AND ar.status IN ('present', 'absent')
  `;
  const queryParams = [holidayReason, normalizedDate];

  if (conditions.length > 0) {
    query += ` AND ${conditions.join(' AND ')}`;
    queryParams.push(...params);
  }

  const [revokeResult] = await masterPool.query(query, queryParams);
  return revokeResult.affectedRows;
};

const cleanupAttendanceForHoliday = async (holiday) => {
  const normalizedDate = normalizeDate(holiday?.date);
  if (!normalizedDate) return 0;

  const targets = extractTargetsFromBody(holiday);
  const { conditions, params } = buildStudentWhereClause(targets, 's');

  let query = `
    DELETE ar FROM attendance_records ar
    INNER JOIN students s ON s.id = ar.student_id
    WHERE ar.attendance_date = ?
      AND ar.status = 'holiday'
  `;
  const queryParams = [normalizedDate];

  if (conditions.length > 0) {
    query += ` AND ${conditions.join(' AND ')}`;
    queryParams.push(...params);
  }

  const [cleanupResult] = await masterPool.query(query, queryParams);
  return cleanupResult.affectedRows;
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
    const todayKey = getISTDateString();

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
    const customHolidayDateSet = new Set(customHolidays.map((holiday) => holiday.date));

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
        sundaySet.has(dateIso) || publicHolidaySet.has(dateIso) || customHolidayDateSet.has(dateIso);

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
      if (countsData) {
        attendanceCounts[dateIso] = {
          present: countsData.present,
          absent: countsData.absent,
          total: countsData.total
        };
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

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

exports.saveCustomHoliday = async (req, res) => {
  try {
    const {
      id,
      date,
      title,
      description,
      target_college,
      target_batch,
      target_course,
      target_branch,
      target_year,
      target_semester
    } = req.body || {};
    const createdBy = req.admin?.id || req.user?.id || null;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Holiday date is required'
      });
    }

    const holiday = await saveCustomHoliday({
      id,
      date,
      title,
      description,
      createdBy,
      target_college,
      target_batch,
      target_course,
      target_branch,
      target_year,
      target_semester
    });

    clearCache();

    const revokedCount = await revokeAttendanceForHoliday(holiday);
    console.log(
      `[Holiday] Revoked ${revokedCount} attendance record(s) for ${holiday.date} → holiday (${isGlobalTarget(holiday) ? 'all students' : 'scoped'})`
    );

    res.json({
      success: true,
      data: holiday
    });
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
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Holiday id is required'
      });
    }

    let deletedHoliday = null;
    if (String(id).match(/^\d+$/)) {
      deletedHoliday = await deleteCustomHolidayById(Number(id));
    } else {
      const deleted = await deleteCustomHoliday(id);
      if (deleted) {
        deletedHoliday = { date: normalizeDate(id) };
      }
    }

    if (!deletedHoliday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    clearCache();

    if (deletedHoliday.id || deletedHoliday.date) {
      const removedCount = await cleanupAttendanceForHoliday(deletedHoliday);
      console.log(
        `[Holiday] Removed ${removedCount} holiday attendance record(s) for ${deletedHoliday.date}`
      );
    }

    res.json({
      success: true,
      data: { deleted: true, holiday: deletedHoliday }
    });
  } catch (error) {
    console.error('Failed to delete custom holiday:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to delete custom holiday'
    });
  }
};

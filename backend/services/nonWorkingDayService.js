const { getHolidaysForMonth } = require('./holidayService');
const {
  listCustomHolidays,
  normalizeDate
} = require('./customHolidayService');
const {
  isGlobalTarget,
  matchesStudent,
  matchesFilters
} = require('./targetingService');

const DEFAULT_COUNTRY = (process.env.HOLIDAY_COUNTRY || 'IN').toUpperCase();

const monthCache = new Map();
const MONTH_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const pad = (value) => String(value).padStart(2, '0');

const computeSundaysForMonth = (year, month) => {
  const sundays = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  while (cursor <= end) {
    if (cursor.getUTCDay() === 0) {
      sundays.push(
        `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(
          cursor.getUTCDate()
        )}`
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sundays;
};

const parseDateInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getMonthKey = (year, month) => `${year}-${pad(month)}`;

const getMonthDateRange = (year, month) => {
  const start = `${year}-${pad(month)}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${pad(month)}-${pad(endDay)}`;
  return { start, end };
};

const groupCustomHolidaysByDate = (customHolidays = []) => {
  const map = new Map();
  customHolidays.forEach((holiday) => {
    const existing = map.get(holiday.date) || [];
    existing.push(holiday);
    map.set(holiday.date, existing);
  });
  return map;
};

const findGlobalCustomHoliday = (customHolidays = []) =>
  customHolidays.find((holiday) => isGlobalTarget(holiday)) || null;

const findMatchingCustomHoliday = (customHolidays = [], context = {}) => {
  const { student, filters } = context;
  if (!Array.isArray(customHolidays) || customHolidays.length === 0) return null;

  if (student) {
    return customHolidays.find((holiday) => matchesStudent(student, holiday)) || null;
  }

  if (filters) {
    return customHolidays.find((holiday) => matchesFilters(filters, holiday)) || null;
  }

  return findGlobalCustomHoliday(customHolidays) || customHolidays[0] || null;
};

const buildMonthData = async (year, month, countryCode = DEFAULT_COUNTRY) => {
  const monthKey = getMonthKey(year, month);
  const cacheEntry = monthCache.get(monthKey);

  if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
    return cacheEntry.value;
  }

  const [{ holidays: publicHolidays }, customHolidays] = await Promise.all([
    getHolidaysForMonth({ year, month, countryCode }),
    listCustomHolidays(getMonthDateRange(year, month))
  ]);

  const sundayList = computeSundaysForMonth(year, month);

  const publicHolidayMap = new Map(
    (publicHolidays || []).map((holiday) => [holiday.date, holiday])
  );
  const customHolidaysByDate = groupCustomHolidaysByDate(customHolidays || []);
  const sundaySet = new Set(sundayList);

  const monthData = {
    key: monthKey,
    countryCode,
    publicHolidayMap,
    customHolidaysByDate,
    customHolidays,
    sundaySet,
    fetchedAt: new Date().toISOString()
  };

  monthCache.set(monthKey, {
    value: monthData,
    expiresAt: Date.now() + MONTH_CACHE_TTL
  });

  return monthData;
};

const getNonWorkingDayInfo = async (dateInput, optionsOrCountry = DEFAULT_COUNTRY) => {
  const options =
    typeof optionsOrCountry === 'string'
      ? { countryCode: optionsOrCountry }
      : { countryCode: DEFAULT_COUNTRY, ...optionsOrCountry };

  const { countryCode = DEFAULT_COUNTRY, student = null, filters = null } = options;
  const normalizedDate = normalizeDate(dateInput);
  if (!normalizedDate) {
    throw new Error('Invalid date supplied');
  }

  const [year, month] = normalizedDate.split('-').map((part) => Number(part));
  const monthData = await buildMonthData(year, month, countryCode);

  const publicHoliday = monthData.publicHolidayMap.get(normalizedDate) || null;
  const customHolidaysForDate = monthData.customHolidaysByDate.get(normalizedDate) || [];
  const globalCustomHoliday = findGlobalCustomHoliday(customHolidaysForDate);
  const matchingCustomHoliday = findMatchingCustomHoliday(customHolidaysForDate, {
    student,
    filters
  });
  const isSunday = monthData.sundaySet.has(normalizedDate);

  const reasons = [];
  if (isSunday) reasons.push('Sunday');
  if (publicHoliday) reasons.push(publicHoliday.localName || publicHoliday.name || 'Public holiday');
  if (globalCustomHoliday) reasons.push(globalCustomHoliday.title || 'Institute holiday');
  else if (matchingCustomHoliday) {
    reasons.push(matchingCustomHoliday.title || 'Institute holiday');
  }

  const isGlobalNonWorkingDay = Boolean(isSunday || publicHoliday || globalCustomHoliday);
  const isStudentHoliday = Boolean(
    isGlobalNonWorkingDay ||
      (student && matchingCustomHoliday && !isGlobalNonWorkingDay)
  );

  return {
    date: normalizedDate,
    isNonWorkingDay: student ? isStudentHoliday : isGlobalNonWorkingDay,
    isGlobalNonWorkingDay,
    isSunday,
    publicHoliday,
    customHoliday: matchingCustomHoliday || globalCustomHoliday,
    customHolidays: customHolidaysForDate,
    globalCustomHoliday,
    reasons
  };
};

const getStudentHolidayOnDate = async (dateInput, student, countryCode = DEFAULT_COUNTRY) => {
  const info = await getNonWorkingDayInfo(dateInput, { countryCode, student });
  if (!info.isNonWorkingDay) return null;
  return info.customHoliday || (info.isSunday || info.publicHoliday
    ? { title: info.reasons.join(', '), isGlobal: true }
    : null);
};

const getNonWorkingDaysForRange = async (startDate, endDate, countryCode = DEFAULT_COUNTRY) => {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  if (!start || !end || start > end) {
    throw new Error('Invalid date range supplied');
  }

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endCursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const normalizedStart = normalizeDate(start);
  const normalizedEnd = normalizeDate(end);

  const detailMap = new Map();

  while (cursor <= endCursor) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const monthData = await buildMonthData(year, month, countryCode);

    monthData.sundaySet.forEach((date) => {
      if (date >= normalizedStart && date <= normalizedEnd) {
        detailMap.set(date, {
          ...(detailMap.get(date) || {}),
          isSunday: true
        });
      }
    });

    monthData.publicHolidayMap.forEach((holiday, date) => {
      if (date >= normalizedStart && date <= normalizedEnd) {
        detailMap.set(date, {
          ...(detailMap.get(date) || {}),
          publicHoliday: holiday
        });
      }
    });

    monthData.customHolidaysByDate.forEach((holidays, date) => {
      if (date >= normalizedStart && date <= normalizedEnd) {
        detailMap.set(date, {
          ...(detailMap.get(date) || {}),
          customHolidays: holidays,
          customHoliday: findGlobalCustomHoliday(holidays) || holidays[0] || null
        });
      }
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return {
    dates: new Set(detailMap.keys()),
    details: detailMap
  };
};

const clearCache = () => {
  monthCache.clear();
};

const shiftDateString = (dateStr, days) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`;
};

/**
 * Returns the most recent working day strictly before the supplied date.
 */
const getPreviousWorkingDay = async (dateInput, countryCode = DEFAULT_COUNTRY) => {
  const normalizedDate = normalizeDate(dateInput);
  if (!normalizedDate) {
    throw new Error('Invalid date supplied');
  }

  let cursor = normalizedDate;
  for (let i = 0; i < 21; i += 1) {
    cursor = shiftDateString(cursor, -1);
    const info = await getNonWorkingDayInfo(cursor, countryCode);
    if (!info.isGlobalNonWorkingDay) {
      return cursor;
    }
  }

  return null;
};

module.exports = {
  getNonWorkingDayInfo,
  getStudentHolidayOnDate,
  getNonWorkingDaysForRange,
  getPreviousWorkingDay,
  findMatchingCustomHoliday,
  clearCache
};

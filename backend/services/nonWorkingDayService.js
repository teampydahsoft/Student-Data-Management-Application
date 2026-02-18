const { getHolidaysForMonth } = require('./holidayService');
const {
  listCustomHolidays,
  normalizeDate
} = require('./customHolidayService');

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
  const customHolidayMap = new Map(
    (customHolidays || []).map((holiday) => [holiday.date, holiday])
  );
  const sundaySet = new Set(sundayList);

  const monthData = {
    key: monthKey,
    countryCode,
    publicHolidayMap,
    customHolidayMap,
    sundaySet,
    fetchedAt: new Date().toISOString()
  };

  monthCache.set(monthKey, {
    value: monthData,
    expiresAt: Date.now() + MONTH_CACHE_TTL
  });

  return monthData;
};

const getNonWorkingDayInfo = async (dateInput, countryCode = DEFAULT_COUNTRY) => {
  const normalizedDate = normalizeDate(dateInput);
  if (!normalizedDate) {
    throw new Error('Invalid date supplied');
  }

  const [year, month] = normalizedDate.split('-').map((part) => Number(part));
  const monthData = await buildMonthData(year, month, countryCode);

  const publicHoliday = monthData.publicHolidayMap.get(normalizedDate) || null;
  const customHoliday = monthData.customHolidayMap.get(normalizedDate) || null;
  const isSunday = monthData.sundaySet.has(normalizedDate);

  const reasons = [];
  if (isSunday) reasons.push('Sunday');
  if (publicHoliday) reasons.push(publicHoliday.localName || publicHoliday.name || 'Public holiday');
  if (customHoliday) reasons.push(customHoliday.title || 'Institute holiday');

  return {
    date: normalizedDate,
    isNonWorkingDay: Boolean(isSunday || publicHoliday || customHoliday),
    isSunday,
    publicHoliday,
    customHoliday,
    reasons
  };
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

    monthData.customHolidayMap.forEach((holiday, date) => {
      if (date >= normalizedStart && date <= normalizedEnd) {
        detailMap.set(date, {
          ...(detailMap.get(date) || {}),
          customHoliday: holiday
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

module.exports = {
  getNonWorkingDayInfo,
  getNonWorkingDaysForRange,
  clearCache
};


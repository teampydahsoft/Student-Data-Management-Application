/**
 * Date utilities with IST (UTC+5:30) awareness.
 *
 * The server TZ is set to Asia/Kolkata (IST) via PM2 ecosystem.config.js.
 * However, Date.now() / new Date().getTime() always return UTC epoch — safe.
 * We derive IST by adding a fixed +5:30 offset to UTC epoch and reading
 * .toISOString() (which always outputs UTC), giving the correct IST wall-clock date.
 *
 * IMPORTANT: Do NOT use getTimezoneOffset() for IST calculations.
 * On an IST-configured server getTimezoneOffset() returns -330, which cancels
 * the +5:30 offset and gives UTC instead of IST.
 *
 * Rule of thumb:
 *  - Use getISTDateString()            → "today" in IST (no argument needed)
 *  - Use parseDateString(input)        → parse a YYYY-MM-DD or ISO string safely
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Returns today's date in IST as a YYYY-MM-DD string.
 * Replaces: new Date().toISOString().slice(0, 10)  and
 *           the no-argument branch of getDateOnlyString()
 */
const getISTDateString = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD always from UTC-based ISO
};

/**
 * Parse any date input into a YYYY-MM-DD string, using IST for "now".
 *
 * - No argument / null / undefined → returns today in IST
 * - "YYYY-MM-DD" string → returned as-is (already a local date, no shift)
 * - A JS Date object or ISO timestamp → extracted in UTC (the value the DB stored)
 *
 * Returns null if the input is unparseable.
 */
const parseDateString = (input) => {
  if (!input) {
    return getISTDateString();
  }

  // Plain date string like "2024-06-23" — treat it as a local date, not UTC.
  // Appending T00:00:00 without a Z makes JS treat it as LOCAL time, but since
  // the server is UTC that's the same. More importantly: avoid the browser-side
  // "YYYY-MM-DD is UTC midnight" trap when the value came from the client as a
  // plain string.
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input; // already unambiguous
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // For full timestamps (ISO Z suffix or Date objects), extract the IST date
  // so that a timestamp like "2024-06-23T18:45:00Z" (which is midnight IST on
  // Jun 24) maps to "2024-06-24" instead of "2024-06-23".
  if (
    (typeof input === 'string' && input.includes('T')) ||
    input instanceof Date
  ) {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return ist.toISOString().slice(0, 10);
  }

  // Fallback for any other numeric / ambiguous input
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
};

/**
 * Parse "H:MM", "HH:MM", or "HH:MM:SS" into minutes since midnight (0–1439).
 * Returns null for invalid input.
 */
const parseTimeToMinutes = (timeStr) => {
  if (timeStr == null || timeStr === '') return null;

  const raw = String(timeStr).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) || !Number.isInteger(minutes) ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

/** Format minutes since midnight as "HH:MM". */
const formatMinutesToHHMM = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Normalize any supported time string to "HH:MM". */
const normalizeTimeHHMM = (timeStr) => {
  const minutes = parseTimeToMinutes(timeStr);
  return minutes == null ? null : formatMinutesToHHMM(minutes);
};

/** Current IST wall-clock time as minutes since midnight. */
const getISTTimeMinutes = () => {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};

/** Current IST wall-clock time as "HH:MM". */
const getISTTimeHHMM = () => formatMinutesToHHMM(getISTTimeMinutes());

/** True when value is within [startMinutes, endMinutes] (inclusive). */
const isMinutesWithinRange = (valueMinutes, startMinutes, endMinutes) =>
  valueMinutes >= startMinutes && valueMinutes <= endMinutes;

module.exports = {
  getISTDateString,
  parseDateString,
  parseTimeToMinutes,
  formatMinutesToHHMM,
  normalizeTimeHHMM,
  getISTTimeMinutes,
  getISTTimeHHMM,
  isMinutesWithinRange,
  IST_OFFSET_MS,
};

/**
 * AI-VERSANT (crt) date parsing — test_results & student_test_attempts.
 *
 * Observed / expected formats:
 * - BSON Date on submitted_at, end_time, completed_at, created_at
 * - ISO strings: "2026-02-18T10:30:00.000Z"
 * - Indian strings: "18-02-2026", "18-2-2026", "18/02/2026", "18 Feb 2026"
 * - Unix ms or seconds
 * - Extended JSON { $date: "..." } or { $date: { $numberLong: "..." } }
 * - Missing submitted_at → end_time / completed_at / date in tests.name (D-M-YYYY suffix)
 */

const SUBMITTED_FIELD_PRIORITY = [
  'submitted_at',
  'end_time',
  'completed_at',
  'updated_at',
  'created_at',
  'start_time',
];

/**
 * Parse D-M-Y or D/M/Y (day first — India).
 */
function parseDayMonthYear(match) {
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T12:00:00+05:30`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/**
 * Parse date from test name suffix e.g. "... (Verbs) 18-2-2026" or "... 30-1-2026".
 */
function parseDateFromTestName(testName) {
  if (!testName) return null;
  const s = String(testName).trim();

  const patterns = [
    /(\d{1,2})-(\d{1,2})-(\d{4})\s*$/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/,
    /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/,
    /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*$/i,
  ];

  for (let i = 0; i < 3; i++) {
    const m = s.match(patterns[i]);
    if (m) return parseDayMonthYear(m);
  }

  const monthMatch = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*$/i);
  if (monthMatch) {
    const months = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const mon = months[monthMatch[2].toLowerCase().slice(0, 3)];
    if (mon) {
      return parseDayMonthYear([, monthMatch[1], mon, monthMatch[3]]);
    }
  }

  return null;
}

function parseStringDate(str) {
  const trimmed = str.trim();
  if (!trimmed) return null;

  const dmy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, day, month, year, hh, mm, ss] = dmy;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const time =
      hh !== undefined
        ? `T${hh.padStart(2, '0')}:${(mm || '00').padStart(2, '0')}:${(ss || '00').padStart(2, '0')}+05:30`
        : 'T12:00:00+05:30';
    const dt = new Date(`${iso}${time}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymd) {
    const dt = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

/**
 * Single value → ISO 8601 string or null.
 */
function parseVersantDateValue(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  if (typeof value === 'string') {
    return parseStringDate(value);
  }

  if (typeof value === 'object' && value !== null) {
    if (Object.prototype.hasOwnProperty.call(value, '$date')) {
      const raw = value.$date;
      if (typeof raw === 'string' || typeof raw === 'number') {
        return parseVersantDateValue(raw);
      }
      if (raw && typeof raw === 'object' && raw.$numberLong) {
        return parseVersantDateValue(parseInt(raw.$numberLong, 10));
      }
    }
  }

  return null;
}

/**
 * Resolve best submission timestamp for a test result / attempt row.
 */
function resolveVersantSubmittedAt(doc = {}) {
  if (!doc || typeof doc !== 'object') return null;

  for (const field of SUBMITTED_FIELD_PRIORITY) {
    const iso = parseVersantDateValue(doc[field]);
    if (iso) return iso;
  }

  return parseDateFromTestName(doc.test_name);
}

/**
 * Format ISO for API / UI (IST display string parts).
 */
function formatSubmittedAtDisplay(iso) {
  if (!iso) return { iso: null, date: null, time: null, formatted: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { iso: null, date: null, time: null, formatted: '—' };
  }

  const date = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  return {
    iso,
    date,
    time,
    formatted: `${date}, ${time}`,
  };
}

const SCHEDULE_START_FIELDS = [
  'start_date',
  'start_time',
  'scheduled_at',
  'schedule_start',
  'available_from',
  'opens_at',
  'exam_date',
  'assigned_at',
  'created_at',
];

const SCHEDULE_END_FIELDS = [
  'end_date',
  'end_time',
  'deadline',
  'due_date',
  'due_at',
  'schedule_end',
  'available_until',
  'closes_at',
  'valid_until',
];

function resolveFirstDateFromFields(doc, fields) {
  if (!doc || typeof doc !== 'object') return null;
  for (const field of fields) {
    const iso = parseVersantDateValue(doc[field]);
    if (iso) return iso;
  }
  return null;
}

function resolveVersantScheduleStart(doc = {}) {
  return resolveFirstDateFromFields(doc, SCHEDULE_START_FIELDS);
}

function resolveVersantScheduleEnd(doc = {}) {
  return resolveFirstDateFromFields(doc, SCHEDULE_END_FIELDS);
}

module.exports = {
  SUBMITTED_FIELD_PRIORITY,
  SCHEDULE_START_FIELDS,
  SCHEDULE_END_FIELDS,
  parseVersantDateValue,
  parseDateFromTestName,
  resolveVersantSubmittedAt,
  resolveVersantScheduleStart,
  resolveVersantScheduleEnd,
  formatSubmittedAtDisplay,
};

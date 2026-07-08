export const SCHOLARSHIP_ELIGIBLE_OPTIONS = [
  'eligible',
  'not_eligible',
  'rejected',
  'pending',
  'not_applied'
];

export const SCHOLARSHIP_STATUS_FILTER_OPTIONS = [
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'pending', label: 'Pending' },
  { value: 'not_applied', label: 'Not applied' }
];

export const SCHOLARSHIP_STATUS_DROPDOWN_OPTIONS = [
  { value: '', label: '—' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'pending', label: 'Pending' },
  { value: 'not_applied', label: 'Not applied' }
];

export const SCHOLARSHIP_INELIGIBLE_QUOTA_CODES = ['MANG', 'MQ', 'SPOT', 'LSPOT'];

export const normalizeStudTypeCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  if (code === 'MQ') return 'MANG';
  return code;
};

export const isScholarshipIneligibleQuota = (studType) => (
  SCHOLARSHIP_INELIGIBLE_QUOTA_CODES.includes(normalizeStudTypeCode(studType))
);

export const isScholarshipQuotaLocked = (student, scholarshipMeta = null) => (
  Boolean(scholarshipMeta?.scholarshipQuotaLocked)
  || isScholarshipIneligibleQuota(student?.stud_type || student?.StudType)
);

/** Convenor quota (CQ is stored as CONV). */
export const isConvScholarshipQuota = (student) => {
  const code = normalizeStudTypeCode(student?.stud_type || student?.StudType);
  return code === 'CONV' || code === 'CQ';
};

export const normalizeScholarshipStatusValue = (status) => {
  const raw = String(status ?? '').trim().toLowerCase();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  if (raw === 'not eligible' || raw === 'not-eligible') return 'not_eligible';
  if (raw === 'not applied' || raw === 'not-applied') return 'not_applied';
  if (SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(raw)) return raw;
  if (raw.includes('eligible') && !raw.includes('not')) return 'eligible';
  return '';
};

export const getScholarshipStatusForSemester = (scholarshipData, studentYear, studentSemester) => {
  const year = Number(studentYear) || 1;
  const semester = Number(studentSemester) || 1;
  const yearData = scholarshipData?.years?.find((entry) => Number(entry.student_year) === year);
  const semesterData = yearData?.semesters?.find(
    (entry) => Number(entry.student_semester) === semester
  );
  return normalizeScholarshipStatusValue(semesterData?.eligible ?? yearData?.eligible);
};

export const getScholarshipStatusForYear = (scholarshipData, studentYear, studentSemester = null) => {
  if (studentSemester != null) {
    return getScholarshipStatusForSemester(scholarshipData, studentYear, studentSemester);
  }
  const year = Number(studentYear) || 1;
  const yearData = scholarshipData?.years?.find((entry) => Number(entry.student_year) === year);
  return normalizeScholarshipStatusValue(yearData?.eligible);
};

export const getCurrentScholarshipStatus = (scholarshipData, student) => {
  // currentYearEligible is pre-computed by the backend for the student's current year+semester
  // and is the most reliable single source of truth — use it first when available.
  const fromCurrentYearEligible = normalizeScholarshipStatusValue(
    scholarshipData?.currentYearEligible
  );
  if (fromCurrentYearEligible) return fromCurrentYearEligible;

  const currentYear = Number(student?.current_year) || 1;
  const currentSemester = Number(
    student?.current_semester
    || scholarshipData?.currentSemester
    || scholarshipData?.student?.current_semester
  ) || 1;

  // For current academic year (2026+), only read from the student_scholarship table rows.
  // The legacy scholar_status column is only valid for past (pre-2026) academic years.
  const isSemesterWise = usesSemesterWiseScholarshipStatus(
    student?.batch || scholarshipData?.student?.batch,
    currentYear
  );

  const fromTable = getScholarshipStatusForSemester(scholarshipData, currentYear, currentSemester)
    || getScholarshipStatusForYear(scholarshipData, currentYear);
  if (fromTable) return fromTable;

  // Only fall back to the legacy scholar_status column for pre-2026 academic years.
  if (isSemesterWise) return '';

  return normalizeScholarshipStatusValue(
    student?.scholar_status
    || scholarshipData?.student?.scholar_status
  );
};

export const isScholarshipStatusAssigned = (status) => (
  SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(String(status || '').trim().toLowerCase())
);

/**
 * Whether a scholarship status counts as a FINAL/COMPLETE decision for registration purposes.
 * 'pending' is NOT complete — it means the admin has not made a final decision yet.
 * Only eligible, not_eligible, rejected, not_applied are considered final.
 */
export const isScholarshipStatusFinal = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'eligible'
    || normalized === 'not_eligible'
    || normalized === 'rejected'
    || normalized === 'not_applied';
};

/**
 * Determines whether the scholarship registration stage is satisfied for a student.
 *
 * Rules:
 * - Academic year < 2026 (legacy mode): complete if scholar_status column has a valid value.
 * - Academic year >= 2026 (semester-wise mode):
 *     • Ineligible-quota students (MANG/SPOT/LSPOT/MQ): auto-complete — no action needed.
 *     • All others: complete only if the admin has explicitly set an eligible value in the
 *       student_scholarship table for the current year + semester (i.e. a real DB row exists).
 *       The legacy scholar_status column is NOT used as a fallback in this mode.
 *     • CONV quota + not_eligible semester: additionally requires fee_paid = true.
 *       All other final statuses (eligible, rejected, not_applied) do NOT require fee_paid.
 *
 * @param {object} scholarshipData  - Full payload from /student-scholarship API
 * @param {object} student          - Student object (needs batch, current_year, current_semester, stud_type)
 */
export const isScholarshipRegistrationComplete = (scholarshipData, student) => {
  const currentYear = Number(student?.current_year) || 1;
  const batch = student?.batch || scholarshipData?.student?.batch;
  const studType = student?.stud_type || student?.StudType || scholarshipData?.student?.stud_type;

  const isSemesterWise = usesSemesterWiseScholarshipStatus(batch, currentYear);

  if (!isSemesterWise) {
    // Legacy path: status must be a final decision (not pending).
    return isScholarshipStatusFinal(
      getCurrentScholarshipStatus(scholarshipData, student)
    );
  }

  // Semester-wise path (2026+ academic year):
  // Ineligible-quota students are always considered complete —
  // check both the student object and the API's scholarshipQuotaLocked flag.
  if (isScholarshipIneligibleQuota(studType) || scholarshipData?.scholarshipQuotaLocked) return true;

  // Only complete if the admin explicitly saved a FINAL semester row in student_scholarship
  const currentSemester = Number(
    student?.current_semester
    || scholarshipData?.currentSemester
    || scholarshipData?.student?.current_semester
  ) || 1;

  const yearData = scholarshipData?.years?.find(
    (y) => Number(y.student_year) === currentYear
  );
  const semesterRow = yearData?.semesters?.find(
    (s) => Number(s.student_semester) === currentSemester
  );

  if (!isScholarshipStatusFinal(semesterRow?.eligible)) return false;

  // Extra fee_paid check applies ONLY to CONV quota students whose current semester
  // is marked not_eligible (i.e. tuition fee mode — not the RTF/eligible flow).
  const isConv = isConvScholarshipQuota(student) || isConvScholarshipQuota({ stud_type: studType });
  const isNotEligible = String(semesterRow?.eligible || '').trim().toLowerCase() === 'not_eligible';

  if (isConv && isNotEligible) {
    const semFeePaid = semesterRow?.fee_paid === true || semesterRow?.fee_paid === 1;
    const apiFeePaid = scholarshipData?.currentSemesterFeePaid === true;
    // null/undefined means not yet confirmed — treat as NOT paid (require explicit check).
    return semFeePaid || apiFeePaid;
  }

  return true;
};

/** True when a semester has any assigned scholarship status (not blank). */
export const isSemesterScholarshipStatusAssigned = (status) => (
  Boolean(normalizeScholarshipStatusValue(status))
);

/** Every semester in the year is marked Eligible — full RTF / advance flow applies. */
export const isYearScholarshipEligible = (year) => {
  const semesters = year?.semesters || [];
  return semesters.length > 0 && semesters.every(
    (semester) => normalizeScholarshipStatusValue(semester.eligible) === 'eligible'
  );
};

/**
 * Fee-only mode: every semester has a status but not all are Eligible (pending, not eligible,
 * rejected, not applied, etc.). Sanctioned amount feeds Fee Due directly; no RTF or advance.
 */
export const isYearFeeOnlyScholarshipMode = (year) => {
  const semesters = year?.semesters || [];
  if (!semesters.length) return false;
  if (isYearScholarshipEligible(year)) return false;
  return semesters.every((semester) => isSemesterScholarshipStatusAssigned(semester.eligible));
};

/** Sanctioned amount (and optionally paid transactions) may be recorded for this year. */
export const hasYearScholarshipFinancialTracking = (year) => (
  isYearScholarshipEligible(year) || isYearFeeOnlyScholarshipMode(year)
);

/** Fee-only years on CONV students use tuition-fee labels instead of scholarship labels. */
export const shouldUseTuitionFeeLabels = (student, year) => (
  isConvScholarshipQuota(student) && isYearFeeOnlyScholarshipMode(year)
);

export const formatScholarshipStatusDisplay = (status) => {
  const normalized = normalizeScholarshipStatusValue(status);
  if (!normalized) return '—';
  if (normalized === 'not_eligible') return 'Not eligible';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'not_applied') return 'Not applied';
  if (normalized === 'eligible') return 'Eligible';
  if (normalized === 'pending') return 'Pending';
  return normalized;
};

export const getScholarshipStatusDropdownLabel = (value) => {
  const normalized = normalizeScholarshipStatusValue(value);
  if (!normalized) return '—';
  const match = SCHOLARSHIP_STATUS_DROPDOWN_OPTIONS.find(
    (option) => option.value === normalized
  ) || SCHOLARSHIP_STATUS_FILTER_OPTIONS.find(
    (option) => option.value === normalized
  );
  return match?.label || formatScholarshipStatusDisplay(normalized);
};

export const extractBatchStartYear = (batch) => {
  if (!batch) return null;
  const batchText = String(batch).trim();
  if (!batchText) return null;

  const fullYearMatch = batchText.match(/^(\d{4})/);
  if (fullYearMatch) return Number(fullYearMatch[1]);

  const shortYearMatch = batchText.match(/^(\d{2})/);
  if (shortYearMatch) {
    const shortYear = Number(shortYearMatch[1]);
    return shortYear <= 50 ? 2000 + shortYear : 1900 + shortYear;
  }

  return null;
};

export const SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR = 2026;

export const getAcademicYearStartYear = (batch, studentYear) => {
  const batchStart = extractBatchStartYear(batch);
  const yearIndex = Math.max(1, Number(studentYear) || 1);
  if (!batchStart) return null;
  return batchStart + yearIndex - 1;
};

export const usesSemesterWiseScholarshipStatus = (batch, studentYear) => {
  const startYear = getAcademicYearStartYear(batch, studentYear);
  return startYear != null && startYear >= SCHOLARSHIP_SEMESTER_WISE_CUTOFF_START_YEAR;
};

export const formatAcademicYearLabel = (batchStartYear, studentYear) => {
  const yearIndex = Math.max(1, Number(studentYear) || 1);
  if (!batchStartYear) return `Year ${yearIndex}`;
  const fromYear = batchStartYear + yearIndex - 1;
  return `${fromYear}-${fromYear + 1}`;
};

export const getAcademicYearLabel = (scholarshipMeta, studentYear, student) => {
  const year = Math.max(1, Number(studentYear) || 1);
  if (scholarshipMeta?.academicYearLabels?.[year]) {
    return scholarshipMeta.academicYearLabels[year];
  }
  const batchStartYear = extractBatchStartYear(
    scholarshipMeta?.student?.batch || student?.batch || student?.Batch
  );
  return formatAcademicYearLabel(batchStartYear, year);
};

export const SCHOLARSHIP_APPLICATION_ID_LENGTH = 12;
export const SCHOLARSHIP_MAX_AMOUNT = 99999;

export const normalizeApplicationIdInput = (value) => (
  String(value || '').replace(/\D/g, '').slice(0, SCHOLARSHIP_APPLICATION_ID_LENGTH)
);

export const normalizeScholarshipAmountInput = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.slice(0, 5);
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return '';
  return String(Math.min(Math.max(0, amount), SCHOLARSHIP_MAX_AMOUNT));
};

export const formatScholarshipAmountForInput = (value) => (
  normalizeScholarshipAmountInput(value)
);

export const isValidApplicationId = (value) => {
  const normalized = normalizeApplicationIdInput(value);
  return !normalized || normalized.length === SCHOLARSHIP_APPLICATION_ID_LENGTH;
};

export const isValidScholarshipAmount = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return true;
  if (!/^\d{1,5}$/.test(raw)) return false;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 && amount <= SCHOLARSHIP_MAX_AMOUNT;
};

export const parseScholarshipAmount = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return 0;
  return Math.min(Math.max(0, Math.trunc(amount)), SCHOLARSHIP_MAX_AMOUNT);
};

export const SCHOLARSHIP_RTF_RELEASED_LABEL = 'RTF Released';
export const SCHOLARSHIP_RTF_DUE_LABEL = 'Due';
export const SCHOLARSHIP_FEE_DUE_LABEL = 'Fee Due';
export const SCHOLARSHIP_ADVANCE_LABEL = 'Advance';
export const SCHOLARSHIP_RTF_RELEASED_TRANSACTIONS_TITLE = 'RTF Released Transactions (As per JnanaBhumi portal)';
export const SCHOLARSHIP_PAID_TRANSACTIONS_TITLE = 'Paid Transactions (Fee paid to college)';
export const SCHOLARSHIP_PAID_DATE_LABEL = 'Fee Paid Date';
export const SCHOLARSHIP_TUITION_FEE_LABEL = 'Tuition Fee';
export const SCHOLARSHIP_TUITION_FEE_PAID_LABEL = 'Tuition Fee Paid';
export const SCHOLARSHIP_TUITION_FEE_DUE_LABEL = 'Tuition Fee Due';
export const SCHOLARSHIP_TUITION_FEE_PAID_DATE_LABEL = 'Tuition Fee Paid Date';
export const SCHOLARSHIP_TUITION_FEE_TRANSACTIONS_TITLE = 'Tuition Fee Payments';

/** Summary column header — Tuition Fee for CONV fee-only years; Sanctioned otherwise. */
export const getScholarshipSanctionedColumnLabel = (student, years = []) => {
  if (!isConvScholarshipQuota(student)) return 'Sanctioned';
  const hasFeeOnly = years.some((year) => isYearFeeOnlyScholarshipMode(year));
  if (!hasFeeOnly) return 'Sanctioned';
  const hasEligible = years.some((year) => isYearScholarshipEligible(year));
  return hasEligible ? `Sanctioned / ${SCHOLARSHIP_TUITION_FEE_LABEL}` : SCHOLARSHIP_TUITION_FEE_LABEL;
};

/** Hide Paid and Fee Due columns in the year-wise scholarship summary table. */
export const SCHOLARSHIP_HIDE_SUMMARY_PAID_FEE_COLUMNS = true;

/** Hide the Paid Transactions (Fee paid to college) section on the scholarship tab. */
export const SCHOLARSHIP_HIDE_PAID_TRANSACTIONS_SECTION = true;

/**
 * Advance applies to College Account students only: fee money paid to college before RTF
 * release that the released RTF now reimburses. Mother Account students never have advance.
 */
export const calculateScholarshipAdvanceAmount = (sanctioned, released, paid, isCollege = false) => {
  if (!isCollege) return 0;
  const s = parseScholarshipAmount(sanctioned);
  const r = typeof released === 'number' ? released : parseScholarshipAmount(released);
  const p = typeof paid === 'number' ? paid : parseScholarshipAmount(paid);
  if (s <= 0 || r <= 0 || p <= 0) return 0;
  const surplus = p + r - s;
  return Math.max(0, Math.min(p, r, surplus));
};

/**
 * RTF Due = the government reimbursement still pending = sanctioned minus what has been released.
 * This is independent of what the student paid: even if the student paid the full fee in advance,
 * the RTF is still due from the portal until it is released (at which point it becomes an advance).
 */
export const calculateScholarshipRtfDue = (sanctioned, released) => {
  const s = parseScholarshipAmount(sanctioned);
  const r = typeof released === 'number' ? released : parseScholarshipAmount(released);
  if (s <= 0) return 0;
  return Math.max(0, s - r);
};

/** Sanctioned minus total paid (fee still to be paid). */
export const calculateScholarshipFeeDue = (sanctioned, paid) => {
  const s = parseScholarshipAmount(sanctioned);
  const p = typeof paid === 'number' ? paid : parseScholarshipAmount(paid);
  return s > 0 ? Math.max(0, s - p) : 0;
};

/** Fee due remaining before a paid-transaction row (max allowed for that row). */
export const calculateRemainingFeeDueBeforeRow = (sanctioned, paidTransactions = [], rowIndex = 0) => {
  const s = parseScholarshipAmount(sanctioned);
  if (s <= 0) return 0;
  let paidBefore = 0;
  for (let i = 0; i < rowIndex; i += 1) {
    paidBefore += parseScholarshipAmount(paidTransactions[i]?.paid_amount);
  }
  return Math.max(0, s - paidBefore);
};

/** Fee due remaining after applying paid amounts through rowIndex (inclusive). */
export const calculateFeeDueAfterRow = (sanctioned, paidTransactions = [], rowIndex = 0) => {
  const s = parseScholarshipAmount(sanctioned);
  if (s <= 0) return 0;
  let paidThrough = 0;
  for (let i = 0; i <= rowIndex; i += 1) {
    paidThrough += parseScholarshipAmount(paidTransactions[i]?.paid_amount);
  }
  return Math.max(0, s - paidThrough);
};

/** RTF due remaining before a release row = sanctioned minus what was released on earlier rows. */
export const calculateRemainingRtfDueBeforeRow = (sanctioned, releases = [], rowIndex = 0) => {
  const s = parseScholarshipAmount(sanctioned);
  if (s <= 0) return 0;
  let releasedBefore = 0;
  for (let i = 0; i < rowIndex; i += 1) {
    releasedBefore += parseScholarshipAmount(releases[i]?.released_amount);
  }
  return Math.max(0, s - releasedBefore);
};

/** RTF due after applying releases through rowIndex = sanctioned minus released so far. */
export const calculateRtfDueAfterRow = (sanctioned, releases = [], rowIndex = 0) => {
  const s = parseScholarshipAmount(sanctioned);
  if (s <= 0) return 0;
  let releasedThrough = 0;
  for (let i = 0; i <= rowIndex; i += 1) {
    releasedThrough += parseScholarshipAmount(releases[i]?.released_amount);
  }
  return Math.max(0, s - releasedThrough);
};

/** True when fee is fully paid before this RTF row — amount counts as advance. */
export const isRtfRowAdvance = (sanctioned, totalPaid, rowReleasedAmount) => {
  const feeDue = calculateScholarshipFeeDue(sanctioned, totalPaid);
  return feeDue === 0 && parseScholarshipAmount(rowReleasedAmount) > 0;
};

export const RTF_RELEASED_DATE_MIN = '1900-01-01';
export const RTF_RELEASED_DATE_MAX = '2099-12-31';
export const RTF_RELEASED_MIN_YEAR = 1900;
export const RTF_RELEASED_MAX_YEAR = 2099;

export const normalizeRtfReleasedDateForInput = (value) => {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < RTF_RELEASED_MIN_YEAR || year > RTF_RELEASED_MAX_YEAR) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return '';
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const isValidRtfReleasedDate = (value, { allowEmpty = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return allowEmpty;
  return normalizeRtfReleasedDateForInput(raw) !== '';
};

export const SCHOLARSHIP_ELIGIBLE_OPTIONS = ['eligible', 'pending', 'rejected'];

export const SCHOLARSHIP_STATUS_FILTER_OPTIONS = [
  { value: 'eligible', label: 'Eligible' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'not_eligible', label: 'Not eligible' }
];

export const SCHOLARSHIP_STATUS_DROPDOWN_OPTIONS = [
  { value: '', label: '—' },
  ...SCHOLARSHIP_STATUS_FILTER_OPTIONS
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

export const normalizeScholarshipStatusValue = (status) => {
  const raw = String(status ?? '').trim().toLowerCase();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  if (raw === 'not eligible' || raw === 'not_eligible') return 'rejected';
  if (SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(raw)) return raw;
  if (raw.includes('eligible') && !raw.includes('not')) return 'eligible';
  return '';
};

export const getScholarshipStatusForYear = (scholarshipData, studentYear) => {
  const year = Number(studentYear) || 1;
  const yearData = scholarshipData?.years?.find((entry) => Number(entry.student_year) === year);
  return normalizeScholarshipStatusValue(yearData?.eligible);
};

export const getCurrentScholarshipStatus = (scholarshipData, student) => {
  const currentYear = Number(student?.current_year) || 1;
  return getScholarshipStatusForYear(scholarshipData, currentYear);
};

export const isScholarshipStatusAssigned = (status) => (
  SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(String(status || '').trim().toLowerCase())
);

export const formatScholarshipStatusDisplay = (status) => {
  const normalized = normalizeScholarshipStatusValue(status);
  if (!normalized) return '—';
  if (normalized === 'rejected') return 'Not eligible';
  if (normalized === 'eligible') return 'Eligible';
  if (normalized === 'pending') return 'Pending';
  return normalized;
};

export const getScholarshipStatusDropdownLabel = (value) => {
  const normalized = normalizeScholarshipStatusValue(value);
  if (!normalized) return '—';
  const match = SCHOLARSHIP_STATUS_FILTER_OPTIONS.find(
    (option) => option.value === normalized || (option.value === 'not_eligible' && normalized === 'rejected')
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

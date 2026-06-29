export const SCHOLARSHIP_ELIGIBLE_OPTIONS = ['eligible', 'pending', 'rejected'];

export const getScholarshipStatusForYear = (scholarshipData, studentYear) => {
  const year = Number(studentYear) || 1;
  const yearData = scholarshipData?.years?.find((entry) => Number(entry.student_year) === year);
  return (yearData?.eligible || '').trim();
};

export const getCurrentScholarshipStatus = (scholarshipData, student) => {
  const currentYear = Number(student?.current_year) || 1;
  return getScholarshipStatusForYear(scholarshipData, currentYear);
};

export const isScholarshipStatusAssigned = (status) => (
  SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(String(status || '').trim().toLowerCase())
);

export const formatScholarshipStatusDisplay = (status) => {
  const normalized = String(status || '').trim();
  return normalized || '—';
};

export const SCHOLARSHIP_ELIGIBLE_OPTIONS = ['eligible', 'pending', 'rejected'];

export const getScholarshipStatusForYear = (scholarshipData, studentYear) => {
  const year = Number(studentYear) || 1;
  const yearData = scholarshipData?.years?.find((entry) => Number(entry.student_year) === year);
  return (yearData?.eligible || '').trim();
};

export const getCurrentScholarshipStatus = (scholarshipData, student) => {
  const currentYear = Number(student?.current_year) || 1;
  const fromTable = getScholarshipStatusForYear(scholarshipData, currentYear);
  if (fromTable) return fromTable;
  const legacy = String(student?.scholar_status || '').trim().toLowerCase();
  if (SCHOLARSHIP_ELIGIBLE_OPTIONS.includes(legacy)) return legacy;
  return '';
};

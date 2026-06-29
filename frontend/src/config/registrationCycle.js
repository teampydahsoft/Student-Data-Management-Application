const toStageNumber = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const REGISTRATION_EMPTY_DISPLAY = '—';

export const isVerificationCompleteForCycle = (studentData, currentYear, currentSemester) => {
  const year = toStageNumber(currentYear);
  const sem = toStageNumber(currentSemester);

  const hasCycleStamp = (yearField, semField) => (
    yearField !== undefined
    && yearField !== null
    && String(yearField).trim() !== ''
    && semField !== undefined
    && semField !== null
    && String(semField).trim() !== ''
  );

  const studentOk = studentData?.is_student_mobile_verified === true
    && hasCycleStamp(studentData.mobile_verified_year, studentData.mobile_verified_semester)
    && toStageNumber(studentData.mobile_verified_year) === year
    && toStageNumber(studentData.mobile_verified_semester) === sem;

  const parentOk = studentData?.is_parent_mobile_verified === true
    && hasCycleStamp(studentData.parent_verified_year, studentData.parent_verified_semester)
    && toStageNumber(studentData.parent_verified_year) === year
    && toStageNumber(studentData.parent_verified_semester) === sem;

  return studentOk && parentOk;
};

export const isStudentMobileVerifiedForCycle = (studentData, currentYear, currentSemester) => {
  const year = toStageNumber(currentYear);
  const sem = toStageNumber(currentSemester);

  const hasCycleStamp = (yearField, semField) => (
    yearField !== undefined
    && yearField !== null
    && String(yearField).trim() !== ''
    && semField !== undefined
    && semField !== null
    && String(semField).trim() !== ''
  );

  return studentData?.is_student_mobile_verified === true
    && hasCycleStamp(studentData.mobile_verified_year, studentData.mobile_verified_semester)
    && toStageNumber(studentData.mobile_verified_year) === year
    && toStageNumber(studentData.mobile_verified_semester) === sem;
};

export const isParentMobileVerifiedForCycle = (studentData, currentYear, currentSemester) => {
  const year = toStageNumber(currentYear);
  const sem = toStageNumber(currentSemester);

  const hasCycleStamp = (yearField, semField) => (
    yearField !== undefined
    && yearField !== null
    && String(yearField).trim() !== ''
    && semField !== undefined
    && semField !== null
    && String(semField).trim() !== ''
  );

  return studentData?.is_parent_mobile_verified === true
    && hasCycleStamp(studentData.parent_verified_year, studentData.parent_verified_semester)
    && toStageNumber(studentData.parent_verified_year) === year
    && toStageNumber(studentData.parent_verified_semester) === sem;
};

export const isPromotionCompleteForCycle = () => true;

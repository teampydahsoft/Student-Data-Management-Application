const toStageNumber = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const isVerificationCompleteForCycle = (studentData, currentYear, currentSemester) => {
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

// Step 4 (Promotion): always completed — students are already in their current year/semester.
const isPromotionCompleteForCycle = () => true;

const stampVerificationForCycle = (studentData, type, currentYear, currentSemester) => {
  const year = toStageNumber(currentYear);
  const sem = toStageNumber(currentSemester);
  const normalizedType = String(type || '').toLowerCase();
  const verifiedAt = new Date().toISOString();

  if (normalizedType === 'student') {
    studentData.is_student_mobile_verified = true;
    studentData.mobile_verified_year = year;
    studentData.mobile_verified_semester = sem;
    studentData.student_mobile_verified_at = verifiedAt;
    return;
  }

  if (normalizedType === 'parent') {
    studentData.is_parent_mobile_verified = true;
    studentData.parent_verified_year = year;
    studentData.parent_verified_semester = sem;
    studentData.parent_mobile_verified_at = verifiedAt;
  }
};

const stampPromotionForCycle = (studentData, currentYear, currentSemester) => {
  studentData.registration_promotion_year = toStageNumber(currentYear);
  studentData.registration_promotion_semester = toStageNumber(currentSemester);
  studentData.registration_promotion_acknowledged_at = new Date().toISOString();
};

const resetRegistrationCycle = (studentData) => {
  if (!studentData || typeof studentData !== 'object') return;

  studentData.is_student_mobile_verified = false;
  studentData.is_parent_mobile_verified = false;

  delete studentData.mobile_verified_year;
  delete studentData.mobile_verified_semester;
  delete studentData.parent_verified_year;
  delete studentData.parent_verified_semester;
  delete studentData.registration_promotion_year;
  delete studentData.registration_promotion_semester;
  delete studentData.registration_promotion_acknowledged_at;
  delete studentData.student_mobile_verified_at;
  delete studentData.parent_mobile_verified_at;
};

const REGISTRATION_EMPTY_DISPLAY = '—';

const jsonStageEqualsColumn = (jsonPath, columnName) => (
  `CAST(IFNULL(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(student_data, '${jsonPath}')), 'null'), '0') AS UNSIGNED) = GREATEST(1, IFNULL(${columnName}, 1))`
);

const likeJsonFieldEqualsColumn = (fieldName, columnName) => (
  `(
    student_data LIKE CONCAT('%"${fieldName}":', GREATEST(1, IFNULL(${columnName}, 1)), ',%')
    OR student_data LIKE CONCAT('%"${fieldName}":', GREATEST(1, IFNULL(${columnName}, 1)), '}%')
    OR student_data LIKE CONCAT('%"${fieldName}": ', GREATEST(1, IFNULL(${columnName}, 1)), ',%')
    OR student_data LIKE CONCAT('%"${fieldName}": ', GREATEST(1, IFNULL(${columnName}, 1)), '}%')
  )`
);

const jsonVerificationBody = `
  JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.is_student_mobile_verified')) = 'true'
  AND JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.is_parent_mobile_verified')) = 'true'
  AND ${jsonStageEqualsColumn('$.mobile_verified_year', 'current_year')}
  AND ${jsonStageEqualsColumn('$.mobile_verified_semester', 'current_semester')}
  AND ${jsonStageEqualsColumn('$.parent_verified_year', 'current_year')}
  AND ${jsonStageEqualsColumn('$.parent_verified_semester', 'current_semester')}
`;

const likeVerificationBody = `
  (student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%')
  AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')
  AND ${likeJsonFieldEqualsColumn('mobile_verified_year', 'current_year')}
  AND ${likeJsonFieldEqualsColumn('mobile_verified_semester', 'current_semester')}
  AND ${likeJsonFieldEqualsColumn('parent_verified_year', 'current_year')}
  AND ${likeJsonFieldEqualsColumn('parent_verified_semester', 'current_semester')}
`;

const promotionCompletedJsonSql = '1=1';
const promotionCompletedLikeSql = '1=1';

const verificationCompletedJsonSql = `(${jsonVerificationBody})`;
const verificationCompletedLikeSql = `(${likeVerificationBody})`;

// JSON_EXTRACT throws on truncated/invalid student_data (TEXT 64KB). Guard with JSON_VALID
// and fall back to LIKE patterns (same approach as legacy registration stats).
const verificationCompletedSql = `(
  (JSON_VALID(student_data) AND (${jsonVerificationBody}))
  OR (NOT JSON_VALID(student_data) AND (${likeVerificationBody}))
)`;

const promotionCompletedSql = '1=1';

const verificationCompletedSumSql = `SUM(CASE WHEN ${verificationCompletedSql} THEN 1 ELSE 0 END)`;
const promotionCompletedSumSql = 'COUNT(*)';

module.exports = {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle,
  stampVerificationForCycle,
  stampPromotionForCycle,
  resetRegistrationCycle,
  verificationCompletedSql,
  promotionCompletedSql,
  verificationCompletedJsonSql,
  verificationCompletedLikeSql,
  promotionCompletedJsonSql,
  promotionCompletedLikeSql,
  verificationCompletedSumSql,
  promotionCompletedSumSql
};

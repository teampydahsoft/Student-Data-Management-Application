/**
 * Branches that represent only the final segment of a longer course.
 * Pharm D PB: 3 branch years = course years 4, 5, 6 of the 6-year Pharm-D(PB) course.
 */
const PARTIAL_COURSE_BRANCHES = {
  'Pharm D PB': { branchTotalYears: 3, courseTotalYears: 6 }
};

/**
 * Lateral-entry quota codes. These students are admitted directly into program Year 2
 * (e.g. B.Tech / B.Pharm lateral entrants and diploma holders), so program Year 1
 * never exists for them and must not be shown or validated.
 */
const LATERAL_ENTRY_QUOTA_CODES = new Set(['LATER', 'LSPOT']);

const normalizeLateralQuotaCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return code === 'MQ' ? 'MANG' : code;
};

const isLateralEntryQuota = (studType) => (
  LATERAL_ENTRY_QUOTA_CODES.has(normalizeLateralQuotaCode(studType))
);

/**
 * First scholarship program year that applies to a student. Lateral-entry students
 * (LATER / LSPOT) start at program Year 2 — Year 1 does not exist for them.
 */
const resolveScholarshipStartYear = (studType) => (
  isLateralEntryQuota(studType) ? 2 : 1
);

const getBranchCourseOffset = (branchName) => {
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  if (!meta) return 0;
  return Math.max(0, meta.courseTotalYears - meta.branchTotalYears);
};

/**
 * Map stored current_year to the branch program year used in registration_stage_config
 * (e.g. Pharm D PB keys ::1, ::2, ::3).
 */
const resolveRegistrationBranchYear = (branchName, currentYear) => {
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  const year = Math.max(1, Number(currentYear) || 1);
  if (!meta) return year;

  if (year > meta.branchTotalYears) {
    const offset = meta.courseTotalYears - meta.branchTotalYears;
    return Math.max(1, Math.min(meta.branchTotalYears, year - offset));
  }
  return Math.min(year, meta.branchTotalYears);
};

/**
 * Full course program year (e.g. Pharm D PB branch year 1 → course year 4).
 */
const resolveCourseProgramYear = (branchName, currentYear) => {
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  const branchYear = resolveRegistrationBranchYear(branchName, currentYear);
  if (!meta) return branchYear;
  const offset = meta.courseTotalYears - meta.branchTotalYears;
  return branchYear + offset;
};

/**
 * student_scholarship.student_year values may use branch years or course years for PB.
 */
const resolveScholarshipLookupYears = (branchName, branchProgramYear) => {
  const year = Math.max(1, Number(branchProgramYear) || 1);
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  if (!meta) return [year];
  const courseYear = meta.courseTotalYears - meta.branchTotalYears + year;
  return [...new Set([year, courseYear])];
};

const resolveOptionalStagesFromConfig = (stageConfig, branchCode, currentYear) => {
  if (!stageConfig || !branchCode) return [];
  const configYear = resolveRegistrationBranchYear(branchCode, currentYear);
  const key = `${String(branchCode).trim()}::${String(configYear)}`;
  return stageConfig[key]?.optionalStages || [];
};

module.exports = {
  PARTIAL_COURSE_BRANCHES,
  LATERAL_ENTRY_QUOTA_CODES,
  isLateralEntryQuota,
  resolveScholarshipStartYear,
  getBranchCourseOffset,
  resolveRegistrationBranchYear,
  resolveCourseProgramYear,
  resolveScholarshipLookupYears,
  resolveOptionalStagesFromConfig
};

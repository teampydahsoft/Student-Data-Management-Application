/**
 * Branches that represent only the final segment of a longer course.
 * Pharm D PB: 3 branch years = course years 4, 5, 6 of the 6-year Pharm-D(PB) course.
 */
const PARTIAL_COURSE_BRANCHES = {
  'Pharm D PB': { branchTotalYears: 3, courseTotalYears: 6 }
};

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
  getBranchCourseOffset,
  resolveRegistrationBranchYear,
  resolveCourseProgramYear,
  resolveScholarshipLookupYears,
  resolveOptionalStagesFromConfig
};

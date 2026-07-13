/**
 * Pharm D PB: 3 branch years map to course years 4–6 of the 6-year Pharm-D(PB) program.
 */
export const PARTIAL_COURSE_BRANCHES = {
  'Pharm D PB': { branchTotalYears: 3, courseTotalYears: 6 }
};

export const resolveRegistrationBranchYear = (branchName, currentYear) => {
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  const year = Math.max(1, Number(currentYear) || 1);
  if (!meta) return year;

  if (year > meta.branchTotalYears) {
    const offset = meta.courseTotalYears - meta.branchTotalYears;
    return Math.max(1, Math.min(meta.branchTotalYears, year - offset));
  }
  return Math.min(year, meta.branchTotalYears);
};

export const resolveCourseProgramYear = (branchName, currentYear) => {
  const meta = PARTIAL_COURSE_BRANCHES[branchName];
  const branchYear = resolveRegistrationBranchYear(branchName, currentYear);
  if (!meta) return branchYear;
  return branchYear + (meta.courseTotalYears - meta.branchTotalYears);
};

export const resolveOptionalStagesFromConfig = (stageConfig, branchCode, currentYear) => {
  if (!stageConfig || !branchCode) return [];
  const configYear = resolveRegistrationBranchYear(branchCode, currentYear);
  const key = `${String(branchCode).trim()}::${String(configYear)}`;
  return stageConfig[key]?.optionalStages || [];
};

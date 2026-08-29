import {
  PARTIAL_COURSE_BRANCHES,
  resolveScholarshipStartYear,
  resolveRegistrationBranchYear,
  resolveCourseProgramYear
} from './registrationBranchYear';

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * Resolve program years from Colleges & Programs settings (frontend mirror of backend util).
 * Respects branch overrides, optional additional year, and partial-course branches.
 */
export const resolveStudentProgramYears = (student, coursesWithLevels = []) => {
  const courseName = student?.course;
  const branchName = student?.branch;
  const partialMeta = PARTIAL_COURSE_BRANCHES[branchName] || null;

  const courseObj = (coursesWithLevels || []).find((course) => course.name === courseName);
  const branchObj = (courseObj?.branches || []).find((branch) => branch.name === branchName);
  const structure = branchObj?.structure || courseObj?.structure;
  const branchMeta = branchObj?.metadata || {};

  let baseTotalYears = partialMeta?.branchTotalYears
    || toInt(structure?.totalYears, 0)
    || toInt(branchObj?.totalYears || courseObj?.totalYears, 0)
    || (Array.isArray(structure?.years) ? structure.years.length : 0)
    || 4;

  let totalYears = baseTotalYears;
  if (branchMeta?.hasAdditionalYear && branchMeta?.additionalYear) {
    totalYears = Math.max(totalYears, toInt(branchMeta.additionalYear, 0));
  }

  const currentYear = Math.max(1, toInt(student?.current_year, 1));
  totalYears = Math.min(Math.max(totalYears, currentYear), 10);

  const startYear = resolveScholarshipStartYear(student?.stud_type);
  const years = [];

  for (let studentYear = startYear; studentYear <= totalYears; studentYear += 1) {
    const isOptionalYear = Boolean(
      branchMeta?.hasAdditionalYear
      && toInt(branchMeta.additionalYear, 0) === studentYear
    );

    years.push({
      student_year: studentYear,
      label: `Year ${studentYear}`,
      isOptionalYear,
      isPartialBranch: Boolean(partialMeta),
      branchYear: partialMeta
        ? resolveRegistrationBranchYear(branchName, studentYear)
        : studentYear,
      courseYear: partialMeta
        ? resolveCourseProgramYear(branchName, studentYear)
        : studentYear
    });
  }

  return {
    totalYears,
    startYear,
    currentYear,
    years,
    branchMetadata: branchMeta,
    partialBranch: partialMeta,
    academicStructure: structure || null
  };
};

export const MERIT_STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

export const formatMeritStatusDisplay = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'yes') return 'Yes';
  if (normalized === 'no') return 'No';
  return '—';
};

const { buildStructureFromDbRow } = require('./courseAcademicStructure');
const {
  PARTIAL_COURSE_BRANCHES,
  resolveScholarshipStartYear,
  resolveRegistrationBranchYear,
  resolveCourseProgramYear
} = require('./registrationBranchYear');

const toInt = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const parseMetadata = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const fetchCourseBranchRow = async (pool, student) => {
  if (!student?.course) return null;

  const [rows] = await pool.query(
    `SELECT c.total_years, c.semesters_per_year, c.year_semester_config,
            cb.total_years AS branch_total_years,
            cb.semesters_per_year AS branch_semesters_per_year,
            cb.year_semester_config AS branch_year_semester_config,
            cb.metadata AS branch_metadata
     FROM courses c
     LEFT JOIN course_branches cb ON cb.course_id = c.id AND cb.name = ?
     WHERE c.name = ?
     LIMIT 1`,
    [student.branch || '', student.course]
  );

  return rows[0] || null;
};

/**
 * Resolve program years for a student using Colleges & Programs settings:
 * - branch total_years / year_semester_config overrides course defaults
 * - optional additional year from branch metadata
 * - partial-course branches (e.g. Pharm D PB) use branch-year numbering
 * - lateral-entry students skip non-existent Year 1
 */
const resolveStudentProgramYears = async (pool, student) => {
  const row = await fetchCourseBranchRow(pool, student);
  const structure = buildStructureFromDbRow(row);
  const branchMeta = parseMetadata(row?.branch_metadata);
  const partialMeta = PARTIAL_COURSE_BRANCHES[student.branch] || null;

  let baseTotalYears = partialMeta
    ? partialMeta.branchTotalYears
    : structure.totalYears;

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
        ? resolveRegistrationBranchYear(student.branch, studentYear)
        : studentYear,
      courseYear: partialMeta
        ? resolveCourseProgramYear(student.branch, studentYear)
        : studentYear,
      semesters: structure.getSemestersForYear(studentYear)
    });
  }

  return {
    totalYears,
    startYear,
    currentYear,
    years,
    academicStructure: {
      totalYears: structure.totalYears,
      semestersPerYear: structure.semestersPerYear,
      years: structure.years,
      yearSemesterConfig: structure.yearSemesterConfig
    },
    branchMetadata: branchMeta,
    partialBranch: partialMeta
  };
};

module.exports = {
  fetchCourseBranchRow,
  resolveStudentProgramYears
};

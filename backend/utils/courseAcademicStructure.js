const DEFAULT_TOTAL_YEARS = 4;
const DEFAULT_SEMESTERS_PER_YEAR = 2;
const MAX_YEARS = 10;
const MAX_SEMESTERS_PER_YEAR = 4;

const toInt = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const parseYearSemesterConfig = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const getYearSemesterConfigLength = (config) => {
  if (!Array.isArray(config) || !config.length) return 0;
  return config.reduce(
    (max, entry) => Math.max(max, toInt(entry?.year, 0)),
    config.length
  );
};

const buildCourseAcademicStructure = (courseConfig = null, branchConfig = null) => {
  const branchYearConfig = parseYearSemesterConfig(branchConfig?.year_semester_config);
  const courseYearConfig = parseYearSemesterConfig(courseConfig?.year_semester_config);
  const yearSemesterConfig = branchYearConfig || courseYearConfig;

  const branchTotalYears = toInt(branchConfig?.total_years, 0);
  const courseTotalYears = toInt(courseConfig?.total_years, 0);
  const configLength = getYearSemesterConfigLength(yearSemesterConfig);

  let totalYears = branchTotalYears || courseTotalYears || configLength || DEFAULT_TOTAL_YEARS;
  if (configLength > 0 && totalYears > configLength) {
    // Per-year config from Settings is authoritative when total_years is stale (e.g. schema default 4).
    totalYears = configLength;
  }
  totalYears = Math.min(Math.max(1, totalYears), MAX_YEARS);

  const defaultSemestersPerYear = Math.min(
    Math.max(
      1,
      toInt(branchConfig?.semesters_per_year, 0)
        || toInt(courseConfig?.semesters_per_year, 0)
        || DEFAULT_SEMESTERS_PER_YEAR
    ),
    MAX_SEMESTERS_PER_YEAR
  );

  const getSemestersForYear = (studentYear) => {
    const year = Math.max(1, toInt(studentYear, 1));
    if (Array.isArray(yearSemesterConfig)) {
      const yearConfig = yearSemesterConfig.find((entry) => toInt(entry?.year, 0) === year);
      const configured = toInt(yearConfig?.semesters, 0);
      if (configured > 0) {
        return Math.min(configured, MAX_SEMESTERS_PER_YEAR);
      }
    }
    return defaultSemestersPerYear;
  };

  const years = Array.from({ length: totalYears }, (_, index) => {
    const yearNumber = index + 1;
    const semesterCount = getSemestersForYear(yearNumber);
    return {
      yearNumber,
      label: `Year ${yearNumber}`,
      semesters: Array.from({ length: semesterCount }, (__unused, semIndex) => ({
        semesterNumber: semIndex + 1,
        label: `Semester ${semIndex + 1}`
      }))
    };
  });

  return {
    totalYears,
    semestersPerYear: defaultSemestersPerYear,
    yearSemesterConfig: yearSemesterConfig || null,
    years,
    getSemestersForYear
  };
};

const buildStructureFromDbRow = (row) => {
  if (!row) {
    return buildCourseAcademicStructure(null, null);
  }

  return buildCourseAcademicStructure(
    {
      total_years: row.total_years,
      semesters_per_year: row.semesters_per_year,
      year_semester_config: row.year_semester_config
    },
    row.branch_total_years != null
      || row.branch_semesters_per_year != null
      || row.branch_year_semester_config != null
      ? {
        total_years: row.branch_total_years,
        semesters_per_year: row.branch_semesters_per_year,
        year_semester_config: row.branch_year_semester_config
      }
      : null
  );
};

module.exports = {
  DEFAULT_TOTAL_YEARS,
  DEFAULT_SEMESTERS_PER_YEAR,
  parseYearSemesterConfig,
  buildCourseAcademicStructure,
  buildStructureFromDbRow
};

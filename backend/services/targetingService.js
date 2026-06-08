const TARGET_FIELDS = [
  'target_college',
  'target_batch',
  'target_course',
  'target_branch',
  'target_year',
  'target_semester'
];

const serializeTarget = (target) => {
  if (Array.isArray(target) && target.length > 0) {
    return JSON.stringify(target);
  }
  return null;
};

const parseTarget = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
};

const parseTargetsFromRow = (row) => ({
  target_college: parseTarget(row.target_college),
  target_batch: parseTarget(row.target_batch),
  target_course: parseTarget(row.target_course),
  target_branch: parseTarget(row.target_branch),
  target_year: parseTarget(row.target_year),
  target_semester: parseTarget(row.target_semester)
});

const isGlobalTarget = (targets = {}) =>
  TARGET_FIELDS.every((field) => {
    const values = targets[field];
    return !Array.isArray(values) || values.length === 0;
  });

const matchesStudent = (student, targets = {}) => {
  if (!student) return false;
  if (isGlobalTarget(targets)) return true;

  const checks = [
    ['target_college', student.college],
    ['target_batch', student.batch],
    ['target_course', student.course],
    ['target_branch', student.branch],
    ['target_year', student.current_year != null ? String(student.current_year) : ''],
    ['target_semester', student.current_semester != null ? String(student.current_semester) : '']
  ];

  return checks.every(([field, value]) => {
    const allowed = targets[field];
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    return allowed.includes(value);
  });
};

const matchesFilters = (filters = {}, targets = {}) => {
  if (isGlobalTarget(targets)) return true;

  const checks = [
    ['target_college', filters.college],
    ['target_batch', filters.batch],
    ['target_course', filters.course],
    ['target_branch', filters.branch],
    ['target_year', filters.currentYear != null ? String(filters.currentYear) : ''],
    ['target_semester', filters.currentSemester != null ? String(filters.currentSemester) : '']
  ];

  return checks.every(([field, value]) => {
    const allowed = targets[field];
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    if (!value) return allowed.length > 0;
    return allowed.includes(value);
  });
};

const buildStudentWhereClause = (targets = {}, tableAlias = 's') => {
  const conditions = [];
  const params = [];
  const prefix = tableAlias ? `${tableAlias}.` : '';

  const mappings = [
    ['target_college', 'college'],
    ['target_batch', 'batch'],
    ['target_course', 'course'],
    ['target_branch', 'branch'],
    ['target_year', 'current_year'],
    ['target_semester', 'current_semester']
  ];

  mappings.forEach(([targetField, column]) => {
    const values = targets[targetField];
    if (Array.isArray(values) && values.length > 0) {
      conditions.push(`${prefix}${column} IN (?)`);
      params.push(values);
    }
  });

  return { conditions, params };
};

const formatTargetLabel = (targets = {}) => {
  if (isGlobalTarget(targets)) return 'All students';

  const parts = [];
  if (targets.target_college?.length) parts.push(`Colleges: ${targets.target_college.join(', ')}`);
  if (targets.target_batch?.length) parts.push(`Batches: ${targets.target_batch.join(', ')}`);
  if (targets.target_course?.length) parts.push(`Programs: ${targets.target_course.join(', ')}`);
  if (targets.target_branch?.length) parts.push(`Branches: ${targets.target_branch.join(', ')}`);
  if (targets.target_year?.length) parts.push(`Years: ${targets.target_year.join(', ')}`);
  if (targets.target_semester?.length) parts.push(`Semesters: ${targets.target_semester.join(', ')}`);

  return parts.join(' · ') || 'All students';
};

const extractTargetsFromBody = (body = {}) => ({
  target_college: parseTarget(body.target_college),
  target_batch: parseTarget(body.target_batch),
  target_course: parseTarget(body.target_course),
  target_branch: parseTarget(body.target_branch),
  target_year: parseTarget(body.target_year),
  target_semester: parseTarget(body.target_semester)
});

module.exports = {
  TARGET_FIELDS,
  serializeTarget,
  parseTarget,
  parseTargetsFromRow,
  isGlobalTarget,
  matchesStudent,
  matchesFilters,
  buildStudentWhereClause,
  formatTargetLabel,
  extractTargetsFromBody
};

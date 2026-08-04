const { masterPool } = require('../config/database');

const SECTION_COLLATE = 'utf8mb4_unicode_ci';

const collatedSectionExpr = (expr) =>
  `NULLIF(TRIM(CAST(${expr} AS CHAR CHARACTER SET utf8mb4) COLLATE ${SECTION_COLLATE}), '' COLLATE ${SECTION_COLLATE})`;

/** Canonical section value: students.section column only (entire application). */
const resolveStudentSectionSql = (alias = 'students') =>
  collatedSectionExpr(`${alias}.section`);

/** @deprecated Use resolveStudentSectionSql — same source (students.section). */
const resolveManualStudentSectionSql = resolveStudentSectionSql;

const resolveStudentPinSql = (alias = 'students') => `NULLIF(TRIM(COALESCE(
  NULLIF(TRIM(${alias}.pin_no), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.pin_no'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$."Pin Number"'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.pin_number'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.PIN'))), '')
)), '')`;

const resolveStudentNameSql = (alias = 'students') => `NULLIF(TRIM(COALESCE(
  NULLIF(TRIM(${alias}.student_name), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.student_name'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$."Student Name"'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.name'))), '')
)), '')`;

const parseBranchMetadata = (metadata) => {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  return metadata;
};

const getConfiguredSectionsForBranch = async ({ course, branch } = {}) => {
  if (!branch) {
    return { courseName: course || null, configuredSections: [] };
  }

  if (course) {
    let courseRows;
    if (/^\d+$/.test(course)) {
      [courseRows] = await masterPool.query(
        'SELECT id, name FROM courses WHERE id = ? AND is_active = 1 LIMIT 1',
        [parseInt(course, 10)]
      );
    } else {
      [courseRows] = await masterPool.query(
        'SELECT id, name FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
        [course]
      );
    }

    if (courseRows.length === 0) {
      return { courseName: course, configuredSections: [] };
    }

    let branchRows;
    if (/^\d+$/.test(branch)) {
      [branchRows] = await masterPool.query(
        'SELECT metadata FROM course_branches WHERE course_id = ? AND id = ? AND is_active = 1 LIMIT 1',
        [courseRows[0].id, parseInt(branch, 10)]
      );
    } else {
      [branchRows] = await masterPool.query(
        'SELECT metadata FROM course_branches WHERE course_id = ? AND name = ? AND is_active = 1 LIMIT 1',
        [courseRows[0].id, branch]
      );
    }

    if (branchRows.length === 0 || !branchRows[0].metadata) {
      return { courseName: courseRows[0].name, configuredSections: [] };
    }

    const metadata = parseBranchMetadata(branchRows[0].metadata);
    if (!metadata?.sections?.enabled || !Array.isArray(metadata.sections.items)) {
      return { courseName: course, configuredSections: [] };
    }

    return {
      courseName: courseRows[0].name,
      configuredSections: metadata.sections.items.map((item) => item?.name).filter(Boolean)
    };
  }

  let branchRows;
  if (/^\d+$/.test(branch)) {
    [branchRows] = await masterPool.query(
      `SELECT cb.metadata, c.name AS course_name
       FROM course_branches cb
       JOIN courses c ON cb.course_id = c.id
       WHERE cb.id = ? AND cb.is_active = 1 AND c.is_active = 1`,
      [parseInt(branch, 10)]
    );
  } else {
    [branchRows] = await masterPool.query(
      `SELECT cb.metadata, c.name AS course_name
       FROM course_branches cb
       JOIN courses c ON cb.course_id = c.id
       WHERE cb.name = ? AND cb.is_active = 1 AND c.is_active = 1`,
      [branch]
    );
  }

  for (const row of branchRows) {
    const metadata = parseBranchMetadata(row.metadata);
    if (!metadata?.sections?.enabled || !Array.isArray(metadata.sections.items)) {
      continue;
    }

    const configuredSections = metadata.sections.items.map((item) => item?.name).filter(Boolean);
    if (configuredSections.length > 0) {
      return { courseName: row.course_name, configuredSections };
    }
  }

  return { courseName: null, configuredSections: [] };
};

/** Distinct section values from students.section only. */
const fetchStudentTableSectionOptions = async ({ course, branch, batch, year, semester, college } = {}) => {
  const studentParams = [];
  let studentWhere = 'WHERE section IS NOT NULL AND TRIM(section) <> \'\'';

  if (branch) {
    studentWhere += ' AND branch = ?';
    studentParams.push(branch);
  }
  if (course) {
    studentWhere += ' AND course = ?';
    studentParams.push(course);
  }
  if (college) {
    studentWhere += ' AND college = ?';
    studentParams.push(college);
  }
  if (batch) {
    studentWhere += ' AND batch = ?';
    studentParams.push(batch);
  }
  if (year) {
    studentWhere += ' AND current_year = ?';
    studentParams.push(parseInt(year, 10));
  }
  if (semester) {
    studentWhere += ' AND current_semester = ?';
    studentParams.push(parseInt(semester, 10));
  }

  try {
    const [rows] = await masterPool.query(
      `SELECT DISTINCT TRIM(section) AS section
       FROM students
       ${studentWhere}
       ORDER BY section ASC`,
      studentParams
    );
    return rows.map((row) => row.section).filter(Boolean);
  } catch (error) {
    console.warn('Failed to fetch student table section options:', error);
    return [];
  }
};

const fetchSectionFilterOptions = async (filters = {}) => fetchStudentTableSectionOptions(filters);

module.exports = {
  resolveStudentSectionSql,
  resolveManualStudentSectionSql,
  resolveStudentPinSql,
  resolveStudentNameSql,
  fetchSectionFilterOptions,
  fetchStudentTableSectionOptions,
  getConfiguredSectionsForBranch
};

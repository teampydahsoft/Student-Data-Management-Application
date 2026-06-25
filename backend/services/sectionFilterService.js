const { masterPool } = require('../config/database');

const resolveStudentSectionSql = (alias = 'students') => `COALESCE(
  (SELECT ss.section_name FROM student_sections ss WHERE ss.student_id = ${alias}.id LIMIT 1),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.section'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${alias}.student_data, '$.Section'))), '')
)`;

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
    const [courseRows] = await masterPool.query(
      'SELECT id FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
      [course]
    );
    if (courseRows.length === 0) {
      return { courseName: course, configuredSections: [] };
    }

    const [branchRows] = await masterPool.query(
      'SELECT metadata FROM course_branches WHERE course_id = ? AND name = ? AND is_active = 1 LIMIT 1',
      [courseRows[0].id, branch]
    );
    if (branchRows.length === 0 || !branchRows[0].metadata) {
      return { courseName: course, configuredSections: [] };
    }

    const metadata = parseBranchMetadata(branchRows[0].metadata);
    if (!metadata?.sections?.enabled || !Array.isArray(metadata.sections.items)) {
      return { courseName: course, configuredSections: [] };
    }

    return {
      courseName: course,
      configuredSections: metadata.sections.items.map((item) => item?.name).filter(Boolean)
    };
  }

  const [branchRows] = await masterPool.query(
    `SELECT cb.metadata, c.name AS course_name
     FROM course_branches cb
     JOIN courses c ON cb.course_id = c.id
     WHERE cb.name = ? AND cb.is_active = 1 AND c.is_active = 1`,
    [branch]
  );

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

const fetchSectionFilterOptions = async ({ course, branch, batch, year, semester, college } = {}) => {
  if (!branch) {
    return [];
  }

  try {
    const { courseName, configuredSections } = await getConfiguredSectionsForBranch({ course, branch });
    if (configuredSections.length === 0) {
      return [];
    }

    const studentParams = [];
    let studentWhere = 'WHERE s.branch = ?';
    studentParams.push(branch);

    if (course) {
      studentWhere += ' AND s.course = ?';
      studentParams.push(course);
    } else if (courseName) {
      studentWhere += ' AND s.course = ?';
      studentParams.push(courseName);
    }

    if (college) {
      studentWhere += ' AND s.college = ?';
      studentParams.push(college);
    }
    if (batch) {
      studentWhere += ' AND s.batch = ?';
      studentParams.push(batch);
    }
    if (year) {
      studentWhere += ' AND s.current_year = ?';
      studentParams.push(parseInt(year, 10));
    }
    if (semester) {
      studentWhere += ' AND s.current_semester = ?';
      studentParams.push(parseInt(semester, 10));
    }

    const [assignedRows] = await masterPool.query(
      `SELECT DISTINCT ss.section_name AS section
       FROM student_sections ss
       INNER JOIN students s ON s.id = ss.student_id
       ${studentWhere}
       ORDER BY ss.section_name ASC`,
      studentParams
    );

    let assignedSections = assignedRows.map((row) => row.section).filter(Boolean);

    if (assignedSections.length === 0) {
      let jsonWhere = `
        WHERE branch = ?
          AND (
            (JSON_EXTRACT(student_data, '$.section') IS NOT NULL
              AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.section'))) <> '')
            OR (JSON_EXTRACT(student_data, '$.Section') IS NOT NULL
              AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.Section'))) <> '')
          )`;
      const jsonParams = [branch];

      if (course) {
        jsonWhere += ' AND course = ?';
        jsonParams.push(course);
      } else if (courseName) {
        jsonWhere += ' AND course = ?';
        jsonParams.push(courseName);
      }
      if (college) {
        jsonWhere += ' AND college = ?';
        jsonParams.push(college);
      }
      if (batch) {
        jsonWhere += ' AND batch = ?';
        jsonParams.push(batch);
      }
      if (year) {
        jsonWhere += ' AND current_year = ?';
        jsonParams.push(parseInt(year, 10));
      }
      if (semester) {
        jsonWhere += ' AND current_semester = ?';
        jsonParams.push(parseInt(semester, 10));
      }

      const [jsonRows] = await masterPool.query(
        `SELECT DISTINCT COALESCE(
           NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.section'))), ''),
           NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.Section'))), '')
         ) AS section
         FROM students
         ${jsonWhere}
         ORDER BY section ASC`,
        jsonParams
      );
      assignedSections = jsonRows.map((row) => row.section).filter(Boolean);
    }

    if (assignedSections.length === 0) {
      if (batch || year || semester || college) {
        return [];
      }
      return configuredSections;
    }

    const assignedSet = new Set(assignedSections);
    const orderedConfigured = configuredSections.filter((name) => assignedSet.has(name));
    const extras = assignedSections.filter((name) => !configuredSections.includes(name));

    return [...orderedConfigured, ...extras];
  } catch (error) {
    console.warn('Failed to fetch section filter options:', error);
    return [];
  }
};

module.exports = {
  resolveStudentSectionSql,
  fetchSectionFilterOptions,
  getConfiguredSectionsForBranch
};

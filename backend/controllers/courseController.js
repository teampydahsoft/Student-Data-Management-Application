const { masterPool } = require('../config/database');
const { filterCoursesByScope, filterBranchesByScope } = require('../utils/scoping');

const DEFAULT_SEMESTERS_PER_YEAR = 2;
const MAX_YEARS = 10;
const MAX_SEMESTERS_PER_YEAR = 4;

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
  }
  return fallback;
};

const toInt = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const sanitizeStageConfig = ({ totalYears, semestersPerYear }) => {
  const years = Math.min(Math.max(toInt(totalYears, 0), 0), MAX_YEARS);
  const sems = Math.min(
    Math.max(toInt(semestersPerYear, DEFAULT_SEMESTERS_PER_YEAR), 1),
    MAX_SEMESTERS_PER_YEAR
  );
  return {
    totalYears: years,
    semestersPerYear: sems
  };
};

const buildStructure = (courseConfig, branchConfig) => {
  const yearsConfig = sanitizeStageConfig({
    totalYears: branchConfig?.total_years ?? courseConfig.total_years,
    semestersPerYear:
      branchConfig?.semesters_per_year ?? courseConfig.semesters_per_year
  });

  // Check for per-year semester configuration
  const yearSemesterConfig = branchConfig?.year_semester_config
    ? (typeof branchConfig.year_semester_config === 'string'
      ? JSON.parse(branchConfig.year_semester_config)
      : branchConfig.year_semester_config)
    : courseConfig?.year_semester_config
      ? (typeof courseConfig.year_semester_config === 'string'
        ? JSON.parse(courseConfig.year_semester_config)
        : courseConfig.year_semester_config)
      : null;

  const years = Array.from({ length: yearsConfig.totalYears }, (_, index) => {
    const yearNumber = index + 1;

    // Get semester count for this year
    let semesterCount = yearsConfig.semestersPerYear; // Default fallback

    if (Array.isArray(yearSemesterConfig)) {
      const yearConfig = yearSemesterConfig.find(y => y.year === yearNumber);
      if (yearConfig && yearConfig.semesters) {
        semesterCount = yearConfig.semesters;
      }
    }

    const semesters = Array.from(
      { length: semesterCount },
      (__unused, semIndex) => {
        const semesterNumber = semIndex + 1;
        return {
          semesterNumber,
          label: `Semester ${semesterNumber}`
        };
      }
    );
    return {
      yearNumber,
      label: `Year ${yearNumber}`,
      semesters
    };
  });

  return {
    totalYears: yearsConfig.totalYears,
    semestersPerYear: yearsConfig.semestersPerYear,
    years
  };
};

const serializeBranchRow = (branchRow, academicYears = null) => {
  // If academicYears array is provided (from junction table), use it
  // Otherwise, fall back to single academicYearId (backward compatibility for old data)
  const academicYearIds = academicYears
    ? academicYears.map(ay => ay.id).filter(Boolean)
    : (branchRow.academic_year_id ? [branchRow.academic_year_id] : []);

  const academicYearLabels = academicYears
    ? academicYears.map(ay => ay.year_label).filter(Boolean)
    : (branchRow.academic_year_label ? [branchRow.academic_year_label] : []);

  return {
    id: branchRow.id,
    courseId: branchRow.course_id,
    name: branchRow.name,
    code: branchRow.code || null,
    isActive: branchRow.is_active === 1 || branchRow.is_active === true,
    totalYears: branchRow.total_years ?? null,
    semestersPerYear: branchRow.semesters_per_year ?? null,
    yearSemesterConfig: branchRow.year_semester_config
      ? (typeof branchRow.year_semester_config === 'string'
        ? JSON.parse(branchRow.year_semester_config)
        : branchRow.year_semester_config)
      : null,
    // Backward compatibility: single academicYearId (first one if multiple)
    academicYearId: academicYearIds.length > 0 ? academicYearIds[0] : null,
    academicYearLabel: academicYearLabels.length > 0 ? academicYearLabels[0] : null,
    // New: array of academic years (from junction table)
    academicYearIds: academicYearIds,
    academicYearLabels: academicYearLabels,
    metadata: branchRow.metadata
      ? (typeof branchRow.metadata === 'string' ? JSON.parse(branchRow.metadata) : branchRow.metadata)
      : null
  };
};

const buildFeeQrImageUrl = (courseId, updatedAt, hasFeeQr) => {
  if (!hasFeeQr) return null;
  const version = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `/api/courses/${courseId}/fee-qr?v=${version}`;
};

const formatCourse = (courseRow, branchRows = []) => {
  const branches = branchRows.map((branch) => ({
    ...serializeBranchRow(branch, branch._academicYears),
    structure: buildStructure(courseRow, branch)
  }));

  return {
    id: courseRow.id,
    collegeId: courseRow.college_id || null,
    name: courseRow.name,
    code: courseRow.code || null,
    level: courseRow.level || 'ug',
    isActive: courseRow.is_active === 1 || courseRow.is_active === true,
    totalYears: courseRow.total_years,
    semestersPerYear: courseRow.semesters_per_year,
    yearSemesterConfig: courseRow.year_semester_config
      ? (typeof courseRow.year_semester_config === 'string'
        ? JSON.parse(courseRow.year_semester_config)
        : courseRow.year_semester_config)
      : null,
    metadata: courseRow.metadata
      ? (typeof courseRow.metadata === 'string' ? JSON.parse(courseRow.metadata) : courseRow.metadata)
      : null,
    feeQrImageUrl: buildFeeQrImageUrl(
      courseRow.id,
      courseRow.updated_at,
      Boolean(courseRow.fee_qr_image_type)
    ),
    structure: buildStructure(courseRow),
    branches
  };
};

const fetchCoursesWithBranches = async ({ includeInactive = false, collegeId = null } = {}) => {
  const whereConditions = [];
  const queryParams = [];

  if (!includeInactive) {
    whereConditions.push('is_active = 1');
  }

  if (collegeId !== null && collegeId !== undefined) {
    const parsedCollegeId = parseInt(collegeId, 10);
    if (!Number.isNaN(parsedCollegeId)) {
      whereConditions.push('college_id = ?');
      queryParams.push(parsedCollegeId);
    }
  }

  const courseWhereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Fetch branches using junction table
  const branchQuery = includeInactive
    ? `SELECT DISTINCT cb.*
       FROM course_branches cb 
       WHERE cb.course_id IN (?) ORDER BY cb.name ASC`
    : `SELECT DISTINCT cb.*
       FROM course_branches cb 
       WHERE cb.is_active = 1 AND cb.course_id IN (?) ORDER BY cb.name ASC`;

  const [courses] = await masterPool.query(
    `SELECT * FROM courses ${courseWhereClause} ORDER BY name ASC`,
    queryParams
  );

  if (!courses || courses.length === 0) {
    return [];
  }

  const courseIds = courses.map((course) => course.id);
  const [branches] = await masterPool.query(branchQuery, [courseIds]);

  // Fetch academic years for all branches from junction table
  if (branches && branches.length > 0) {
    const branchIds = branches.map(b => b.id);
    const [academicYearsData] = await masterPool.query(`
      SELECT bay.branch_id, ay.id, ay.year_label, ay.is_active
      FROM branch_academic_years bay
      JOIN academic_years ay ON bay.academic_year_id = ay.id
      WHERE bay.branch_id IN (?)
      ORDER BY ay.year_label ASC
    `, [branchIds]);

    // Group academic years by branch_id
    const academicYearsByBranch = {};
    academicYearsData.forEach(row => {
      if (!academicYearsByBranch[row.branch_id]) {
        academicYearsByBranch[row.branch_id] = [];
      }
      academicYearsByBranch[row.branch_id].push({
        id: row.id,
        year_label: row.year_label,
        is_active: row.is_active
      });
    });

    // Attach academic years to branches
    branches.forEach(branch => {
      branch._academicYears = academicYearsByBranch[branch.id] || [];
    });
  }

  return courses.map((course) =>
    formatCourse(
      course,
      branches
        ? branches.filter((branch) => branch.course_id === course.id)
        : []
    )
  );
};

const validateCoursePayload = (payload, { isUpdate = false } = {}) => {
  const errors = [];

  const name = payload.name?.trim();
  const code = payload.code?.trim();

  if (!isUpdate || name !== undefined) {
    if (!name) {
      errors.push('Course name is required');
    } else if (name.length > 255) {
      errors.push('Course name must be less than 255 characters');
    }
  }

  if (!isUpdate || code !== undefined) {
    if (!code) {
      errors.push('Course code is required');
    } else if (code.length > 50) {
      errors.push('Course code must be less than 50 characters');
    }
  }

  const level = payload.level || 'ug';
  if (!['diploma', 'ug', 'pg'].includes(level)) {
    errors.push('Level must be one of: diploma, ug, pg');
  }

  const totalYears = toInt(payload.totalYears ?? payload.total_years, 0);
  const semestersPerYear = toInt(
    payload.semestersPerYear ?? payload.semesters_per_year,
    DEFAULT_SEMESTERS_PER_YEAR
  );

  // Validate yearSemesterConfig if provided
  let yearSemesterConfig = null;
  if (payload.yearSemesterConfig || payload.year_semester_config) {
    const config = payload.yearSemesterConfig || payload.year_semester_config;
    if (Array.isArray(config)) {
      // Validate each year config
      for (const yearConfig of config) {
        if (!yearConfig.year || !yearConfig.semesters) {
          errors.push('Each year in yearSemesterConfig must have year and semesters');
          break;
        }
        if (yearConfig.year < 1 || yearConfig.year > MAX_YEARS) {
          errors.push(`Year number must be between 1 and ${MAX_YEARS}`);
          break;
        }
        if (yearConfig.semesters < 1 || yearConfig.semesters > MAX_SEMESTERS_PER_YEAR) {
          errors.push(`Semesters per year must be between 1 and ${MAX_SEMESTERS_PER_YEAR}`);
          break;
        }
      }
      yearSemesterConfig = config;
    } else {
      errors.push('yearSemesterConfig must be an array');
    }
  }

  if (!isUpdate || payload.totalYears !== undefined || payload.total_years !== undefined) {
    if (totalYears <= 0 || totalYears > MAX_YEARS) {
      errors.push(
        `totalYears must be between 1 and ${MAX_YEARS}`
      );
    }
  }

  if (
    !isUpdate ||
    payload.semestersPerYear !== undefined ||
    payload.semesters_per_year !== undefined
  ) {
    if (
      semestersPerYear <= 0 ||
      semestersPerYear > MAX_SEMESTERS_PER_YEAR
    ) {
      errors.push(
        `semestersPerYear must be between 1 and ${MAX_SEMESTERS_PER_YEAR}`
      );
    }
  }

  const branches = Array.isArray(payload.branches)
    ? payload.branches
    : [];

  return {
    errors,
    sanitized: {
      name,
      code,
      level,
      totalYears,
      semestersPerYear,
      yearSemesterConfig,
      isActive: parseBoolean(payload.isActive ?? payload.is_active, true),
      metadata: payload.metadata ?? null,
      branches
    }
  };
};

const validateBranchPayload = (
  branchPayload = {},
  {
    defaultYears = 0,
    defaultSemesters = DEFAULT_SEMESTERS_PER_YEAR,
    isUpdate = false
  } = {}
) => {
  const errors = [];

  const name =
    branchPayload.name !== undefined
      ? branchPayload.name?.trim()
      : undefined;
  const code =
    branchPayload.code !== undefined
      ? branchPayload.code?.trim()
      : undefined;

  if (!isUpdate || name !== undefined) {
    if (!name) {
      errors.push('Branch name is required');
    } else if (name.length > 255) {
      errors.push('Branch name must be less than 255 characters');
    }
  }

  if (!isUpdate || code !== undefined) {
    if (!code) {
      errors.push('Branch code is required');
    } else if (code.length > 50) {
      errors.push('Branch code must be less than 50 characters');
    }
  }

  const totalYears = toInt(
    branchPayload.totalYears ?? branchPayload.total_years,
    defaultYears
  );
  const semestersPerYear = toInt(
    branchPayload.semestersPerYear ?? branchPayload.semesters_per_year,
    defaultSemesters
  );

  // Parse academic year ID(s) - support both single and array
  const academicYearId = branchPayload.academicYearId ?? branchPayload.academic_year_id;
  const academicYearIds = branchPayload.academicYearIds ?? branchPayload.academic_year_ids;
  // If array is provided, use it; otherwise fall back to single ID
  const finalAcademicYearIds = academicYearIds
    ? (Array.isArray(academicYearIds) ? academicYearIds : [academicYearIds])
    : (academicYearId ? [academicYearId] : []);

  if (!isUpdate || branchPayload.totalYears !== undefined || branchPayload.total_years !== undefined) {
    if (totalYears <= 0 || totalYears > MAX_YEARS) {
      errors.push(`Branch totalYears must be between 1 and ${MAX_YEARS}`);
    }
  }

  if (
    !isUpdate ||
    branchPayload.semestersPerYear !== undefined ||
    branchPayload.semesters_per_year !== undefined
  ) {
    if (
      semestersPerYear <= 0 ||
      semestersPerYear > MAX_SEMESTERS_PER_YEAR
    ) {
      errors.push(
        `Branch semestersPerYear must be between 1 and ${MAX_SEMESTERS_PER_YEAR}`
      );
    }
  }

  return {
    errors,
    sanitized: {
      name,
      code,
      totalYears,
      semestersPerYear,
      academicYearId: academicYearId ? parseInt(academicYearId, 10) : null,
      academicYearIds: finalAcademicYearIds.map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id)),
      metadata: branchPayload.metadata ?? null,
      isActive: parseBoolean(
        branchPayload.isActive ?? branchPayload.is_active,
        true
      )
    }
  };
};

exports.getCourses = async (req, res) => {
  try {
    const includeInactive = parseBoolean(req.query.includeInactive, false);
    const collegeId = req.query.collegeId ? parseInt(req.query.collegeId, 10) : null;

    let courses = await fetchCoursesWithBranches({
      includeInactive,
      collegeId: Number.isNaN(collegeId) ? null : collegeId
    });

    // Apply user scope filtering for courses
    if (req.userScope && !req.userScope.unrestricted && !req.userScope.allCourses) {
      courses = filterCoursesByScope(courses, req.userScope);
    }

    // Apply user scope filtering for branches within each course
    if (req.userScope && !req.userScope.unrestricted && !req.userScope.allBranches) {
      courses = courses.map(course => ({
        ...course,
        branches: filterBranchesByScope(course.branches || [], req.userScope)
      }));
    }

    // No caching to ensure fresh data after updates
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error('getCourses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses'
    });
  }
};

exports.getCourseOptions = async (_req, res) => {
  try {
    const courses = await fetchCoursesWithBranches({ includeInactive: false });

    const sanitized = courses.map((course) => ({
      name: course.name,
      level: course.level || 'ug',
      isActive: course.isActive,
      structure: course.structure,
      metadata: course.metadata || null,
      branches: (course.branches || []).map((branch) => ({
        name: branch.name,
        isActive: branch.isActive,
        structure: branch.structure,
        metadata: branch.metadata || null
      }))
    }));

    // No caching to ensure fresh data after updates
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      success: true,
      data: sanitized
    });
  } catch (error) {
    console.error('getCourseOptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course configuration'
    });
  }
};

exports.createCourse = async (req, res) => {
  const connection = await masterPool.getConnection();

  try {
    // Validate collegeId
    const collegeId = req.body.collegeId ? parseInt(req.body.collegeId, 10) : null;
    if (!collegeId || Number.isNaN(collegeId)) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'collegeId is required and must be a valid number'
      });
    }

    // Validate college exists
    const collegeService = require('../services/collegeService');
    const collegeExists = await collegeService.validateCollegeExists(collegeId);
    if (!collegeExists) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    const { errors, sanitized } = validateCoursePayload(req.body || {});

    const branchValidationResults = (sanitized.branches || []).map((branch, index) => {
      const result = validateBranchPayload(branch, {
        defaultYears: sanitized.totalYears,
        defaultSemesters: sanitized.semestersPerYear,
        isUpdate: false
      });
      return { index, ...result };
    });

    branchValidationResults.forEach((result) => {
      result.errors.forEach((err) =>
        errors.push(`Branch ${result.index + 1}: ${err}`)
      );
    });

    if (errors.length > 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    const metadataJson =
      sanitized.metadata && typeof sanitized.metadata === 'object'
        ? JSON.stringify(sanitized.metadata)
        : sanitized.metadata;

    await connection.beginTransaction();

    const yearSemesterConfigJson = sanitized.yearSemesterConfig
      ? JSON.stringify(sanitized.yearSemesterConfig)
      : null;

    const [courseResult] = await connection.query(
      `INSERT INTO courses (name, code, level, college_id, total_years, semesters_per_year, year_semester_config, metadata, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sanitized.name,
        sanitized.code,
        sanitized.level,
        collegeId,
        sanitized.totalYears,
        sanitized.semestersPerYear,
        yearSemesterConfigJson,
        metadataJson || null,
        sanitized.isActive
      ]
    );

    const courseId = courseResult.insertId;

    if (branchValidationResults.length > 0) {
      const branchValues = branchValidationResults.map(({ sanitized: branch }) => {
        const branchMetadata =
          branch.metadata && typeof branch.metadata === 'object'
            ? JSON.stringify(branch.metadata)
            : branch.metadata;
        return [
          courseId,
          branch.name.trim(),
          branch.code,
          branch.totalYears,
          branch.semestersPerYear,
          branchMetadata || null,
          branch.isActive
        ];
      });

      await connection.query(
        `INSERT INTO course_branches
          (course_id, name, code, total_years, semesters_per_year, metadata, is_active)
         VALUES ?`,
        [branchValues]
      );
    }

    await connection.commit();

    const [createdCourseRows] = await connection.query(
      'SELECT * FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    const [branchRows] = await connection.query(
      'SELECT * FROM course_branches WHERE course_id = ? ORDER BY name ASC',
      [courseId]
    );

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: formatCourse(createdCourseRows[0], branchRows)
    });
  } catch (error) {
    await connection.rollback();
    console.error('createCourse error:', error);
    let errorMessage = 'Failed to create course';
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('unique_course_name_college') || error.message.includes('unique_course_name')) {
        errorMessage = 'Course with the same name already exists in this college';
      } else if (error.message.includes('unique_course_code_college') || error.message.includes('unique_course_code')) {
        errorMessage = 'Course with the same code already exists in this college';
      } else {
        errorMessage = 'Course with the same name or code already exists in this college';
      }
    }
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

exports.updateCourse = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);

  if (!courseId || Number.isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course ID'
    });
  }

  try {
    // Fetch existing course to get old name for cascade update
    const [existingCourse] = await masterPool.query(
      'SELECT * FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (!existingCourse || existingCourse.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const oldCourseName = existingCourse[0].name;

    const { errors, sanitized } = validateCoursePayload(req.body || {}, {
      isUpdate: true
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    const fields = [];
    const values = [];
    let newCourseName = null;

    if (sanitized.name !== undefined) {
      fields.push('name = ?');
      newCourseName = sanitized.name;
      values.push(sanitized.name);
    }

    if (sanitized.code !== undefined) {
      fields.push('code = ?');
      values.push(sanitized.code);
    }

    if (
      req.body.totalYears !== undefined ||
      req.body.total_years !== undefined
    ) {
      fields.push('total_years = ?');
      values.push(sanitized.totalYears);
    }

    if (
      req.body.semestersPerYear !== undefined ||
      req.body.semesters_per_year !== undefined
    ) {
      fields.push('semesters_per_year = ?');
      values.push(sanitized.semestersPerYear);
    }

    if (
      req.body.yearSemesterConfig !== undefined ||
      req.body.year_semester_config !== undefined
    ) {
      fields.push('year_semester_config = ?');
      values.push(sanitized.yearSemesterConfig ? JSON.stringify(sanitized.yearSemesterConfig) : null);
    }

    if (req.body.collegeId !== undefined) {
      const collegeId = parseInt(req.body.collegeId, 10);
      if (Number.isNaN(collegeId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid collegeId'
        });
      }
      // Validate college exists
      const collegeService = require('../services/collegeService');
      const collegeExists = await collegeService.validateCollegeExists(collegeId);
      if (!collegeExists) {
        return res.status(404).json({
          success: false,
          message: 'College not found'
        });
      }
      fields.push('college_id = ?');
      values.push(collegeId);
    }

    if (req.body.level !== undefined) {
      // Validate level if provided
      const level = req.body.level;
      if (!['diploma', 'ug', 'pg'].includes(level)) {
        return res.status(400).json({
          success: false,
          message: 'Level must be one of: diploma, ug, pg'
        });
      }
      fields.push('level = ?');
      values.push(level);
    }

    if (req.body.metadata !== undefined) {
      fields.push('metadata = ?');
      const metadataJson =
        sanitized.metadata && typeof sanitized.metadata === 'object'
          ? JSON.stringify(sanitized.metadata)
          : sanitized.metadata;
      values.push(metadataJson || null);
    }

    if (
      req.body.isActive !== undefined ||
      req.body.is_active !== undefined
    ) {
      fields.push('is_active = ?');
      values.push(sanitized.isActive);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No course fields provided for update'
      });
    }

    values.push(courseId);

    // Update course in courses table
    await masterPool.query(
      `UPDATE courses SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    // If course name was changed, cascade update to students table
    let studentsUpdated = 0;
    if (newCourseName && newCourseName !== oldCourseName) {
      const [updateResult] = await masterPool.query(
        `UPDATE students 
         SET course = ?, 
             student_data = JSON_SET(
               IFNULL(student_data, '{}'), 
               '$.course', ?,
               '$.Course', ?,
               '$."Course Name"', ?
             ),
             updated_at = CURRENT_TIMESTAMP 
         WHERE course = ?`,
        [newCourseName, newCourseName, newCourseName, newCourseName, oldCourseName]
      );
      studentsUpdated = updateResult.affectedRows || 0;
      console.log(`Course rename cascade: Updated ${studentsUpdated} students from "${oldCourseName}" to "${newCourseName}"`);
    }

    const [courseRows] = await masterPool.query(
      'SELECT * FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    const [branchRows] = await masterPool.query(
      'SELECT * FROM course_branches WHERE course_id = ? ORDER BY name ASC',
      [courseId]
    );

    res.json({
      success: true,
      message: studentsUpdated > 0
        ? `Course updated successfully. ${studentsUpdated} student record(s) updated.`
        : 'Course updated successfully',
      data: formatCourse(courseRows[0], branchRows),
      studentsUpdated
    });
  } catch (error) {
    console.error('updateCourse error:', error);
    console.error('updateCourse error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.code === 'ER_DUP_ENTRY'
        ? (error.message.includes('unique_course_name_college') || error.message.includes('unique_course_name')
          ? 'Course with the same name already exists in this college'
          : error.message.includes('unique_course_code_college') || error.message.includes('unique_course_code')
            ? 'Course with the same code already exists in this college'
            : 'Course with the same name or code already exists in this college')
        : error.message || 'Failed to update course'
    });
  }
};

exports.deleteCourse = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const hard = req.query.hard === 'true' || req.body.hard === true;
  const cascade = req.query.cascade === 'true' || req.body.cascade === true;

  if (!courseId || Number.isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course ID'
    });
  }

  const connection = await masterPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get course name
    const [courseRow] = await connection.query(
      'SELECT name FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (courseRow.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const courseName = courseRow[0].name;
    let deletedStudents = 0;
    let deletedBranches = 0;

    if (cascade) {
      // Get all branches for this course
      const [branches] = await connection.query(
        'SELECT id, name FROM course_branches WHERE course_id = ?',
        [courseId]
      );

      deletedBranches = branches.length;

      // Delete students for each branch
      for (const branch of branches) {
        const [studentResult] = await connection.query(
          'DELETE FROM students WHERE course = ? AND branch = ?',
          [courseName, branch.name]
        );
        deletedStudents += studentResult.affectedRows;
      }

      // Delete all branches for this course
      await connection.query(
        'DELETE FROM course_branches WHERE course_id = ?',
        [courseId]
      );

      // Delete all students by course (in case branch matching didn't catch all)
      const [courseStudentResult] = await connection.query(
        'DELETE FROM students WHERE course = ?',
        [courseName]
      );
      deletedStudents += courseStudentResult.affectedRows;

      // Delete the course
      const [result] = await connection.query(
        'DELETE FROM courses WHERE id = ?',
        [courseId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }

      await connection.commit();

      res.json({
        success: true,
        deletedStudents,
        deletedBranches,
        message: 'Course and all related data deleted successfully.'
      });
    } else {
      // Non-cascade: Check if course has branches
      const [branchRows] = await connection.query(
        'SELECT COUNT(*) as count FROM course_branches WHERE course_id = ?',
        [courseId]
      );

      if (branchRows[0].count > 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: 'Cannot delete course: it still has branches assigned. Please delete branches first.'
        });
      }

      // Check if course has students
      const [studentRows] = await connection.query(
        'SELECT COUNT(*) as count FROM students WHERE course = ?',
        [courseName]
      );

      if (studentRows[0].count > 0 && !hard) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: `Cannot delete course: it has ${studentRows[0].count} student(s) assigned. Use hard delete to force deletion.`
        });
      }

      if (hard) {
        // Hard delete - actually remove from database
        const [result] = await connection.query(
          'DELETE FROM courses WHERE id = ?',
          [courseId]
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Course not found'
          });
        }

        await connection.commit();
        connection.release();

        res.json({
          success: true,
          message: 'Course deleted successfully'
        });
      } else {
        // Soft delete - deactivate
        const [result] = await connection.query(
          'UPDATE courses SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [courseId]
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Course not found'
          });
        }

        await connection.commit();
        connection.release();

        res.json({
          success: true,
          message: 'Course deactivated successfully'
        });
      }
    }
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('deleteCourse error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete course'
    });
  }
};

exports.createBranch = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);

  if (!courseId || Number.isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course ID'
    });
  }

  try {
    const [courseRows] = await masterPool.query(
      'SELECT * FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (!courseRows || courseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const course = courseRows[0];

    const { errors, sanitized } = validateBranchPayload(req.body || {}, {
      defaultYears: course.total_years,
      defaultSemesters: course.semesters_per_year,
      isUpdate: false
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    // Academic years are optional - branch can be created without batches and batches can be added later
    // If provided, we'll associate them with the branch
    const academicYearIds = sanitized.academicYearIds || [];

    const branchMetadata =
      sanitized.metadata && typeof sanitized.metadata === 'object'
        ? JSON.stringify(sanitized.metadata)
        : sanitized.metadata;

    const connection = await masterPool.getConnection();

    try {
      await connection.beginTransaction();

      // Check if branch with same code already exists for this course
      const [existing] = await connection.query(
        `SELECT id FROM course_branches 
         WHERE course_id = ? AND code = ?`,
        [courseId, sanitized.code]
      );

      let branchId;
      let isNewBranch = false;

      if (existing.length > 0) {
        // Branch already exists - use existing branch
        branchId = existing[0].id;

        // Update branch details if needed
        await connection.query(
          `UPDATE course_branches 
           SET name = ?, total_years = ?, semesters_per_year = ?, is_active = ?, metadata = ?
           WHERE id = ?`,
          [
            sanitized.name?.trim(),
            sanitized.totalYears,
            sanitized.semestersPerYear,
            sanitized.isActive,
            branchMetadata || null,
            branchId
          ]
        );
      } else {
        // Create new branch (ONE branch for all academic years)
        const [result] = await connection.query(
          `INSERT INTO course_branches
            (course_id, name, code, total_years, semesters_per_year, metadata, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            courseId,
            sanitized.name?.trim(),
            sanitized.code,
            sanitized.totalYears,
            sanitized.semestersPerYear,
            branchMetadata || null,
            sanitized.isActive
          ]
        );
        branchId = result.insertId;
        isNewBranch = true;
      }

      // Associate academic years with the branch (if any provided)
      if (academicYearIds.length > 0) {
        // Get existing academic year associations for this branch
        const [existingYears] = await connection.query(
          `SELECT academic_year_id FROM branch_academic_years WHERE branch_id = ?`,
          [branchId]
        );
        const existingYearIds = existingYears.map(row => row.academic_year_id);

        // Insert new academic year associations (only for years not already associated)
        const newYearIds = academicYearIds.filter(yearId => !existingYearIds.includes(yearId));

        if (newYearIds.length > 0) {
          const values = newYearIds.map(yearId => [branchId, yearId]);
          await connection.query(
            `INSERT INTO branch_academic_years (branch_id, academic_year_id) VALUES ?`,
            [values]
          );
        }
      }

      // Fetch the branch with all academic years
      const [branchRows] = await connection.query(
        `SELECT cb.* FROM course_branches cb WHERE cb.id = ? LIMIT 1`,
        [branchId]
      );

      // Fetch academic years from junction table
      const [academicYearsData] = await connection.query(`
        SELECT ay.id, ay.year_label, ay.is_active
        FROM branch_academic_years bay
        JOIN academic_years ay ON bay.academic_year_id = ay.id
        WHERE bay.branch_id = ?
        ORDER BY ay.year_label ASC
      `, [branchId]);

      const academicYears = academicYearsData.map(row => ({
        id: row.id,
        year_label: row.year_label,
        is_active: row.is_active
      }));

      await connection.commit();
      connection.release();

      if (branchRows.length > 0) {
        const branchData = serializeBranchRow(branchRows[0], academicYears);
        res.status(isNewBranch ? 201 : 200).json({
          success: true,
          message: isNewBranch
            ? (academicYears.length > 0
              ? `Branch created successfully for ${academicYears.length} batch(es)`
              : `Branch created successfully. You can add batches later.`)
            : (academicYears.length > 0
              ? `Branch updated successfully. Now associated with ${academicYears.length} batch(es)`
              : `Branch updated successfully. No batches associated yet.`),
          data: branchData,
          count: academicYears.length
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve created branch'
        });
      }
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('createBranch error:', error);
    let errorMessage = 'Failed to create branch';
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('unique_branch_per_course_year')) {
        errorMessage = 'Branch with the same name already exists for this course and academic year';
      } else if (error.message.includes('unique_branch_code_per_course_year')) {
        errorMessage = 'Branch with the same code already exists for this course and academic year';
      } else if (error.message.includes('unique_branch_per_course')) {
        errorMessage = 'Branch with the same name already exists for this course';
      } else if (error.message.includes('unique_branch_code_per_course')) {
        // This is the old constraint - suggest running migration
        errorMessage = 'Branch with the same code already exists. Please run the migration script to update the database constraint: node scripts/fix_branch_code_constraint.js';
      } else {
        errorMessage = 'Branch with the same name or code already exists for this course';
      }
    }
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

exports.getBranches = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!courseId || Number.isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course ID'
    });
  }

  try {
    const includeInactive = parseBoolean(req.query.includeInactive, true);
    const whereClause = includeInactive
      ? 'WHERE cb.course_id = ?'
      : 'WHERE cb.course_id = ? AND cb.is_active = 1';

    // Fetch branches
    const [rows] = await masterPool.query(
      `SELECT cb.* FROM course_branches cb ${whereClause} ORDER BY cb.name ASC`,
      [courseId]
    );

    // Fetch academic years for all branches from junction table
    let branches = [];
    if (rows && rows.length > 0) {
      const branchIds = rows.map(b => b.id);
      const [academicYearsData] = await masterPool.query(`
        SELECT bay.branch_id, ay.id, ay.year_label, ay.is_active
        FROM branch_academic_years bay
        JOIN academic_years ay ON bay.academic_year_id = ay.id
        WHERE bay.branch_id IN (?)
        ORDER BY ay.year_label ASC
      `, [branchIds]);

      // Group academic years by branch_id
      const academicYearsByBranch = {};
      academicYearsData.forEach(row => {
        if (!academicYearsByBranch[row.branch_id]) {
          academicYearsByBranch[row.branch_id] = [];
        }
        academicYearsByBranch[row.branch_id].push({
          id: row.id,
          year_label: row.year_label,
          is_active: row.is_active
        });
      });

      // Serialize branches with their academic years
      branches = rows.map(branch => {
        const academicYears = academicYearsByBranch[branch.id] || [];
        return serializeBranchRow(branch, academicYears);
      });
    }

    // Apply user scope filtering for branches
    if (req.userScope && !req.userScope.unrestricted && !req.userScope.allBranches) {
      branches = filterBranchesByScope(branches, req.userScope);
    }

    // No caching to ensure fresh data after updates
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      success: true,
      data: branches
    });
  } catch (error) {
    console.error('getBranches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branches for course'
    });
  }
};

exports.updateBranch = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const branchId = parseInt(req.params.branchId, 10);

  if (!courseId || Number.isNaN(courseId) || !branchId || Number.isNaN(branchId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course or branch ID'
    });
  }

  try {
    const [courseRows] = await masterPool.query(
      'SELECT * FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (!courseRows || courseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const [existingBranchRows] = await masterPool.query(
      'SELECT * FROM course_branches WHERE course_id = ? AND id = ? LIMIT 1',
      [courseId, branchId]
    );

    if (!existingBranchRows || existingBranchRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found for this course'
      });
    }

    const course = courseRows[0];
    const oldBranchName = existingBranchRows[0].name;

    const { errors, sanitized } = validateBranchPayload(req.body || {}, {
      defaultYears: existingBranchRows[0].total_years ?? course.total_years,
      defaultSemesters:
        existingBranchRows[0].semesters_per_year ?? course.semesters_per_year,
      isUpdate: true
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
      });
    }

    const fields = [];
    const values = [];
    let newBranchName = null;

    if (sanitized.name !== undefined) {
      fields.push('name = ?');
      newBranchName = sanitized.name?.trim();
      values.push(newBranchName);
    }

    if (sanitized.code !== undefined) {
      fields.push('code = ?');
      values.push(sanitized.code);
    }

    if (req.body.totalYears !== undefined || req.body.total_years !== undefined) {
      fields.push('total_years = ?');
      values.push(sanitized.totalYears);
    }

    if (
      req.body.semestersPerYear !== undefined ||
      req.body.semesters_per_year !== undefined
    ) {
      fields.push('semesters_per_year = ?');
      values.push(sanitized.semestersPerYear);
    }

    if (req.body.metadata !== undefined) {
      const metadataJson =
        sanitized.metadata && typeof sanitized.metadata === 'object'
          ? JSON.stringify(sanitized.metadata)
          : sanitized.metadata;
      fields.push('metadata = ?');
      values.push(metadataJson || null);
    }

    if (req.body.isActive !== undefined || req.body.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(sanitized.isActive);
    }

    // Handle academicYearIds update via junction table (not academic_year_id column)
    let academicYearIdsToUpdate = null;
    if (req.body.academicYearIds !== undefined || req.body.academic_year_ids !== undefined) {
      academicYearIdsToUpdate = sanitized.academicYearIds || [];
      if (!Array.isArray(academicYearIdsToUpdate)) {
        academicYearIdsToUpdate = [academicYearIdsToUpdate].filter(Boolean);
      }
    }

    if (fields.length === 0 && !academicYearIdsToUpdate) {
      return res.status(400).json({
        success: false,
        message: 'No branch fields provided for update'
      });
    }

    const connection = await masterPool.getConnection();

    try {
      await connection.beginTransaction();

      // Update branch in course_branches table (if there are fields to update)
      if (fields.length > 0) {
        values.push(courseId, branchId);
        await connection.query(
          `UPDATE course_branches
           SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE course_id = ? AND id = ?`,
          values
        );
      }

      // Update academic year associations via junction table
      if (academicYearIdsToUpdate !== null) {
        // Remove all existing associations
        await connection.query(
          `DELETE FROM branch_academic_years WHERE branch_id = ?`,
          [branchId]
        );

        // Insert new associations
        if (academicYearIdsToUpdate.length > 0) {
          const values = academicYearIdsToUpdate.map(yearId => [branchId, yearId]);
          await connection.query(
            `INSERT INTO branch_academic_years (branch_id, academic_year_id) VALUES ?`,
            [values]
          );
        }
      }

      // If branch name was changed, cascade update to students table
      let studentsUpdated = 0;
      if (newBranchName && newBranchName !== oldBranchName) {
        const [updateResult] = await connection.query(
          `UPDATE students 
           SET branch = ?, 
               student_data = JSON_SET(
                 IFNULL(student_data, '{}'), 
                 '$.branch', ?,
                 '$.Branch', ?,
                 '$."Branch Name"', ?
               ),
               updated_at = CURRENT_TIMESTAMP 
           WHERE branch = ? AND course = ?`,
          [newBranchName, newBranchName, newBranchName, newBranchName, oldBranchName, course.name]
        );
        studentsUpdated = updateResult.affectedRows || 0;
        console.log(`Branch rename cascade: Updated ${studentsUpdated} students from "${oldBranchName}" to "${newBranchName}"`);
      }

      // Fetch the updated branch with academic years
      const [branchRows] = await connection.query(
        `SELECT cb.* FROM course_branches cb WHERE cb.course_id = ? AND cb.id = ? LIMIT 1`,
        [courseId, branchId]
      );

      // Fetch academic years from junction table
      const [academicYearsData] = await connection.query(`
        SELECT ay.id, ay.year_label, ay.is_active
        FROM branch_academic_years bay
        JOIN academic_years ay ON bay.academic_year_id = ay.id
        WHERE bay.branch_id = ?
        ORDER BY ay.year_label ASC
      `, [branchId]);

      const academicYears = academicYearsData.map(row => ({
        id: row.id,
        year_label: row.year_label,
        is_active: row.is_active
      }));

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: studentsUpdated > 0
          ? `Branch updated successfully. ${studentsUpdated} student record(s) updated.`
          : 'Branch updated successfully',
        data: serializeBranchRow(branchRows[0], academicYears),
        studentsUpdated
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('updateBranch error:', error);
    res.status(500).json({
      success: false,
      message: error.code === 'ER_DUP_ENTRY'
        ? (error.message.includes('unique_branch_code_per_course')
          ? 'Branch with the same code already exists for this course'
          : 'Branch with the same name or code already exists for this course')
        : 'Failed to update branch'
    });
  }
};

/**
 * POST /api/courses/:courseId/upload-fee-qr
 * Upload fee payment QR image for a course (stored in database)
 */
exports.uploadFeeQr = async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId, 10);

    if (!courseId || Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const [existingCourse] = await masterPool.query(
      'SELECT id FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (!existingCourse || existingCourse.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    await masterPool.execute(
      'UPDATE courses SET fee_qr_image = ?, fee_qr_image_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.file.buffer, req.file.mimetype, courseId]
    );

    const [updatedRows] = await masterPool.execute(
      'SELECT updated_at FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    res.json({
      success: true,
      message: 'Fee QR uploaded successfully',
      feeQrImageUrl: buildFeeQrImageUrl(
        courseId,
        updatedRows[0]?.updated_at,
        true
      )
    });
  } catch (error) {
    console.error('uploadFeeQr error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload fee QR'
    });
  }
};

/**
 * GET /api/courses/:courseId/fee-qr
 * Get fee payment QR image for a course
 */
exports.getFeeQr = async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId, 10);

    if (!courseId || Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    const [rows] = await masterPool.execute(
      'SELECT fee_qr_image, fee_qr_image_type FROM courses WHERE id = ?',
      [courseId]
    );

    if (rows.length === 0 || !rows[0].fee_qr_image) {
      return res.status(404).json({
        success: false,
        message: 'Fee QR not found'
      });
    }

    res.set('Content-Type', rows[0].fee_qr_image_type || 'image/png');
    // URL includes ?v=<updated_at> cache buster; safe to cache per version
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.send(rows[0].fee_qr_image);
  } catch (error) {
    console.error('getFeeQr error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve fee QR'
    });
  }
};

// Export formatCourse for use in other modules
exports.formatCourse = formatCourse;

exports.deleteBranch = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const branchId = parseInt(req.params.branchId, 10);
  const cascade = req.query.cascade === 'true' || req.body.cascade === true;
  const scope = req.query.scope || 'single'; // 'single' (specific batch) or 'all' (all batches for this branch code)

  if (!courseId || Number.isNaN(courseId) || !branchId || Number.isNaN(branchId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course or branch ID'
    });
  }

  const connection = await masterPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get branch details including code
    const [branchRow] = await connection.query(
      `SELECT cb.id, cb.name, cb.code
       FROM course_branches cb 
       WHERE cb.course_id = ? AND cb.id = ? 
       LIMIT 1`,
      [courseId, branchId]
    );

    if (branchRow.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Branch not found for this course'
      });
    }

    const { name: branchName, code: branchCode } = branchRow[0];

    // Get academic years for this branch from junction table
    const [academicYearsData] = await connection.query(`
      SELECT ay.id, ay.year_label
      FROM branch_academic_years bay
      JOIN academic_years ay ON bay.academic_year_id = ay.id
      WHERE bay.branch_id = ?
      ORDER BY ay.year_label ASC
    `, [branchId]);

    const academicYears = academicYearsData.map(row => row.year_label);

    // Get course name
    const [courseRow] = await connection.query(
      'SELECT name FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    const courseName = courseRow.length > 0 ? courseRow[0].name : null;
    let deletedStudents = 0;
    let deletedBranches = 0;

    if (cascade) {
      // Delete students
      let deleteStudentQuery = 'DELETE FROM students WHERE ';
      const deleteStudentParams = [];

      if (courseName) {
        deleteStudentQuery += 'course = ? AND branch = ?';
        deleteStudentParams.push(courseName, branchName);
      } else {
        deleteStudentQuery += 'branch = ?';
        deleteStudentParams.push(branchName);
      }

      // If scope is single and we have academic years, restrict deletion to those batches
      // Note: Since we now have multiple academic years per branch, 'single' scope doesn't make as much sense
      // But we'll keep it for backward compatibility - it will delete students for all batches of this branch
      // If scope is 'all', we don't filter by batch, so it deletes for all batches

      const [studentResult] = await connection.query(deleteStudentQuery, deleteStudentParams);
      deletedStudents = studentResult.affectedRows;

      // Delete branch(es)
      if (scope === 'all') {
        // Delete all branches with the same code for this course
        if (branchCode) {
          const [result] = await connection.query(
            'DELETE FROM course_branches WHERE course_id = ? AND code = ?',
            [courseId, branchCode]
          );
          deletedBranches = result.affectedRows;
        }

        // Fallback: If no branches were deleted (e.g., code mismatch or null code)
        // ensure we at least delete the specific targeted branch ID.
        if (deletedBranches === 0) {
          const [result] = await connection.query(
            'DELETE FROM course_branches WHERE course_id = ? AND id = ?',
            [courseId, branchId]
          );
          deletedBranches = result.affectedRows;
        }
      } else {
        // Delete only the specific branch
        const [result] = await connection.query(
          'DELETE FROM course_branches WHERE course_id = ? AND id = ?',
          [courseId, branchId]
        );
        deletedBranches = result.affectedRows;
      }

      if (deletedBranches === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({
          success: false,
          message: 'Branch not found for this course'
        });
      }

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        deletedStudents,
        deletedBranches,
        message: scope === 'all'
          ? 'All batch versions of this branch and related data deleted successfully.'
          : 'Branch version and related data deleted successfully.'
      });
    } else {
      // Non-cascade: Logic handles soft/hard delete (usually for single only, but could adapt)
      // For now, keeping existing logic but respecting scope for 'all' check?
      // The original non-cascade logic was a bit complex. Assuming user mostly uses cascade from UI.
      // Let's implement basic soft/hard delete support for scope as well.

      const hardDelete = parseBoolean(req.query.hard, false);
      let targetIds = [branchId];

      if (scope === 'all') {
        const [allBranches] = await connection.query(
          'SELECT id FROM course_branches WHERE course_id = ? AND code = ?',
          [courseId, branchCode]
        );
        targetIds = allBranches.map(b => b.id);
      }

      if (targetIds.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, message: 'No branches found' });
      }

      if (hardDelete) {
        const [result] = await connection.query(
          'DELETE FROM course_branches WHERE id IN (?)',
          [targetIds]
        );
        deletedBranches = result.affectedRows;
      } else {
        const [result] = await connection.query(
          `UPDATE course_branches
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (?)`,
          [targetIds]
        );
        deletedBranches = result.affectedRows;
      }

      await connection.commit();
      connection.release();

      return res.json({
        success: true,
        deletedBranches,
        message: hardDelete ? 'Branch(es) deleted successfully' : 'Branch(es) deactivated successfully'
      });
    }
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('deleteBranch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete branch'
    });
  }
};

/**
 * GET /api/courses/:courseId/affected-students
 * Preview students that will be affected when deleting a course
 */
exports.getAffectedStudentsByCourse = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);

  if (!courseId || Number.isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course ID'
    });
  }

  try {
    // Get course name
    const [courseRow] = await masterPool.query(
      'SELECT name FROM courses WHERE id = ? LIMIT 1',
      [courseId]
    );

    if (courseRow.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const courseName = courseRow[0].name;

    // Get all students under this course (limit to 100 for preview)
    const [students] = await masterPool.query(
      `SELECT admission_number, student_name, branch, batch, current_year, current_semester 
       FROM students 
       WHERE course = ?
       ORDER BY student_name ASC
       LIMIT 100`,
      [courseName]
    );

    // Get total count
    const [countResult] = await masterPool.query(
      'SELECT COUNT(*) as total FROM students WHERE course = ?',
      [courseName]
    );

    res.json({
      success: true,
      data: {
        courseName,
        students,
        totalCount: countResult[0].total,
        hasMore: countResult[0].total > 100
      }
    });
  } catch (error) {
    console.error('getAffectedStudentsByCourse error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch affected students'
    });
  }
};

/**
 * GET /api/courses/:courseId/branches/:branchId/affected-students
 * Preview students that will be affected when deleting a branch
 */
exports.getAffectedStudentsByBranch = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const branchId = parseInt(req.params.branchId, 10);
  const scope = req.query.scope || 'single'; // 'single' or 'all'

  if (!courseId || Number.isNaN(courseId) || !branchId || Number.isNaN(branchId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid course or branch ID'
    });
  }

  try {
    // Get branch and course names
    const [branchRow] = await masterPool.query(
      `SELECT cb.name as branch_name, c.name as course_name
       FROM course_branches cb
       JOIN courses c ON cb.course_id = c.id
       WHERE cb.course_id = ? AND cb.id = ?
       LIMIT 1`,
      [courseId, branchId]
    );

    if (branchRow.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found for this course'
      });
    }

    const { branch_name: branchName, course_name: courseName } = branchRow[0];

    // Get academic years for this branch from junction table
    const [academicYearsData] = await masterPool.query(`
      SELECT ay.year_label
      FROM branch_academic_years bay
      JOIN academic_years ay ON bay.academic_year_id = ay.id
      WHERE bay.branch_id = ?
      ORDER BY ay.year_label ASC
    `, [branchId]);

    const academicYears = academicYearsData.map(row => row.year_label);

    // Get all students under this branch (limit to 100 for preview)
    // Filter by batch (academic year) if available AND scope is single
    let query = `SELECT admission_number, student_name, batch, current_year, current_semester 
                 FROM students 
                 WHERE course = ? AND branch = ?`;
    const params = [courseName, branchName];

    // Only apply batch filter if scope is single and we have academic years
    // Since branch can have multiple academic years, 'single' scope doesn't filter by batch anymore
    // It will show all students for this branch across all batches
    // 'all' scope shows all students regardless

    query += ' ORDER BY student_name ASC LIMIT 100';

    const [students] = await masterPool.query(query, params);

    // Get total count
    const countQuery = 'SELECT COUNT(*) as total FROM students WHERE course = ? AND branch = ?';
    const countParams = [courseName, branchName];

    const [countResult] = await masterPool.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        branchName,
        courseName,
        academicYears: academicYears.length > 0 ? academicYears : ['All Batches'],
        academicYear: academicYears.length > 0 ? academicYears.join(', ') : 'All Batches',
        students,
        totalCount: countResult[0].total,
        hasMore: countResult[0].total > 100
      }
    });
  } catch (error) {
    console.error('getAffectedStudentsByBranch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch affected students'
    });
  }
};


const { USER_ROLES } = require('../constants/rbac');

/**
 * Build SQL conditions for user scope filtering
 * This ensures users only see data within their assigned scope
 * 
 * @param {Object} userScope - User scope from attachUserScope middleware
 * @param {string} tableAlias - Table alias for the query (default: 's' for students)
 * @returns {Object} - { conditions: array, params: array }
 */
function buildScopeConditions(userScope, tableAlias = 's') {
  // Super admin has no restrictions
  if (userScope.unrestricted) {
    return {
      conditions: [],
      params: []
    };
  }

  const conditions = [];
  const params = [];

  // Apply college filter using IDs for performance, fallback to names
  if (userScope.collegeIds && userScope.collegeIds.length > 0) {
    const placeholders = userScope.collegeIds.map(() => '?').join(',');
    conditions.push(`${tableAlias}.college_id IN (${placeholders})`);
    params.push(...userScope.collegeIds);
  } else if (userScope.collegeNames && userScope.collegeNames.length > 0) {
    const placeholders = userScope.collegeNames.map(() => '?').join(',');
    conditions.push(`${tableAlias}.college IN (${placeholders})`);
    params.push(...userScope.collegeNames);
  }

  // Apply course filter (only if not "all courses")
  if (!userScope.allCourses) {
    if (userScope.courseIds && userScope.courseIds.length > 0) {
      const placeholders = userScope.courseIds.map(() => '?').join(',');
      conditions.push(`${tableAlias}.course_id IN (${placeholders})`);
      params.push(...userScope.courseIds);
    } else if (userScope.courseNames && userScope.courseNames.length > 0) {
      const placeholders = userScope.courseNames.map(() => '?').join(',');
      conditions.push(`${tableAlias}.course IN (${placeholders})`);
      params.push(...userScope.courseNames);
    }
  }

  // Apply branch filter (only if not "all branches")
  if (!userScope.allBranches) {
    if (userScope.branchIds && userScope.branchIds.length > 0) {
      const placeholders = userScope.branchIds.map(() => '?').join(',');
      conditions.push(`${tableAlias}.branch_id IN (${placeholders})`);
      params.push(...userScope.branchIds);
    } else if (userScope.branchNames && userScope.branchNames.length > 0) {
      const placeholders = userScope.branchNames.map(() => '?').join(',');
      conditions.push(`${tableAlias}.branch IN (${placeholders})`);
      params.push(...userScope.branchNames);
    }
  }

  // For branch_hod: filter by assigned years only (HOD sees only their year cohorts)
  if (userScope.hodYears && userScope.hodYears.length > 0) {
    const ph = userScope.hodYears.map(() => '?').join(',');
    conditions.push(`${tableAlias}.current_year IN (${ph})`);
    params.push(...userScope.hodYears);
  }

  return { conditions, params };
}

/**
 * Apply user scope filters to a query (legacy function for backward compatibility)
 * @param {Object} userScope - User scope from attachUserScope middleware
 * @param {string} tableAlias - Table alias for the query (default: 's' for students)
 * @returns {Object} - { whereClause: string, params: array }
 */
function applyUserScope(userScope, tableAlias = 's') {
  const { conditions, params } = buildScopeConditions(userScope, tableAlias);
  
  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  return { whereClause, params };
}

/**
 * Get scope conditions as AND-joined string for appending to existing WHERE clause
 * @param {Object} userScope - User scope from attachUserScope middleware
 * @param {string} tableAlias - Table alias for the query (default: 's' for students)
 * @returns {Object} - { scopeCondition: string, params: array }
 */
function getScopeConditionString(userScope, tableAlias = 's') {
  const { conditions, params } = buildScopeConditions(userScope, tableAlias);
  
  const scopeCondition = conditions.length > 0 
    ? conditions.join(' AND ')
    : '';

  return { scopeCondition, params };
}

/**
 * Get scope description for display/logging
 */
function getScopeDescription(userScope) {
  if (userScope.unrestricted) {
    return 'All data (Super Admin)';
  }

  const parts = [];
  if (userScope.collegeNames && userScope.collegeNames.length > 0) {
    parts.push(`Colleges: ${userScope.collegeNames.join(', ')}`);
  }
  if (!userScope.allCourses && userScope.courseNames && userScope.courseNames.length > 0) {
    parts.push(`Courses: ${userScope.courseNames.join(', ')}`);
  } else if (userScope.allCourses) {
    parts.push('All Courses');
  }
  if (!userScope.allBranches && userScope.branchNames && userScope.branchNames.length > 0) {
    parts.push(`Branches: ${userScope.branchNames.join(', ')}`);
  } else if (userScope.allBranches) {
    parts.push('All Branches');
  }

  return parts.length > 0 ? parts.join(', ') : 'No scope restrictions';
}

/**
 * Check if user can access a specific college
 */
function canAccessCollege(userScope, collegeName) {
  if (userScope.unrestricted) return true;
  if (!userScope.collegeNames || userScope.collegeNames.length === 0) return false;
  return userScope.collegeNames.includes(collegeName);
}

/**
 * Check if user can access a specific course
 */
function canAccessCourse(userScope, courseName) {
  if (userScope.unrestricted) return true;
  if (userScope.allCourses) return true;
  if (!userScope.courseNames || userScope.courseNames.length === 0) return false;
  return userScope.courseNames.includes(courseName);
}

/**
 * Check if user can access a specific branch
 */
function canAccessBranch(userScope, branchName) {
  if (userScope.unrestricted) return true;
  if (userScope.allBranches) return true;
  if (!userScope.branchNames || userScope.branchNames.length === 0) return false;
  return userScope.branchNames.includes(branchName);
}

/**
 * Filter colleges list based on user scope
 */
function filterCollegesByScope(colleges, userScope) {
  if (userScope.unrestricted) return colleges;
  if (!userScope.collegeIds || userScope.collegeIds.length === 0) return [];
  return colleges.filter(c => userScope.collegeIds.includes(c.id));
}

/**
 * Filter courses list based on user scope
 */
function filterCoursesByScope(courses, userScope) {
  if (userScope.unrestricted) return courses;
  if (userScope.allCourses) return courses;
  if (!userScope.courseIds || userScope.courseIds.length === 0) return [];
  return courses.filter(c => userScope.courseIds.includes(c.id));
}

/**
 * Build SQL scope clause for semester rows (uses college_id / course_id / year_of_study).
 * Returns { sql, params } where sql starts with " AND ..." or is empty.
 */
function buildSemesterScopeSql(userScope, alias = 's') {
  if (!userScope || userScope.unrestricted) {
    return { sql: '', params: [] };
  }

  const conditions = [];
  const params = [];

  const collegeIds = (userScope.collegeIds || [])
    .map((id) => Number(id))
    .filter((id) => !Number.isNaN(id));

  if (collegeIds.length === 0) {
    conditions.push('1=0');
  } else {
    const placeholders = collegeIds.map(() => '?').join(',');
    // Include college-null rows only when they also match course scope below
    conditions.push(`(${alias}.college_id IS NULL OR ${alias}.college_id IN (${placeholders}))`);
    params.push(...collegeIds);
  }

  if (!userScope.allCourses) {
    const courseIds = (userScope.courseIds || [])
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));
    if (courseIds.length === 0) {
      conditions.push('1=0');
    } else {
      const placeholders = courseIds.map(() => '?').join(',');
      conditions.push(`${alias}.course_id IN (${placeholders})`);
      params.push(...courseIds);
    }
  }

  if (userScope.hodYears && userScope.hodYears.length > 0) {
    const years = userScope.hodYears
      .map((y) => Number(y))
      .filter((y) => !Number.isNaN(y));
    if (years.length > 0) {
      const placeholders = years.map(() => '?').join(',');
      conditions.push(`${alias}.year_of_study IN (${placeholders})`);
      params.push(...years);
    }
  }

  return {
    sql: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    params
  };
}

/**
 * Whether the user may access a semester college/course/year combination by IDs.
 * Aligns with buildSemesterScopeSql: college_id NULL (shared / all-colleges rows)
 * is allowed for scoped users who have at least one college, as long as course/year match.
 */
function canAccessSemesterScope(userScope, { collegeId, courseId, yearOfStudy } = {}) {
  if (!userScope || userScope.unrestricted) return true;

  const collegeIds = (userScope.collegeIds || [])
    .map(Number)
    .filter((id) => !Number.isNaN(id));

  if (collegeIds.length === 0) {
    return false;
  }

  const isNullCollege =
    collegeId == null || collegeId === '' || collegeId === 'null';

  // Shared null-college rows are visible in list scope; allow the same on write.
  if (!isNullCollege && !collegeIds.includes(Number(collegeId))) {
    return false;
  }

  if (!userScope.allCourses) {
    const courseIds = (userScope.courseIds || []).map(Number);
    if (!courseIds.includes(Number(courseId))) {
      return false;
    }
  }

  if (userScope.hodYears && userScope.hodYears.length > 0 && yearOfStudy != null) {
    const years = userScope.hodYears.map(Number);
    if (!years.includes(Number(yearOfStudy))) {
      return false;
    }
  }

  return true;
}

/**
 * Filter branches list based on user scope
 * Matches branches by both ID and name to handle branches created for different academic years
 * If a user has access to a branch by name, they should see all instances of that branch
 * across different academic years (e.g., DFS branch for 2024, 2025, 2026)
 */
function filterBranchesByScope(branches, userScope) {
  if (userScope.unrestricted) return branches;
  if (userScope.allBranches) return branches;
  
  // If no branch restrictions, return empty array
  if ((!userScope.branchIds || userScope.branchIds.length === 0) && 
      (!userScope.branchNames || userScope.branchNames.length === 0)) {
    return [];
  }
  
  // Filter branches by ID or by name
  // This ensures that if a user has access to a branch name (e.g., "DFS"),
  // they will see all branches with that name across different academic years
  return branches.filter(b => {
    // Match by ID if available
    if (userScope.branchIds && userScope.branchIds.length > 0) {
      if (userScope.branchIds.includes(b.id)) {
        return true;
      }
    }
    
    // Match by name if available (handles branches with same name but different academic years)
    if (userScope.branchNames && userScope.branchNames.length > 0 && b.name) {
      if (userScope.branchNames.includes(b.name)) {
        return true;
      }
    }
    
    return false;
  });
}

module.exports = {
  applyUserScope,
  buildScopeConditions,
  getScopeConditionString,
  getScopeDescription,
  canAccessCollege,
  canAccessCourse,
  canAccessBranch,
  canAccessSemesterScope,
  buildSemesterScopeSql,
  filterCollegesByScope,
  filterCoursesByScope,
  filterBranchesByScope
};

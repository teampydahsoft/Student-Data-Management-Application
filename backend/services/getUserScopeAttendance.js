const { masterPool } = require('../config/database');
const { USER_ROLES } = require('../constants/rbac');

/**
 * Parse scope data (JSON or single value)
 */
const parseScopeData = (data) => {
  if (!data) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [data];
    }
  }
  if (Array.isArray(data)) return data;
  return [data];
};

/**
 * Get all active Principals, AOs, and HODs with their access scopes
 */
const getAllNotificationUsers = async () => {
  try {
    const [users] = await masterPool.query(
      `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.college_id,
          u.course_id,
          u.branch_id,
          u.college_ids,
          u.course_ids,
          u.branch_ids,
          u.all_courses,
          u.all_branches
        FROM rbac_users u
        WHERE u.role IN (?, ?, ?)
          AND u.is_active = 1
        ORDER BY u.role, u.name
      `,
      [USER_ROLES.COLLEGE_PRINCIPAL, USER_ROLES.COLLEGE_AO, USER_ROLES.BRANCH_HOD]
    );

    const principals = [];
    const aos = [];
    const hods = [];

    for (const user of users) {
      const collegeIds = parseScopeData(user.college_ids);
      const courseIds = parseScopeData(user.course_ids);
      const branchIds = parseScopeData(user.branch_ids);

      // Fall back to single IDs if arrays are empty
      if (collegeIds.length === 0 && user.college_id) {
        collegeIds.push(user.college_id);
      }
      if (courseIds.length === 0 && user.course_id) {
        courseIds.push(user.course_id);
      }
      if (branchIds.length === 0 && user.branch_id) {
        branchIds.push(user.branch_id);
      }

      // Get college names
      let collegeNames = [];
      if (collegeIds.length > 0) {
        const [colleges] = await masterPool.query(
          `SELECT id, name FROM colleges WHERE id IN (${collegeIds.map(() => '?').join(',')}) AND is_active = 1`,
          collegeIds
        );
        collegeNames = colleges.map(c => c.name);
      }

      // Get course names
      let courseNames = [];
      if (!user.all_courses && courseIds.length > 0) {
        const [courses] = await masterPool.query(
          `SELECT id, name FROM courses WHERE id IN (${courseIds.map(() => '?').join(',')}) AND is_active = 1`,
          courseIds
        );
        courseNames = courses.map(c => c.name);
      }

      // Get branch names
      let branchNames = [];
      if (!user.all_branches && branchIds.length > 0) {
        const [branches] = await masterPool.query(
          `SELECT id, name FROM course_branches WHERE id IN (${branchIds.map(() => '?').join(',')}) AND is_active = 1`,
          branchIds
        );
        branchNames = branches.map(b => b.name);
      }

      const userScope = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        collegeIds,
        courseIds,
        branchIds,
        collegeNames,
        courseNames,
        branchNames,
        allCourses: !!user.all_courses,
        allBranches: !!user.all_branches
      };

      if (user.role === USER_ROLES.COLLEGE_PRINCIPAL) {
        principals.push(userScope);
      } else if (user.role === USER_ROLES.COLLEGE_AO) {
        aos.push(userScope);
      } else if (user.role === USER_ROLES.BRANCH_HOD) {
        hods.push(userScope);
      }
    }

    return { principals, aos, hods };
  } catch (error) {
    console.error('Error getting notification users:', error);
    throw error;
  }
};

/**
 * Filter attendance groups by user scope
 */
const filterAttendanceByUserScope = (attendanceGroups, userScope) => {
  return attendanceGroups.filter(group => {
    // Check college access
    // If user has no college names specified, they have access to all (shouldn't happen, but handle it)
    if (userScope.collegeNames.length > 0) {
      const EngineeringCollegeName = 'Pydah College of Engineering';
      const isEngineeringUser = userScope.collegeNames.includes(EngineeringCollegeName);
      
      const isDiplomaGroup = 
        group.course.toLowerCase().includes('diploma') || 
        group.course.startsWith('DAP') || 
        group.course.startsWith('DAE') ||
        group.college.toLowerCase().includes('polytechnic') || 
        group.college === 'Diploma College';

      if (!userScope.collegeNames.includes(group.college) && group.college !== 'Unknown') {
        // Special Case: Engineering college users should have access to Diploma/Polytechnic reports
        if (isEngineeringUser && isDiplomaGroup) {
          // Allow access to Diploma students for Engineering college users
        } else {
          return false;
        }
      }
    }

    // Check course access
    if (!userScope.allCourses) {
      // User has specific course access
      if (userScope.courseNames.length === 0) {
        // No courses specified and not all_courses - no access
        return false;
      }
      if (!userScope.courseNames.includes(group.course) && group.course !== 'Unknown') {
        return false;
      }
    }
    // If allCourses is true, user has access to all courses

    // Check branch access
    if (userScope.role === USER_ROLES.BRANCH_HOD) {
      // HODs must have specific branch access (all_branches not supported for HODs)
      if (userScope.branchNames.length === 0) {
        return false; // HOD must have at least one branch
      }
      if (!userScope.branchNames.includes(group.branch) && group.branch !== 'Unknown') {
        return false;
      }
    } else {
      // Principals: check branch only if not all_branches
      if (!userScope.allBranches) {
        if (userScope.branchNames.length === 0) {
          // No branches specified and not all_branches - no access
          return false;
        }
        if (!userScope.branchNames.includes(group.branch) && group.branch !== 'Unknown') {
          return false;
        }
      }
      // If allBranches is true, principal has access to all branches
    }

    return true;
  });
};

/**
 * Check if all batches within user scope are marked
 */
const areAllBatchesMarkedForUserScope = (filteredGroups) => {
  if (filteredGroups.length === 0) {
    return false; // No groups in scope
  }

  // Check if all groups are fully marked
  return filteredGroups.every(group => group.isFullyMarked);
};

module.exports = {
  getAllNotificationUsers,
  filterAttendanceByUserScope,
  areAllBatchesMarkedForUserScope
};

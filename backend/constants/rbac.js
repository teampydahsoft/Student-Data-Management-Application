/**
 * RBAC Constants
 * Defines user roles, permissions, and hierarchy
 */

// User Roles Hierarchy
const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  COLLEGE_PRINCIPAL: 'college_principal',
  COLLEGE_AO: 'college_ao',
  COLLEGE_ATTENDER: 'college_attender',
  BRANCH_HOD: 'branch_hod',
  OFFICE_ASSISTANT: 'office_assistant',
  CASHIER: 'cashier',
  FACULTY: 'faculty'
};

// Role Hierarchy (who can create whom)
const ROLE_HIERARCHY = {
  [USER_ROLES.SUPER_ADMIN]: [
    USER_ROLES.COLLEGE_PRINCIPAL,
    USER_ROLES.COLLEGE_AO,
    USER_ROLES.COLLEGE_ATTENDER,
    USER_ROLES.BRANCH_HOD,
    USER_ROLES.OFFICE_ASSISTANT,
    USER_ROLES.CASHIER,
    USER_ROLES.FACULTY
  ],
  [USER_ROLES.COLLEGE_PRINCIPAL]: [
    USER_ROLES.COLLEGE_AO,
    USER_ROLES.COLLEGE_ATTENDER,
    USER_ROLES.BRANCH_HOD,
    USER_ROLES.OFFICE_ASSISTANT,
    USER_ROLES.CASHIER,
    USER_ROLES.FACULTY
  ],
  [USER_ROLES.COLLEGE_AO]: [
    USER_ROLES.COLLEGE_ATTENDER,
    USER_ROLES.BRANCH_HOD,
    USER_ROLES.OFFICE_ASSISTANT,
    USER_ROLES.CASHIER,
    USER_ROLES.FACULTY
  ],
  [USER_ROLES.BRANCH_HOD]: [
    USER_ROLES.COLLEGE_ATTENDER,
    USER_ROLES.FACULTY
  ],
  [USER_ROLES.COLLEGE_ATTENDER]: [],
  [USER_ROLES.OFFICE_ASSISTANT]: [],
  [USER_ROLES.CASHIER]: [],
  [USER_ROLES.FACULTY]: []
};

// Available Modules
const MODULES = {
  DASHBOARD: 'dashboard',
  PRE_REGISTRATION: 'pre_registration',
  STUDENT_MANAGEMENT: 'student_management',
  PROMOTIONS: 'promotions',
  ATTENDANCE: 'attendance',
  FEE_MANAGEMENT: 'fee_management',
  SETTINGS: 'settings',
  USER_MANAGEMENT: 'user_management',
  REPORTS: 'reports',
  TICKET_MANAGEMENT: 'ticket_management',
  SERVICES: 'services',
  ANNOUNCEMENTS: 'announcements',
  FACULTY_MANAGEMENT: 'faculty_management',
  FACULTY_ACADEMICS: 'faculty_academics'
};

// Granular Permissions for each module
const MODULE_PERMISSIONS = {
  [MODULES.DASHBOARD]: {
    // Dashboard is common for all users - no special permissions needed
    permissions: ['view'],
    labels: {
      view: 'View Dashboard'
    }
  },
  [MODULES.PRE_REGISTRATION]: {
    permissions: ['add_student', 'bulk_upload', 'approve', 'reject'],
    labels: {
      add_student: 'Add Student',
      bulk_upload: 'Bulk Upload',
      approve: 'Approve Submissions',
      reject: 'Reject Submissions'
    }
  },
  [MODULES.STUDENT_MANAGEMENT]: {
    permissions: ['view', 'add_student', 'bulk_upload', 'edit_student', 'delete_student', 'update_pin', 'export', 'view_details', 'edit_details', 'view_sms', 'add_remarks', 'manage_remarks'],
    labels: {
      view: 'View Students',
      add_student: 'Add Student',
      bulk_upload: 'Bulk Upload',
      edit_student: 'Edit Students',
      delete_student: 'Delete Students',
      update_pin: 'Update PIN Number',
      export: 'Export Students',
      view_details: 'View Student Details (Full Profile)',
      edit_details: 'Edit Student Details (Individual Fields)',
      view_sms: 'View SMS Logs',
      add_remarks: 'Add Remarks',
      manage_remarks: 'Manage Remarks (Edit/Delete)'
    }
  },
  [MODULES.PROMOTIONS]: {
    permissions: ['view', 'manage'],
    labels: {
      view: 'View Promotions',
      manage: 'Manage Promotions'
    }
  },
  [MODULES.ATTENDANCE]: {
    permissions: ['view', 'mark', 'download', 'view_hourly', 'view_internship'],
    labels: {
      view: 'View Attendance',
      mark: 'Mark Attendance',
      download: 'Download Reports',
      view_hourly: 'View Hourly Attendance Monitoring',
      view_internship: 'View Internship Attendance'
    }
  },
  [MODULES.FEE_MANAGEMENT]: {
    permissions: ['view', 'write'],
    labels: {
      view: 'View Fees',
      write: 'Manage Fees'
    }
  },
  [MODULES.SETTINGS]: {
    permissions: ['view', 'edit'],
    labels: {
      view: 'View Settings',
      edit: 'Edit Settings (College, Course, Branch)'
    }
  },
  [MODULES.USER_MANAGEMENT]: {
    permissions: ['view', 'control'],
    labels: {
      view: 'View Users',
      control: 'Manage Users (Create, Edit, Delete)'
    }
  },
  [MODULES.REPORTS]: {
    permissions: ['view', 'download', 'view_registration', 'view_attendance', 'view_day_end', 'view_category'],
    labels: {
      view: 'View Reports',
      download: 'Download Reports',
      view_registration: 'View Registration Reports',
      view_attendance: 'View Attendance Reports',
      view_day_end: 'View Day End Reports',
      view_category: 'View Category Reports'
    }
  },
  [MODULES.TICKET_MANAGEMENT]: {
    permissions: ['read', 'write'],
    labels: {
      read: 'View Tickets',
      write: 'Manage Tickets (Assign, Update Status, Add Comments)'
    }
  },
  [MODULES.SERVICES]: {
    permissions: ['view', 'manage_config', 'manage_requests'],
    labels: {
      view: 'View Services',
      manage_config: 'Manage Configuration (Create/Edit Services)',
      manage_requests: 'Manage Requests (Process/Close)'
    }
  },
  [MODULES.ANNOUNCEMENTS]: {
    permissions: ['view', 'create', 'edit', 'delete'],
    labels: {
      view: 'View Announcements',
      create: 'Create Announcements',
      edit: 'Edit Announcements',
      delete: 'Delete Announcements'
    }
  },
  [MODULES.FACULTY_MANAGEMENT]: {
    permissions: ['view', 'create', 'edit', 'deactivate', 'assign_subjects'],
    labels: {
      view: 'View Faculty',
      create: 'Create Faculty',
      edit: 'Edit Faculty',
      deactivate: 'Deactivate Faculty',
      assign_subjects: 'Assign Subjects'
    }
  },
  [MODULES.FACULTY_ACADEMICS]: {
    permissions: ['view_attendance', 'post_attendance', 'view_content', 'upload_content', 'manage_tests', 'post_announcements', 'view_students', 'moderate_chat'],
    labels: {
      view_attendance: 'View Attendance',
      post_attendance: 'Post Hourly Attendance',
      view_content: 'View Content',
      upload_content: 'Upload Notes/Assignments',
      manage_tests: 'Manage Tests & Results',
      post_announcements: 'Post Announcements',
      view_students: 'View Students',
      moderate_chat: 'Moderate Chat'
    }
  }
};

// Module Labels for UI
const MODULE_LABELS = {
  [MODULES.DASHBOARD]: 'Dashboard',
  [MODULES.PRE_REGISTRATION]: 'Pre-Registration',
  [MODULES.STUDENT_MANAGEMENT]: 'Student Management',
  [MODULES.PROMOTIONS]: 'Promotions',
  [MODULES.ATTENDANCE]: 'Attendance',
  [MODULES.FEE_MANAGEMENT]: 'Fee Management',
  [MODULES.SETTINGS]: 'Settings',
  [MODULES.USER_MANAGEMENT]: 'User Management',
  [MODULES.USER_MANAGEMENT]: 'User Management',
  [MODULES.REPORTS]: 'Reports',
  [MODULES.TICKET_MANAGEMENT]: 'Ticket Management',
  [MODULES.SERVICES]: 'Services',
  [MODULES.ANNOUNCEMENTS]: 'Announcements',
  [MODULES.FACULTY_MANAGEMENT]: 'Faculty Management',
  [MODULES.FACULTY_ACADEMICS]: 'Faculty Academics'
};

// All modules as array
const ALL_MODULES = Object.values(MODULES);

// Default permissions structure (all false)
const createDefaultPermissions = () => {
  const permissions = {};
  ALL_MODULES.forEach(module => {
    const modulePerms = MODULE_PERMISSIONS[module];
    if (modulePerms) {
      permissions[module] = {};
      modulePerms.permissions.forEach(perm => {
        permissions[module][perm] = false;
      });
    }
  });
  return permissions;
};

// Super Admin gets all permissions
const createSuperAdminPermissions = () => {
  const permissions = {};
  ALL_MODULES.forEach(module => {
    const modulePerms = MODULE_PERMISSIONS[module];
    if (modulePerms) {
      permissions[module] = {};
      modulePerms.permissions.forEach(perm => {
        permissions[module][perm] = true;
      });
    }
  });
  return permissions;
};

// Role requirements for college/course/branch
const ROLE_REQUIREMENTS = {
  [USER_ROLES.SUPER_ADMIN]: {
    requiresCollege: false,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: false,
    supportsMultiCourse: false,
    supportsMultiBranch: false,
    supportsAllCourses: false,
    supportsAllBranches: false
  },
  [USER_ROLES.COLLEGE_PRINCIPAL]: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  [USER_ROLES.COLLEGE_AO]: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  [USER_ROLES.COLLEGE_ATTENDER]: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  [USER_ROLES.BRANCH_HOD]: {
    requiresCollege: true,
    requiresCourse: true,
    requiresBranch: true,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: false,
    supportsAllBranches: false
  },
  [USER_ROLES.OFFICE_ASSISTANT]: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  [USER_ROLES.CASHIER]: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  [USER_ROLES.FACULTY]: {
    requiresCollege: true,
    requiresCourse: true,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: false,
    supportsAllBranches: true
  },
  // Ticket app roles (linked app) – same scope as college-level roles
  course_principal: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  course_hod: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  branch_clerk: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  branch_counselor: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  branch_faculty: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  },
  support_staff: {
    requiresCollege: true,
    requiresCourse: false,
    requiresBranch: false,
    supportsMultiCollege: true,
    supportsMultiCourse: true,
    supportsMultiBranch: true,
    supportsAllCourses: true,
    supportsAllBranches: true
  }
};

// Validate role requirements (custom roles use college_ao requirements as default)
const validateRoleRequirements = (role, collegeIds, courseIds, branchIds, allCourses = false, allBranches = false) => {
  const requirements = ROLE_REQUIREMENTS[role] || ROLE_REQUIREMENTS[USER_ROLES.COLLEGE_AO];
  if (!requirements) {
    return { valid: false, message: 'Invalid role' };
  }

  const colleges = Array.isArray(collegeIds) ? collegeIds : (collegeIds ? [collegeIds] : []);
  const courses = Array.isArray(courseIds) ? courseIds : (courseIds ? [courseIds] : []);
  const branches = Array.isArray(branchIds) ? branchIds : (branchIds ? [branchIds] : []);

  if (requirements.requiresCollege && colleges.length === 0) {
    return { valid: false, message: `${role} requires at least one college assignment` };
  }

  if (requirements.requiresCourse && !allCourses && courses.length === 0) {
    return { valid: false, message: `${role} requires at least one course assignment or "All Courses"` };
  }

  if (requirements.requiresBranch && !allBranches && branches.length === 0) {
    return { valid: false, message: `${role} requires at least one branch assignment or "All Branches"` };
  }

  if (role === USER_ROLES.SUPER_ADMIN && (colleges.length > 0 || courses.length > 0 || branches.length > 0)) {
    return { valid: false, message: 'Super Admin cannot be assigned to college/course/branch' };
  }

  return { valid: true };
};

// Check if a role can create another role
const canCreateRole = (creatorRole, targetRole) => {
  const allowedRoles = ROLE_HIERARCHY[creatorRole] || [];
  return allowedRoles.includes(targetRole);
};

// Parse permissions from JSON (handles both old and new format)
const parsePermissions = (permissionsJson) => {
  if (!permissionsJson) return createDefaultPermissions();

  try {
    const parsed = typeof permissionsJson === 'string'
      ? JSON.parse(permissionsJson)
      : permissionsJson;

    const permissions = createDefaultPermissions();

    Object.keys(parsed).forEach(module => {
      if (ALL_MODULES.includes(module)) {
        const moduleDef = MODULE_PERMISSIONS[module];
        if (moduleDef) {
          // Check if any granular permission key exists in the input
          const hasGranularKeys = moduleDef.permissions.some(perm => parsed[module]?.[perm] !== undefined);

          if (hasGranularKeys) {
            // New format - individual permissions
            moduleDef.permissions.forEach(perm => {
              permissions[module][perm] = !!parsed[module]?.[perm];
            });

            // Preserve field_permissions for student_management
            // This is critical for field-level access control persistence
            if (module === MODULES.STUDENT_MANAGEMENT && parsed[module]?.field_permissions) {
              permissions[module].field_permissions = parsed[module].field_permissions;
            }
          } else if (parsed[module]?.read !== undefined || parsed[module]?.write !== undefined) {
            // Handle old format (read/write) - ONLY if no granular keys are found
            const hasAccess = parsed[module]?.read || parsed[module]?.write;
            moduleDef.permissions.forEach(perm => {
              permissions[module][perm] = hasAccess;
            });
          }
        }
      }
    });

    return permissions;
  } catch (error) {
    console.error('Error parsing permissions:', error);
    return createDefaultPermissions();
  }
};

// Check if user has permission for a module action
const hasPermission = (userPermissions, module, action = 'view') => {
  const permissions = parsePermissions(userPermissions);
  const modulePerms = permissions[module];
  if (!modulePerms) return false;

  // If action is specified, check for that specific permission
  if (modulePerms[action] !== undefined) {
    return modulePerms[action] === true;
  }

  // Fallback: check if user has any permission in this module
  return Object.values(modulePerms).some(val => val === true);
};

// Check if user has any access to a module
const hasModuleAccess = (userPermissions, module) => {
  const permissions = parsePermissions(userPermissions);
  const modulePerms = permissions[module];
  if (!modulePerms) return false;

  return Object.values(modulePerms).some(val => val === true);
};

// Role Labels for UI display
const ROLE_LABELS = {
  [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
  [USER_ROLES.COLLEGE_PRINCIPAL]: 'College Principal',
  [USER_ROLES.COLLEGE_AO]: 'College AO',
  [USER_ROLES.COLLEGE_ATTENDER]: 'College Attender',
  [USER_ROLES.BRANCH_HOD]: 'Branch HOD',
  [USER_ROLES.OFFICE_ASSISTANT]: 'Office Assistant',
  [USER_ROLES.CASHIER]: 'Cashier',
  [USER_ROLES.FACULTY]: 'Faculty'
};

module.exports = {
  USER_ROLES,
  ROLE_HIERARCHY,
  MODULES,
  MODULE_PERMISSIONS,
  MODULE_LABELS,
  ALL_MODULES,
  ROLE_REQUIREMENTS,
  ROLE_LABELS,
  createDefaultPermissions,
  createSuperAdminPermissions,
  validateRoleRequirements,
  canCreateRole,
  parsePermissions,
  hasPermission,
  hasModuleAccess
};

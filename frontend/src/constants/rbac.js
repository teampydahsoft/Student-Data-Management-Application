/**
 * Frontend RBAC Constants
 * Maps backend module keys to frontend navigation items
 * Supports granular permissions per module
 */

// Backend module keys (from backend/constants/rbac.js)
export const BACKEND_MODULES = {
  DASHBOARD: 'dashboard',
  PRE_REGISTRATION: 'pre_registration',
  STUDENT_MANAGEMENT: 'student_management',
  PROMOTIONS: 'promotions',
  SECTION_PARTITION: 'section_partition',
  ATTENDANCE: 'attendance',
  FEE_MANAGEMENT: 'fee_management',
  SETTINGS: 'settings',
  USER_MANAGEMENT: 'user_management',
  REPORTS: 'reports',
  TICKET_MANAGEMENT: 'ticket_management',
  ANNOUNCEMENTS: 'announcements',
  SERVICES: 'services',
  FACULTY_MANAGEMENT: 'faculty_management',
  FACULTY_ACADEMICS: 'faculty_academics'
};

// Granular Permissions for each module
export const MODULE_PERMISSIONS = {
  [BACKEND_MODULES.DASHBOARD]: {
    permissions: ['view'],
    labels: {
      view: 'View Dashboard'
    }
  },
  [BACKEND_MODULES.PRE_REGISTRATION]: {
    permissions: ['add_student', 'bulk_upload', 'approve', 'reject'],
    labels: {
      add_student: 'Add Student',
      bulk_upload: 'Bulk Upload',
      approve: 'Approve Submissions',
      reject: 'Reject Submissions'
    }
  },
  [BACKEND_MODULES.STUDENT_MANAGEMENT]: {
    permissions: ['view', 'add_student', 'bulk_upload', 'edit_student', 'delete_student', 'update_pin', 'export', 'view_sms', 'add_remarks', 'manage_remarks'],
    labels: {
      view: 'View Students',
      add_student: 'Add Student',
      bulk_upload: 'Bulk Upload',
      edit_student: 'Edit Students',
      delete_student: 'Delete Students',
      update_pin: 'Update PIN Number',
      export: 'Export Students',
      view_sms: 'View SMS Logs',
      add_remarks: 'Add Remarks',
      manage_remarks: 'Manage Remarks (Edit/Delete)'
    }
  },
  [BACKEND_MODULES.PROMOTIONS]: {
    permissions: ['view', 'manage'],
    labels: {
      view: 'View Promotions',
      manage: 'Manage Promotions'
    }
  },
  [BACKEND_MODULES.SECTION_PARTITION]: {
    permissions: ['view', 'manage'],
    labels: {
      view: 'View Section Partition',
      manage: 'Manage Section Partition'
    }
  },
  [BACKEND_MODULES.ATTENDANCE]: {
    permissions: ['view', 'mark', 'download', 'view_hourly', 'view_internship'],
    labels: {
      view: 'View Attendance',
      mark: 'Mark Attendance',
      download: 'Download Reports',
      view_hourly: 'View Hourly Attendance Monitoring',
      view_internship: 'View Internship Attendance'
    }
  },
  [BACKEND_MODULES.FEE_MANAGEMENT]: {
    permissions: ['view', 'write'],
    labels: {
      view: 'View Fees',
      write: 'Manage Fees'
    }
  },
  [BACKEND_MODULES.SETTINGS]: {
    permissions: [
      'view_courses', 'edit_courses',
      'view_calendar', 'edit_calendar',
      'view_academic_calendar', 'edit_academic_calendar',
      'view_forms', 'edit_forms',
      'view_quotas', 'edit_quotas',
      'view_caste_categories', 'edit_caste_categories',
      'view_notifications', 'edit_notifications',
      'view_college_transfer', 'edit_college_transfer',
      'view_student_layout', 'edit_student_layout',
      'view_qr_config', 'edit_qr_config',
      'view_rtf_amount', 'edit_rtf_amount',
      'view_freeze_database', 'edit_freeze_database'
    ],
    labels: {
      view_courses: 'View Courses / Colleges / Branches',
      edit_courses: 'Edit Courses / Colleges / Branches',
      view_calendar: 'View Holiday Calendar',
      edit_calendar: 'Edit Holiday Calendar',
      view_academic_calendar: 'View Academic Calendar',
      edit_academic_calendar: 'Edit Academic Calendar',
      view_forms: 'View Registration Forms',
      edit_forms: 'Edit Registration Forms',
      view_quotas: 'View Student Quotas',
      edit_quotas: 'Edit Student Quotas',
      view_caste_categories: 'View Caste Categories',
      edit_caste_categories: 'Edit Caste Categories',
      view_notifications: 'View Notification Settings',
      edit_notifications: 'Edit Notification Settings',
      view_college_transfer: 'View College Transfer',
      edit_college_transfer: 'Edit College Transfer',
      view_student_layout: 'View Student Portal Layout',
      edit_student_layout: 'Edit Student Portal Layout',
      view_qr_config: 'View QR Configuration',
      edit_qr_config: 'Edit QR Configuration',
      view_rtf_amount: 'View RTF Amount Setup',
      edit_rtf_amount: 'Edit RTF Amount Setup',
      view_freeze_database: 'View Freeze Database',
      edit_freeze_database: 'Manage Freeze Database'
    }
  },
  [BACKEND_MODULES.USER_MANAGEMENT]: {
    permissions: ['view', 'control'],
    labels: {
      view: 'View Users',
      control: 'Manage Users'
    }
  },
  [BACKEND_MODULES.REPORTS]: {
    permissions: ['view', 'download', 'view_registration', 'view_attendance', 'view_day_end', 'view_category', 'view_sms_reports', 'view_scholarship'],
    labels: {
      view: 'View Reports',
      download: 'Download Reports',
      view_registration: 'View Registration Reports',
      view_attendance: 'View Attendance Reports',
      view_day_end: 'View Day End Reports',
      view_category: 'View Category Reports',
      view_sms_reports: 'View SMS Reports',
      view_scholarship: 'View Scholarship Reports'
    }
  },
  [BACKEND_MODULES.TICKET_MANAGEMENT]: {
    permissions: ['read', 'write'],
    labels: {
      read: 'View Tickets',
      write: 'Manage Tickets'
    }
  },
  [BACKEND_MODULES.ANNOUNCEMENTS]: {
    permissions: ['view', 'create', 'edit', 'delete'],
    labels: {
      view: 'View Announcements',
      create: 'Create Announcements',
      edit: 'Edit Announcements',
      delete: 'Delete Announcements'
    }
  },
  [BACKEND_MODULES.SERVICES]: {
    permissions: ['view', 'manage_config', 'manage_requests'],
    labels: {
      view: 'View Services',
      manage_config: 'Manage Configuration (Create/Edit Services)',
      manage_requests: 'Manage Requests (Process/Close)'
    }
  },
  [BACKEND_MODULES.FACULTY_MANAGEMENT]: {
    permissions: ['view', 'create', 'edit', 'deactivate', 'assign_subjects'],
    labels: {
      view: 'View Faculty',
      create: 'Create Faculty',
      edit: 'Edit Faculty',
      deactivate: 'Deactivate Faculty',
      assign_subjects: 'Assign Subjects'
    }
  },
  [BACKEND_MODULES.FACULTY_ACADEMICS]: {
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
export const MODULE_LABELS = {
  [BACKEND_MODULES.DASHBOARD]: 'Dashboard',
  [BACKEND_MODULES.PRE_REGISTRATION]: 'Self Registration',
  [BACKEND_MODULES.STUDENT_MANAGEMENT]: 'Student Management',
  [BACKEND_MODULES.PROMOTIONS]: 'Promotions',
  [BACKEND_MODULES.SECTION_PARTITION]: 'Section Partition',
  [BACKEND_MODULES.ATTENDANCE]: 'Attendance',
  [BACKEND_MODULES.SETTINGS]: 'Settings',
  [BACKEND_MODULES.USER_MANAGEMENT]: 'User Management',
  [BACKEND_MODULES.REPORTS]: 'Reports',
  [BACKEND_MODULES.TICKET_MANAGEMENT]: 'Maintenance Management',
  [BACKEND_MODULES.ANNOUNCEMENTS]: 'Announcements',
  [BACKEND_MODULES.SERVICES]: 'Services',
  [BACKEND_MODULES.FACULTY_MANAGEMENT]: 'Faculty Management'
};

// Frontend navigation keys
export const FRONTEND_MODULES = {
  DASHBOARD: 'dashboard',
  FORMS: 'forms',
  SUBMISSIONS: 'submissions',
  STUDENTS: 'students',
  PROMOTIONS: 'promotions',
  SECTION_PARTITION: 'section_partition',
  ATTENDANCE: 'attendance',
  FEES: 'fees',
  COURSES: 'courses',
  USERS: 'users',
  REPORTS: 'reports',
  TICKETS: 'tickets',
  TASK_MANAGEMENT: 'task_management',
  ANNOUNCEMENTS: 'announcements',
  SERVICES: 'services',
  FACULTY_MANAGEMENT: 'faculty_management'
};

// Map frontend navigation keys to backend permission keys
export const FRONTEND_TO_BACKEND_MAP = {
  [FRONTEND_MODULES.DASHBOARD]: [BACKEND_MODULES.DASHBOARD],
  [FRONTEND_MODULES.FORMS]: [BACKEND_MODULES.PRE_REGISTRATION],
  [FRONTEND_MODULES.SUBMISSIONS]: [BACKEND_MODULES.PRE_REGISTRATION],
  [FRONTEND_MODULES.STUDENTS]: [BACKEND_MODULES.STUDENT_MANAGEMENT],
  [FRONTEND_MODULES.PROMOTIONS]: [BACKEND_MODULES.PROMOTIONS],
  [FRONTEND_MODULES.SECTION_PARTITION]: [BACKEND_MODULES.SECTION_PARTITION],
  [FRONTEND_MODULES.ATTENDANCE]: [BACKEND_MODULES.ATTENDANCE],
  [FRONTEND_MODULES.FEES]: [BACKEND_MODULES.FEE_MANAGEMENT],
  [FRONTEND_MODULES.COURSES]: [BACKEND_MODULES.SETTINGS],
  [FRONTEND_MODULES.USERS]: [BACKEND_MODULES.USER_MANAGEMENT],
  [FRONTEND_MODULES.REPORTS]: [BACKEND_MODULES.REPORTS],
  [FRONTEND_MODULES.TICKETS]: [BACKEND_MODULES.TICKET_MANAGEMENT],
  [FRONTEND_MODULES.TASK_MANAGEMENT]: [BACKEND_MODULES.TICKET_MANAGEMENT],
  [FRONTEND_MODULES.ANNOUNCEMENTS]: [BACKEND_MODULES.ANNOUNCEMENTS],
  [FRONTEND_MODULES.SERVICES]: [BACKEND_MODULES.SERVICES],
  [FRONTEND_MODULES.FACULTY_MANAGEMENT]: [BACKEND_MODULES.FACULTY_MANAGEMENT]
};

// Map backend module keys to frontend navigation keys (reverse mapping)
export const BACKEND_TO_FRONTEND_MAP = {
  [BACKEND_MODULES.DASHBOARD]: FRONTEND_MODULES.DASHBOARD,
  [BACKEND_MODULES.PRE_REGISTRATION]: [FRONTEND_MODULES.FORMS, FRONTEND_MODULES.SUBMISSIONS],
  [BACKEND_MODULES.STUDENT_MANAGEMENT]: FRONTEND_MODULES.STUDENTS,
  [BACKEND_MODULES.PROMOTIONS]: FRONTEND_MODULES.PROMOTIONS,
  [BACKEND_MODULES.SECTION_PARTITION]: FRONTEND_MODULES.SECTION_PARTITION,
  [BACKEND_MODULES.ATTENDANCE]: FRONTEND_MODULES.ATTENDANCE,
  [BACKEND_MODULES.FEE_MANAGEMENT]: FRONTEND_MODULES.FEES,
  [BACKEND_MODULES.SETTINGS]: FRONTEND_MODULES.COURSES,
  [BACKEND_MODULES.USER_MANAGEMENT]: FRONTEND_MODULES.USERS,
  [BACKEND_MODULES.REPORTS]: FRONTEND_MODULES.REPORTS,
  [BACKEND_MODULES.ANNOUNCEMENTS]: FRONTEND_MODULES.ANNOUNCEMENTS,
  [BACKEND_MODULES.SERVICES]: FRONTEND_MODULES.SERVICES,
  [BACKEND_MODULES.FACULTY_MANAGEMENT]: FRONTEND_MODULES.FACULTY_MANAGEMENT
};

// Route map for navigation
export const MODULE_ROUTE_MAP = {
  [FRONTEND_MODULES.DASHBOARD]: '/',
  [FRONTEND_MODULES.FORMS]: '/forms',
  [FRONTEND_MODULES.SUBMISSIONS]: '/students/self-registration',
  [FRONTEND_MODULES.STUDENTS]: '/students',
  [FRONTEND_MODULES.PROMOTIONS]: '/promotions',
  [FRONTEND_MODULES.SECTION_PARTITION]: '/section-partition',
  [FRONTEND_MODULES.ATTENDANCE]: '/attendance',
  [FRONTEND_MODULES.FEES]: '/fees',
  [FRONTEND_MODULES.COURSES]: '/courses',
  [FRONTEND_MODULES.USERS]: '/users',
  [FRONTEND_MODULES.REPORTS]: '/reports',
  [FRONTEND_MODULES.TICKETS]: '/tickets',
  [FRONTEND_MODULES.TASK_MANAGEMENT]: '/task-management',
  [FRONTEND_MODULES.ANNOUNCEMENTS]: '/announcements',
  [FRONTEND_MODULES.SERVICES]: '/services',
  [FRONTEND_MODULES.FACULTY_MANAGEMENT]: '/faculty-management',
  attendance_monitoring: '/attendance-monitoring'
};

// Get module key from path
export const getModuleKeyForPath = (path = '/') => {
  if (path === '/' || path.startsWith('/dashboard')) return FRONTEND_MODULES.DASHBOARD;
  if (path.startsWith('/forms')) return FRONTEND_MODULES.FORMS;
  if (path.startsWith('/students/self-registration')) return FRONTEND_MODULES.SUBMISSIONS;
  if (path.startsWith('/students/section-partition') || path.startsWith('/section-partition')) {
    return FRONTEND_MODULES.SECTION_PARTITION;
  }
  if (path.startsWith('/students')) return FRONTEND_MODULES.STUDENTS;
  if (path.startsWith('/promotions')) return FRONTEND_MODULES.PROMOTIONS;
  if (path.startsWith('/attendance')) return FRONTEND_MODULES.ATTENDANCE;
  if (path.startsWith('/courses')) return FRONTEND_MODULES.COURSES;
  if (path.startsWith('/users')) return FRONTEND_MODULES.USERS;
  if (path.startsWith('/reports')) return FRONTEND_MODULES.REPORTS;
  if (path.startsWith('/tickets')) return FRONTEND_MODULES.TICKETS;
  if (path.startsWith('/task-management')) return FRONTEND_MODULES.TASK_MANAGEMENT;
  if (path.startsWith('/announcements')) return FRONTEND_MODULES.ANNOUNCEMENTS;
  if (path.startsWith('/services')) return FRONTEND_MODULES.SERVICES;
  if (path.startsWith('/faculty-management')) return FRONTEND_MODULES.FACULTY_MANAGEMENT;
  if (path.startsWith('/attendance-monitoring')) return FRONTEND_MODULES.ATTENDANCE;
  return null;
};

/**
 * Check if user has access to a frontend module based on backend permissions
 * @param {Object} permissions - User's permissions object from backend
 * @param {string} frontendModule - Frontend module key to check
 * @returns {boolean} - Whether user has any access
 */
export const hasModuleAccess = (permissions, frontendModule) => {
  if (!permissions || !frontendModule) return false;

  const backendModules = FRONTEND_TO_BACKEND_MAP[frontendModule];
  if (!backendModules || backendModules.length === 0) return false;

  // User has access if ANY of the required backend permissions have any true permission
  return backendModules.some(backendModule => {
    const perm = permissions[backendModule];
    if (!perm) return false;
    return Object.values(perm).some(val => val === true);
  });
};

/**
 * Check if user has a specific permission for a module
 * @param {Object} permissions - User's permissions object from backend
 * @param {string} module - Backend module key
 * @param {string} action - Specific action to check (e.g., 'approve', 'reject', 'edit')
 * @returns {boolean} - Whether user has that specific permission
 */
export const hasPermission = (permissions, module, action) => {
  if (!permissions || !module || !action) return false;

  const modulePerm = permissions[module];
  if (!modulePerm) return false;

  return modulePerm[action] === true;
};

/**
 * Get all frontend modules user has access to based on backend permissions
 * @param {Object} permissions - User's permissions object from backend
 * @returns {string[]} - Array of frontend module keys user can access
 */
export const getAllowedFrontendModules = (permissions) => {
  if (!permissions) return [];

  const allowedModules = [];

  Object.keys(FRONTEND_TO_BACKEND_MAP).forEach(frontendModule => {
    if (hasModuleAccess(permissions, frontendModule)) {
      allowedModules.push(frontendModule);
    }
  });

  return allowedModules;
};

/**
 * Check if user has write/manage permission for a frontend module
 * @param {Object} permissions - User's permissions object from backend
 * @param {string} frontendModule - Frontend module key to check
 * @returns {boolean} - Whether user has write/manage access
 */
export const hasWriteAccess = (permissions, frontendModule) => {
  if (!permissions || !frontendModule) return false;

  const backendModules = FRONTEND_TO_BACKEND_MAP[frontendModule];
  if (!backendModules || backendModules.length === 0) return false;

  // Check for write-type permissions (edit, control, manage, etc.)
  const writeActions = ['edit', 'control', 'manage', 'add_student', 'bulk_upload', 'delete_student', 'approve', 'reject', 'mark'];

  return backendModules.some(backendModule => {
    const perm = permissions[backendModule];
    if (!perm) return false;
    return writeActions.some(action => perm[action] === true);
  });
};

// User Roles
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin', // Legacy admin role
  COLLEGE_PRINCIPAL: 'college_principal',
  COLLEGE_AO: 'college_ao',
  COLLEGE_ATTENDER: 'college_attender',
  BRANCH_HOD: 'branch_hod',
  OFFICE_ASSISTANT: 'office_assistant',
  CASHIER: 'cashier',
  STAFF: 'staff', // Legacy staff role
  FACULTY: 'faculty',
  BRANCH_FACULTY: 'branch_faculty',
  // Ticket app roles
  COURSE_PRINCIPAL: 'course_principal',
  COURSE_HOD: 'course_hod',
  BRANCH_CLERK: 'branch_clerk',
  BRANCH_COUNSELOR: 'branch_counselor',
  SUPPORT_STAFF: 'support_staff'
};

// Role Labels for UI display
export const ROLE_LABELS = {
  [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
  [USER_ROLES.ADMIN]: 'Admin',
  [USER_ROLES.COLLEGE_PRINCIPAL]: 'College Principal',
  [USER_ROLES.COLLEGE_AO]: 'College AO',
  [USER_ROLES.COLLEGE_ATTENDER]: 'College Attender',
  [USER_ROLES.BRANCH_HOD]: 'Branch HOD',
  [USER_ROLES.OFFICE_ASSISTANT]: 'Office Assistant',
  [USER_ROLES.CASHIER]: 'Cashier',
  [USER_ROLES.STAFF]: 'Staff',
  [USER_ROLES.FACULTY]: 'Faculty',
  [USER_ROLES.BRANCH_FACULTY]: 'Branch Faculty',
  course_principal: 'Course Principal',
  course_hod: 'Course HOD',
  branch_clerk: 'Branch Clerk',
  branch_counselor: 'Branch Counselor',
  support_staff: 'Support Staff'
};

// Role Colors for UI
export const ROLE_COLORS = {
  [USER_ROLES.SUPER_ADMIN]: 'bg-rose-50 text-rose-700 border-rose-200',
  [USER_ROLES.ADMIN]: 'bg-rose-50 text-rose-700 border-rose-200',
  [USER_ROLES.COLLEGE_PRINCIPAL]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  [USER_ROLES.COLLEGE_AO]: 'bg-sky-50 text-sky-700 border-sky-200',
  [USER_ROLES.COLLEGE_ATTENDER]: 'bg-slate-100 text-slate-700 border-slate-200',
  [USER_ROLES.BRANCH_HOD]: 'bg-amber-50 text-amber-700 border-amber-200',
  [USER_ROLES.OFFICE_ASSISTANT]: 'bg-purple-50 text-purple-700 border-purple-200',
  [USER_ROLES.CASHIER]: 'bg-green-50 text-green-700 border-green-200',
  [USER_ROLES.STAFF]: 'bg-slate-100 text-slate-700 border-slate-200',
  [USER_ROLES.FACULTY]: 'bg-teal-50 text-teal-700 border-teal-200',
  [USER_ROLES.BRANCH_FACULTY]: 'bg-teal-50 text-teal-700 border-teal-200',
  course_principal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  course_hod: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  branch_clerk: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  branch_counselor: 'bg-orange-50 text-orange-700 border-orange-200',
  support_staff: 'bg-slate-100 text-slate-700 border-slate-200'
};

// Check if role has full access (super admin or legacy admin)
export const isFullAccessRole = (role) => {
  return role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.ADMIN;
};

// Create default permissions (all false)
export const createDefaultPermissions = () => {
  const permissions = {};
  Object.keys(BACKEND_MODULES).forEach(key => {
    const module = BACKEND_MODULES[key];
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

// Create super admin permissions (all true)
export const createSuperAdminPermissions = () => {
  const permissions = {};
  Object.keys(BACKEND_MODULES).forEach(key => {
    const module = BACKEND_MODULES[key];
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

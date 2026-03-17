const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { masterPool } = require('../config/database');
const {
  USER_ROLES,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  ROLE_REQUIREMENTS,
  validateRoleRequirements,
  canCreateRole,
  parsePermissions,
  createDefaultPermissions,
  createSuperAdminPermissions,
  MODULES,
  ALL_MODULES,
  hasPermission
} = require('../constants/rbac');
const { sendCredentialsEmail, sendPasswordResetEmail, sendBrevoEmail } = require('../utils/emailService');
const { getNotificationSetting } = require('./settingsController');
const { getPermissionsForRole, roleExistsInConfig } = require('./roleConfigController');
const { getScopeConditionString } = require('../utils/scoping');
const { getHRMSConnection } = require('../config/mongoConfig');
const { getModel: getHRMSEmployeeModel } = require('../models/HRMSEmployee');
const { getModel: getHRMSUserModel } = require('../models/HRMSUser');

// App configuration from environment
const appName = process.env.APP_NAME || 'Pydah Student Database';

// DLT SMS Template IDs for user credentials and password reset
const USER_CREATION_SMS_TEMPLATE_ID =
  process.env.USER_CREATION_SMS_TEMPLATE_ID || '1707176525577028276';
const PASSWORD_RESET_SMS_TEMPLATE_ID =
  process.env.PASSWORD_RESET_SMS_TEMPLATE_ID || '1707176526611076697';

// Helper function to replace template variables
const replaceTemplateVariables = (template, variables) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
};

// Helper function to convert plain text to HTML (basic conversion)
const textToHtml = (text) => {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '<p></p>';
      return `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
    })
    .join('\n');
};

// Helper function to send SMS (using the same service pattern as attendance)
const sendSms = async ({ to, message, templateId, peId }) => {
  const SMS_API_URL = process.env.SMS_API_URL || process.env.BULKSMS_API_URL || 'http://www.bulksmsapps.com/api/apismsv2.aspx';
  const SMS_API_KEY = process.env.SMS_API_KEY || process.env.BULKSMS_API_KEY;
  const SMS_SENDER_ID = process.env.SMS_SENDER_ID || process.env.BULKSMS_SENDER_ID || 'PYDAHK';
  const SMS_TEST_MODE = String(process.env.SMS_TEST_MODE || '').toLowerCase() === 'true';
  const SMS_TEMPLATE_ID = templateId || process.env.SMS_TEMPLATE_ID || '1607100000000150000';
  const SMS_PE_ID = peId || process.env.SMS_PE_ID || '1102395590000010000';

  if (!to) {
    return { success: false, skipped: true, reason: 'missing_destination' };
  }

  if (SMS_TEST_MODE) {
    console.log(`[SMS] 🧪 TEST MODE - SMS simulated to ${to}: ${message}`);
    return { success: true, mocked: true, testMode: true, sentTo: to };
  }

  if (!SMS_API_URL || !SMS_API_KEY) {
    console.warn(`[SMS] ⚠️ SKIPPED - SMS not configured`);
    return { success: false, skipped: true, reason: 'config_missing' };
  }

  try {
    const params = new URLSearchParams();
    params.append('apikey', SMS_API_KEY);
    params.append('sender', SMS_SENDER_ID);
    params.append('number', to);
    params.append('message', message);
    params.append('templateid', SMS_TEMPLATE_ID);
    params.append('peid', SMS_PE_ID);

    let apiUrl = SMS_API_URL;
    if (apiUrl.startsWith('https://')) {
      apiUrl = apiUrl.replace('https://', 'http://');
    }

    const fullUrl = `${apiUrl}?${params.toString()}`;
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain, application/json, */*',
        'User-Agent': 'NodeJS-SMS-Client/1.0'
      }
    });

    const text = await response.text();
    console.log(`[SMS] Response for ${to}: ${text.substring(0, 100)}`);

    if (response.ok) {
      return { success: true, sentTo: to, data: text };
    }

    return { success: false, skipped: false, reason: 'api_error', details: text, sentTo: to };
  } catch (error) {
    console.error(`[SMS] Exception: ${error.message}`);
    return { success: false, skipped: false, reason: 'exception', details: error.message, sentTo: to };
  }
};

/**
 * Check if user is a super admin (including legacy 'admin' role)
 */
const isSuperAdmin = (user) => {
  return user && (user.role === USER_ROLES.SUPER_ADMIN || user.role === 'admin');
};

/**
 * Parse scope data (JSON or single value)
 */
const parseScopeData = (data) => {
  if (!data) return [];
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [data];
  }
};

/**
 * GET /api/rbac/users
 * Get all users (filtered by scope)
 */
exports.getUsers = async (req, res) => {
  try {
    const user = req.user || req.admin;
    let query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.username,
        u.role,
        u.college_ids,
        u.course_ids,
        u.branch_ids,
        u.all_courses,
        u.all_branches,
        u.permissions,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.college_id,
        u.course_id,
        u.branch_id,
        u.hrms_id,
        c.name as college_name,
        co.name as course_name,
        cb.name as branch_name
      FROM rbac_users u
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN courses co ON u.course_id = co.id
      LEFT JOIN course_branches cb ON u.branch_id = cb.id
    `;
    const params = [];
    const conditions = [];

    // Super admin (including legacy 'admin') sees all users
    if (!isSuperAdmin(user)) {
      // College Principal / College AO sees users in their college
      if (user.role === USER_ROLES.COLLEGE_PRINCIPAL || user.role === USER_ROLES.COLLEGE_AO || user.role === USER_ROLES.COLLEGE_ATTENDER) {
        const [userRows] = await masterPool.query(
          'SELECT college_id, college_ids FROM rbac_users WHERE id = ?',
          [user.id]
        );

        let allowedCollegeIds = [];
        if (userRows && userRows.length > 0) {
          allowedCollegeIds = parseScopeData(userRows[0].college_ids);
          // Add primary college_id if not already in the list
          if (userRows[0].college_id && !allowedCollegeIds.includes(userRows[0].college_id)) {
            allowedCollegeIds.push(userRows[0].college_id);
          }
        }

        if (allowedCollegeIds.length > 0) {
          // STRICT SUBSET CHECK:
          // 1. User's primary college_id (if set) MUST be in allowed list
          // 2. User's college_ids array (if set) MUST be a subset of allowed list
          // 3. User MUST have at least one college assigned (to be "under" a college)

          conditions.push(`(
            (u.college_id IS NULL OR u.college_id IN (${allowedCollegeIds.map(() => '?').join(',')}))
            AND JSON_CONTAINS(?, COALESCE(u.college_ids, '[]'))
            AND (u.college_id IS NOT NULL OR JSON_LENGTH(COALESCE(u.college_ids, '[]')) > 0)
          )`);

          // Params: 
          // 1. IN clause values
          // 2. JSON_CONTAINS target (My Allowed List)
          params.push(...allowedCollegeIds, JSON.stringify(allowedCollegeIds));
        } else {
          // No scope assigned - show no users
          conditions.push('1=0');
        }
      }
      // Branch HOD sees only users in their branch
      else if (user.role === USER_ROLES.BRANCH_HOD) {
        const [userRows] = await masterPool.query(
          'SELECT branch_id, branch_ids FROM rbac_users WHERE id = ?',
          [user.id]
        );

        let allowedBranchIds = [];
        if (userRows && userRows.length > 0) {
          allowedBranchIds = parseScopeData(userRows[0].branch_ids);
          if (userRows[0].branch_id && !allowedBranchIds.includes(userRows[0].branch_id)) {
            allowedBranchIds.push(userRows[0].branch_id);
          }
        }

        if (allowedBranchIds.length > 0) {
          conditions.push(`(u.branch_id IN (${allowedBranchIds.map(() => '?').join(',')}) OR JSON_OVERLAPS(COALESCE(u.branch_ids, '[]'), ?))`);
          params.push(...allowedBranchIds, JSON.stringify(allowedBranchIds));
        } else {
          conditions.push('1=0');
        }
      } else {
        // Fallback for any other role not explicitly handled: prevent viewing all users
        // Only allow viewing themselves to avoid breaking their own profile view if used
        conditions.push('u.id = ?');
        params.push(user.id);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY u.created_at DESC';

    const [rows] = await masterPool.query(query, params);

    // Fetch college, course, branch names for multi-select
    const users = await Promise.all(rows.map(async (row) => {
      const collegeIds = parseScopeData(row.college_ids);
      const courseIds = parseScopeData(row.course_ids);
      const branchIds = parseScopeData(row.branch_ids);

      let collegeNames = [];
      let courseNames = [];
      let branchNames = [];

      if (collegeIds.length > 0) {
        const [colleges] = await masterPool.query(
          `SELECT id, name FROM colleges WHERE id IN (${collegeIds.map(() => '?').join(',')})`,
          collegeIds
        );
        collegeNames = colleges.map(c => ({ id: c.id, name: c.name }));
      }

      if (courseIds.length > 0) {
        const [courses] = await masterPool.query(
          `SELECT id, name FROM courses WHERE id IN (${courseIds.map(() => '?').join(',')})`,
          courseIds
        );
        courseNames = courses.map(c => ({ id: c.id, name: c.name }));
      }

      if (branchIds.length > 0) {
        const [branches] = await masterPool.query(
          `SELECT id, name FROM course_branches WHERE id IN (${branchIds.map(() => '?').join(',')})`,
          branchIds
        );
        branchNames = branches.map(b => ({ id: b.id, name: b.name }));
      }

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        username: row.username,
        role: row.role,
        roleLabel: ROLE_LABELS[row.role] || row.role || '—',
        collegeId: row.college_id,
        courseId: row.course_id,
        branchId: row.branch_id,
        collegeIds: collegeIds,
        courseIds: courseIds,
        branchIds: branchIds,
        allCourses: !!row.all_courses,
        allBranches: !!row.all_branches,
        collegeName: row.college_name,
        courseName: row.course_name,
        branchName: row.branch_name,
        collegeNames,
        courseNames,
        branchNames,
        permissions: parsePermissions(row.permissions),
        isActive: !!row.is_active,
        hrms_id: row.hrms_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }));

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
};

/**
 * GET /api/rbac/users/:id
 * Get single user by ID
 */
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || req.admin;

    const [rows] = await masterPool.query(
      `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.username,
          u.role,
          u.college_id,
          u.course_id,
          u.branch_id,
          u.college_ids,
          u.course_ids,
          u.branch_ids,
          u.all_courses,
          u.all_branches,
          u.permissions,
          u.is_active,
          u.hrms_id,
          u.created_at,
          u.updated_at,
          c.name as college_name,
          co.name as course_name,
          cb.name as branch_name
        FROM rbac_users u
        LEFT JOIN colleges c ON u.college_id = c.id
        LEFT JOIN courses co ON u.course_id = co.id
        LEFT JOIN course_branches cb ON u.branch_id = cb.id
        WHERE u.id = ?
      `,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = rows[0];

    // Check if current user can view this user (scope check)
    if (!isSuperAdmin(user)) {
      if ((user.role === USER_ROLES.COLLEGE_PRINCIPAL || user.role === USER_ROLES.COLLEGE_AO) && userData.college_id !== user.collegeId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      if (user.role === USER_ROLES.BRANCH_HOD && userData.branch_id !== user.branchId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const collegeIds = parseScopeData(userData.college_ids);
    const courseIds = parseScopeData(userData.course_ids);
    const branchIds = parseScopeData(userData.branch_ids);

    res.json({
      success: true,
      data: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        username: userData.username,
        role: userData.role,
        roleLabel: ROLE_LABELS[userData.role] || userData.role,
        collegeId: userData.college_id,
        courseId: userData.course_id,
        branchId: userData.branch_id,
        collegeIds,
        courseIds,
        branchIds,
        allCourses: !!userData.all_courses,
        allBranches: !!userData.all_branches,
        collegeName: userData.college_name,
        courseName: userData.course_name,
        branchName: userData.branch_name,
        permissions: parsePermissions(userData.permissions),
        isActive: !!userData.is_active,
        hrms_id: userData.hrms_id,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at
      }
    });
  } catch (error) {
    console.error('Failed to fetch user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
};

/**
 * GET /api/rbac/users/search-hrms-employee
 * Search for an employee in the remote HRMS MongoDB
 */
exports.searchHRMSEmployee = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 3) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 3 characters long' });
    }

    const hrmsConn = getHRMSConnection();
    if (!hrmsConn) {
      return res.status(503).json({ success: false, message: 'HRMS Database connection is currently unavailable' });
    }

    const HRMSEmployee = getHRMSEmployeeModel(hrmsConn);
    const HRMSUser = getHRMSUserModel(hrmsConn);
    const regex = new RegExp(query, 'i');

    // Search both collections concurrently
    const [employees, users] = await Promise.all([
      HRMSEmployee.find({
        $or: [
          { emp_no: regex },
          { employee_name: regex },
          { email: regex }
        ],
        is_active: true
      }).limit(10).lean().exec(),
      HRMSUser.find({
        $or: [
          { name: regex },
          { email: regex }
        ],
        isActive: true
      }).limit(10).lean().exec()
    ]);

    // Transform and combine results
    // Fetch and merge data for better autofill
    const employeeResults = await Promise.all(employees.map(async (emp) => {
      // Try to find a linked user to get more data (like email if missing)
      let linkedEmail = emp.email;
      const linkedUser = await HRMSUser.findOne({ 
        $or: [
          { employeeId: emp.emp_no },
          { email: emp.email }
        ]
      }).lean().exec();

      if (linkedUser && !linkedEmail) {
        linkedEmail = linkedUser.email;
      }

      return {
        _id: emp._id.toString(),
        emp_no: emp.emp_no,
        name: emp.employee_name,
        email: linkedEmail || emp.emp_no, // Fallback to emp_no if still null
        phone: emp.phone_number || '',
        type: 'Employee'
      };
    }));

    const userResults = users.map(user => ({
      _id: user._id.toString(),
      emp_no: user.employeeId || user.email, // Use employeeId if available
      name: user.name,
      email: user.email,
      phone: '', // Users collection usually doesn't have phone
      type: 'User'
    }));

    return res.json({ success: true, data: [...employeeResults, ...userResults] });
  } catch (error) {
    console.error('Failed to search HRMS employees:', error);
    res.status(500).json({ success: false, message: 'Server error while searching HRMS' });
  }
};

/**
 * POST /api/rbac/users
 * Create new user
 */
exports.createUser = async (req, res) => {
  try {
    const creator = req.user || req.admin;
    const {
      name,
      email,
      phone,
      username,
      password,
      role,
      collegeId,
      courseId,
      branchId,
      collegeIds,
      courseIds,
      branchIds,
      allCourses,
      allBranches,
      permissions,
      sendCredentials,
      hrms_id
    } = req.body;

    // Validate required fields (password is not required if hrms_id is provided)
    if (!name || !email || !username || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, username, and role are required'
      });
    }

    if (!hrms_id && !password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required for local users'
      });
    }

    // Validate password length for local users
    if (!hrms_id && password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Normalize IDs to arrays
    const normalizedCollegeIds = collegeIds && collegeIds.length > 0
      ? collegeIds
      : (collegeId ? [collegeId] : []);
    const normalizedCourseIds = courseIds && courseIds.length > 0
      ? courseIds
      : (courseId ? [courseId] : []);
    const normalizedBranchIds = branchIds && branchIds.length > 0
      ? branchIds
      : (branchId ? [branchId] : []);

    // Validate role requirements
    const roleValidation = validateRoleRequirements(
      role,
      normalizedCollegeIds,
      normalizedCourseIds,
      normalizedBranchIds,
      allCourses,
      allBranches
    );
    if (!roleValidation.valid) {
      return res.status(400).json({
        success: false,
        message: roleValidation.message
      });
    }

    // Check if creator can create this role (super_admin may also create custom roles from role config)
    const effectiveCreatorRole = creator.role === 'admin' ? USER_ROLES.SUPER_ADMIN : creator.role;
    const canCreate = canCreateRole(effectiveCreatorRole, role) || (isSuperAdmin(creator) && (await roleExistsInConfig(role)));
    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to create users with role: ${role}`
      });
    }

    // Validate scope restrictions
    if (!isSuperAdmin(creator)) {
      // College Principal / College AO can only create users in their college
      if (creator.role === USER_ROLES.COLLEGE_PRINCIPAL || creator.role === USER_ROLES.COLLEGE_AO) {
        const [userRows] = await masterPool.query(
          'SELECT college_id, college_ids FROM rbac_users WHERE id = ?',
          [creator.id]
        );
        if (userRows && userRows.length > 0) {
          const creatorCollegeIds = parseScopeData(userRows[0].college_ids);
          const creatorCollegeId = userRows[0].college_id;
          const allowedColleges = creatorCollegeIds.length > 0 ? creatorCollegeIds : (creatorCollegeId ? [creatorCollegeId] : []);

          const isValidScope = normalizedCollegeIds.every(id => allowedColleges.includes(id));
          if (!isValidScope) {
            return res.status(403).json({
              success: false,
              message: 'You can only create users in your assigned colleges'
            });
          }
        }
      }
      // Branch HOD can only create users in their branch
      else if (creator.role === USER_ROLES.BRANCH_HOD) {
        const [userRows] = await masterPool.query(
          'SELECT branch_id, branch_ids FROM rbac_users WHERE id = ?',
          [creator.id]
        );
        if (userRows && userRows.length > 0) {
          const creatorBranchIds = parseScopeData(userRows[0].branch_ids);
          const creatorBranchId = userRows[0].branch_id;
          const allowedBranches = creatorBranchIds.length > 0 ? creatorBranchIds : (creatorBranchId ? [creatorBranchId] : []);

          const isValidScope = normalizedBranchIds.every(id => allowedBranches.includes(id));
          if (!isValidScope) {
            return res.status(403).json({
              success: false,
              message: 'You can only create users in your assigned branches'
            });
          }
        }
      }
    }

    // Check if email or username already exists
    const [existing] = await masterPool.query(
      'SELECT id FROM rbac_users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email or username already exists'
      });
    }

    // Hash the provided password (or null if HRMS)
    let hashedPassword = null;
    if (!hrms_id) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Permissions: super_admin gets all; others use role config (single source of truth)
    let userPermissions;
    if (role === USER_ROLES.SUPER_ADMIN) {
      userPermissions = createSuperAdminPermissions();
    } else {
      userPermissions = await getPermissionsForRole(role);
      if (!userPermissions) {
        userPermissions = parsePermissions(permissions) || createDefaultPermissions();
      }
    }

    // Insert user with multi-select support
    const [result] = await masterPool.query(
      `
        INSERT INTO rbac_users 
          (name, email, phone, username, password, role, hrms_id, college_id, course_id, branch_id, 
           college_ids, course_ids, branch_ids, all_courses, all_branches, permissions, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, CAST(? AS JSON), ?)
      `,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone ? phone.trim() : null,
        username.trim(),
        hashedPassword,
        role,
        hrms_id || null,
        normalizedCollegeIds[0] || null,
        normalizedCourseIds[0] || null,
        normalizedBranchIds[0] || null,
        JSON.stringify(normalizedCollegeIds),
        JSON.stringify(normalizedCourseIds),
        JSON.stringify(normalizedBranchIds),
        allCourses ? 1 : 0,
        allBranches ? 1 : 0,
        JSON.stringify(userPermissions),
        creator.id
      ]
    );

    // Fetch created user
    const [rows] = await masterPool.query(
      `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.username,
          u.role,
          u.college_id,
          u.course_id,
          u.branch_id,
          u.college_ids,
          u.course_ids,
          u.branch_ids,
          u.all_courses,
          u.all_branches,
          u.permissions,
          u.is_active,
          u.created_at,
          u.updated_at,
          c.name as college_name,
          co.name as course_name,
          cb.name as branch_name
        FROM rbac_users u
        LEFT JOIN colleges c ON u.college_id = c.id
        LEFT JOIN courses co ON u.course_id = co.id
        LEFT JOIN course_branches cb ON u.branch_id = cb.id
        WHERE u.id = ?
      `,
      [result.insertId]
    );

    const newUser = rows[0];

    // Send credentials notifications (email and/or SMS) based on settings
    let emailSent = false;
    let smsSent = false;
    let emailError = null;
    let smsError = null;

    if (sendCredentials && !hrms_id) { // Only send credentials for local users
      try {
        // Get notification settings
        const notificationSettings = await getNotificationSetting('user_creation');

        if (notificationSettings && notificationSettings.enabled) {
          // Use production URL directly
          const appUrl = 'pydahsdms.vercel.app';
          const variables = {
            name: name.trim(),
            username: username.trim(),
            password: password,
            role: ROLE_LABELS[role] || role,
            loginUrl: `${appUrl}/login`
          };

          // Send email if enabled
          if (notificationSettings.emailEnabled) {
            try {
              // Use custom template if available, otherwise use default function
              if (notificationSettings.emailTemplate) {
                const emailSubject = replaceTemplateVariables(
                  notificationSettings.emailSubject || 'Your Account Has Been Created',
                  variables
                );
                const emailBody = replaceTemplateVariables(notificationSettings.emailTemplate, variables);
                const logoUrl = 'https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_162,h_89,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png';

                // Parse email body to extract and format credentials
                let formattedBody = emailBody;
                const hasCredentials = /(?:Username|Password|Role)/i.test(emailBody);

                // If credentials are found, format them in a styled table
                if (hasCredentials) {
                  const usernameMatch = emailBody.match(/(?:Username|username):\s*([^\n\r]+)/i);
                  const passwordMatch = emailBody.match(/(?:Password|password):\s*([^\n\r]+)/i);
                  const roleMatch = emailBody.match(/(?:Role|role):\s*([^\n\r]+)/i);

                  // Extract credential values from variables if not found in template
                  const usernameValue = usernameMatch ? usernameMatch[1].trim() : variables.username;
                  const passwordValue = passwordMatch ? passwordMatch[1].trim() : variables.password;
                  const roleValue = roleMatch ? roleMatch[1].trim() : variables.role;

                  // Remove credential lines from body
                  formattedBody = emailBody
                    .replace(/(?:Username|username):\s*[^\n\r]+\n?/gi, '')
                    .replace(/(?:Password|password):\s*[^\n\r]+\n?/gi, '')
                    .replace(/(?:Role|role):\s*[^\n\r]+\n?/gi, '')
                    .replace(/\n{3,}/g, '\n\n') // Clean up multiple newlines
                    .trim();

                  // Create credentials table HTML
                  const credentialsTable = `
                    <div class="credentials-box">
                      <table class="credentials-table">
                        <tr><td class="credential-label">Username</td><td><span class="credential-value">${usernameValue}</span></td></tr>
                        <tr><td class="credential-label">Password</td><td><span class="credential-value">${passwordValue}</span></td></tr>
                        <tr><td class="credential-label">Role</td><td><span class="role-badge">${roleValue}</span></td></tr>
                      </table>
                    </div>
                  `;

                  // Insert credentials table before login URL or at the end
                  if (formattedBody.includes('Login URL') || formattedBody.includes('loginUrl') || formattedBody.includes('{{loginUrl}}')) {
                    formattedBody = formattedBody.replace(/(Login URL|loginUrl|{{loginUrl}})[^\n\r]*/i, credentialsTable + '\n\n$&');
                  } else {
                    formattedBody = formattedBody + '\n\n' + credentialsTable;
                  }
                }

                const htmlContent = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        background-color: #f5f7fa; 
                        margin: 0; 
                        padding: 15px 0;
                        line-height: 1.5;
                      }
                      .email-wrapper { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: #ffffff;
                      }
                      .header { 
                        background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); 
                        padding: 25px 20px; 
                        text-align: center;
                      }
                      .logo {
                        max-width: 150px;
                        height: auto;
                        display: block;
                        margin: 0 auto 10px;
                      }
                      .content { 
                        padding: 25px 20px; 
                        background: #ffffff;
                        color: #1e293b;
                        font-size: 14px;
                        line-height: 1.6;
                      }
                      .content p {
                        margin: 10px 0;
                      }
                      .content strong {
                        color: #FF6B35;
                      }
                      .credentials-box { 
                        background: #f8fafc; 
                        border: 1px solid #e2e8f0; 
                        border-radius: 8px; 
                        padding: 15px; 
                        margin: 15px 0;
                      }
                      .credentials-table {
                        width: 100%;
                        border-collapse: collapse;
                      }
                      .credentials-table tr {
                        border-bottom: 1px solid #e2e8f0;
                      }
                      .credentials-table tr:last-child {
                        border-bottom: none;
                      }
                      .credentials-table td {
                        padding: 12px 0;
                        vertical-align: middle;
                      }
                      .credential-label { 
                        color: #64748b; 
                        font-weight: 600;
                        font-size: 14px;
                        width: 120px;
                        padding-right: 15px;
                      }
                      .credential-value { 
                        color: #1e293b; 
                        font-family: 'Courier New', monospace; 
                        background: #ffffff; 
                        padding: 6px 12px; 
                        border-radius: 4px;
                        font-weight: 600;
                        font-size: 14px;
                        border: 1px solid #cbd5e1;
                        display: inline-block;
                        min-width: 150px;
                      }
                      .role-badge { 
                        display: inline-block; 
                        background: #3b82f6; 
                        color: #ffffff; 
                        padding: 4px 12px; 
                        border-radius: 12px; 
                        font-weight: 600; 
                        font-size: 12px;
                      }
                      .footer { 
                        background: #f8fafc; 
                        padding: 15px 20px; 
                        text-align: center; 
                        color: #64748b; 
                        font-size: 11px;
                        border-top: 1px solid #e2e8f0;
                      }
                      .footer p {
                        margin: 3px 0;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="email-wrapper">
                      <div class="header">
                        <img src="${logoUrl}" alt="${appName} Logo" class="logo" />
                        <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0;">Account Created</h1>
                      </div>
                      <div class="content">
                        ${textToHtml(formattedBody)}
                      </div>
                      <div class="footer">
                        <p><strong>${appName}</strong></p>
                        <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
                      </div>
                    </div>
                  </body>
                  </html>
                `;

                const emailResult = await sendBrevoEmail({
                  to: email.trim().toLowerCase(),
                  toName: name.trim(),
                  subject: emailSubject,
                  htmlContent
                });
                emailSent = emailResult.success;
                if (!emailResult.success) {
                  emailError = emailResult.message || 'Failed to send email';
                }
              } else {
                // Fallback to default email function
                const emailResult = await sendCredentialsEmail({
                  email: email.trim().toLowerCase(),
                  name: name.trim(),
                  username: username.trim(),
                  password: password,
                  role: ROLE_LABELS[role] || role
                });
                emailSent = emailResult.success;
                if (!emailResult.success) {
                  emailError = emailResult.message || 'Failed to send email';
                }
              }
            } catch (emailErr) {
              emailError = emailErr.message || 'Unexpected error while sending email';
              console.error('❌ Exception while sending email notification:', {
                userId: newUser.id,
                email: email.trim().toLowerCase(),
                error: emailError,
                stack: emailErr.stack
              });
            }
          }

          // Send SMS (default on) if phone is available
          if (notificationSettings.smsEnabled !== false && phone) {
            try {
              const smsMessage = notificationSettings.smsTemplate
                ? replaceTemplateVariables(notificationSettings.smsTemplate, variables)
                : `Hello ${variables.name} your account has been created. Username: ${variables.username} Password: ${variables.password}. Login: ${variables.loginUrl} - Pydah College`;
              const smsResult = await sendSms({
                to: phone.trim(),
                message: smsMessage,
                templateId: USER_CREATION_SMS_TEMPLATE_ID
              });
              smsSent = smsResult.success;
              if (!smsResult.success) {
                smsError = smsResult.reason || 'Failed to send SMS';
              }
            } catch (smsErr) {
              smsError = smsErr.message || 'Unexpected error while sending SMS';
              console.error('❌ Exception while sending SMS notification:', {
                userId: newUser.id,
                phone: phone.trim(),
                error: smsError,
                stack: smsErr.stack
              });
            }
          }
        } else {
          // Fallback to default email if settings not available
          try {
            const emailResult = await sendCredentialsEmail({
              email: email.trim().toLowerCase(),
              name: name.trim(),
              username: username.trim(),
              password: password,
              role: ROLE_LABELS[role] || role
            });
            emailSent = emailResult.success;
            if (!emailResult.success) {
              emailError = emailResult.message || 'Failed to send email';
            }
          } catch (emailErr) {
            emailError = emailErr.message || 'Unexpected error while sending email';
          }
        }
      } catch (notifErr) {
        console.error('❌ Error getting notification settings:', notifErr);
        // Fallback to default email
        try {
          const emailResult = await sendCredentialsEmail({
            email: email.trim().toLowerCase(),
            name: name.trim(),
            username: username.trim(),
            password: password,
            role: ROLE_LABELS[role] || role
          });
          emailSent = emailResult.success;
          if (!emailResult.success) {
            emailError = emailResult.message || 'Failed to send email';
          }
        } catch (emailErr) {
          emailError = emailErr.message || 'Unexpected error while sending email';
        }
      }
    }

    // Build success message
    let successMessage = 'User created successfully';
    if (sendCredentials) {
      const notifications = [];
      if (emailSent) notifications.push('email');
      if (smsSent) notifications.push('SMS');
      if (notifications.length > 0) {
        successMessage = `User created and credentials sent via ${notifications.join(' and ')}!`;
      } else if (emailError || smsError) {
        const errors = [];
        if (emailError) errors.push(`email: ${emailError}`);
        if (smsError) errors.push(`SMS: ${smsError}`);
        successMessage = `User created successfully, but notifications failed (${errors.join(', ')})`;
      }
    }

    res.status(201).json({
      success: true,
      message: successMessage,
      notificationsAttempted: !!(sendCredentials && !hrms_id),
      emailSent,
      smsSent,
      emailError: emailError || undefined,
      smsError: smsError || undefined,
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        username: newUser.username,
        role: newUser.role,
        roleLabel: ROLE_LABELS[newUser.role] || newUser.role,
        collegeId: newUser.college_id,
        courseId: newUser.course_id,
        branchId: newUser.branch_id,
        collegeIds: parseScopeData(newUser.college_ids),
        courseIds: parseScopeData(newUser.course_ids),
        branchIds: parseScopeData(newUser.branch_ids),
        allCourses: !!newUser.all_courses,
        allBranches: !!newUser.all_branches,
        collegeName: newUser.college_name,
        courseName: newUser.course_name,
        branchName: newUser.branch_name,
        permissions: parsePermissions(newUser.permissions),
        isActive: !!newUser.is_active,
        createdAt: newUser.created_at,
        updatedAt: newUser.updated_at
      }
    });
  } catch (error) {
    console.error('Failed to create user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Email or username already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
};

/**
 * PUT /api/rbac/users/:id
 * Update user
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updater = req.user || req.admin;
    const {
      name,
      email,
      phone,
      role,
      collegeId,
      courseId,
      branchId,
      collegeIds,
      courseIds,
      branchIds,
      allCourses,
      allBranches,
      permissions,
      isActive,
      hrms_id
    } = req.body;

    // Fetch existing user
    const [existingRows] = await masterPool.query(
      'SELECT * FROM rbac_users WHERE id = ?',
      [id]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const existingUser = existingRows[0];

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email.trim().toLowerCase());
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? phone.trim() : null);
    }

    if (hrms_id !== undefined) {
      updates.push('hrms_id = ?');
      params.push(hrms_id || null);
    }

    if (role !== undefined) {
      // Validate role requirements
      const normalizedCollegeIds = collegeIds !== undefined ? collegeIds : parseScopeData(existingUser.college_ids);
      const normalizedCourseIds = courseIds !== undefined ? courseIds : parseScopeData(existingUser.course_ids);
      const normalizedBranchIds = branchIds !== undefined ? branchIds : parseScopeData(existingUser.branch_ids);
      const useAllCourses = allCourses !== undefined ? allCourses : !!existingUser.all_courses;
      const useAllBranches = allBranches !== undefined ? allBranches : !!existingUser.all_branches;

      const roleValidation = validateRoleRequirements(
        role,
        normalizedCollegeIds,
        normalizedCourseIds,
        normalizedBranchIds,
        useAllCourses,
        useAllBranches
      );
      if (!roleValidation.valid) {
        return res.status(400).json({
          success: false,
          message: roleValidation.message
        });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (collegeId !== undefined) {
      updates.push('college_id = ?');
      params.push(collegeId || null);
    }

    if (courseId !== undefined) {
      updates.push('course_id = ?');
      params.push(courseId || null);
    }

    if (branchId !== undefined) {
      updates.push('branch_id = ?');
      params.push(branchId || null);
    }

    if (collegeIds !== undefined) {
      updates.push('college_ids = CAST(? AS JSON)');
      params.push(JSON.stringify(collegeIds || []));
      // Also update the single college_id for backward compatibility
      if (collegeIds && collegeIds.length > 0) {
        updates.push('college_id = ?');
        params.push(collegeIds[0]);
      }
    }

    if (courseIds !== undefined) {
      updates.push('course_ids = CAST(? AS JSON)');
      params.push(JSON.stringify(courseIds || []));
      // Also update the single course_id for backward compatibility
      if (courseIds && courseIds.length > 0) {
        updates.push('course_id = ?');
        params.push(courseIds[0]);
      }
    }

    if (branchIds !== undefined) {
      // Always update branch_ids, even if it's an empty array
      const branchIdsJson = JSON.stringify(Array.isArray(branchIds) ? branchIds : []);
      updates.push('branch_ids = CAST(? AS JSON)');
      params.push(branchIdsJson);

      // Also update the single branch_id for backward compatibility
      if (Array.isArray(branchIds) && branchIds.length > 0) {
        updates.push('branch_id = ?');
        params.push(branchIds[0]);
      } else {
        // Clear branch_id when branchIds is empty or not an array
        updates.push('branch_id = NULL');
      }

      console.log(`[Update User] Updating branchIds: ${branchIdsJson}, branch_id: ${Array.isArray(branchIds) && branchIds.length > 0 ? branchIds[0] : 'NULL'}`);
    }

    if (allCourses !== undefined) {
      updates.push('all_courses = ?');
      params.push(allCourses ? 1 : 0);
    }

    // Handle allBranches update
    if (allBranches !== undefined) {
      updates.push('all_branches = ?');
      params.push(allBranches ? 1 : 0);

      // When allBranches is true, ensure branch_ids and branch_id are cleared
      // (branch_ids will be handled by branchIds check above if provided)
      if (allBranches && branchIds === undefined) {
        // If branchIds wasn't provided but allBranches is true, clear branch_ids
        updates.push('branch_ids = CAST(? AS JSON)');
        params.push(JSON.stringify([]));
        // Clear branch_id if not already cleared
        const hasBranchIdUpdate = updates.some(u =>
          u.includes('branch_id = NULL') || u.includes('branch_id = ?')
        );
        if (!hasBranchIdUpdate) {
          updates.push('branch_id = NULL');
        }
      }

      console.log(`[Update User] Updating allBranches: ${allBranches}, branchIds provided: ${branchIds !== undefined}`);
    }

    if (permissions !== undefined) {
      const parsed = parsePermissions(permissions);
      updates.push('permissions = CAST(? AS JSON)');
      params.push(JSON.stringify(parsed));
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const updateQuery = `UPDATE rbac_users SET ${updates.join(', ')} WHERE id = ?`;
    console.log(`[Update User] Executing update query for user ${id}:`, updateQuery);
    console.log(`[Update User] Update params (excluding id):`, params.slice(0, -1));

    const [updateResult] = await masterPool.query(updateQuery, params);
    console.log(`[Update User] Update result - affected rows: ${updateResult.affectedRows}`);

    // Fetch updated user
    const [rows] = await masterPool.query(
      `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.username,
          u.role,
          u.college_id,
          u.course_id,
          u.branch_id,
          u.college_ids,
          u.course_ids,
          u.branch_ids,
          u.all_courses,
          u.all_branches,
          u.permissions,
          u.is_active,
          u.created_at,
          u.updated_at,
          c.name as college_name,
          co.name as course_name,
          cb.name as branch_name
        FROM rbac_users u
        LEFT JOIN colleges c ON u.college_id = c.id
        LEFT JOIN courses co ON u.course_id = co.id
        LEFT JOIN course_branches cb ON u.branch_id = cb.id
        WHERE u.id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email,
        phone: rows[0].phone,
        username: rows[0].username,
        role: rows[0].role,
        roleLabel: ROLE_LABELS[rows[0].role] || rows[0].role,
        collegeId: rows[0].college_id,
        courseId: rows[0].course_id,
        branchId: rows[0].branch_id,
        collegeIds: parseScopeData(rows[0].college_ids),
        courseIds: parseScopeData(rows[0].course_ids),
        branchIds: parseScopeData(rows[0].branch_ids),
        allCourses: !!rows[0].all_courses,
        allBranches: !!rows[0].all_branches,
        collegeName: rows[0].college_name,
        courseName: rows[0].course_name,
        branchName: rows[0].branch_name,
        permissions: parsePermissions(rows[0].permissions),
        isActive: !!rows[0].is_active,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
};

/**
 * DELETE /api/rbac/users/:id
 * Delete user (soft delete by setting is_active = false)
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await masterPool.query(
      'UPDATE rbac_users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
};

/**
 * DELETE /api/rbac/users/:id/permanent
 * Permanently delete user from database
 */
exports.permanentDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || req.admin;

    // Only super admin or users with full control permission can permanently delete users
    const hasControl = hasPermission(user.permissions, MODULES.USER_MANAGEMENT, 'control');
    if (!isSuperAdmin(user) && !hasControl) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to permanently delete users'
      });
    }

    // Check if user exists
    const [userRows] = await masterPool.query(
      'SELECT id, username, role FROM rbac_users WHERE id = ?',
      [id]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const targetUser = userRows[0];

    // Prevent deleting super admin users
    if (targetUser.role === USER_ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete Super Admin users'
      });
    }

    // Permanently delete the user
    const [result] = await masterPool.query(
      'DELETE FROM rbac_users WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User permanently deleted'
    });
  } catch (error) {
    console.error('Failed to permanently delete user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
};

/**
 * POST /api/rbac/users/:id/reset-password
 * Reset user password and send email
 */
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Get user details including phone
    const [users] = await masterPool.query(
      'SELECT id, name, email, username, role, phone FROM rbac_users WHERE id = ?',
      [id]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await masterPool.query(
      'UPDATE rbac_users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, id]
    );

    // Send notifications (email and/or SMS) based on settings
    let emailSent = false;
    let smsSent = false;
    let emailError = null;
    let smsError = null;

    try {
      // Get notification settings for password update
      const notificationSettings = await getNotificationSetting('password_update');

      if (notificationSettings && notificationSettings.enabled) {
        // Use production URL directly
        const appUrl = 'pydahsdms.vercel.app';
        const variables = {
          name: user.name,
          username: user.username,
          password: newPassword,
          newPassword: newPassword,
          role: ROLE_LABELS[user.role] || user.role,
          loginUrl: `${appUrl}/login`
        };

        // Send email if enabled
        if (notificationSettings.emailEnabled) {
          try {
            const emailResult = await sendPasswordResetEmail({
              email: user.email,
              name: user.name,
              username: user.username,
              newPassword: newPassword,
              role: ROLE_LABELS[user.role] || user.role
            });
            emailSent = emailResult.success;
            if (!emailResult.success) {
              emailError = emailResult.message || 'Failed to send email';
            }
          } catch (emailErr) {
            emailError = emailErr.message || 'Unexpected error while sending email';
            console.error('❌ Exception while sending password reset email:', {
              userId: id,
              email: user.email,
              error: emailError,
              stack: emailErr.stack
            });
          }
        }

        // Send SMS (default on) if phone is available
        if (notificationSettings.smsEnabled !== false && user.phone) {
          try {
            const smsMessage = notificationSettings.smsTemplate
              ? replaceTemplateVariables(notificationSettings.smsTemplate, variables)
              : `Hello ${variables.name} your password has been updated. Username: ${variables.username} New Password: ${variables.password} Login: ${variables.loginUrl} - Pydah College`;
            const smsResult = await sendSms({
              to: user.phone.trim(),
              message: smsMessage,
              templateId: PASSWORD_RESET_SMS_TEMPLATE_ID
            });
            smsSent = smsResult.success;
            if (!smsResult.success) {
              smsError = smsResult.reason || 'Failed to send SMS';
            }
          } catch (smsErr) {
            smsError = smsErr.message || 'Unexpected error while sending SMS';
            console.error('❌ Exception while sending password reset SMS:', {
              userId: id,
              phone: user.phone,
              error: smsError,
              stack: smsErr.stack
            });
          }
        }
      } else {
        // Fallback to default email if settings not available
        try {
          const emailResult = await sendPasswordResetEmail({
            email: user.email,
            name: user.name,
            username: user.username,
            newPassword: newPassword,
            role: ROLE_LABELS[user.role] || user.role
          });
          emailSent = emailResult.success;
          if (!emailResult.success) {
            emailError = emailResult.message || 'Failed to send email';
          }
        } catch (emailErr) {
          emailError = emailErr.message || 'Unexpected error while sending email';
        }
      }
    } catch (notifErr) {
      emailError = notifErr.message || 'Unexpected error while sending notifications';
      console.error('❌ Exception while sending password reset notifications:', {
        userId: id,
        error: emailError,
        stack: notifErr.stack
      });
    }

    // Build success message
    const notifications = [];
    if (emailSent) notifications.push('email');
    if (smsSent) notifications.push('SMS');

    let successMessage = 'Password reset successfully';
    if (notifications.length > 0) {
      successMessage += ` and credentials sent via ${notifications.join(' and ')}!`;
    } else if (emailError || smsError) {
      const errors = [];
      if (emailError) errors.push(`email: ${emailError}`);
      if (smsError) errors.push(`SMS: ${smsError}`);
      successMessage += `, but notifications failed (${errors.join(', ')})`;
    }

    res.json({
      success: true,
      message: successMessage,
      emailSent,
      smsSent,
      emailError: emailError || undefined,
      smsError: smsError || undefined
    });
  } catch (error) {
    console.error('Failed to reset password:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password'
    });
  }
};

/**
 * GET /api/rbac/users/roles/available
 * Get available roles that current user can create (built-in + custom from role config for super_admin)
 */
exports.getAvailableRoles = async (req, res) => {
  try {
    const user = req.user || req.admin;
    const effectiveRole = user.role === 'admin' ? USER_ROLES.SUPER_ADMIN : user.role;
    let availableRoles = [];

    if (isSuperAdmin(user)) {
      // 1. Get standard configurable roles from roleConfigController
      const { CONFIGURABLE_ROLES } = require('./roleConfigController');
      availableRoles = [...(CONFIGURABLE_ROLES || [])];

      // 2. Add Faculty (standard teaching role)
      if (!availableRoles.includes(USER_ROLES.FACULTY)) {
        availableRoles.push(USER_ROLES.FACULTY);
      }

      // 3. Add dynamic roles from rbac_role_config
      const [customRows] = await masterPool.query(
        'SELECT role_key FROM rbac_role_config'
      ).catch(() => [[]]);
      
      (customRows || []).forEach(r => {
        if (!availableRoles.includes(r.role_key)) {
          availableRoles.push(r.role_key);
        }
      });
    } else {
      // For non-super admins, stay with standard hierarchy
      availableRoles = ROLE_HIERARCHY[effectiveRole] || [];
    }

    const roleLabels = { ...ROLE_LABELS };
    if (isSuperAdmin(user)) {
      const [rows] = await masterPool.query('SELECT role_key, label FROM rbac_role_config').catch(() => [[]]);
      (rows || []).forEach(r => { roleLabels[r.role_key] = r.label || r.role_key; });
    }

    res.json({
      success: true,
      data: availableRoles.map(role => ({
        value: role,
        label: roleLabels[role] || role,
        requirements: ROLE_REQUIREMENTS[role] || ROLE_REQUIREMENTS[USER_ROLES.COLLEGE_AO] || {}
      }))
    });
  } catch (error) {
    console.error('Failed to fetch available roles:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available roles'
    });
  }
};

/**
 * GET /api/rbac/users/modules
 * Get all available modules for permissions with granular permission details
 */
exports.getModules = async (req, res) => {
  try {
    const { MODULE_LABELS, MODULE_PERMISSIONS } = require('../constants/rbac');

    const modules = ALL_MODULES.map(module => ({
      key: module,
      label: MODULE_LABELS[module] || module,
      permissions: MODULE_PERMISSIONS[module]?.permissions || [],
      permissionLabels: MODULE_PERMISSIONS[module]?.labels || {}
    }));

    res.json({
      success: true,
      data: modules
    });
  } catch (error) {
    console.error('Failed to fetch modules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching modules'
    });
  }
};

/**
 * POST /api/rbac/forgot-password
 * Reset password and send to mobile
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    // Find user by phone
    const [users] = await masterPool.query(
      'SELECT id, name, phone, username FROM rbac_users WHERE phone = ? AND is_active = 1',
      [mobileNumber]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this mobile number'
      });
    }

    const user = users[0];

    // Generate new random password (8 chars)
    const newPassword = crypto.randomBytes(4).toString('hex');

    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in DB
    await masterPool.query(
      'UPDATE rbac_users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, user.id]
    );

    // Send SMS using the same template as students
    // Template: "Hello {#var#} your password has been updated. Username: {#var#} New Password: {#var#} Login: {#var#} - Pydah College"
    const loginUrl = (process.env.STUDENT_PORTAL_URL || 'pydahsdms.vercel.app').replace(/\/+$/, '');
    const message = `Hello ${user.name} your password has been updated. Username: ${user.username} New Password: ${newPassword} Login: ${loginUrl} - Pydah College`;

    // Explicitly use the Password Reset Template ID
    // 1707176526611076697 is the shared ID for password resets
    const TEMPLATE_ID = process.env.PASSWORD_RESET_SMS_TEMPLATE_ID || '1707176526611076697';

    const smsResult = await sendSms({
      to: mobileNumber,
      message: message,
      templateId: TEMPLATE_ID
    });

    if (smsResult.success) {
      return res.json({
        success: true,
        message: 'New password sent to your registered mobile number'
      });
    } else {
      console.error(`Failed to send SMS to ${mobileNumber}:`, smsResult);
      return res.status(500).json({
        success: false,
        message: 'Password reset but failed to send SMS. Please contact admin.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing request'
    });
  }
};

// Each year has only Sem 1 and Sem 2 (not cumulative 1-8). So for any years, semesters are [1, 2].
const yearsToSemesters = (years) => {
  if (!Array.isArray(years) || years.length === 0) return [];
  return [1, 2];
};

// Get Student Stats for Profile
exports.getStudentStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const scope = req.userScope;
    let collegeName = 'All Colleges';
    let courseName = 'All Courses';
    let branchName = 'All Branches';
    let scopeText = 'Global (System Level)';

    // Use getScopeConditionString so HOD year filter is applied for accurate count
    const { scopeCondition, params: scopeParams } = getScopeConditionString(scope || {}, 'students');
    const whereClause = scopeCondition ? `WHERE ${scopeCondition}` : 'WHERE 1=1';
    const [result] = await masterPool.query(
      `SELECT COUNT(*) as count FROM students ${whereClause}`,
      scopeParams || []
    );

    if (scope && !scope.unrestricted) {
      collegeName = scope.collegeNames?.length ? (scope.collegeNames.length > 1 ? `${scope.collegeNames.length} colleges` : scope.collegeNames[0]) : 'All Colleges';
      courseName = scope.courseNames?.length ? (scope.courseNames.length > 1 ? `${scope.courseNames.length} courses` : scope.courseNames[0]) : 'All Courses';
      branchName = scope.branchNames?.length ? (scope.branchNames.length > 1 ? `${scope.branchNames.length} branches` : scope.branchNames[0]) : 'All Branches';
      const parts = [];
      if (scope.collegeNames?.length) parts.push(scope.collegeNames.length > 1 ? `Colleges: ${scope.collegeNames.length}` : scope.collegeNames[0]);
      if (scope.courseNames?.length) parts.push(scope.courseNames.length > 1 ? `Courses: ${scope.courseNames.length}` : scope.courseNames[0]);
      if (scope.branchNames?.length) parts.push(scope.branchNames.length > 1 ? `Branches: ${scope.branchNames.length}` : scope.branchNames[0]);
      if (scope.hodYears?.length) parts.push(`Years: ${scope.hodYears.join(', ')}`);
      if (parts.length > 0) scopeText = parts.join(' > ');
    }

    // HOD profile: fetch branch + year assignments for branch_hod users
    let hodProfile = null;
    const role = (user.role || '').toString().toLowerCase();
    if (role === 'branch_hod') {
      try {
        const [assignRows] = await masterPool.query(
          `SELECT bhya.branch_id, bhya.years, cb.name AS branch_name
           FROM branch_hod_year_assignments bhya
           JOIN course_branches cb ON cb.id = bhya.branch_id
           WHERE bhya.rbac_user_id = ?`,
          [user.id]
        );
        const assignments = (assignRows || []).map((r) => {
          let yrs = r.years;
          if (typeof yrs === 'string') {
            try { yrs = JSON.parse(yrs); } catch (_) { yrs = []; }
          }
          if (!Array.isArray(yrs)) yrs = [];
          const semesters = yearsToSemesters(yrs);
          return {
            branchId: r.branch_id,
            branchName: r.branch_name || '—',
            years: yrs.sort((a, b) => a - b),
            semesters
          };
        });
        const allYears = [...new Set(assignments.flatMap((a) => a.years))].sort((a, b) => a - b);
        const allSemesters = yearsToSemesters(allYears);
        hodProfile = {
          assignments,
          years: allYears,
          semesters: allSemesters
        };
      } catch (err) {
        console.warn('getStudentStats: failed to fetch HOD assignments:', err.message);
      }
    }

    res.json({
      success: true,
      data: {
        count: result[0].count,
        scope: scopeText,
        hierarchy: {
          college: collegeName || 'All Colleges',
          course: courseName || 'All Courses',
          branch: branchName || 'All Branches'
        },
        hodProfile
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching stats: ' + error.message
    });
  }
};


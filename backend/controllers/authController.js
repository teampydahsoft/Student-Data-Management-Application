const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { masterPool } = require('../config/database');
const {
  ALL_OPERATION_KEYS,
  normalizeModules,
  parseModules
} = require('../constants/operations');
const { parsePermissions, USER_ROLES } = require('../constants/rbac');
const { getHRMSConnection } = require('../config/mongoConfig');
const { getModel: getHRMSUserModel } = require('../models/HRMSUser');
const { getModel: getHRMSEmployeeModel } = require('../models/HRMSEmployee');
const { buildRegistrationScholarshipHasStatusSql } = require('../services/studentScholarshipSync');

const registrationScholarshipCompleteSql = buildRegistrationScholarshipHasStatusSql(null, 's');

const buildAdminResponse = (admin) => ({
  id: admin.id,
  username: admin.username,
  email: admin.email,
  role: 'admin',
  modules: ALL_OPERATION_KEYS
});

const buildStaffResponse = (staffRow) => {
  const modules = normalizeModules(staffRow.assigned_modules);
  const resolvedModules = modules.length > 0 ? modules : ['dashboard'];
  return {
    id: staffRow.id,
    username: staffRow.username,
    email: staffRow.email,
    role: 'staff',
    modules: resolvedModules
  };
};

const buildRBACUserResponse = (rbacUser) => {
  const permissions = parsePermissions(rbacUser.permissions);
  return {
    id: rbacUser.id,
    name: rbacUser.name,
    username: rbacUser.username,
    email: rbacUser.email,
    phone: rbacUser.phone,
    role: rbacUser.role,
    collegeId: rbacUser.college_id,
    courseId: rbacUser.course_id,
    branchId: rbacUser.branch_id,
    permissions: permissions,
    isActive: rbacUser.is_active
  };
};

// Unified Login (Admin/Staff/Student)
exports.unifiedLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Optimization: Run checks sequentially to fail fast and avoid unnecessary expensive queries.
    // 1. Check Admin (Fastest, Smallest Table)
    const [admins] = await masterPool.query('SELECT * FROM admins WHERE username = ? LIMIT 1', [username]);

    if (admins && admins.length > 0) {
      const adminAccount = admins[0];
      if (await bcrypt.compare(password, adminAccount.password)) {
        // Check if upgraded to RBAC
        const [rbacAdmin] = await masterPool.query(
          'SELECT * FROM rbac_users WHERE username = ? AND role = ? LIMIT 1',
          [adminAccount.username, 'super_admin']
        );

        if (rbacAdmin && rbacAdmin.length > 0) {
          const rbacUser = rbacAdmin[0];
          if (!rbacUser.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });
          const rbacResponse = buildRBACUserResponse(rbacUser);
          const token = jwt.sign({
            id: rbacUser.id, username: rbacUser.username, role: rbacUser.role,
            collegeId: rbacUser.college_id, courseId: rbacUser.course_id, branchId: rbacUser.branch_id,
            collegeIds: rbacUser.college_ids, courseIds: rbacUser.course_ids, branchIds: rbacUser.branch_ids,
            permissions: rbacUser.permissions
          }, process.env.JWT_SECRET, { expiresIn: '24h' });
          return res.json({ success: true, message: 'Login successful', token, user: rbacResponse });
        }

        const token = jwt.sign({
          id: adminAccount.id, username: adminAccount.username, role: 'admin', modules: ALL_OPERATION_KEYS
        }, process.env.JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, message: 'Login successful', token, user: buildAdminResponse(adminAccount) });
      }
    }

    // --- NEW: HRMS MongoDB Check for Staff/Admin ---
    const hrmsConn = getHRMSConnection();
    let isHRMSLogin = false;
    let hrmsMatchedObj = null;
    let hrmsMatchedRole = null;
    let mappedRole = 'staff';
    let mappedName = 'HRMS User';
    let mappedEmail = username;
    let mappedPhone = null;

    if (hrmsConn) {
      try {
        const HRMSUser = getHRMSUserModel(hrmsConn);
        const HRMSEmployee = getHRMSEmployeeModel(hrmsConn);

        // 1. First, search Employee Collection (by emp_no or email)
        console.log(`[AUTH] Attempting HRMS Login for: ${username}`);
        const empDoc = await HRMSEmployee.findOne({
          $or: [
            { emp_no: username },
            { email: username }
          ]
        }).select('+password').lean().exec();

        if (empDoc) {
          console.log(`[AUTH] Employee profile found: ${empDoc.emp_no} (${empDoc.email})`);
          const isEmpPassValid = await bcrypt.compare(password, empDoc.password);
          console.log(`[AUTH] Employee password check: ${isEmpPassValid ? 'MATCH' : 'FAIL'}`);
          
          if (isEmpPassValid) {
            isHRMSLogin = true;
            hrmsMatchedObj = empDoc;
            mappedRole = USER_ROLES.FACULTY;
            mappedName = empDoc.employee_name || mappedName;
            mappedEmail = empDoc.email || empDoc.emp_no || mappedEmail;
            mappedPhone = empDoc.phone_number || null;
          }
        } else {
          console.log(`[AUTH] No Employee profile found for: ${username}`);
        }

        // 3. If still not logged in, but we have an Employee record, try the User collection using links (email, emp_no, or ref)
        if (!isHRMSLogin && empDoc) {
          const userSearchCriteria = [
            { employeeId: empDoc.emp_no },
            { employeeRef: empDoc._id }
          ];
          if (empDoc.email) {
            userSearchCriteria.push({ email: empDoc.email });
          }

          console.log(`[AUTH] Checking User collection fallback using links: emp_no=${empDoc.emp_no}, id=${empDoc._id}`);
          const userDocByEmpLink = await HRMSUser.findOne({ $or: userSearchCriteria }).select('+password').lean().exec();
          
          if (userDocByEmpLink) {
            console.log(`[AUTH] User record found by employee link. Checking password...`);
            const isUserPassValid = await bcrypt.compare(password, userDocByEmpLink.password);
            console.log(`[AUTH] User password check: ${isUserPassValid ? 'MATCH' : 'FAIL'}`);

            if (isUserPassValid) {
              isHRMSLogin = true;
              hrmsMatchedObj = userDocByEmpLink;
              hrmsMatchedRole = userDocByEmpLink.role || 'staff';
              mappedName = userDocByEmpLink.name || empDoc.employee_name || mappedName;
              mappedEmail = userDocByEmpLink.email || empDoc.email || mappedEmail;
              mappedPhone = empDoc.phone_number || null;

              if (hrmsMatchedRole === 'super_admin' || (userDocByEmpLink.roles && userDocByEmpLink.roles.includes('super_admin'))) {
                mappedRole = USER_ROLES.SUPER_ADMIN;
              } else {
                mappedRole = hrmsMatchedRole;
              }
            }
          } else {
            console.log(`[AUTH] No User record found linked to employee: ${empDoc.emp_no}`);
          }
        }

        // 4. Finally, if still not logged in, try the User collection directly with the provided username (as email)
        if (!isHRMSLogin) {
          console.log(`[AUTH] Final attempt: Direct User collection search for email: ${username}`);
          const directUserDoc = await HRMSUser.findOne({ email: username }).select('+password').lean().exec();
          if (directUserDoc) {
            console.log(`[AUTH] Direct User profile found. Checking password...`);
            const isDirectUserPassValid = await bcrypt.compare(password, directUserDoc.password);
            console.log(`[AUTH] Direct User password check: ${isDirectUserPassValid ? 'MATCH' : 'FAIL'}`);

            if (isDirectUserPassValid) {
              isHRMSLogin = true;
              hrmsMatchedObj = directUserDoc;
              hrmsMatchedRole = directUserDoc.role || 'staff';
              mappedName = directUserDoc.name || mappedName;
              mappedEmail = directUserDoc.email || mappedEmail;

              if (hrmsMatchedRole === 'super_admin' || (directUserDoc.roles && directUserDoc.roles.includes('super_admin'))) {
                mappedRole = USER_ROLES.SUPER_ADMIN;
              } else {
                mappedRole = hrmsMatchedRole;
              }
            }
          } else {
            console.log(`[AUTH] No User profile found for: ${username}`);
          }
        }
        
        console.log(`[AUTH] Final HRMS Authentication Result: ${isHRMSLogin ? 'SUCCESS' : 'FAILED'}`);

        if (isHRMSLogin) {
          // SYNC LAYER: Upsert into local rbac_users using hrms_id
          const hrmsIdStr = hrmsMatchedObj._id.toString();

          if (hrmsMatchedObj.isActive === false || hrmsMatchedObj.is_active === false) {
            return res.status(403).json({ success: false, message: 'Account deactivated centrally' });
          }

          let [existingLocal] = await masterPool.query(
            'SELECT * FROM rbac_users WHERE hrms_id = ? LIMIT 1',
            [hrmsIdStr]
          );

          if (!existingLocal || existingLocal.length === 0) {
            // Check by email fallback for HRMS-linked accounts
            [existingLocal] = await masterPool.query(
              'SELECT * FROM rbac_users WHERE email = ? AND hrms_id IS NOT NULL LIMIT 1',
              [mappedEmail]
            );
          }

          if (!existingLocal || existingLocal.length === 0) {
            return res.status(403).json({
              success: false,
              message: 'Your HRMS account is not linked to any portal user. Please contact the administrator to grant you access.'
            });
          }

          const localUserId = existingLocal[0].id;

          // Update details from HRMS just in case they changed.
          // We also update the hrms_id to the one that just successfully logged in 
          // to ensure future searches and logins match the active profile.
          const syncUpdateQuery = `
            UPDATE rbac_users
            SET
              hrms_id = ?,
              name = COALESCE(?, name),
              email = ?,
              phone = COALESCE(?, phone),
              updated_at = NOW()
            WHERE id = ?
          `;
          const syncUpdateParams = [
            hrmsIdStr,
            mappedName,
            mappedEmail,
            mappedPhone,
            localUserId
          ];
          await masterPool.query(syncUpdateQuery, syncUpdateParams);

          // Fetch the final synced structure to generate local token
          const [syncedUsers] = await masterPool.query(
            'SELECT * FROM rbac_users WHERE id = ? LIMIT 1',
            [localUserId]
          );

          const rbacUser = syncedUsers[0];
          const rbacResponse = buildRBACUserResponse(rbacUser);
          const token = jwt.sign({
            id: rbacUser.id, username: rbacUser.username, role: rbacUser.role,
            collegeId: rbacUser.college_id, courseId: rbacUser.course_id, branchId: rbacUser.branch_id,
            collegeIds: rbacUser.college_ids, courseIds: rbacUser.course_ids, branchIds: rbacUser.branch_ids,
            permissions: rbacUser.permissions
          }, process.env.JWT_SECRET, { expiresIn: '24h' });

          return res.json({ success: true, message: 'Login successful', token, user: rbacResponse });
        }
      } catch (hrmsErr) {
        console.error('HRMS Login Error:', hrmsErr);
        // Fallback below if HRMS connection/query fails
      }
    }


    // 2. Check traditional local RBAC User (Fast, Indexed)
    const [rbacRows] = await masterPool.query(
      `SELECT id, name, username, email, phone, password, role, college_id, course_id, branch_id, college_ids, course_ids, branch_ids, permissions, is_active
       FROM rbac_users WHERE username = ? OR email = ? LIMIT 1`,
      [username, username]
    );

    if (rbacRows && rbacRows.length > 0) {
      const rbacUser = rbacRows[0];
      if (rbacUser.password && await bcrypt.compare(password, rbacUser.password)) {
        if (!rbacUser.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

        const rbacResponse = buildRBACUserResponse(rbacUser);
        const token = jwt.sign({
          id: rbacUser.id, username: rbacUser.username, role: rbacUser.role,
          collegeId: rbacUser.college_id, courseId: rbacUser.course_id, branchId: rbacUser.branch_id,
          collegeIds: rbacUser.college_ids, courseIds: rbacUser.course_ids, branchIds: rbacUser.branch_ids,
          permissions: rbacUser.permissions
        }, process.env.JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, message: 'Login successful', token, user: rbacResponse });
      }
    }

    // 3. Check Staff User (Legacy, Fast, Indexed)
    const [staffRows] = await masterPool.query(
      'SELECT id, username, email, password_hash, assigned_modules, is_active FROM staff_users WHERE username = ? LIMIT 1',
      [username]
    );

    if (staffRows && staffRows.length > 0) {
      const staffUser = staffRows[0];
      if (await bcrypt.compare(password, staffUser.password_hash)) {
        if (!staffUser.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

        const staffResponse = buildStaffResponse(staffUser);
        const token = jwt.sign({
          id: staffUser.id, username: staffUser.username, role: 'staff', modules: staffResponse.modules
        }, process.env.JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, message: 'Login successful', token, user: staffResponse });
      }
    }

    // 4. Check Student User (Optimized)
    const { authenticateStudentCredential } = require('../utils/studentCredentials');
    const studentCred = await authenticateStudentCredential(username, password);

    if (studentCred) {
        // Validation Passed! NOW fetch the heavy student profile details.
        const [studentDetails] = await masterPool.query(
          `SELECT s.student_name, s.student_mobile, s.pin_no, s.batch, s.current_year, s.current_semester, s.student_photo, 
            s.course, s.branch, s.college,
            cb.id as branch_id, col.id as college_id, c.level as course_level,
            CASE
              WHEN
                (s.student_data LIKE '%"is_student_mobile_verified":true%' AND s.student_data LIKE '%"is_parent_mobile_verified":true%') AND
                (s.certificates_status LIKE '%Verified%' OR s.certificates_status = 'completed') AND
                (s.fee_status LIKE '%no_due%' OR s.fee_status LIKE '%no due%' OR s.fee_status LIKE '%permitted%' OR s.fee_status LIKE '%completed%' OR s.fee_status LIKE '%nodue%')
              THEN 'Completed'
              ELSE s.registration_status
            END AS registration_status_computed,
            s.registration_status, s.student_data
           FROM students s
           LEFT JOIN colleges col ON s.college COLLATE utf8mb4_unicode_ci = col.name COLLATE utf8mb4_unicode_ci
           LEFT JOIN courses c ON s.course COLLATE utf8mb4_unicode_ci = c.name COLLATE utf8mb4_unicode_ci AND c.college_id = col.id
           LEFT JOIN course_branches cb ON s.branch COLLATE utf8mb4_unicode_ci = cb.name COLLATE utf8mb4_unicode_ci AND cb.course_id = c.id
           WHERE s.id = ? LIMIT 1`,
          [studentCred.student_id]
        );

        if (studentDetails && studentDetails.length > 0) {
          const s = studentDetails[0];
          const token = jwt.sign({
            id: studentCred.student_id,
            admissionNumber: studentCred.admission_number,
            pinNo: s.pin_no || studentCred.username,
            role: 'student',
            college_id: s.college_id,
            branch_id: s.branch_id
          }, process.env.JWT_SECRET, { expiresIn: '24h' });

          // Helper to resolve status
          let parsedData = {};
          try {
            parsedData = (s.student_data && typeof s.student_data === 'string')
              ? JSON.parse(s.student_data)
              : (s.student_data || {});
          } catch (e) { }

          const resolvedStatus = s.registration_status_computed ||
            ((s.registration_status && String(s.registration_status).trim().length > 0)
              ? s.registration_status
              : (parsedData?.registration_status || parsedData?.['Registration Status'] || 'Pending'));

          const user = {
            admission_number: studentCred.admission_number,
            pin_no: s.pin_no,
            batch: s.batch,
            username: studentCred.username,
            name: s.student_name,
            current_year: s.current_year,
            current_semester: s.current_semester,
            course: s.course,
            course_level: s.course_level,
            branch: s.branch,
            college: s.college,
            branch_id: s.branch_id,
            college_id: s.college_id,
            student_photo: s.student_photo,
            registration_status: resolvedStatus,
            role: 'student'
          };

          // Update last_login and login_count (Fire and forget, don't block login)
          masterPool.query(
            `UPDATE student_credentials 
             SET last_login = NOW(), 
                 login_count = COALESCE(login_count, 0) + 1 
             WHERE student_id = ?`,
            [studentCred.student_id]
          ).catch(err => {
            // Silently fail if columns don't exist yet (migration pending)
            // console.warn('Failed to update login stats (columns might be missing):', err.message);
          });

          return res.json({ success: true, message: 'Login successful', token, user });
        }
    }

    // --- 5. Failed All ---
    return res.status(401).json({ success: false, message: 'Invalid credentials' });

  } catch (error) {
    console.error('Unified login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// Legacy Login (Admin Only - kept for backward compatibility if needed, else replace)
exports.login = exports.unifiedLogin;

// CRM Backend URL for SSO token verification (Portal receives SSO from CRM)
const CRM_BACKEND_URL = process.env.CRM_BACKEND_URL || 'http://localhost:8000';

/**
 * Create SSO session from CRM token (Portal SSO flow).
 * CRM redirects user to this app with ?token=<encryptedToken>.
 * Frontend calls CRM /auth/verify-token, then this endpoint with { userId, role, portalId, ssoToken }.
 * We optionally re-verify with CRM, look up user (rbac_users or students), issue local JWT.
 * Token and user shape match unified-login for RBAC and Student so verifyToken and frontend work identically.
 * @route POST /api/auth/sso-session
 * @access Public
 */
exports.createSSOSession = async (req, res) => {
  try {
    const { userId, role, portalId, ssoToken } = req.body;

    if (!userId || !ssoToken) {
      return res.status(400).json({
        success: false,
        message: 'User ID and SSO token are required'
      });
    }

    // 1) Optional: verify token with CRM backend
    try {
      const verifyRes = await fetch(`${CRM_BACKEND_URL}/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedToken: ssoToken })
      });
      const text = await verifyRes.text();
      if (!text || !text.trim()) {
        throw new Error(`CRM verify-token returned empty response (status ${verifyRes.status})`);
      }
      let verifyResult;
      try {
        verifyResult = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`CRM verify-token returned invalid JSON (status ${verifyRes.status})`);
      }

      if (!verifyResult.success || !verifyResult.valid) {
        return res.status(401).json({
          success: false,
          message: verifyResult.message || 'Invalid SSO token'
        });
      }

      const data = verifyResult.data || {};
      if (String(data.userId) !== String(userId)) {
        return res.status(401).json({
          success: false,
          message: 'Token user ID mismatch'
        });
      }
    } catch (verifyErr) {
      console.error('SSO token verification with CRM failed:', verifyErr.message);
      if (process.env.NODE_ENV === 'production') {
        return res.status(502).json({
          success: false,
          message: 'SSO verification failed'
        });
      }
      // In dev, continue if CRM is down
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // 2a) Student SSO: userId = students.id
    if (role === 'student') {
      const [credentials] = await masterPool.query(
        `SELECT id, student_id, admission_number, username
         FROM student_credentials
         WHERE student_id = ?
         LIMIT 1`,
        [userId]
      );

      if (!credentials || credentials.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found in portal database'
        });
      }

      const studentCred = credentials[0];
      const [studentDetails] = await masterPool.query(
        `SELECT s.student_name, s.student_mobile, s.current_year, s.current_semester, s.student_photo, 
          s.course, s.branch, s.college,
          cb.id as branch_id, col.id as college_id, c.level as course_level,
          CASE
            WHEN
              (s.student_data LIKE '%"is_student_mobile_verified":true%' AND s.student_data LIKE '%"is_parent_mobile_verified":true%') AND
              (s.certificates_status LIKE '%Verified%' OR s.certificates_status = 'completed') AND
              (s.fee_status LIKE '%no_due%' OR s.fee_status LIKE '%no due%' OR s.fee_status LIKE '%permitted%' OR s.fee_status LIKE '%completed%' OR s.fee_status LIKE '%nodue%') AND
              (s.current_year IS NOT NULL AND s.current_year != '' AND s.current_semester IS NOT NULL AND s.current_semester != '') AND
              (${registrationScholarshipCompleteSql})
            THEN 'Completed'
            ELSE 'pending'
          END AS registration_status_computed,
          s.registration_status, s.student_data
         FROM students s
         LEFT JOIN colleges col ON s.college COLLATE utf8mb4_unicode_ci = col.name COLLATE utf8mb4_unicode_ci
         LEFT JOIN courses c ON s.course COLLATE utf8mb4_unicode_ci = c.name COLLATE utf8mb4_unicode_ci AND c.college_id = col.id
         LEFT JOIN course_branches cb ON s.branch COLLATE utf8mb4_unicode_ci = cb.name COLLATE utf8mb4_unicode_ci AND cb.course_id = c.id
         WHERE s.id = ? LIMIT 1`,
        [studentCred.student_id]
      );

      if (!studentDetails || studentDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found in portal database'
        });
      }

      const s = studentDetails[0];
      let parsedData = {};
      try {
        parsedData = (s.student_data && typeof s.student_data === 'string')
          ? JSON.parse(s.student_data)
          : (s.student_data || {});
      } catch (e) { }

      const resolvedStatus = s.registration_status_computed ||
        ((s.registration_status && String(s.registration_status).trim().length > 0)
          ? s.registration_status
          : (parsedData?.registration_status || parsedData?.['Registration Status'] || 'Pending'));

      const user = {
        admission_number: studentCred.admission_number,
        username: studentCred.username,
        name: s.student_name,
        current_year: s.current_year,
        current_semester: s.current_semester,
        course: s.course,
        course_level: s.course_level,
        branch: s.branch,
        college: s.college,
        branch_id: s.branch_id,
        college_id: s.college_id,
        student_photo: s.student_photo,
        registration_status: resolvedStatus,
        role: 'student'
      };

      const token = jwt.sign(
        {
          id: studentCred.student_id,
          admissionNumber: studentCred.admission_number,
          role: 'student',
          college_id: s.college_id,
          branch_id: s.branch_id
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      masterPool.query(
        `UPDATE student_credentials SET last_login = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE student_id = ?`,
        [studentCred.student_id]
      ).catch(() => { });

      return res.json({
        success: true,
        message: 'SSO session created successfully',
        token,
        user
      });
    }

    // 2b) RBAC SSO: userId = rbac_users.id
    const [rows] = await masterPool.query(
      `SELECT id, name, username, email, phone, role, college_id, course_id, branch_id,
              college_ids, course_ids, branch_ids, permissions, is_active
       FROM rbac_users
       WHERE id = ? AND is_active = 1
       LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found in portal database'
      });
    }

    const rbacUser = rows[0];
    const user = buildRBACUserResponse(rbacUser);

    const token = jwt.sign(
      {
        id: rbacUser.id,
        username: rbacUser.username,
        role: rbacUser.role,
        collegeId: rbacUser.college_id,
        courseId: rbacUser.course_id,
        branchId: rbacUser.branch_id,
        collegeIds: rbacUser.college_ids,
        courseIds: rbacUser.course_ids,
        branchIds: rbacUser.branch_ids,
        permissions: rbacUser.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      message: 'SSO session created successfully',
      token,
      user
    });
  } catch (err) {
    console.error('SSO session error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to create SSO session'
    });
  }
};

// Verify token
exports.verifyToken = async (req, res) => {
  try {
    const authUser = req.user || req.admin;

    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session'
      });
    }

    // Check if RBAC user
    if (Object.values(USER_ROLES).includes(authUser.role)) {
      const [rows] = await masterPool.query(
        `
          SELECT id, name, username, email, phone, role, college_id, course_id, branch_id, permissions, is_active
          FROM rbac_users
          WHERE id = ?
          LIMIT 1
        `,
        [authUser.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const rbacRecord = rows[0];
      if (!rbacRecord.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive'
        });
      }

      return res.json({
        success: true,
        user: buildRBACUserResponse(rbacRecord)
      });
    }

    if (authUser.role === 'staff') {
      const [rows] = await masterPool.query(
        `
          SELECT id, username, email, assigned_modules, is_active
          FROM staff_users
          WHERE id = ?
          LIMIT 1
        `,
        [authUser.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const staffRecord = rows[0];
      if (!staffRecord.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive'
        });
      }

      return res.json({
        success: true,
        user: buildStaffResponse(staffRecord)
      });
    }

    if (authUser.role === 'student') {
      const [students] = await masterPool.query(
        `SELECT sc.username, s.admission_number, s.student_name, s.student_mobile, s.current_year, s.current_semester, s.student_photo, 
          s.course, s.branch, s.college,
          cb.id as branch_id, col.id as college_id, c.level as course_level,
          CASE
            WHEN
              (s.student_data LIKE '%"is_student_mobile_verified":true%' AND s.student_data LIKE '%"is_parent_mobile_verified":true%') AND
              (s.certificates_status LIKE '%Verified%' OR s.certificates_status = 'completed') AND
              (s.fee_status LIKE '%no_due%' OR s.fee_status LIKE '%no due%' OR s.fee_status LIKE '%permitted%' OR s.fee_status LIKE '%completed%' OR s.fee_status LIKE '%nodue%') AND
              (s.current_year IS NOT NULL AND s.current_year != '' AND s.current_semester IS NOT NULL AND s.current_semester != '') AND
              (${registrationScholarshipCompleteSql})
            THEN 'Completed'
            ELSE 'pending'
          END AS registration_status_computed,
          s.registration_status, s.student_data
         FROM students s
         LEFT JOIN student_credentials sc ON sc.student_id = s.id
         LEFT JOIN colleges col ON s.college COLLATE utf8mb4_unicode_ci = col.name COLLATE utf8mb4_unicode_ci
         LEFT JOIN courses c ON s.course COLLATE utf8mb4_unicode_ci = c.name COLLATE utf8mb4_unicode_ci AND c.college_id = col.id
         LEFT JOIN course_branches cb ON s.branch COLLATE utf8mb4_unicode_ci = cb.name COLLATE utf8mb4_unicode_ci AND cb.course_id = c.id
         WHERE s.id = ?`,
        [authUser.id]
      );

      if (!students || students.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const studentValid = students[0];

      // Helper to resolve status
      let parsedData = {};
      try {
        parsedData = (studentValid.student_data && typeof studentValid.student_data === 'string')
          ? JSON.parse(studentValid.student_data)
          : (studentValid.student_data || {});
      } catch (e) { }

      const resolvedStatus = studentValid.registration_status_computed ||
        ((studentValid.registration_status && String(studentValid.registration_status).trim().length > 0)
          ? studentValid.registration_status
          : (parsedData?.registration_status || parsedData?.['Registration Status'] || 'Pending'));

      const user = {
        admission_number: studentValid.admission_number,
        username: studentValid.username,
        name: studentValid.student_name,
        current_year: studentValid.current_year,
        current_semester: studentValid.current_semester,
        course: studentValid.course,
        course_level: studentValid.course_level,
        branch: studentValid.branch,
        college: studentValid.college,
        branch_id: studentValid.branch_id,
        college_id: studentValid.college_id,
        student_photo: studentValid.student_photo,
        registration_status: resolvedStatus,
        role: 'student'
      };

      return res.json({
        success: true,
        user
      });
    }

    if (authUser.role === 'parent') {
      const studentId = authUser.studentId || authUser.id;
      const [students] = await masterPool.query(
        `SELECT id, admission_number, student_name, student_photo, college, course, branch,
                current_year, current_semester
         FROM students WHERE id = ? LIMIT 1`,
        [studentId]
      );

      if (!students || students.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const s = students[0];
      return res.json({
        success: true,
        user: {
          id: s.id,
          studentId: s.id,
          role: 'parent',
          admission_number: s.admission_number,
          student_name: s.student_name,
          name: s.student_name,
          parent_mobile: authUser.parent_mobile,
          student_photo: s.student_photo,
          college: s.college,
          course: s.course,
          branch: s.branch,
          current_year: s.current_year,
          current_semester: s.current_semester
        }
      });
    }

    const [admins] = await masterPool.query(
      'SELECT id, username, email FROM admins WHERE id = ? LIMIT 1',
      [authUser.id]
    );
    if (!admins || admins.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      user: buildAdminResponse(admins[0])
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      message: 'Server error during verification'
    });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const authUser = req.user;
    if (!authUser || !Object.values(USER_ROLES).includes(authUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { name, email, phone, username } = req.body;

    // Validate existence of required fields
    if (!name || !email || !phone || !username) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, Phone and Username are required'
      });
    }

    // Check if it's an HRMS synced user
    const [userRows] = await masterPool.query(
      'SELECT hrms_id FROM rbac_users WHERE id = ?',
      [authUser.id]
    );

    if (userRows && userRows.length > 0 && userRows[0].hrms_id) {
      return res.status(400).json({
        success: false,
        message: 'Your profile is managed centrally via the HRMS Application. Please update your details there.'
      });
    }

    // Check for unique username/email/phone exclusions
    // Check if any OTHER user has these details
    const [existing] = await masterPool.query(
      `SELECT id FROM rbac_users 
       WHERE (username = ? OR email = ? OR phone = ?) 
       AND id != ?`,
      [username, email, phone, authUser.id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username, Email or Phone already in use by another user'
      });
    }

    // Update user
    await masterPool.query(
      `UPDATE rbac_users 
       SET name = ?, email = ?, phone = ?, username = ?, updated_at = NOW() 
       WHERE id = ?`,
      [name, email, phone, username, authUser.id]
    );

    // Fetch updated user to return (excluding password)
    const [updatedUsers] = await masterPool.query(
      `SELECT 
        u.id, u.name, u.username, u.email, u.phone, u.role, u.password,
        c.name as collegeName,
        co.name as courseName,
        b.name as branchName,
        u.permissions
       FROM rbac_users u
       LEFT JOIN colleges c ON u.college_id = c.id
       LEFT JOIN courses co ON u.course_id = co.id
       LEFT JOIN course_branches b ON u.branch_id = b.id
       WHERE u.id = ?`,
      [authUser.id]
    );

    const updatedUser = updatedUsers[0];
    if (updatedUser) {
      delete updatedUser.password;
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error details:', {
      message: error.message,
      sql: error.sql,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Server error updating profile: ' + error.message
    });
  }
};

// Change password
// Change password
exports.changePassword = async (req, res) => {
  try {
    const authUser = req.user || req.admin;

    // Allow Admin, Staff, and RBAC users to change password
    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password are required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    // 1. Check if Admin (Legacy)
    if (authUser.role === 'admin') {
      const [admins] = await masterPool.query(
        'SELECT * FROM admins WHERE id = ? LIMIT 1',
        [authUser.id]
      );
      if (!admins || admins.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const admin = admins[0];
      const isValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isValid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await masterPool.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, authUser.id]);

      return res.json({ success: true, message: 'Password changed successfully' });
    }

    // 2. Check if RBAC User
    if (Object.values(USER_ROLES).includes(authUser.role)) {
      const [users] = await masterPool.query(
        'SELECT * FROM rbac_users WHERE id = ? LIMIT 1',
        [authUser.id]
      );
      if (!users || users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const user = users[0];

      // Prevent password change if HRMS user
      if (user.hrms_id) {
        return res.status(403).json({ success: false, message: 'Your password is managed centrally via the HRMS Application. Please change it there.' });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await masterPool.query('UPDATE rbac_users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, authUser.id]);

      return res.json({ success: true, message: 'Password changed successfully' });
    }

    // 3. Check if Staff (Legacy)
    if (authUser.role === 'staff') {
      const [staff] = await masterPool.query(
        'SELECT * FROM staff_users WHERE id = ? LIMIT 1',
        [authUser.id]
      );
      if (!staff || staff.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const user = staff[0];
      const isValid = await bcrypt.compare(currentPassword, user.password_hash); // Note: staff uses password_hash column
      if (!isValid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await masterPool.query('UPDATE staff_users SET password_hash = ? WHERE id = ?', [hashedPassword, authUser.id]);

      return res.json({ success: true, message: 'Password changed successfully' });
    }

    return res.status(403).json({
      success: false,
      message: 'Password change not supported for this user type via this endpoint'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change'
    });
  }
};

// Get Student Login Statistics
exports.getStudentLoginStats = async (req, res) => {
  try {
    // Check if columns exist first (to avoid SQL error if migration not run)
    try {
      const [stats] = await masterPool.query(`
        SELECT 
          COUNT(*) as total_students_who_logged_in,
          SUM(login_count) as total_login_events
        FROM student_credentials
        WHERE last_login IS NOT NULL
      `);

      res.json({
        success: true,
        data: {
          uniqueDetail: stats[0].total_students_who_logged_in || 0,
          totalLogins: stats[0].total_login_events || 0
        }
      });
    } catch (sqlError) {
      if (sqlError.code === 'ER_BAD_FIELD_ERROR') {
        // Table hasn't been migrated yet
        return res.json({
          success: true,
          data: {
            uniqueDetail: 0,
            totalLogins: 0,
            note: 'Tracking columns not yet initialized'
          }
        });
      }
      throw sqlError;
    }

  } catch (error) {
    console.error('Get login stats error:', error);
    res.status(500).json({ success: false, message: 'Server error getting stats' });
  }
};

/**
 * Issue a short-lived HS256 JWT for CRT workspace SSO.
 * CRT contract: POST https://crt.pydahsoft.in/sso-login?token=<jwt>
 * Payload: { sub: <admission_number|pin_no>, exp: now+300 }
 * Signed with SDMS_SSO_SECRET (shared secret agreed with CRT team).
 */
exports.getCrtSsoUrl = async (req, res) => {
  try {
    const authUser = req.user || req.admin;
    if (!authUser || authUser.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'CRT SSO is only available for students'
      });
    }

    const [rows] = await masterPool.query(
      `SELECT s.pin_no, s.admission_number, s.student_name, sc.username
       FROM students s
       LEFT JOIN student_credentials sc ON sc.student_id = s.id
       WHERE s.id = ?
       LIMIT 1`,
      [authUser.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = rows[0];
    // Prefer admission_number as the student identifier (matches CRT login);
    // fall back to pin_no, then username.
    const sub =
      (student.admission_number ? String(student.admission_number).trim() : '') ||
      (student.pin_no ? String(student.pin_no).trim() : '') ||
      (student.username ? String(student.username).trim() : '');

    if (!sub) {
      return res.status(400).json({
        success: false,
        message: 'Student has no admission number, PIN, or username for CRT SSO'
      });
    }

    // Use the dedicated CRT shared secret; fall back to JWT_SECRET if not set.
    const secret = process.env.SDMS_SSO_SECRET || process.env.JWT_SECRET;

    // CRT spec: exp = current unix timestamp + 300 (5 minutes).
    const expiresInSeconds = 5 * 60; // 300 s
    const payload = { sub };

    const token = jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds
    });

    const crtBaseUrl = (process.env.CRT_APP_URL || 'https://crt.pydahsoft.in').replace(/\/$/, '');
    // CRT redirect path per their spec: /sso-login?token=<jwt>
    const url = `${crtBaseUrl}/sso-login?token=${encodeURIComponent(token)}`;

    return res.json({ success: true, url });
  } catch (err) {
    console.error('CRT SSO error:', err);
    res.status(500).json({ success: false, message: 'Failed to create CRT SSO link' });
  }
};

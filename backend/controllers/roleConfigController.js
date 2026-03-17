const { masterPool } = require('../config/database');
const {
  USER_ROLES,
  createDefaultPermissions,
  parsePermissions,
  ROLE_LABELS,
  ALL_MODULES,
  MODULE_PERMISSIONS
} = require('../constants/rbac');

const CONFIGURABLE_ROLES = [
  USER_ROLES.COLLEGE_PRINCIPAL,
  USER_ROLES.COLLEGE_AO,
  USER_ROLES.COLLEGE_ATTENDER,
  USER_ROLES.BRANCH_HOD,
  USER_ROLES.OFFICE_ASSISTANT,
  USER_ROLES.CASHIER
];

const ROLE_DESCRIPTIONS = {
  [USER_ROLES.COLLEGE_PRINCIPAL]: 'Manages overall college operations and has oversight of all programs and branches',
  [USER_ROLES.COLLEGE_AO]: 'Administrative officer responsible for college-level operations and record management',
  [USER_ROLES.COLLEGE_ATTENDER]: 'Basic access for attendance tracking and daily record management',
  [USER_ROLES.BRANCH_HOD]: 'Head of Department with control over specific branches and their operations',
  [USER_ROLES.OFFICE_ASSISTANT]: 'Assists with office operations, document management, and administrative tasks',
  [USER_ROLES.CASHIER]: 'Handles fee collection, payment processing, and financial transactions'
};

// Ticket app roles (linked app) – shown in User Management and Role Configuration
const TICKET_APP_ROLES = [
  'course_principal',
  'course_hod',
  'branch_clerk',
  'branch_counselor',
  'branch_faculty',
  'support_staff'
];

const TICKET_APP_ROLE_LABELS = {
  course_principal: 'Course Principal',
  course_hod: 'Course HOD',
  branch_clerk: 'Branch Clerk',
  branch_counselor: 'Branch Counselor',
  branch_faculty: 'Branch Faculty',
  support_staff: 'Support Staff'
};

const TICKET_APP_ROLE_DESCRIPTIONS = {
  course_principal: 'Course-level principal for ticket and academic operations',
  course_hod: 'Head of Department at course level',
  branch_clerk: 'Branch-level clerk for ticket and administrative tasks',
  branch_counselor: 'Branch counselor role',
  branch_faculty: 'Branch faculty role',
  support_staff: 'Ticket support staff for handling complaints and tickets'
};

const CREATE_ROLE_CONFIG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS rbac_role_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_key VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  permissions JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** Ensure rbac_role_config table exists (creates it if missing, e.g. if migration did not run) */
const ensureRoleConfigTable = async () => {
  try {
    await masterPool.query(CREATE_ROLE_CONFIG_TABLE_SQL);
  } catch (e) {
    console.error('ensureRoleConfigTable error:', e.message);
    throw e;
  }
};

/**
 * Get permissions for a role from rbac_role_config, or default (all false)
 * Used by createUser and getRoleConfig
 */
const getPermissionsForRole = async (roleKey) => {
  if (!roleKey || roleKey === USER_ROLES.SUPER_ADMIN) {
    return null;
  }
  try {
    const [rows] = await masterPool.query(
      'SELECT permissions FROM rbac_role_config WHERE role_key = ?',
      [roleKey]
    );
    if (rows && rows.length > 0 && rows[0].permissions) {
      const raw = rows[0].permissions;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsePermissions(parsed);
    }
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') console.error('getPermissionsForRole error:', e);
  }
  return createDefaultPermissions();
};

/** Check if a role exists (main app built-in or custom in DB only; ticket app roles not included) */
const roleExistsInConfig = async (roleKey) => {
  if (!roleKey) return false;
  if (CONFIGURABLE_ROLES.includes(roleKey)) return true;
  try {
    const [r] = await masterPool.query('SELECT 1 FROM rbac_role_config WHERE role_key = ?', [roleKey]);
    return r && r.length > 0;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
};

module.exports.getPermissionsForRole = getPermissionsForRole;
module.exports.roleExistsInConfig = roleExistsInConfig;
module.exports.CONFIGURABLE_ROLES = CONFIGURABLE_ROLES;
module.exports.TICKET_APP_ROLES = TICKET_APP_ROLES;
module.exports.TICKET_APP_ROLE_LABELS = TICKET_APP_ROLE_LABELS;

/**
 * GET /api/rbac/role-config
 * List all role configs (built-in + custom from DB)
 */
exports.getRoleConfigs = async (req, res) => {
  try {
    await ensureRoleConfigTable();
    let rows = [];
    try {
      const [r] = await masterPool.query(
        'SELECT role_key, label, description, permissions, updated_at FROM rbac_role_config'
      );
      rows = r || [];
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') rows = [];
      else throw e;
    }
    const byRole = {};
    (rows || []).forEach(r => {
      let perms = createDefaultPermissions();
      if (r.permissions) {
        try {
          const raw = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
          perms = parsePermissions(raw);
        } catch (_) {}
        byRole[r.role_key] = { permissions: perms, label: r.label, description: r.description || '', updated_at: r.updated_at };
      }
    });

    const configs = [];
    CONFIGURABLE_ROLES.forEach(roleKey => {
      const stored = byRole[roleKey];
      let permissions = createDefaultPermissions();
      if (stored && stored.permissions) {
        Object.keys(stored.permissions).forEach(module => {
          if (permissions[module]) Object.assign(permissions[module], stored.permissions[module]);
        });
      }
      configs.push({
        role_key: roleKey,
        label: (stored && stored.label) || ROLE_LABELS[roleKey] || roleKey,
        description: (stored && stored.description) || ROLE_DESCRIPTIONS[roleKey] || '',
        permissions,
        updated_at: stored?.updated_at || null,
        is_custom: false
      });
    });

    rows.forEach(r => {
      if (!CONFIGURABLE_ROLES.includes(r.role_key) && !TICKET_APP_ROLES.includes(r.role_key)) {
        let permissions = createDefaultPermissions();
        if (byRole[r.role_key] && byRole[r.role_key].permissions) {
          Object.keys(byRole[r.role_key].permissions).forEach(module => {
            if (permissions[module]) Object.assign(permissions[module], byRole[r.role_key].permissions[module]);
          });
        }
        configs.push({
          role_key: r.role_key,
          label: r.label || r.role_key,
          description: r.description || '',
          permissions,
          updated_at: r.updated_at || null,
          is_custom: true
        });
      }
    });

    res.json({ success: true, data: configs });
  } catch (error) {
    console.error('getRoleConfigs error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load role configs' });
  }
};

/**
 * GET /api/rbac/role-config/:roleKey
 * Get single role config (for create user form when role is selected)
 */
exports.getRoleConfigByRole = async (req, res) => {
  try {
    await ensureRoleConfigTable();
    const { roleKey } = req.params;
    const exists = await roleExistsInConfig(roleKey);
    if (!exists) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const permissions = await getPermissionsForRole(roleKey);
    let label = ROLE_LABELS[roleKey] || TICKET_APP_ROLE_LABELS[roleKey] || roleKey;
    let description = ROLE_DESCRIPTIONS[roleKey] || TICKET_APP_ROLE_DESCRIPTIONS[roleKey] || '';
    try {
      const [r] = await masterPool.query('SELECT label, description FROM rbac_role_config WHERE role_key = ?', [roleKey]);
      if (r && r.length > 0) {
        if (r[0].label) label = r[0].label;
        if (r[0].description != null) description = r[0].description || '';
      }
    } catch (_) {}
    res.json({
      success: true,
      data: {
        role_key: roleKey,
        label,
        description,
        permissions
      }
    });
  } catch (error) {
    console.error('getRoleConfigByRole error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load role config' });
  }
};

/**
 * PUT /api/rbac/role-config/:roleKey
 * Update role config (label, description, module access). Optionally propagate to existing users.
 * Body: { label?, description?, permissions?: {...}, propagateToExistingUsers?: boolean }
 */
exports.updateRoleConfig = async (req, res) => {
  try {
    await ensureRoleConfigTable();
    const { roleKey } = req.params;
    const { label: bodyLabel, description: bodyDescription, permissions: rawPermissions, propagateToExistingUsers = true } = req.body || {};

    const exists = await roleExistsInConfig(roleKey);
    if (!exists) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const permissions = parsePermissions(rawPermissions || createDefaultPermissions());
    const label = (bodyLabel && String(bodyLabel).trim()) || ROLE_LABELS[roleKey] || roleKey;
    const description = bodyDescription != null ? String(bodyDescription).trim() : (ROLE_DESCRIPTIONS[roleKey] || '');

    await masterPool.query(
      `INSERT INTO rbac_role_config (role_key, label, description, permissions)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         description = VALUES(description),
         permissions = VALUES(permissions),
         updated_at = CURRENT_TIMESTAMP`,
      [roleKey, label, description, JSON.stringify(permissions)]
    );

    let updatedUserCount = 0;
    if (propagateToExistingUsers) {
      const [result] = await masterPool.query(
        'UPDATE rbac_users SET permissions = ? WHERE role = ?',
        [JSON.stringify(permissions), roleKey]
      );
      updatedUserCount = result?.affectedRows ?? 0;
    }

    const permissionsOut = await getPermissionsForRole(roleKey);
    res.json({
      success: true,
      message: 'Role config updated' + (updatedUserCount > 0 ? `. Permissions applied to ${updatedUserCount} existing user(s).` : ''),
      data: {
        role_key: roleKey,
        label,
        description,
        permissions: permissionsOut,
        updated_user_count: updatedUserCount
      }
    });
  } catch (error) {
    console.error('updateRoleConfig error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update role config' });
  }
};

/**
 * POST /api/rbac/role-config
 * Create a new custom role. Body: { role_key, label, description?, permissions? }
 */
exports.createRoleConfig = async (req, res) => {
  try {
    await ensureRoleConfigTable();
    const { role_key: roleKey, label, description, permissions: rawPermissions } = req.body || {};
    const key = (roleKey && String(roleKey).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')) || null;
    if (!key || key.length < 2) {
      return res.status(400).json({ success: false, message: 'role_key is required (e.g. custom_manager)' });
    }
    if (CONFIGURABLE_ROLES.includes(key)) {
      return res.status(400).json({ success: false, message: 'This role_key is reserved for a built-in role' });
    }

    const labelStr = (label && String(label).trim()) || key;
    const descStr = (description != null && description !== '') ? String(description).trim() : '';
    const permissions = parsePermissions(rawPermissions || createDefaultPermissions());

    await masterPool.query(
      `INSERT INTO rbac_role_config (role_key, label, description, permissions)
       VALUES (?, ?, ?, ?)`,
      [key, labelStr, descStr, JSON.stringify(permissions)]
    );

    res.status(201).json({
      success: true,
      message: 'Role created',
      data: {
        role_key: key,
        label: labelStr,
        description: descStr,
        permissions: await getPermissionsForRole(key)
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A role with this role_key already exists' });
    }
    console.error('createRoleConfig error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create role' });
  }
};

/**
 * DELETE /api/rbac/role-config/:roleKey
 * Delete a custom role. Built-in roles cannot be deleted. Fails if any users have this role.
 */
exports.deleteRoleConfig = async (req, res) => {
  try {
    await ensureRoleConfigTable();
    const { roleKey } = req.params;

    if (CONFIGURABLE_ROLES.includes(roleKey)) {
      return res.status(400).json({
        success: false,
        message: 'Built-in roles cannot be deleted. You can only edit their name and permissions.'
      });
    }
    if (TICKET_APP_ROLES.includes(roleKey)) {
      return res.status(400).json({
        success: false,
        message: 'Ticket app roles cannot be deleted. You can only edit their name and permissions.'
      });
    }

    const [rows] = await masterPool.query('SELECT 1 FROM rbac_role_config WHERE role_key = ?', [roleKey]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    const [userRows] = await masterPool.query('SELECT COUNT(*) as cnt FROM rbac_users WHERE role = ?', [roleKey]);
    const userCount = (userRows && userRows[0] && userRows[0].cnt) || 0;
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${userCount} user(s) have this role. Reassign them to another role first.`
      });
    }

    await masterPool.query('DELETE FROM rbac_role_config WHERE role_key = ?', [roleKey]);
    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('deleteRoleConfig error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete role' });
  }
};

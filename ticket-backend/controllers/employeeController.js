const { masterPool } = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Get all ticket employees with their RBAC user details
 */
exports.getEmployees = async (req, res) => {
    try {
        const [rows] = await masterPool.query(`
            SELECT 
                te.id,
                te.rbac_user_id,
                COALESCE(te.role_name, te.role) as role,
                te.role as legacy_role, 
                te.custom_role_id,
                te.role_name,
                te.permissions as user_permissions,
                te.is_active,
                te.assigned_date,
                te.assigned_categories,
                te.assigned_subcategories,
                te.created_at,
                te.updated_at,
                COALESCE(te.name, ru.name) as name,
                COALESCE(te.email, ru.email) as email,
                COALESCE(te.phone, ru.phone) as phone,
                COALESCE(te.username, ru.username) as username,
                COALESCE(tr.display_name, te.role) as role_display_name,
                tr.permissions as role_permissions,
                (
                    SELECT COUNT(DISTINCT ta.ticket_id)
                    FROM ticket_assignments ta
                    JOIN tickets t ON ta.ticket_id = t.id
                    WHERE (ta.assigned_to = ru.id OR ta.assigned_to = te.id) 
                    AND ta.is_active = TRUE
                    AND t.status NOT IN ('closed', 'completed')
                ) as active_tickets_count
            FROM ticket_employees te
            LEFT JOIN rbac_users ru ON te.rbac_user_id = ru.id
            LEFT JOIN ticket_roles tr ON te.custom_role_id = tr.id
            WHERE te.is_active = 1
            ORDER BY te.created_at DESC
        `);

        // Parse JSON fields safely
        const parsedRows = rows.map(row => {
            let categories = [];
            let subcategories = [];
            let userPermissions = null;
            let rolePermissions = null;

            try {
                if (row.assigned_categories) {
                    categories = typeof row.assigned_categories === 'string'
                        ? JSON.parse(row.assigned_categories)
                        : row.assigned_categories;
                }
                if (row.assigned_subcategories) {
                    subcategories = typeof row.assigned_subcategories === 'string'
                        ? JSON.parse(row.assigned_subcategories)
                        : row.assigned_subcategories;
                }
                if (row.user_permissions) {
                    userPermissions = typeof row.user_permissions === 'string'
                        ? JSON.parse(row.user_permissions)
                        : row.user_permissions;
                }
                if (row.role_permissions) {
                    rolePermissions = typeof row.role_permissions === 'string'
                        ? JSON.parse(row.role_permissions)
                        : row.role_permissions;
                }
            } catch (e) {
                console.error('Error parsing JSON fields:', e);
            }

            return {
                ...row,
                assigned_categories: Array.isArray(categories) ? categories : [],
                assigned_subcategories: Array.isArray(subcategories) ? subcategories : [],
                user_permissions: userPermissions,
                role_permissions: rolePermissions,
                // Effective permissions: user overrides take precedence over role permissions
                effective_permissions: userPermissions || rolePermissions
            };
        });

        res.json({
            success: true,
            data: parsedRows
        });
    } catch (error) {
        console.error('Get Employees Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching employees'
        });
    }
};

/**
 * Create new employee assignment
 */
exports.createEmployee = async (req, res) => {
    try {
        const {
            rbac_user_id,
            role,
            custom_role_id,  // NEW: Reference to ticket_roles
            assigned_categories,
            assigned_subcategories,
            name,
            email,
            username,
            password,
            phone,
            permissions  // NEW: Optional user-specific permission overrides
        } = req.body;

        // Validate role or custom_role_id is provided
        if (!role && !custom_role_id) {
            return res.status(400).json({
                success: false,
                message: 'Either role or custom_role_id must be provided'
            });
        }

        let roleInfo = null;
        let roleName = role;

        // If custom_role_id is provided, fetch role details
        if (custom_role_id) {
            const [roleData] = await masterPool.query(
                'SELECT role_name, display_name, permissions FROM ticket_roles WHERE id = ? AND is_active = 1',
                [custom_role_id]
            );

            if (roleData.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom role not found or inactive'
                });
            }

            roleInfo = roleData[0];
            roleName = roleInfo.role_name;
        } else {
            // Legacy role validation
            if (!['staff', 'worker', 'manager'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role. Must be staff, worker, or manager (or provide custom_role_id)'
                });
            }
        }

        // Logic split based on whether RBAC user is provided
        if (rbac_user_id) {
            // RBAC User Assignment (Manager, Principal, etc.)
            // Check if user exists in rbac_users
            const [userCheck] = await masterPool.query(
                'SELECT id, name FROM rbac_users WHERE id = ?',
                [rbac_user_id]
            );

            if (userCheck.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found in RBAC users'
                });
            }

            // Check if already assigned
            const [existing] = await masterPool.query(
                'SELECT id FROM ticket_employees WHERE rbac_user_id = ? AND is_active = 1',
                [rbac_user_id]
            );

            if (existing.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'User is already assigned as an employee'
                });
            }

            const categoriesJson = assigned_categories ? JSON.stringify(assigned_categories) : null;
            const subcategoriesJson = assigned_subcategories ? JSON.stringify(assigned_subcategories) : null;
            const permissionsJson = permissions ? JSON.stringify(permissions) : null;

            await masterPool.query(
                `INSERT INTO ticket_employees 
                (rbac_user_id, role, custom_role_id, role_name, assigned_categories, assigned_subcategories, permissions) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [rbac_user_id, 'staff', custom_role_id || null, roleName, categoriesJson, subcategoriesJson, permissionsJson]
            );

            // Sync role to rbac_users if it's a legacy role
            if (role && ['staff', 'worker', 'manager'].includes(role)) {
                await masterPool.query(
                    'UPDATE rbac_users SET role = ? WHERE id = ?',
                    [role, rbac_user_id]
                );
            }

        } else {
            // Standalone Worker/Employee Creation
            if (!name || !username || !password || !phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, username, password, and mobile number are required for standalone employees'
                });
            }

            // Check if username exists
            const [existingUser] = await masterPool.query(
                'SELECT id FROM ticket_employees WHERE username = ? UNION SELECT id FROM rbac_users WHERE username = ?',
                [username, username]
            );

            if (existingUser.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const permissionsJson = permissions ? JSON.stringify(permissions) : null;

            // Insert standalone employee
            await masterPool.query(
                `INSERT INTO ticket_employees 
                (role, custom_role_id, role_name, name, email, username, password_hash, phone, permissions) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['worker', custom_role_id || null, roleName, name, email || null, username, hashedPassword, phone, permissionsJson]
            );
        }

        res.status(201).json({
            success: true,
            message: rbac_user_id
                ? `${roleInfo?.display_name || role} assigned successfully`
                : `${roleInfo?.display_name || role} created successfully`
        });

    } catch (error) {
        console.error('Create Employee Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating employee'
        });
    }
};


/**
 * Update employee role
 */
exports.updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, custom_role_id, assigned_categories, assigned_subcategories } = req.body;

        // Validation
        if (!role && !custom_role_id) {
            return res.status(400).json({
                success: false,
                message: 'Either role or custom_role_id must be provided'
            });
        }

        let roleName = role;
        let roleInfo = null;

        if (custom_role_id) {
            const [roleData] = await masterPool.query(
                'SELECT role_name, display_name FROM ticket_roles WHERE id = ? AND is_active = 1',
                [custom_role_id]
            );

            if (roleData.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom role not found or inactive'
                });
            }
            roleInfo = roleData[0];
            roleName = roleInfo.role_name;
        } else {
            // Legacy validation
            if (!['staff', 'worker'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role. Must be staff or worker (or provide custom_role_id)'
                });
            }
        }

        // Prepare category data (only for staff/managers/custom roles)
        // Workers typically don't have categories, but we'll allow updating if provided, unless strictly worker?
        // Logic: if role contains 'worker', maybe skip? But custom roles might correspond to workers. 
        // We'll trust the input for now as frontend handles visibility.
        const categoriesJson = assigned_categories ? JSON.stringify(assigned_categories) : null;
        const subcategoriesJson = assigned_subcategories ? JSON.stringify(assigned_subcategories) : null;

        const [result] = await masterPool.query(
            `UPDATE ticket_employees 
             SET custom_role_id = ?, role_name = ?, assigned_categories = ?, assigned_subcategories = ?, updated_at = NOW() 
             WHERE id = ?`,
            [custom_role_id || null, roleName || role, categoriesJson, subcategoriesJson, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Sync role back to rbac_users
        const [assignment] = await masterPool.query(
            'SELECT rbac_user_id FROM ticket_employees WHERE id = ?',
            [id]
        );

        if (assignment.length > 0 && assignment[0].rbac_user_id) {
            // Only sync standard roles to RBAC users table if compatible, 
            // or maybe we map custom roles to 'staff' or 'worker' broadly?
            // For now, if it's a standard role, sync it. Custom roles might simply remain 'staff' in core RBAC for login purposes.
            // But let's sync the literal role_name if it fits or default.

            // If custom role, we might want to keep the underlying RBAC role as 'staff' (privileged) or 'worker' (restricted) 
            // depending on the base type, but we don't strictly know the base type here. 
            // Assuming 'staff' for most custom roles unless explicit 'worker'.

            let rbacRole = role;
            if (custom_role_id) {
                // heuristic: if role_name contains worker -> worker, else staff
                rbacRole = roleName.includes('worker') ? 'worker' : 'staff';
            }

            await masterPool.query(
                'UPDATE rbac_users SET role = ? WHERE id = ?',
                [rbacRole, assignment[0].rbac_user_id]
            );
        }

        res.json({
            success: true,
            message: 'Employee updated successfully'
        });

    } catch (error) {
        console.error('Update Employee Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating employee'
        });
    }
};

/**
 * Delete employee (soft delete)
 */
exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await masterPool.query(
            'UPDATE ticket_employees SET is_active = 0, updated_at = NOW() WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            message: 'Employee removed successfully'
        });
    } catch (error) {
        console.error('Delete Employee Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting employee'
        });
    }
};

/**
 * Get available RBAC users (not yet assigned as employees)
 */
exports.getAvailableUsers = async (req, res) => {
    try {
        const [rows] = await masterPool.query(`
            SELECT 
                ru.id,
                ru.name,
                ru.email,
                ru.phone,
                ru.username,
                ru.role as rbac_role
            FROM rbac_users ru
            LEFT JOIN ticket_employees te ON ru.id = te.rbac_user_id AND te.is_active = 1
            WHERE te.id IS NULL 
            AND ru.is_active = 1
            AND ru.role NOT IN ('super_admin', 'student')
            ORDER BY ru.name ASC
        `);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Get Available Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching available users'
        });
    }
};
/**
 * Get employee ticket history and stats
 */
exports.getEmployeeHistory = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get employee details to find their RBAC ID if it exists
        const [employee] = await masterPool.query(
            'SELECT * FROM ticket_employees WHERE id = ?',
            [id]
        );

        if (employee.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const emp = employee[0];
        const identifiers = [emp.id];
        // Ensure strictly parsing rbac_user_id
        if (emp.rbac_user_id !== undefined && emp.rbac_user_id !== null) {
            identifiers.push(emp.rbac_user_id);
        }

        // 2. Get Overall Stats
        // We'll query tickets assigned to either their emp ID or RBAC ID
        // Removing is_active check to include all historical assignments
        const [stats] = await masterPool.query(`
            SELECT 
                COUNT(*) as total_assigned,
                SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) as open_tickets,
                SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tickets,
                SUM(CASE WHEN t.status IN ('resolved', 'completed') THEN 1 ELSE 0 END) as completed_tickets,
                SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
                SUM(CASE WHEN t.priority = 'critical' AND t.status NOT IN ('resolved', 'closed', 'completed') THEN 1 ELSE 0 END) as critical_pending
            FROM ticket_assignments ta
            JOIN tickets t ON ta.ticket_id = t.id
            WHERE ta.assigned_to IN (?)
        `, [identifiers]);

        // 3. Get Recent History (Last 50 interactions)
        // Including when they were assigned
        const [history] = await masterPool.query(`
            SELECT 
                t.id,
                t.ticket_number,
                t.title,
                t.priority,
                t.status,
                t.created_at,
                ta.assigned_at,
                c.name as category_name
            FROM ticket_assignments ta
            JOIN tickets t ON ta.ticket_id = t.id
            LEFT JOIN complaint_categories c ON t.category_id = c.id
            WHERE ta.assigned_to IN (?)
            ORDER BY ta.assigned_at DESC
            LIMIT 50
        `, [identifiers]);

        res.json({
            success: true,
            data: {
                employee: emp,
                stats: stats[0],
                history: history
            }
        });

    } catch (error) {
        console.error('Get Employee History Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching employee history'
        });
    }
};

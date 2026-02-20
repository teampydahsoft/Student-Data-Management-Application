const { masterPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Helper function to safely parse JSON fields
const parseJSON = (data) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }
  return data;
};

// audit_logs.admin_id and forms.created_by FK reference admins(id) only.
// RBAC/staff users have ids from other tables; use null to avoid FK violation.
const getAdminIdForDb = (req) => (req.admin && req.admin.role === 'admin' ? req.admin.id : null);

// Create new form
exports.createForm = async (req, res) => {
  let conn;
  try {
    const { formName, formDescription, formFields } = req.body;

    if (!formName || !formFields || !Array.isArray(formFields)) {
      return res.status(400).json({
        success: false,
        message: 'Form name and fields are required'
      });
    }

    const formId = uuidv4();
    // Use the primary frontend URL for QR codes (first one in the list)
    const frontendUrl = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')[0].trim()
      : (process.env.NODE_ENV === 'production'
        ? 'https://pydahsdbms.vercel.app'
        : 'http://localhost:3000');

    const formUrl = `${frontendUrl}/form/${formId}`;

    // Generate QR code
    const qrCodeData = await QRCode.toDataURL(formUrl);

    conn = await masterPool.getConnection();
    await conn.beginTransaction();

    const adminIdForDb = getAdminIdForDb(req);
    // Insert form
    // Note: recurrence_config and form_category column must exist in DB
    await conn.query(
      `INSERT INTO forms (form_id, form_name, form_description, form_fields, qr_code_data, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [formId, formName, formDescription || '', JSON.stringify(formFields), qrCodeData, adminIdForDb]
    );

    // Log action
    await conn.query(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      ['CREATE', 'FORM', formId, adminIdForDb, JSON.stringify({ formName })]
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Form created successfully',
      data: {
        formId,
        formName,
        formUrl,
        qrCodeData
      }
    });

  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Create form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating form'
    });
  } finally {
    if (conn) conn.release();
  }
};

// Get all forms
exports.getAllForms = async (req, res) => {
  try {
    const [forms] = await masterPool.query(`
      SELECT f.*, a.username as created_by_name
      FROM forms f
      LEFT JOIN admins a ON f.created_by = a.id
      ORDER BY f.created_at DESC
    `);

    // Parse JSON fields
    const parsedForms = (forms || []).map(form => ({
      ...form,
      form_fields: parseJSON(form.form_fields)
    }));

    res.json({
      success: true,
      data: parsedForms
    });

  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching forms'
    });
  }
};

// Get single form by ID
exports.getFormById = async (req, res) => {
  try {
    const { formId } = req.params;

    const [forms] = await masterPool.query(`
      SELECT f.*, a.username as created_by_name
      FROM forms f
      LEFT JOIN admins a ON f.created_by = a.id
      WHERE f.form_id = ?
      LIMIT 1
    `, [formId]);

    if (forms.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    const form = {
      ...forms[0],
      form_fields: parseJSON(forms[0].form_fields)
    };

    res.json({
      success: true,
      data: form
    });

  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching form'
    });
  }
};

// Update form (fields can be updated, QR code remains same)
exports.updateForm = async (req, res) => {
  let conn;
  try {
    const { formId } = req.params;
    const { formName, formDescription, formFields, isActive } = req.body;

    conn = await masterPool.getConnection();
    await conn.beginTransaction();

    // Check if form exists
    const [forms] = await conn.query(
      'SELECT * FROM forms WHERE form_id = ? LIMIT 1',
      [formId]
    );

    if (forms.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (formName !== undefined) {
      updates.push('form_name = ?');
      values.push(formName);
    }
    if (formDescription !== undefined) {
      updates.push('form_description = ?');
      values.push(formDescription);
    }
    if (formFields !== undefined) {
      updates.push('form_fields = ?');
      values.push(JSON.stringify(formFields));
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }

    if (updates.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(formId);

    await conn.query(
      `UPDATE forms SET ${updates.join(', ')} WHERE form_id = ?`,
      values
    );

    // Sync dynamic table schema if fields were updated
    if (formFields !== undefined) {
      const destinationTable = `form_${formId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

      // Ensure table exists
      await conn.query(
        `CREATE TABLE IF NOT EXISTS ${destinationTable} (
          id INT PRIMARY KEY AUTO_INCREMENT,
          admission_number VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`
      );

      // Add columns for new fields
      for (const field of formFields) {
        const col = field.key?.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!col) continue;

        const [columns] = await conn.query(
          `SELECT COUNT(*) as count 
           FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND COLUMN_NAME = ?`,
          [destinationTable, col]
        );

        if (columns[0].count === 0) {
          await conn.query(
            `ALTER TABLE ${destinationTable} ADD COLUMN ${col} VARCHAR(1024) NULL`
          );
        }
      }
      console.log(`✅ Synced schema for dynamic table ${destinationTable}`);
    }

    // Log action
    const adminIdForDb = getAdminIdForDb(req);
    await conn.query(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      ['UPDATE', 'FORM', formId, adminIdForDb, JSON.stringify(req.body)]
    );

    await conn.commit();

    res.json({
      success: true,
      message: 'Form updated successfully'
    });

  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Update form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating form'
    });
  } finally {
    if (conn) conn.release();
  }
};

// Delete form
exports.deleteForm = async (req, res) => {
  let conn;
  try {
    const { formId } = req.params;

    conn = await masterPool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      'DELETE FROM forms WHERE form_id = ?',
      [formId]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Log action
    const adminIdForDb = getAdminIdForDb(req);
    await conn.query(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id)
       VALUES (?, ?, ?, ?)`,
      ['DELETE', 'FORM', formId, adminIdForDb]
    );

    await conn.commit();

    res.json({
      success: true,
      message: 'Form deleted successfully'
    });

  } catch (error) {
    if (conn) await conn.rollback();
    console.error('Delete form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting form'
    });
  } finally {
    if (conn) conn.release();
  }
};

// Get form for public submission (no auth required) - Optimized with caching
exports.getPublicForm = async (req, res) => {
  try {
    const { formId } = req.params;

    const [forms] = await masterPool.query(
      `SELECT form_id, form_name, form_description, form_fields, is_active
       FROM forms
       WHERE form_id = ?
       LIMIT 1`,
      [formId]
    );

    if (forms.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    const form = forms[0];

    if (!form.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This form is no longer active'
      });
    }

    // Add cache headers for better performance (cache for 5 minutes)
    res.set('Cache-Control', 'public, max-age=300');

    res.json({
      success: true,
      data: {
        ...form,
        form_fields: parseJSON(form.form_fields)
      }
    });

  } catch (error) {
    console.error('Get public form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching form'
    });
  }
};

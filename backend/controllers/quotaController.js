const { masterPool } = require('../config/database');

let tableEnsured = false;

const DEFAULT_QUOTAS = [
  { name: 'Convenor Quota', code: 'CONV', sortOrder: 1 },
  { name: 'Lateral Entry', code: 'LATER', sortOrder: 2 },
  { name: 'Lateral Spot', code: 'LSPOT', sortOrder: 3 },
  { name: 'Management Quota', code: 'MANG', sortOrder: 4 },
  { name: 'Spot Admission', code: 'SPOT', sortOrder: 5 }
];

const serializeQuotaRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  isActive: row.is_active === 1 || row.is_active === true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const ensureStudentQuotasTable = async () => {
  if (tableEnsured) return;

  await masterPool.query(`
    CREATE TABLE IF NOT EXISTS student_quotas (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_quota_name (name),
      UNIQUE KEY unique_quota_code (code),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [countRows] = await masterPool.query('SELECT COUNT(*) AS count FROM student_quotas');
  if ((countRows[0]?.count || 0) === 0) {
    for (const quota of DEFAULT_QUOTAS) {
      await masterPool.query(
        'INSERT INTO student_quotas (name, code, sort_order) VALUES (?, ?, ?)',
        [quota.name, quota.code, quota.sortOrder]
      );
    }
  }

  tableEnsured = true;
};

const fetchQuotas = async ({ includeInactive = false } = {}) => {
  await ensureStudentQuotasTable();

  const whereClause = includeInactive ? '' : 'WHERE is_active = 1';
  const [rows] = await masterPool.query(
    `SELECT * FROM student_quotas ${whereClause} ORDER BY sort_order ASC, name ASC`
  );

  return rows.map(serializeQuotaRow);
};

exports.getPublicQuotas = async (req, res) => {
  try {
    const quotas = await fetchQuotas({ includeInactive: false });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data: quotas });
  } catch (error) {
    console.error('getPublicQuotas error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quotas' });
  }
};

exports.getQuotas = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === true;
    const quotas = await fetchQuotas({ includeInactive });
    res.json({ success: true, data: quotas });
  } catch (error) {
    console.error('getQuotas error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quotas' });
  }
};

exports.createQuota = async (req, res) => {
  try {
    await ensureStudentQuotasTable();

    const { name, code, isActive, sortOrder } = req.body;
    const trimmedName = name?.trim();
    const trimmedCode = code?.trim()?.toUpperCase();

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Quota name is required' });
    }
    if (!trimmedCode) {
      return res.status(400).json({ success: false, message: 'Quota code is required' });
    }

    const [result] = await masterPool.query(
      `INSERT INTO student_quotas (name, code, is_active, sort_order)
       VALUES (?, ?, ?, ?)`,
      [
        trimmedName,
        trimmedCode,
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
      ]
    );

    const [rows] = await masterPool.query('SELECT * FROM student_quotas WHERE id = ?', [result.insertId]);
    res.status(201).json({
      success: true,
      message: 'Quota created successfully',
      data: serializeQuotaRow(rows[0])
    });
  } catch (error) {
    console.error('createQuota error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: error.message.includes('unique_quota_code')
          ? 'Quota code already exists'
          : 'Quota name already exists'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create quota' });
  }
};

exports.updateQuota = async (req, res) => {
  try {
    await ensureStudentQuotasTable();

    const quotaId = parseInt(req.params.id, 10);
    if (!quotaId || Number.isNaN(quotaId)) {
      return res.status(400).json({ success: false, message: 'Invalid quota ID' });
    }

    const [existingRows] = await masterPool.query('SELECT * FROM student_quotas WHERE id = ?', [quotaId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quota not found' });
    }

    const { name, code, isActive, sortOrder } = req.body;
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Quota name cannot be empty' });
      }
      updateFields.push('name = ?');
      updateValues.push(trimmedName);
    }

    if (code !== undefined) {
      const trimmedCode = code?.trim()?.toUpperCase();
      if (!trimmedCode) {
        return res.status(400).json({ success: false, message: 'Quota code cannot be empty' });
      }
      updateFields.push('code = ?');
      updateValues.push(trimmedCode);
    }

    if (isActive !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(isActive ? 1 : 0);
    }

    if (sortOrder !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No updates provided' });
    }

    updateValues.push(quotaId);
    await masterPool.query(
      `UPDATE student_quotas SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [rows] = await masterPool.query('SELECT * FROM student_quotas WHERE id = ?', [quotaId]);
    res.json({
      success: true,
      message: 'Quota updated successfully',
      data: serializeQuotaRow(rows[0])
    });
  } catch (error) {
    console.error('updateQuota error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: error.message.includes('unique_quota_code')
          ? 'Quota code already exists'
          : 'Quota name already exists'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to update quota' });
  }
};

exports.deleteQuota = async (req, res) => {
  try {
    await ensureStudentQuotasTable();

    const quotaId = parseInt(req.params.id, 10);
    if (!quotaId || Number.isNaN(quotaId)) {
      return res.status(400).json({ success: false, message: 'Invalid quota ID' });
    }

    const [existingRows] = await masterPool.query('SELECT * FROM student_quotas WHERE id = ?', [quotaId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quota not found' });
    }

    const quotaCode = existingRows[0].code;
    const [studentRows] = await masterPool.query(
      'SELECT COUNT(*) AS count FROM students WHERE stud_type = ?',
      [quotaCode]
    );

    if ((studentRows[0]?.count || 0) > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete quota "${quotaCode}" because ${studentRows[0].count} student(s) are assigned to it`
      });
    }

    await masterPool.query('DELETE FROM student_quotas WHERE id = ?', [quotaId]);
    res.json({ success: true, message: 'Quota deleted successfully' });
  } catch (error) {
    console.error('deleteQuota error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete quota' });
  }
};

exports.fetchActiveQuotaCodes = async () => {
  try {
    await ensureStudentQuotasTable();
    const [rows] = await masterPool.query(
      'SELECT code FROM student_quotas WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    );
    return rows.map((row) => row.code);
  } catch (error) {
    console.error('fetchActiveQuotaCodes error:', error);
    return [];
  }
};

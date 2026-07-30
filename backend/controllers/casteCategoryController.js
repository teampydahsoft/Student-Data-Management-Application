const { masterPool } = require('../config/database');

let tablesEnsured = false;

const serializeStudentForCasteBlock = (row) => ({
  student_name: row.student_name || '',
  admission_number: row.admission_number || row.admission_no || '',
  pin_no: row.pin_no || '',
  college: row.college || '',
  course: row.course || '',
  branch: row.branch || '',
  caste: row.caste || ''
});

const fetchStudentsByCasteNames = async (casteNames, limit = 200) => {
  if (!casteNames || casteNames.length === 0) {
    return { students: [], totalCount: 0 };
  }

  await ensureCasteTables();

  const [idRows] = await masterPool.query(
    `SELECT id FROM castes
     WHERE name IN (${casteNames.map(() => '?').join(',')})`,
    casteNames
  );
  const casteIds = idRows.map((row) => row.id);

  return fetchStudentsByCasteIdsOrNames({ casteIds, casteNames }, limit);
};

const serializeCaste = (row) => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  isActive: row.is_active === 1 || row.is_active === true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const serializeCategory = (row, castes = []) => ({
  id: row.id,
  name: row.name,
  isActive: row.is_active === 1 || row.is_active === true,
  sortOrder: row.sort_order ?? 0,
  castes: castes.map(serializeCaste),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const ensureCasteTables = async () => {
  if (!tablesEnsured) {
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS caste_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_caste_category_name (name),
        INDEX idx_caste_categories_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS castes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_caste_name_per_category (category_id, name),
        INDEX idx_castes_category (category_id),
        INDEX idx_castes_active (is_active),
        CONSTRAINT fk_castes_category
          FOREIGN KEY (category_id) REFERENCES caste_categories(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // No default seed — categories/castes are created only from Settings.
    tablesEnsured = true;
  }
};

let casteIdColumnCache = null; // null = unknown, true/false after check

const studentsHasCasteIdColumn = async () => {
  if (casteIdColumnCache !== null) return casteIdColumnCache;

  const [rows] = await masterPool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'students'
       AND COLUMN_NAME = 'caste_id'`
  );
  casteIdColumnCache = Number(rows?.[0]?.count || 0) > 0;
  return casteIdColumnCache;
};

/**
 * Settings never writes to students.
 * This only checks whether students.caste_id exists (no ALTER, no bulk backfill).
 * Create the column with: node backend/scripts/add_student_caste_id_column.js
 * Link rows only on student create/update (or optional backfill script).
 */
const ensureStudentCasteIdColumn = async () => {
  const hasColumn = await studentsHasCasteIdColumn();
  if (!hasColumn) {
    console.warn(
      '⚠️ students.caste_id column is missing. Run: node backend/scripts/add_student_caste_id_column.js (stop API first)'
    );
  }
  return hasColumn;
};

const resolveCasteIdByName = async (casteName) => {
  const trimmed = casteName == null ? '' : String(casteName).trim();
  if (!trimmed) return null;

  await ensureCasteTables();
  const [rows] = await masterPool.query(
    `SELECT id FROM castes
     WHERE LOWER(TRIM(name)) = LOWER(?)
     ORDER BY id ASC
     LIMIT 1`,
    [trimmed]
  );
  return rows[0]?.id || null;
};

const fetchStudentsByCasteIdsOrNames = async ({ casteIds = [], casteNames = [] }, limit = 200) => {
  const hasColumn = await studentsHasCasteIdColumn();

  const conditions = [];
  const params = [];

  if (hasColumn && casteIds.length > 0) {
    conditions.push(`caste_id IN (${casteIds.map(() => '?').join(',')})`);
    params.push(...casteIds);
  }
  if (casteNames.length > 0) {
    if (hasColumn) {
      conditions.push(
        `(caste_id IS NULL AND caste IN (${casteNames.map(() => '?').join(',')}))`
      );
    } else {
      conditions.push(`caste IN (${casteNames.map(() => '?').join(',')})`);
    }
    params.push(...casteNames);
  }

  if (conditions.length === 0) {
    return { students: [], totalCount: 0 };
  }

  const whereSql = conditions.join(' OR ');
  const selectCols = hasColumn
    ? 'student_name, admission_number, admission_no, pin_no, college, course, branch, caste, caste_id'
    : 'student_name, admission_number, admission_no, pin_no, college, course, branch, caste';

  const [countRows] = await masterPool.query(
    `SELECT COUNT(*) AS count FROM students WHERE ${whereSql}`,
    params
  );
  const totalCount = countRows[0]?.count || 0;
  if (totalCount === 0) {
    return { students: [], totalCount: 0 };
  }

  const [studentRows] = await masterPool.query(
    `SELECT ${selectCols}
     FROM students
     WHERE ${whereSql}
     ORDER BY college ASC, course ASC, branch ASC, student_name ASC
     LIMIT ?`,
    [...params, limit]
  );

  return {
    students: studentRows.map(serializeStudentForCasteBlock),
    totalCount
  };
};

const fetchCategoriesWithCastes = async ({ includeInactive = false } = {}) => {
  await ensureCasteTables();

  const categoryWhere = includeInactive ? '' : 'WHERE is_active = 1';
  const [categoryRows] = await masterPool.query(
    `SELECT * FROM caste_categories ${categoryWhere} ORDER BY sort_order ASC, name ASC`
  );

  if (categoryRows.length === 0) return [];

  const categoryIds = categoryRows.map((row) => row.id);
  const casteWhere = includeInactive
    ? 'WHERE category_id IN (?)'
    : 'WHERE category_id IN (?) AND is_active = 1';
  const [casteRows] = await masterPool.query(
    `SELECT * FROM castes ${casteWhere} ORDER BY sort_order ASC, name ASC`,
    [categoryIds]
  );

  const castesByCategory = {};
  casteRows.forEach((row) => {
    if (!castesByCategory[row.category_id]) castesByCategory[row.category_id] = [];
    castesByCategory[row.category_id].push(row);
  });

  return categoryRows.map((row) =>
    serializeCategory(row, castesByCategory[row.id] || [])
  );
};

exports.getPublicCasteCategories = async (req, res) => {
  try {
    const data = await fetchCategoriesWithCastes({ includeInactive: false });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data });
  } catch (error) {
    console.error('getPublicCasteCategories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch caste categories' });
  }
};

exports.getCasteCategories = async (req, res) => {
  try {
    const includeInactive =
      req.query.includeInactive === 'true' || req.query.includeInactive === true;
    const data = await fetchCategoriesWithCastes({ includeInactive });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getCasteCategories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch caste categories' });
  }
};

exports.createCasteCategory = async (req, res) => {
  try {
    await ensureCasteTables();

    const { name, isActive, sortOrder } = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const [result] = await masterPool.query(
      `INSERT INTO caste_categories (name, is_active, sort_order)
       VALUES (?, ?, ?)`,
      [
        trimmedName,
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
      ]
    );

    const [rows] = await masterPool.query(
      'SELECT * FROM caste_categories WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: serializeCategory(rows[0], [])
    });
  } catch (error) {
    console.error('createCasteCategory error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Category name already exists'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

exports.updateCasteCategory = async (req, res) => {
  try {
    await ensureCasteTables();

    const categoryId = parseInt(req.params.id, 10);
    if (!categoryId || Number.isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const [existingRows] = await masterPool.query(
      'SELECT * FROM caste_categories WHERE id = ?',
      [categoryId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const { name, isActive, sortOrder } = req.body;
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
      }
      updateFields.push('name = ?');
      updateValues.push(trimmedName);
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

    updateValues.push(categoryId);
    await masterPool.query(
      `UPDATE caste_categories SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const data = await fetchCategoriesWithCastes({ includeInactive: true });
    const updated = data.find((item) => item.id === categoryId);

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('updateCasteCategory error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Category name already exists'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

exports.deleteCasteCategory = async (req, res) => {
  try {
    await ensureCasteTables();

    const categoryId = parseInt(req.params.id, 10);
    if (!categoryId || Number.isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const [existingRows] = await masterPool.query(
      'SELECT * FROM caste_categories WHERE id = ?',
      [categoryId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const [casteRows] = await masterPool.query(
      'SELECT id, name FROM castes WHERE category_id = ?',
      [categoryId]
    );
    const casteNames = casteRows.map((row) => row.name);
    const casteIds = casteRows.map((row) => row.id);

    if (casteNames.length > 0 || casteIds.length > 0) {
      const { students, totalCount } = await fetchStudentsByCasteIdsOrNames({
        casteIds,
        casteNames
      });
      if (totalCount > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot delete category "${existingRows[0].name}" because ${totalCount} student(s) use its castes`,
          students,
          totalCount,
          hasMore: totalCount > students.length
        });
      }
    }

    await masterPool.query('DELETE FROM caste_categories WHERE id = ?', [categoryId]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('deleteCasteCategory error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};

exports.createCaste = async (req, res) => {
  try {
    await ensureCasteTables();

    const categoryId = parseInt(req.params.id, 10);
    if (!categoryId || Number.isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const [categoryRows] = await masterPool.query(
      'SELECT * FROM caste_categories WHERE id = ?',
      [categoryId]
    );
    if (categoryRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const { name, isActive, sortOrder } = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Caste name is required' });
    }

    const [result] = await masterPool.query(
      `INSERT INTO castes (category_id, name, is_active, sort_order)
       VALUES (?, ?, ?, ?)`,
      [
        categoryId,
        trimmedName,
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
      ]
    );

    const [rows] = await masterPool.query('SELECT * FROM castes WHERE id = ?', [result.insertId]);
    res.status(201).json({
      success: true,
      message: 'Caste created successfully',
      data: serializeCaste(rows[0])
    });
  } catch (error) {
    console.error('createCaste error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Caste already exists in this category'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create caste' });
  }
};

exports.updateCaste = async (req, res) => {
  try {
    await ensureCasteTables();

    const categoryId = parseInt(req.params.id, 10);
    const casteId = parseInt(req.params.casteId, 10);
    if (!categoryId || Number.isNaN(categoryId) || !casteId || Number.isNaN(casteId)) {
      return res.status(400).json({ success: false, message: 'Invalid category or caste ID' });
    }

    const [existingRows] = await masterPool.query(
      'SELECT * FROM castes WHERE id = ? AND category_id = ?',
      [casteId, categoryId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Caste not found' });
    }

    const oldName = existingRows[0].name;
    const { name, isActive, sortOrder } = req.body;
    const updateFields = [];
    const updateValues = [];
    let renamedTo = null;

    if (name !== undefined) {
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Caste name cannot be empty' });
      }
      updateFields.push('name = ?');
      updateValues.push(trimmedName);
      if (trimmedName !== oldName) {
        renamedTo = trimmedName;
      }
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

    updateValues.push(casteId);
    await masterPool.query(
      `UPDATE castes SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Settings only updates castes table — students are linked on student create/update via caste_id
    const [rows] = await masterPool.query('SELECT * FROM castes WHERE id = ?', [casteId]);
    res.json({
      success: true,
      message: renamedTo
        ? `Caste renamed from "${oldName}" to "${renamedTo}"`
        : 'Caste updated successfully',
      data: serializeCaste(rows[0])
    });
  } catch (error) {
    console.error('updateCaste error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Caste already exists in this category'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to update caste' });
  }
};

exports.deleteCaste = async (req, res) => {
  try {
    await ensureCasteTables();

    const categoryId = parseInt(req.params.id, 10);
    const casteId = parseInt(req.params.casteId, 10);
    if (!categoryId || Number.isNaN(categoryId) || !casteId || Number.isNaN(casteId)) {
      return res.status(400).json({ success: false, message: 'Invalid category or caste ID' });
    }

    const [existingRows] = await masterPool.query(
      'SELECT * FROM castes WHERE id = ? AND category_id = ?',
      [casteId, categoryId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Caste not found' });
    }

    const casteName = existingRows[0].name;
    const { students, totalCount } = await fetchStudentsByCasteIdsOrNames({
      casteIds: [casteId],
      casteNames: [casteName]
    });
    if (totalCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete caste "${casteName}" because ${totalCount} student(s) are assigned to it`,
        students,
        totalCount,
        hasMore: totalCount > students.length
      });
    }

    await masterPool.query('DELETE FROM castes WHERE id = ?', [casteId]);
    res.json({ success: true, message: 'Caste deleted successfully' });
  } catch (error) {
    console.error('deleteCaste error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete caste' });
  }
};

exports.fetchActiveCasteNames = async () => {
  try {
    const data = await fetchCategoriesWithCastes({ includeInactive: false });
    const names = [];
    data.forEach((category) => {
      category.castes.forEach((caste) => {
        if (!names.includes(caste.name)) names.push(caste.name);
      });
    });
    return names;
  } catch (error) {
    console.error('fetchActiveCasteNames error:', error);
    return [];
  }
};

exports.ensureStudentCasteIdColumn = ensureStudentCasteIdColumn;
exports.resolveCasteIdByName = resolveCasteIdByName;

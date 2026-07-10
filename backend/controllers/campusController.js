const { masterPool } = require('../config/database');

/**
 * GET /api/campuses
 * Get all campuses with their assigned college IDs
 */
exports.getCampuses = async (req, res) => {
  try {
    const [campuses] = await masterPool.query(
      'SELECT * FROM campuses ORDER BY name ASC'
    );

    // Parse college_ids JSON for each campus
    const result = campuses.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code || null,
      description: c.description || null,
      collegeIds: c.college_ids
        ? (typeof c.college_ids === 'string' ? JSON.parse(c.college_ids) : c.college_ids)
        : [],
      isActive: c.is_active === 1 || c.is_active === true,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('getCampuses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campuses' });
  }
};

/**
 * POST /api/campuses
 * Create a new campus
 */
exports.createCampus = async (req, res) => {
  try {
    const { name, code, description, collegeIds = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Campus name is required' });
    }

    // Check name uniqueness
    const [existing] = await masterPool.query(
      'SELECT id FROM campuses WHERE LOWER(name) = LOWER(?)',
      [name.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'A campus with this name already exists' });
    }

    // Check code uniqueness (if provided)
    if (code && code.trim()) {
      const [existingCode] = await masterPool.query(
        'SELECT id FROM campuses WHERE LOWER(code) = LOWER(?)',
        [code.trim()]
      );
      if (existingCode.length > 0) {
        return res.status(409).json({ success: false, message: 'A campus with this code already exists' });
      }
    }

    // Validate that the provided college IDs are not already assigned to another campus
    if (Array.isArray(collegeIds) && collegeIds.length > 0) {
      const conflict = await _findCollegeConflicts(collegeIds, null);
      if (conflict) {
        return res.status(409).json({ success: false, message: conflict });
      }
    }

    const [result] = await masterPool.query(
      `INSERT INTO campuses (name, code, description, college_ids, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [
        name.trim(),
        code && code.trim() ? code.trim().toUpperCase() : null,
        description && description.trim() ? description.trim() : null,
        JSON.stringify(Array.isArray(collegeIds) ? collegeIds : []),
      ]
    );

    const [rows] = await masterPool.query('SELECT * FROM campuses WHERE id = ?', [result.insertId]);
    const c = rows[0];

    res.status(201).json({
      success: true,
      data: {
        id: c.id,
        name: c.name,
        code: c.code || null,
        description: c.description || null,
        collegeIds: c.college_ids
          ? (typeof c.college_ids === 'string' ? JSON.parse(c.college_ids) : c.college_ids)
          : [],
        isActive: c.is_active === 1 || c.is_active === true,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      },
      message: 'Campus created successfully',
    });
  } catch (error) {
    console.error('createCampus error:', error);
    res.status(500).json({ success: false, message: 'Failed to create campus' });
  }
};

/**
 * PUT /api/campuses/:id
 * Update a campus (name, code, description, collegeIds)
 */
exports.updateCampus = async (req, res) => {
  try {
    const campusId = parseInt(req.params.id, 10);
    if (!campusId || Number.isNaN(campusId)) {
      return res.status(400).json({ success: false, message: 'Invalid campus ID' });
    }

    const [existing] = await masterPool.query('SELECT * FROM campuses WHERE id = ?', [campusId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Campus not found' });
    }

    const { name, code, description, collegeIds } = req.body;
    const fields = [];
    const values = [];

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: 'Campus name cannot be empty' });
      }
      // Check uniqueness excluding current
      const [dup] = await masterPool.query(
        'SELECT id FROM campuses WHERE LOWER(name) = LOWER(?) AND id != ?',
        [name.trim(), campusId]
      );
      if (dup.length > 0) {
        return res.status(409).json({ success: false, message: 'A campus with this name already exists' });
      }
      fields.push('name = ?');
      values.push(name.trim());
    }

    if (code !== undefined) {
      if (code && code.trim()) {
        const [dupCode] = await masterPool.query(
          'SELECT id FROM campuses WHERE LOWER(code) = LOWER(?) AND id != ?',
          [code.trim(), campusId]
        );
        if (dupCode.length > 0) {
          return res.status(409).json({ success: false, message: 'A campus with this code already exists' });
        }
        fields.push('code = ?');
        values.push(code.trim().toUpperCase());
      } else {
        fields.push('code = NULL');
      }
    }

    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description && description.trim() ? description.trim() : null);
    }

    if (collegeIds !== undefined) {
      const ids = Array.isArray(collegeIds) ? collegeIds : [];
      if (ids.length > 0) {
        const conflict = await _findCollegeConflicts(ids, campusId);
        if (conflict) {
          return res.status(409).json({ success: false, message: conflict });
        }
      }
      fields.push('college_ids = ?');
      values.push(JSON.stringify(ids));
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(campusId);
    await masterPool.query(`UPDATE campuses SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await masterPool.query('SELECT * FROM campuses WHERE id = ?', [campusId]);
    const c = updated[0];

    res.json({
      success: true,
      data: {
        id: c.id,
        name: c.name,
        code: c.code || null,
        description: c.description || null,
        collegeIds: c.college_ids
          ? (typeof c.college_ids === 'string' ? JSON.parse(c.college_ids) : c.college_ids)
          : [],
        isActive: c.is_active === 1 || c.is_active === true,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      },
      message: 'Campus updated successfully',
    });
  } catch (error) {
    console.error('updateCampus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update campus' });
  }
};

/**
 * DELETE /api/campuses/:id
 * Delete a campus (hard delete — colleges are NOT deleted, just unlinked)
 */
exports.deleteCampus = async (req, res) => {
  try {
    const campusId = parseInt(req.params.id, 10);
    if (!campusId || Number.isNaN(campusId)) {
      return res.status(400).json({ success: false, message: 'Invalid campus ID' });
    }

    const [existing] = await masterPool.query('SELECT id FROM campuses WHERE id = ?', [campusId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Campus not found' });
    }

    await masterPool.query('DELETE FROM campuses WHERE id = ?', [campusId]);

    res.json({ success: true, message: 'Campus deleted successfully' });
  } catch (error) {
    console.error('deleteCampus error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete campus' });
  }
};

/**
 * Internal helper: check if any of the given college IDs are already assigned
 * to another campus (excluding the current campus being edited).
 * Returns an error message string, or null if no conflict.
 */
async function _findCollegeConflicts(collegeIds, excludeCampusId) {
  const [allCampuses] = await masterPool.query('SELECT id, name, college_ids FROM campuses');
  for (const campus of allCampuses) {
    if (excludeCampusId && campus.id === excludeCampusId) continue;
    const assigned = campus.college_ids
      ? (typeof campus.college_ids === 'string' ? JSON.parse(campus.college_ids) : campus.college_ids)
      : [];
    const conflict = collegeIds.find((id) => assigned.includes(id));
    if (conflict) {
      // Get the college name for the error message
      const [[col]] = await masterPool.query('SELECT name FROM colleges WHERE id = ?', [conflict]);
      const collegeName = col ? col.name : `College #${conflict}`;
      return `"${collegeName}" is already assigned to campus "${campus.name}". A college can only belong to one campus.`;
    }
  }
  return null;
}

const { masterPool } = require('../config/database');

/**
 * Serialize college row from database to API format
 */
const serializeCollegeRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code || null,
  address: row.address || null,
  isActive: row.is_active === 1 || row.is_active === true,
  metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
  header_image_url: row.header_image ? `/api/colleges/${row.id}/header-image` : null,
  footer_image_url: row.footer_image ? `/api/colleges/${row.id}/footer-image` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

/**
 * Fetch all colleges
 * @param {Object} options - Query options
 * @param {boolean} options.includeInactive - Include inactive colleges
 * @returns {Promise<Array>} Array of college objects
 */
const fetchColleges = async (options = {}) => {
  const { includeInactive = false } = options;

  try {
    const whereClause = includeInactive
      ? ''
      : 'WHERE is_active = 1';

    const [rows] = await masterPool.query(
      `SELECT * FROM colleges ${whereClause} ORDER BY name ASC`,
      []
    );

    return rows.map(serializeCollegeRow);
  } catch (error) {
    console.error('fetchColleges error:', error);
    throw error;
  }
};

/**
 * Fetch single college by ID
 * @param {number} collegeId - College ID
 * @returns {Promise<Object|null>} College object or null
 */
const fetchCollegeById = async (collegeId) => {
  if (!collegeId || Number.isNaN(Number(collegeId))) {
    return null;
  }

  try {
    const [rows] = await masterPool.query(
      'SELECT * FROM colleges WHERE id = ?',
      [collegeId]
    );

    if (rows.length === 0) {
      return null;
    }

    return serializeCollegeRow(rows[0]);
  } catch (error) {
    console.error('fetchCollegeById error:', error);
    throw error;
  }
};

/**
 * Validate that a college exists
 * @param {number} collegeId - College ID
 * @returns {Promise<boolean>} True if college exists
 */
const validateCollegeExists = async (collegeId) => {
  if (!collegeId || Number.isNaN(Number(collegeId))) {
    return false;
  }

  try {
    const [rows] = await masterPool.query(
      'SELECT id FROM colleges WHERE id = ? AND is_active = 1',
      [collegeId]
    );

    return rows.length > 0;
  } catch (error) {
    console.error('validateCollegeExists error:', error);
    return false;
  }
};

/**
 * Check if college name is unique
 * @param {string} name - College name
 * @param {number} excludeId - College ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if name is unique
 */
const isCollegeNameUnique = async (name, excludeId = null) => {
  try {
    let query = 'SELECT id FROM colleges WHERE LOWER(name) = LOWER(?)';
    const params = [name];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await masterPool.query(query, params);
    return rows.length === 0;
  } catch (error) {
    console.error('isCollegeNameUnique error:', error);
    return false;
  }
};

/**
 * Check if college code is unique
 * @param {string} code - College code
 * @param {number} excludeId - College ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if code is unique (or null/empty)
 */
const isCollegeCodeUnique = async (code, excludeId = null) => {
  if (!code || code.trim() === '') {
    return true; // Null/empty codes are always "unique"
  }

  try {
    let query = 'SELECT id FROM colleges WHERE code IS NOT NULL AND LOWER(code) = LOWER(?)';
    const params = [code];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await masterPool.query(query, params);
    return rows.length === 0;
  } catch (error) {
    console.error('isCollegeCodeUnique error:', error);
    return false;
  }
};

/**
 * Create a new college
 * @param {Object} collegeData - College data
 * @param {string} collegeData.name - College name (required)
 * @param {string} collegeData.code - College code (optional)
 * @param {string} collegeData.address - College address (optional)
 * @param {boolean} collegeData.isActive - Active status (default: true)
 * @param {Object} collegeData.metadata - Metadata JSON (optional)
 * @returns {Promise<Object>} Created college object
 */
const createCollege = async (collegeData) => {
  const { name, code = null, address = null, isActive = true, metadata = null } = collegeData;

  if (!name || !name.trim()) {
    throw new Error('College name is required');
  }

  if (!code || !code.trim()) {
    throw new Error('College code is required');
  }

  // Validate uniqueness
  const nameUnique = await isCollegeNameUnique(name);
  if (!nameUnique) {
    throw new Error('College with this name already exists');
  }

  const codeUnique = await isCollegeCodeUnique(code);
  if (!codeUnique) {
    throw new Error('College with this code already exists');
  }

  try {
    const [result] = await masterPool.query(
      `INSERT INTO colleges (name, code, address, is_active, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        code.trim(),
        address && address.trim() ? address.trim() : null,
        isActive ? 1 : 0,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    return await fetchCollegeById(result.insertId);
  } catch (error) {
    console.error('createCollege error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('unique_college_name')) {
        throw new Error('College with this name already exists');
      }
      if (error.message.includes('unique_college_code')) {
        throw new Error('College with this code already exists');
      }
    }
    throw error;
  }
};

/**
 * Update a college
 * @param {number} collegeId - College ID
 * @param {Object} updates - Update data
 * @returns {Promise<Object>} Updated college object with studentsUpdated count
 */
const updateCollege = async (collegeId, updates) => {
  if (!collegeId || Number.isNaN(Number(collegeId))) {
    throw new Error('Invalid college ID');
  }

  // Check if college exists
  const existing = await fetchCollegeById(collegeId);
  if (!existing) {
    throw new Error('College not found');
  }

  const oldCollegeName = existing.name;
  const updateFields = [];
  const updateValues = [];
  let newCollegeName = null;

  // Handle name update
  if (updates.name !== undefined) {
    if (!updates.name || !updates.name.trim()) {
      throw new Error('College name cannot be empty');
    }
    const nameUnique = await isCollegeNameUnique(updates.name, collegeId);
    if (!nameUnique) {
      throw new Error('College with this name already exists');
    }
    newCollegeName = updates.name.trim();
    updateFields.push('name = ?');
    updateValues.push(newCollegeName);
  }

  // Handle address update
  if (updates.address !== undefined) {
    updateFields.push('address = ?');
    updateValues.push(updates.address && updates.address.trim() ? updates.address.trim() : null);
  }

  // Handle code update
  if (updates.code !== undefined) {
    if (updates.code && updates.code.trim()) {
      const codeUnique = await isCollegeCodeUnique(updates.code, collegeId);
      if (!codeUnique) {
        throw new Error('College with this code already exists');
      }
      updateFields.push('code = ?');
      updateValues.push(updates.code.trim());
    } else {
      updateFields.push('code = NULL');
    }
  }

  // Handle isActive update
  if (updates.isActive !== undefined) {
    updateFields.push('is_active = ?');
    updateValues.push(updates.isActive ? 1 : 0);
  }

  // Handle metadata update
  if (updates.metadata !== undefined) {
    updateFields.push('metadata = ?');
    updateValues.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
  }

  if (updateFields.length === 0) {
    return { ...existing, studentsUpdated: 0 }; // No updates
  }

  updateValues.push(collegeId);

  try {
    // Update college
    await masterPool.query(
      `UPDATE colleges SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // If college name was changed, cascade update to students table
    let studentsUpdated = 0;
    if (newCollegeName && newCollegeName !== oldCollegeName) {
      const [updateResult] = await masterPool.query(
        `UPDATE students SET college = ?, updated_at = CURRENT_TIMESTAMP WHERE college = ?`,
        [newCollegeName, oldCollegeName]
      );
      studentsUpdated = updateResult.affectedRows || 0;
      console.log(`College rename cascade: Updated ${studentsUpdated} students from "${oldCollegeName}" to "${newCollegeName}"`);
    }

    const updatedCollege = await fetchCollegeById(collegeId);
    return { ...updatedCollege, studentsUpdated };
  } catch (error) {
    console.error('updateCollege error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('unique_college_name')) {
        throw new Error('College with this name already exists');
      }
      if (error.message.includes('unique_college_code')) {
        throw new Error('College with this code already exists');
      }
    }
    throw error;
  }
};

/**
 * Delete a college (soft delete by default)
 * @param {number} collegeId - College ID
 * @param {Object} options - Delete options
 * @param {boolean} options.hard - Hard delete (default: false)
 * @returns {Promise<boolean>} Success status
 */
const deleteCollege = async (collegeId, options = {}) => {
  const { hard = false, cascade = false } = options;

  if (!collegeId || Number.isNaN(Number(collegeId))) {
    throw new Error('Invalid college ID');
  }

  // Check if college exists
  const existing = await fetchCollegeById(collegeId);
  if (!existing) {
    throw new Error('College not found');
  }

  const connection = await masterPool.getConnection();

  try {
    await connection.beginTransaction();

    let deletedStudents = 0;
    let deletedBranches = 0;
    let deletedCourses = 0;

    if (cascade) {
      // Get college name for student deletion
      const collegeName = existing.name;

      // Get all courses for this college
      const [courses] = await connection.query(
        'SELECT id, name FROM courses WHERE college_id = ?',
        [collegeId]
      );

      deletedCourses = courses.length;

      // For each course, delete branches and students
      for (const course of courses) {
        // Get all branches for this course
        const [branches] = await connection.query(
          'SELECT id, name FROM course_branches WHERE course_id = ?',
          [course.id]
        );

        deletedBranches += branches.length;

        // Delete students for each branch
        for (const branch of branches) {
          const [studentResult] = await connection.query(
            'DELETE FROM students WHERE course = ? AND branch = ?',
            [course.name, branch.name]
          );
          deletedStudents += studentResult.affectedRows;
        }

        // Delete branches
        await connection.query(
          'DELETE FROM course_branches WHERE course_id = ?',
          [course.id]
        );

        // Delete students by course (in case branch matching didn't catch all)
        const [courseStudentResult] = await connection.query(
          'DELETE FROM students WHERE course = ? AND college = ?',
          [course.name, collegeName]
        );
        deletedStudents += courseStudentResult.affectedRows;
      }

      // Delete all courses for this college
      await connection.query(
        'DELETE FROM courses WHERE college_id = ?',
        [collegeId]
      );

      // Delete all students by college name
      const [collegeStudentResult] = await connection.query(
        'DELETE FROM students WHERE college = ?',
        [collegeName]
      );
      deletedStudents += collegeStudentResult.affectedRows;
    } else {
      // Non-cascade: Check if college has courses
      const [courseRows] = await connection.query(
        'SELECT COUNT(*) as count FROM courses WHERE college_id = ?',
        [collegeId]
      );

      if (courseRows[0].count > 0) {
        await connection.rollback();
        throw new Error('Cannot delete college: it still has courses assigned. Please reassign or delete courses first.');
      }
    }

    // Delete the college
    if (hard || cascade) {
      await connection.query('DELETE FROM colleges WHERE id = ?', [collegeId]);
    } else {
      await connection.query('UPDATE colleges SET is_active = 0 WHERE id = ?', [collegeId]);
    }

    await connection.commit();

    return {
      success: true,
      deletedStudents,
      deletedBranches,
      deletedCourses
    };
  } catch (error) {
    await connection.rollback();
    console.error('deleteCollege error:', error);
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Get all courses for a college
 * @param {number} collegeId - College ID
 * @param {Object} options - Query options
 * @param {boolean} options.includeInactive - Include inactive courses
 * @returns {Promise<Array>} Array of course objects
 */
const getCollegeCourses = async (collegeId, options = {}) => {
  const { includeInactive = false } = options;

  if (!collegeId || Number.isNaN(Number(collegeId))) {
    return [];
  }

  try {
    const whereClause = includeInactive
      ? 'WHERE college_id = ?'
      : 'WHERE college_id = ? AND is_active = 1';

    const [rows] = await masterPool.query(
      `SELECT * FROM courses ${whereClause} ORDER BY name ASC`,
      [collegeId]
    );

    // Format courses (similar to courseController)
    const { formatCourse } = require('../controllers/courseController');
    const courses = [];

    for (const courseRow of rows) {
      // Fetch branches for this course
      const [branchRows] = await masterPool.query(
        'SELECT * FROM course_branches WHERE course_id = ? ORDER BY name ASC',
        [courseRow.id]
      );

      courses.push(formatCourse(courseRow, branchRows));
    }

    return courses;
  } catch (error) {
    console.error('getCollegeCourses error:', error);
    throw error;
  }
};

module.exports = {
  fetchColleges,
  fetchCollegeById,
  validateCollegeExists,
  isCollegeNameUnique,
  isCollegeCodeUnique,
  createCollege,
  updateCollege,
  deleteCollege,
  getCollegeCourses
};


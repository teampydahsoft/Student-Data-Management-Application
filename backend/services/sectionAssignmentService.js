const { masterPool } = require('../config/database');

/**
 * Sort students for section assignment using each student's best available identifier:
 * PIN number when assigned, otherwise branch roll number.
 */
const PIN_THEN_ROLL_SORT_ORDER_SQL = `
  CASE
    WHEN (s.pin_no IS NOT NULL AND TRIM(s.pin_no) != '')
      OR (srn.roll_number IS NOT NULL AND TRIM(srn.roll_number) != '') THEN 0
    ELSE 1
  END ASC,
  CASE
    WHEN s.pin_no IS NOT NULL AND TRIM(s.pin_no) != '' AND s.pin_no REGEXP '^[0-9]+$' THEN 0
    WHEN srn.roll_number IS NOT NULL AND TRIM(srn.roll_number) != '' AND srn.roll_number REGEXP '^[0-9]+$' THEN 0
    ELSE 1
  END ASC,
  CASE
    WHEN s.pin_no IS NOT NULL AND TRIM(s.pin_no) != '' AND s.pin_no REGEXP '^[0-9]+$' THEN CAST(s.pin_no AS UNSIGNED)
    WHEN srn.roll_number IS NOT NULL AND TRIM(srn.roll_number) != '' AND srn.roll_number REGEXP '^[0-9]+$' THEN CAST(srn.roll_number AS UNSIGNED)
  END ASC,
  CASE
    WHEN s.pin_no IS NOT NULL AND TRIM(s.pin_no) != '' THEN s.pin_no
    ELSE srn.roll_number
  END ASC,
  s.admission_number ASC,
  s.id ASC`;

const parseMetadata = (metadata) => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
};

const buildSectionItems = (sectionsConfig) => {
  if (!sectionsConfig?.enabled || !Array.isArray(sectionsConfig.items)) {
    return [];
  }

  return sectionsConfig.items
    .filter((item) => item && item.name && String(item.name).trim())
    .map((item) => ({
      name: String(item.name).trim(),
      strength: Math.max(1, parseInt(item.strength, 10) || 0)
    }));
};

const normalizeBatch = (batch) => {
  if (batch === null || batch === undefined) return '';
  return String(batch).trim();
};

const getDistinctBatchesForBranch = async (courseName, branchName) => {
  const [rows] = await masterPool.query(
    `SELECT DISTINCT COALESCE(NULLIF(TRIM(batch), ''), '') AS batch
     FROM students
     WHERE course = ? AND branch = ?
     ORDER BY batch ASC`,
    [courseName, branchName]
  );
  return rows.map((row) => row.batch);
};

const upsertStudentSectionRecord = async (connection, {
  studentId,
  branchId,
  batch,
  sectionName,
  isManual = 0
}) => {
  await connection.query(
    `INSERT INTO student_sections (student_id, branch_id, batch, section_name, is_manual)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       batch = VALUES(batch),
       section_name = VALUES(section_name),
       is_manual = VALUES(is_manual),
       updated_at = CURRENT_TIMESTAMP`,
    [studentId, branchId, normalizeBatch(batch), sectionName, isManual ? 1 : 0]
  );
};

const syncStudentSectionFromData = async ({
  studentId,
  courseName,
  branchName,
  batch,
  sectionName
}) => {
  if (!studentId || !courseName || !branchName || !sectionName) {
    return;
  }

  const [branchRows] = await masterPool.query(
    `SELECT cb.id
     FROM course_branches cb
     JOIN courses c ON cb.course_id = c.id
     WHERE c.name = ? AND cb.name = ? AND c.is_active = 1 AND cb.is_active = 1
     LIMIT 1`,
    [courseName, branchName]
  );

  if (branchRows.length === 0) {
    return;
  }

  await masterPool.query(
    `INSERT INTO student_sections (student_id, branch_id, batch, section_name, is_manual)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       batch = VALUES(batch),
       section_name = VALUES(section_name),
       is_manual = 1,
       updated_at = CURRENT_TIMESTAMP`,
    [studentId, branchRows[0].id, normalizeBatch(batch), String(sectionName).trim()]
  );

  await masterPool.query(
    `UPDATE students
     SET section = ?,
         student_data = JSON_SET(
           COALESCE(student_data, '{}'),
           '$.section', ?,
           '$.Section', ?
         ),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [String(sectionName).trim(), String(sectionName).trim(), String(sectionName).trim(), studentId]
  );
};

/**
 * Assign students sequentially into sections within a single batch.
 * Example for batch 2025: students 1-80 → A, 81-160 → B, etc.
 */
const assignSectionsToStudents = async ({
  courseName,
  branchName,
  branchId,
  metadata,
  batch = null
}) => {
  const sectionsConfig = parseMetadata(metadata).sections || {};
  const sectionItems = buildSectionItems(sectionsConfig);

  if (sectionItems.length === 0) {
    return { assignedCount: 0, sectionSummary: [], skipped: true };
  }

  const normalizedBatch = normalizeBatch(batch);

  let query = `
    SELECT s.id, s.batch
    FROM students s
    LEFT JOIN student_roll_numbers srn ON srn.student_id = s.id
    LEFT JOIN student_sections ss_manual ON ss_manual.student_id = s.id AND ss_manual.is_manual = 1
    WHERE s.course = ? AND s.branch = ? AND ss_manual.id IS NULL`;
  const params = [courseName, branchName];

  if (batch !== null && batch !== undefined) {
    if (normalizedBatch === '') {
      query += ` AND (s.batch IS NULL OR TRIM(s.batch) = '')`;
    } else {
      query += ' AND s.batch = ?';
      params.push(normalizedBatch);
    }
  }

  query += ` ORDER BY ${PIN_THEN_ROLL_SORT_ORDER_SQL}`;

  const [students] = await masterPool.query(query, params);

  if (students.length === 0) {
    return {
      assignedCount: 0,
      sectionSummary: [],
      sortOrder: 'pin_then_roll',
      batch: normalizedBatch || null
    };
  }

  const assignments = [];
  let studentIndex = 0;

  for (const section of sectionItems) {
    const countForSection = Math.min(section.strength, students.length - studentIndex);
    for (let i = 0; i < countForSection; i += 1) {
      assignments.push({
        studentId: students[studentIndex].id,
        studentBatch: students[studentIndex].batch,
        sectionName: section.name
      });
      studentIndex += 1;
    }
    if (studentIndex >= students.length) {
      break;
    }
  }

  if (studentIndex < students.length) {
    const lastSectionName = sectionItems[sectionItems.length - 1].name;
    while (studentIndex < students.length) {
      assignments.push({
        studentId: students[studentIndex].id,
        studentBatch: students[studentIndex].batch,
        sectionName: lastSectionName
      });
      studentIndex += 1;
    }
  }

  const connection = await masterPool.getConnection();
  try {
    await connection.beginTransaction();

    for (const assignment of assignments) {
      await connection.query(
        `UPDATE students
         SET section = ?,
             student_data = JSON_SET(
           IFNULL(student_data, '{}'),
           '$.section', ?,
           '$.Section', ?
         ),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignment.sectionName, assignment.sectionName, assignment.sectionName, assignment.studentId]
      );

      if (branchId) {
        await upsertStudentSectionRecord(connection, {
          studentId: assignment.studentId,
          branchId,
          batch: assignment.studentBatch,
          sectionName: assignment.sectionName,
          isManual: 0
        });
      }
    }

    await connection.commit();
    connection.release();
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }

  const sectionSummary = sectionItems.map((section, index) => {
    const start = sectionItems
      .slice(0, index)
      .reduce((sum, item) => sum + item.strength, 0) + 1;
    const assigned = assignments.filter((a) => a.sectionName === section.name).length;
    const end = start + assigned - 1;

    return {
      name: section.name,
      strength: section.strength,
      assigned,
      rangeStart: assigned > 0 ? start : null,
      rangeEnd: assigned > 0 ? end : null
    };
  });

  return {
    assignedCount: assignments.length,
    sortOrder: 'pin_then_roll',
    batch: normalizedBatch || null,
    sectionSummary
  };
};

const assignSectionsForBranchId = async (branchId, { batch = null } = {}) => {
  const [branchRows] = await masterPool.query(
    `SELECT cb.*, c.name AS course_name
     FROM course_branches cb
     JOIN courses c ON cb.course_id = c.id
     WHERE cb.id = ?
     LIMIT 1`,
    [branchId]
  );

  if (branchRows.length === 0) {
    return { assignedCount: 0, sectionSummary: [], skipped: true };
  }

  const branch = branchRows[0];
  const baseArgs = {
    courseName: branch.course_name,
    branchName: branch.name,
    branchId: branch.id,
    metadata: branch.metadata
  };

  if (batch !== null && batch !== undefined) {
    const result = await assignSectionsToStudents({
      ...baseArgs,
      batch
    });
    return {
      ...result,
      scope: 'batch',
      batchSummaries: [{
        batch: normalizeBatch(batch) || null,
        assignedCount: result.assignedCount,
        sectionSummary: result.sectionSummary
      }]
    };
  }

  const batches = await getDistinctBatchesForBranch(branch.course_name, branch.name);
  if (batches.length === 0) {
    return assignSectionsToStudents({ ...baseArgs, batch: null });
  }

  const batchSummaries = [];
  let assignedCount = 0;

  for (const batchLabel of batches) {
    const result = await assignSectionsToStudents({
      ...baseArgs,
      batch: batchLabel
    });
    assignedCount += result.assignedCount;
    batchSummaries.push({
      batch: batchLabel || null,
      assignedCount: result.assignedCount,
      sectionSummary: result.sectionSummary
    });
  }

  return {
    assignedCount,
    sortOrder: 'pin_then_roll',
    scope: 'all_batches',
    batchSummaries,
    sectionSummary: batchSummaries.flatMap((entry) =>
      (entry.sectionSummary || []).map((section) => ({
        ...section,
        batch: entry.batch
      }))
    )
  };
};

/** Reassign sections for one batch within a branch (each batch has its own A/B/C/D split). */
const reassignSectionsForStudentBranch = async (courseName, branchName, batch = null) => {
  if (!courseName || !branchName) {
    return { assignedCount: 0, sectionSummary: [], skipped: true };
  }

  const [branchRows] = await masterPool.query(
    `SELECT cb.id
     FROM course_branches cb
     JOIN courses c ON cb.course_id = c.id
     WHERE c.name = ? AND cb.name = ?
     LIMIT 1`,
    [courseName, branchName]
  );

  if (branchRows.length === 0) {
    return { assignedCount: 0, sectionSummary: [], skipped: true };
  }

  return assignSectionsForBranchId(branchRows[0].id, { batch });
};

const clearStudentSection = async (studentId) => {
  if (!studentId) return;

  await masterPool.query('DELETE FROM student_sections WHERE student_id = ?', [studentId]);
  await masterPool.query(
    `UPDATE students
     SET section = NULL,
         student_data = JSON_REMOVE(
       JSON_REMOVE(COALESCE(student_data, '{}'), '$.section'),
       '$.Section'
     ),
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [studentId]
  );
};

const getBranchIdForCourseBranch = async (courseName, branchName) => {
  const [branchRows] = await masterPool.query(
    `SELECT cb.id
     FROM course_branches cb
     JOIN courses c ON cb.course_id = c.id
     WHERE c.name = ? AND cb.name = ? AND c.is_active = 1 AND cb.is_active = 1
     LIMIT 1`,
    [courseName, branchName]
  );
  return branchRows.length > 0 ? branchRows[0].id : null;
};

/** Persist section to students.section, student_data JSON, and student_sections (manual partition save). */
const applyStudentSectionValue = async ({
  studentId,
  courseName,
  branchName,
  batch,
  sectionName
}) => {
  if (!studentId || !courseName || !branchName) {
    return;
  }

  const branchId = await getBranchIdForCourseBranch(courseName, branchName);
  if (!branchId) {
    return;
  }

  const normalized =
    sectionName === null || sectionName === undefined
      ? ''
      : String(sectionName).trim();

  if (normalized) {
    await masterPool.query(
      `UPDATE students
       SET section = ?,
           student_data = JSON_SET(
         COALESCE(student_data, '{}'),
         '$.section', ?,
         '$.Section', ?
       ),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalized, normalized, normalized, studentId]
    );
  } else {
    await masterPool.query(
      `UPDATE students
       SET section = NULL,
           student_data = JSON_REMOVE(
         JSON_REMOVE(COALESCE(student_data, '{}'), '$.section'),
         '$.Section'
       ),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [studentId]
    );
  }

  await masterPool.query(
    `INSERT INTO student_sections (student_id, branch_id, batch, section_name, is_manual)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id),
       batch = VALUES(batch),
       section_name = VALUES(section_name),
       is_manual = 1,
       updated_at = CURRENT_TIMESTAMP`,
    [studentId, branchId, normalizeBatch(batch), normalized]
  );
};

module.exports = {
  assignSectionsToStudents,
  assignSectionsForBranchId,
  reassignSectionsForStudentBranch,
  syncStudentSectionFromData,
  clearStudentSection,
  applyStudentSectionValue,
  getDistinctBatchesForBranch
};

const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = ['eligible', 'pending', 'rejected'];

const normalizeEligible = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ELIGIBLE.includes(normalized) ? normalized : null;
};

const upsertScholarshipEligible = async (pool, studentId, studentYear, eligible) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const normalized = normalizeEligible(eligible);

  const [rows] = await pool.query(
    'SELECT id FROM student_scholarship WHERE student_id = ? AND student_year = ? LIMIT 1',
    [studentId, year]
  );

  if (rows.length > 0) {
    await pool.query(
      'UPDATE student_scholarship SET eligible = ?, updated_at = NOW() WHERE student_id = ? AND student_year = ?',
      [normalized, studentId, year]
    );
    return;
  }

  if (normalized) {
    await pool.query(
      `INSERT INTO student_scholarship
       (student_id, student_year, eligible, sanctioned_amount, released_amount)
       VALUES (?, ?, ?, 0, 0)`,
      [studentId, year, normalized]
    );
  }
};

const syncScholarStatusColumn = async (pool, studentId, eligible) => {
  const normalized = normalizeEligible(eligible);
  await pool.query('UPDATE students SET scholar_status = ? WHERE id = ?', [normalized, studentId]);
};

const getScholarshipEligibleForYear = async (pool, studentId, studentYear) => {
  const year = Math.max(1, Number(studentYear) || 1);
  const [rows] = await pool.query(
    `SELECT eligible
     FROM student_scholarship
     WHERE student_id = ? AND student_year = ?
       AND eligible IS NOT NULL AND TRIM(eligible) != ''
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [studentId, year]
  );
  return normalizeEligible(rows[0]?.eligible);
};

const isScholarshipCompleteForRegistration = (eligible) => (
  VALID_ELIGIBLE.includes(String(eligible || '').trim().toLowerCase())
);

const isReleaseRow = (row) => (
  Number(row.released_amount) > 0
  || row.from_date
  || row.to_date
  || (row.proceeding && String(row.proceeding).trim())
);

const resolveHistoryActor = (user) => {
  if (!user?.id) return { adminId: null, rbacId: null };
  const adminRoles = new Set(['admin', 'superadmin', 'super_admin']);
  if (adminRoles.has(String(user.role || '').toLowerCase())) {
    return { adminId: user.id, rbacId: null };
  }
  return { adminId: null, rbacId: user.id };
};

const buildYearSnapshotFromRows = (rows) => {
  let applicationId = '';
  let eligible = '';
  let sanctionedAmount = 0;
  const releases = [];

  for (const row of rows) {
    if (!applicationId && row.application_id) applicationId = row.application_id;
    if (row.eligible) eligible = row.eligible;
    if (!sanctionedAmount && row.sanctioned_amount) {
      sanctionedAmount = Number(row.sanctioned_amount) || 0;
    }
    if (isReleaseRow(row)) {
      releases.push({
        from_date: row.from_date || null,
        to_date: row.to_date || null,
        proceeding: row.proceeding || '',
        released_amount: Number(row.released_amount) || 0
      });
    }
  }

  return {
    application_id: applicationId || null,
    eligible: eligible || null,
    sanctioned_amount: sanctionedAmount,
    released_amount: releases.reduce((sum, row) => sum + row.released_amount, 0),
    releases
  };
};

const archiveScholarshipYear = async (connection, student, studentYear, actor = null) => {
  const [rows] = await connection.query(
    `SELECT application_id, eligible, sanctioned_amount, released_amount,
            DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
            DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
            proceeding
     FROM student_scholarship
     WHERE student_id = ? AND student_year = ?`,
    [student.id, studentYear]
  );
  if (rows.length === 0) return false;

  const snapshot = buildYearSnapshotFromRows(rows);
  let notes = JSON.stringify(snapshot);
  if (notes.length > 255) {
    notes = JSON.stringify({
      application_id: snapshot.application_id,
      eligible: snapshot.eligible,
      sanctioned_amount: snapshot.sanctioned_amount,
      released_amount: snapshot.released_amount,
      release_count: snapshot.releases.length
    }).slice(0, 255);
  }

  const { adminId, rbacId } = actor || {};

  await connection.query(
    `INSERT INTO student_scholarship_history
     (student_id, admission_number, scholar_status, academic_year, academic_semester,
      source, notes, recorded_by_admin_id, recorded_by_rbac_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      student.id,
      student.admission_number,
      snapshot.eligible,
      studentYear,
      student.current_semester || null,
      'scholarship_overwrite',
      notes,
      adminId,
      rbacId
    ]
  );
  return true;
};

const REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY = '—';

const SCHOLARSHIP_YEAR_MATCH_SQL = 'ss.student_year = GREATEST(1, IFNULL(students.current_year, 1))';

const scholarshipHasCurrentYearStatusSql = `EXISTS (
  SELECT 1 FROM student_scholarship ss
  WHERE ss.student_id = students.id
    AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
    AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
    AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'pending', 'rejected')
)`;

const getScholarshipFilterClause = (filter) => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (normalized === 'pending') {
    return ` AND NOT (${scholarshipHasCurrentYearStatusSql})`;
  }
  if (normalized === 'eligible') {
    return ` AND EXISTS (
      SELECT 1 FROM student_scholarship ss
      WHERE ss.student_id = students.id
        AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
        AND LOWER(TRIM(ss.eligible)) = 'eligible'
    )`;
  }
  if (normalized === 'not_eligible') {
    return ` AND EXISTS (
      SELECT 1 FROM student_scholarship ss
      WHERE ss.student_id = students.id
        AND ${SCHOLARSHIP_YEAR_MATCH_SQL}
        AND LOWER(TRIM(ss.eligible)) = 'rejected'
    )`;
  }
  return '';
};

const scholarshipAssignedSumSql = `SUM(CASE WHEN ${scholarshipHasCurrentYearStatusSql} THEN 1 ELSE 0 END)`;
const scholarshipPendingSumSql = `SUM(CASE WHEN NOT (${scholarshipHasCurrentYearStatusSql}) THEN 1 ELSE 0 END)`;

const resolveRegistrationScholarshipStage = (eligible) => {
  const normalized = normalizeEligible(eligible);
  if (!normalized) {
    return {
      display: REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY,
      status: 'pending',
      completed: false
    };
  }
  return {
    display: normalized,
    status: 'completed',
    completed: true
  };
};

const isScholarshipDisplayUnassigned = (display) => (
  !display
  || display === REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY
  || String(display).trim().toLowerCase() === 'pending'
);

const buildCurrentYearScholarshipMap = async (pool, students) => {
  const map = new Map();
  if (!students?.length) return map;

  const studentIds = students.map((student) => student.id);
  const [rows] = await pool.query(
    `SELECT ss.student_id, ss.eligible
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE ss.student_id IN (?)
       AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
       AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
     ORDER BY ss.student_id ASC, ss.updated_at DESC, ss.id DESC`,
    [studentIds]
  );

  for (const row of rows) {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, normalizeEligible(row.eligible));
    }
  }
  return map;
};

module.exports = {
  VALID_ELIGIBLE,
  REGISTRATION_SCHOLARSHIP_EMPTY_DISPLAY,
  normalizeEligible,
  upsertScholarshipEligible,
  syncScholarStatusColumn,
  getScholarshipEligibleForYear,
  isScholarshipCompleteForRegistration,
  archiveScholarshipYear,
  resolveHistoryActor,
  buildYearSnapshotFromRows,
  scholarshipHasCurrentYearStatusSql,
  getScholarshipFilterClause,
  scholarshipAssignedSumSql,
  scholarshipPendingSumSql,
  resolveRegistrationScholarshipStage,
  isScholarshipDisplayUnassigned,
  buildCurrentYearScholarshipMap
};

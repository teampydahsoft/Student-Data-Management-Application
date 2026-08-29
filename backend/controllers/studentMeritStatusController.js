const { masterPool } = require('../config/database');
const { buildAcademicYearContext } = require('../services/studentScholarshipSync');
const { resolveStudentProgramYears } = require('../utils/studentProgramYears');

const VALID_MERIT_STATUSES = new Set(['yes', 'no']);
const MAX_REMARKS_LENGTH = 1000;

let tableEnsured = false;

const ensureMeritStatusTable = async () => {
  if (tableEnsured) return;

  await masterPool.query(`
    CREATE TABLE IF NOT EXISTS student_merit_status (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      student_year INT NOT NULL,
      merit_status ENUM('yes', 'no') DEFAULT NULL,
      remarks TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_student_year (student_id, student_year),
      INDEX idx_student_id (student_id),
      CONSTRAINT fk_merit_status_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Existing deployments created the table without remarks — add it if missing
  const [columns] = await masterPool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_merit_status'
       AND COLUMN_NAME = 'remarks'`
  );
  if (!(columns[0]?.count > 0)) {
    await masterPool.query(
      'ALTER TABLE student_merit_status ADD COLUMN remarks TEXT NULL AFTER merit_status'
    );
  }

  tableEnsured = true;
};

const normalizeMeritStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return '';
  if (normalized === 'y' || normalized === 'true' || normalized === '1') return 'yes';
  if (normalized === 'n' || normalized === 'false' || normalized === '0') return 'no';
  return VALID_MERIT_STATUSES.has(normalized) ? normalized : '';
};

const normalizeRemarks = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.slice(0, MAX_REMARKS_LENGTH);
};

const getStudentByAdmissionNumber = async (admissionNumber) => {
  const [rows] = await masterPool.query(
    `SELECT id, admission_number, student_name, course, branch, batch,
            current_year, current_semester, stud_type
     FROM students
     WHERE admission_number = ?
     LIMIT 1`,
    [admissionNumber]
  );
  return rows[0] || null;
};

const fetchMeritStatusRows = async (studentId) => {
  const [rows] = await masterPool.query(
    `SELECT student_year, merit_status, remarks
     FROM student_merit_status
     WHERE student_id = ?
     ORDER BY student_year ASC`,
    [studentId]
  );
  return rows;
};

const buildMeritStatusPayload = async (student) => {
  const programYears = await resolveStudentProgramYears(masterPool, student);
  const storedRows = await fetchMeritStatusRows(student.id);
  const rowByYear = storedRows.reduce((acc, row) => {
    acc[row.student_year] = {
      merit_status: normalizeMeritStatus(row.merit_status),
      remarks: normalizeRemarks(row.remarks)
    };
    return acc;
  }, {});

  const academicContext = buildAcademicYearContext(student.batch, programYears.totalYears);
  const maxAccessibleYear = programYears.currentYear;

  const years = programYears.years.map((entry) => {
    const stored = rowByYear[entry.student_year] || {};
    return {
      ...entry,
      merit_status: stored.merit_status || '',
      remarks: stored.remarks || '',
      academic_year_label: academicContext.labels?.[entry.student_year] || '',
      editable: entry.student_year <= maxAccessibleYear
    };
  });

  return {
    student: {
      id: student.id,
      admission_number: student.admission_number,
      student_name: student.student_name,
      current_year: student.current_year,
      current_semester: student.current_semester,
      course: student.course,
      branch: student.branch,
      batch: student.batch,
      stud_type: student.stud_type || ''
    },
    totalYears: programYears.totalYears,
    startYear: programYears.startYear,
    currentYear: programYears.currentYear,
    maxAccessibleYear,
    academicStructure: programYears.academicStructure,
    branchMetadata: programYears.branchMetadata,
    partialBranch: programYears.partialBranch,
    firstAcademicYear: academicContext.firstAcademicYear,
    academicYearLabels: academicContext.labels,
    years
  };
};

const buildCurrentMeritStatusMap = async (students = []) => {
  const studentIds = students.map((student) => Number(student.id)).filter(Boolean);
  if (!studentIds.length) return new Map();

  await ensureMeritStatusTable();

  const [rows] = await masterPool.query(
    `SELECT ms.student_id, ms.merit_status
     FROM student_merit_status ms
     INNER JOIN students s ON s.id = ms.student_id
     WHERE ms.student_id IN (?)
       AND ms.student_year = COALESCE(s.current_year, 1)`,
    [studentIds]
  );

  return new Map(
    rows.map((row) => [Number(row.student_id), normalizeMeritStatus(row.merit_status)])
  );
};

exports.getMeritStatus = async (req, res) => {
  try {
    await ensureMeritStatusTable();

    const { admission_number: admissionNumber } = req.params;
    const student = await getStudentByAdmissionNumber(admissionNumber);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const data = await buildMeritStatusPayload(student);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get merit status error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch merit status' });
  }
};

exports.buildCurrentMeritStatusMap = buildCurrentMeritStatusMap;

/** Filter students by current-year merit status (yes / no / unset). */
const getMeritStatusFilterClause = (filterValue, studentAlias = 's') => {
  const normalized = String(filterValue || '').trim().toLowerCase();
  if (!normalized) return { clause: '', params: [] };

  if (normalized === '__unset__' || normalized === 'unset' || normalized === 'not_set') {
    return {
      clause: ` AND NOT EXISTS (
        SELECT 1 FROM student_merit_status ms
        WHERE ms.student_id = ${studentAlias}.id
          AND ms.student_year = COALESCE(${studentAlias}.current_year, 1)
          AND ms.merit_status IS NOT NULL
      )`,
      params: []
    };
  }

  if (normalized === 'yes' || normalized === 'no') {
    return {
      clause: ` AND EXISTS (
        SELECT 1 FROM student_merit_status ms
        WHERE ms.student_id = ${studentAlias}.id
          AND ms.student_year = COALESCE(${studentAlias}.current_year, 1)
          AND ms.merit_status = ?
      )`,
      params: [normalized]
    };
  }

  return { clause: '', params: [] };
};

exports.getMeritStatusFilterClause = getMeritStatusFilterClause;
exports.ensureMeritStatusTable = ensureMeritStatusTable;

exports.saveMeritStatus = async (req, res) => {
  const connection = await masterPool.getConnection();

  try {
    await ensureMeritStatusTable();

    const { admission_number: admissionNumber } = req.params;
    const { years } = req.body || {};

    if (!Array.isArray(years)) {
      return res.status(400).json({ success: false, message: 'years array is required' });
    }

    const student = await getStudentByAdmissionNumber(admissionNumber);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const programYears = await resolveStudentProgramYears(masterPool, student);
    const allowedYears = new Set(programYears.years.map((entry) => entry.student_year));
    const maxAccessibleYear = programYears.currentYear;

    await connection.beginTransaction();

    for (const entry of years) {
      const studentYear = parseInt(entry.student_year, 10);
      if (!studentYear || studentYear < 1) continue;
      if (!allowedYears.has(studentYear)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Year ${studentYear} is not configured for this student's course/branch`
        });
      }
      if (studentYear > maxAccessibleYear) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Merit status for future Year ${studentYear} cannot be updated yet`
        });
      }

      const meritStatus = normalizeMeritStatus(entry.merit_status);
      const remarks = normalizeRemarks(entry.remarks);

      // Remarks are optional. Clear the year row only when both status and remarks are empty.
      if (!meritStatus && !remarks) {
        await connection.query(
          'DELETE FROM student_merit_status WHERE student_id = ? AND student_year = ?',
          [student.id, studentYear]
        );
        continue;
      }

      await connection.query(
        `INSERT INTO student_merit_status (student_id, student_year, merit_status, remarks)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           merit_status = VALUES(merit_status),
           remarks = VALUES(remarks),
           updated_at = CURRENT_TIMESTAMP`,
        [student.id, studentYear, meritStatus || null, remarks || null]
      );
    }

    await connection.commit();

    try {
      const { studentsCache } = require('../services/cache');
      if (studentsCache && typeof studentsCache.clear === 'function') {
        studentsCache.clear();
      }
    } catch (_) {
      /* ignore cache clear failures */
    }

    const data = await buildMeritStatusPayload(student);
    res.json({ success: true, data, message: 'Merit status saved successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Save merit status error:', error);
    res.status(500).json({ success: false, message: 'Failed to save merit status' });
  } finally {
    connection.release();
  }
};

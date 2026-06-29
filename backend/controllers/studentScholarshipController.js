const { masterPool } = require('../config/database');
const { syncScholarStatusColumn, archiveScholarshipYear, resolveHistoryActor, buildYearSnapshotFromRows } = require('../services/studentScholarshipSync');

const DEFAULT_TOTAL_YEARS = 4;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatDbDate = (value) => {
  if (value == null || value === '') return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const normalizeDateForSave = (value) => {
  const formatted = formatDbDate(value);
  return formatted || null;
};

const resolveTotalYears = async (student) => {
  const currentYear = Math.max(1, toNumber(student.current_year) || 1);
  let configuredYears = 0;

  if (student.course) {
    const [courseRows] = await masterPool.query(
      `SELECT c.total_years, cb.total_years AS branch_total_years
       FROM courses c
       LEFT JOIN course_branches cb ON cb.course_id = c.id AND cb.name = ?
       WHERE c.name = ?
       LIMIT 1`,
      [student.branch || '', student.course]
    );

    if (courseRows.length > 0) {
      configuredYears = toNumber(courseRows[0].branch_total_years) || toNumber(courseRows[0].total_years);
    }
  }

  const totalYears = Math.max(DEFAULT_TOTAL_YEARS, configuredYears || DEFAULT_TOTAL_YEARS, currentYear);
  return Math.min(totalYears, 10);
};

const buildEmptyYear = (studentYear) => ({
  student_year: studentYear,
  application_id: '',
  eligible: '',
  sanctioned_amount: 0,
  released_amount: 0,
  releases: []
});

const mapReleaseRow = (row) => ({
  id: row.id,
  from_date: formatDbDate(row.from_date),
  to_date: formatDbDate(row.to_date),
  proceeding: row.proceeding || '',
  released_amount: toNumber(row.released_amount)
});

const isReleaseRow = (row) => (
  toNumber(row.released_amount) > 0
  || row.from_date
  || row.to_date
  || (row.proceeding && String(row.proceeding).trim())
);

const getStudentByAdmissionNumber = async (admissionNumber) => {
  const [rows] = await masterPool.query(
    `SELECT id, admission_number, student_name, course, branch, current_year, current_semester
     FROM students
     WHERE admission_number = ?
     LIMIT 1`,
    [admissionNumber]
  );
  return rows[0] || null;
};

const fetchScholarshipPayload = async (student) => {
  const totalYears = await resolveTotalYears(student);

  const [rows] = await masterPool.query(
    `SELECT id, student_year, application_id, eligible, sanctioned_amount,
            DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
            DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
            proceeding, released_amount
     FROM student_scholarship
     WHERE student_id = ?
     ORDER BY student_year ASC, id ASC`,
    [student.id]
  );

  const yearMap = {};

  for (const row of rows) {
    const year = row.student_year;
    if (!yearMap[year]) {
      yearMap[year] = {
        student_year: year,
        application_id: row.application_id || '',
        eligible: row.eligible || '',
        sanctioned_amount: toNumber(row.sanctioned_amount),
        released_amount: 0,
        releases: []
      };
    }

    const entry = yearMap[year];
    if (!entry.application_id && row.application_id) entry.application_id = row.application_id;
    if (row.eligible) entry.eligible = row.eligible;
    if (!entry.sanctioned_amount && row.sanctioned_amount) {
      entry.sanctioned_amount = toNumber(row.sanctioned_amount);
    }

    entry.released_amount += toNumber(row.released_amount);

    if (isReleaseRow(row)) {
      entry.releases.push(mapReleaseRow(row));
    }
  }

  const years = Array.from({ length: totalYears }, (_, index) => {
    const studentYear = index + 1;
    return yearMap[studentYear] || buildEmptyYear(studentYear);
  });

  const archivedHistory = await fetchArchivedHistory(student.id);

  return {
    student: {
      id: student.id,
      admission_number: student.admission_number,
      student_name: student.student_name,
      current_year: student.current_year,
      course: student.course,
      branch: student.branch
    },
    totalYears,
    currentYear: Math.max(1, toNumber(student.current_year) || 1),
    currentYearEligible: yearMap[Math.max(1, toNumber(student.current_year) || 1)]?.eligible || '',
    years,
    archivedHistory
  };
};

const hasYearSummaryData = (yearEntry) => (
  (yearEntry.application_id && String(yearEntry.application_id).trim())
  || (yearEntry.eligible && String(yearEntry.eligible).trim())
  || toNumber(yearEntry.sanctioned_amount) > 0
);

const hasReleaseData = (release) => (
  toNumber(release.released_amount) > 0
  || release.from_date
  || release.to_date
  || (release.proceeding && String(release.proceeding).trim())
);

const buildIncomingYearSnapshot = (yearEntry) => {
  const releases = (Array.isArray(yearEntry.releases) ? yearEntry.releases : [])
    .filter(hasReleaseData)
    .map((release) => ({
      from_date: formatDbDate(release.from_date) || null,
      to_date: formatDbDate(release.to_date) || null,
      proceeding: release.proceeding || '',
      released_amount: toNumber(release.released_amount)
    }));

  return {
    application_id: yearEntry.application_id || null,
    eligible: yearEntry.eligible || null,
    sanctioned_amount: toNumber(yearEntry.sanctioned_amount),
    released_amount: releases.reduce((sum, row) => sum + row.released_amount, 0),
    releases
  };
};

const snapshotsEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const parseHistoryNotes = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { summary: String(value) };
  }
};

const fetchArchivedHistory = async (studentId) => {
  const [rows] = await masterPool.query(
    `SELECT id, scholar_status, academic_year, academic_semester, source, notes, created_at
     FROM student_scholarship_history
     WHERE student_id = ?
     ORDER BY created_at DESC, id DESC`,
    [studentId]
  );

  return rows.map((row) => ({
    id: row.id,
    scholar_status: row.scholar_status || '',
    academic_year: row.academic_year,
    academic_semester: row.academic_semester,
    source: row.source || '',
    archived_at: row.created_at,
    snapshot: parseHistoryNotes(row.notes)
  }));
};

exports.getScholarshipHistory = async (req, res) => {
  try {
    const { admission_number: admissionNumber } = req.params;
    const student = await getStudentByAdmissionNumber(admissionNumber);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const data = await fetchScholarshipPayload(student);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get scholarship history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scholarship history' });
  }
};

exports.saveScholarshipHistory = async (req, res) => {
  const connection = await masterPool.getConnection();

  try {
    const { admission_number: admissionNumber } = req.params;
    const { years } = req.body || {};

    if (!Array.isArray(years)) {
      return res.status(400).json({ success: false, message: 'years array is required' });
    }

    const student = await getStudentByAdmissionNumber(admissionNumber);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await connection.beginTransaction();

    const historyActor = resolveHistoryActor(req.user);

    for (const yearEntry of years) {
      const studentYear = toNumber(yearEntry.student_year);
      if (!studentYear || studentYear < 1) continue;

      const releases = Array.isArray(yearEntry.releases) ? yearEntry.releases : [];
      const validReleases = releases.filter(hasReleaseData);
      const summaryData = {
        application_id: yearEntry.application_id || null,
        eligible: yearEntry.eligible || null,
        sanctioned_amount: toNumber(yearEntry.sanctioned_amount)
      };

      const [existingRows] = await connection.query(
        `SELECT application_id, eligible, sanctioned_amount, released_amount,
                DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
                DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
                proceeding
         FROM student_scholarship
         WHERE student_id = ? AND student_year = ?`,
        [student.id, studentYear]
      );

      const incomingSnapshot = buildIncomingYearSnapshot(yearEntry);
      const existingSnapshot = existingRows.length > 0
        ? buildYearSnapshotFromRows(existingRows)
        : null;

      if (existingSnapshot && !snapshotsEqual(existingSnapshot, incomingSnapshot)) {
        await archiveScholarshipYear(connection, student, studentYear, historyActor);
      }

      if (existingRows.length > 0 && snapshotsEqual(existingSnapshot, incomingSnapshot)) {
        continue;
      }

      await connection.query(
        'DELETE FROM student_scholarship WHERE student_id = ? AND student_year = ?',
        [student.id, studentYear]
      );

      if (validReleases.length > 0) {
        for (const release of validReleases) {
          await connection.query(
            `INSERT INTO student_scholarship
             (student_id, student_year, application_id, eligible, sanctioned_amount,
              from_date, to_date, proceeding, released_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              student.id,
              studentYear,
              summaryData.application_id,
              summaryData.eligible,
              summaryData.sanctioned_amount,
              normalizeDateForSave(release.from_date),
              normalizeDateForSave(release.to_date),
              release.proceeding || null,
              toNumber(release.released_amount)
            ]
          );
        }
      } else if (hasYearSummaryData(yearEntry)) {
        await connection.query(
          `INSERT INTO student_scholarship
           (student_id, student_year, application_id, eligible, sanctioned_amount, released_amount)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [
            student.id,
            studentYear,
            summaryData.application_id,
            summaryData.eligible,
            summaryData.sanctioned_amount
          ]
        );
      }
    }

    await connection.commit();

    const currentYear = Math.max(1, toNumber(student.current_year) || 1);
    const currentYearEntry = years.find((entry) => toNumber(entry.student_year) === currentYear);
    await syncScholarStatusColumn(masterPool, student.id, currentYearEntry?.eligible || '');

    const data = await fetchScholarshipPayload(student);
    res.json({ success: true, message: 'Scholarship history saved successfully', data });
  } catch (error) {
    await connection.rollback();
    console.error('Save scholarship history error:', error);
    res.status(500).json({ success: false, message: 'Failed to save scholarship history' });
  } finally {
    connection.release();
  }
};

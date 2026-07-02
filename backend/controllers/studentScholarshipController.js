const { masterPool } = require('../config/database');
const {
  syncScholarStatusColumn,
  archiveScholarshipYear,
  resolveHistoryActor,
  buildYearSnapshotFromRows,
  isScholarshipIneligibleQuota,
  syncIneligibleQuotaScholarshipForStudent,
  buildIneligibleQuotaYears,
  buildAcademicYearContext,
  enrichScholarshipYears,
  mapReleaseRowForApi,
  normalizeReleaseForSave,
  resolveTotalYears: resolveScholarshipTotalYears,
  resolveSemestersPerYear,
  buildDefaultSemesters,
  isReleaseRow,
  isSemesterSummaryRow
} = require('../services/studentScholarshipSync');
const {
  normalizeApplicationIdInput,
  normalizeScholarshipAmountInput,
  validateScholarshipYearsPayload,
  normalizeRtfReleasedDate,
  clampScholarshipAmount,
  checkApplicationIdAvailability
} = require('../utils/scholarshipValidation');

const DEFAULT_TOTAL_YEARS = 4;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatDbDate = (value) => normalizeRtfReleasedDate(value);

const normalizeDateForSave = (value) => {
  const formatted = formatDbDate(value);
  return formatted || null;
};

const resolveTotalYears = async (student) => resolveScholarshipTotalYears(masterPool, student);
const resolveSemestersPerYearForStudent = async (student) => resolveSemestersPerYear(masterPool, student);

const buildEmptyYear = (studentYear, semestersPerYear = 2) => ({
  student_year: studentYear,
  application_id: '',
  sanctioned_amount: 0,
  released_amount: 0,
  semesters: buildDefaultSemesters(semestersPerYear),
  releases: []
});

const buildYearEntryFromRows = (rows, semestersPerYear) => {
  let applicationId = '';
  let sanctionedAmount = 0;
  const semesterMap = {};
  let legacyEligible = '';
  const releases = [];

  for (const row of rows) {
    if (!applicationId && row.application_id) applicationId = row.application_id;
    if (!sanctionedAmount && row.sanctioned_amount) {
      sanctionedAmount = toNumber(row.sanctioned_amount);
    }

    if (isReleaseRow(row)) {
      releases.push(mapReleaseRowForApi(row));
    } else if (isSemesterSummaryRow(row)) {
      semesterMap[row.student_semester] = row.eligible || '';
    } else if (row.eligible) {
      legacyEligible = row.eligible;
    }
  }

  if (!Object.keys(semesterMap).length && legacyEligible) {
    semesterMap[1] = legacyEligible;
  }

  const semesters = buildDefaultSemesters(semestersPerYear).map((semester) => ({
    student_semester: semester.student_semester,
    eligible: semesterMap[semester.student_semester] || ''
  }));

  return {
    application_id: applicationId || '',
    eligible: semesters[0]?.eligible || legacyEligible || '',
    sanctioned_amount: sanctionedAmount,
    released_amount: releases.reduce((sum, row) => sum + toNumber(row.released_amount), 0),
    semesters,
    releases
  };
};

const getStudentByAdmissionNumber = async (admissionNumber) => {
  const [rows] = await masterPool.query(
    `SELECT id, admission_number, student_name, course, branch, batch, current_year, current_semester, stud_type
     FROM students
     WHERE admission_number = ?
     LIMIT 1`,
    [admissionNumber]
  );
  return rows[0] || null;
};

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

const buildScholarshipResponse = (student, totalYears, years, archivedHistory, extra = {}) => {
  const academicContext = buildAcademicYearContext(student.batch, totalYears);
  const enrichedYears = enrichScholarshipYears(student, years, totalYears);

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
      stud_type: student.stud_type
    },
    totalYears,
    semestersPerYear: extra.semestersPerYear ?? 2,
    currentYear: Math.max(1, toNumber(student.current_year) || 1),
    currentSemester: Math.max(1, toNumber(student.current_semester) || 1),
    firstAcademicYear: academicContext.firstAcademicYear,
    academicYearLabels: academicContext.labels,
    currentYearEligible: extra.currentYearEligible ?? '',
    years: enrichedYears,
    archivedHistory,
    scholarshipQuotaLocked: Boolean(extra.scholarshipQuotaLocked)
  };
};

const fetchScholarshipPayload = async (student) => {
  const quotaLocked = isScholarshipIneligibleQuota(student.stud_type);
  const totalYears = await resolveTotalYears(student);
  const semestersPerYear = await resolveSemestersPerYearForStudent(student);

  if (quotaLocked) {
    await syncIneligibleQuotaScholarshipForStudent(masterPool, student);

    const archivedHistory = await fetchArchivedHistory(student.id);

    return buildScholarshipResponse(
      student,
      totalYears,
      buildIneligibleQuotaYears(totalYears, semestersPerYear),
      archivedHistory,
      {
        currentYearEligible: 'rejected',
        scholarshipQuotaLocked: true,
        semestersPerYear
      }
    );
  }

  const [rows] = await masterPool.query(
    `SELECT id, student_year, student_semester, application_id, eligible, sanctioned_amount,
            DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
            DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
            proceeding, released_amount
     FROM student_scholarship
     WHERE student_id = ?
     ORDER BY student_year ASC, student_semester ASC, id ASC`,
    [student.id]
  );

  const yearMap = {};

  for (const row of rows) {
    const year = row.student_year;
    if (!yearMap[year]) {
      yearMap[year] = [];
    }
    yearMap[year].push(row);
  }

  const years = Array.from({ length: totalYears }, (_, index) => {
    const studentYear = index + 1;
    const yearRows = yearMap[studentYear] || [];
    if (!yearRows.length) {
      return buildEmptyYear(studentYear, semestersPerYear);
    }

    return {
      student_year: studentYear,
      ...buildYearEntryFromRows(yearRows, semestersPerYear)
    };
  });

  const archivedHistory = await fetchArchivedHistory(student.id);
  const currentYear = Math.max(1, toNumber(student.current_year) || 1);
  const currentSemester = Math.max(1, toNumber(student.current_semester) || 1);
  const currentYearData = years.find((entry) => entry.student_year === currentYear);
  const currentSemesterEligible = currentYearData?.semesters?.find(
    (semester) => semester.student_semester === currentSemester
  )?.eligible || currentYearData?.eligible || '';

  return buildScholarshipResponse(
    student,
    totalYears,
    years,
    archivedHistory,
    {
      currentYearEligible: currentSemesterEligible,
      scholarshipQuotaLocked: false,
      semestersPerYear
    }
  );
};

const hasYearSummaryData = (yearEntry) => {
  const semesters = Array.isArray(yearEntry.semesters) ? yearEntry.semesters : [];
  return (
    (yearEntry.application_id && String(yearEntry.application_id).trim())
    || toNumber(yearEntry.sanctioned_amount) > 0
    || semesters.some((semester) => semester.eligible && String(semester.eligible).trim())
    || (yearEntry.eligible && String(yearEntry.eligible).trim())
  );
};

const hasReleaseData = (release) => {
  const normalized = normalizeReleaseForSave(release);
  return (
    normalized.released_amount > 0
    || normalized.rtf_released_date
  );
};

const buildIncomingYearSnapshot = (yearEntry) => {
  const releases = (Array.isArray(yearEntry.releases) ? yearEntry.releases : [])
    .filter(hasReleaseData)
    .map((release) => {
      const normalized = normalizeReleaseForSave(release);
      return {
        from_date: normalized.rtf_released_date || null,
        rtf_released_date: normalized.rtf_released_date || null,
        released_amount: normalized.released_amount
      };
    });

  const semesters = (Array.isArray(yearEntry.semesters) ? yearEntry.semesters : [])
    .map((semester) => ({
      student_semester: Math.max(1, toNumber(semester.student_semester) || 1),
      eligible: semester.eligible || null
    }));

  return {
    application_id: yearEntry.application_id || null,
    sanctioned_amount: toNumber(yearEntry.sanctioned_amount),
    released_amount: releases.reduce((sum, row) => sum + row.released_amount, 0),
    semesters,
    releases
  };
};

const snapshotsEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

exports.checkApplicationId = async (req, res) => {
  try {
    const {
      application_id: applicationId,
      admission_number: admissionNumber,
      student_year: studentYear
    } = req.query;

    if (!admissionNumber) {
      return res.status(400).json({ success: false, message: 'admission_number is required' });
    }

    const student = await getStudentByAdmissionNumber(admissionNumber);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const parsedYear = toNumber(studentYear);
    const result = await checkApplicationIdAvailability(
      masterPool,
      applicationId,
      student.id,
      parsedYear
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Check application ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to check application number' });
  }
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

    if (isScholarshipIneligibleQuota(student.stud_type)) {
      return res.status(403).json({
        success: false,
        message: 'Scholarship data cannot be entered for Management Quota, Spot Admission, or Lateral Spot students. They are automatically marked as not eligible for all years.'
      });
    }

    const validation = await validateScholarshipYearsPayload(connection, student.id, years);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    await connection.beginTransaction();

    const historyActor = resolveHistoryActor(req.user);
    const semestersPerYear = await resolveSemestersPerYearForStudent(student);

    for (const yearEntry of years) {
      const studentYear = toNumber(yearEntry.student_year);
      if (!studentYear || studentYear < 1) continue;

      const releases = Array.isArray(yearEntry.releases) ? yearEntry.releases : [];
      const validReleases = releases.filter(hasReleaseData);
      const semesters = Array.isArray(yearEntry.semesters) && yearEntry.semesters.length
        ? yearEntry.semesters
        : buildDefaultSemesters(semestersPerYear);
      const summaryData = {
        application_id: normalizeApplicationIdInput(yearEntry.application_id) || null,
        sanctioned_amount: clampScholarshipAmount(normalizeScholarshipAmountInput(yearEntry.sanctioned_amount) || 0)
      };

      const [existingRows] = await connection.query(
        `SELECT application_id, eligible, sanctioned_amount, released_amount, student_semester,
                DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
                DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date,
                proceeding
         FROM student_scholarship
         WHERE student_id = ? AND student_year = ?`,
        [student.id, studentYear]
      );

      const incomingSnapshot = buildIncomingYearSnapshot(yearEntry);
      const existingSnapshot = existingRows.length > 0
        ? buildYearSnapshotFromRows(existingRows, semestersPerYear)
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

      const semesterRowsToSave = semesters.filter(
        (semester) => semester.eligible && String(semester.eligible).trim()
      );

      if (semesterRowsToSave.length > 0 || hasYearSummaryData(yearEntry)) {
        for (const semester of buildDefaultSemesters(semestersPerYear)) {
          const semesterEntry = semesters.find(
            (entry) => toNumber(entry.student_semester) === semester.student_semester
          ) || semester;
          const eligible = semesterEntry.eligible || null;
          const shouldSaveSemester = (eligible && String(eligible).trim())
            || (semester.student_semester === 1 && (
              summaryData.application_id
              || summaryData.sanctioned_amount > 0
            ));

          if (!shouldSaveSemester) continue;

          await connection.query(
            `INSERT INTO student_scholarship
             (student_id, student_year, student_semester, application_id, eligible, sanctioned_amount, released_amount)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [
              student.id,
              studentYear,
              semester.student_semester,
              semester.student_semester === 1 ? summaryData.application_id : null,
              eligible,
              semester.student_semester === 1 ? summaryData.sanctioned_amount : 0
            ]
          );
        }
      }

      if (validReleases.length > 0) {
        const primaryEligible = semesters.find((semester) => semester.eligible)?.eligible || null;
        for (const release of validReleases) {
          const normalizedRelease = normalizeReleaseForSave(release);
          await connection.query(
            `INSERT INTO student_scholarship
             (student_id, student_year, student_semester, application_id, eligible, sanctioned_amount,
              from_date, to_date, proceeding, released_amount)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [
              student.id,
              studentYear,
              summaryData.application_id,
              primaryEligible,
              summaryData.sanctioned_amount,
              normalizedRelease.rtf_released_date || null,
              null,
              null,
              normalizedRelease.released_amount
            ]
          );
        }
      }
    }

    await connection.commit();

    // Re-fetch the full payload from DB so scholar_status reflects the actual saved
    // semester-wise eligible value (same logic as the student view dialog uses).
    // This is more reliable than computing from the incoming payload because some
    // semester rows may not have been inserted (empty eligible = no row saved).
    const data = await fetchScholarshipPayload(student);
    const savedCurrentYearEligible = data.currentYearEligible || '';
    await syncScholarStatusColumn(masterPool, student.id, savedCurrentYearEligible);

    res.json({ success: true, message: 'Scholarship history saved successfully', data });
  } catch (error) {
    await connection.rollback();
    console.error('Save scholarship history error:', error);
    res.status(500).json({ success: false, message: 'Failed to save scholarship history' });
  } finally {
    connection.release();
  }
};

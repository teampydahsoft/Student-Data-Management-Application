const { masterPool } = require('../../config/database');
const xlsx = require('xlsx');
const { buildReportFilters } = require('./categoryReportController');
const {
  resolveTotalYears,
  buildYearSnapshotFromRows,
  resolveSemestersPerYear,
  allSemestersEligible
} = require('../../services/studentScholarshipSync');
const {
  calculateFeeDue,
  calculateRtfDue,
  calculateAdvanceAmount
} = require('../../utils/scholarshipValidation');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => {
  const num = toNumber(value);
  return Math.round(num * 100) / 100;
};

const extractBatchStartYear = (batch) => {
  if (!batch) return null;
  const text = String(batch).trim();
  const full = text.match(/^(\d{4})/);
  if (full) return Number(full[1]);
  const short = text.match(/^(\d{2})/);
  if (short) {
    const y = Number(short[1]);
    return y <= 50 ? 2000 + y : 1900 + y;
  }
  return null;
};

const formatAcademicYearLabelForExport = (batch, studentYear) => {
  const start = extractBatchStartYear(batch);
  const idx = Math.max(1, Number(studentYear) || 1);
  if (!start) return `Year ${idx}`;
  const from = start + idx - 1;
  return `${from}-${from + 1}`;
};

const getCasteAccountTypes = async () => {
  try {
    const [rows] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['rtf_amount_config']
    );
    if (!rows.length) return {};
    const config = JSON.parse(rows[0].value);
    return (config && typeof config.casteAccountTypes === 'object' && config.casteAccountTypes)
      ? config.casteAccountTypes
      : {};
  } catch (e) {
    return {};
  }
};

const courseYearsCache = new Map();

const getConfiguredYearsForCourse = async (course, branch) => {
  const key = `${course || ''}|${branch || ''}`;
  if (courseYearsCache.has(key)) return courseYearsCache.get(key);

  const years = await resolveTotalYears(masterPool, {
    course: course || null,
    branch: branch || null,
    current_year: 1
  });
  courseYearsCache.set(key, years);
  return years;
};

const getTotalYearsForStudent = async (student) => {
  const configuredYears = await getConfiguredYearsForCourse(student.course, student.branch);
  const currentYear = Math.max(1, toNumber(student.current_year) || 1);
  return Math.min(Math.max(configuredYears, currentYear), 10);
};

const buildYearAmountsFromRows = (yearRows, semestersPerYear, isCollege = false) => {
  const snapshot = buildYearSnapshotFromRows(yearRows, semestersPerYear);
  const semesters = snapshot.semesters || [];
  const rtfEligible = allSemestersEligible(semesters);
  const sanctioned = formatAmount(snapshot.sanctioned_amount);
  const released = formatAmount(snapshot.released_amount);
  const paid = formatAmount(snapshot.paid_amount);
  const manualPaid = rtfEligible && isCollege ? Math.max(0, paid - released) : paid;
  const feeDue = formatAmount(calculateFeeDue(sanctioned, paid));
  const rtfDue = rtfEligible ? formatAmount(calculateRtfDue(sanctioned, released)) : 0;
  const advance = rtfEligible && isCollege
    ? formatAmount(calculateAdvanceAmount(sanctioned, released, manualPaid, true))
    : 0;
  return {
    sanctioned_amount: sanctioned,
    released_amount: released,
    paid_amount: paid,
    pending_amount: feeDue,
    due_amount: rtfDue,
    fee_due_amount: feeDue,
    rtf_due_amount: rtfDue,
    advance_amount: advance
  };
};

const groupScholarshipRows = (rows) => {
  const byStudent = new Map();
  for (const row of rows) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, new Map());
    const byYear = byStudent.get(row.student_id);
    const year = row.student_year;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(row);
  }
  return byStudent;
};

const buildStudentYearEntries = async (student, yearRowMap, filterAcademicYear = null, isCollege = false) => {
  const totalYears = await getTotalYearsForStudent(student);
  const semestersPerYear = await resolveSemestersPerYear(masterPool, student);
  const years = [];

  const yearsToProcess = filterAcademicYear && filterAcademicYear > 0
    ? [filterAcademicYear]
    : Array.from({ length: totalYears }, (_, i) => i + 1);

  for (const studentYear of yearsToProcess) {
    const yearRows = yearRowMap?.get(studentYear) || [];
    if (yearRows.length) {
      years.push({
        student_year: studentYear,
        ...buildYearAmountsFromRows(yearRows, semestersPerYear, isCollege)
      });
    } else {
      years.push({
        student_year: studentYear,
        sanctioned_amount: 0,
        released_amount: 0,
        paid_amount: 0,
        pending_amount: 0,
        due_amount: 0
      });
    }
  }

  // When filtering to a single year, only that year is returned in each student's data
  const effectiveTotalYears = filterAcademicYear && filterAcademicYear > 0
    ? 1
    : totalYears;

  return { totalYears: effectiveTotalYears, years, displayYear: filterAcademicYear || null };
};

const buildScholarshipReportData = async (req) => {
  courseYearsCache.clear();

  // Optional filter: only include data for a specific student_year (within the program)
  const filterAcademicYear = req.query.filter_academic_year
    ? parseInt(req.query.filter_academic_year, 10)
    : null;
  const filterScholarshipStatus = (req.query.filter_scholarship_status || '').trim().toLowerCase();

  // When an academic year is selected, the scholarship status must be checked against
  // student_scholarship.eligible for that year — NOT students.scholar_status (which reflects
  // the current/overall status). Strip filter_scholarship_status from the query before
  // buildReportFilters so it doesn't pre-filter by the wrong column.
  let reqForFilters = req;
  if (filterAcademicYear && filterAcademicYear > 0 && filterScholarshipStatus) {
    reqForFilters = {
      ...req,
      query: { ...req.query, filter_scholarship_status: '' }
    };
  }

  const { baseQuery, params } = await buildReportFilters(reqForFilters);

  const studentQuery = `
    SELECT id, admission_number, pin_no, student_name, course, branch, batch, college, current_year, current_semester, stud_type, caste, scholar_status
    ${baseQuery}
    ORDER BY student_name ASC, admission_number ASC
  `;
  let [students] = await masterPool.query(studentQuery, params);

  if (!students.length) {
    return { students: [], totalYears: 0, data: [] };
  }

  // When academic year + scholarship status are BOTH set, filter students by their
  // eligible status in student_scholarship for that specific year — not scholar_status column.
  if (filterAcademicYear && filterAcademicYear > 0 && filterScholarshipStatus) {
    const studentIds = students.map((s) => s.id);

    // Fetch eligible values for all these students in the selected year
    const [yearEligibleRows] = await masterPool.query(
      `SELECT student_id, eligible
       FROM student_scholarship
       WHERE student_id IN (?)
         AND student_year = ?
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY student_id ASC, id ASC`,
      [studentIds, filterAcademicYear]
    );

    // Build a map: student_id → normalized eligible status for that year
    const yearStatusMap = new Map();
    for (const row of yearEligibleRows) {
      // Only set the first (primary) status per student for that year
      if (!yearStatusMap.has(row.student_id)) {
        yearStatusMap.set(row.student_id, String(row.eligible || '').trim().toLowerCase());
      }
    }

    // Filter students based on the year-specific status
    students = students.filter((student) => {
      const yearStatus = yearStatusMap.get(student.id) || '';
      if (filterScholarshipStatus === 'eligible') {
        return yearStatus.includes('eligible') && !yearStatus.includes('not');
      }
      if (filterScholarshipStatus === 'not_eligible') {
        return yearStatus.includes('not') && yearStatus.includes('eligible');
      }
      if (filterScholarshipStatus === 'rejected') {
        return yearStatus === 'rejected';
      }
      if (filterScholarshipStatus === 'not_applied') {
        return yearStatus === 'not_applied' || yearStatus === 'not applied';
      }
      if (filterScholarshipStatus === 'pending') {
        // Pending = no row for this year at all, or status is pending
        return !yearStatus || yearStatus === 'pending';
      }
      return true;
    });

    if (!students.length) {
      return { students: [], totalYears: 0, data: [] };
    }
  }

  const studentIds = students.map((student) => student.id);

  let scholarshipQuery = `SELECT student_id, student_year, student_semester, application_id, eligible, sanctioned_amount,
          from_date, released_amount, paid_amount
   FROM student_scholarship
   WHERE student_id IN (?)`;
  const scholarshipParams = [studentIds];

  if (filterAcademicYear && filterAcademicYear > 0) {
    scholarshipQuery += ' AND student_year = ?';
    scholarshipParams.push(filterAcademicYear);
  }

  scholarshipQuery += ' ORDER BY student_id ASC, student_year ASC, student_semester ASC, id ASC';

  const [scholarshipRows] = await masterPool.query(scholarshipQuery, scholarshipParams);

  const scholarshipByStudent = groupScholarshipRows(scholarshipRows);
  const casteAccountTypes = await getCasteAccountTypes();
  let maxTotalYears = 0;
  const data = [];

  for (const student of students) {
    const yearRowMap = scholarshipByStudent.get(student.id) || new Map();
    const isCollege = casteAccountTypes[String(student.caste || '').trim()] === 'college';
    const { totalYears, years } = await buildStudentYearEntries(
      student,
      yearRowMap,
      filterAcademicYear,
      isCollege
    );
    maxTotalYears = Math.max(maxTotalYears, totalYears);
    data.push({
      student_id: student.id,
      admission_number: student.admission_number,
      pin_no: student.pin_no || '',
      stud_type: student.stud_type || '',
      student_name: student.student_name,
      college: student.college,
      batch: student.batch,
      course: student.course,
      branch: student.branch || '',
      caste: student.caste || '',
      scholar_status: student.scholar_status || '',
      years
    });
  }

  return { students, totalYears: maxTotalYears, data, displayYear: filterAcademicYear || null };
};

const resolveReportYears = (totalYears, displayYear) => {
  if (displayYear && displayYear > 0) {
    return [displayYear];
  }
  return Array.from({ length: totalYears }, (_, i) => i + 1);
};

const buildExcelBuffer = (data, totalYears, filters, displayYear = null) => {
  const fixedCols = 6; // S.No, Student Name, PIN/Admission No, Branch, Quota, Caste
  const colsPerYear = 3;
  const row1 = ['S.No', 'Student Name', 'PIN / Admission No', 'Branch', 'Quota', 'Caste'];
  const row2 = ['', '', '', '', '', ''];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }
  ];

  const yearSubHeaders = ['Sanctioned', 'RTF Released', 'Due'];
  const reportYears = resolveReportYears(totalYears, displayYear);

  for (const year of reportYears) {
    const yearLabel = filters.batch
      ? formatAcademicYearLabelForExport(filters.batch, year)
      : `Year ${year}`;
    row1.push(yearLabel, ...Array(colsPerYear - 1).fill(''));
    row2.push(...yearSubHeaders);
    const yearIndex = reportYears.indexOf(year);
    const startCol = fixedCols + yearIndex * colsPerYear;
    merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + colsPerYear - 1 } });
  }

  const rows = [row1, row2];
  if (filters.college || filters.batch || filters.course || filters.branch) {
    rows.unshift([
      'Scholarship Report',
      filters.college ? `College: ${filters.college}` : '',
      filters.batch ? `Batch: ${filters.batch}` : '',
      filters.course ? `Program: ${filters.course}` : '',
      filters.branch ? `Branch: ${filters.branch}` : ''
    ]);
  }

  data.forEach((student, index) => {
    const pinOrAdmission = student.pin_no || student.admission_number || '';
    const row = [
      index + 1,
      student.student_name || '',
      pinOrAdmission,
      student.branch || '',
      student.stud_type || '',
      student.caste || ''
    ];
    for (const year of reportYears) {
      const yearData = student.years.find((entry) => entry.student_year === year) || {
        sanctioned_amount: 0,
        released_amount: 0,
        due_amount: 0
      };
      row.push(
        yearData.sanctioned_amount,
        yearData.released_amount,
        yearData.due_amount
      );
    }
    rows.push(row);
  });

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  if (filters.college || filters.batch || filters.course || filters.branch) {
    const headerOffset = 1;
    merges.forEach((merge) => {
      merge.s.r += headerOffset;
      merge.e.r += headerOffset;
    });
    ws['!merges'] = merges;
  } else {
    ws['!merges'] = merges;
  }
  xlsx.utils.book_append_sheet(wb, ws, 'Scholarship Report');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

exports.getScholarshipReport = async (req, res) => {
  try {
    const { totalYears, data, displayYear } = await buildScholarshipReportData(req);
    res.json({ success: true, data, totalYears, displayYear });
  } catch (error) {
    console.error('Error fetching scholarship report:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scholarship report' });
  }
};

exports.exportScholarshipReport = async (req, res) => {
  try {
    const { totalYears, data, displayYear } = await buildScholarshipReportData(req);
    const filters = {
      college: req.query.filter_college || '',
      batch: req.query.filter_batch || '',
      course: req.query.filter_course || '',
      branch: req.query.filter_branch || '',
      academic_year: req.query.filter_academic_year || ''
    };
    const buffer = buildExcelBuffer(data, totalYears, filters, displayYear);
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="scholarship_report_${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting scholarship report:', error);
    res.status(500).json({ success: false, message: 'Failed to export scholarship report' });
  }
};

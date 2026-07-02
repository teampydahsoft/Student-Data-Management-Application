const { masterPool } = require('../../config/database');
const xlsx = require('xlsx');
const { buildReportFilters } = require('./categoryReportController');
const {
  resolveTotalYears,
  buildYearSnapshotFromRows,
  resolveSemestersPerYear
} = require('../../services/studentScholarshipSync');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => {
  const num = toNumber(value);
  return Math.round(num * 100) / 100;
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

const buildYearAmountsFromRows = (yearRows, semestersPerYear) => {
  const snapshot = buildYearSnapshotFromRows(yearRows, semestersPerYear);
  const sanctioned = formatAmount(snapshot.sanctioned_amount);
  const released = formatAmount(snapshot.released_amount);
  // Sum paid_amount across release rows in the snapshot
  const paid = formatAmount(
    (snapshot.releases || []).reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0)
  );
  const pending = formatAmount(Math.max(0, sanctioned - paid));
  return {
    sanctioned_amount: sanctioned,
    released_amount: released,
    paid_amount: paid,
    pending_amount: pending,
    due_amount: formatAmount(sanctioned - released)
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

const buildStudentYearEntries = async (student, yearRowMap, filterAcademicYear = null) => {
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
        ...buildYearAmountsFromRows(yearRows, semestersPerYear)
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

  // When filtering to a single year, report totalYears as that year number
  // so the table renders only the relevant column
  const effectiveTotalYears = filterAcademicYear && filterAcademicYear > 0
    ? filterAcademicYear
    : totalYears;

  return { totalYears: effectiveTotalYears, years };
};

const buildScholarshipReportData = async (req) => {
  courseYearsCache.clear();

  const { baseQuery, params } = await buildReportFilters(req);
  const studentQuery = `
    SELECT id, admission_number, pin_no, student_name, course, branch, batch, college, current_year, current_semester, stud_type, caste
    ${baseQuery}
    ORDER BY student_name ASC, admission_number ASC
  `;
  const [students] = await masterPool.query(studentQuery, params);

  if (!students.length) {
    return { students: [], totalYears: 0, data: [] };
  }

  const studentIds = students.map((student) => student.id);

  // Optional filter: only include data for a specific student_year (within the program)
  const filterAcademicYear = req.query.filter_academic_year
    ? parseInt(req.query.filter_academic_year, 10)
    : null;

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
  let maxTotalYears = 0;
  const data = [];

  for (const student of students) {
    const yearRowMap = scholarshipByStudent.get(student.id) || new Map();
    const { totalYears, years } = await buildStudentYearEntries(
      student,
      yearRowMap,
      filterAcademicYear
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
      years
    });
  }

  return { students, totalYears: maxTotalYears, data };
};

const buildExcelBuffer = (data, totalYears, filters) => {
  const fixedCols = 6; // S.No, Student Name, PIN/Admission No, Branch, Quota, Caste
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

  for (let year = 1; year <= totalYears; year += 1) {
    row1.push(`Year ${year}`, '', '', '');
    row2.push('Sanctioned', 'Released', 'Paid', 'Pending');
    const startCol = fixedCols + (year - 1) * 4;
    merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 3 } });
  }

  if (totalYears > 0) {
    row1.push(...Array(totalYears).fill(''));
    row1[fixedCols + totalYears * 4] = 'Due';
    for (let year = 1; year <= totalYears; year += 1) {
      row2.push(`Year ${year}`);
    }
    const dueStartCol = fixedCols + totalYears * 4;
    merges.push({ s: { r: 0, c: dueStartCol }, e: { r: 0, c: dueStartCol + totalYears - 1 } });
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
    for (let year = 1; year <= totalYears; year += 1) {
      const yearData = student.years.find((entry) => entry.student_year === year) || {
        sanctioned_amount: 0,
        released_amount: 0,
        paid_amount: 0,
        pending_amount: 0,
        due_amount: 0
      };
      row.push(yearData.sanctioned_amount, yearData.released_amount, yearData.paid_amount, yearData.pending_amount);
    }
    for (let year = 1; year <= totalYears; year += 1) {
      const yearData = student.years.find((entry) => entry.student_year === year) || {
        due_amount: 0
      };
      row.push(yearData.due_amount);
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
    const { totalYears, data } = await buildScholarshipReportData(req);
    res.json({ success: true, data, totalYears });
  } catch (error) {
    console.error('Error fetching scholarship report:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scholarship report' });
  }
};

exports.exportScholarshipReport = async (req, res) => {
  try {
    const { totalYears, data } = await buildScholarshipReportData(req);
    const filters = {
      college: req.query.filter_college || '',
      batch: req.query.filter_batch || '',
      course: req.query.filter_course || '',
      branch: req.query.filter_branch || '',
      academic_year: req.query.filter_academic_year || ''
    };
    const buffer = buildExcelBuffer(data, totalYears, filters);
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="scholarship_report_${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting scholarship report:', error);
    res.status(500).json({ success: false, message: 'Failed to export scholarship report' });
  }
};

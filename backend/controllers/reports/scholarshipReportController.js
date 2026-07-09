const { masterPool } = require('../../config/database');
const xlsx = require('xlsx');
const { buildReportFilters } = require('./categoryReportController');
const {
  resolveTotalYears,
  buildYearSnapshotFromRows,
  resolveSemestersPerYear,
  allSemestersEligible,
  isYearFeeOnlyScholarshipMode
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
  const feeOnly = isYearFeeOnlyScholarshipMode(semesters);
  const sanctioned = formatAmount(snapshot.sanctioned_amount);
  const released = formatAmount(snapshot.released_amount);
  const paid = formatAmount(snapshot.paid_amount);
  const manualPaid = rtfEligible && isCollege ? Math.max(0, paid - released) : paid;
  const feeDue = formatAmount(calculateFeeDue(sanctioned, paid));
  const rtfDue = rtfEligible ? formatAmount(calculateRtfDue(sanctioned, released)) : 0;
  const advance = rtfEligible && isCollege
    ? formatAmount(calculateAdvanceAmount(sanctioned, released, manualPaid, true))
    : 0;
  // For not-eligible / fee-only candidates show sanctioned amount as due (mirrors frontend logic)
  const dueAmount = (rtfEligible || feeOnly) ? (feeOnly ? sanctioned : rtfDue) : rtfDue;
  return {
    sanctioned_amount: sanctioned,
    released_amount: released,
    paid_amount: paid,
    pending_amount: feeDue,
    due_amount: dueAmount,
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

  // Always strip filter_scholarship_status before buildReportFilters.
  // The legacy students.scholar_status column is unreliable for newer batches (2026+)
  // where scholarship status is stored in the student_scholarship table.
  // We apply the scholarship status filter ourselves in JS after fetching student_scholarship rows.
  const reqForFilters = filterScholarshipStatus
    ? { ...req, query: { ...req.query, filter_scholarship_status: '' } }
    : req;

  const { baseQuery, params } = await buildReportFilters(reqForFilters, { skipStatusFilter: true });

  // Exclude management/spot quota types — these students are ineligible for government scholarship
  // by admission quota (MANG/MQ/SPOT/LSPOT). This is a quota-type exclusion, not a status filter:
  // all other students (Regular, Detained, Course Completed, etc.) are included regardless of status.
  const studentQuery = `
    SELECT id, admission_number, pin_no, student_name, course, branch, batch, college, current_year, current_semester, stud_type, caste, scholar_status, student_status
    ${baseQuery}
    AND UPPER(TRIM(IFNULL(stud_type,''))) NOT IN ('MANG', 'MQ', 'SPOT', 'LSPOT')
    ORDER BY student_name ASC, admission_number ASC
  `;
  let [students] = await masterPool.query(studentQuery, params);

  if (!students.length) {
    return { students: [], totalYears: 0, data: [] };
  }

  // Apply scholarship status filter in JS using student_scholarship table data.
  // This is done post-SQL because students.scholar_status is unreliable for newer batches (2026+)
  // where status is stored per-year in student_scholarship, not in the legacy column.
  let yearStatusMap = new Map(); // student_id → effective scholarship status
  if (filterScholarshipStatus) {
    const studentIds = students.map((s) => s.id);

    // Fetch eligible values from student_scholarship for the relevant year(s)
    let yearEligibleQuery = `SELECT student_id, student_year, eligible
       FROM student_scholarship
       WHERE student_id IN (?)
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY student_id ASC, student_year ASC, id ASC`;
    const yearEligibleParams = [studentIds];

    if (filterAcademicYear && filterAcademicYear > 0) {
      yearEligibleQuery = `SELECT student_id, student_year, eligible
       FROM student_scholarship
       WHERE student_id IN (?)
         AND student_year = ?
         AND eligible IS NOT NULL AND TRIM(eligible) != ''
       ORDER BY student_id ASC, id ASC`;
      yearEligibleParams.push(filterAcademicYear);
    }

    const [yearEligibleRows] = await masterPool.query(yearEligibleQuery, yearEligibleParams);

    // Build status map:
    // - Specific year: student_id → single eligible status string for that year
    // - All years: student_id → Map<student_year, resolved_status> (one entry per year)
    //   Keyed by year so each year is counted once, regardless of how many semester rows exist.
    if (!filterAcademicYear || filterAcademicYear <= 0) {
      // All-years mode: for each student, keep the resolved status per year.
      // A year is eligible only if ALL its semesters are eligible; otherwise use the
      // first non-eligible status found for that year.
      // yearStatusMap: student_id → Map<student_year, status_string>
      for (const row of yearEligibleRows) {
        const normalized = String(row.eligible || '').trim().toLowerCase();
        if (!normalized) continue;
        const studentYear = row.student_year;
        if (!yearStatusMap.has(row.student_id)) yearStatusMap.set(row.student_id, new Map());
        const yearMap = yearStatusMap.get(row.student_id);
        const existing = yearMap.get(studentYear);
        const rowIsEligible = normalized.includes('eligible') && !normalized.includes('not');
        if (!existing) {
          yearMap.set(studentYear, normalized);
        } else {
          // If any semester in this year is non-eligible, the whole year is non-eligible
          const existingIsEligible = existing.includes('eligible') && !existing.includes('not');
          if (existingIsEligible && !rowIsEligible) {
            yearMap.set(studentYear, normalized); // downgrade year to non-eligible
          }
        }
      }
    } else {
      // Specific year mode: keep the first (primary) status per student for that year
      for (const row of yearEligibleRows) {
        if (!yearStatusMap.has(row.student_id)) {
          yearStatusMap.set(row.student_id, String(row.eligible || '').trim().toLowerCase());
        }
      }
    }

    // Helper: get all year statuses as an array for a student (all-years mode)
    // or a single string (specific-year mode).
    const getYearStatuses = (studentId) => {
      const val = yearStatusMap.get(studentId);
      if (!val) return [];
      if (val instanceof Map) return [...val.values()];
      return [val];
    };

    const statusMatchesFilter = (studentId) => {
      const val = yearStatusMap.get(studentId);
      const isYearMap = val instanceof Map;

      const checkEligible    = (s) => s.includes('eligible') && !s.includes('not');
      const checkNotEligible = (s) => s.includes('not') && s.includes('eligible');
      const checkRejected    = (s) => s === 'rejected';
      const checkNotApplied  = (s) => s === 'not_applied' || s === 'not applied';
      const checkPending     = (s) => !s || s === 'pending';

      const statuses = getYearStatuses(studentId);

      if (filterScholarshipStatus === 'eligible') {
        // Show student if ANY year is marked eligible
        return statuses.some(checkEligible);
      }
      if (filterScholarshipStatus === 'non_eligible_all') {
        // Show student if ANY year has a non-eligible status, OR no record at all
        if (!val || (isYearMap && val.size === 0)) return true;
        return statuses.some((s) => !checkEligible(s));
      }
      if (filterScholarshipStatus === 'not_eligible') {
        return statuses.some(checkNotEligible);
      }
      if (filterScholarshipStatus === 'rejected') {
        return statuses.some(checkRejected);
      }
      if (filterScholarshipStatus === 'not_applied') {
        return statuses.some(checkNotApplied);
      }
      if (filterScholarshipStatus === 'pending') {
        if (!val || (isYearMap && val.size === 0)) return true;
        return statuses.some(checkPending);
      }
      return true;
    };

    // Filter students based on their resolved scholarship status
    const EXCLUDED_QUOTA_TYPES = new Set(['MANG', 'MQ', 'SPOT', 'LSPOT']);
    students = students.filter((student) => {
      if (EXCLUDED_QUOTA_TYPES.has((student.stud_type || '').trim().toUpperCase())) return false;
      return statusMatchesFilter(student.id);
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
    // Build year_status_counts for display: { eligible, not_eligible, rejected, not_applied, pending }
    // In all-years mode yearStatusMap holds a Set of all per-year statuses per student.
    // In specific-year mode it holds a plain string.
    const resolvedStatus = yearStatusMap.get(student.id);
    let year_status_counts = null;
    if (resolvedStatus instanceof Map) {
      const counts = { eligible: 0, not_eligible: 0, rejected: 0, not_applied: 0, pending: 0 };
      for (const s of resolvedStatus.values()) {
        if (s.includes('eligible') && !s.includes('not')) counts.eligible += 1;
        else if (s.includes('not') && s.includes('eligible')) counts.not_eligible += 1;
        else if (s === 'rejected') counts.rejected += 1;
        else if (s === 'not_applied' || s === 'not applied') counts.not_applied += 1;
        else if (s === 'pending') counts.pending += 1;
      }
      year_status_counts = counts;
    }

    const displayScholarStatus = resolvedStatus
      ? (resolvedStatus instanceof Map
          ? [...resolvedStatus.values()].join(', ')
          : resolvedStatus)
      : (student.scholar_status || '');
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
      student_status: student.student_status || '',
      scholar_status: displayScholarStatus,
      year_status_counts,
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

// Format year_status_counts into a readable string for Excel.
// All-years: "Eligible: 3, Not Eligible: 1"   Specific year: "Not Eligible"
const formatScholarStatusForExcel = (student) => {
  const counts = student.year_status_counts;
  if (counts) {
    // All-years mode — show each non-zero bucket
    const parts = [];
    if (counts.eligible     > 0) parts.push(`Eligible: ${counts.eligible}`);
    if (counts.not_eligible > 0) parts.push(`Not Eligible: ${counts.not_eligible}`);
    if (counts.rejected     > 0) parts.push(`Rejected: ${counts.rejected}`);
    if (counts.not_applied  > 0) parts.push(`Not Applied: ${counts.not_applied}`);
    if (counts.pending      > 0) parts.push(`Pending: ${counts.pending}`);
    return parts.join(', ') || '—';
  }
  // Specific-year mode — normalise the raw string
  const raw = String(student.scholar_status || '').trim().toLowerCase();
  if (!raw) return '—';
  if (raw.includes('eligible') && !raw.includes('not')) return 'Eligible';
  if (raw.includes('not') && raw.includes('eligible'))  return 'Not Eligible';
  if (raw === 'rejected')    return 'Rejected';
  if (raw === 'not_applied' || raw === 'not applied') return 'Not Applied';
  if (raw === 'pending')     return 'Pending';
  return student.scholar_status || '—';
};

const buildExcelBuffer = (data, totalYears, filters, displayYear = null) => {
  const hasScholarshipStatus = Boolean(filters.scholarship_status);
  const fixedCols = hasScholarshipStatus ? 8 : 7; // +1 for Scholarship Status when filter is active
  const colsPerYear = 3;

  const row1 = ['S.No', 'Student Name', 'PIN / Admission No', 'Branch', 'Quota', 'Caste', 'Status'];
  const row2 = ['', '', '', '', '', '', ''];
  if (hasScholarshipStatus) {
    row1.push('Scholarship Status');
    row2.push('');
  }

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } },
    ...(hasScholarshipStatus ? [{ s: { r: 0, c: 7 }, e: { r: 1, c: 7 } }] : [])
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
      student.caste || '',
      student.student_status || ''
    ];
    if (hasScholarshipStatus) {
      row.push(formatScholarStatusForExcel(student));
    }
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
      academic_year: req.query.filter_academic_year || '',
      scholarship_status: req.query.filter_scholarship_status || ''
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

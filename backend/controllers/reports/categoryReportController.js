const { masterPool } = require('../../config/database');
const { getScopeConditionString } = require('../../utils/scoping');
const fs = require('fs');
const xlsx = require('xlsx');
const { generateCategoryReportPDF } = require('../../services/pdfService');

/**
 * Build base WHERE clause and params for report filters (same as registration abstract).
 */
async function buildReportFilters(req) {
  const {
    filter_batch,
    filter_course,
    filter_branch,
    filter_year,
    filter_semester,
    filter_college,
    filter_level,
    filter_scholarship_status,
    search
  } = req.query;

  let excludedStudents = [];
  try {
    const [settings] = await masterPool.query(
      "SELECT value FROM settings WHERE `key` = ?",
      ['attendance_config']
    );
    if (settings && settings.length > 0) {
      const config = JSON.parse(settings[0].value);
      if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
    }
  } catch (err) {
    // ignore
  }

  let baseQuery = 'FROM students WHERE 1=1';
  const params = [];

  if (req.userScope) {
    const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
    if (scopeCondition) {
      baseQuery += ` AND ${scopeCondition}`;
      params.push(...scopeParams);
    }
  }

  baseQuery += " AND student_status = 'Regular'";

  // Only include students whose college exists in colleges table (exclude orphan/invalid college names)
  // Use COLLATE to avoid "Illegal mix of collations" when students.college and colleges.name differ (e.g. utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci)
  baseQuery += " AND college IS NOT NULL AND college <> '' AND college COLLATE utf8mb4_unicode_ci IN (SELECT name FROM colleges WHERE is_active = 1)";

  if (excludedStudents.length > 0) {
    baseQuery += ` AND admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
    params.push(...excludedStudents);
  }

  const normalizedFilterBatch = filter_batch?.trim() || null;
  const normalizedFilterCollege = filter_college?.trim() || null;
  const normalizedFilterCourse = filter_course?.trim() || null;
  const normalizedFilterBranch = filter_branch?.trim() || null;
  const parsedFilterYear = filter_year ? parseInt(filter_year, 10) : null;
  const parsedFilterSemester = filter_semester ? parseInt(filter_semester, 10) : null;

  if (normalizedFilterBatch) { baseQuery += ' AND batch = ?'; params.push(normalizedFilterBatch); }
  if (normalizedFilterCollege) { baseQuery += ' AND college = ?'; params.push(normalizedFilterCollege); }
  if (normalizedFilterCourse) { baseQuery += ' AND course = ?'; params.push(normalizedFilterCourse); }
  if (normalizedFilterBranch) { baseQuery += ' AND branch = ?'; params.push(normalizedFilterBranch); }
  if (parsedFilterYear) { baseQuery += ' AND current_year = ?'; params.push(parsedFilterYear); }
  if (parsedFilterSemester) { baseQuery += ' AND current_semester = ?'; params.push(parsedFilterSemester); }

  if (filter_level) {
    try {
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [filter_level]
      );
      const validCourseNames = levelCourses.map((c) => c.name);
      if (validCourseNames.length > 0) {
        baseQuery += ` AND course IN (${validCourseNames.map(() => '?').join(',')})`;
        params.push(...validCourseNames);
      } else {
        baseQuery += ' AND 1=0';
      }
    } catch (err) {
      // ignore
    }
  }

  if (search) {
    const searchPattern = `%${search.trim()}%`;
    baseQuery += ' AND (admission_number LIKE ? OR admission_no LIKE ? OR pin_no LIKE ? OR student_name LIKE ?)';
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const scholarshipFilter = (filter_scholarship_status || req.query.filter_scholarshipStatus || '').trim().toLowerCase();
  if (scholarshipFilter === 'pending') {
    baseQuery += " AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '')";
  } else if (scholarshipFilter === 'eligible') {
    baseQuery += " AND scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' AND (LOWER(scholar_status) LIKE '%eligible%' OR LOWER(scholar_status) LIKE '%jvd%' OR LOWER(scholar_status) LIKE '%yes%')";
  } else if (scholarshipFilter === 'not_eligible') {
    baseQuery += " AND LOWER(IFNULL(scholar_status,'')) LIKE '%not%' AND LOWER(scholar_status) LIKE '%eligible%'";
  } else if (scholarshipFilter === 'rejected') {
    baseQuery += " AND LOWER(TRIM(IFNULL(scholar_status,''))) = 'rejected'";
  } else if (scholarshipFilter === 'not_applied') {
    baseQuery += " AND LOWER(TRIM(IFNULL(scholar_status,''))) IN ('not_applied', 'not applied')";
  }

  return { baseQuery, params };
}

function aggregateCategoryRows(rows) {
  const key = (r) => `${r.college || ''}|${r.batch || ''}|${r.course || ''}|${r.branch || ''}|${r.current_year ?? ''}|${r.current_semester ?? ''}`;
  const groups = new Map();
  const categorySet = new Set();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) {
      groups.set(k, {
        college: r.college || '-',
        batch: r.batch || '-',
        course: r.course || '-',
        branch: r.branch || '-',
        current_year: r.current_year ?? '-',
        current_semester: r.current_semester ?? '-',
        total: 0,
        category_breakdown: {}
      });
    }
    const g = groups.get(k);
    const cat = r.category || 'Not Specified';
    const count = Number(r.cnt) || 0;
    g.category_breakdown[cat] = count;
    g.total += count;
    categorySet.add(cat);
  }
  // Header order: known categories first (Not Specified always last), then others alphabetically, then Not Specified at end
  const knownOrder = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other', 'BC', 'EBC', 'SC_I', 'SC_II', 'SC_III'];
  const categoryColumns = [...categorySet].sort((a, b) => {
    if (a === 'Not Specified' && b === 'Not Specified') return 0;
    if (a === 'Not Specified') return 1;
    if (b === 'Not Specified') return -1;
    const i = knownOrder.indexOf(a);
    const j = knownOrder.indexOf(b);
    if (i !== -1 && j !== -1) return i - j;
    if (i !== -1) return -1;
    if (j !== -1) return 1;
    return String(a).localeCompare(String(b));
  });
  const data = Array.from(groups.values()).sort((a, b) => {
    if (a.college !== b.college) return String(a.college).localeCompare(String(b.college));
    if (a.batch !== b.batch) return String(a.batch).localeCompare(String(b.batch));
    if (a.course !== b.course) return String(a.course).localeCompare(String(b.course));
    if (a.branch !== b.branch) return String(a.branch).localeCompare(String(b.branch));
    if (a.current_year !== b.current_year) return String(a.current_year).localeCompare(String(b.current_year));
    return String(a.current_semester).localeCompare(String(b.current_semester));
  });
  return { data, categoryColumns };
}

/**
 * GET /reports/category - Category report in abstract format: rows by college, batch, program, branch, year, sem with category counts.
 * Same structure as registration abstract: College, Batch, Program, Branch, Year, Sem, Total, then one column per caste.
 */
exports.getCategoryReport = async (req, res) => {
  try {
    const { baseQuery, params } = await buildReportFilters(req);
    const query = `
      SELECT college, batch, course, branch, current_year AS current_year, current_semester AS current_semester,
             COALESCE(NULLIF(TRIM(caste), ''), 'Not Specified') AS category, COUNT(*) AS cnt
      ${baseQuery}
      GROUP BY college, batch, course, branch, current_year, current_semester,
               COALESCE(NULLIF(TRIM(caste), ''), 'Not Specified')
      ORDER BY college, batch, course, branch, current_year, current_semester, category
    `;
    const [rows] = await masterPool.query(query, params);
    const { data, categoryColumns } = aggregateCategoryRows(rows);
    res.json({ success: true, data, categoryColumns });
  } catch (error) {
    console.error('Error fetching category report:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category report' });
  }
};

/**
 * GET /reports/category/export?format=excel|pdf - Export category report (abstract format) as Excel or PDF.
 */
exports.exportCategoryReport = async (req, res) => {
  try {
    const format = (req.query.format || 'excel').toLowerCase();
    const { baseQuery, params } = await buildReportFilters(req);
    const query = `
      SELECT college, batch, course, branch, current_year AS current_year, current_semester AS current_semester,
             COALESCE(NULLIF(TRIM(caste), ''), 'Not Specified') AS category, COUNT(*) AS cnt
      ${baseQuery}
      GROUP BY college, batch, course, branch, current_year, current_semester,
               COALESCE(NULLIF(TRIM(caste), ''), 'Not Specified')
      ORDER BY college, batch, course, branch, current_year, current_semester, category
    `;
    const [rows] = await masterPool.query(query, params);
    const { data, categoryColumns } = aggregateCategoryRows(rows);
    return doExport(req, res, format, data, categoryColumns);
  } catch (error) {
    console.error('Error exporting category report:', error);
    res.status(500).json({ success: false, message: 'Failed to export category report' });
  }
};

async function doExport(req, res, format, data, categoryColumns) {
  const filters = {
    college: req.query.filter_college || 'All',
    batch: req.query.filter_batch || 'All',
    course: req.query.filter_course || 'All',
    branch: req.query.filter_branch || 'All',
    year: req.query.filter_year || 'All',
    semester: req.query.filter_semester || 'All'
  };
  if (format === 'excel') {
    const headers = ['College', 'Batch', 'Program', 'Branch', 'Year', 'Sem', 'Total', ...categoryColumns];
    const wsData = [headers];
    for (const row of data) {
      wsData.push([
        row.college,
        row.batch,
        row.course,
        row.branch,
        row.current_year,
        row.current_semester,
        row.total,
        ...categoryColumns.map((c) => row.category_breakdown[c] ?? 0)
      ]);
    }
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, 'Category Report');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="category_report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  }
  if (format === 'pdf') {
    const pdfPath = await generateCategoryReportPDF({ data, categoryColumns, filters });
    const fileBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);
    res.setHeader('Content-Disposition', 'attachment; filename="category_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(fileBuffer);
  }
  return res.status(400).json({ success: false, message: 'Invalid format. Use excel or pdf.' });
}

module.exports.buildReportFilters = buildReportFilters;

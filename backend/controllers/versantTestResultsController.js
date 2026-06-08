const versantTestResultsService = require('../services/versantTestResultsService');
const { isVersantConfigured } = require('../config/versantDb');

function parseFilters(query) {
  return {
    rollNumber: query.rollNumber || query.roll_number || '',
    pinNo: query.pinNo || query.pin_no || '',
    admissionNumber: query.admissionNumber || query.admission_number || '',
    testType: query.testType || query.test_type || '',
    moduleId: query.moduleId || query.module_id || '',
    testName: query.testName || query.test_name || '',
    fromDate: query.fromDate || query.from_date || '',
    toDate: query.toDate || query.to_date || '',
    page: query.page,
    limit: query.limit,
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

exports.getTestResults = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured. Add the AI-VERSANT connection string to backend/.env',
      });
    }

    const result = await versantTestResultsService.getStudentTestResults(
      parseFilters(req.query),
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Versant test results list error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch test results',
    });
  }
};

exports.getTestResultById = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const data = await versantTestResultsService.getTestResultById(req.params.id, {
      source: req.query.source,
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Test result not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('Versant test result detail error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch test result',
    });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const data = await versantTestResultsService.getFilterOptions();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Versant filter options error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load filter options',
    });
  }
};

exports.exportTestResults = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const rows = await versantTestResultsService.exportStudentTestResults(
      parseFilters(req.query),
    );

    const headers = [
      'Student Name',
      'Roll Number',
      'PIN',
      'Admission Number',
      'Test Name',
      'Module',
      'Subcategory',
      'Test Type',
      'Score',
      'Correct',
      'Total Questions',
      'Submitted At',
      'Source',
    ];

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.student_name,
          row.roll_number,
          row.pin_no,
          row.admission_number,
          row.test_name,
          row.module_id,
          row.subcategory,
          row.test_type,
          row.score,
          row.correct_answers,
          row.total_questions,
          row.submitted_at,
          row.source,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="versant-test-results.csv"',
    );
    res.send('\uFEFF' + lines.join('\n'));
  } catch (error) {
    console.error('Versant export error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export test results',
    });
  }
};

function getSdmsContextFromRequest(req) {
  return {
    studentId: req.user?.id,
    admissionNumber: req.user?.admissionNumber || req.user?.admission_number,
    username: req.user?.username,
  };
}

exports.getMyLinkStatus = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const { sdms, versantMatch } = await versantTestResultsService.resolveVersantUserIdForSdmsStudent(
      getSdmsContextFromRequest(req),
    );

    if (!sdms) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found in SDMS',
      });
    }

    res.json({
      success: true,
      data: {
        linked: Boolean(versantMatch),
        sdms: {
          admission_number: sdms.admissionNumber,
          pin_no: sdms.pinNo,
          login_username: sdms.loginUsername,
          student_name: sdms.studentName,
          tried_keys: sdms.searchKeys,
        },
        versantMatch: versantMatch
          ? {
              matchField: versantMatch.matchField,
              roll: versantMatch.versantRoll,
              pin: versantMatch.versantPin,
              admission: versantMatch.versantAdmission,
            }
          : null,
        message: versantMatch
          ? 'CRT training profile linked via PIN/admission number.'
          : 'No CRT profile found. Ensure your PIN or admission number matches your CRT login.',
      },
    });
  } catch (error) {
    console.error('CRT link status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check CRT link status',
    });
  }
};

exports.getStudentLinkReport = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const { batch, course, limit, unlinkedOnly } = req.query;
    const report = await versantTestResultsService.analyzeSdmsCrtLinks({
      batch: batch || null,
      course: course || null,
      limit: limit ? parseInt(limit, 10) : null,
    });

    const students =
      unlinkedOnly === 'true'
        ? report.students.filter((s) => !s.crtLinked)
        : report.students;

    res.json({
      success: true,
      data: {
        summary: report.summary,
        students,
      },
    });
  } catch (error) {
    console.error('CRT student link report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate CRT link report',
    });
  }
};

exports.getMyTestResults = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const result = await versantTestResultsService.getMyStudentTestResults(
      getSdmsContextFromRequest(req),
      parseFilters(req.query),
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Versant my test results error:', error?.stack || error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch your test results',
    });
  }
};

exports.getMyTestResultById = async (req, res) => {
  try {
    if (!isVersantConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'MONGODB_URI is not configured',
      });
    }

    const { sdms, versantMatch } =
      await versantTestResultsService.resolveVersantUserIdForSdmsStudent(
        getSdmsContextFromRequest(req),
      );

    if (!versantMatch?.userId) {
      return res.status(404).json({
        success: false,
        message: 'AI-VERSANT profile not linked to your account',
        sdms: sdms
          ? { pin_no: sdms.pinNo, admission_number: sdms.admissionNumber }
          : null,
      });
    }

    const data = await versantTestResultsService.getTestResultById(req.params.id, {
      source: req.query.source,
      studentUserId: versantMatch.userId,
    });

    if (!data) {
      return res.status(404).json({ success: false, message: 'Test result not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Versant my test result detail error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch test result',
    });
  }
};

exports.getHealth = async (req, res) => {
  if (!isVersantConfigured()) {
    return res.json({ success: false, configured: false, connected: false });
  }
  try {
    const { getVersantDb } = require('../config/versantDb');
    const db = await getVersantDb();
    await db.command({ ping: 1 });
    res.json({ success: true, configured: true, connected: true });
  } catch (error) {
    res.json({
      success: false,
      configured: true,
      connected: false,
      message: error.message,
    });
  }
};

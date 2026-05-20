const { masterPool } = require('../../config/database');
const { getScopeConditionString } = require('../../utils/scoping');
const smsService = require('../../services/smsService');

function buildSmsLogScope(req) {
  let joinClause = '';
  let whereClause = `WHERE sl.mobile_number != 'WEB'`;
  const params = [];

  if (req.userScope) {
    const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
    if (scopeCondition) {
      joinClause = ' INNER JOIN students s ON sl.student_id = s.id ';
      whereClause += ` AND ${scopeCondition}`;
      params.push(...scopeParams);
    }
  }

  return { joinClause, whereClause, params };
}

/**
 * GET /students/reports/sms — SMS usage summary, category breakdown, account credits.
 */
exports.getSmsReport = async (req, res) => {
  try {
    const { date_from, date_to, category } = req.query;
    const { joinClause, whereClause, params } = buildSmsLogScope(req);

    let filteredWhere = whereClause;
    const filteredParams = [...params];

    if (date_from) {
      filteredWhere += ' AND DATE(sl.sent_at) >= ?';
      filteredParams.push(date_from);
    }
    if (date_to) {
      filteredWhere += ' AND DATE(sl.sent_at) <= ?';
      filteredParams.push(date_to);
    }
    if (category) {
      filteredWhere += ' AND sl.category = ?';
      filteredParams.push(category);
    }

    const baseFrom = `FROM sms_logs sl ${joinClause}`;

    const [summaryRows] = await masterPool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN sl.status IN ('Sent', 'Delivered') THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN sl.status = 'Failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN sl.status NOT IN ('Sent', 'Delivered', 'Failed') THEN 1 ELSE 0 END) AS other
      ${baseFrom}
      ${filteredWhere}`,
      filteredParams
    );

    const [byCategory] = await masterPool.query(
      `SELECT
        COALESCE(sl.category, 'General') AS category,
        COUNT(*) AS total,
        SUM(CASE WHEN sl.status IN ('Sent', 'Delivered') THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN sl.status = 'Failed' THEN 1 ELSE 0 END) AS failed
      ${baseFrom}
      ${filteredWhere}
      GROUP BY COALESCE(sl.category, 'General')
      ORDER BY total DESC`,
      filteredParams
    );

    const [byDate] = await masterPool.query(
      `SELECT
        DATE(sl.sent_at) AS date,
        COUNT(*) AS total,
        SUM(CASE WHEN sl.status IN ('Sent', 'Delivered') THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN sl.status = 'Failed' THEN 1 ELSE 0 END) AS failed
      ${baseFrom}
      ${filteredWhere}
      AND sl.sent_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(sl.sent_at)
      ORDER BY date DESC`,
      filteredParams
    );

    const [categories] = await masterPool.query(
      `SELECT DISTINCT COALESCE(sl.category, 'General') AS category
      ${baseFrom}
      ${whereClause}
      ORDER BY category`,
      params
    );

    const balance = await smsService.getAccountBalance();

    res.json({
      success: true,
      data: {
        summary: {
          total: Number(summaryRows[0]?.total || 0),
          sent: Number(summaryRows[0]?.sent || 0),
          failed: Number(summaryRows[0]?.failed || 0),
          other: Number(summaryRows[0]?.other || 0)
        },
        byCategory: byCategory.map((row) => ({
          category: row.category,
          total: Number(row.total),
          sent: Number(row.sent),
          failed: Number(row.failed)
        })),
        byDate: byDate.map((row) => ({
          date: row.date,
          total: Number(row.total),
          sent: Number(row.sent),
          failed: Number(row.failed)
        })),
        categories: categories.map((r) => r.category),
        accountBalance: balance
      }
    });
  } catch (error) {
    console.error('Failed to fetch SMS report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching SMS report'
    });
  }
};

/**
 * GET /students/reports/sms/logs — Paginated SMS log list for the reports page.
 */
exports.getSmsReportLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const { date_from, date_to, category, status } = req.query;

    const { joinClause, whereClause, params } = buildSmsLogScope(req);
    let filteredWhere = whereClause;
    const filteredParams = [...params];

    if (date_from) {
      filteredWhere += ' AND DATE(sl.sent_at) >= ?';
      filteredParams.push(date_from);
    }
    if (date_to) {
      filteredWhere += ' AND DATE(sl.sent_at) <= ?';
      filteredParams.push(date_to);
    }
    if (category) {
      filteredWhere += ' AND sl.category = ?';
      filteredParams.push(category);
    }
    if (status) {
      filteredWhere += ' AND sl.status = ?';
      filteredParams.push(status);
    }

    const studentJoin = joinClause || ' LEFT JOIN students s ON sl.student_id = s.id ';

    const [countRows] = await masterPool.query(
      `SELECT COUNT(*) AS total FROM sms_logs sl ${studentJoin} ${filteredWhere}`,
      filteredParams
    );
    const total = Number(countRows[0]?.total || 0);

    const [logs] = await masterPool.query(
      `SELECT
        sl.id,
        sl.mobile_number,
        sl.message,
        sl.category,
        sl.status,
        sl.message_id,
        sl.sent_at,
        sl.error_details,
        s.admission_number,
        s.student_name,
        s.college,
        s.course,
        s.branch
      FROM sms_logs sl
      ${studentJoin}
      ${filteredWhere}
      ORDER BY sl.sent_at DESC
      LIMIT ? OFFSET ?`,
      [...filteredParams, limit, offset]
    );

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    });
  } catch (error) {
    console.error('Failed to fetch SMS report logs:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching SMS logs'
    });
  }
};

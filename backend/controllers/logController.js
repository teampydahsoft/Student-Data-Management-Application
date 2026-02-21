const { masterPool } = require('../config/database');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const safeParseJson = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const normalizeLimit = (limit) => {
  const parsed = parseInt(limit, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const normalizeOffset = (offset) => {
  const parsed = parseInt(offset, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const buildFilters = ({
  action,
  entityType,
  entityId,
  adminId,
  dateFrom,
  dateTo,
  search
}) => {
  const filters = [];

  if (action) {
    filters.push({
      clause: 'al.action_type = ?',
      values: [action]
    });
  }

  if (entityType) {
    filters.push({
      clause: 'al.entity_type = ?',
      values: [entityType]
    });
  }

  if (entityId) {
    filters.push({
      clause: 'al.entity_id = ?',
      values: [entityId]
    });
  }

  if (adminId) {
    filters.push({
      clause: 'al.admin_id = ?',
      values: [adminId]
    });
  }

  if (dateFrom) {
    filters.push({
      clause: 'DATE(al.created_at) >= ?',
      values: [dateFrom]
    });
  }

  if (dateTo) {
    filters.push({
      clause: 'DATE(al.created_at) <= ?',
      values: [dateTo]
    });
  }

  if (search) {
    const likeValue = `%${search}%`;
    filters.push({
      clause: `(
        al.entity_id LIKE ? OR
        al.action_type LIKE ? OR
        al.entity_type LIKE ? OR
        COALESCE(a.username, ru.username, '') LIKE ? OR
        CAST(al.details AS CHAR) LIKE ?
      )`,
      values: [likeValue, likeValue, likeValue, likeValue, likeValue]
    });
  }

  return filters;
};

exports.getAuditLogs = async (req, res) => {
  try {
    const {
      limit,
      offset = 0,
      action,
      entityType,
      entityId,
      adminId,
      dateFrom,
      dateTo,
      search
    } = req.query;

    const pageSize = normalizeLimit(limit);
    const pageOffset = normalizeOffset(offset);

    const filters = buildFilters({
      action,
      entityType,
      entityId,
      adminId,
      dateFrom,
      dateTo,
      search
    });

    const whereSql = filters.map((filter) => ` AND ${filter.clause}`).join('');
    const filterValues = filters.flatMap((filter) => filter.values);

    const dataQuery = `
      SELECT
        al.*,
        COALESCE(a.username, ru.username) AS admin_username,
        COALESCE(ru.name, a.username) AS admin_full_name,
        ru.role AS admin_role
      FROM audit_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      LEFT JOIN rbac_users ru ON al.rbac_user_id = ru.id
      WHERE 1=1${whereSql}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM audit_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      LEFT JOIN rbac_users ru ON al.rbac_user_id = ru.id
      WHERE 1=1${whereSql}
    `;

    const [logsRows] = await masterPool.query(dataQuery, [...filterValues, pageSize, pageOffset]);
    const [countRows] = await masterPool.query(countQuery, filterValues);

    const total = countRows?.[0]?.total || 0;

    const data = logsRows.map((row) => ({
      ...row,
      details: safeParseJson(row.details)
    }));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        limit: pageSize,
        offset: pageOffset
      },
      filters: {
        action,
        entityType,
        entityId,
        adminId,
        dateFrom,
        dateTo,
        search
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching audit logs'
    });
  }
};

exports.getAuditLogById = async (req, res) => {
  try {
    const logId = parseInt(req.params.id, 10);

    if (Number.isNaN(logId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid log id'
      });
    }

    const query = `
      SELECT
        al.*,
        COALESCE(a.username, ru.username) AS admin_username,
        COALESCE(ru.name, a.username) AS admin_full_name,
        ru.role AS admin_role
      FROM audit_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      LEFT JOIN rbac_users ru ON al.rbac_user_id = ru.id
      WHERE al.id = ?
      LIMIT 1
    `;

    const [rows] = await masterPool.query(query, [logId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    const log = {
      ...rows[0],
      details: safeParseJson(rows[0].details)
    };

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Get audit log by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching audit log'
    });
  }
};

exports.getAuditLogActions = async (_req, res) => {
  try {
    const [rows] = await masterPool.query(
      'SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type ASC'
    );

    const actions = rows
      .map((row) => row.action_type)
      .filter((actionType) => actionType && actionType.trim().length > 0);

    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    console.error('Get audit log actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching audit log actions'
    });
  }
};

exports.getAuditLogEntities = async (_req, res) => {
  try {
    const [rows] = await masterPool.query(
      'SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type ASC'
    );

    const entities = rows
      .map((row) => row.entity_type)
      .filter((entityType) => entityType && entityType.trim().length > 0);

    res.json({
      success: true,
      data: entities
    });
  } catch (error) {
    console.error('Get audit log entities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching audit log entities'
    });
  }
};


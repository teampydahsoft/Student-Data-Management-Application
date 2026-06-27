const { masterPool } = require('../config/database');

const MAX_ENTITY_ID_LENGTH = 100;

const resolveActor = (req, actor) => {
  const resolved = actor || req?.user || req?.admin || null;
  if (!resolved || resolved.id == null) {
    return { adminId: null, rbacUserId: null };
  }

  const role = resolved.role != null ? String(resolved.role) : '';
  const isRbacUser = role && role !== 'admin';

  return {
    adminId: isRbacUser ? null : resolved.id,
    rbacUserId: isRbacUser ? resolved.id : null
  };
};

const resolveIpAddress = (req, ipAddress) => {
  if (ipAddress) return ipAddress;
  if (!req) return null;

  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.connection?.remoteAddress || null;
};

const serializeDetails = (details) => {
  if (details == null) return null;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return null;
  }
};

const normalizeEntityId = (entityId) => {
  if (entityId == null) return null;
  const str = String(entityId);
  return str.length > MAX_ENTITY_ID_LENGTH ? str.slice(0, MAX_ENTITY_ID_LENGTH) : str;
};

/**
 * Write an audit log entry. Never throws — failures are logged and swallowed
 * so calling workflows are never interrupted.
 */
const writeAuditLog = async (pool, {
  actionType,
  entityType,
  entityId,
  actor,
  req,
  details,
  ipAddress,
  adminId: explicitAdminId,
  rbacUserId: explicitRbacUserId
}) => {
  if (!actionType || !entityType) return;

  const db = pool || masterPool;
  const { adminId: actorAdminId, rbacUserId: actorRbacUserId } = resolveActor(req, actor);
  const adminId = explicitAdminId !== undefined ? explicitAdminId : actorAdminId;
  const rbacUserId = explicitRbacUserId !== undefined ? explicitRbacUserId : actorRbacUserId;
  const ip = resolveIpAddress(req, ipAddress);
  const detailsJson = serializeDetails(details);
  const normalizedEntityId = normalizeEntityId(entityId);

  const insertWithIp = async () => {
    await db.query(
      `INSERT INTO audit_logs
         (action_type, entity_type, entity_id, admin_id, rbac_user_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actionType, entityType, normalizedEntityId, adminId, rbacUserId, detailsJson, ip]
    );
  };

  const insertWithoutIp = async () => {
    await db.query(
      `INSERT INTO audit_logs
         (action_type, entity_type, entity_id, admin_id, rbac_user_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actionType, entityType, normalizedEntityId, adminId, rbacUserId, detailsJson]
    );
  };

  try {
    await insertWithIp();
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' && String(err.message || '').includes('ip_address')) {
      try {
        await insertWithoutIp();
        return;
      } catch (retryErr) {
        console.error('Audit log error (non-critical):', retryErr.message);
        return;
      }
    }

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      try {
        await db.query(
          `INSERT INTO audit_logs
             (action_type, entity_type, entity_id, admin_id, rbac_user_id, details)
           VALUES (?, ?, ?, NULL, ?, ?)`,
          [actionType, entityType, normalizedEntityId, rbacUserId, detailsJson]
        );
        return;
      } catch (retryErr) {
        console.error('Audit log error (non-critical):', retryErr.message);
        return;
      }
    }

    console.error('Audit log error (non-critical):', err.message);
  }
};

/** Fire-and-forget audit log — safe to call without await before sending a response. */
const logAudit = (req, payload) => {
  writeAuditLog(masterPool, { ...payload, req }).catch(() => {});
};

module.exports = {
  writeAuditLog,
  logAudit,
  resolveActor,
  normalizeEntityId
};

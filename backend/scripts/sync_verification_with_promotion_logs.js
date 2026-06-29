/**
 * Align registration verification/promotion with audit_logs PROMOTE history.
 *
 * If a student was promoted into their current year/semester, verification only
 * counts when mobile verify timestamps are AFTER the latest promotion time.
 * Legacy rows without timestamps are reset when promotion logs exist.
 *
 * Usage (from backend folder):
 *   node scripts/sync_verification_with_promotion_logs.js
 *   node scripts/sync_verification_with_promotion_logs.js --apply
 *   node scripts/sync_verification_with_promotion_logs.js --admission 20250136
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { masterPool } = require('../config/database');
const {
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle,
  resetRegistrationCycle
} = require('../services/registrationCycle');

const APPLY = process.argv.includes('--apply');
const admissionArgIndex = process.argv.indexOf('--admission');
const ADMISSION_FILTER = admissionArgIndex >= 0 ? process.argv[admissionArgIndex + 1] : null;

const parseJSON = (value) => {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};

const toStage = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseDetails = (details) => {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
};

const parseTime = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const hasVerificationActivity = (data) => (
  data.is_student_mobile_verified === true
  || data.is_parent_mobile_verified === true
  || data.mobile_verified_year != null
  || data.parent_verified_year != null
);

const verificationValidAfterPromotion = (data, promoteMs) => {
  const year = toStage(data.mobile_verified_year);
  const sem = toStage(data.mobile_verified_semester);
  const parentYear = toStage(data.parent_verified_year);
  const parentSem = toStage(data.parent_verified_semester);

  const studentOk = data.is_student_mobile_verified === true
    && year > 0
    && sem > 0
    && parseTime(data.student_mobile_verified_at) != null
    && parseTime(data.student_mobile_verified_at) >= promoteMs;

  const parentOk = data.is_parent_mobile_verified === true
    && parentYear > 0
    && parentSem > 0
    && parseTime(data.parent_mobile_verified_at) != null
    && parseTime(data.parent_mobile_verified_at) >= promoteMs;

  return studentOk && parentOk;
};

const promotionValidAfterPromotion = (data, currentYear, currentSem, promoteMs) => {
  if (!isPromotionCompleteForCycle(data, currentYear, currentSem)) return false;
  const ackMs = parseTime(data.registration_promotion_acknowledged_at);
  return ackMs != null && ackMs >= promoteMs;
};

const buildPlan = (student, data, lastPromote) => {
  if (!lastPromote) return [];

  const details = parseDetails(lastPromote.details);
  const toStageInfo = details.to || {};
  const promoteYear = toStage(toStageInfo.year);
  const promoteSem = toStage(toStageInfo.semester);
  const currentYear = toStage(student.current_year);
  const currentSem = toStage(student.current_semester);
  const promoteMs = parseTime(lastPromote.last_promoted_at);

  if (!promoteYear || !promoteSem || !promoteMs) return [];
  if (promoteYear !== currentYear || promoteSem !== currentSem) return [];

  const actions = [];
  const needsVerificationReset = hasVerificationActivity(data)
    && !verificationValidAfterPromotion(data, promoteMs);

  const needsPromotionReset = (
    data.registration_promotion_year != null
    || data.registration_promotion_semester != null
  ) && !promotionValidAfterPromotion(data, currentYear, currentSem, promoteMs);

  if (needsVerificationReset) {
    actions.push('reset-verification-after-promotion');
  }
  if (needsPromotionReset) {
    actions.push('reset-promotion-ack-after-promotion');
  }

  return actions;
};

const applyPlan = (data, actions) => {
  if (actions.includes('reset-verification-after-promotion')) {
    data.is_student_mobile_verified = false;
    data.is_parent_mobile_verified = false;
    delete data.mobile_verified_year;
    delete data.mobile_verified_semester;
    delete data.parent_verified_year;
    delete data.parent_verified_semester;
    delete data.student_mobile_verified_at;
    delete data.parent_mobile_verified_at;
  }

  if (actions.includes('reset-promotion-ack-after-promotion')) {
    delete data.registration_promotion_year;
    delete data.registration_promotion_semester;
    delete data.registration_promotion_acknowledged_at;
  }
};

const describeActions = (actions, lastPromote) => {
  const details = parseDetails(lastPromote.details);
  const from = details.from || {};
  const to = details.to || {};
  const promoteLabel = `promoted ${lastPromote.last_promoted_at} (Y${from.year || '?'} S${from.semester || '?'} → Y${to.year || '?'} S${to.semester || '?'})`;
  if (!actions.length) return `ok after ${promoteLabel}`;
  return `${actions.join(', ')} — ${promoteLabel}`;
};

const loadLatestPromotions = async () => {
  const [rows] = await masterPool.query(
    `SELECT al.entity_id, al.details, al.created_at AS last_promoted_at
     FROM audit_logs al
     INNER JOIN (
       SELECT entity_id, MAX(created_at) AS max_created_at
       FROM audit_logs
       WHERE action_type = 'PROMOTE' AND entity_type = 'STUDENT'
       GROUP BY entity_id
     ) latest
       ON latest.entity_id = al.entity_id AND latest.max_created_at = al.created_at
     WHERE al.action_type = 'PROMOTE' AND al.entity_type = 'STUDENT'`
  );

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.entity_id), row);
  }
  return map;
};

(async () => {
  const promoteMap = await loadLatestPromotions();
  console.log(`Loaded latest PROMOTE log for ${promoteMap.size} students`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  let query = `
    SELECT id, admission_number, student_name, current_year, current_semester, student_data
    FROM students
    WHERE student_status = 'Regular'
  `;
  const params = [];
  if (ADMISSION_FILTER) {
    query += ' AND admission_number = ?';
    params.push(ADMISSION_FILTER);
  }
  query += ' ORDER BY admission_number ASC';

  const [students] = await masterPool.query(query, params);

  let planned = 0;
  let updated = 0;
  let skippedNoPromote = 0;
  let alreadyValid = 0;
  let errors = 0;

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index];
    const lastPromote = promoteMap.get(String(student.admission_number));

    if (!lastPromote) {
      skippedNoPromote += 1;
      continue;
    }

    const label = `[${index + 1}/${students.length}] ${student.admission_number} ${student.student_name || ''}`.trim();

    try {
      const data = parseJSON(student.student_data);
      const actions = buildPlan(student, data, lastPromote);

      if (!actions.length) {
        alreadyValid += 1;
        continue;
      }

      planned += 1;
      const wasComplete = isVerificationCompleteForCycle(data, student.current_year, student.current_semester);
      console.log(`${label} → ${describeActions(actions, lastPromote)}${wasComplete ? ' [was verification-complete]' : ''}`);

      if (!APPLY) continue;

      const nextData = { ...data };
      applyPlan(nextData, actions);

      await masterPool.query(
        'UPDATE students SET student_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(nextData), student.id]
      );
      updated += 1;
    } catch (error) {
      errors += 1;
      console.error(`${label} → ERROR: ${error.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:           ${students.length}`);
  console.log(`No PROMOTE log:    ${skippedNoPromote}`);
  console.log(`Already valid:     ${alreadyValid}`);
  console.log(`Planned changes:   ${planned}`);
  if (APPLY) {
    console.log(`Updated:           ${updated}`);
    console.log(`Errors:            ${errors}`);
  } else if (planned > 0) {
    console.log('\nRe-run with --apply to write changes.');
  }

  process.exit(errors > 0 ? 1 : 0);
})().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});

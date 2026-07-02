/**
 * Migration: recover_scholar_status_from_audit.js
 *
 * Recovers scholar_status for students whose value was cleared (NULL)
 * by reading the MOST RECENT scholar_status value from audit_logs.
 *
 * The audit_logs table records every UPDATE to students including the
 * "to" value for scholar_status. We pick the latest entry per student
 * and restore their scholar_status.
 *
 * Safe to run multiple times — only updates students with NULL/empty scholar_status.
 *
 * Usage:
 *   node backend/migrations/recover_scholar_status_from_audit.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = new Set(['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied']);

const normalizeEligible = (value) => {
  if (!value) return null;
  let v = String(value).trim().toLowerCase();
  // Handle display values like "Eligible", "Not Eligible", "ELIGIBLE" etc.
  if (v === 'eligible') return 'eligible';
  if (v === 'not eligible' || v === 'not_eligible' || v === 'not-eligible' || v === 'noteligible') return 'not_eligible';
  if (v === 'rejected') return 'rejected';
  if (v === 'pending') return 'pending';
  if (v === 'not applied' || v === 'not_applied' || v === 'not-applied') return 'not_applied';
  return null;
};

async function run() {
  console.log('=== Recover Scholar Status from Audit Logs ===');

  // Step 1: Find students with no scholar_status
  const [students] = await masterPool.query(`
    SELECT id, admission_number, scholar_status
    FROM students
    WHERE student_status = 'Regular'
      AND (scholar_status IS NULL OR TRIM(scholar_status) = ''
           OR LOWER(TRIM(scholar_status)) NOT IN ('eligible','not_eligible','rejected','pending','not_applied'))
    ORDER BY id ASC
  `);

  console.log(`Found ${students.length} students with missing/invalid scholar_status`);
  if (!students.length) {
    console.log('Nothing to recover. Exiting.');
    await masterPool.end();
    return;
  }

  const admNos = students.map(s => s.admission_number);

  // Step 2: Pull all audit_log entries that have scholar_status changes for these students
  // details is JSON: { changes: { scholar_status: { from: '...', to: '...' } } }
  const [auditRows] = await masterPool.query(`
    SELECT entity_id AS admission_number,
           JSON_UNQUOTE(JSON_EXTRACT(details, '$.changes.scholar_status.to')) AS scholar_status_to,
           created_at
    FROM audit_logs
    WHERE action_type = 'UPDATE'
      AND entity_type = 'STUDENT'
      AND entity_id IN (?)
      AND JSON_EXTRACT(details, '$.changes.scholar_status') IS NOT NULL
      AND JSON_EXTRACT(details, '$.changes.scholar_status.to') IS NOT NULL
      AND JSON_EXTRACT(details, '$.changes.scholar_status.to') != 'null'
    ORDER BY entity_id ASC, created_at DESC, id DESC
  `, [admNos]);

  console.log(`Found ${auditRows.length} audit log entries with scholar_status changes`);

  // Step 3: Build map: admission_number → most recent non-null scholar_status
  const recoveredMap = new Map();
  for (const row of auditRows) {
    if (recoveredMap.has(row.admission_number)) continue; // already have latest
    const normalized = normalizeEligible(row.scholar_status_to);
    if (normalized) {
      recoveredMap.set(row.admission_number, { status: normalized, raw: row.scholar_status_to, at: row.created_at });
    }
  }

  console.log(`Recoverable students from audit log: ${recoveredMap.size}`);

  // Step 4: Also check student_scholarship_history (scholarship_status_sync records) as fallback
  const stillMissingAdmNos = admNos.filter(a => !recoveredMap.has(a));
  if (stillMissingAdmNos.length > 0) {
    const [histRows] = await masterPool.query(`
      SELECT s.admission_number, h.scholar_status, h.academic_year, h.created_at
      FROM student_scholarship_history h
      INNER JOIN students s ON s.id = h.student_id
      WHERE s.admission_number IN (?)
        AND h.scholar_status IS NOT NULL AND TRIM(h.scholar_status) != ''
        AND LOWER(TRIM(h.scholar_status)) IN ('eligible','not_eligible','rejected','pending','not_applied')
        AND h.source = 'scholarship_status_sync'
      ORDER BY s.admission_number, h.academic_year DESC, h.created_at DESC, h.id DESC
    `, [stillMissingAdmNos]);

    for (const row of histRows) {
      if (recoveredMap.has(row.admission_number)) continue;
      const normalized = normalizeEligible(row.scholar_status);
      if (normalized && normalized !== 'rejected') { // skip auto-rejected (ineligible quota)
        recoveredMap.set(row.admission_number, { status: normalized, raw: row.scholar_status, at: row.created_at, fromHistory: true });
      }
    }
  }

  // Step 5: Restore scholar_status
  let updated = 0;
  let skipped = 0;

  for (const student of students) {
    const recovery = recoveredMap.get(student.admission_number);
    if (!recovery) {
      skipped++;
      continue;
    }

    await masterPool.query(
      'UPDATE students SET scholar_status = ? WHERE id = ?',
      [recovery.status, student.id]
    );

    const src = recovery.fromHistory ? 'history' : 'audit_log';
    console.log(`  Restored ${student.admission_number}: NULL → "${recovery.status}" (from ${src}, raw="${recovery.raw}", at=${String(recovery.at).substring(0, 19)})`);
    updated++;
  }

  const notRecoverable = students.length - updated - skipped;
  console.log(`\nDone.`);
  console.log(`  Restored: ${updated}`);
  console.log(`  No data found (genuinely new/unset): ${skipped}`);
  console.log(`\nNote: ${skipped} students have NO scholar_status in audit log or history — they never had one set.`);

  await masterPool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

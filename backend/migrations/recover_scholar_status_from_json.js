/**
 * Migration: recover_scholar_status_from_json.js
 *
 * Recovers scholar_status for students with NULL/empty scholar_status
 * by reading the scholar_status value from the student_data JSON field.
 *
 * The student_data JSON column stores the original admission form data
 * which includes scholar_status (e.g. "Eligible", "Not Eligible", "ELIGIBLE").
 *
 * Usage:
 *   node backend/migrations/recover_scholar_status_from_json.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = new Set(['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied']);

const normalizeEligible = (value) => {
  if (!value) return null;
  let v = String(value).trim().toLowerCase();
  if (v === 'eligible') return 'eligible';
  if (v === 'not eligible' || v === 'not_eligible' || v === 'not-eligible' || v === 'noteligible') return 'not_eligible';
  if (v === 'rejected') return 'rejected';
  if (v === 'pending') return 'pending';
  if (v === 'not applied' || v === 'not_applied' || v === 'not-applied') return 'not_applied';
  return null;
};

async function run() {
  console.log('=== Recover Scholar Status from student_data JSON field ===');

  // Find all students with NULL/empty scholar_status who have scholar_status in their student_data JSON
  const [students] = await masterPool.query(`
    SELECT id, admission_number, scholar_status,
           JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.scholar_status')) AS json_scholar_status,
           JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.registrationFormData.scholar_status')) AS json_reg_scholar_status
    FROM students
    WHERE student_status = 'Regular'
      AND (scholar_status IS NULL OR TRIM(scholar_status) = ''
           OR LOWER(TRIM(scholar_status)) NOT IN ('eligible','not_eligible','rejected','pending','not_applied'))
      AND JSON_VALID(student_data)
      AND (
        JSON_EXTRACT(student_data, '$.scholar_status') IS NOT NULL
        OR JSON_EXTRACT(student_data, '$.registrationFormData.scholar_status') IS NOT NULL
      )
    ORDER BY id ASC
  `);

  console.log(`Found ${students.length} students to recover from student_data JSON`);
  if (!students.length) {
    console.log('Nothing to recover. Exiting.');
    await masterPool.end();
    return;
  }

  let updated = 0;
  let skipped = 0;
  const breakdown = { eligible: 0, not_eligible: 0, rejected: 0, pending: 0, not_applied: 0 };

  for (const student of students) {
    // Try top-level scholar_status first, then registrationFormData fallback
    const rawValue = student.json_scholar_status || student.json_reg_scholar_status;
    const normalized = normalizeEligible(rawValue);

    if (!normalized) {
      console.log(`  SKIP ${student.admission_number}: unrecognized value "${rawValue}"`);
      skipped++;
      continue;
    }

    await masterPool.query(
      'UPDATE students SET scholar_status = ? WHERE id = ?',
      [normalized, student.id]
    );

    breakdown[normalized] = (breakdown[normalized] || 0) + 1;
    console.log(`  Restored ${student.admission_number}: NULL → "${normalized}" (from JSON: "${rawValue}")`);
    updated++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Restored: ${updated}`);
  console.log(`Skipped (unrecognized value): ${skipped}`);
  console.log(`\nBreakdown:`);
  Object.entries(breakdown).forEach(([k, v]) => v > 0 && console.log(`  ${k}: ${v}`));

  await masterPool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

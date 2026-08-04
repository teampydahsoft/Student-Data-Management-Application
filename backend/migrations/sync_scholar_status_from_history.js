/**
 * Migration: sync_scholar_status_from_history.js
 *
 * For students whose `scholar_status` column is NULL or empty, but who have
 * scholarship data recorded in `student_scholarship`, this script back-fills
 * `scholar_status` using the most recent eligible value across ALL years
 * (not just the current year). This fixes last-year students showing as
 * "pending" in the registration report.
 *
 * Safe to run multiple times — only updates rows where scholar_status is missing.
 *
 * Usage:
 *   node backend/migrations/sync_scholar_status_from_history.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = new Set(['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied']);

const normalizeEligible = (value) => {
  let normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'not eligible' || normalized === 'not-eligible') normalized = 'not_eligible';
  if (normalized === 'not applied' || normalized === 'not-applied') normalized = 'not_applied';
  return VALID_ELIGIBLE.has(normalized) ? normalized : null;
};

async function run() {
  console.log('=== Scholar Status Sync Migration ===');

  // Find students with no scholar_status but who have scholarship rows
  const [studentsToFix] = await masterPool.query(`
    SELECT DISTINCT s.id, s.admission_number, s.scholar_status, s.current_year, s.current_semester
    FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
    WHERE (
      s.scholar_status IS NULL
      OR TRIM(s.scholar_status) = ''
      OR LOWER(TRIM(s.scholar_status)) NOT IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
    )
    AND EXISTS (
      SELECT 1 FROM student_scholarship ss
      WHERE ss.student_id = s.id
        AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
        AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
    )
  `);

  console.log(`Found ${studentsToFix.length} students needing scholar_status sync`);

  if (studentsToFix.length === 0) {
    console.log('Nothing to update. Exiting.');
    await masterPool.end();
    return;
  }

  const studentIds = studentsToFix.map((s) => s.id);

  // For each student, get the most recent eligible value prioritising current_year,
  // then falling back to the latest year with data
  const [scholarshipRows] = await masterPool.query(`
    SELECT ss.student_id, ss.eligible, ss.student_year, ss.updated_at, ss.id,
           s.current_year
    FROM student_scholarship ss
    INNER JOIN students s ON s.id = ss.student_id
    WHERE ss.student_id IN (?)
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
    ORDER BY
      ss.student_id ASC,
      -- prefer current_year match, then highest year (last year first), then latest updated
      CASE WHEN ss.student_year = GREATEST(1, IFNULL(s.current_year, 1)) THEN 0 ELSE 1 END ASC,
      ss.student_year DESC,
      ss.updated_at DESC,
      ss.id DESC
  `, [studentIds]);

  // Build map: student_id → best eligible value
  const bestEligibleMap = new Map();
  for (const row of scholarshipRows) {
    if (!bestEligibleMap.has(row.student_id)) {
      const normalized = normalizeEligible(row.eligible);
      if (normalized) {
        bestEligibleMap.set(row.student_id, normalized);
      }
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const student of studentsToFix) {
    const newStatus = bestEligibleMap.get(student.id);
    if (!newStatus) {
      skipped++;
      continue;
    }

    await masterPool.query(
      'UPDATE students SET scholar_status = ? WHERE id = ?',
      [newStatus, student.id]
    );
    console.log(`  Updated ${student.admission_number} (id=${student.id}): ${student.scholar_status || 'NULL'} → ${newStatus}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (no scholarship data): ${skipped}`);
  await masterPool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

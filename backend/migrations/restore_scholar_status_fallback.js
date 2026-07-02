/**
 * Migration: restore_scholar_status_fallback.js
 *
 * For students whose scholar_status was cleared (is NULL/empty) but who have
 * scholarship data in student_scholarship for ANY year, restore scholar_status
 * using:
 *   1. Current year + current semester eligible  ← exact match
 *   2. Current year, any semester                ← year fallback
 *   3. Most recent year with data (highest year number) ← history fallback
 *
 * This keeps the registration report showing the right scholarship status
 * while preserving visibility of historical data.
 *
 * Usage:
 *   node backend/migrations/restore_scholar_status_fallback.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { masterPool } = require('../config/database');

const VALID_ELIGIBLE = new Set(['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied']);

const normalizeEligible = (value) => {
  let v = String(value || '').trim().toLowerCase();
  if (v === 'not eligible' || v === 'not-eligible') v = 'not_eligible';
  if (v === 'not applied' || v === 'not-applied') v = 'not_applied';
  return VALID_ELIGIBLE.has(v) ? v : null;
};

async function run() {
  console.log('=== Restore Scholar Status Fallback Migration ===');

  // Find students with no scholar_status but who have scholarship rows in any year
  const [students] = await masterPool.query(`
    SELECT s.id, s.admission_number, s.current_year, s.current_semester, s.scholar_status
    FROM students s
    WHERE (s.scholar_status IS NULL OR TRIM(s.scholar_status) = ''
           OR LOWER(TRIM(s.scholar_status)) NOT IN ('eligible','not_eligible','rejected','pending','not_applied'))
      AND EXISTS (
        SELECT 1 FROM student_scholarship ss
        WHERE ss.student_id = s.id
          AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
          AND LOWER(TRIM(ss.eligible)) IN ('eligible','not_eligible','rejected','pending','not_applied')
      )
    ORDER BY s.id ASC
  `);

  console.log(`Found ${students.length} students to restore`);
  if (!students.length) {
    console.log('Nothing to restore. Exiting.');
    await masterPool.end();
    return;
  }

  const studentIds = students.map(s => s.id);

  // Fetch all scholarship rows for these students, ordered so best match comes first
  const [rows] = await masterPool.query(`
    SELECT ss.student_id, ss.student_year, ss.student_semester, ss.eligible,
           s.current_year, s.current_semester
    FROM student_scholarship ss
    INNER JOIN students s ON s.id = ss.student_id
    WHERE ss.student_id IN (?)
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible','not_eligible','rejected','pending','not_applied')
    ORDER BY
      ss.student_id ASC,
      -- 1. prefer current year
      CASE WHEN ss.student_year = GREATEST(1, IFNULL(s.current_year, 1)) THEN 0 ELSE 1 END ASC,
      -- 2. prefer current semester within current year
      CASE WHEN ss.student_semester = GREATEST(1, IFNULL(s.current_semester, 1)) THEN 0 ELSE 1 END ASC,
      -- 3. among other years, prefer highest (most recent) year
      ss.student_year DESC,
      ss.student_semester ASC,
      ss.updated_at DESC,
      ss.id DESC
  `, [studentIds]);

  // Best eligible per student (first row wins due to ordering above)
  const bestMap = new Map();
  for (const row of rows) {
    if (!bestMap.has(row.student_id)) {
      const normalized = normalizeEligible(row.eligible);
      if (normalized) {
        bestMap.set(row.student_id, {
          eligible: normalized,
          year: row.student_year,
          semester: row.student_semester,
          currentYear: row.current_year,
          currentSemester: row.current_semester
        });
      }
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const student of students) {
    const best = bestMap.get(student.id);
    if (!best) { skipped++; continue; }

    await masterPool.query(
      'UPDATE students SET scholar_status = ? WHERE id = ?',
      [best.eligible, student.id]
    );

    const source = best.year === best.currentYear
      ? `current year ${best.year}`
      : `history year ${best.year} (current is ${best.currentYear})`;

    console.log(`  Restored ${student.admission_number}: NULL → "${best.eligible}" (from ${source}, sem=${best.semester ?? 'null'})`);
    updated++;
  }

  console.log(`\nDone. Restored: ${updated}, Skipped (no data): ${skipped}`);
  await masterPool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

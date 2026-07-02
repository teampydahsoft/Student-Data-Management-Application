/**
 * Migration: resync_scholar_status_sem_wise.js
 *
 * Re-syncs `students.scholar_status` for ALL students to match the logic used
 * by fetchScholarshipPayload (and the student view dialog):
 *
 *   1. current year + current semester eligible  ← exact match
 *   2. current year, any other semester eligible ← year-level fallback
 *   3. NULL / empty if no scholarship data exists
 *
 * This ensures the registration report scholarship stage and the student dialog
 * show the same value.
 *
 * Safe to run multiple times.
 *
 * Usage:
 *   node backend/migrations/resync_scholar_status_sem_wise.js
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
  console.log('=== Scholar Status Semester-Wise Re-sync Migration ===');

  // Fetch all regular students
  const [students] = await masterPool.query(`
    SELECT id, admission_number, current_year, current_semester, scholar_status
    FROM students
    WHERE student_status = 'Regular'
    ORDER BY id ASC
  `);

  console.log(`Processing ${students.length} students...`);

  if (!students.length) {
    console.log('No students found. Exiting.');
    await masterPool.end();
    return;
  }

  const studentIds = students.map((s) => s.id);

  // Fetch all current-year scholarship rows for these students
  // We need: student_id, student_year, student_semester, eligible
  const [scholarshipRows] = await masterPool.query(`
    SELECT ss.student_id, ss.student_year, ss.student_semester, ss.eligible,
           s.current_year, s.current_semester
    FROM student_scholarship ss
    INNER JOIN students s ON s.id = ss.student_id
    WHERE ss.student_id IN (?)
      AND ss.student_year = GREATEST(1, IFNULL(s.current_year, 1))
      AND ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
      AND LOWER(TRIM(ss.eligible)) IN ('eligible', 'not_eligible', 'rejected', 'pending', 'not_applied')
    ORDER BY
      ss.student_id ASC,
      -- prefer current_semester match, then any other semester
      CASE
        WHEN ss.student_semester = GREATEST(1, IFNULL(s.current_semester, 1)) THEN 0
        ELSE 1
      END ASC,
      ss.student_semester ASC,
      ss.updated_at DESC,
      ss.id DESC
  `, [studentIds]);

  // Build map: student_id → best eligible
  const bestEligibleMap = new Map();
  for (const row of scholarshipRows) {
    if (!bestEligibleMap.has(row.student_id)) {
      const normalized = normalizeEligible(row.eligible);
      if (normalized) bestEligibleMap.set(row.student_id, normalized);
    }
  }

  let updated = 0;
  let cleared = 0;
  let unchanged = 0;

  for (const student of students) {
    const correctStatus = bestEligibleMap.get(student.id) || null;
    const currentStatus = normalizeEligible(student.scholar_status) || null;

    if (correctStatus === currentStatus) {
      unchanged++;
      continue;
    }

    await masterPool.query(
      'UPDATE students SET scholar_status = ? WHERE id = ?',
      [correctStatus, student.id]
    );

    if (correctStatus) {
      console.log(`  Updated ${student.admission_number}: "${currentStatus || 'NULL'}" → "${correctStatus}" (year=${student.current_year}, sem=${student.current_semester})`);
      updated++;
    } else {
      console.log(`  Cleared ${student.admission_number}: "${currentStatus}" → NULL (no scholarship data for current year)`);
      cleared++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Cleared: ${cleared}, Unchanged: ${unchanged}`);
  await masterPool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

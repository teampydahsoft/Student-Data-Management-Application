/**
 * Migration: archive_scholarship_to_history.js
 *
 * For every student who has data in student_scholarship, ensure all their
 * year-wise scholarship data is recorded in student_scholarship_history so
 * it appears in the scholarship history tab view.
 *
 * This does NOT duplicate already-archived records — it checks if a record
 * for that student+year already exists with source='scholarship_status_sync'
 * and skips it.
 *
 * Usage:
 *   node backend/migrations/archive_scholarship_to_history.js
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
  console.log('=== Archive Scholarship Data to History Migration ===');

  // Get all students who have scholarship data
  const [students] = await masterPool.query(`
    SELECT DISTINCT s.id, s.admission_number, s.current_year, s.current_semester
    FROM students s
    INNER JOIN student_scholarship ss ON ss.student_id = s.id
    WHERE ss.eligible IS NOT NULL AND TRIM(ss.eligible) != ''
    ORDER BY s.id ASC
  `);

  console.log(`Found ${students.length} students with scholarship data`);

  if (!students.length) {
    console.log('No students found. Exiting.');
    await masterPool.end();
    return;
  }

  // Get all scholarship rows grouped by student+year
  const studentIds = students.map(s => s.id);
  const [allRows] = await masterPool.query(`
    SELECT student_id, student_year, student_semester, application_id,
           eligible, sanctioned_amount, released_amount, from_date
    FROM student_scholarship
    WHERE student_id IN (?)
    ORDER BY student_id ASC, student_year ASC, student_semester ASC, id ASC
  `, [studentIds]);

  // Group by student_id → student_year → rows[]
  const byStudent = new Map();
  for (const row of allRows) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, new Map());
    const byYear = byStudent.get(row.student_id);
    if (!byYear.has(row.student_year)) byYear.set(row.student_year, []);
    byYear.get(row.student_year).push(row);
  }

  // Check existing history records to avoid duplicates
  const [existingHistory] = await masterPool.query(`
    SELECT student_id, academic_year, source
    FROM student_scholarship_history
    WHERE student_id IN (?) AND source = 'scholarship_status_sync'
  `, [studentIds]);

  const alreadyArchived = new Set(
    existingHistory.map(r => `${r.student_id}|${r.academic_year}`)
  );

  // Build student map
  const studentMap = new Map(students.map(s => [s.id, s]));

  let inserted = 0;
  let skipped = 0;

  for (const [studentId, yearMap] of byStudent) {
    const student = studentMap.get(studentId);
    if (!student) continue;

    for (const [studentYear, rows] of yearMap) {
      const key = `${studentId}|${studentYear}`;
      if (alreadyArchived.has(key)) {
        skipped++;
        continue;
      }

      // Build snapshot from this year's rows
      let applicationId = null;
      let sanctionedAmount = 0;
      let releasedAmount = 0;
      const semesters = [];
      const releases = [];
      let primaryEligible = null;

      for (const row of rows) {
        if (!applicationId && row.application_id) applicationId = row.application_id;
        if (!sanctionedAmount && row.sanctioned_amount) sanctionedAmount = Number(row.sanctioned_amount) || 0;

        const isRelease = Number(row.released_amount) > 0 || row.from_date;
        if (isRelease) {
          releasedAmount += Number(row.released_amount) || 0;
          releases.push({
            from_date: row.from_date || null,
            released_amount: Number(row.released_amount) || 0
          });
        } else if (row.student_semester != null) {
          const eligible = normalizeEligible(row.eligible);
          semesters.push({ student_semester: row.student_semester, eligible: eligible || '' });
          if (!primaryEligible && eligible) primaryEligible = eligible;
        } else if (row.eligible) {
          if (!primaryEligible) primaryEligible = normalizeEligible(row.eligible);
        }
      }

      // Build notes JSON (same pattern as archiveScholarshipYear in the app)
      let notes = JSON.stringify({
        application_id: applicationId,
        eligible: primaryEligible,
        sanctioned_amount: sanctionedAmount,
        released_amount: releasedAmount,
        semesters,
        release_count: releases.length,
        releases: releases.slice(0, 10) // cap to avoid oversized notes
      });
      if (notes.length > 255) {
        notes = JSON.stringify({
          application_id: applicationId,
          eligible: primaryEligible,
          sanctioned_amount: sanctionedAmount,
          released_amount: releasedAmount,
          release_count: releases.length
        }).slice(0, 255);
      }

      await masterPool.query(`
        INSERT INTO student_scholarship_history
          (student_id, admission_number, scholar_status, academic_year, academic_semester,
           source, notes)
        VALUES (?, ?, ?, ?, ?, 'scholarship_status_sync', ?)
      `, [
        studentId,
        student.admission_number,
        primaryEligible || '',
        studentYear,
        student.current_semester || null,
        notes
      ]);

      console.log(`  Archived ${student.admission_number} year=${studentYear} eligible="${primaryEligible || '—'}" (${semesters.length} sems, ${releases.length} releases)`);
      inserted++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped (already archived): ${skipped}`);
  await masterPool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

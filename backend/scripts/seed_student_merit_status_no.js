/**
 * Seed student_merit_status rows with default merit_status = 'no'
 * for every program year from start year through each student's current_year.
 *
 * Why: avoids opening ~7k student dialogs to set each year manually.
 *
 * Rules:
 * - Years 1..current_year (lateral-entry LATER/LSPOT start at Year 2)
 * - Only creates missing year rows, or fills NULL / empty status
 * - Does NOT overwrite existing 'yes' (or any existing value) unless --force
 *
 * Usage (from backend folder):
 *   node scripts/seed_student_merit_status_no.js
 *     → Dry run: logs what would be updated for each student (no DB writes)
 *
 *   node scripts/seed_student_merit_status_no.js --apply
 *     → Apply inserts/updates for all students
 *
 *   node scripts/seed_student_merit_status_no.js --apply --admission 24PU1A0501
 *     → Apply for a single admission number
 *
 *   node scripts/seed_student_merit_status_no.js --apply --force
 *     → Overwrite existing yes/no values to 'no' as well
 *
 *   node scripts/seed_student_merit_status_no.js --limit 50
 *     → Dry run only first 50 students (useful for smoke test)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { masterPool } = require('../config/database');
const { resolveScholarshipStartYear } = require('../utils/registrationBranchYear');
const {
  ensureMeritStatusTable
} = require('../controllers/studentMeritStatusController');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const admissionIndex = args.indexOf('--admission');
const admissionNumber = admissionIndex >= 0 ? String(args[admissionIndex + 1] || '').trim() : null;
const limitIndex = args.indexOf('--limit');
const limitArg = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : null;
const LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : null;
const BATCH_SIZE = 500;

const toInt = (value, fallback = 1) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const fetchStudents = async () => {
  const params = [];
  let sql = `
    SELECT id, admission_number, student_name, course, branch, batch,
           current_year, current_semester, stud_type, student_status
    FROM students
    WHERE 1=1
  `;

  if (admissionNumber) {
    sql += ' AND admission_number = ?';
    params.push(admissionNumber);
  }

  sql += ' ORDER BY id ASC';

  if (LIMIT) {
    sql += ' LIMIT ?';
    params.push(LIMIT);
  }

  const [rows] = await masterPool.query(sql, params);
  return rows;
};

const fetchExistingMeritMap = async (studentIds) => {
  const map = new Map();
  if (!studentIds.length) return map;

  for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
    const chunk = studentIds.slice(i, i + BATCH_SIZE);
    const [rows] = await masterPool.query(
      `SELECT student_id, student_year, merit_status
       FROM student_merit_status
       WHERE student_id IN (?)`,
      [chunk]
    );
    rows.forEach((row) => {
      if (!map.has(row.student_id)) map.set(row.student_id, new Map());
      map.get(row.student_id).set(Number(row.student_year), String(row.merit_status || '').trim().toLowerCase());
    });
  }

  return map;
};

const yearsToSeedForStudent = (student, existingByYear) => {
  const currentYear = Math.max(1, Math.min(10, toInt(student.current_year, 1)));
  const startYear = resolveScholarshipStartYear(student.stud_type);
  const years = [];

  for (let year = startYear; year <= currentYear; year += 1) {
    const existing = existingByYear?.get(year);
    if (!existing) {
      years.push({ student_year: year, action: 'insert', from: null, to: 'no' });
      continue;
    }
    if (FORCE && existing !== 'no') {
      years.push({ student_year: year, action: 'overwrite', from: existing, to: 'no' });
      continue;
    }
    if (!FORCE && existing !== 'yes' && existing !== 'no') {
      years.push({ student_year: year, action: 'fill', from: existing || null, to: 'no' });
    }
  }

  return years;
};

const applyRows = async (connection, studentId, years) => {
  for (const entry of years) {
    await connection.query(
      `INSERT INTO student_merit_status (student_id, student_year, merit_status)
       VALUES (?, ?, 'no')
       ON DUPLICATE KEY UPDATE merit_status = 'no', updated_at = CURRENT_TIMESTAMP`,
      [studentId, entry.student_year]
    );
  }
};

const formatYearChanges = (years) => years
  .map((entry) => {
    if (entry.action === 'insert') return `Y${entry.student_year}: (missing → no)`;
    if (entry.action === 'fill') return `Y${entry.student_year}: (empty → no)`;
    return `Y${entry.student_year}: (${entry.from} → no)`;
  })
  .join(', ');

const main = async () => {
  const startedAt = Date.now();

  console.log('============================================================');
  console.log(' Seed student merit status = no (up to current year)');
  console.log('============================================================');
  console.log(` Mode        : ${APPLY ? 'APPLY (writes to DB)' : 'DRY RUN (no writes)'}`);
  console.log(` Force       : ${FORCE ? 'yes (overwrite existing values)' : 'no (skip existing yes/no)'}`);
  console.log(` Admission   : ${admissionNumber || 'ALL'}`);
  console.log(` Limit       : ${LIMIT || 'none'}`);
  console.log('------------------------------------------------------------');

  try {
    await ensureMeritStatusTable();

    const students = await fetchStudents();
    console.log(` Loaded ${students.length} student(s)`);

    if (!students.length) {
      console.log(' Nothing to do.');
      return;
    }

    const existingMap = await fetchExistingMeritMap(students.map((s) => s.id));

    let wouldUpdate = 0;
    let skipped = 0;
    let yearsWouldWrite = 0;
    let updated = 0;
    let yearsWritten = 0;
    let errors = 0;

    const connection = APPLY ? await masterPool.getConnection() : null;

    try {
      if (APPLY) await connection.beginTransaction();

      for (let index = 0; index < students.length; index += 1) {
        const student = students[index];
        const label = `${student.admission_number || student.id}`
          + (student.student_name ? ` (${student.student_name})` : '');
        const existingByYear = existingMap.get(student.id) || new Map();
        const years = yearsToSeedForStudent(student, existingByYear);
        const progress = `[${index + 1}/${students.length}]`;

        if (!years.length) {
          skipped += 1;
          console.log(`${progress} SKIPPED  ${label} — already seeded through Year ${toInt(student.current_year, 1)}`);
          continue;
        }

        yearsWouldWrite += years.length;

        if (!APPLY) {
          wouldUpdate += 1;
          console.log(
            `${progress} WOULD UPDATE  ${label}`
            + ` | current_year=${toInt(student.current_year, 1)}`
            + ` | ${formatYearChanges(years)}`
          );
          continue;
        }

        try {
          await applyRows(connection, student.id, years);
          updated += 1;
          yearsWritten += years.length;
          console.log(
            `${progress} UPDATED  ${label}`
            + ` | current_year=${toInt(student.current_year, 1)}`
            + ` | ${formatYearChanges(years)}`
          );
        } catch (error) {
          errors += 1;
          console.error(`${progress} ERROR    ${label} — ${error.message}`);
        }
      }

      if (APPLY) {
        if (errors > 0) {
          await connection.rollback();
          console.error('------------------------------------------------------------');
          console.error(` Rolled back — ${errors} student error(s). No changes committed.`);
          process.exitCode = 1;
        } else {
          await connection.commit();
        }
      }
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch (_) { /* ignore */ }
      }
      throw error;
    } finally {
      if (connection) connection.release();
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('------------------------------------------------------------');
    if (APPLY) {
      console.log(` Done in ${elapsedSec}s`);
      console.log(` Students updated : ${updated}`);
      console.log(` Students skipped : ${skipped}`);
      console.log(` Year rows written: ${yearsWritten}`);
      console.log(` Errors           : ${errors}`);
      console.log('');
      console.log(' Important: restart the backend (or wait ~1 min for cache) and hard-refresh');
      console.log(' the Students page so the Merit column shows the seeded No values.');
    } else {
      console.log(` Dry run complete in ${elapsedSec}s`);
      console.log(` Students that would update : ${wouldUpdate}`);
      console.log(` Students already seeded    : ${skipped}`);
      console.log(` Year rows that would write : ${yearsWouldWrite}`);
      console.log('');
      console.log(' Run with --apply to write these changes to the database.');
      if (!FORCE) {
        console.log(' Tip: add --force to also overwrite existing yes/no values to no.');
      }
    }
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await masterPool.end();
  }
};

main();

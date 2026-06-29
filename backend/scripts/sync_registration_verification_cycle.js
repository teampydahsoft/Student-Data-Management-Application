/**
 * Sync per-semester registration verification fields in student_data.
 *
 * Legacy students may have is_student_mobile_verified / is_parent_mobile_verified
 * set to true without mobile_verified_year/semester (and parent_* cycle fields).
 * This script stamps those cycle fields from current_year / current_semester.
 *
 * Usage (from backend folder):
 *   node scripts/sync_registration_verification_cycle.js
 *     → Dry run. Logs each student that would change.
 *
 *   node scripts/sync_registration_verification_cycle.js --apply
 *     → Write updates one student at a time.
 *
 *   node scripts/sync_registration_verification_cycle.js --apply --reset-stale
 *     → Also clear verification when flags are true but cycle does NOT match
 *       current year/semester (e.g. leftover data after promotion).
 *
 *   node scripts/sync_registration_verification_cycle.js --apply --include-promotion
 *     → Also stamp registration_promotion_year/semester when year/sem exist but
 *       promotion cycle fields are missing (legacy promotion step).
 *
 *   node scripts/sync_registration_verification_cycle.js --admission 2024ABC001
 *     → Process a single student only.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { masterPool } = require('../config/database');
const {
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle,
  stampVerificationForCycle,
  stampPromotionForCycle,
  resetRegistrationCycle
} = require('../services/registrationCycle');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESET_STALE = args.includes('--reset-stale');
const INCLUDE_PROMOTION = args.includes('--include-promotion');
const admissionArgIndex = args.indexOf('--admission');
const ADMISSION_FILTER = admissionArgIndex >= 0 ? args[admissionArgIndex + 1] : null;

const parseJSON = (value) => {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};

const toStage = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const hasCycleStamp = (yearField, semField) => (
  yearField !== undefined
  && yearField !== null
  && String(yearField).trim() !== ''
  && semField !== undefined
  && semField !== null
  && String(semField).trim() !== ''
);

const cycleMatches = (dataYear, dataSem, currentYear, currentSemester) => (
  hasCycleStamp(dataYear, dataSem)
  && toStage(dataYear) === toStage(currentYear)
  && toStage(dataSem) === toStage(currentSemester)
);

const needsStudentStamp = (data, year, sem) => (
  data.is_student_mobile_verified === true
  && !cycleMatches(data.mobile_verified_year, data.mobile_verified_semester, year, sem)
);

const needsParentStamp = (data, year, sem) => (
  data.is_parent_mobile_verified === true
  && !cycleMatches(data.parent_verified_year, data.parent_verified_semester, year, sem)
);

const needsPromotionStamp = (data, year, sem) => (
  year && sem
  && !isPromotionCompleteForCycle(data, year, sem)
);

const hasStaleVerification = (data, year, sem) => {
  const studentStale = data.is_student_mobile_verified === true
    && !cycleMatches(data.mobile_verified_year, data.mobile_verified_semester, year, sem);
  const parentStale = data.is_parent_mobile_verified === true
    && !cycleMatches(data.parent_verified_year, data.parent_verified_semester, year, sem);
  return studentStale || parentStale;
};

const buildPlan = (student, data) => {
  const year = student.current_year;
  const semester = student.current_semester;
  const actions = [];

  if (RESET_STALE && hasStaleVerification(data, year, semester)) {
    actions.push('reset-stale-verification');
  } else {
    if (needsStudentStamp(data, year, semester)) {
      actions.push('stamp-student');
    }
    if (needsParentStamp(data, year, semester)) {
      actions.push('stamp-parent');
    }
  }
  if (INCLUDE_PROMOTION && needsPromotionStamp(data, year, semester)) {
    actions.push('stamp-promotion');
  }

  return actions;
};

const applyPlan = (data, actions, year, semester) => {
  if (actions.includes('reset-stale-verification')) {
    resetRegistrationCycle(data);
    return;
  }

  if (actions.includes('stamp-student')) {
    stampVerificationForCycle(data, 'student', year, semester);
  }
  if (actions.includes('stamp-parent')) {
    stampVerificationForCycle(data, 'parent', year, semester);
  }
  if (actions.includes('stamp-promotion')) {
    stampPromotionForCycle(data, year, semester);
  }
};

const describeActions = (actions, year, semester) => {
  if (!actions.length) return 'no change';
  return actions.map((action) => {
    if (action === 'reset-stale-verification') return 'reset verification (stale cycle)';
    if (action === 'stamp-student') return `stamp student verification → Y${toStage(year)} S${toStage(semester)}`;
    if (action === 'stamp-parent') return `stamp parent verification → Y${toStage(year)} S${toStage(semester)}`;
    if (action === 'stamp-promotion') return `stamp promotion ack → Y${toStage(year)} S${toStage(semester)}`;
    return action;
  }).join('; ');
};

(async () => {
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
  console.log(`Mode: ${APPLY ? 'APPLY (writes DB)' : 'DRY RUN'}`);
  console.log(`Options: reset-stale=${RESET_STALE}, include-promotion=${INCLUDE_PROMOTION}`);
  console.log(`Students to scan: ${students.length}\n`);

  let planned = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index];
    const label = `[${index + 1}/${students.length}] ${student.admission_number} ${student.student_name || ''}`.trim();

    try {
      const data = parseJSON(student.student_data);
      const actions = buildPlan(student, data);

      if (!actions.length) {
        skipped += 1;
        continue;
      }

      planned += 1;
      console.log(`${label} → ${describeActions(actions, student.current_year, student.current_semester)}`);

      if (!APPLY) {
        continue;
      }

      const nextData = { ...data };
      applyPlan(nextData, actions, student.current_year, student.current_semester);

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
  console.log(`Scanned:  ${students.length}`);
  console.log(`Planned:  ${planned}`);
  console.log(`Skipped:  ${skipped}`);
  if (APPLY) {
    console.log(`Updated:  ${updated}`);
    console.log(`Errors:   ${errors}`);
  } else if (planned > 0) {
    console.log('\nRe-run with --apply to write changes.');
  }

  process.exit(errors > 0 ? 1 : 0);
})().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});

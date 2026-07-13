/**
 * Dry-run: preview registration status updates for students on branches
 * with optional registration stages (scholarship optional, etc.).
 *
 * Uses the same rules as checkAndAutoCompleteRegistration — no DB writes.
 *
 * Academic year filter (default 2026-2027, all admission batches):
 *   batch_start_year + current_year - 1 = 2026
 *
 * Usage:
 *   node scripts/dryRunRegistrationAutoComplete.js
 *   node scripts/dryRunRegistrationAutoComplete.js --academic-year=2026-2027
 *   node scripts/dryRunRegistrationAutoComplete.js --batch=2026          (admission batch only)
 *   node scripts/dryRunRegistrationAutoComplete.js --academic-year=2026-2027 --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production') });
require('dotenv').config();

const { masterPool } = require('../config/database');
const {
  computeRegistrationStages,
  parseStudentData
} = require('../services/registrationStages');
const { resolveRegistrationScholarshipForStudent } = require('../services/studentScholarshipSync');

const formatRegistrationStatusLabel = (overallStatus) => {
  if (overallStatus === 'completed') return 'Completed';
  if (overallStatus === 'Temporary') return 'Temporary';
  return 'pending';
};

const parseAcademicYearFromYear = (label) => {
  if (!label) return null;
  const match = String(label).trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  return parseInt(match[1], 10);
};

const ACADEMIC_YEAR_LABEL = (() => {
  const arg = process.argv.find((a) => a.startsWith('--academic-year='));
  return arg ? arg.split('=')[1] : '2026-2027';
})();

const ACADEMIC_YEAR_START = parseAcademicYearFromYear(ACADEMIC_YEAR_LABEL);

const BATCH_YEAR = (() => {
  const arg = process.argv.find((a) => a.startsWith('--batch='));
  return arg ? Number(arg.split('=')[1]) : null;
})();

const APPLY = process.argv.includes('--apply');

const ACADEMIC_YEAR_SQL = `(
  CAST(REGEXP_SUBSTR(s.batch, '[0-9]{4}') AS UNSIGNED)
  + GREATEST(1, IFNULL(s.current_year, 1)) - 1
)`;

const loadRegistrationStageConfig = async () => {
  const [rows] = await masterPool.query(
    "SELECT value FROM settings WHERE `key` = 'registration_stage_config' LIMIT 1"
  );
  if (!rows.length) return {};
  try {
    const parsed = JSON.parse(rows[0].value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const { resolveOptionalStagesFromConfig } = require('../utils/registrationBranchYear');

const normalizeStatus = (value) => {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'completed') return 'Completed';
  if (s === 'temporary') return 'Temporary';
  return 'pending';
};

const buildOptionalBranchMap = (stageConfig) => {
  const map = new Map();
  for (const [key, val] of Object.entries(stageConfig)) {
    const [branch, year] = key.split('::');
    if (!branch || !year) continue;
    const stages = val?.optionalStages || [];
    if (!stages.length) continue;
    if (!map.has(branch)) map.set(branch, []);
    map.get(branch).push({ year: Number(year), optionalStages: stages });
  }
  return map;
};

const columnExists = async (tableName, columnName) => {
  const [rows] = await masterPool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const buildStudentQuery = (useBatchFilter) => {
  const filters = ["s.student_status = 'Regular'"];
  const params = [];

  if (useBatchFilter && BATCH_YEAR != null) {
    filters.push('CAST(REGEXP_SUBSTR(s.batch, \'[0-9]{4}\') AS UNSIGNED) = ?');
    params.push(BATCH_YEAR);
  } else if (ACADEMIC_YEAR_START != null) {
    filters.push(`${ACADEMIC_YEAR_SQL} = ?`);
    params.push(ACADEMIC_YEAR_START);
  }

  return {
    sql: `
      SELECT id, admission_number, student_name, batch, branch, course, college,
             current_year, current_semester, student_data, certificates_status,
             fee_status, scholar_status, registration_status, stud_type, student_status
      FROM students s
      WHERE ${filters.join(' AND ')}
      ORDER BY s.batch, s.branch, s.current_year, s.admission_number
    `,
    params
  };
};

async function dryRunRegistrationAutoComplete() {
  console.log('🔍 Registration auto-complete dry run');
  if (BATCH_YEAR != null) {
    console.log(`   Filter: admission batch ${BATCH_YEAR}`);
  } else {
    console.log(`   Filter: academic year ${ACADEMIC_YEAR_LABEL} (all admission batches)`);
    console.log(`   Formula: batch_start + program_year - 1 = ${ACADEMIC_YEAR_START}`);
  }
  console.log(`   Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  console.log('--------------------------------------------------\n');

  const stageConfig = await loadRegistrationStageConfig();
  const optionalBranchMap = buildOptionalBranchMap(stageConfig);

  console.log(`Branches with optional stages configured: ${optionalBranchMap.size}`);
  [...optionalBranchMap.entries()].forEach(([branch, years]) => {
    const summary = years
      .map((y) => `Y${y.year}=[${y.optionalStages.join(', ')}]`)
      .sort((a, b) => a.localeCompare(b))
      .join('; ');
    console.log(`  • ${branch}: ${summary}`);
  });
  console.log('');

  const { sql, params } = buildStudentQuery(BATCH_YEAR != null);
  const [allAyStudents] = await masterPool.query(sql, params);

  console.log(
    `Students in scope (${BATCH_YEAR != null ? `batch ${BATCH_YEAR}` : `AY ${ACADEMIC_YEAR_LABEL}`}, all branches): ${allAyStudents.length}`
  );

  const students = allAyStudents.filter((student) => {
    const optionalStages = resolveOptionalStagesFromConfig(
      stageConfig,
      student.branch,
      student.current_year
    );
    return optionalStages.length > 0;
  });

  console.log(`Students on optional-stage branches (their program year): ${students.length}\n`);

  const byAdmissionBatch = new Map();
  allAyStudents.forEach((s) => {
    const b = s.batch || 'Unknown';
    byAdmissionBatch.set(b, (byAdmissionBatch.get(b) || 0) + 1);
  });
  console.log('=== All AY students by admission batch ===');
  [...byAdmissionBatch.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .forEach(([batch, count]) => console.log(`  ${batch}: ${count}`));
  console.log('');

  const summary = {
    total: students.length,
    alreadyCorrect: 0,
    wouldUpdate: 0,
    wouldStayPending: 0,
    statusMismatch: 0,
    toCompleted: 0,
    toTemporary: 0,
    dbRegistrationStatus: {},
    pendingBlockers: {
      verification: 0,
      certificates: 0,
      fee: 0,
      scholarship: 0
    },
    byBranch: new Map(),
    byAdmissionBatch: new Map(),
    updates: []
  };

  const hasRegColumn = await columnExists('students', 'registration_status');

  for (const student of students) {
    const studentData = parseStudentData(student);
    const optionalStages = resolveOptionalStagesFromConfig(
      stageConfig,
      student.branch,
      student.current_year
    );

    const scholarshipCtx = await resolveRegistrationScholarshipForStudent(
      masterPool,
      student,
      optionalStages
    );
    const stages = computeRegistrationStages(
      student,
      studentData,
      scholarshipCtx.eligible,
      scholarshipCtx.feePaid,
      optionalStages
    );

    const computedLabel = formatRegistrationStatusLabel(stages.overallStatus);
    const currentLabel = normalizeStatus(student.registration_status);
    const dbKey = String(student.registration_status || 'pending').trim().toLowerCase();
    summary.dbRegistrationStatus[dbKey] = (summary.dbRegistrationStatus[dbKey] || 0) + 1;

    const branchKey = student.branch || 'Unknown';
    const batchKey = student.batch || 'Unknown';

    if (!summary.byBranch.has(branchKey)) {
      summary.byBranch.set(branchKey, {
        total: 0, wouldUpdate: 0, toCompleted: 0, toTemporary: 0, pending: 0, alreadyCorrect: 0
      });
    }
    if (!summary.byAdmissionBatch.has(batchKey)) {
      summary.byAdmissionBatch.set(batchKey, {
        total: 0, wouldUpdate: 0, toCompleted: 0, toTemporary: 0, pending: 0, alreadyCorrect: 0
      });
    }

    const branchStats = summary.byBranch.get(branchKey);
    const batchStats = summary.byAdmissionBatch.get(batchKey);
    branchStats.total += 1;
    batchStats.total += 1;

    const isTerminal = computedLabel === 'Completed' || computedLabel === 'Temporary';
    const needsUpdate = isTerminal && currentLabel.toLowerCase() !== computedLabel.toLowerCase();

    if (needsUpdate) {
      summary.wouldUpdate += 1;
      branchStats.wouldUpdate += 1;
      batchStats.wouldUpdate += 1;
      if (computedLabel === 'Completed') {
        summary.toCompleted += 1;
        branchStats.toCompleted += 1;
        batchStats.toCompleted += 1;
      } else {
        summary.toTemporary += 1;
        branchStats.toTemporary += 1;
        batchStats.toTemporary += 1;
      }
      summary.updates.push({
        admission_number: student.admission_number,
        name: student.student_name,
        batch: student.batch,
        branch: student.branch,
        year: student.current_year,
        optionalStages,
        current: currentLabel,
        computed: computedLabel
      });

      if (APPLY) {
        if (hasRegColumn) {
          await masterPool.query(
            'UPDATE students SET registration_status = ? WHERE admission_number = ?',
            [computedLabel, student.admission_number]
          );
        }
        studentData.registration_status = computedLabel;
        studentData['Registration Status'] = computedLabel;
        await masterPool.query(
          'UPDATE students SET student_data = ? WHERE admission_number = ?',
          [JSON.stringify(studentData), student.admission_number]
        );
      }
    } else if (isTerminal && currentLabel.toLowerCase() === computedLabel.toLowerCase()) {
      summary.alreadyCorrect += 1;
      branchStats.alreadyCorrect += 1;
      batchStats.alreadyCorrect += 1;
    } else {
      summary.wouldStayPending += 1;
      branchStats.pending += 1;
      batchStats.pending += 1;
      if (
        (currentLabel === 'Completed' || currentLabel === 'Temporary')
        && computedLabel === 'pending'
      ) {
        summary.statusMismatch += 1;
      }
      if (!stages.verification.completed && !stages.verification.optional) {
        summary.pendingBlockers.verification += 1;
      }
      if (!stages.certificates.completed && !stages.certificates.optional) {
        summary.pendingBlockers.certificates += 1;
      }
      if (!stages.fee.completed && !stages.fee.optional) {
        summary.pendingBlockers.fee += 1;
      }
      if (!stages.scholarship.completed && !stages.scholarship.optional) {
        summary.pendingBlockers.scholarship += 1;
      }
    }
  }

  console.log('=== Optional-branch cohort summary ===');
  console.log(`Total evaluated:        ${summary.total}`);
  console.log(`Already correct:        ${summary.alreadyCorrect}`);
  console.log(`Would update:           ${summary.wouldUpdate}`);
  console.log(`  → to Completed:       ${summary.toCompleted}`);
  console.log(`  → to Temporary:       ${summary.toTemporary}`);
  console.log(`Would stay Pending:     ${summary.wouldStayPending}`);
  console.log('');
  console.log('Current DB registration_status:');
  Object.entries(summary.dbRegistrationStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => console.log(`  ${status}: ${count}`));
  console.log('');
  console.log('Why pending students are blocked (can count multiple per student):');
  console.log(`  Verification not done:  ${summary.pendingBlockers.verification}`);
  console.log(`  Certificates not done:  ${summary.pendingBlockers.certificates}`);
  console.log(`  Fee not cleared:        ${summary.pendingBlockers.fee}`);
  console.log(`  Scholarship required:   ${summary.pendingBlockers.scholarship}`);
  console.log(`DB says Completed/Temporary but rules say Pending: ${summary.statusMismatch}`);
  console.log('');

  console.log('=== By admission batch (optional-branch cohort) ===');
  [...summary.byAdmissionBatch.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .forEach(([batch, stats]) => {
      console.log(
        `${batch}: total=${stats.total}, wouldUpdate=${stats.wouldUpdate} ` +
        `(Completed=${stats.toCompleted}, Temporary=${stats.toTemporary}), ` +
        `alreadyCorrect=${stats.alreadyCorrect}, pending=${stats.pending}`
      );
    });
  console.log('');

  console.log('=== By branch (optional-branch cohort) ===');
  [...summary.byBranch.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([branch, stats]) => {
      console.log(
        `${branch}: total=${stats.total}, wouldUpdate=${stats.wouldUpdate} ` +
        `(Completed=${stats.toCompleted}, Temporary=${stats.toTemporary}), ` +
        `alreadyCorrect=${stats.alreadyCorrect}, pending=${stats.pending}`
      );
    });

  if (summary.updates.length > 0) {
    console.log('\n=== Sample updates (first 25) ===');
    summary.updates.slice(0, 25).forEach((row) => {
      console.log(
        `  ${row.admission_number} | batch ${row.batch} | ${row.branch} Y${row.year} | ` +
        `${row.current} → ${row.computed} | optional=[${row.optionalStages.join(', ')}]`
      );
    });
    if (summary.updates.length > 25) {
      console.log(`  ... and ${summary.updates.length - 25} more`);
    }
  }

  if (APPLY && summary.wouldUpdate > 0) {
    console.log(`\n✅ Applied ${summary.wouldUpdate} registration status update(s).`);
  } else if (!APPLY && summary.wouldUpdate > 0) {
    console.log('\n💡 Re-run with --apply to write these updates.');
  }

  await masterPool.end();
}

dryRunRegistrationAutoComplete().catch((err) => {
  console.error('Dry run failed:', err);
  process.exit(1);
});

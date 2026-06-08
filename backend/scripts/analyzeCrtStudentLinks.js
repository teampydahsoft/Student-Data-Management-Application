/**
 * Analyze SDMS students vs CRT (AI-VERSANT MongoDB) profile links by PIN / admission.
 *
 * Usage:
 *   node scripts/analyzeCrtStudentLinks.js
 *   node scripts/analyzeCrtStudentLinks.js --batch 2027
 *   node scripts/analyzeCrtStudentLinks.js --batch 2027 --limit 50
 *   node scripts/analyzeCrtStudentLinks.js --unlinked-only
 */
require('dotenv').config();
const { masterPool } = require('../config/database');
const { getVersantDb, closeVersantDb, isVersantConfigured } = require('../config/versantDb');
const {
  analyzeSdmsCrtLinks,
} = require('../services/versantTestResultsService');

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : null;
  };
  const batch = getArg('--batch');
  const course = getArg('--course');
  const limit = getArg('--limit') ? parseInt(getArg('--limit'), 10) : null;
  const unlinkedOnly = args.includes('--unlinked-only');

  if (!isVersantConfigured()) {
    console.error('MONGODB_URI is not configured in backend/.env');
    process.exit(1);
  }

  try {
    const report = await analyzeSdmsCrtLinks({ batch, course, limit });
    const rows = unlinkedOnly
      ? report.students.filter((s) => !s.crtLinked)
      : report.students;

    console.log('\n=== SDMS ↔ CRT Student Link Analysis ===\n');
    console.log(`Filters: batch=${batch || 'all'} course=${course || 'all'} limit=${limit || 'none'}`);
    console.log(`Total SDMS Regular students scanned: ${report.summary.total}`);
    console.log(`Linked to CRT: ${report.summary.linked}`);
    console.log(`Not linked: ${report.summary.unlinked}`);
    console.log(`Has portal credentials: ${report.summary.withCredentials}`);
    console.log(`Missing portal credentials: ${report.summary.withoutCredentials}`);
    console.log('');

    if (rows.length === 0) {
      console.log('No students to display.');
      return;
    }

    console.log(
      ['PIN', 'Admission', 'Name', 'Batch', 'CRT', 'Portal Login', 'Match Field'].join(' | '),
    );
    console.log('-'.repeat(100));
    for (const row of rows.slice(0, 100)) {
      console.log(
        [
          row.pinNo || '—',
          row.admissionNumber || '—',
          (row.studentName || '—').slice(0, 24),
          row.batch || '—',
          row.crtLinked ? 'YES' : 'NO',
          row.hasCredentials ? row.loginUsername || 'yes' : 'NO',
          row.crtMatchField || '—',
        ].join(' | '),
      );
    }
    if (rows.length > 100) {
      console.log(`\n... and ${rows.length - 100} more`);
    }
  } finally {
    await closeVersantDb();
    await masterPool.end();
  }
}

main().catch((err) => {
  console.error('Analysis failed:', err.message);
  process.exit(1);
});

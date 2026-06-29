/**
 * Auto-mark Management Quota (MANG/MQ), Spot (SPOT), and Lateral Spot (LSPOT)
 * students as scholarship not eligible (rejected) for all academic years.
 *
 * Usage (from backend folder):
 *   node scripts/sync_ineligible_quota_scholarships.js
 *     → Dry run (counts matching students only).
 *
 *   node scripts/sync_ineligible_quota_scholarships.js --apply
 *     → Write student_scholarship rows + students.scholar_status.
 *
 *   node scripts/sync_ineligible_quota_scholarships.js --apply --admission 2024ABC001
 *     → Process a single student.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { masterPool } = require('../config/database');
const { syncAllIneligibleQuotaScholarships } = require('../services/studentScholarshipSync');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const admissionIndex = args.indexOf('--admission');
const admissionNumber = admissionIndex >= 0 ? args[admissionIndex + 1] : null;

const main = async () => {
  try {
    if (!APPLY) {
      const [rows] = await masterPool.query(
        `SELECT COUNT(*) AS total
         FROM students
         WHERE UPPER(TRIM(IFNULL(stud_type, ''))) IN ('MANG', 'MQ', 'SPOT', 'LSPOT')
         ${admissionNumber ? 'AND admission_number = ?' : ''}`,
        admissionNumber ? [admissionNumber] : []
      );
      const total = rows[0]?.total || 0;
      console.log(`Dry run: ${total} student(s) match Management / Spot / Lateral Spot quotas.`);
      console.log('Run with --apply to update scholarship records in the database.');
      return;
    }

    const result = await syncAllIneligibleQuotaScholarships(masterPool, { admissionNumber });
    console.log(
      `Applied ineligible-quota scholarship sync: ${result.updated}/${result.total} student(s) updated`
      + (admissionNumber ? ` (admission ${admissionNumber})` : '')
      + '.'
    );
  } catch (error) {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  } finally {
    await masterPool.end();
  }
};

main();

/**
 * NOTE: Real-time student creations, edits, profile change approvals, and submission approvals
 * now directly edit both SDMS database (masterPool) and Admissions database (admissionsPool)
 * simultaneously in real time.
 *
 * Running a background sync service script continuously is no longer required.
 * This script is retained solely for optional manual bulk maintenance or verification.
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { bulkSyncAllStudentsToAdmissions } = require('../services/admissionsSyncService');

async function runBulkSync() {
  console.log('=== SDMS to Admissions DB Direct Sync Check Started ===');
  const startTime = Date.now();

  try {
    const stats = await bulkSyncAllStudentsToAdmissions({ batchSize: 50 });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`=== Sync Completed in ${duration}s ===`);
    console.log(`Total Students Processed: ${stats.totalProcessed}`);
    console.log(`Total Records Updated across admissions/leads/joinings: ${stats.totalUpdated}`);
    console.log(`Total Errors: ${stats.totalErrors}`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error during sync:', err);
    process.exit(1);
  }
}

runBulkSync();

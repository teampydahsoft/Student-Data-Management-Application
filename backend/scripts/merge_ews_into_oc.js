/**
 * Merge EWS caste values into OC on students.
 *
 * Usage:
 *   node backend/scripts/merge_ews_into_oc.js
 *   node backend/scripts/merge_ews_into_oc.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

// Match EWS variants case-insensitively via UPPER(TRIM(caste)) = 'EWS'
// Also catch common spellings if present
const EWS_EXACT = ['EWS', 'ews', 'Ews'];

(async () => {
  try {
    const [beforeRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'EWS'
           OR UPPER(TRIM(caste)) = 'OC'
           OR UPPER(TRIM(caste)) LIKE 'EWS%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    const [[{ toUpdate }]] = await masterPool.query(
      `SELECT COUNT(*) AS toUpdate
       FROM students
       WHERE UPPER(TRIM(caste)) = 'EWS'
          OR UPPER(TRIM(caste)) LIKE 'EWS%'`
    );

    console.log('--- Before (EWS / OC related) ---');
    beforeRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log(`Students to rename → OC: ${toUpdate}`);

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    if (Number(toUpdate) === 0) {
      console.log('Nothing to update.');
      process.exit(0);
    }

    let ocCasteId = null;
    const [ocSub] = await masterPool.query(
      `SELECT id FROM castes WHERE TRIM(name) = 'OC' ORDER BY id ASC LIMIT 1`
    );
    if (ocSub.length) ocCasteId = ocSub[0].id;

    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );
    const hasCasteId = Number(cols[0]?.count || 0) > 0;

    if (hasCasteId && ocCasteId != null) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'OC', caste_id = ?
         WHERE UPPER(TRIM(caste)) = 'EWS'
            OR UPPER(TRIM(caste)) LIKE 'EWS%'`,
        [ocCasteId]
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='OC', caste_id=${ocCasteId}`);
    } else if (hasCasteId) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'OC', caste_id = NULL
         WHERE UPPER(TRIM(caste)) = 'EWS'
            OR UPPER(TRIM(caste)) LIKE 'EWS%'`
      );
      console.log(
        `Updated ${result.affectedRows} student(s) → caste='OC', caste_id=NULL (no OC in Settings yet)`
      );
    } else {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'OC'
         WHERE UPPER(TRIM(caste)) = 'EWS'
            OR UPPER(TRIM(caste)) LIKE 'EWS%'`
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='OC'`);
    }

    // Clean Settings master EWS rows if present
    const [delCastes] = await masterPool.query(
      `DELETE FROM castes WHERE UPPER(TRIM(name)) = 'EWS' OR UPPER(TRIM(name)) LIKE 'EWS%'`
    );
    if (delCastes.affectedRows) {
      console.log(`Removed ${delCastes.affectedRows} Settings subcaste row(s) for EWS`);
    }
    const [delParents] = await masterPool.query(
      `DELETE FROM caste_categories WHERE UPPER(TRIM(name)) = 'EWS' OR UPPER(TRIM(name)) LIKE 'EWS%'`
    );
    if (delParents.affectedRows) {
      console.log(`Removed ${delParents.affectedRows} Settings caste row(s) for EWS`);
    }

    const [afterRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'EWS'
           OR UPPER(TRIM(caste)) = 'OC'
           OR UPPER(TRIM(caste)) LIKE 'EWS%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    console.log('--- After ---');
    afterRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to merge EWS into OC:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

/**
 * Merge kapu caste values into OC on students.
 *
 * Usage:
 *   node backend/scripts/merge_kapu_into_oc.js
 *   node backend/scripts/merge_kapu_into_oc.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

(async () => {
  try {
    const [beforeRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'OC'
           OR LOWER(TRIM(caste)) = 'kapu'
           OR LOWER(TRIM(caste)) LIKE 'kapu%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    const [[{ toUpdate }]] = await masterPool.query(
      `SELECT COUNT(*) AS toUpdate
       FROM students
       WHERE LOWER(TRIM(caste)) = 'kapu'
          OR LOWER(TRIM(caste)) LIKE 'kapu%'`
    );

    console.log('--- Before (kapu / OC related) ---');
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
         WHERE LOWER(TRIM(caste)) = 'kapu'
            OR LOWER(TRIM(caste)) LIKE 'kapu%'`,
        [ocCasteId]
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='OC', caste_id=${ocCasteId}`);
    } else if (hasCasteId) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'OC', caste_id = NULL
         WHERE LOWER(TRIM(caste)) = 'kapu'
            OR LOWER(TRIM(caste)) LIKE 'kapu%'`
      );
      console.log(
        `Updated ${result.affectedRows} student(s) → caste='OC', caste_id=NULL (no OC in Settings yet)`
      );
    } else {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'OC'
         WHERE LOWER(TRIM(caste)) = 'kapu'
            OR LOWER(TRIM(caste)) LIKE 'kapu%'`
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='OC'`);
    }

    const [delCastes] = await masterPool.query(
      `DELETE FROM castes WHERE LOWER(TRIM(name)) = 'kapu' OR LOWER(TRIM(name)) LIKE 'kapu%'`
    );
    if (delCastes.affectedRows) {
      console.log(`Removed ${delCastes.affectedRows} Settings subcaste row(s) for kapu`);
    }
    const [delParents] = await masterPool.query(
      `DELETE FROM caste_categories WHERE LOWER(TRIM(name)) = 'kapu' OR LOWER(TRIM(name)) LIKE 'kapu%'`
    );
    if (delParents.affectedRows) {
      console.log(`Removed ${delParents.affectedRows} Settings caste row(s) for kapu`);
    }

    const [afterRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'OC'
           OR LOWER(TRIM(caste)) = 'kapu'
           OR LOWER(TRIM(caste)) LIKE 'kapu%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    console.log('--- After ---');
    afterRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to merge kapu into OC:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

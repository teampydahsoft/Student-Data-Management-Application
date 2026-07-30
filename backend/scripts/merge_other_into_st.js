/**
 * Merge "Other" caste values into ST on students.
 *
 * Usage:
 *   node backend/scripts/merge_other_into_st.js
 *   node backend/scripts/merge_other_into_st.js --report-only
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
           UPPER(TRIM(caste)) = 'ST'
           OR UPPER(TRIM(caste)) = 'OTHER'
           OR UPPER(TRIM(caste)) LIKE 'OTHER%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    const [[{ toUpdate }]] = await masterPool.query(
      `SELECT COUNT(*) AS toUpdate
       FROM students
       WHERE UPPER(TRIM(caste)) = 'OTHER'
          OR UPPER(TRIM(caste)) LIKE 'OTHER%'`
    );

    console.log('--- Before (Other / ST related) ---');
    beforeRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log(`Students to rename → ST: ${toUpdate}`);

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    if (Number(toUpdate) === 0) {
      console.log('Nothing to update.');
      process.exit(0);
    }

    let stCasteId = null;
    const [stSub] = await masterPool.query(
      `SELECT id FROM castes WHERE TRIM(name) = 'ST' ORDER BY id ASC LIMIT 1`
    );
    if (stSub.length) stCasteId = stSub[0].id;

    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );
    const hasCasteId = Number(cols[0]?.count || 0) > 0;

    if (hasCasteId && stCasteId != null) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'ST', caste_id = ?
         WHERE UPPER(TRIM(caste)) = 'OTHER'
            OR UPPER(TRIM(caste)) LIKE 'OTHER%'`,
        [stCasteId]
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='ST', caste_id=${stCasteId}`);
    } else if (hasCasteId) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'ST', caste_id = NULL
         WHERE UPPER(TRIM(caste)) = 'OTHER'
            OR UPPER(TRIM(caste)) LIKE 'OTHER%'`
      );
      console.log(
        `Updated ${result.affectedRows} student(s) → caste='ST', caste_id=NULL (no ST in Settings yet)`
      );
    } else {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'ST'
         WHERE UPPER(TRIM(caste)) = 'OTHER'
            OR UPPER(TRIM(caste)) LIKE 'OTHER%'`
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='ST'`);
    }

    const [delCastes] = await masterPool.query(
      `DELETE FROM castes WHERE UPPER(TRIM(name)) = 'OTHER' OR UPPER(TRIM(name)) LIKE 'OTHER%'`
    );
    if (delCastes.affectedRows) {
      console.log(`Removed ${delCastes.affectedRows} Settings subcaste row(s) for Other`);
    }
    const [delParents] = await masterPool.query(
      `DELETE FROM caste_categories WHERE UPPER(TRIM(name)) = 'OTHER' OR UPPER(TRIM(name)) LIKE 'OTHER%'`
    );
    if (delParents.affectedRows) {
      console.log(`Removed ${delParents.affectedRows} Settings caste row(s) for Other`);
    }

    const [afterRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'ST'
           OR UPPER(TRIM(caste)) = 'OTHER'
           OR UPPER(TRIM(caste)) LIKE 'OTHER%'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    console.log('--- After ---');
    afterRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to merge Other into ST:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

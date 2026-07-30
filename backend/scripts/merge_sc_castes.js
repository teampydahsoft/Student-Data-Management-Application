/**
 * Merge SC variant caste names into a single "SC" on students.
 * Variants: SC_I, SC_II, SC_III, SC-III, SC-MALA
 *
 * Usage:
 *   node backend/scripts/merge_sc_castes.js
 *   node backend/scripts/merge_sc_castes.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

const SC_VARIANTS = ['SC_I', 'SC_II', 'SC_III', 'SC-III', 'SC-MALA'];

(async () => {
  try {
    const placeholders = SC_VARIANTS.map(() => '?').join(',');

    const [beforeRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'SC'
           OR TRIM(caste) IN (${placeholders})
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`,
      SC_VARIANTS
    );

    const [[{ toUpdate }]] = await masterPool.query(
      `SELECT COUNT(*) AS toUpdate
       FROM students
       WHERE TRIM(caste) IN (${placeholders})`,
      SC_VARIANTS
    );

    console.log('--- Before ---');
    beforeRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log(`Students to rename → SC: ${toUpdate}`);

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    if (Number(toUpdate) === 0) {
      console.log('Nothing to update.');
      process.exit(0);
    }

    // Resolve SC caste_id from Settings if present (subcaste or parent named SC)
    let scCasteId = null;
    const [scSub] = await masterPool.query(
      `SELECT id FROM castes WHERE TRIM(name) = 'SC' ORDER BY id ASC LIMIT 1`
    );
    if (scSub.length) {
      scCasteId = scSub[0].id;
    }

    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );
    const hasCasteId = Number(cols[0]?.count || 0) > 0;

    if (hasCasteId && scCasteId != null) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'SC', caste_id = ?
         WHERE TRIM(caste) IN (${placeholders})`,
        [scCasteId, ...SC_VARIANTS]
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='SC', caste_id=${scCasteId}`);
    } else if (hasCasteId) {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'SC', caste_id = NULL
         WHERE TRIM(caste) IN (${placeholders})`,
        SC_VARIANTS
      );
      console.log(
        `Updated ${result.affectedRows} student(s) → caste='SC', caste_id=NULL (no SC in Settings yet)`
      );
    } else {
      const [result] = await masterPool.query(
        `UPDATE students
         SET caste = 'SC'
         WHERE TRIM(caste) IN (${placeholders})`,
        SC_VARIANTS
      );
      console.log(`Updated ${result.affectedRows} student(s) → caste='SC'`);
    }

    // Remove variant rows from Settings master (subcastes), if any
    const [delCastes] = await masterPool.query(
      `DELETE FROM castes WHERE TRIM(name) IN (${placeholders})`,
      SC_VARIANTS
    );
    if (delCastes.affectedRows) {
      console.log(`Removed ${delCastes.affectedRows} Settings subcaste row(s) for SC variants`);
    }

    const [delParents] = await masterPool.query(
      `DELETE FROM caste_categories WHERE TRIM(name) IN (${placeholders})`,
      SC_VARIANTS
    );
    if (delParents.affectedRows) {
      console.log(`Removed ${delParents.affectedRows} Settings caste row(s) for SC variants`);
    }

    const [afterRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'SC'
           OR TRIM(caste) IN (${placeholders})
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`,
      SC_VARIANTS
    );

    console.log('--- After ---');
    afterRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to merge SC castes:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

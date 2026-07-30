/**
 * Merge "BC" caste values into "BC-A" on students.
 * Also removes empty Settings category "BC" if present and unused.
 *
 * Usage:
 *   node backend/scripts/merge_bc_into_bc_a.js
 *   node backend/scripts/merge_bc_into_bc_a.js --report-only
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
           UPPER(TRIM(caste)) = 'BC'
           OR UPPER(TRIM(caste)) = 'BC-A'
           OR UPPER(REPLACE(TRIM(caste), ' ', '')) = 'BC-A'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    const [[{ toUpdate }]] = await masterPool.query(
      `SELECT COUNT(*) AS toUpdate
       FROM students
       WHERE UPPER(TRIM(caste)) = 'BC'`
    );

    console.log('--- Before (BC / BC-A) ---');
    beforeRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log(`Students to rename BC → BC-A: ${toUpdate}`);

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    if (Number(toUpdate) > 0) {
      const [cols] = await masterPool.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'students'
           AND COLUMN_NAME = 'caste_id'`
      );
      const hasCasteId = Number(cols[0]?.count || 0) > 0;

      if (hasCasteId) {
        const [result] = await masterPool.query(
          `UPDATE students
           SET caste = 'BC-A', caste_id = NULL
           WHERE UPPER(TRIM(caste)) = 'BC'`
        );
        console.log(`Updated ${result.affectedRows} student(s) → caste='BC-A', caste_id=NULL`);
      } else {
        const [result] = await masterPool.query(
          `UPDATE students
           SET caste = 'BC-A'
           WHERE UPPER(TRIM(caste)) = 'BC'`
        );
        console.log(`Updated ${result.affectedRows} student(s) → caste='BC-A'`);
      }
    } else {
      console.log('No student rows with caste=BC to update.');
    }

    // Remove Settings nested castes under category BC, then category BC if unused
    const [bcCat] = await masterPool.query(
      `SELECT id FROM caste_categories WHERE UPPER(TRIM(name)) = 'BC' LIMIT 1`
    );
    if (bcCat.length) {
      const bcId = bcCat[0].id;
      const [delChildren] = await masterPool.query(
        'DELETE FROM castes WHERE category_id = ?',
        [bcId]
      );
      if (delChildren.affectedRows) {
        console.log(`Removed ${delChildren.affectedRows} nested caste(s) under Settings category BC`);
      }

      const [[{ stillUsing }]] = await masterPool.query(
        `SELECT COUNT(*) AS stillUsing
         FROM students
         WHERE UPPER(TRIM(caste)) = 'BC'`
      );
      if (Number(stillUsing) === 0) {
        await masterPool.query('DELETE FROM caste_categories WHERE id = ?', [bcId]);
        console.log('Removed Settings category BC (students now use BC-A).');
      } else {
        console.log(`Kept Settings category BC (${stillUsing} student(s) still have caste=BC).`);
      }
    }

    const [afterRows] = await masterPool.query(
      `SELECT TRIM(caste) AS name, COUNT(*) AS studentCount
       FROM students
       WHERE caste IS NOT NULL AND TRIM(caste) <> ''
         AND (
           UPPER(TRIM(caste)) = 'BC'
           OR UPPER(TRIM(caste)) = 'BC-A'
         )
       GROUP BY TRIM(caste)
       ORDER BY studentCount DESC, name ASC`
    );

    console.log('--- After ---');
    afterRows.forEach((row) => console.log(`  ${row.name}: ${row.studentCount}`));
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to merge BC into BC-A:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

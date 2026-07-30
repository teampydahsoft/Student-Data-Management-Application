/**
 * Clear all Settings caste master data (caste_categories + castes).
 * Also nulls students.caste_id so no orphan FK references remain.
 * Does NOT change students.caste name text.
 *
 * Usage:
 *   node backend/scripts/clear_caste_categories.js
 *   node backend/scripts/clear_caste_categories.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

(async () => {
  try {
    const [tables] = await masterPool.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('caste_categories', 'castes')`
    );
    const tableNames = new Set(tables.map((row) => row.TABLE_NAME));

    if (!tableNames.has('caste_categories') || !tableNames.has('castes')) {
      console.error('caste_categories / castes tables do not exist yet. Nothing to clear.');
      process.exit(1);
    }

    const [[{ categoryCount }]] = await masterPool.query(
      'SELECT COUNT(*) AS categoryCount FROM caste_categories'
    );
    const [[{ casteCount }]] = await masterPool.query(
      'SELECT COUNT(*) AS casteCount FROM castes'
    );

    let linkedCount = 0;
    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );
    const hasCasteId = Number(cols[0]?.count || 0) > 0;
    if (hasCasteId) {
      const [[{ count }]] = await masterPool.query(
        'SELECT COUNT(*) AS count FROM students WHERE caste_id IS NOT NULL'
      );
      linkedCount = Number(count || 0);
    }

    console.log('--- Caste master clear report ---');
    console.log(`Categories: ${categoryCount}`);
    console.log(`Castes:     ${casteCount}`);
    console.log(`Students with caste_id: ${linkedCount}`);

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    if (hasCasteId && linkedCount > 0) {
      const [result] = await masterPool.query(
        'UPDATE students SET caste_id = NULL WHERE caste_id IS NOT NULL'
      );
      console.log(`Cleared caste_id on ${result.affectedRows} student(s).`);
    }

    await masterPool.query('SET FOREIGN_KEY_CHECKS = 0');
    await masterPool.query('DELETE FROM castes');
    await masterPool.query('DELETE FROM caste_categories');
    await masterPool.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Deleted all rows from castes and caste_categories.');
    console.log('Settings Caste Categories is now an empty sheet.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to clear caste categories:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

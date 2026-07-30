/**
 * Remove mirror nested castes where child name equals parent category name
 * (e.g. category BC-A with nested caste BC-A from old import).
 * Clears students.caste_id pointing at those mirror rows.
 * Does NOT change students.caste text (category values stay as BC-A, OC, …).
 *
 * Usage: node backend/scripts/cleanup_mirror_castes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

(async () => {
  try {
    const [mirrors] = await masterPool.query(
      `SELECT c.id, c.name, cat.id AS category_id, cat.name AS category_name
       FROM castes c
       JOIN caste_categories cat ON cat.id = c.category_id
       WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(cat.name))`
    );

    console.log(`Mirror nested castes found: ${mirrors.length}`);
    mirrors.forEach((row) => {
      console.log(`  id=${row.id} ${row.category_name} → ${row.name}`);
    });

    if (mirrors.length === 0) {
      console.log('Nothing to clean.');
      process.exit(0);
    }

    const ids = mirrors.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');

    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'caste_id'`
    );
    if (Number(cols[0]?.count || 0) > 0) {
      const [cleared] = await masterPool.query(
        `UPDATE students SET caste_id = NULL WHERE caste_id IN (${placeholders})`,
        ids
      );
      console.log(`Cleared caste_id on ${cleared.affectedRows} student(s)`);
    }

    const [deleted] = await masterPool.query(
      `DELETE FROM castes WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`Deleted ${deleted.affectedRows} mirror nested caste row(s)`);
    console.log('Done. Categories remain; add real castes under them as needed.');
    process.exit(0);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

/**
 * Rename leftover students.caste "EBC" → "EBC-OC" and set category_id.
 *
 * Usage:
 *   node backend/scripts/fix_ebc_to_ebc_oc.js
 *   node backend/scripts/fix_ebc_to_ebc_oc.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

(async () => {
  try {
    const [cats] = await masterPool.query(
      `SELECT id, name FROM caste_categories
       WHERE LOWER(TRIM(name)) = 'ebc-oc'
       LIMIT 1`
    );
    if (!cats.length) {
      console.error('Category "EBC-OC" not found in caste_categories.');
      process.exit(1);
    }
    const target = cats[0];
    console.log(`Target category: id=${target.id} name="${target.name}"`);
    console.log(`Mode: ${reportOnly ? 'REPORT ONLY' : 'UPDATE'}\n`);

    const [students] = await masterPool.query(
      `SELECT id, admission_number, pin_no, student_name, college, course, branch, caste, category_id
       FROM students
       WHERE UPPER(TRIM(caste)) = 'EBC'
       ORDER BY id ASC`
    );

    if (!students.length) {
      console.log('No students with caste="EBC". Nothing to do.');
      process.exit(0);
    }

    console.log(`========== TO UPDATE (${students.length}) ==========`);
    for (const s of students) {
      console.log(
        [
          s.admission_number || '-',
          s.pin_no || '-',
          s.student_name || '-',
          s.college || '-',
          `caste="${s.caste}"`,
          s.category_id != null ? `category_id=${s.category_id}` : 'category_id=null',
          `→ caste="EBC-OC" | category_id=${target.id}`
        ].join(' | ')
      );
    }

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
      process.exit(0);
    }

    const ids = students.map((s) => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await masterPool.query(
      `UPDATE students
       SET caste = ?, category_id = ?
       WHERE id IN (${placeholders})`,
      ['EBC-OC', target.id, ...ids]
    );

    console.log(`\nUpdated ${result.affectedRows} student(s): caste → "EBC-OC", category_id → ${target.id}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

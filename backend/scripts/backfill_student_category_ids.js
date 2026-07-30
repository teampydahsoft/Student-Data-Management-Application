/**
 * Backfill students.category_id by matching students.caste text
 * to caste_categories.name (case-insensitive trim).
 *
 * Prints clear lists (same style as backfill_student_caste_ids.js):
 *   - UPDATED   : linked this run (logs each student name one by one)
 *   - ALREADY   : already has correct category_id
 *   - PENDING   : has caste text but no matching category
 *   - EMPTY     : caste column is empty / null
 *
 * Does NOT change students.caste text.
 * Does NOT touch caste_id.
 *
 * Usage:
 *   node backend/scripts/backfill_student_category_ids.js
 *   node backend/scripts/backfill_student_category_ids.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');

const formatStudent = (student, extra = '') => {
  const parts = [
    student.admission_number || '-',
    student.pin_no || '-',
    student.student_name || '-',
    student.college || '-',
    student.course || '-',
    student.branch || '-',
    `caste="${student.caste == null || String(student.caste).trim() === '' ? '' : String(student.caste).trim()}"`,
    student.category_id != null ? `category_id=${student.category_id}` : 'category_id=null'
  ];
  if (extra) parts.push(extra);
  return parts.join(' | ');
};

const printList = (title, rows, formatter) => {
  console.log(`\n========== ${title} (${rows.length}) ==========`);
  if (!rows.length) {
    console.log('(none)');
    return;
  }
  rows.forEach((row) => console.log(formatter(row)));
};

(async () => {
  try {
    const [cols] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'category_id'`
    );

    if (Number(cols[0]?.count || 0) === 0) {
      console.error(
        'students.category_id does not exist yet.\n' +
          '1. Run: node backend/scripts/add_student_category_id_column.js\n' +
          '2. Then re-run this backfill script'
      );
      process.exit(1);
    }

    const [categories] = await masterPool.query(
      `SELECT id, name FROM caste_categories ORDER BY id ASC`
    );
    if (!categories.length) {
      console.error('No rows in caste_categories. Create categories in Settings first.');
      process.exit(1);
    }

    const categoryByName = new Map();
    categories.forEach((row) => {
      const key = String(row.name || '').trim().toLowerCase();
      if (key && !categoryByName.has(key)) {
        categoryByName.set(key, row);
      }
    });

    console.log(`Mode: ${reportOnly ? 'REPORT ONLY (no updates)' : 'BACKFILL + REPORT'}`);
    console.log(`Loaded ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} from caste_categories:`);
    categories.forEach((cat) => console.log(`  id=${cat.id} name="${cat.name}"`));

    const [students] = await masterPool.query(
      `SELECT id, admission_number, pin_no, student_name, college, course, branch, caste, category_id
       FROM students
       ORDER BY id ASC`
    );

    console.log(`\nTotal students found: ${students.length}\n`);

    const updated = [];
    const alreadyLinked = [];
    const pending = [];
    const empty = [];
    // categoryId -> [student ids] for batched UPDATE
    const toUpdateByCategory = new Map();

    for (const student of students) {
      const casteName = student.caste == null ? '' : String(student.caste).trim();
      const hasCasteText = casteName !== '';

      if (!hasCasteText) {
        empty.push(student);
        continue;
      }

      const match = categoryByName.get(casteName.toLowerCase());
      if (!match) {
        pending.push({
          ...student,
          reason: `no matching category in caste_categories for "${casteName}"`
        });
        continue;
      }

      if (Number(student.category_id) === Number(match.id)) {
        alreadyLinked.push(student);
        continue;
      }

      const reason = student.category_id
        ? `category_id=${student.category_id} → ${match.id} (${match.name})`
        : `→ category_id=${match.id} (${match.name})`;

      updated.push({ ...student, category_id: match.id, reason });

      if (!reportOnly) {
        if (!toUpdateByCategory.has(match.id)) {
          toUpdateByCategory.set(match.id, []);
        }
        toUpdateByCategory.get(match.id).push(student.id);
      }
    }

    if (!reportOnly && updated.length > 0) {
      console.log(`Updating ${updated.length} student(s) one category at a time...\n`);
      let done = 0;
      for (const [categoryId, ids] of toUpdateByCategory.entries()) {
        const cat = categories.find((c) => Number(c.id) === Number(categoryId));
        // Batch in chunks of 500 for speed, still clear per-category
        const chunkSize = 500;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '?').join(',');
          await masterPool.query(
            `UPDATE students SET category_id = ? WHERE id IN (${placeholders})`,
            [categoryId, ...chunk]
          );
        }
        done += ids.length;
        console.log(
          `  Linked ${ids.length} student(s) → category_id=${categoryId} (${cat?.name || '?'})` +
            `  [progress ${done}/${updated.length}]`
        );
      }
      console.log('');
    }

    printList('UPDATED (linked this run)', updated, (s) =>
      formatStudent(s, s.reason)
    );
    printList('ALREADY LINKED (matching category_id)', alreadyLinked, (s) =>
      formatStudent(s)
    );
    printList('PENDING (has caste text but not linked / unknown category)', pending, (s) =>
      formatStudent(s, s.reason)
    );
    printList('EMPTY CASTE (caste column is empty)', empty, (s) =>
      formatStudent(s, 'needs category assignment')
    );

    console.log('\n========== SUMMARY ==========');
    console.log(`Total students         : ${students.length}`);
    console.log(`Already linked         : ${alreadyLinked.length}`);
    console.log(`${reportOnly ? 'Would update' : 'Updated'}               : ${updated.length}`);
    console.log(`Pending (unknown caste): ${pending.length}`);
    console.log(`Empty caste            : ${empty.length}`);

    const pendingNames = [
      ...new Set(pending.map((s) => String(s.caste || '').trim()).filter(Boolean))
    ];
    if (pendingNames.length) {
      console.log(`Pending caste values   : ${pendingNames.join(', ')}`);
    }

    if (reportOnly) {
      console.log('\n(--report-only) No changes made.');
    } else {
      console.log('\nDone. students.caste text unchanged; category_id filled where matched.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();

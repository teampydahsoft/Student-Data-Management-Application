/**
 * Step 2: backfill students.caste_id from caste names (after column exists).
 *
 * Prints clear lists:
 *   - UPDATED   : linked this run
 *   - PENDING   : has caste text but could not link (unknown name / still pending)
 *   - EMPTY     : caste column is empty / null
 *
 * Usage:
 *   node backend/scripts/backfill_student_caste_ids.js
 *   node backend/scripts/backfill_student_caste_ids.js --report-only
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
    student.caste_id != null ? `caste_id=${student.caste_id}` : 'caste_id=null'
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
         AND COLUMN_NAME = 'caste_id'`
    );

    if (Number(cols[0]?.count || 0) === 0) {
      console.error(
        'students.caste_id does not exist yet.\n' +
          '1. Stop backend\n' +
          '2. Run: node backend/scripts/add_student_caste_id_column.js\n' +
          '3. Then re-run this backfill script'
      );
      process.exit(1);
    }

    const [castes] = await masterPool.query(
      `SELECT id, name FROM castes ORDER BY id ASC`
    );
    if (!castes.length) {
      console.error('No rows in castes table. Open Settings → Caste Categories once, then re-run.');
      process.exit(1);
    }

    const casteByName = new Map();
    const casteById = new Map();
    castes.forEach((row) => {
      casteById.set(Number(row.id), row);
      const key = String(row.name || '').trim().toLowerCase();
      if (key && !casteByName.has(key)) {
        casteByName.set(key, row);
      }
    });

    console.log(`Mode: ${reportOnly ? 'REPORT ONLY (no updates)' : 'BACKFILL + REPORT'}`);
    console.log(`Loaded ${castes.length} caste(s) from castes table.\n`);

    // Include ALL students — also those with empty caste
    const [students] = await masterPool.query(
      `SELECT id, admission_number, pin_no, student_name, college, course, branch, caste, caste_id
       FROM students
       ORDER BY id ASC`
    );

    const updated = [];
    const alreadyLinked = [];
    const pending = [];
    const empty = [];

    for (const student of students) {
      const casteName = student.caste == null ? '' : String(student.caste).trim();
      const hasCasteText = casteName !== '';

      if (!hasCasteText) {
        empty.push(student);
        continue;
      }

      const match = casteByName.get(casteName.toLowerCase());

      if (!match) {
        pending.push({
          ...student,
          reason: `no matching caste in castes table for "${casteName}"`
        });
        continue;
      }

      if (Number(student.caste_id) === Number(match.id)) {
        alreadyLinked.push({ ...student, matchedName: match.name });
        continue;
      }

      // Has text + known caste, but caste_id missing/wrong → update (unless report-only)
      if (reportOnly) {
        pending.push({
          ...student,
          reason: student.caste_id
            ? `caste_id=${student.caste_id} should be ${match.id} (${match.name})`
            : `pending link to caste_id=${match.id} (${match.name})`
        });
        continue;
      }

      await masterPool.query(
        'UPDATE students SET caste_id = ? WHERE id = ?',
        [match.id, student.id]
      );
      updated.push({
        ...student,
        caste_id: match.id,
        matchedName: match.name
      });
    }

    printList('UPDATED (linked this run)', updated, (s) =>
      formatStudent(s, `→ linked to ${s.matchedName}`)
    );

    printList(
      'PENDING (has caste text but not linked / unknown caste)',
      pending,
      (s) => formatStudent(s, s.reason || 'pending')
    );

    printList('EMPTY CASTE (caste column is empty)', empty, (s) =>
      formatStudent(s, 'needs caste assignment')
    );

    console.log('\n========== ALREADY LINKED (count only) ==========');
    console.log(`${alreadyLinked.length} student(s) already have matching caste_id`);
    if (alreadyLinked.length && alreadyLinked.length <= 50) {
      alreadyLinked.forEach((s) =>
        console.log(formatStudent(s, `→ ${s.matchedName}`))
      );
    } else if (alreadyLinked.length > 50) {
      console.log('(list omitted — too many; already linked correctly)');
    }

    // Pending caste names summary (unique)
    const pendingNames = [...new Set(pending.map((s) => String(s.caste || '').trim()).filter(Boolean))];
    console.log('\n----- Summary -----');
    console.log(`Total students        : ${students.length}`);
    console.log(`Updated this run      : ${updated.length}`);
    console.log(`Already linked        : ${alreadyLinked.length}`);
    console.log(`Pending               : ${pending.length}`);
    console.log(`Empty caste           : ${empty.length}`);
    if (pendingNames.length) {
      console.log(`Pending caste values  : ${pendingNames.join(', ')}`);
    }
    console.log('Done.');
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();

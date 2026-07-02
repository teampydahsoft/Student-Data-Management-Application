/**
 * Migrate ineligible-quota students' scholarship status from 'rejected' → 'not_eligible'.
 * Affects: MANG, MQ, SPOT, LSPOT quota students only.
 *
 * Usage (from backend folder):
 *   node scripts/migrate_quota_rejected_to_not_eligible.js
 */

const { masterPool } = require('../config/database');

const INELIGIBLE_QUOTA_CODES = ['MANG', 'MQ', 'SPOT', 'LSPOT'];

const run = async () => {
  const placeholders = INELIGIBLE_QUOTA_CODES.map(() => '?').join(', ');

  // 1. Update student_scholarship rows
  const [ssResult] = await masterPool.query(
    `UPDATE student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     SET ss.eligible = 'not_eligible'
     WHERE UPPER(TRIM(IFNULL(s.stud_type, ''))) IN (${placeholders})
       AND LOWER(TRIM(IFNULL(ss.eligible, ''))) = 'rejected'`,
    INELIGIBLE_QUOTA_CODES
  );
  console.log(`Updated ${ssResult.affectedRows} student_scholarship rows: rejected → not_eligible`);

  // 2. Update students.scholar_status
  const [studResult] = await masterPool.query(
    `UPDATE students
     SET scholar_status = 'not_eligible'
     WHERE UPPER(TRIM(IFNULL(stud_type, ''))) IN (${placeholders})
       AND LOWER(TRIM(IFNULL(scholar_status, ''))) = 'rejected'`,
    INELIGIBLE_QUOTA_CODES
  );
  console.log(`Updated ${studResult.affectedRows} students.scholar_status rows: rejected → not_eligible`);
};

run()
  .then(() => { console.log('Migration complete.'); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });

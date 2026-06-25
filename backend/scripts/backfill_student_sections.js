/**
 * Backfill student_sections from students.student_data JSON.
 * Run: node scripts/backfill_student_sections.js
 */
require('dotenv').config();
const { masterPool } = require('../config/database');

(async () => {
  const [rows] = await masterPool.query(`
    SELECT s.id AS student_id,
      cb.id AS branch_id,
      COALESCE(s.batch, '') AS batch,
      COALESCE(
        NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$.section'))), ''),
        NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.student_data, '$.Section'))), '')
      ) AS section_name
    FROM students s
    INNER JOIN courses c ON c.name = s.course AND c.is_active = 1
    INNER JOIN course_branches cb ON cb.course_id = c.id AND cb.name = s.branch AND cb.is_active = 1
    WHERE (
      JSON_EXTRACT(s.student_data, '$.section') IS NOT NULL
      OR JSON_EXTRACT(s.student_data, '$.Section') IS NOT NULL
    )
    HAVING section_name IS NOT NULL AND section_name <> ''
  `);

  let upserted = 0;
  for (const row of rows) {
    await masterPool.query(
      `INSERT INTO student_sections (student_id, branch_id, batch, section_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         branch_id = VALUES(branch_id),
         batch = VALUES(batch),
         section_name = VALUES(section_name),
         updated_at = CURRENT_TIMESTAMP`,
      [row.student_id, row.branch_id, row.batch, row.section_name]
    );
    upserted += 1;
  }

  console.log(`Backfilled ${upserted} student section record(s).`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

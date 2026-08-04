const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'e:/Student-Data-Management-Application/backend/.env' });

const SEMESTER_CALENDAR_CONFIGURED_EXISTS = `
  SELECT 1 FROM semesters sem
  INNER JOIN courses co ON co.id = sem.course_id
    AND co.name COLLATE utf8mb4_unicode_ci = s.course COLLATE utf8mb4_unicode_ci
  WHERE (sem.batch COLLATE utf8mb4_unicode_ci = s.batch COLLATE utf8mb4_unicode_ci OR sem.batch IS NULL)
    AND sem.year_of_study = s.current_year
    AND sem.semester_number = s.current_semester
    AND sem.start_date IS NOT NULL
    AND sem.end_date IS NOT NULL
    AND (
      sem.college_id IS NULL
      OR EXISTS (
        SELECT 1 FROM colleges cl
        WHERE cl.name COLLATE utf8mb4_unicode_ci = s.college COLLATE utf8mb4_unicode_ci
          AND cl.id = sem.college_id
      )
    )
`;

const getSemesterCalendarRangeVisibilityClause = (fromDate, toDate) => ({
  sql: `
    AND (
      s.current_year IS NULL
      OR s.current_semester IS NULL
      OR s.course IS NULL
      OR s.batch IS NULL
      OR NOT EXISTS (${SEMESTER_CALENDAR_CONFIGURED_EXISTS})
      OR EXISTS (
        ${SEMESTER_CALENDAR_CONFIGURED_EXISTS}
        AND sem.start_date <= ?
        AND sem.end_date >= ?
      )
    )
  `,
  params: [toDate, fromDate]
});

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const { sql, params } = getSemesterCalendarRangeVisibilityClause('2026-07-05', '2026-08-04');
  
  const query = 'SELECT COUNT(*) as count FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id WHERE s.student_status = \'Regular\' AND s.college_id = 8' + sql;
  
  const [rows] = await conn.query(query, params);
  console.log('Count with semester filter:', rows[0].count);

  conn.end();
}

run().catch(console.error);

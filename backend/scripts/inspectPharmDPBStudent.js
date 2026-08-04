require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production') });
require('dotenv').config();
const { masterPool } = require('../config/database');
const { computeRegistrationStages, parseStudentData } = require('../services/registrationStages');
const { resolveRegistrationScholarshipForStudent } = require('../services/studentScholarshipSync');
const {
  resolveOptionalStagesFromConfig,
  resolveRegistrationBranchYear
} = require('../utils/registrationBranchYear');

(async () => {
  const [cfg] = await masterPool.query(
    "SELECT value FROM settings WHERE `key` = 'registration_stage_config'"
  );
  const stageConfig = JSON.parse(cfg[0]?.value || '{}');

  const [rows] = await masterPool.query(`
    SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id
    WHERE branch = 'Pharm D PB' AND batch = '2021' AND current_year = 6
  `);

  for (const s of rows) {
    const opt = resolveOptionalStagesFromConfig(stageConfig, s.branch, s.current_year);
    const branchYear = resolveRegistrationBranchYear(s.branch, s.current_year);
    const sch = await resolveRegistrationScholarshipForStudent(masterPool, s, opt);
    const st = computeRegistrationStages(s, parseStudentData(s), sch.eligible, sch.feePaid, opt);

    const [schRows] = await masterPool.query(
      `SELECT student_year, student_semester, eligible, fee_paid
       FROM student_scholarship WHERE student_id = ?
       ORDER BY student_year, student_semester`,
      [s.id]
    );

    console.log(JSON.stringify({
      admission: s.admission_number,
      name: s.student_name,
      batch: s.batch,
      branch: s.branch,
      storedYear: s.current_year,
      branchProgramYear: branchYear,
      optionalStages: opt,
      dbRegistrationStatus: s.registration_status,
      certificates_status: s.certificates_status,
      fee_status: s.fee_status,
      scholarship: {
        eligible: sch.eligible,
        satisfied: sch.satisfied,
        checkYear: sch.checkYear,
        displayLabel: sch.displayLabel
      },
      stages: {
        verification: st.verification,
        certificates: st.certificates,
        fee: st.fee,
        promotion: st.promotion,
        scholarship: st.scholarship
      },
      overallComputed: st.overallStatus,
      scholarshipRows: schRows
    }, null, 2));
  }

  await masterPool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

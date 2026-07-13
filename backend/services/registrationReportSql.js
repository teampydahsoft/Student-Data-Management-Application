const {
  verificationCompletedJsonSql,
  verificationCompletedLikeSql,
  verificationCompletedSql,
  certificatesVerifiedSql,
  certificatesTemporarySql
} = require('./registrationCycle');
const {
  buildRegistrationScholarshipHasStatusSql,
  getRegistrationScholarshipFilterClause
} = require('./studentScholarshipSync');

const SCHOLARSHIP_JOIN_ALIAS = 'ss_reg';

const qualifyRegistrationSql = (sql, alias = 's') => (
  sql
    .replace(/\bstudent_data\b/g, `${alias}.student_data`)
    .replace(/(?<!\.)\bcurrent_year\b/g, `${alias}.current_year`)
    .replace(/(?<!\.)\bcurrent_semester\b/g, `${alias}.current_semester`)
);

const scholarshipLeftJoinSql = (studentAlias = 's') => `
  LEFT JOIN (
    SELECT ss1.student_id, ss1.student_year, LOWER(TRIM(ss1.eligible)) AS eligible_norm
    FROM student_scholarship ss1
    INNER JOIN (
      SELECT student_id, student_year, MAX(id) AS max_id
      FROM student_scholarship
      WHERE eligible IS NOT NULL AND TRIM(eligible) != ''
        AND LOWER(TRIM(eligible)) IN ('eligible', 'pending', 'rejected', 'not_eligible', 'not_applied')
      GROUP BY student_id, student_year
    ) ss_latest ON ss_latest.max_id = ss1.id
  ) ${SCHOLARSHIP_JOIN_ALIAS}
    ON ${SCHOLARSHIP_JOIN_ALIAS}.student_id = ${studentAlias}.id
   AND ${SCHOLARSHIP_JOIN_ALIAS}.student_year = GREATEST(1, IFNULL(${studentAlias}.current_year, 1))
`;

/**
 * Returns 1 if the student has a scholarship status for registration reporting.
 * From 2026-2027 onwards uses year-wise student_scholarship; earlier years use scholar_status.
 */
const hasScholarshipExpr = (studentAlias = 's', academicYearFromYear = null) => `
  CASE WHEN ${buildRegistrationScholarshipHasStatusSql(academicYearFromYear, studentAlias)} THEN 1 ELSE 0 END
`;

const getScholarshipFilterClauseWithJoin = (
  filter,
  joinAlias = SCHOLARSHIP_JOIN_ALIAS,
  studentAlias = 'base',
  academicYearFromYear = null
) => getRegistrationScholarshipFilterClause(filter, academicYearFromYear, studentAlias);

const feeClearedSql = (alias = 's') => `(
  ${alias}.fee_status LIKE '%no_due%'
  OR ${alias}.fee_status LIKE '%no due%'
  OR ${alias}.fee_status LIKE '%permitted%'
  OR ${alias}.fee_status LIKE '%completed%'
  OR ${alias}.fee_status LIKE '%nodue%'
)`;

const promotionCompleteSql = () => '1=1';

const buildRegistrationOverallCompletedSql = (
  alias = 's',
  verificationSql,
  academicYearFromYear = null
) => `(
  (${verificationSql})
  AND ${certificatesVerifiedSql(alias)}
  AND ${feeClearedSql(alias)}
  AND ${promotionCompleteSql()}
  AND ${buildRegistrationScholarshipHasStatusSql(academicYearFromYear, alias)}
)`;

/**
 * Temporary registration:
 * Temporary certificates + final scholarship (base stages ready, not Completed).
 * Incomplete scholarship alone does not qualify for Temporary.
 */
const buildRegistrationOverallTemporarySql = (
  alias = 's',
  verificationSql,
  academicYearFromYear = null
) => {
  const completedSql = buildRegistrationOverallCompletedSql(alias, verificationSql, academicYearFromYear);
  const hasScholarshipSql = buildRegistrationScholarshipHasStatusSql(academicYearFromYear, alias);
  const baseReadySql = `(
    (${verificationSql})
    AND ${feeClearedSql(alias)}
    AND ${promotionCompleteSql()}
  )`;

  return `(
    NOT ${completedSql}
    AND ${baseReadySql}
    AND ${certificatesTemporarySql(alias)}
    AND ${hasScholarshipSql}
  )`;
};

const buildRegistrationOverallCompletedCaseSql = (
  alias = 's',
  verificationSql,
  academicYearFromYear = null
) => `CASE WHEN ${buildRegistrationOverallCompletedSql(alias, verificationSql, academicYearFromYear)} THEN 1 ELSE 0 END`;

const buildRegistrationOverallTemporaryCaseSql = (
  alias = 's',
  verificationSql,
  academicYearFromYear = null
) => `CASE WHEN ${buildRegistrationOverallTemporarySql(alias, verificationSql, academicYearFromYear)} THEN 1 ELSE 0 END`;

const buildRegistrationStatusComputedCaseSql = (
  alias = 'students',
  verificationSql,
  academicYearFromYear = null
) => {
  const completedSql = buildRegistrationOverallCompletedSql(alias, verificationSql, academicYearFromYear);
  const temporarySql = buildRegistrationOverallTemporarySql(alias, verificationSql, academicYearFromYear);
  return `CASE
    WHEN ${completedSql} THEN 'Completed'
    WHEN ${temporarySql} THEN 'Temporary'
    ELSE 'pending'
  END`;
};

const buildStudentRegistrationStatusComputedSql = (alias = 'students', academicYearFromYear = null) => {
  const verifSql = qualifyRegistrationSql(
    verificationCompletedSql.replace(/^\(/, '').replace(/\)\s*$/, ''),
    alias
  );
  return buildRegistrationStatusComputedCaseSql(alias, verifSql, academicYearFromYear);
};

const buildRegistrationOverallTemporaryFromFlagsSql = (
  alias = 'flagged',
  academicYearFromYear = null
) => {
  const completedFromFlags = `(
    ${alias}.is_verification_complete = 1
    AND ${alias}.is_cert_verified = 1
    AND ${alias}.is_fee_cleared = 1
    AND ${alias}.is_promotion_complete = 1
    AND ${alias}.has_scholarship = 1
  )`;
  const baseReadyFromFlags = `(
    ${alias}.is_verification_complete = 1
    AND ${alias}.is_fee_cleared = 1
    AND ${alias}.is_promotion_complete = 1
  )`;

  return `(
    NOT ${completedFromFlags}
    AND ${baseReadyFromFlags}
    AND ${alias}.is_cert_temporary = 1
    AND ${alias}.has_scholarship = 1
  )`;
};

const buildRegistrationOverallCompletedFromFlagsCaseSql = (
  alias = 'flagged',
  academicYearFromYear = null
) => `CASE WHEN (
  ${alias}.is_verification_complete = 1
  AND ${alias}.is_cert_verified = 1
  AND ${alias}.is_fee_cleared = 1
  AND ${alias}.is_promotion_complete = 1
  AND ${alias}.has_scholarship = 1
) THEN 1 ELSE 0 END`;

const buildRegistrationOverallTemporaryFromFlagsCaseSql = (
  alias = 'flagged',
  academicYearFromYear = null
) => `CASE WHEN ${buildRegistrationOverallTemporaryFromFlagsSql(alias, academicYearFromYear)} THEN 1 ELSE 0 END`;

const buildFlaggedStudentSelect = ({
  alias,
  verificationSql,
  academicYearFromYear = null
}) => `
  SELECT
    ${alias}.batch,
    ${alias}.college,
    ${alias}.course,
    ${alias}.branch,
    ${alias}.current_year,
    ${alias}.current_semester,
    ${alias}.registration_status,
    CASE WHEN ${verificationSql} THEN 1 ELSE 0 END AS is_verification_complete,
    CASE WHEN 1=1 THEN 1 ELSE 0 END AS is_promotion_complete,
    CASE WHEN ${certificatesVerifiedSql(alias)} THEN 1 ELSE 0 END AS is_cert_verified,
    CASE WHEN ${certificatesTemporarySql(alias)} THEN 1 ELSE 0 END AS is_cert_temporary,
    CASE WHEN ${feeClearedSql(alias)} THEN 1 ELSE 0 END AS is_fee_cleared,
    ${hasScholarshipExpr(alias, academicYearFromYear)} AS has_scholarship
  FROM students ${alias}
  ${scholarshipLeftJoinSql(alias)}
`;

/**
 * Optimized registration abstract:
 * - compute per-student stage flags once
 * - split valid/invalid JSON paths (avoids JSON_EXTRACT errors + redundant LIKE scans)
 * - LEFT JOIN scholarship once instead of correlated EXISTS per aggregate
 */
const buildRegistrationAbstractQuery = ({ whereClause, params = [], scholarshipFilter = '', academicYearFromYear = null }) => {
  const verificationJsonSql = qualifyRegistrationSql(verificationCompletedJsonSql, 'base');
  const verificationLikeSql = qualifyRegistrationSql(verificationCompletedLikeSql, 'base');
  const scholarshipWhere = getScholarshipFilterClauseWithJoin(
    scholarshipFilter,
    SCHOLARSHIP_JOIN_ALIAS,
    'base',
    academicYearFromYear
  );

  const query = `
    SELECT
      batch,
      college,
      course,
      branch,
      current_year,
      current_semester,
      COUNT(*) AS total,
      SUM(is_verification_complete) AS verification_completed,
      SUM(is_cert_verified) AS certificates_verified,
      SUM(is_cert_temporary) AS certificates_temporary,
      SUM(is_fee_cleared) AS fee_cleared,
      SUM(is_promotion_complete) AS promotion_completed,
      SUM(has_scholarship) AS scholarship_assigned,
      SUM(CASE WHEN has_scholarship = 0 THEN 1 ELSE 0 END) AS scholarship_pending,
      SUM(is_overall_completed) AS overall_completed,
      SUM(is_overall_temporary) AS overall_temporary
    FROM (
      SELECT
        flagged.*,
        ${buildRegistrationOverallCompletedFromFlagsCaseSql('flagged', academicYearFromYear)} AS is_overall_completed,
        ${buildRegistrationOverallTemporaryFromFlagsCaseSql('flagged', academicYearFromYear)} AS is_overall_temporary
      FROM (
        ${buildFlaggedStudentSelect({
          alias: 'base',
          verificationSql: verificationJsonSql,
          academicYearFromYear
        })}
        WHERE ${whereClause} AND JSON_VALID(base.student_data)${scholarshipWhere}

        UNION ALL

        ${buildFlaggedStudentSelect({
          alias: 'base',
          verificationSql: verificationLikeSql,
          academicYearFromYear
        })}
        WHERE ${whereClause} AND NOT JSON_VALID(base.student_data)${scholarshipWhere}
      ) flagged
    ) reg_stats
    GROUP BY batch, college, course, branch, current_year, current_semester
    ORDER BY batch, college, course, branch, current_year, current_semester ASC
  `;

  // WHERE appears in both UNION branches — duplicate bound params for each branch.
  return { query, params: [...params, ...params] };
};

module.exports = {
  SCHOLARSHIP_JOIN_ALIAS,
  qualifyRegistrationSql,
  scholarshipLeftJoinSql,
  hasScholarshipExpr,
  getScholarshipFilterClauseWithJoin,
  feeClearedSql,
  certificatesVerifiedSql,
  certificatesTemporarySql,
  buildRegistrationOverallCompletedSql,
  buildRegistrationOverallTemporarySql,
  buildRegistrationOverallCompletedCaseSql,
  buildRegistrationOverallTemporaryCaseSql,
  buildRegistrationStatusComputedCaseSql,
  buildStudentRegistrationStatusComputedSql,
  buildRegistrationOverallCompletedFromFlagsCaseSql,
  buildRegistrationOverallTemporaryFromFlagsCaseSql,
  buildRegistrationAbstractQuery
};

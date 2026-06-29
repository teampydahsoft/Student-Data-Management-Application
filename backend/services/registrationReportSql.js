const {
  verificationCompletedJsonSql,
  verificationCompletedLikeSql
} = require('./registrationCycle');

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
        AND LOWER(TRIM(eligible)) IN ('eligible', 'pending', 'rejected')
      GROUP BY student_id, student_year
    ) ss_latest ON ss_latest.max_id = ss1.id
  ) ${SCHOLARSHIP_JOIN_ALIAS}
    ON ${SCHOLARSHIP_JOIN_ALIAS}.student_id = ${studentAlias}.id
   AND ${SCHOLARSHIP_JOIN_ALIAS}.student_year = GREATEST(1, IFNULL(${studentAlias}.current_year, 1))
`;

const getScholarshipFilterClauseWithJoin = (filter, joinAlias = SCHOLARSHIP_JOIN_ALIAS) => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (normalized === 'pending') {
    return ` AND ${joinAlias}.student_id IS NULL`;
  }
  if (normalized === 'eligible') {
    return ` AND ${joinAlias}.eligible_norm = 'eligible'`;
  }
  if (normalized === 'not_eligible') {
    return ` AND ${joinAlias}.eligible_norm = 'rejected'`;
  }
  return '';
};

const feeClearedSql = (alias = 's') => `(
  ${alias}.fee_status LIKE '%no_due%'
  OR ${alias}.fee_status LIKE '%no due%'
  OR ${alias}.fee_status LIKE '%permitted%'
  OR ${alias}.fee_status LIKE '%completed%'
  OR ${alias}.fee_status LIKE '%nodue%'
)`;

const certificatesVerifiedSql = (alias = 's') => `(
  ${alias}.certificates_status LIKE '%Verified%'
  OR ${alias}.certificates_status = 'completed'
)`;

const certificatesTemporarySql = (alias = 's') => `(
  ${alias}.certificates_status = 'Temporary'
  OR ${alias}.certificates_status = 'temporary'
)`;

const buildFlaggedStudentSelect = ({
  alias,
  verificationSql
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
    CASE WHEN ${SCHOLARSHIP_JOIN_ALIAS}.student_id IS NOT NULL THEN 1 ELSE 0 END AS has_scholarship
  FROM students ${alias}
  ${scholarshipLeftJoinSql(alias)}
`;

/**
 * Optimized registration abstract:
 * - compute per-student stage flags once
 * - split valid/invalid JSON paths (avoids JSON_EXTRACT errors + redundant LIKE scans)
 * - LEFT JOIN scholarship once instead of correlated EXISTS per aggregate
 */
const buildRegistrationAbstractQuery = ({ whereClause, params = [], scholarshipFilter = '' }) => {
  const verificationJsonSql = qualifyRegistrationSql(verificationCompletedJsonSql, 'base');
  const verificationLikeSql = qualifyRegistrationSql(verificationCompletedLikeSql, 'base');
  const scholarshipWhere = getScholarshipFilterClauseWithJoin(scholarshipFilter);

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
        CASE WHEN
          flagged.is_verification_complete = 1
          AND flagged.is_cert_verified = 1
          AND flagged.is_fee_cleared = 1
          AND flagged.is_promotion_complete = 1
          AND flagged.has_scholarship = 1
        THEN 1 ELSE 0 END AS is_overall_completed,
        CASE WHEN
          flagged.is_verification_complete = 1
          AND flagged.is_cert_temporary = 1
          AND flagged.is_fee_cleared = 1
          AND flagged.is_promotion_complete = 1
          AND flagged.has_scholarship = 1
        THEN 1 ELSE 0 END AS is_overall_temporary
      FROM (
        ${buildFlaggedStudentSelect({
          alias: 'base',
          verificationSql: verificationJsonSql
        })}
        WHERE ${whereClause} AND JSON_VALID(base.student_data)${scholarshipWhere}

        UNION ALL

        ${buildFlaggedStudentSelect({
          alias: 'base',
          verificationSql: verificationLikeSql
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
  getScholarshipFilterClauseWithJoin,
  feeClearedSql,
  certificatesVerifiedSql,
  certificatesTemporarySql,
  buildRegistrationAbstractQuery
};

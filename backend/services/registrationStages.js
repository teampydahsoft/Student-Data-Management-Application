const {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle
} = require('./registrationCycle');
const {
  resolveRegistrationBranchYear
} = require('../utils/registrationBranchYear');
const {
  normalizeEligible,
  isScholarshipCompleteForRegistration,
  usesSemesterWiseScholarshipStatus
} = require('./studentScholarshipSync');

const FEE_COMPLETE_STATUSES = ['no due', 'no_due', 'permitted', 'completed', 'nodue'];

const formatRegistrationStatusDisplay = (status) => {
  const normalized = normalizeEligible(status);
  if (normalized === 'not_eligible') return 'Not eligible';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'not_applied') return 'Not applied';
  if (normalized === 'eligible') return 'Eligible';
  if (normalized === 'pending') return 'Pending';
  return REGISTRATION_EMPTY_DISPLAY;
};

const getStageBadgeDisplay = (completed, rawText) => (
  completed ? 'Completed' : formatRegistrationStatusDisplay(rawText)
);

const parseStudentData = (student) => {
  if (!student?.student_data) return {};
  try {
    return typeof student.student_data === 'string'
      ? JSON.parse(student.student_data || '{}')
      : (student.student_data || {});
  } catch (e) {
    const raw = student.student_data || '';
    const studentVerMatch = raw.match(/"is_student_mobile_verified"\s*:\s*(true|false)/);
    const parentVerMatch = raw.match(/"is_parent_mobile_verified"\s*:\s*(true|false)/);
    return {
      is_student_mobile_verified: studentVerMatch ? studentVerMatch[1] === 'true' : false,
      is_parent_mobile_verified: parentVerMatch ? parentVerMatch[1] === 'true' : false
    };
  }
};

/**
 * Registration stage display aligned with the student view dialog (Students.jsx registration tab).
 * scholarStatus: the eligible string for the current semester
 * scholarFeePaid: boolean — whether fee is marked paid for the current semester (CONV+not_eligible only)
 * optionalStages: string[] — stage keys that are optional for this branch+year
 *   (e.g. ['verification', 'scholarship']). When a stage is optional, it is treated as
 *   complete for the overall status even if not actually completed.
 */
const computeRegistrationStages = (student, studentData, scholarStatus, scholarFeePaid = null, optionalStages = []) => {
  const data = studentData || {};
  const currentYear = student.current_year || data.current_year;
  const currentSemester = student.current_semester || data.current_semester;

  const optSet = new Set(Array.isArray(optionalStages) ? optionalStages : []);

  const isVerificationComplete = isVerificationCompleteForCycle(data, currentYear, currentSemester);

  const certStatus = String(
    student.certificates_status || data.certificates_status || ''
  ).toLowerCase();
  const isCertComplete = certStatus.includes('verified') || certStatus === 'completed';
  const isCertTemporary = certStatus.includes('temporary');

  const feeStatus = String(student.fee_status || data.fee_status || '').toLowerCase();
  const isFeeComplete = FEE_COMPLETE_STATUSES.some((s) => feeStatus.includes(s));

  const isPromotionComplete = isPromotionCompleteForCycle(data, currentYear, currentSemester);
  // Pass studType so the check only applies to CONV + not_eligible semesters.
  const studType = student.stud_type || data.stud_type || '';
  const isScholarshipComplete = isScholarshipCompleteForRegistration(
    scholarStatus,
    scholarFeePaid,
    studType
  );
  const isScholarshipOptional = optSet.has('scholarship');
  const branchName = student.branch || data.branch || '';
  const branchProgramYear = resolveRegistrationBranchYear(branchName, currentYear);
  const batch = student.batch || data.batch || '';
  const is2026Plus = usesSemesterWiseScholarshipStatus(batch, branchProgramYear);
  const scholarSatisfiedForCompleted = isScholarshipOptional || isScholarshipComplete;
  const scholarshipSatisfiedForOverall = scholarSatisfiedForCompleted;
  const scholarshipIncompleteForTemp = is2026Plus
    && !isScholarshipOptional
    && !isScholarshipComplete;

  // For overall status: an optional stage counts as satisfied regardless of actual completion
  const verifSatisfied = isVerificationComplete || optSet.has('verification');
  const certSatisfied = isCertComplete || optSet.has('certificates');
  const feeSatisfied = isFeeComplete || optSet.has('fee');
  const promotionSatisfied = isPromotionComplete || optSet.has('promotion');
  const certTemporarySatisfied = (isCertTemporary || isCertComplete) || optSet.has('certificates');
  const scholarTempEligible = scholarSatisfiedForCompleted || scholarshipIncompleteForTemp;

  let overallStatus = 'pending';
  const baseStagesReady = verifSatisfied && feeSatisfied && promotionSatisfied;
  if (baseStagesReady && certSatisfied && scholarSatisfiedForCompleted) {
    overallStatus = 'completed';
  } else if (
    baseStagesReady
    && certTemporarySatisfied
    && scholarTempEligible
    && !(certSatisfied && scholarSatisfiedForCompleted)
  ) {
    overallStatus = 'Temporary';
  }

  return {
    verification: {
      completed: isVerificationComplete,
      optional: optSet.has('verification'),
      display: getStageBadgeDisplay(isVerificationComplete || optSet.has('verification')),
      status: isVerificationComplete ? 'completed' : (optSet.has('verification') ? 'optional' : 'pending')
    },
    certificates: {
      completed: isCertComplete,
      optional: optSet.has('certificates'),
      display: getStageBadgeDisplay(isCertComplete || optSet.has('certificates'), certStatus),
      status: isCertTemporary ? 'temporary' : (isCertComplete ? 'completed' : (optSet.has('certificates') ? 'optional' : 'pending'))
    },
    fee: {
      completed: isFeeComplete,
      optional: optSet.has('fee'),
      display: getStageBadgeDisplay(isFeeComplete || optSet.has('fee'), feeStatus),
      status: isFeeComplete ? 'completed' : (optSet.has('fee') ? 'optional' : 'pending')
    },
    promotion: {
      completed: isPromotionComplete,
      optional: optSet.has('promotion'),
      display: getStageBadgeDisplay(
        isPromotionComplete || optSet.has('promotion'),
        isPromotionComplete ? 'Completed' : REGISTRATION_EMPTY_DISPLAY
      ),
      status: isPromotionComplete ? 'completed' : (optSet.has('promotion') ? 'optional' : 'pending')
    },
    scholarship: {
      completed: isScholarshipComplete,
      optional: isScholarshipOptional,
      optionalPriorYear: false,
      display: isScholarshipOptional && !isScholarshipComplete
        ? REGISTRATION_EMPTY_DISPLAY
        : getStageBadgeDisplay(isScholarshipComplete, scholarStatus),
      status: isScholarshipComplete
        ? 'completed'
        : (isScholarshipOptional ? 'optional' : 'pending')
    },
    overallStatus,
    scholarshipSatisfiedForOverall,
    scholarshipAssignedForReport: isScholarshipComplete
  };
};

const buildRegistrationGroupKey = (fields) => [
  fields.batch ?? '',
  fields.college ?? '',
  fields.course ?? '',
  fields.branch ?? '',
  String(fields.current_year ?? ''),
  String(fields.current_semester ?? '')
].join('\0');

const createEmptyRegistrationGroupBucket = () => ({
  overall_completed: 0,
  overall_temporary: 0,
  scholarship_assigned: 0,
  total: 0
});

const hasOptionalRegistrationStages = (stageConfig, branch, currentYear) => {
  if (!stageConfig || !branch) return false;
  const configYear = resolveRegistrationBranchYear(branch, currentYear);
  const key = `${String(branch).trim()}::${String(configYear)}`;
  return (stageConfig[key]?.optionalStages || []).length > 0;
};

const accumulateRegistrationStudentStats = (
  student,
  stageConfig,
  resolveOptionalStagesFn,
  scholarshipContextMap,
  bucket
) => {
  const studentData = parseStudentData(student);
  const optionalStages = resolveOptionalStagesFn(stageConfig, student.branch, student.current_year);
  const scholarshipCtx = scholarshipContextMap.get(student.id) || { eligible: '', feePaid: null };
  const stages = computeRegistrationStages(
    student,
    studentData,
    scholarshipCtx.eligible,
    scholarshipCtx.feePaid,
    optionalStages
  );

  bucket.total += 1;
  if (stages.overallStatus === 'completed') {
    bucket.overall_completed += 1;
  } else if (stages.overallStatus === 'Temporary') {
    bucket.overall_temporary += 1;
  }
  if (stages.scholarshipAssignedForReport) {
    bucket.scholarship_assigned += 1;
  }

  return stages;
};

/**
 * Aggregate Completed / Temporary / Pending counts using the same rules as per-row reports.
 */
const aggregateRegistrationOverallFromStudents = (
  students,
  stageConfig,
  resolveOptionalStagesFn,
  scholarshipContextMap
) => {
  const counts = {
    completed: 0,
    temporary: 0,
    pending: 0,
    total: students.length,
    scholarshipAssigned: 0
  };

  for (const student of students) {
    const bucket = createEmptyRegistrationGroupBucket();
    accumulateRegistrationStudentStats(
      student,
      stageConfig,
      resolveOptionalStagesFn,
      scholarshipContextMap,
      bucket
    );
    counts.completed += bucket.overall_completed;
    counts.temporary += bucket.overall_temporary;
    counts.scholarshipAssigned += bucket.scholarship_assigned;
  }

  counts.pending = Math.max(0, counts.total - counts.completed - counts.temporary);
  counts.scholarshipPending = Math.max(0, counts.total - counts.scholarshipAssigned);
  return counts;
};

/**
 * Group-level aggregates for registration abstract rows (batch/college/course/branch/year/sem).
 * Only students on branches with optional registration stages need recomputation.
 */
const computeRegistrationGroupAggregates = (
  students,
  stageConfig,
  resolveOptionalStagesFn,
  scholarshipContextMap
) => {
  const groups = new Map();

  for (const student of students) {
    if (!hasOptionalRegistrationStages(stageConfig, student.branch, student.current_year)) {
      continue;
    }
    const key = buildRegistrationGroupKey(student);
    if (!groups.has(key)) {
      groups.set(key, createEmptyRegistrationGroupBucket());
    }
    accumulateRegistrationStudentStats(
      student,
      stageConfig,
      resolveOptionalStagesFn,
      scholarshipContextMap,
      groups.get(key)
    );
  }

  return groups;
};

const enrichRegistrationAbstractRows = (sqlRows, groupAggregates, stageConfig) => (
  sqlRows.map((row) => {
    if (!hasOptionalRegistrationStages(stageConfig, row.branch, row.current_year)) {
      return row;
    }

    const key = buildRegistrationGroupKey(row);
    const bucket = groupAggregates.get(key);
    if (!bucket) return row;

    const total = parseInt(row.total || 0, 10);
    const scholarshipAssigned = bucket.scholarship_assigned;
    return {
      ...row,
      overall_completed: bucket.overall_completed,
      overall_temporary: bucket.overall_temporary,
      scholarship_assigned: scholarshipAssigned,
      scholarship_pending: Math.max(0, total - scholarshipAssigned)
    };
  })
);

module.exports = {
  FEE_COMPLETE_STATUSES,
  formatRegistrationStatusDisplay,
  getStageBadgeDisplay,
  parseStudentData,
  computeRegistrationStages,
  buildRegistrationGroupKey,
  hasOptionalRegistrationStages,
  aggregateRegistrationOverallFromStudents,
  computeRegistrationGroupAggregates,
  enrichRegistrationAbstractRows
};

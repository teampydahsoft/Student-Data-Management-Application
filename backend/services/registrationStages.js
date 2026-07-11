const {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle
} = require('./registrationCycle');
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
  const programYear = Math.max(1, Number(currentYear) || 1);
  const batch = student.batch || data.batch || '';
  const is2026Plus = usesSemesterWiseScholarshipStatus(batch, programYear);
  const scholarshipFullyOptional = isScholarshipOptional && programYear <= 1;
  const scholarSatisfiedForCompleted = scholarshipFullyOptional || isScholarshipComplete;
  const scholarshipIncompleteForTemp = is2026Plus
    && !scholarshipFullyOptional
    && !isScholarshipComplete
    && !isScholarshipOptional;

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
      optional: isScholarshipOptional && programYear <= 1,
      optionalPriorYear: isScholarshipOptional && programYear > 1,
      display: getStageBadgeDisplay(
        isScholarshipComplete || (isScholarshipOptional && programYear <= 1),
        scholarStatus
      ),
      status: isScholarshipComplete
        ? 'completed'
        : (isScholarshipOptional && programYear <= 1 ? 'optional' : 'pending')
    },
    overallStatus
  };
};

/**
 * Aggregate Completed / Temporary / Pending counts using the same rules as per-row reports.
 * Used when SQL aggregates cannot represent optional stages or prior-year scholarship rules.
 */
const aggregateRegistrationOverallFromStudents = async (
  pool,
  students,
  stageConfig,
  resolveOptionalStagesFn,
  resolveRegistrationScholarshipForStudentFn
) => {
  const counts = { completed: 0, temporary: 0, pending: 0, total: students.length };

  for (const student of students) {
    const studentData = parseStudentData(student);
    const optionalStages = resolveOptionalStagesFn(stageConfig, student.branch, student.current_year);
    const scholarshipCtx = await resolveRegistrationScholarshipForStudentFn(
      pool,
      student,
      optionalStages
    );
    const stages = computeRegistrationStages(
      student,
      studentData,
      scholarshipCtx.eligible,
      scholarshipCtx.feePaid,
      optionalStages
    );

    if (stages.overallStatus === 'completed') {
      counts.completed += 1;
    } else if (stages.overallStatus === 'Temporary') {
      counts.temporary += 1;
    } else {
      counts.pending += 1;
    }
  }

  return counts;
};

module.exports = {
  FEE_COMPLETE_STATUSES,
  formatRegistrationStatusDisplay,
  getStageBadgeDisplay,
  parseStudentData,
  computeRegistrationStages,
  aggregateRegistrationOverallFromStudents
};

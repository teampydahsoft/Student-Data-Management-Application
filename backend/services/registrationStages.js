const {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle
} = require('./registrationCycle');
const {
  normalizeEligible,
  isScholarshipCompleteForRegistration
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
 */
const computeRegistrationStages = (student, studentData, scholarStatus, scholarFeePaid = null) => {
  const data = studentData || {};
  const currentYear = student.current_year || data.current_year;
  const currentSemester = student.current_semester || data.current_semester;

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

  let overallStatus = 'pending';
  if (
    isVerificationComplete
    && isCertComplete
    && isFeeComplete
    && isPromotionComplete
    && isScholarshipComplete
  ) {
    overallStatus = 'completed';
  } else if (
    isVerificationComplete
    && isCertTemporary
    && isFeeComplete
    && isPromotionComplete
    && isScholarshipComplete
  ) {
    overallStatus = 'Temporary';
  }

  return {
    verification: {
      completed: isVerificationComplete,
      display: getStageBadgeDisplay(isVerificationComplete),
      status: isVerificationComplete ? 'completed' : 'pending'
    },
    certificates: {
      completed: isCertComplete,
      display: getStageBadgeDisplay(isCertComplete, certStatus),
      status: isCertTemporary ? 'temporary' : (isCertComplete ? 'completed' : 'pending')
    },
    fee: {
      completed: isFeeComplete,
      display: getStageBadgeDisplay(isFeeComplete, feeStatus),
      status: isFeeComplete ? 'completed' : 'pending'
    },
    promotion: {
      completed: isPromotionComplete,
      display: getStageBadgeDisplay(
        isPromotionComplete,
        isPromotionComplete ? 'Completed' : REGISTRATION_EMPTY_DISPLAY
      ),
      status: isPromotionComplete ? 'completed' : 'pending'
    },
    scholarship: {
      completed: isScholarshipComplete,
      display: getStageBadgeDisplay(isScholarshipComplete, scholarStatus),
      status: isScholarshipComplete ? 'completed' : 'pending'
    },
    overallStatus
  };
};

module.exports = {
  FEE_COMPLETE_STATUSES,
  formatRegistrationStatusDisplay,
  getStageBadgeDisplay,
  parseStudentData,
  computeRegistrationStages
};

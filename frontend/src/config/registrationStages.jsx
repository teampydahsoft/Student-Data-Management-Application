import {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle
} from './registrationCycle';
import {
  getRegistrationScholarshipStatus,
  formatScholarshipStatusDisplay,
  resolveRegistrationScholarshipDisplay,
  usesSemesterWiseScholarshipStatus
} from './scholarshipConfig';

export const FEE_COMPLETE_STATUSES = ['no due', 'no_due', 'permitted', 'completed', 'nodue'];

export const getStageBadgeDisplay = (completed, rawText) => (
  completed ? 'Completed' : formatScholarshipStatusDisplay(rawText)
);

export const parseStudentDataField = (student) => {
  if (!student) return {};
  const raw = student.student_data;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

export const formatRegistrationOverallLabel = (overallStatus) => {
  if (overallStatus === 'completed') return 'Completed';
  if (overallStatus === 'Temporary') return 'Temporary';
  return 'Pending';
};

export const normalizeRegistrationOverallStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'temporary') return 'Temporary';
  return 'pending';
};

/** Prefer Temporary/Completed from live stage evaluation or API-computed registration_status. */
export const resolveRegistrationOverallStatus = (stageStatus, apiStatus) => {
  const fromStages = stageStatus || 'pending';
  const fromApi = normalizeRegistrationOverallStatus(apiStatus);
  if (fromApi === 'Temporary' || fromStages === 'Temporary') return 'Temporary';
  if (fromApi === 'completed' || fromStages === 'completed') return 'completed';
  return 'pending';
};

export const isRegistrationPortalUnlocked = (overallStatus) => (
  overallStatus === 'completed' || overallStatus === 'Temporary'
);

/** Registration stage display — aligned with admin student dialog and reports. */
export const computeRegistrationStageDisplays = (student, scholarshipData, optionalStages = []) => {
  const optSet = new Set(Array.isArray(optionalStages) ? optionalStages : []);

  if (!student) {
    return {
      verification: { completed: false, optional: false, display: REGISTRATION_EMPTY_DISPLAY },
      certificates: { completed: false, optional: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      fee: { completed: false, optional: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      promotion: { completed: false, optional: false, display: REGISTRATION_EMPTY_DISPLAY },
      scholarship: { completed: false, optional: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      certStatus: '',
      feeStatus: '',
      scholarStatus: '',
      overallStatus: 'pending',
      overallLabel: 'Pending',
      studentData: {}
    };
  }

  const studentData = parseStudentDataField(student);
  const currentYear = student?.current_year || studentData.current_year;
  const currentSemester = student?.current_semester || studentData.current_semester;

  const isVerificationComplete = isVerificationCompleteForCycle(
    studentData,
    currentYear,
    currentSemester
  );

  const certStatus = String(
    student?.certificates_status || studentData.certificates_status || ''
  ).toLowerCase();
  const isCertComplete = certStatus.includes('verified') || certStatus === 'completed';
  const isCertTemporary = certStatus.includes('temporary');

  const feeStatus = String(student?.fee_status || studentData.fee_status || '').toLowerCase();
  const isFeeComplete = FEE_COMPLETE_STATUSES.some((s) => feeStatus.includes(s));

  const isPromotionComplete = isPromotionCompleteForCycle(
    studentData,
    currentYear,
    currentSemester
  );
  const scholarStatus = getRegistrationScholarshipStatus(
    scholarshipData,
    { ...student, ...studentData },
    optionalStages
  );
  const scholarshipCtx = resolveRegistrationScholarshipDisplay(
    scholarshipData,
    { ...student, ...studentData },
    optionalStages
  );
  const isScholarshipComplete = scholarshipCtx.satisfied;
  const programYear = Math.max(1, Number(currentYear) || 1);
  const isScholarshipOptional = optSet.has('scholarship');
  const batch = student?.batch || studentData.batch || scholarshipData?.student?.batch || '';
  const is2026Plus = usesSemesterWiseScholarshipStatus(batch, programYear);
  const scholarshipFullyOptional = isScholarshipOptional && programYear <= 1;
  const scholarSatisfiedForCompleted = scholarshipFullyOptional || isScholarshipComplete;
  const scholarshipIncompleteForTemp = is2026Plus
    && !scholarshipFullyOptional
    && !isScholarshipComplete
    && !isScholarshipOptional;

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
      display: getStageBadgeDisplay(isVerificationComplete || optSet.has('verification'))
    },
    certificates: {
      completed: isCertComplete,
      optional: optSet.has('certificates'),
      display: getStageBadgeDisplay(isCertComplete || optSet.has('certificates'), certStatus),
      rawStatus: certStatus
    },
    fee: {
      completed: isFeeComplete,
      optional: optSet.has('fee'),
      display: getStageBadgeDisplay(isFeeComplete || optSet.has('fee'), feeStatus),
      rawStatus: feeStatus
    },
    promotion: {
      completed: isPromotionComplete,
      optional: optSet.has('promotion'),
      display: getStageBadgeDisplay(
        isPromotionComplete || optSet.has('promotion'),
        isPromotionComplete ? 'Completed' : REGISTRATION_EMPTY_DISPLAY
      )
    },
    scholarship: {
      completed: isScholarshipComplete,
      optional: isScholarshipOptional && programYear <= 1,
      optionalPriorYear: isScholarshipOptional && programYear > 1,
      display: getStageBadgeDisplay(
        isScholarshipComplete || (isScholarshipOptional && programYear <= 1),
        scholarStatus
      ),
      rawStatus: scholarStatus,
      checkYear: scholarshipCtx.checkYear,
      displayLabel: scholarshipCtx.displayLabel
    },
    certStatus,
    feeStatus,
    scholarStatus,
    overallStatus,
    overallLabel: formatRegistrationOverallLabel(overallStatus),
    studentData
  };
};

export const RegistrationStageBadge = ({ display, optional = false }) => {
  const isCompleted = display === 'Completed';
  const isEmpty = display === REGISTRATION_EMPTY_DISPLAY || display === '—';
  const isPending = display === 'Pending';

  let colorClass = 'bg-gray-100 text-gray-800';
  if (isCompleted) colorClass = 'bg-green-100 text-green-800';
  else if (optional && (isEmpty || isPending)) colorClass = 'bg-blue-50 text-blue-600';
  else if (isEmpty || isPending) colorClass = 'bg-gray-100 text-gray-500';
  else if (display === 'Not eligible' || display === 'Rejected') colorClass = 'bg-red-100 text-red-700';
  else if (display === 'Eligible' || display === 'Not applied') colorClass = 'bg-green-100 text-green-700';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}>
      {display}
      {optional && !isCompleted && <span className="ml-1 text-[10px] opacity-70">(optional)</span>}
    </span>
  );
};

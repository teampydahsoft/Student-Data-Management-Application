import {
  REGISTRATION_EMPTY_DISPLAY,
  isVerificationCompleteForCycle,
  isPromotionCompleteForCycle
} from './registrationCycle';
import {
  getCurrentScholarshipStatus,
  isScholarshipRegistrationComplete,
  formatScholarshipStatusDisplay
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

/** Registration stage display — aligned with admin student dialog and reports. */
export const computeRegistrationStageDisplays = (student, scholarshipData) => {
  if (!student) {
    return {
      verification: { completed: false, display: REGISTRATION_EMPTY_DISPLAY },
      certificates: { completed: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      fee: { completed: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      promotion: { completed: false, display: REGISTRATION_EMPTY_DISPLAY },
      scholarship: { completed: false, display: REGISTRATION_EMPTY_DISPLAY, rawStatus: '' },
      certStatus: '',
      feeStatus: '',
      scholarStatus: '',
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

  const feeStatus = String(student?.fee_status || studentData.fee_status || '').toLowerCase();
  const isFeeComplete = FEE_COMPLETE_STATUSES.some((s) => feeStatus.includes(s));

  const isPromotionComplete = isPromotionCompleteForCycle(
    studentData,
    currentYear,
    currentSemester
  );
  const scholarStatus = getCurrentScholarshipStatus(scholarshipData, { ...student, ...studentData });
  const isScholarshipComplete = isScholarshipRegistrationComplete(scholarshipData, { ...student, ...studentData });

  return {
    verification: {
      completed: isVerificationComplete,
      display: getStageBadgeDisplay(isVerificationComplete)
    },
    certificates: {
      completed: isCertComplete,
      display: getStageBadgeDisplay(isCertComplete, certStatus),
      rawStatus: certStatus
    },
    fee: {
      completed: isFeeComplete,
      display: getStageBadgeDisplay(isFeeComplete, feeStatus),
      rawStatus: feeStatus
    },
    promotion: {
      completed: isPromotionComplete,
      display: getStageBadgeDisplay(
        isPromotionComplete,
        isPromotionComplete ? 'Completed' : REGISTRATION_EMPTY_DISPLAY
      )
    },
    scholarship: {
      completed: isScholarshipComplete,
      display: getStageBadgeDisplay(isScholarshipComplete, scholarStatus),
      rawStatus: scholarStatus
    },
    certStatus,
    feeStatus,
    scholarStatus,
    studentData
  };
};

export const RegistrationStageBadge = ({ display }) => {
  const isCompleted = display === 'Completed';
  const isEmpty = display === REGISTRATION_EMPTY_DISPLAY || display === '—';
  const isPending = display === 'Pending';

  let colorClass = 'bg-gray-100 text-gray-800';
  if (isCompleted) colorClass = 'bg-green-100 text-green-800';
  else if (isEmpty || isPending) colorClass = 'bg-gray-100 text-gray-500';
  else if (display === 'Not eligible' || display === 'Rejected') colorClass = 'bg-red-100 text-red-700';
  else if (display === 'Eligible' || display === 'Not applied') colorClass = 'bg-green-100 text-green-700';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}>
      {display}
    </span>
  );
};

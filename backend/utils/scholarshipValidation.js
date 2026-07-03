const APPLICATION_ID_LENGTH = 12;
const MAX_SCHOLARSHIP_AMOUNT = 99999;
const RTF_RELEASED_MIN_YEAR = 1900;
const RTF_RELEASED_MAX_YEAR = 2099;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeApplicationIdInput = (value) => (
  String(value || '').replace(/\D/g, '').slice(0, APPLICATION_ID_LENGTH)
);

const normalizeScholarshipAmountInput = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.slice(0, 5);
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return '';
  return String(Math.min(Math.max(0, amount), MAX_SCHOLARSHIP_AMOUNT));
};

const validateApplicationId = (value, { required = false, yearLabel = '' } = {}) => {
  const normalized = normalizeApplicationIdInput(value);
  const prefix = yearLabel ? `Year ${yearLabel}: ` : '';

  if (!normalized) {
    if (required) {
      return { valid: false, message: `${prefix}Application number is required` };
    }
    return { valid: true, value: '' };
  }

  if (normalized.length !== APPLICATION_ID_LENGTH) {
    return {
      valid: false,
      message: `${prefix}Application number must be exactly ${APPLICATION_ID_LENGTH} digits`
    };
  }

  return { valid: true, value: normalized };
};

const validateScholarshipAmount = (value, { fieldLabel = 'Amount', allowEmpty = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (allowEmpty) return { valid: true, value: 0 };
    return { valid: false, message: `${fieldLabel} is required` };
  }

  if (!/^\d{1,5}$/.test(raw)) {
    return {
      valid: false,
      message: `${fieldLabel} must be a whole number up to 5 digits (max ${MAX_SCHOLARSHIP_AMOUNT})`
    };
  }

  const amount = toNumber(raw);
  if (amount < 0 || amount > MAX_SCHOLARSHIP_AMOUNT) {
    return {
      valid: false,
      message: `${fieldLabel} must be at most ${MAX_SCHOLARSHIP_AMOUNT}`
    };
  }

  return { valid: true, value: amount };
};

const normalizeRtfReleasedDate = (value) => {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < RTF_RELEASED_MIN_YEAR || year > RTF_RELEASED_MAX_YEAR) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return '';
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const validateRtfReleasedDate = (value, { fieldLabel = 'RTF Remitted date', allowEmpty = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (allowEmpty) return { valid: true, value: null };
    return { valid: false, message: `${fieldLabel} is required` };
  }

  const normalized = normalizeRtfReleasedDate(raw);
  if (!normalized) {
    return {
      valid: false,
      message: `${fieldLabel} must be a valid date with a 4-digit year (${RTF_RELEASED_MIN_YEAR}-${RTF_RELEASED_MAX_YEAR})`
    };
  }

  return { valid: true, value: normalized };
};

const clampScholarshipAmount = (value) => {
  const normalized = normalizeScholarshipAmountInput(value);
  return normalized === '' ? 0 : toNumber(normalized);
};

const calculateFeeDue = (sanctioned, paid) => {
  const s = clampScholarshipAmount(sanctioned);
  const p = clampScholarshipAmount(paid);
  return s > 0 ? Math.max(0, s - p) : 0;
};

// RTF Due = government reimbursement still pending = sanctioned minus what has been released.
// Independent of what the student paid: even if the student paid the full fee in advance, the
// RTF is still due from the portal until it is released (at which point it becomes an advance).
const calculateRtfDue = (sanctioned, released) => {
  const s = clampScholarshipAmount(sanctioned);
  const r = clampScholarshipAmount(released);
  if (s <= 0) return 0;
  return Math.max(0, s - r);
};

// Advance = fee money the student paid out of pocket that the released RTF now reimburses. It
// only exists once RTF is released (released > 0) and never exceeds what the student paid
// manually or the released amount. `paid` must be the manually-paid amount (auto-credited RTF
// already excluded by the caller for a College Account).
const calculateAdvanceAmount = (sanctioned, released, paid) => {
  const s = clampScholarshipAmount(sanctioned);
  const r = clampScholarshipAmount(released);
  const p = clampScholarshipAmount(paid);
  if (s <= 0 || r <= 0 || p <= 0) return 0;
  const surplus = p + r - s;
  return Math.max(0, Math.min(p, r, surplus));
};

const findDuplicateApplicationIdsInPayload = (years = []) => {
  const seen = new Map();
  const duplicates = [];

  for (const yearEntry of years) {
    const validation = validateApplicationId(yearEntry.application_id);
    if (!validation.valid || !validation.value) continue;

    if (seen.has(validation.value)) {
      duplicates.push(validation.value);
    } else {
      seen.set(validation.value, yearEntry.student_year);
    }
  }

  return [...new Set(duplicates)];
};

const assertApplicationIdUnique = async (connection, applicationId, studentId, studentYear) => {
  if (!applicationId) return { valid: true };

  const [rows] = await connection.query(
    `SELECT ss.student_id, ss.student_year, s.admission_number, s.student_name
     FROM student_scholarship ss
     INNER JOIN students s ON s.id = ss.student_id
     WHERE ss.application_id = ?
       AND TRIM(IFNULL(ss.application_id, '')) != ''
       AND NOT (ss.student_id = ? AND ss.student_year = ?)
     LIMIT 1`,
    [applicationId, studentId, studentYear]
  );

  if (!rows.length) return { valid: true };

  const conflict = rows[0];
  return {
    valid: false,
    message: 'Application number already exists',
    conflict: {
      student_name: conflict.student_name || '',
      admission_number: conflict.admission_number || '',
      student_year: conflict.student_year
    }
  };
};

const checkApplicationIdAvailability = async (pool, applicationId, studentId, studentYear) => {
  const validation = validateApplicationId(applicationId, { yearLabel: studentYear });
  if (!validation.valid) {
    return { available: false, message: validation.message };
  }

  if (!validation.value) {
    return { available: true, message: '' };
  }

  const uniqueCheck = await assertApplicationIdUnique(
    pool,
    validation.value,
    studentId,
    studentYear
  );

  if (!uniqueCheck.valid) {
    return {
      available: false,
      message: uniqueCheck.message,
      conflict: uniqueCheck.conflict || null
    };
  }

  return {
    available: true,
    message: 'Application number is available'
  };
};

const isSemesterEligible = (value) => (
  String(value || '').trim().toLowerCase() === 'eligible'
);

const isSemesterStatusAssigned = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['eligible', 'not_eligible', 'rejected', 'pending', 'not_applied'].includes(normalized);
};

const allSemestersEligible = (semesters = []) => (
  Array.isArray(semesters)
  && semesters.length > 0
  && semesters.every((sem) => isSemesterEligible(sem.eligible))
);

const allSemestersStatusAssigned = (semesters = []) => (
  Array.isArray(semesters)
  && semesters.length > 0
  && semesters.every((sem) => isSemesterStatusAssigned(sem.eligible))
);

/** Pending / not eligible / etc. — sanctioned feeds Fee Due; no RTF or advance. */
const isYearFeeOnlyScholarshipMode = (semesters = []) => (
  allSemestersStatusAssigned(semesters) && !allSemestersEligible(semesters)
);

const hasYearScholarshipFinancialTracking = (semesters = []) => (
  allSemestersEligible(semesters) || isYearFeeOnlyScholarshipMode(semesters)
);

const validateScholarshipYearsPayload = async (connection, studentId, years = [], options = {}) => {
  const { isCollege = false } = options;
  const duplicateIds = findDuplicateApplicationIdsInPayload(years);
  if (duplicateIds.length) {
    return {
      valid: false,
      message: `Duplicate application number${duplicateIds.length > 1 ? 's' : ''} in this save: ${duplicateIds.join(', ')}`
    };
  }

  for (const yearEntry of years) {
    const studentYear = toNumber(yearEntry.student_year);
    if (!studentYear || studentYear < 1) continue;

    const appValidation = validateApplicationId(yearEntry.application_id, { yearLabel: studentYear });
    if (!appValidation.valid) return appValidation;

    if (appValidation.value) {
      const uniqueCheck = await assertApplicationIdUnique(
        connection,
        appValidation.value,
        studentId,
        studentYear
      );
      if (!uniqueCheck.valid) return uniqueCheck;
    }

    const semesters = Array.isArray(yearEntry.semesters) ? yearEntry.semesters : [];
    const allEligible = allSemestersEligible(semesters);
    const feeOnlyMode = isYearFeeOnlyScholarshipMode(semesters);
    const hasFinancialTracking = hasYearScholarshipFinancialTracking(semesters);
    const savePaidTransactions = allEligible || (feeOnlyMode && isCollege);

    const sanctionedValidation = validateScholarshipAmount(
      hasFinancialTracking ? yearEntry.sanctioned_amount : 0,
      {
        fieldLabel: `Year ${studentYear} sanctioned amount`
      }
    );
    if (!sanctionedValidation.valid) return sanctionedValidation;

    if (feeOnlyMode && !allEligible) {
      const incomingReleases = Array.isArray(yearEntry.releases) ? yearEntry.releases : [];
      const hasRtfPayload = incomingReleases.some((release) => {
        const releaseAmount = clampScholarshipAmount(release.released_amount);
        const releaseDate = release.rtf_released_date && String(release.rtf_released_date).trim();
        return releaseAmount > 0 || releaseDate;
      });
      if (hasRtfPayload) {
        return {
          valid: false,
          message: `Year ${studentYear}: RTF released amounts are not allowed when semesters are not all Eligible`
        };
      }
      if (!isCollege) {
        const incomingPaid = Array.isArray(yearEntry.paid_transactions) ? yearEntry.paid_transactions : [];
        const hasPaidPayload = incomingPaid.some((transaction) => {
          const paidAmount = clampScholarshipAmount(transaction.paid_amount);
          const paidDate = transaction.paid_date && String(transaction.paid_date).trim();
          return paidAmount > 0 || paidDate;
        });
        if (hasPaidPayload) {
          return {
            valid: false,
            message: `Year ${studentYear}: Paid transactions are only allowed for College Account students when semesters are not all Eligible`
          };
        }
      }
    }

    const releases = allEligible && Array.isArray(yearEntry.releases) ? yearEntry.releases : [];
    const paidTransactions = savePaidTransactions && Array.isArray(yearEntry.paid_transactions)
      ? yearEntry.paid_transactions
      : [];
    let totalReleasedAmount = 0;
    for (let index = 0; index < releases.length; index += 1) {
      const release = releases[index];
      const releaseAmount = clampScholarshipAmount(release.released_amount);
      const releaseDate = release.rtf_released_date && String(release.rtf_released_date).trim();
      const hasReleaseValue = releaseAmount > 0 || releaseDate;
      if (!hasReleaseValue) continue;

      const dateValidation = validateRtfReleasedDate(release.rtf_released_date, {
        fieldLabel: `Year ${studentYear} RTF Remitted date (row ${index + 1})`,
        allowEmpty: true
      });
      if (!dateValidation.valid) return dateValidation;

      const releaseValidation = validateScholarshipAmount(
        normalizeScholarshipAmountInput(release.released_amount),
        {
          fieldLabel: `Year ${studentYear} RTF released amount (row ${index + 1})`,
          allowEmpty: !releaseDate
        }
      );
      if (!releaseValidation.valid) return releaseValidation;

      totalReleasedAmount += releaseAmount;
    }

    let totalPaidAmount = 0;
    for (let index = 0; index < paidTransactions.length; index += 1) {
      const transaction = paidTransactions[index];
      const paidAmount = clampScholarshipAmount(transaction.paid_amount);
      const paidDate = transaction.paid_date && String(transaction.paid_date).trim();
      const hasPaidValue = paidAmount > 0 || paidDate;
      if (!hasPaidValue) continue;

      const paidDateValidation = validateRtfReleasedDate(transaction.paid_date, {
        fieldLabel: `Year ${studentYear} fee paid date (row ${index + 1})`,
        allowEmpty: true
      });
      if (!paidDateValidation.valid) return paidDateValidation;

      const paidValidation = validateScholarshipAmount(
        normalizeScholarshipAmountInput(transaction.paid_amount),
        {
          fieldLabel: `Year ${studentYear} paid amount (row ${index + 1})`,
          allowEmpty: !paidDate
        }
      );
      if (!paidValidation.valid) return paidValidation;

      // Eligible College Account: RTF auto-credit can exceed per-row Fee Due. Fee-only College
      // Account and Mother Account: enforce per-row Fee Due cap.
      const skipPerRowFeeDueCap = isCollege && allEligible;
      if (!skipPerRowFeeDueCap) {
        const sanctionedValue = sanctionedValidation.value ?? 0;
        const remainingFeeDue = Math.max(0, sanctionedValue - totalPaidAmount);
        if (sanctionedValue > 0 && paidAmount > remainingFeeDue) {
          return {
            valid: false,
            message: `Year ${studentYear}: Paid amount on row ${index + 1} (${paidAmount}) exceeds remaining Fee Due (${remainingFeeDue})`
          };
        }
      }

      totalPaidAmount += paidAmount;
    }

    const sanctionedValue = sanctionedValidation.value ?? 0;
    const manualPaidAmount = allEligible
      ? (isCollege ? Math.max(0, totalPaidAmount - totalReleasedAmount) : totalPaidAmount)
      : totalPaidAmount;
    const feeDueValue = calculateFeeDue(sanctionedValue, manualPaidAmount);

    if (allEligible) {
    let runningReleasedAmount = 0;
    for (let index = 0; index < releases.length; index += 1) {
      const release = releases[index];
      const releaseAmount = clampScholarshipAmount(release.released_amount);
      const releaseDate = release.rtf_released_date && String(release.rtf_released_date).trim();
      const hasReleaseValue = releaseAmount > 0 || releaseDate;
      if (!hasReleaseValue) continue;

      if (sanctionedValue > 0 && feeDueValue > 0) {
        const remainingRtfDue = Math.max(0, sanctionedValue - runningReleasedAmount);
        if (releaseAmount > remainingRtfDue) {
          return {
            valid: false,
            message: `Year ${studentYear}: RTF released amount on row ${index + 1} (${releaseAmount}) exceeds remaining RTF Due (${remainingRtfDue})`
          };
        }
      }

      runningReleasedAmount += releaseAmount;
    }

    // Total released must not exceed sanctioned amount
    if (sanctionedValue > 0 && totalReleasedAmount > sanctionedValue) {
      return {
        valid: false,
        message: `Year ${studentYear}: Total RTF released amount (${totalReleasedAmount}) cannot exceed sanctioned amount (${sanctionedValue})`
      };
    }

    // Eligible flow: manual paid must not exceed sanctioned (college excludes auto-credit).
    if (sanctionedValue > 0 && manualPaidAmount > sanctionedValue) {
      return {
        valid: false,
        message: `Year ${studentYear}: Total paid amount (${manualPaidAmount}) cannot exceed sanctioned amount (${sanctionedValue})`
      };
    }
    }

    // Fee-only College Account: all paid entries are manual; total must not exceed sanctioned.
    if (feeOnlyMode && isCollege && sanctionedValue > 0 && totalPaidAmount > sanctionedValue) {
      return {
        valid: false,
        message: `Year ${studentYear}: Total paid amount (${totalPaidAmount}) cannot exceed sanctioned amount (${sanctionedValue})`
      };
    }
  }

  return { valid: true };
};

module.exports = {
  APPLICATION_ID_LENGTH,
  MAX_SCHOLARSHIP_AMOUNT,
  normalizeApplicationIdInput,
  normalizeScholarshipAmountInput,
  normalizeRtfReleasedDate,
  validateApplicationId,
  validateScholarshipAmount,
  validateRtfReleasedDate,
  validateScholarshipYearsPayload,
  checkApplicationIdAvailability,
  clampScholarshipAmount,
  calculateFeeDue,
  calculateRtfDue,
  calculateAdvanceAmount,
  allSemestersEligible,
  allSemestersStatusAssigned,
  isYearFeeOnlyScholarshipMode,
  hasYearScholarshipFinancialTracking
};

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

const validateRtfReleasedDate = (value, { fieldLabel = 'RTF emitted date', allowEmpty = true } = {}) => {
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

const validateScholarshipYearsPayload = async (connection, studentId, years = []) => {
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

    const sanctionedValidation = validateScholarshipAmount(yearEntry.sanctioned_amount, {
      fieldLabel: `Year ${studentYear} sanctioned amount`
    });
    if (!sanctionedValidation.valid) return sanctionedValidation;

    const releases = Array.isArray(yearEntry.releases) ? yearEntry.releases : [];
    for (let index = 0; index < releases.length; index += 1) {
      const release = releases[index];
      const releaseAmount = clampScholarshipAmount(release.released_amount);
      const releaseDate = release.rtf_released_date && String(release.rtf_released_date).trim();
      const hasReleaseValue = releaseAmount > 0 || releaseDate;
      if (!hasReleaseValue) continue;

      const dateValidation = validateRtfReleasedDate(release.rtf_released_date, {
        fieldLabel: `Year ${studentYear} RTF emitted date (row ${index + 1})`,
        allowEmpty: releaseAmount <= 0
      });
      if (!dateValidation.valid) return dateValidation;

      const releaseValidation = validateScholarshipAmount(
        normalizeScholarshipAmountInput(release.released_amount),
        {
          fieldLabel: `Year ${studentYear} release amount (row ${index + 1})`,
          allowEmpty: !releaseDate
        }
      );
      if (!releaseValidation.valid) return releaseValidation;
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
  clampScholarshipAmount
};

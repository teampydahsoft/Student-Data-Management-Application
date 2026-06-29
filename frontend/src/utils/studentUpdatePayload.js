/**
 * Build a partial studentData payload containing only fields that changed.
 * Reduces request size; backend merges into existing student_data.
 */

/** System / DB-managed keys — never send on update (common in imported student_data). */
export const READONLY_STUDENT_PAYLOAD_KEYS = new Set([
  'id',
  'admission_number',
  'admission_no',
  'created_at',
  'updated_at',
  'student_data',
  'studentData',
  'synchronizedData',
  'student_marks',
  'student_attendance',
  'today_attendance_status',
  'scholar_status',
  'Scholar Status',
  'scholarstatus'
]);

export function stripReadonlyStudentPayloadFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {};
  }
  const out = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (!READONLY_STUDENT_PAYLOAD_KEYS.has(key)) {
      out[key] = value;
    }
  });
  return out;
}

const normalizeForCompare = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
};

const valuesEqual = (a, b) => normalizeForCompare(a) === normalizeForCompare(b);

const isNewPhotoUpload = (value) =>
  typeof value === 'string' && value.startsWith('data:image/');

/**
 * @param {object} baseline - Snapshot when edit session started
 * @param {object} current - Current form state (e.g. synchronizedData)
 * @param {object} [options]
 * @param {string} [options.registrationStatus]
 * @param {string} [options.feeStatus]
 * @param {object} [options.originalStudent] - Row from API (for photo comparison)
 */
export function buildPartialStudentUpdatePayload(baseline, current, options = {}) {
  if (!current || typeof current !== 'object') {
    return {};
  }

  const base = baseline && typeof baseline === 'object' ? baseline : {};
  const changed = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(current)]);

  keys.forEach((key) => {
    if (READONLY_STUDENT_PAYLOAD_KEYS.has(key)) {
      return;
    }

    if (key === 'student_photo' || key === 'Student Photo') {
      const newVal = current[key];
      const oldVal = base[key];
      const existingPhoto =
        options.originalStudent?.student_photo ||
        base.student_photo ||
        base['Student Photo'];

      if (isNewPhotoUpload(newVal) && newVal !== existingPhoto) {
        changed[key] = newVal;
      }
      return;
    }

    if (!valuesEqual(base[key], current[key])) {
      changed[key] = current[key];
    }
  });

  const { registrationStatus, feeStatus } = options;
  if (
    registrationStatus !== undefined &&
    !valuesEqual(base.registration_status ?? base['Registration Status'], registrationStatus)
  ) {
    changed.registration_status = registrationStatus;
    changed['Registration Status'] = registrationStatus;
  }

  if (
    feeStatus !== undefined &&
    feeStatus !== 'permitted' &&
    !valuesEqual(base.fee_status ?? base['Fee Status'], feeStatus)
  ) {
    changed.fee_status = feeStatus;
    changed['Fee Status'] = feeStatus;
  }

  return stripReadonlyStudentPayloadFields(changed);
}

export function cloneStudentFormSnapshot(data) {
  return stripReadonlyStudentPayloadFields(
    (() => {
      if (!data || typeof data !== 'object') return {};
      try {
        return JSON.parse(JSON.stringify(data));
      } catch {
        return { ...data };
      }
    })()
  );
}

import api from '../config/api';

const HARDCODED_FORM_KEYS = new Set([
  'batch', 'college', 'course', 'branch', 'current_year', 'current_semester',
  'student_name', 'father_name', 'gender', 'dob', 'student_mobile',
  'parent_mobile1', 'parent_mobile2', 'parent_mobile_1', 'parent_mobile_2',
  'adhar_no', 'aadhar_no', 'aadhaar_no', 'caste', 'stud_type', 'studtype',
  'student_address', 'city_village', 'mandal_name', 'district',
  'previous_college', 'certificates_status', 'remarks', 'pin_no',
  'admission_date', 'student_status', 'scholar_status', 'merit_status', 'fee_status',
  'registration_status', 'student_photo', 'apaar_id', 'apaar',
  'admission_number', 'admission_no', 'created_at', 'updated_at', 'id',
  'is_student_mobile_verified', 'is_parent_mobile_verified',
  'student_data', 'section', 'roll_number'
]);

export const CORE_EXPORT_FIELDS = [
  { key: 'admission_number', label: 'Admission Number', group: 'Admission', altKeys: ['Admission Number', 'admission_no'] },
  { key: 'pin_no', label: 'PIN Number', group: 'Admission', altKeys: ['PIN Number', 'Roll Number'] },
  { key: 'roll_number', label: 'Roll Number', group: 'Admission' },
  { key: 'admission_date', label: 'Admission Date', group: 'Admission', altKeys: ['Admission Date'] },
  { key: 'student_name', label: 'Student Name', group: 'Personal', altKeys: ['Student Name', 'Name'] },
  { key: 'father_name', label: 'Father Name', group: 'Personal', altKeys: ['Father Name'] },
  { key: 'gender', label: 'Gender', group: 'Personal', altKeys: ['M/F', 'Gender'] },
  { key: 'dob', label: 'Date of Birth', group: 'Personal', altKeys: ['DOB (Date of Birth - DD-MM-YYYY)', 'DOB'] },
  { key: 'caste', label: 'Caste', group: 'Personal', altKeys: ['Caste'] },
  { key: 'adhar_no', label: 'Aadhar Number', group: 'Personal', altKeys: ['ADHAR No', 'Aadhar Number'] },
  { key: 'apaar_id', label: 'APAAR ID', group: 'Personal', altKeys: ['APAAR ID', 'apaar'] },
  { key: 'student_mobile', label: 'Student Mobile', group: 'Contact', altKeys: ['Student Mobile Number', 'Mobile Number'] },
  { key: 'parent_mobile1', label: 'Parent Mobile 1', group: 'Contact', altKeys: ['Parent Mobile Number 1'] },
  { key: 'parent_mobile2', label: 'Parent Mobile 2', group: 'Contact', altKeys: ['Parent Mobile Number 2'] },
  { key: 'student_address', label: 'Address', group: 'Address', altKeys: ['Student Address (D.No, Str name, Village, Mandal, Dist)'] },
  { key: 'city_village', label: 'City/Village', group: 'Address', altKeys: ['City/Village'] },
  { key: 'mandal_name', label: 'Mandal', group: 'Address', altKeys: ['Mandal Name'] },
  { key: 'district', label: 'District', group: 'Address', altKeys: ['District'] },
  { key: 'college', label: 'College', group: 'Academic', altKeys: ['College'] },
  { key: 'batch', label: 'Batch', group: 'Academic', altKeys: ['Batch'] },
  { key: 'course', label: 'Program', group: 'Academic', altKeys: ['Course', 'Course Name', 'Program', 'Program Name'] },
  { key: 'branch', label: 'Branch', group: 'Academic', altKeys: ['Branch', 'Branch Name'] },
  { key: 'section', label: 'Section', group: 'Academic', altKeys: ['Section'] },
  { key: 'current_year', label: 'Current Year', group: 'Academic', altKeys: ['Current Academic Year', 'Year'] },
  { key: 'current_semester', label: 'Current Semester', group: 'Academic', altKeys: ['Current Semester', 'Semester'] },
  { key: 'stud_type', label: 'Student Type', group: 'Academic', altKeys: ['StudType', 'Student Type'] },
  { key: 'student_status', label: 'Student Status', group: 'Status', altKeys: ['Student Status', 'Status'] },
  { key: 'scholar_status', label: 'Scholar Status', group: 'Status', altKeys: ['Scholar Status', 'Scholarship Status'] },
  { key: 'merit_status', label: 'Merit Status', group: 'Status', altKeys: ['Merit Status'] },
  { key: 'fee_status', label: 'Fee Status', group: 'Status', altKeys: ['Fee Status'] },
  { key: 'registration_status', label: 'Registration Status', group: 'Status', altKeys: ['Registration Status'] },
  { key: 'certificates_status', label: 'Certificates Status', group: 'Status', altKeys: ['Certificates Status'] },
  { key: 'previous_college', label: 'Previous College', group: 'Academic', altKeys: ['Previous College'] },
  { key: 'remarks', label: 'Remarks', group: 'Other', altKeys: ['Remarks'] },
  { key: 'created_at', label: 'Created At', group: 'Other' },
  { key: 'updated_at', label: 'Updated At', group: 'Other' }
];

export const DEFAULT_EXPORT_FIELD_KEYS = [
  'admission_number',
  'pin_no',
  'student_name',
  'college',
  'batch',
  'course',
  'branch',
  'current_year',
  'current_semester',
  'student_mobile',
  'student_status'
];

const parseStudentData = (student) => {
  if (!student?.student_data) return {};
  if (typeof student.student_data === 'string') {
    try {
      return JSON.parse(student.student_data);
    } catch {
      return {};
    }
  }
  return student.student_data;
};

const isEmptyValue = (value) => value === undefined || value === null || value === '';

export const formatExportValue = (value) => {
  if (isEmptyValue(value)) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map((item) => formatExportValue(item)).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    const displayKeys = ['label', 'name', 'value', 'status', 'text', 'title'];
    for (const key of displayKeys) {
      if (!isEmptyValue(value[key]) && (typeof value[key] === 'string' || typeof value[key] === 'number')) {
        return String(value[key]);
      }
    }
    const primitiveEntries = Object.entries(value).filter(
      ([, entryValue]) => !isEmptyValue(entryValue) && typeof entryValue !== 'object'
    );
    if (primitiveEntries.length > 0) {
      return primitiveEntries.map(([key, entryValue]) => `${key}: ${entryValue}`).join('; ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value).trim();
};

const escapeCsvCell = (value) => {
  const str = formatExportValue(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const getStudentFieldValue = (student, field) => {
  const keys = [field.key, field.label, ...(field.altKeys || [])].filter(Boolean);

  for (const key of keys) {
    if (!isEmptyValue(student[key])) {
      if (field.key === 'merit_status') {
        const normalized = String(student[key]).trim().toLowerCase();
        if (normalized === 'yes') return 'Yes';
        if (normalized === 'no') return 'No';
        return '';
      }
      return student[key];
    }
  }

  const data = parseStudentData(student);
  for (const key of keys) {
    if (!isEmptyValue(data[key])) {
      if (field.key === 'merit_status') {
        const normalized = String(data[key]).trim().toLowerCase();
        if (normalized === 'yes') return 'Yes';
        if (normalized === 'no') return 'No';
        return '';
      }
      return data[key];
    }
  }

  return '';
};

export const buildExportFieldOptions = (forms = [], canViewField = () => true) => {
  const seen = new Set();
  const fields = [];

  CORE_EXPORT_FIELDS.forEach((field) => {
    if (!canViewField(field.key)) return;
    if (seen.has(field.key)) return;
    seen.add(field.key);
    fields.push(field);
  });

  forms.forEach((form) => {
    if (!form?.is_active) return;
    const formFields = Array.isArray(form.form_fields) ? form.form_fields : [];
    formFields.forEach((formField) => {
      if (formField.isEnabled === false) return;
      const key = (formField.key || formField.label || '').trim();
      if (!key) return;
      const normalizedKey = key.toLowerCase();
      if (HARDCODED_FORM_KEYS.has(normalizedKey) || seen.has(key)) return;
      if (normalizedKey.startsWith('field_')) return;
      seen.add(key);
      fields.push({
        key,
        label: formField.label || key,
        group: 'Additional Registration Fields',
        altKeys: formField.label && formField.label !== key ? [formField.label] : []
      });
    });
  });

  return fields;
};

export const buildStudentsCsv = (students, selectedFields) => {
  const headers = selectedFields.map((field) => field.label);
  const rows = students.map((student) =>
    selectedFields.map((field) => escapeCsvCell(getStudentFieldValue(student, field))).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
};

const appendFilterParams = (queryParams, filters = {}) => {
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'batch') queryParams.append('filter_batch', value);
    else if (key === 'course') queryParams.append('filter_course', value);
    else if (key === 'branch') queryParams.append('filter_branch', value);
    else if (key === 'section') queryParams.append('filter_section', value);
    else if (key === 'year') queryParams.append('filter_year', value);
    else if (key === 'semester') queryParams.append('filter_semester', value);
    else if (key === 'dateFrom') queryParams.append('filter_dateFrom', value);
    else if (key === 'dateTo') queryParams.append('filter_dateTo', value);
    else if (key === 'pinNumberStatus') queryParams.append('filter_pinNumberStatus', value);
    else if (key.startsWith('filter_')) queryParams.append(key, value);
    else if (key.startsWith('field_')) queryParams.append(`filter_field_${key.replace('field_', '')}`, value);
    else queryParams.append(`filter_${key}`, value);
  });
};

export const fetchStudentsForExport = async ({ filters = {}, search = '' } = {}) => {
  const queryParams = new URLSearchParams();
  appendFilterParams(queryParams, filters);
  if (search && search.trim()) {
    queryParams.append('search', search.trim());
  }
  queryParams.append('limit', 'all');

  const response = await api.get(`/students?${queryParams.toString()}`);
  return response.data?.data || [];
};

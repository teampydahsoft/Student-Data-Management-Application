const { masterPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { writeAuditLog } = require('../services/auditLogService');

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to safely parse JSON fields
const parseJSON = (data) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }
  return data;
};

// Helper function to safely stringify data for database storage
const safeJSONStringify = (data) => {
  try {
    // First validate that the data can be JSON parsed (round-trip test)
    const testString = JSON.stringify(data);
    JSON.parse(testString);

    // Check size limit
    if (testString.length > 50000) {
      console.warn('Data size exceeds limit, truncating...');
      const essentialData = {
        admission_number: data.admission_number || 'Unknown',
        student_name: data.student_name || 'Unknown',
        warning: 'Data truncated due to size limitations',
        original_size: testString.length,
        timestamp: new Date().toISOString()
      };
      return JSON.stringify(essentialData);
    }

    return testString;
  } catch (error) {
    console.error('JSON stringify error:', error);
    // Return a minimal safe object
    return JSON.stringify({
      error: 'Data serialization failed',
      timestamp: new Date().toISOString(),
      fallback: true
    });
  }
};

const COLUMN_ALIAS_MAP = {
  pin_no: 'pin_no',
  'Pin No': 'pin_no',
  batch: 'batch',
  Batch: 'batch',
  course: 'course',
  Course: 'course',
  branch: 'branch',
  Branch: 'branch',
  stud_type: 'stud_type',
  StudType: 'stud_type',
  student_name: 'student_name',
  'Student Name': 'student_name',
  student_status: 'student_status',
  'Student Status': 'student_status',
  scholar_status: 'scholar_status',
  'Scholar Status': 'scholar_status',
  student_mobile: 'student_mobile',
  'Student Mobile Number': 'student_mobile',
  parent_mobile1: 'parent_mobile1',
  'Parent Mobile Number 1': 'parent_mobile1',
  parent_mobile2: 'parent_mobile2',
  'Parent Mobile Number 2': 'parent_mobile2',
  caste: 'caste',
  Caste: 'caste',
  gender: 'gender',
  'M/F': 'gender',
  father_name: 'father_name',
  'Father Name': 'father_name',
  dob: 'dob',
  'DOB (Date of Birth - DD-MM-YYYY)': 'dob',
  'DOB (Date-Month-Year)': 'dob',
  adhar_no: 'adhar_no',
  'AADHAR No': 'adhar_no',
  admission_date: 'admission_date',
  'Admission Date': 'admission_date',
  'Admission Year (Ex: 09-Sep-2003)': 'admission_date',
  student_address: 'student_address',
  'Student Address (D.No, Str name, Village, Mandal, Dist)': 'student_address',
  'Student Address': 'student_address',
  city_village: 'city_village',
  'City/Village': 'city_village',
  'CityVillage Name': 'city_village',
  mandal_name: 'mandal_name',
  'Mandal Name': 'mandal_name',
  district: 'district',
  'District': 'district',
  'District Name': 'district',
  previous_college: 'previous_college',
  'Previous College Name': 'previous_college',
  certificates_status: 'certificates_status',
  'Certificate Status': 'certificates_status',
  student_photo: 'student_photo',
  remarks: 'remarks',
  Remarks: 'remarks',
  current_year: 'current_year',
  currentYear: 'current_year',
  'Current Year': 'current_year',
  'Current Academic Year': 'current_year',
  current_semester: 'current_semester',
  currentSemester: 'current_semester',
  'Current Semester': 'current_semester'
};

const getColumnNameForField = (fieldKey) => COLUMN_ALIAS_MAP[fieldKey] || null;

const normalizeHeaderKey = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const normalizeComparisonValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const toExcelColumn = (index) => {
  let dividend = index + 1;
  let columnName = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
};

const BASE_TEMPLATE_FIELDS = [
  {
    header: 'admission_number',
    valueKey: 'admission_number',
    displayName: 'Admission Number',
    category: 'Administrative',
    required: false,
    description: 'Existing student admission number. Leave blank for new admissions.',
    example: 'ADM001',
    aliases: ['Admission Number', 'Admission No', 'admissionnumber', 'admission no', 'admission_no']
  },
  {
    header: 'Pin No',
    valueKey: 'pin_no',
    displayName: 'PIN Number',
    category: 'Administrative',
    required: false,
    description: 'Internal PIN or roll number if already assigned.',
    example: 'PIN123',
    aliases: ['PIN', 'PIN Number', 'pinno', 'roll no', 'roll number', 'pin_number']
  },
  {
    header: 'Batch',
    valueKey: 'batch',
    displayName: 'Batch',
    category: 'Academic',
    required: false,
    description: 'Batch or academic year grouping for the student.',
    example: '2023-24',
    aliases: ['Batch Name', 'batchyear', 'batch year']
  },
  {
    header: 'Course',
    valueKey: 'course',
    displayName: 'Course',
    category: 'Academic',
    required: true,
    description: 'Course name exactly as configured (for example B.Tech, MBA, Diploma).',
    example: 'B.Tech',
    aliases: ['Course Name', 'course_name', 'program', 'programme']
  },
  {
    header: 'Branch',
    valueKey: 'branch',
    displayName: 'Branch',
    category: 'Academic',
    required: true,
    description: 'Branch / department name exactly as configured for the selected course.',
    example: 'Computer Science',
    aliases: ['Branch Name', 'branch_name', 'department', 'dept']
  },
  {
    header: 'StudType',
    valueKey: 'stud_type',
    displayName: 'Student Type',
    category: 'Academic',
    required: false,
    description: 'Student type such as Regular, Lateral, Management quota etc.',
    example: 'Regular',
    aliases: ['Student Type', 'studtype', 'studenttype']
  },
  {
    header: 'Current Academic Year',
    valueKey: 'current_year',
    displayName: 'Current Academic Year',
    category: 'Academic Progress',
    required: false,
    description: 'Numeric academic year the student currently belongs to (1, 2, 3...).',
    example: '3',
    aliases: ['Current Year', 'Year', 'Academic Year', 'currentyear']
  },
  {
    header: 'Current Semester',
    valueKey: 'current_semester',
    displayName: 'Current Semester',
    category: 'Academic Progress',
    required: false,
    description: 'Numeric semester the student is currently studying (1, 2, 3...).',
    example: '1',
    aliases: ['Semester', 'Sem', 'currentsemester']
  },
  {
    header: 'Student Name',
    valueKey: 'student_name',
    displayName: 'Student Name',
    category: 'Identity',
    required: true,
    description: 'Full name of the student as per official records.',
    example: 'John Doe',
    aliases: ['Name', 'Full Name', 'studentname']
  },
  {
    header: 'Student Status',
    valueKey: 'student_status',
    displayName: 'Student Status',
    category: 'Academic',
    required: false,
    description: 'Academic status such as Active, Inactive, Completed etc.',
    example: 'Active',
    aliases: ['Status', 'studentstatus']
  },
  {
    header: 'Scholar Status',
    valueKey: 'scholar_status',
    displayName: 'Scholar Status',
    category: 'Administrative',
    required: false,
    description: 'Scholarship or fee concession status if applicable.',
    example: 'Scholarship',
    aliases: ['Scholarship Status', 'scholarstatus']
  },
  {
    header: 'Student Mobile Number',
    valueKey: 'student_mobile',
    displayName: 'Student Mobile Number',
    category: 'Contact',
    required: false,
    description: 'Primary contact number of the student.',
    example: '9876543210',
    aliases: ['Mobile Number', 'student mobile', 'mobile', 'studentmobile']
  },
  {
    header: 'Parent Mobile Number 1',
    valueKey: 'parent_mobile1',
    displayName: 'Parent Mobile Number 1',
    category: 'Contact',
    required: false,
    description: 'Primary contact number for parent or guardian.',
    example: '9123456789',
    aliases: ['Parent Mobile', 'parentmobile1', 'parent mobile 1']
  },
  {
    header: 'Parent Mobile Number 2',
    valueKey: 'parent_mobile2',
    displayName: 'Parent Mobile Number 2',
    category: 'Contact',
    required: false,
    description: 'Alternate parent or guardian contact number.',
    example: '9876501234',
    aliases: ['Alternate Parent Mobile', 'parentmobile2', 'parent mobile 2']
  },
  {
    header: 'Caste',
    valueKey: 'caste',
    displayName: 'Caste / Category',
    category: 'Demographics',
    required: false,
    description: 'Community / category information if tracked.',
    example: 'OC',
    aliases: ['Category', 'community', 'castecategory']
  },
  {
    header: 'M/F',
    valueKey: 'gender',
    displayName: 'Gender',
    category: 'Demographics',
    required: false,
    description: 'Gender of the student (M, F, Other).',
    example: 'M',
    aliases: ['Gender', 'Sex', 'genderidentity']
  },
  {
    header: 'DOB (Date-Month-Year)',
    valueKey: 'dob',
    displayName: 'Date of Birth',
    category: 'Identity',
    required: false,
    description: 'Date of birth in DD-MMM-YYYY format (for example 01-Jan-2000).',
    example: '01-Jan-2000',
    aliases: ['DOB', 'Date of Birth', 'birthdate']
  },
  {
    header: 'Father Name',
    valueKey: 'father_name',
    displayName: 'Father / Guardian Name',
    category: 'Identity',
    required: false,
    description: 'Name of father or primary guardian.',
    example: 'Mr. John Senior',
    aliases: ['Guardian Name', 'Parent Name', 'fathername']
  },
  {
    header: 'Admission Year (Ex: 09-Sep-2003)',
    valueKey: 'admission_date',
    displayName: 'Admission Date',
    category: 'Administrative',
    required: false,
    description: 'Date of admission in DD-MMM-YYYY format.',
    example: '01-Sep-2023',
    aliases: ['Admission Date', 'admissionyear', 'dateofadmission']
  },
  {
    header: 'AADHAR No',
    valueKey: 'adhar_no',
    displayName: 'AADHAR Number',
    category: 'Identity',
    required: false,
    description: '12 digit AADHAR number. Numbers only, without spaces.',
    example: '123456789012',
    aliases: ['Aadhaar Number', 'Aadhar', 'aadhaarno', 'aadhaar']
  },
  {
    header: 'Student Address',
    valueKey: 'student_address',
    displayName: 'Student Address',
    category: 'Contact',
    required: false,
    description: 'Full postal address of the student.',
    example: '123 Main Street',
    aliases: ['Address', 'studentaddress']
  },
  {
    header: 'CityVillage Name',
    valueKey: 'city_village',
    displayName: 'City / Village',
    category: 'Contact',
    required: false,
    description: 'City or village name from the postal address.',
    example: 'Hyderabad',
    aliases: ['City', 'Village', 'city', 'cityvillage']
  },
  {
    header: 'Mandal Name',
    valueKey: 'mandal_name',
    displayName: 'Mandal / Taluk',
    category: 'Contact',
    required: false,
    description: 'Mandal or taluk from the postal address.',
    example: 'Serilingampally',
    aliases: ['Mandal', 'Taluk', 'mandal', 'taluk']
  },
  {
    header: 'District Name',
    valueKey: 'district',
    displayName: 'District',
    category: 'Contact',
    required: false,
    description: 'District from the postal address.',
    example: 'Rangareddy',
    aliases: ['District', 'districtname']
  },
  {
    header: 'Previous College Name',
    valueKey: 'previous_college',
    displayName: 'Previous College',
    category: 'Academic',
    required: false,
    description: 'Name of the previous institution attended, if any.',
    example: 'ABC Junior College',
    aliases: ['Previous College', 'previouscollege']
  },
  {
    header: 'Certificate Status',
    valueKey: 'certificates_status',
    displayName: 'Certificates Status',
    category: 'Administrative',
    required: false,
    description: 'Certificate verification status (Pending, Submitted, Verified...).',
    example: 'Pending',
    aliases: ['Certificate Status', 'certificatesstatus']
  },
  {
    header: 'Remarks',
    valueKey: 'remarks',
    displayName: 'Remarks / Notes',
    category: 'Administrative',
    required: false,
    description: 'Any additional notes for the admin team.',
    example: 'Eligible for sports quota',
    aliases: ['Notes', 'comments', 'remark']
  }
];

const registerListMapValue = (map, rawKey, value) => {
  if (!rawKey) {
    return;
  }
  const key = normalizeComparisonValue(rawKey);
  if (!key) {
    return;
  }
  if (!map.has(key)) {
    map.set(key, []);
  }
  const list = map.get(key);
  if (!list.some((item) => item.id === value.id)) {
    list.push(value);
  }
};

const buildCourseBranchIndex = async () => {
  try {
    const [courseRows] = await masterPool.query(
      'SELECT id, name, code FROM courses WHERE is_active = 1 ORDER BY name ASC'
    );

    if (!courseRows || courseRows.length === 0) {
      return {
        options: [],
        courseById: new Map(),
        courseByKey: new Map(),
        branchByKey: new Map()
      };
    }

    const courseIds = courseRows.map((course) => course.id);
    let branchRows = [];

    if (courseIds.length > 0) {
      const [branches] = await masterPool.query(
        'SELECT id, course_id, name, code FROM course_branches WHERE is_active = 1 AND course_id IN (?) ORDER BY name ASC',
        [courseIds]
      );
      branchRows = branches || [];
    }

    const courseById = new Map();
    const courseByKey = new Map();
    const branchByKey = new Map();

    const sanitizedCourses = courseRows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      branches: []
    }));

    sanitizedCourses.forEach((course) => {
      courseById.set(course.id, course);
      const possibleKeys = [
        course.name,
        course.code,
        `${course.name || ''} ${course.code || ''}`
      ];
      possibleKeys.forEach((value) => {
        const key = normalizeComparisonValue(value);
        if (key && !courseByKey.has(key)) {
          courseByKey.set(key, course);
        }
      });
    });

    branchRows.forEach((row) => {
      const branch = {
        id: row.id,
        courseId: row.course_id,
        name: row.name,
        code: row.code
      };
      const course = courseById.get(branch.courseId);
      if (course) {
        course.branches.push(branch);
      }

      const possibleKeys = [
        branch.name,
        branch.code,
        `${branch.name || ''} ${branch.code || ''}`,
        course ? `${course.name || ''} ${branch.name || ''}` : '',
        course ? `${course.code || ''} ${branch.code || ''}` : ''
      ];
      possibleKeys.forEach((value) => registerListMapValue(branchByKey, value, branch));
    });

    sanitizedCourses.forEach((course) => {
      course.branches.sort((a, b) => a.name.localeCompare(b.name));
    });

    return {
      options: sanitizedCourses,
      courseById,
      courseByKey,
      branchByKey
    };
  } catch (error) {
    console.error('Failed to build course/branch index:', error);
    return {
      options: [],
      courseById: new Map(),
      courseByKey: new Map(),
      branchByKey: new Map()
    };
  }
};

const resolveCourseAndBranch = (courseIndex, {
  courseValue,
  courseCodeValue,
  branchValue,
  branchCodeValue
}) => {
  if (!courseIndex) {
    return {
      course: null,
      branch: null,
      errors: []
    };
  }

  const { courseByKey, branchByKey, courseById } = courseIndex;

  const candidateCourseKeys = [
    courseCodeValue,
    courseValue
  ]
    .map((value) => normalizeComparisonValue(value))
    .filter((value) => value);

  let matchedCourse = null;
  for (const key of candidateCourseKeys) {
    if (courseByKey.has(key)) {
      matchedCourse = courseByKey.get(key);
      break;
    }
  }

  const candidateBranchKeys = [
    branchCodeValue,
    branchValue
  ]
    .map((value) => normalizeComparisonValue(value))
    .filter((value) => value);

  let matchedBranch = null;
  let candidateBranches = [];

  candidateBranchKeys.forEach((key) => {
    const branchList = branchByKey.get(key);
    if (branchList && branchList.length > 0) {
      candidateBranches = candidateBranches.concat(branchList);
    }
  });

  if (candidateBranches.length === 1) {
    matchedBranch = candidateBranches[0];
  } else if (candidateBranches.length > 1 && matchedCourse) {
    const filtered = candidateBranches.filter((branch) => branch.courseId === matchedCourse.id);
    if (filtered.length === 1) {
      matchedBranch = filtered[0];
    } else if (filtered.length > 1) {
      return {
        course: matchedCourse,
        branch: null,
        errors: [
          {
            type: 'ambiguous_branch',
            message: `Multiple branches matched "${branchValue || branchCodeValue}". Please provide the exact branch name.`,
            details: {
              providedValue: branchValue || branchCodeValue,
              matchingBranches: filtered.map((branch) => branch.name)
            }
          }
        ]
      };
    }
  } else if (candidateBranches.length > 1 && !matchedCourse) {
    const uniqueCourseIds = Array.from(new Set(candidateBranches.map((branch) => branch.courseId)));
    if (uniqueCourseIds.length === 1) {
      matchedBranch = candidateBranches[0];
      matchedCourse = courseById.get(uniqueCourseIds[0]) || null;
    } else {
      return {
        course: null,
        branch: null,
        errors: [
          {
            type: 'ambiguous_branch',
            message: `Branch "${branchValue || branchCodeValue}" exists in multiple courses. Please specify the course as well.`,
            details: {
              providedValue: branchValue || branchCodeValue,
              courses: uniqueCourseIds
                .map((courseId) => courseById.get(courseId))
                .filter(Boolean)
                .map((course) => course.name)
            }
          }
        ]
      };
    }
  }

  if (!matchedCourse && matchedBranch) {
    matchedCourse = courseById.get(matchedBranch.courseId) || null;
  }

  if (!matchedBranch && !branchValue && matchedCourse && matchedCourse.branches.length === 1) {
    matchedBranch = matchedCourse.branches[0];
  }

  const errors = [];

  if (!matchedCourse && candidateCourseKeys.length > 0) {
    errors.push({
      type: 'invalid_course',
      message: `Course "${courseValue || courseCodeValue}" was not found in the active course configuration.`,
      details: {
        providedValue: courseValue || courseCodeValue
      }
    });
  }

  if (branchValue || branchCodeValue) {
    if (!matchedBranch) {
      errors.push({
        type: 'invalid_branch',
        message: `Branch "${branchValue || branchCodeValue}" was not found in the active course configuration.`,
        details: {
          providedValue: branchValue || branchCodeValue,
          course: matchedCourse ? matchedCourse.name : null
        }
      });
    } else if (matchedCourse && matchedBranch.courseId !== matchedCourse.id) {
      errors.push({
        type: 'invalid_branch_course_combination',
        message: `Branch "${matchedBranch.name}" does not belong to course "${matchedCourse.name}".`,
        details: {
          branch: matchedBranch.name,
          course: matchedCourse.name
        }
      });
    }
  }

  return {
    course: matchedCourse || null,
    branch: matchedBranch || null,
    errors
  };
};

const buildTemplateResources = async (formId) => {
  if (!formId) {
    const error = new Error('Form ID is required');
    error.status = 400;
    throw error;
  }

  const [forms] = await masterPool.query(
    'SELECT * FROM forms WHERE form_id = ? LIMIT 1',
    [formId]
  );

  if (!forms || forms.length === 0) {
    const notFoundError = new Error('Form not found');
    notFoundError.status = 404;
    throw notFoundError;
  }

  const form = forms[0];
  const rawFormFields = parseJSON(form.form_fields) || [];
  const formFields = Array.isArray(rawFormFields) ? rawFormFields : [];

  const systemFields = BASE_TEMPLATE_FIELDS.map((field) => ({
    ...field,
    normalizedHeader: normalizeHeaderKey(field.header),
    normalizedAliases: (field.aliases || []).map((alias) => normalizeHeaderKey(alias)).filter(Boolean),
    source: 'System'
  }));

  const normalizedHeaders = new Set(systemFields.map((field) => field.normalizedHeader));

  const dynamicFields = [];

  formFields.forEach((field) => {
    const label = (field?.label || field?.name || field?.key || '').toString().trim();
    const key = (field?.key || label || '').toString().trim();

    if (!label || !key) {
      return;
    }

    const header = label;
    const normalizedHeader = normalizeHeaderKey(header);

    if (!normalizedHeader || normalizedHeaders.has(normalizedHeader)) {
      return;
    }

    normalizedHeaders.add(normalizedHeader);

    const required =
      field?.required === true ||
      field?.isRequired === true ||
      field?.validation === 'required' ||
      (Array.isArray(field?.validators) && field.validators.includes('required'));

    const description =
      field?.description ||
      field?.helpText ||
      field?.placeholder ||
      '';

    let example = '';
    if (field?.example) {
      example = field.example;
    } else if (Array.isArray(field?.options) && field.options.length > 0) {
      const firstOption = field.options[0];
      example = typeof firstOption === 'string' ? firstOption : (firstOption?.label || firstOption?.value || '');
    } else if (field?.defaultValue) {
      example = field.defaultValue;
    }

    dynamicFields.push({
      header,
      valueKey: key,
      displayName: label,
      category: field?.category || 'Form Field',
      required: !!required,
      description,
      example: example ? example.toString() : '',
      normalizedHeader,
      normalizedAliases: [normalizeHeaderKey(key), normalizeHeaderKey(label)],
      source: 'Form'
    });
  });

  const allFields = [...systemFields, ...dynamicFields];

  const fieldMapping = {};
  const normalizedFieldMapping = {};

  allFields.forEach((field) => {
    fieldMapping[field.header] = field.valueKey;
    field.normalizedAliases
      .concat([field.normalizedHeader])
      .filter(Boolean)
      .forEach((normalizedAlias) => {
        if (!normalizedFieldMapping[normalizedAlias]) {
          normalizedFieldMapping[normalizedAlias] = field.valueKey;
        }
      });
  });

  const headers = allFields.map((field) => field.header);

  const sampleRow = headers.map((header) => {
    const normalized = normalizeHeaderKey(header);
    const field = allFields.find((item) => item.normalizedHeader === normalized);
    return field && field.example ? field.example : '';
  });

  const sanitizedFieldSummaries = allFields.map(({ normalizedHeader, normalizedAliases, ...rest }) => rest);

  const courseIndex = await buildCourseBranchIndex();

  return {
    form,
    headers,
    sampleRow,
    fieldMapping,
    normalizedFieldMapping,
    fieldSummaries: sanitizedFieldSummaries,
    requiredHeaders: sanitizedFieldSummaries.filter((field) => field.required).map((field) => field.header),
    optionalHeaders: sanitizedFieldSummaries.filter((field) => !field.required).map((field) => field.header),
    courseOptions: courseIndex.options,
    courseIndex
  };
};

// Comprehensive logging utility for bulk upload operations
const logBulkUploadEvent = (level, event, data, timestamp = new Date().toISOString()) => {
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    event,
    ...data
  };

  const formattedLog = JSON.stringify(logEntry, null, 2);
  console.log(`[${level.toUpperCase()}] ${event}: ${formattedLog}`);
  return logEntry;
};

// Detailed row data logging utility
const logRowData = (rowNumber, rowData, fieldMapping) => {
  const extractedData = {};
  const missingFields = [];
  const presentFields = [];

  // Check each expected field
  Object.entries(fieldMapping).forEach(([csvHeader, fieldKey]) => {
    const value = rowData[csvHeader];
    if (value !== undefined && value !== null && value !== '') {
      extractedData[fieldKey] = value;
      presentFields.push(fieldKey);
    } else {
      missingFields.push(fieldKey);
    }
  });

  const logData = {
    rowNumber,
    totalFields: Object.keys(fieldMapping).length,
    presentFields: presentFields.length,
    missingFields: missingFields.length,
    presentFieldsList: presentFields,
    missingFieldsList: missingFields,
    extractedData,
    rawRowData: rowData
  };

  logBulkUploadEvent('info', 'ROW_DATA_EXTRACTED', logData);
  return logData;
};

// Error logging utility with context
const logBulkUploadError = (rowNumber, errorType, errorMessage, contextData = {}) => {
  const errorData = {
    rowNumber,
    errorType,
    errorMessage,
    context: contextData,
    stackTrace: new Error().stack
  };

  logBulkUploadEvent('error', 'BULK_UPLOAD_ERROR', errorData);
  return errorData;
};

// Performance logging utility
const logPerformanceMetrics = (operation, startTime, endTime, additionalMetrics = {}) => {
  const duration = endTime - startTime;
  const metricsData = {
    operation,
    startTime,
    endTime,
    duration: `${duration}ms`,
    durationSeconds: (duration / 1000).toFixed(2),
    ...additionalMetrics
  };

  logBulkUploadEvent('info', 'PERFORMANCE_METRICS', metricsData);
  return metricsData;
};

// Enhanced validation and duplicate checking function with comprehensive logging
const validateAndCheckDuplicates = async (submissionData, masterConn, rowNumber) => {
  const validationStartTime = Date.now();

  try {
    logBulkUploadEvent('info', 'VALIDATION_STARTED', {
      rowNumber,
      submissionData: submissionData,
      fieldCount: Object.keys(submissionData).length,
      availableFields: Object.keys(submissionData)
    });

    // Check for missing critical fields that are required for processing
    const criticalFields = ['student_name', 'course', 'branch'];
    const missingCriticalFields = [];

    criticalFields.forEach(field => {
      const value = submissionData[field];
      if (!value || String(value).trim() === '') {
        missingCriticalFields.push(field);
      }
    });

    if (missingCriticalFields.length > 0) {
      const validationTime = Date.now() - validationStartTime;
      logBulkUploadEvent('warn', 'CRITICAL_FIELDS_MISSING', {
        rowNumber,
        missingFields: missingCriticalFields,
        validationTime: `${validationTime}ms`
      });

      return {
        isValid: false,
        type: 'missing_fields',
        error: `Missing required fields: ${missingCriticalFields.join(', ')}`,
        details: { missingFields: missingCriticalFields },
        validationTime: `${validationTime}ms`
      };
    }

    // Check for duplicates based on unique identifiers with detailed logging
    const duplicateChecks = [];
    const duplicateCheckStartTime = Date.now();

    logBulkUploadEvent('info', 'DUPLICATE_CHECK_STARTED', {
      rowNumber,
      checkingFields: ['admission_number', 'adhar_no', 'student_mobile'],
      submissionData: submissionData
    });

    // Check by admission_number if provided
    if (submissionData.admission_number && String(submissionData.admission_number).trim() !== '') {
      const admissionNumber = String(submissionData.admission_number).trim();
      const admissionCheckStart = Date.now();

      // Check in students table (both admission_number and admission_no columns)
      const [existingStudents] = await masterConn.query(
        'SELECT admission_number, admission_no FROM students WHERE admission_number = ? OR admission_no = ?',
        [admissionNumber, admissionNumber]
      );

      const admissionCheckTime = Date.now() - admissionCheckStart;
      logBulkUploadEvent('info', 'ADMISSION_CHECK_COMPLETED', {
        rowNumber,
        admissionNumber,
        checkTime: `${admissionCheckTime}ms`,
        foundInStudents: existingStudents.length,
        studentsTableResult: existingStudents.length > 0 ? existingStudents[0] : null
      });

      if (existingStudents.length > 0) {
        duplicateChecks.push({
          field: 'admission_number',
          value: admissionNumber,
          foundIn: 'students_table',
          existingRecord: existingStudents[0]
        });

        logBulkUploadEvent('warn', 'DUPLICATE_FOUND_STUDENTS', {
          rowNumber,
          admissionNumber,
          existingRecord: existingStudents[0]
        });
      }

      // Also check in form_submissions table
      const submissionCheckStart = Date.now();
      const [existingSubmissions] = await masterConn.query(
        'SELECT submission_id, admission_number, status FROM form_submissions WHERE admission_number = ?',
        [admissionNumber]
      );

      const submissionCheckTime = Date.now() - submissionCheckStart;
      logBulkUploadEvent('info', 'SUBMISSION_CHECK_COMPLETED', {
        rowNumber,
        admissionNumber,
        checkTime: `${submissionCheckTime}ms`,
        foundInSubmissions: existingSubmissions ? existingSubmissions.length : 0,
        submissionsTableResult: existingSubmissions && existingSubmissions.length > 0 ? existingSubmissions[0] : null
      });

      if (existingSubmissions && existingSubmissions.length > 0) {
        duplicateChecks.push({
          field: 'admission_number',
          value: admissionNumber,
          foundIn: 'form_submissions_table',
          existingRecord: existingSubmissions[0]
        });

        logBulkUploadEvent('warn', 'DUPLICATE_FOUND_SUBMISSIONS', {
          rowNumber,
          admissionNumber,
          existingRecord: existingSubmissions[0]
        });
      }
    }

    // Check by AADHAR number if provided
    if (submissionData.adhar_no && submissionData.adhar_no !== '') {
      // Convert to string and trim safely
      const adharNo = String(submissionData.adhar_no).trim();
      const adharCheckStart = Date.now();

      // Check in students table for existing AADHAR
      const [existingByAdhar] = await masterConn.query(
        'SELECT admission_number, admission_no FROM students WHERE adhar_no = ?',
        [adharNo]
      );

      const adharCheckTime = Date.now() - adharCheckStart;
      logBulkUploadEvent('info', 'ADHAR_CHECK_COMPLETED', {
        rowNumber,
        adharNo,
        checkTime: `${adharCheckTime}ms`,
        foundInStudents: existingByAdhar.length,
        studentsTableResult: existingByAdhar.length > 0 ? existingByAdhar[0] : null
      });

      if (existingByAdhar.length > 0) {
        duplicateChecks.push({
          field: 'adhar_no',
          value: adharNo,
          foundIn: 'students_table',
          existingRecord: existingByAdhar[0]
        });

        logBulkUploadEvent('warn', 'DUPLICATE_FOUND_ADHAR', {
          rowNumber,
          adharNo,
          existingRecord: existingByAdhar[0]
        });
      }
    }

    // Check by Student Mobile Number if provided
    if (submissionData.student_mobile && String(submissionData.student_mobile).trim() !== '') {
      const studentMobile = String(submissionData.student_mobile).trim();
      const mobileCheckStart = Date.now();

      // Check in students table for existing mobile
      const [existingByMobile] = await masterConn.query(
        'SELECT admission_number, admission_no FROM students WHERE student_mobile = ?',
        [studentMobile]
      );

      const mobileCheckTime = Date.now() - mobileCheckStart;
      logBulkUploadEvent('info', 'MOBILE_CHECK_COMPLETED', {
        rowNumber,
        studentMobile,
        checkTime: `${mobileCheckTime}ms`,
        foundInStudents: existingByMobile.length,
        studentsTableResult: existingByMobile.length > 0 ? existingByMobile[0] : null
      });

      if (existingByMobile.length > 0) {
        duplicateChecks.push({
          field: 'student_mobile',
          value: studentMobile,
          foundIn: 'students_table',
          existingRecord: existingByMobile[0]
        });

        logBulkUploadEvent('warn', 'DUPLICATE_FOUND_MOBILE', {
          rowNumber,
          studentMobile,
          existingRecord: existingByMobile[0]
        });
      }
    }

    const duplicateCheckTime = Date.now() - duplicateCheckStartTime;
    logBulkUploadEvent('info', 'DUPLICATE_CHECK_COMPLETED', {
      rowNumber,
      totalDuplicateChecks: duplicateChecks.length,
      duplicateCheckTime: `${duplicateCheckTime}ms`,
      checkedFields: ['admission_number', 'adhar_no', 'student_mobile']
    });

    if (duplicateChecks.length > 0) {
      const duplicateDetails = duplicateChecks.map(check => ({
        field: check.field,
        value: check.value,
        foundIn: check.foundIn,
        existingAdmissionNumber: check.existingRecord.admission_number || check.existingRecord.admission_no
      }));

      logBulkUploadEvent('error', 'VALIDATION_FAILED_DUPLICATES', {
        rowNumber,
        duplicateCount: duplicateChecks.length,
        duplicates: duplicateDetails,
        validationTime: `${Date.now() - validationStartTime}ms`
      });

      return {
        isValid: false,
        type: 'duplicate',
        error: `Duplicate entry found for: ${duplicateChecks.map(d => d.field).join(', ')}`,
        details: { duplicates: duplicateDetails },
        validationTime: `${Date.now() - validationStartTime}ms`
      };
    }

    // Data is valid - no critical missing fields and no duplicates
    const totalValidationTime = Date.now() - validationStartTime;
    logBulkUploadEvent('info', 'VALIDATION_PASSED', {
      rowNumber,
      totalValidationTime: `${totalValidationTime}ms`,
      validationBreakdown: {
        criticalFieldsCheck: 'passed',
        duplicateChecks: 'passed',
        totalChecks: 1 + duplicateChecks.length
      }
    });

    console.log(`✅ Row ${rowNumber} validation passed in ${totalValidationTime}ms`);
    return {
      isValid: true,
      type: 'valid',
      error: null,
      details: null,
      validationTime: `${totalValidationTime}ms`
    };

  } catch (error) {
    const totalValidationTime = Date.now() - validationStartTime;

    logBulkUploadError(rowNumber, 'VALIDATION_EXCEPTION', error.message, {
      errorStack: error.stack,
      validationTime: `${totalValidationTime}ms`,
      submissionData: submissionData
    });

    console.error(`❌ Error validating row ${rowNumber} after ${totalValidationTime}ms:`, error);
    return {
      isValid: false,
      type: 'validation_error',
      error: `Validation error: ${error.message}`,
      details: { error: error.message, stack: error.stack },
      validationTime: `${totalValidationTime}ms`
    };
  }
};

// Submit form (public endpoint)
exports.submitForm = async (req, res) => {
  try {
    console.log('Submit form request received');
    console.log('Params:', req.params);
    console.log('Body:', req.body);

    // Handle both URL parameter and body parameter for formId
    const formId = req.params.formId || req.body.formId;
    const formData = req.body.formData || req.body;

    // Handle uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        let base64;
        if (file.buffer) {
          base64 = file.buffer.toString('base64');
        } else if (file.path) {
          base64 = fs.readFileSync(file.path, 'base64');
          fs.unlinkSync(file.path); // Clean up temp file
        }
        if (base64) {
          formData[file.fieldname] = `data:${file.mimetype};base64,${base64}`;
        }
      });
    }

    console.log('Resolved formId:', formId);

    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Form data is required'
      });
    }

    // Verify form exists and is active
    const [forms] = await masterPool.query(
      'SELECT * FROM forms WHERE form_id = ? AND is_active = 1 LIMIT 1',
      [formId]
    );

    if (!forms || forms.length === 0) {
      console.log('Form not found or inactive for formId:', formId);
      return res.status(404).json({
        success: false,
        message: 'Form not found or inactive'
      });
    }

    console.log('Form found and active:', forms[0].form_name);

    const submissionId = uuidv4();

    // Auto-assign is always enabled - generate admission number based on academic year
    // Format: YEAR + 4-digit sequential number (e.g., 20250001, 20260001)
    let generatedAdmissionNumber = null;
    try {
      // Auto-assign is always enabled, so always generate admission number
      // Get academic year from form data (batch field)
      let academicYear = formData.batch || formData.academic_year;

      // Extract year if batch contains range like "2024-2028" or "2024-25"
      if (academicYear && typeof academicYear === 'string') {
        const yearMatch = academicYear.match(/^(\d{4})/);
        if (yearMatch) {
          academicYear = yearMatch[1];
        }
      }

      // Default to current year if no batch/academic year specified
      if (!academicYear) {
        academicYear = new Date().getFullYear().toString();
      }

      const yearPrefix = academicYear.toString();

      // Query MySQL to find max admission number for this year
      const masterConn2 = await masterPool.getConnection();
      const [existingRows] = await masterConn2.query(
        `SELECT admission_number FROM students 
           WHERE admission_number REGEXP ? 
           ORDER BY admission_number DESC`,
        [`^${yearPrefix}[0-9]{4}$`]
      );
      masterConn2.release();

      // Find the maximum sequence number for this year
      let maxSeq = 0;
      existingRows.forEach(row => {
        const admNum = row.admission_number;
        if (admNum && admNum.startsWith(yearPrefix)) {
          const seqPart = admNum.substring(yearPrefix.length);
          const seqNum = parseInt(seqPart, 10);
          if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
          }
        }
      });

      // Also check form_submissions for any pending numbers
      const [submissions] = await masterPool.query(
        'SELECT admission_number FROM form_submissions WHERE admission_number LIKE ?',
        [`${yearPrefix}%`]
      );

      if (submissions) {
        submissions.forEach(sub => {
          const admNum = sub.admission_number;
          if (admNum && admNum.startsWith(yearPrefix) && /^\d+$/.test(admNum.substring(yearPrefix.length))) {
            const seqNum = parseInt(admNum.substring(yearPrefix.length), 10);
            if (!isNaN(seqNum) && seqNum > maxSeq) {
              maxSeq = seqNum;
            }
          }
        });
      }

      const nextSeq = maxSeq + 1;
      generatedAdmissionNumber = `${yearPrefix}${nextSeq.toString().padStart(4, '0')}`;
      console.log(`Generated admission number: ${generatedAdmissionNumber} for academic year ${academicYear}`);
    } catch (error) {
      console.error('Error generating admission number:', error);
      // Continue without assigning
    }

    // Insert submission
    await masterPool.query(
      `INSERT INTO form_submissions (submission_id, form_id, admission_number, submission_data, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [submissionId, formId, generatedAdmissionNumber, JSON.stringify(formData), 'pending', 'student']
    );

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully. Awaiting admin approval.',
      data: {
        submissionId
      }
    });

  } catch (error) {
    console.error('Submit form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while submitting form'
    });
  }
};

// Get all submissions (admin)
exports.getAllSubmissions = async (req, res) => {
  try {
    const { status, formId } = req.query;

    // Build MySQL query
    let query = 'SELECT * FROM form_submissions WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (formId) {
      query += ' AND form_id = ?';
      params.push(formId);
    }

    query += ' ORDER BY created_at DESC';

    const [submissions] = await masterPool.query(query, params);

    // Enrich with form/admin names via separate queries
    const formIds = Array.from(new Set((submissions || []).map(s => s.form_id))).filter(Boolean);
    const reviewedIds = Array.from(new Set((submissions || []).map(s => s.reviewed_by).filter(Boolean)));
    const submittedByAdminIds = Array.from(new Set((submissions || []).map(s => s.submitted_by_admin).filter(Boolean)));

    let idToFormName = new Map();
    if (formIds.length > 0) {
      const placeholders = formIds.map(() => '?').join(',');
      const [formsRows] = await masterPool.query(
        `SELECT form_id, form_name FROM forms WHERE form_id IN (${placeholders})`,
        formIds
      );
      if (formsRows) idToFormName = new Map(formsRows.map(f => [f.form_id, f.form_name]));
    }

    let idToAdmin = new Map();
    if (reviewedIds.length > 0) {
      const placeholders = reviewedIds.map(() => '?').join(',');
      const [adminsRows] = await masterPool.query(
        `SELECT id, username FROM admins WHERE id IN (${placeholders})`,
        reviewedIds
      );
      if (adminsRows) idToAdmin = new Map(adminsRows.map(a => [a.id, a.username]));
    }

    let idToSubmittedAdmin = new Map();
    if (submittedByAdminIds.length > 0) {
      const placeholders = submittedByAdminIds.map(() => '?').join(',');
      const [adminsRows2] = await masterPool.query(
        `SELECT id, username FROM admins WHERE id IN (${placeholders})`,
        submittedByAdminIds
      );
      if (adminsRows2) idToSubmittedAdmin = new Map(adminsRows2.map(a => [a.id, a.username]));
    }

    const enriched = (submissions || []).map(sub => ({
      ...sub,
      submission_data: parseJSON(sub.submission_data),
      form_name: idToFormName.get(sub.form_id) || null,
      reviewed_by_name: sub.reviewed_by ? (idToAdmin.get(sub.reviewed_by) || null) : null,
      submitted_by_admin_name: sub.submitted_by_admin ? (idToSubmittedAdmin.get(sub.submitted_by_admin) || null) : null,
      submitted_at: sub.created_at
    }));

    res.json({ success: true, data: enriched });

  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions'
    });
  }
};

// Get single submission
exports.getSubmissionById = async (req, res) => {
  try {
    const { submissionId } = req.params;

    console.log('Fetching submission:', submissionId);

    const [submissions] = await masterPool.query(
      'SELECT * FROM form_submissions WHERE submission_id = ? LIMIT 1',
      [submissionId]
    );

    if (submissions.length === 0) {
      console.log('Submission not found:', submissionId);
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    console.log('Found submission:', submissions[0].submission_id);

    const base = submissions[0];
    let formName = null;
    let formFields = null;
    const [formRows] = await masterPool.query(
      'SELECT form_name, form_fields FROM forms WHERE form_id = ? LIMIT 1',
      [base.form_id]
    );
    if (formRows && formRows.length > 0) {
      formName = formRows[0].form_name || null;
      formFields = parseJSON(formRows[0].form_fields);
    }

    const submission = {
      ...base,
      form_name: formName,
      submission_data: parseJSON(base.submission_data),
      form_fields: formFields,
      submitted_at: base.created_at
    };

    res.json({ success: true, data: submission });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submission'
    });
  }
};

// Approve submission
exports.approveSubmission = async (req, res) => {
  let masterConn = null;

  try {
    // Check for approve permission
    const user = req.user || req.admin;
    if (user && user.role !== 'super_admin' && user.role !== 'admin') {
      const { hasPermission, MODULES } = require('../constants/rbac');
      if (!hasPermission(user.permissions, MODULES.PRE_REGISTRATION, 'approve')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to approve submissions'
        });
      }
    }

    masterConn = await masterPool.getConnection();
    await masterConn.beginTransaction();

    const { submissionId } = req.params;
    const { admissionNumber } = req.body; // Get admission number from request body

    console.log('Approve submission request:', { submissionId, admissionNumber });
    console.log('Request body:', req.body);

    // Validate admission number
    if (!admissionNumber || typeof admissionNumber !== 'string' || !admissionNumber.trim()) {
      await masterConn.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid admission number is required'
      });
    }

    // Get submission
    const [submissions] = await masterConn.query(
      'SELECT * FROM form_submissions WHERE submission_id = ? AND status = ? LIMIT 1',
      [submissionId, 'pending']
    );

    if (submissions.length === 0) {
      await masterConn.rollback();
      return res.status(404).json({
        success: false,
        message: 'Pending submission not found'
      });
    }

    const submission = submissions[0];
    const submissionData = parseJSON(submission.submission_data);

    // Use the admission number from the request body (admin input)
    const finalAdmissionNumber = admissionNumber.trim();

    console.log('Final admission number:', finalAdmissionNumber);

    // Load form to determine dynamic table/columns in master DB
    const [forms] = await masterConn.query('SELECT * FROM forms WHERE form_id = ?', [submission.form_id]);
    const formFields = forms.length > 0 ? parseJSON(forms[0].form_fields) : [];

    // Determine destination table in master DB: single table per form, named by form_id
    const destinationTable = `form_${submission.form_id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    // Build DDL to ensure destination table exists with columns from formFields
    // Start with base columns
    await masterConn.query(
      `CREATE TABLE IF NOT EXISTS ${destinationTable} (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admission_number VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    );

    // Ensure columns for each field key exist (use VARCHAR(255) default; widen if needed later)
    for (const field of formFields) {
      const col = field.key?.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!col) continue;

      // Check if column exists (MySQL doesn't support IF NOT EXISTS in ALTER TABLE)
      const [columns] = await masterConn.query(
        `SELECT COUNT(*) as count 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?`,
        [destinationTable, col]
      );

      if (columns[0].count === 0) {
        await masterConn.query(
          `ALTER TABLE ${destinationTable} ADD COLUMN ${col} VARCHAR(1024) NULL`
        );
      }
    }

    // Prepare insert columns/values for dynamic table
    const insertCols = ['admission_number'];
    const insertVals = [finalAdmissionNumber];
    const placeholders = ['?'];

    for (const field of formFields) {
      const key = field.key;
      const col = key?.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!col) continue;
      insertCols.push(col);
      insertVals.push(submissionData[key] ?? null);
      placeholders.push('?');
    }

    await masterConn.query(
      `INSERT INTO ${destinationTable} (${insertCols.join(',')}) VALUES (${placeholders.join(',')})`,
      insertVals
    );

    // Check if student exists (check both admission_number and admission_no columns)
    const [students] = await masterConn.query(
      'SELECT * FROM students WHERE admission_number = ? OR admission_no = ?',
      [finalAdmissionNumber, finalAdmissionNumber]
    );

    if (students.length > 0) {
      // Update existing student - use both individual columns and JSON data
      const existingStudent = students[0];
      const existingData = parseJSON(existingStudent.student_data) || {};

      // Create merged data with database column mapping
      const mergedData = { ...existingData };

      // Map submission data to database columns based on form field keys
      Object.entries(submissionData).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          mergedData[key] = value;
        }
      });

      // Add form_id to mergedData for completion percentage calculation
      mergedData.form_id = submission.form_id;
      console.log(`📋 Added form_id to mergedData: ${submission.form_id}`);

      // Update both individual columns and JSON data with proper field mapping
      const updateFields = [];
      const updateValues = [];
      const addedUpdateFields = new Set();

      // Update individual columns for predefined fields with proper ordering (avoid duplicates)
      Object.entries(submissionData).forEach(([key, value]) => {
        const columnName = getColumnNameForField(key);
        if (columnName && value !== undefined && value !== '' && !addedUpdateFields.has(columnName)) {
          updateFields.push(`${columnName} = ?`);
          updateValues.push(value);
          addedUpdateFields.add(columnName);
        }
      });

      // Handle JSON data update with helper function (avoid duplicates)
      if (!addedUpdateFields.has('student_data')) {
        const jsonMergedData = safeJSONStringify(mergedData);
        updateFields.push('student_data = ?');
        updateValues.push(jsonMergedData);
      }

      updateValues.push(finalAdmissionNumber); // WHERE clause value

      // Check for duplicates in update fields
      const uniqueUpdateFields = [...new Set(updateFields.map(f => f.split(' = ')[0]))];
      if (uniqueUpdateFields.length !== updateFields.length) {
        console.error('❌ DUPLICATE UPDATE FIELDS DETECTED!');
        console.error('Original fields:', updateFields);
        console.error('Unique fields:', uniqueUpdateFields);
        throw new Error('Duplicate fields detected in update query');
      }

      console.log('🔍 Debug - Update Field-Value Mapping:');
      updateFields.forEach((field, index) => {
        console.log(`  ${index}: ${field} = "${updateValues[index]}"`);
      });
      console.log(`  WHERE: admission_number = ? OR admission_no = ? (value: "${finalAdmissionNumber}")`);

      await masterConn.query(
        `UPDATE students SET ${updateFields.join(', ')} WHERE admission_number = ? OR admission_no = ?`,
        [...updateValues, finalAdmissionNumber, finalAdmissionNumber]
      );
    } else {
      // Create new student with proper database column mapping
      const studentData = {};
      const fieldValuePairs = [];

      // Use a Set to track added fields and prevent duplicates
      const addedFields = new Set();

      // Add base fields (admission_number and admission_no) - prevent duplicates
      fieldValuePairs.push({ field: 'admission_number', value: finalAdmissionNumber });
      addedFields.add('admission_number');

      fieldValuePairs.push({ field: 'admission_no', value: finalAdmissionNumber });
      addedFields.add('admission_no');

      // Add admission_no field if provided in submission data (avoid duplicates)
      if (submissionData.admission_no && !addedFields.has('admission_no')) {
        fieldValuePairs.push({ field: 'admission_no', value: submissionData.admission_no });
        addedFields.add('admission_no');
      }

      // Map submission data to database columns based on form field keys
      Object.entries(submissionData).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          // Sanitize the value to ensure it's JSON serializable
          let sanitizedValue = value;
          if (typeof value === 'string') {
            sanitizedValue = value.trim();
          }

          studentData[key] = sanitizedValue;

          // Add to individual columns if it's a predefined field (avoid duplicates)
          const columnName = getColumnNameForField(key);
          if (columnName && !addedFields.has(columnName)) {
            fieldValuePairs.push({ field: columnName, value: sanitizedValue });
            addedFields.add(columnName);
          }
        }
      });

      // Add form_id to studentData for completion percentage calculation
      studentData.form_id = submission.form_id;
      console.log(`📋 Added form_id to studentData: ${submission.form_id}`);

      // Handle JSON data with helper function (avoid duplicates)
      if (!addedFields.has('student_data')) {
        const jsonStudentData = safeJSONStringify(studentData);
        fieldValuePairs.push({ field: 'student_data', value: jsonStudentData });
        addedFields.add('student_data');
      }

      // Extract ordered fields and values
      const insertFields = fieldValuePairs.map(pair => pair.field);
      const insertValues = fieldValuePairs.map(pair => pair.value);

      // Check for duplicates in the final fields array
      const uniqueFields = [...new Set(insertFields)];
      if (uniqueFields.length !== insertFields.length) {
        console.error('❌ DUPLICATE FIELDS DETECTED!');
        console.error('Original fields:', insertFields);
        console.error('Unique fields:', uniqueFields);
        throw new Error('Duplicate fields detected in insert query');
      }

      console.log('🔍 Debug - Field-Value Mapping:');
      fieldValuePairs.forEach((pair, index) => {
        console.log(`  ${index}: ${pair.field} = "${pair.value}"`);
      });

      console.log('Final insert query prepared:', {
        fieldsCount: insertFields.length,
        valuesCount: insertValues.length,
        orderedFields: insertFields,
        uniqueFields: uniqueFields.length === insertFields.length ? '✅ No duplicates' : '❌ Has duplicates',
        jsonSize: fieldValuePairs.find(p => p.field === 'student_data')?.value?.length || 0
      });

      // Execute insert with error handling
      try {
        const placeholders = insertFields.map(() => '?').join(', ');
        const query = `INSERT INTO students (${insertFields.join(', ')}) VALUES (${placeholders})`;
        console.log('Executing insert query, JSON size:', fieldValuePairs.find(p => p.field === 'student_data')?.value?.length || 0);
        console.log('SQL Query:', query);
        console.log('Values:', insertValues.length, 'items');

        await masterConn.query(query, insertValues);
        console.log('✅ Student data inserted successfully');

        // Generate student login credentials automatically
        try {
          const { generateCredentialsByAdmissionNumber } = require('../utils/studentCredentials');
          const credResult = await generateCredentialsByAdmissionNumber(finalAdmissionNumber);
          if (credResult.success) {
            console.log(`✅ Generated login credentials for student ${finalAdmissionNumber} (username: ${credResult.username})`);
          } else {
            console.warn(`⚠️  Could not generate credentials for student ${finalAdmissionNumber}: ${credResult.error}`);
          }
        } catch (credError) {
          console.error('Error generating student credentials (non-fatal):', credError);
          // Don't fail approval if credential generation fails
        }
      } catch (insertError) {
        console.error('❌ Insert error:', insertError.message);
        console.error('❌ SQL query was:', `INSERT INTO students (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')})`);
        console.error('❌ Values count:', insertValues.length);
        console.error('❌ Field-value mapping:', fieldValuePairs);
        console.error('❌ Added fields Set:', Array.from(addedFields));
        throw insertError;
      }
    }

    // Upload documents to S3 if enabled and documents exist
    const uploadedDocuments = {};
    // S3 upload functionality has been removed as per configuration

    // Update submission status
    await masterConn.query(
      `UPDATE form_submissions 
       SET status = ?, reviewed_at = ?, reviewed_by = ?, admission_number = ?
       WHERE submission_id = ?`,
      ['approved', new Date(), req.admin.id, finalAdmissionNumber, submissionId]
    );

    // Store uploaded document links in student record if any documents were uploaded
    if (Object.keys(uploadedDocuments).length > 0) {
      try {
        const [existingStudents] = await masterConn.query(
          'SELECT student_data FROM students WHERE admission_number = ? OR admission_no = ?',
          [finalAdmissionNumber, finalAdmissionNumber]
        );

        if (existingStudents.length > 0) {
          const existingData = parseJSON(existingStudents[0].student_data) || {};
          existingData.uploaded_documents = uploadedDocuments;

          await masterConn.query(
            'UPDATE students SET student_data = ? WHERE admission_number = ? OR admission_no = ?',
            [safeJSONStringify(existingData), finalAdmissionNumber, finalAdmissionNumber]
          );
        }
      } catch (docUpdateError) {
        console.error('Error updating student with document links:', docUpdateError);
        // Non-fatal error
      }
    }

    await writeAuditLog(masterConn, {
      actionType: 'APPROVE',
      entityType: 'SUBMISSION',
      entityId: submissionId,
      req,
      details: {
        admissionNumber: finalAdmissionNumber,
        documentsUploaded: Object.keys(uploadedDocuments).length
      }
    });

    await masterConn.commit();

    res.json({
      success: true,
      message: 'Submission approved and data saved to database'
    });

  } catch (error) {
    await masterConn.rollback();
    console.error('Approve submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving submission'
    });
  } finally {
    masterConn.release();
  }
};

// Reject submission
exports.rejectSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { reason } = req.body;

    // Check for reject permission
    const user = req.user || req.admin;
    if (user && user.role !== 'super_admin' && user.role !== 'admin') {
      const { hasPermission, MODULES } = require('../constants/rbac');
      if (!hasPermission(user.permissions, MODULES.PRE_REGISTRATION, 'reject')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to reject submissions'
        });
      }
    }

    const [result] = await masterPool.query(
      `UPDATE form_submissions 
       SET status = ?, reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
       WHERE submission_id = ? AND status = ?`,
      ['rejected', new Date(), req.admin.id, reason || 'No reason provided', submissionId, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pending submission not found'
      });
    }

    // Log action
    await writeAuditLog(masterPool, {
      actionType: 'REJECT',
      entityType: 'SUBMISSION',
      entityId: submissionId,
      req,
      details: { reason }
    });

    res.json({
      success: true,
      message: 'Submission rejected'
    });

  } catch (error) {
    console.error('Reject submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting submission'
    });
  }
};

// Delete submission
exports.deleteSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Check for delete permission
    const user = req.user || req.admin;
    if (user && user.role !== 'super_admin' && user.role !== 'admin') {
      const { hasPermission, MODULES } = require('../constants/rbac');
      if (!hasPermission(user.permissions, MODULES.PRE_REGISTRATION, 'delete')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete submissions'
        });
      }
    }

    console.log('Attempting to delete submission:', submissionId);

    // First, check if the submission exists
    const [existingSubmission] = await masterPool.query(
      'SELECT submission_id, status FROM form_submissions WHERE submission_id = ? LIMIT 1',
      [submissionId]
    );

    if (!existingSubmission || existingSubmission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    console.log('Found submission to delete:', existingSubmission[0]);

    // Perform delete - allow deletion of any status (pending, approved, rejected)
    const [deleteResult] = await masterPool.query(
      'DELETE FROM form_submissions WHERE submission_id = ?',
      [submissionId]
    );

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found or could not be deleted'
      });
    }

    console.log('Successfully deleted submission:', submissionId);

    // Log action
    try {
      await writeAuditLog(masterPool, {
        actionType: 'DELETE',
        entityType: 'SUBMISSION',
        entityId: submissionId,
        req,
        actor: user || req.admin,
        details: { status: existingSubmission[0].status }
      });
    } catch (logError) {
      console.error('Error logging delete action:', logError);
      // Don't fail the request if logging fails
    }

    res.json({
      success: true,
      message: 'Submission deleted successfully'
    });

  } catch (error) {
    console.error('Delete submission error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sql: error.sql
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while deleting submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Enhanced bulk upload submissions (admin only) with comprehensive logging
exports.bulkUploadSubmissions = async (req, res) => {
  let masterConn = null;
  const uploadStartTime = Date.now();

  try {
    // Initial request logging
    logBulkUploadEvent('info', 'BULK_UPLOAD_STARTED', {
      adminId: req.admin?.id,
      fileInfo: req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        sizeMB: (req.file.size / (1024 * 1024)).toFixed(2)
      } : null,
      requestBody: req.body,
      timestamp: new Date().toISOString()
    });

    if (!req.file) {
      logBulkUploadError(null, 'MISSING_FILE', 'No file received from client');
      return res.status(400).json({
        success: false,
        message: 'CSV or Excel file is required - file was not received by server'
      });
    }

    const formId = req.body.formId;
    logBulkUploadEvent('info', 'FORM_VALIDATION', {
      formId,
      hasFormId: !!formId
    });

    if (!formId) {
      logBulkUploadError(null, 'MISSING_FORM_ID', 'Form ID not provided in request');
      return res.status(400).json({
        success: false,
        message: 'Form ID is required'
      });
    }

    const formFetchStart = Date.now();
    let templateResources;
    try {
      templateResources = await buildTemplateResources(formId);
    } catch (error) {
      if (error.status === 404) {
        logBulkUploadError(null, 'FORM_NOT_FOUND', `Form with ID ${formId} not found`);
        return res.status(404).json({
          success: false,
          message: 'Form not found'
        });
      }
      throw error;
    }
    const formFetchTime = Date.now() - formFetchStart;
    logPerformanceMetrics('FORM_FETCH', formFetchStart, Date.now(), {
      formFetchTime: `${formFetchTime}ms`,
      formsFound: 1
    });

    const {
      form,
      fieldMapping,
      normalizedFieldMapping,
      fieldSummaries,
      courseIndex
    } = templateResources;

    logBulkUploadEvent('info', 'FORM_LOADED', {
      formId: form.form_id,
      formName: form.form_name,
      formFieldsCount: fieldSummaries.length,
      isActive: form.is_active,
      fieldMapping: fieldMapping
    });

    // Parse file (CSV or Excel) with comprehensive logging
    const results = [];
    const errors = [];
    let rowNumber = 0;
    const parsingStartTime = Date.now();

    logBulkUploadEvent('info', 'FILE_PARSING_STARTED', {
      filePath: req.file.path,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    // Determine file type and parse accordingly
    const isExcel = req.file.mimetype.includes('excel') || req.file.mimetype.includes('spreadsheet') ||
      req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls');

    logBulkUploadEvent('info', 'FILE_TYPE_DETERMINED', {
      isExcel,
      detectionMethod: isExcel ? 'MIME type or extension check' : 'Default to CSV',
      mimeType: req.file.mimetype,
      fileExtension: req.file.originalname.split('.').pop()
    });

    if (isExcel) {
      // Parse Excel file with detailed logging
      logBulkUploadEvent('info', 'EXCEL_PARSING_INITIATED', {
        library: 'xlsx',
        filePath: req.file.path
      });

      try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0]; // Use first sheet
        const worksheet = workbook.Sheets[sheetName];

        logBulkUploadEvent('info', 'EXCEL_WORKBOOK_LOADED', {
          sheetNames: workbook.SheetNames,
          selectedSheet: sheetName,
          totalSheets: workbook.SheetNames.length
        });

        // Convert to JSON with header row
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        logBulkUploadEvent('info', 'EXCEL_DATA_CONVERTED', {
          totalRows: jsonData.length,
          headerRow: jsonData[0],
          dataRows: jsonData.length - 1
        });

        // Process rows (skip header row)
        for (let i = 1; i < jsonData.length; i++) {
          rowNumber++;
          const row = jsonData[i];

          if (row && row.length > 0) {
            // Convert array to object using headers
            const headers = jsonData[0];
            const data = {};
            headers.forEach((header, index) => {
              if (header && row[index] !== undefined) {
                data[header] = row[index];
              }
            });

            // Log detailed row data extraction
            const rowLogData = logRowData(rowNumber, data, fieldMapping);
            results.push({ row: rowNumber, data, logData: rowLogData });
          } else {
            logBulkUploadError(rowNumber, 'EMPTY_ROW', 'Row is empty or contains no data', { rowData: row });
          }
        }

        const parsingTime = Date.now() - parsingStartTime;
        logPerformanceMetrics('EXCEL_PARSING', parsingStartTime, Date.now(), {
          rowsParsed: results.length,
          parsingTime: `${parsingTime}ms`,
          averageTimePerRow: results.length > 0 ? `${(parsingTime / results.length).toFixed(2)}ms` : 'N/A'
        });

        logBulkUploadEvent('info', 'EXCEL_PARSING_COMPLETED', {
          totalRowsParsed: results.length,
          parsingTime: `${parsingTime}ms`
        });

      } catch (error) {
        logBulkUploadError(null, 'EXCEL_PARSING_FAILED', error.message, {
          filePath: req.file.path,
          errorStack: error.stack
        });
        throw error;
      }
    } else {
      // Parse CSV file with detailed logging
      logBulkUploadEvent('info', 'CSV_PARSING_INITIATED', {
        library: 'csv-parser',
        filePath: req.file.path
      });

      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', (data) => {
            rowNumber++;
            // Log detailed row data extraction for CSV
            const rowLogData = logRowData(rowNumber, data, fieldMapping);
            results.push({ row: rowNumber, data, logData: rowLogData });
          })
          .on('end', () => {
            const parsingTime = Date.now() - parsingStartTime;
            logPerformanceMetrics('CSV_PARSING', parsingStartTime, Date.now(), {
              rowsParsed: results.length,
              parsingTime: `${parsingTime}ms`,
              averageTimePerRow: results.length > 0 ? `${(parsingTime / results.length).toFixed(2)}ms` : 'N/A'
            });

            logBulkUploadEvent('info', 'CSV_PARSING_COMPLETED', {
              totalRowsParsed: results.length,
              parsingTime: `${parsingTime}ms`
            });
            resolve();
          })
          .on('error', (error) => {
            logBulkUploadError(null, 'CSV_PARSING_FAILED', error.message, {
              filePath: req.file.path,
              errorStack: error.stack
            });
            reject(error);
          });
      });
    }

    // Initialize counters for enhanced tracking with logging
    let successCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;
    let missingFieldCount = 0;
    const processedRows = [];
    const duplicateDetails = [];
    const rowProcessingStartTime = Date.now();

    logBulkUploadEvent('info', 'ROW_PROCESSING_STARTED', {
      totalRowsToProcess: results.length,
      fieldMapping: Object.keys(fieldMapping),
      expectedFields: Object.values(fieldMapping)
    });

    // Get database connection for duplicate checking
    masterConn = await masterPool.getConnection();
    logBulkUploadEvent('info', 'DATABASE_CONNECTION_ESTABLISHED', {
      connectionType: 'masterPool',
      databaseName: 'student_database'
    });

    for (const result of results) {
      const rowProcessingTime = Date.now();
      try {
        const { row, data } = result;

        logBulkUploadEvent('info', 'ROW_PROCESSING_INITIATED', {
          rowNumber: row,
          availableFields: Object.keys(data),
          fieldCount: Object.keys(data).length
        });

        // Build submission data from row, mapping field names to form field keys
        const submissionData = {};

        // Map data using normalized field mapping so header variations are supported
        Object.entries(data || {}).forEach(([header, rawValue]) => {
          if (rawValue === undefined || rawValue === null) {
            return;
          }
          const normalizedHeader = normalizeHeaderKey(header);
          if (!normalizedHeader) {
            return;
          }
          const fieldKey = normalizedFieldMapping[normalizedHeader];
          if (!fieldKey) {
            return;
          }

          let value = rawValue;

          // Special handling for batch field - preserve exact value, especially numeric values like "2025"
          if (fieldKey === 'batch') {
            if (typeof value === 'number') {
              value = value.toString();
            } else if (typeof value === 'string') {
              value = value.trim();
            } else {
              value = String(value).trim();
            }
          } else if (typeof value === 'string') {
            value = value.trim();
          } else if (value instanceof Date) {
            value = value.toISOString().split('T')[0];
          } else {
            value = String(value).trim();
          }

          if (value === '') {
            return;
          }

          submissionData[fieldKey] = value;
        });

        const sanitizePhone = (value) => {
          if (!value || typeof value !== 'string') {
            return value;
          }
          const digitsOnly = value.replace(/[^\d]/g, '');
          return digitsOnly.length > 0 ? digitsOnly : value.trim();
        };

        if (submissionData.student_mobile) {
          submissionData.student_mobile = sanitizePhone(submissionData.student_mobile);
        }
        if (submissionData.parent_mobile1) {
          submissionData.parent_mobile1 = sanitizePhone(submissionData.parent_mobile1);
        }
        if (submissionData.parent_mobile2) {
          submissionData.parent_mobile2 = sanitizePhone(submissionData.parent_mobile2);
        }
        if (submissionData.adhar_no && typeof submissionData.adhar_no === 'string') {
          submissionData.adhar_no = submissionData.adhar_no.replace(/\s+/g, '');
        }

        if (submissionData.gender && typeof submissionData.gender === 'string') {
          const normalizedGender = submissionData.gender.trim().toUpperCase();
          if (['MALE', 'M'].includes(normalizedGender)) {
            submissionData.gender = 'M';
          } else if (['FEMALE', 'F'].includes(normalizedGender)) {
            submissionData.gender = 'F';
          } else {
            submissionData.gender = normalizedGender;
          }
        }

        const courseResolution = resolveCourseAndBranch(courseIndex, {
          courseValue: submissionData.course,
          courseCodeValue: submissionData.course_code || submissionData.course,
          branchValue: submissionData.branch,
          branchCodeValue: submissionData.branch_code || submissionData.branch
        });

        if (courseResolution.errors && courseResolution.errors.length > 0) {
          const courseError = courseResolution.errors[0];
          logBulkUploadError(row, courseError.type, courseError.message, courseError.details || {});
          errors.push({
            row,
            message: courseError.message,
            type: courseError.type,
            details: courseError.details || {}
          });
          failedCount++;
          if (['invalid_course', 'invalid_branch', 'invalid_branch_course_combination', 'ambiguous_branch'].includes(courseError.type)) {
            missingFieldCount++;
          }
          processedRows.push({
            row,
            status: 'failed',
            reason: courseError.message,
            type: courseError.type,
            validationTime: '0ms'
          });
          continue;
        }

        if (courseResolution.course) {
          submissionData.course = courseResolution.course.name;
          if (courseResolution.course.code) {
            submissionData.course_code = courseResolution.course.code;
          }
        }

        if (courseResolution.branch) {
          submissionData.branch = courseResolution.branch.name;
          if (courseResolution.branch.code) {
            submissionData.branch_code = courseResolution.branch.code;
          }
        }

        if (!submissionData.course) {
          const message = 'Course is required for each row in the template.';
          logBulkUploadError(row, 'missing_course', message, {});
          errors.push({
            row,
            message,
            type: 'missing_course'
          });
          missingFieldCount++;
          failedCount++;
          processedRows.push({
            row,
            status: 'failed',
            reason: message,
            type: 'missing_course',
            validationTime: '0ms'
          });
          continue;
        }

        if (!submissionData.branch) {
          const message = 'Branch is required for each row in the template.';
          logBulkUploadError(row, 'missing_branch', message, {});
          errors.push({
            row,
            message,
            type: 'missing_branch'
          });
          missingFieldCount++;
          failedCount++;
          processedRows.push({
            row,
            status: 'failed',
            reason: message,
            type: 'missing_branch',
            validationTime: '0ms'
          });
          continue;
        }

        if (submissionData.current_year !== undefined && submissionData.current_year !== null) {
          const parsedYear = parseInt(submissionData.current_year, 10);
          if (!Number.isNaN(parsedYear)) {
            submissionData.current_year = parsedYear;
          }
        }

        if (submissionData.current_semester !== undefined && submissionData.current_semester !== null) {
          const parsedSemester = parseInt(submissionData.current_semester, 10);
          if (!Number.isNaN(parsedSemester)) {
            submissionData.current_semester = parsedSemester;
          }
        }

        // Log the final submission data for this row after normalization
        logBulkUploadEvent('info', 'SUBMISSION_DATA_MAPPED', {
          rowNumber: row,
          mappedFields: Object.keys(submissionData),
          fieldCount: Object.keys(submissionData).length,
          submissionData: submissionData
        });

        // Enhanced validation and duplicate checking with detailed logging
        const validationStartTime = Date.now();
        const validationResult = await validateAndCheckDuplicates(submissionData, masterConn, row);
        const validationTime = Date.now() - validationStartTime;

        logBulkUploadEvent('info', 'VALIDATION_COMPLETED', {
          rowNumber: row,
          validationTime: `${validationTime}ms`,
          isValid: validationResult.isValid,
          validationType: validationResult.type,
          errorMessage: validationResult.error
        });

        if (!validationResult.isValid) {
          const errorDetails = {
            row,
            message: validationResult.error,
            type: validationResult.type,
            details: validationResult.details,
            validationTime: `${validationTime}ms`
          };

          errors.push(errorDetails);

          if (validationResult.type === 'duplicate') {
            duplicateCount++;
            logBulkUploadEvent('warn', 'DUPLICATE_DETECTED', {
              rowNumber: row,
              duplicates: validationResult.details.duplicates,
              validationTime: `${validationTime}ms`
            });
          } else if (validationResult.type === 'missing_fields') {
            missingFieldCount++;
            logBulkUploadEvent('warn', 'MISSING_FIELDS_DETECTED', {
              rowNumber: row,
              missingFields: validationResult.details.missingFields,
              validationTime: `${validationTime}ms`
            });
          }

          failedCount++;
          processedRows.push({
            row,
            status: 'failed',
            reason: validationResult.error,
            type: validationResult.type,
            validationTime: `${validationTime}ms`
          });

          logBulkUploadError(row, validationResult.type, validationResult.error, {
            validationTime: `${validationTime}ms`,
            details: validationResult.details
          });
          continue;
        }

        const submissionId = uuidv4();

        // Insert submission with admin tracking
        const insertionStartTime = Date.now();
        await masterConn.query(
          `INSERT INTO form_submissions (submission_id, form_id, admission_number, submission_data, status, submitted_by, submitted_by_admin)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [submissionId, formId, submissionData.admission_number, JSON.stringify(submissionData), 'pending', 'admin', req.admin.id]
        );
        const insertionTime = Date.now() - insertionStartTime;

        logBulkUploadEvent('info', 'SUBMISSION_INSERTED', {
          rowNumber: row,
          submissionId,
          admissionNumber: submissionData.admission_number,
          insertionTime: `${insertionTime}ms`
        });

        successCount++;
        const totalRowTime = Date.now() - rowProcessingTime;
        processedRows.push({
          row,
          status: 'success',
          submissionId,
          admissionNumber: submissionData.admission_number,
          processingTime: `${totalRowTime}ms`
        });

        logBulkUploadEvent('info', 'ROW_PROCESSING_COMPLETED', {
          rowNumber: row,
          status: 'success',
          processingTime: `${totalRowTime}ms`,
          insertionTime: `${insertionTime}ms`
        });

      } catch (error) {
        const totalRowTime = Date.now() - rowProcessingTime;
        logBulkUploadError(result.row, 'PROCESSING_ERROR', error.message, {
          processingTime: `${totalRowTime}ms`,
          errorStack: error.stack,
          rowData: result.data
        });

        errors.push({
          row: result.row,
          message: error.message,
          type: 'processing_error',
          processingTime: `${totalRowTime}ms`
        });
        failedCount++;
        processedRows.push({
          row: result.row,
          status: 'failed',
          reason: error.message,
          type: 'processing_error',
          processingTime: `${totalRowTime}ms`
        });
      }
    }

    const totalProcessingTime = Date.now() - rowProcessingStartTime;

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    logBulkUploadEvent('info', 'FILE_CLEANUP_COMPLETED', {
      filePath: req.file.path,
      fileName: req.file.originalname
    });

    // Data integrity verification
    const integrityStartTime = Date.now();
    let dataIntegrityIssues = 0;

    // Verify submissions were actually inserted
    const [insertedSubmissions] = await masterConn.query(
      `SELECT submission_id, admission_number, status 
       FROM form_submissions 
       WHERE form_id = ? AND submitted_by_admin = ? AND status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [formId, req.admin.id, 'pending', successCount + 10]
    );

    if (!insertedSubmissions) {
      logBulkUploadError(null, 'INTEGRITY_VERIFICATION_FAILED', 'Failed to verify inserted submissions');
      dataIntegrityIssues++;
    } else {
      const actualInsertedCount = insertedSubmissions ? insertedSubmissions.length : 0;
      logBulkUploadEvent('info', 'INTEGRITY_VERIFICATION_COMPLETED', {
        expectedCount: successCount,
        actualCount: actualInsertedCount,
        difference: actualInsertedCount - successCount,
        integrityIssues: actualInsertedCount !== successCount ? 1 : 0
      });

      if (actualInsertedCount !== successCount) {
        dataIntegrityIssues++;
        logBulkUploadError(null, 'DATA_INTEGRITY_MISMATCH',
          `Expected ${successCount} submissions but found ${actualInsertedCount}`,
          { expectedCount: successCount, actualCount: actualInsertedCount });
      }
    }

    const integrityTime = Date.now() - integrityStartTime;

    // Enhanced logging with detailed statistics and performance metrics
    const totalUploadTime = Date.now() - uploadStartTime;

    const auditDetails = {
      successCount,
      failedCount,
      duplicateCount,
      missingFieldCount,
      totalRows: results.length,
      processedRows: processedRows.length,
      totalUploadTime: `${totalUploadTime}ms`,
      averageTimePerRow: results.length > 0 ? `${(totalUploadTime / results.length).toFixed(2)}ms` : 'N/A',
      parsingTime: 'calculated',
      validationTime: 'calculated',
      insertionTime: 'calculated',
      integrityVerificationTime: `${integrityTime}ms`,
      dataIntegrityIssues,
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      },
      formInfo: {
        formId,
        formName: form.form_name
      },
      errors: errors.slice(0, 20), // Limit for audit log
      processedRows: processedRows.slice(0, 20) // Limit for audit log
    };

    await writeAuditLog(masterPool, {
      actionType: 'ENHANCED_BULK_UPLOAD',
      entityType: 'SUBMISSION',
      entityId: formId,
      req,
      details: auditDetails
    });

    // Comprehensive final summary logging
    logPerformanceMetrics('TOTAL_BULK_UPLOAD', uploadStartTime, Date.now(), {
      totalRows: results.length,
      successCount,
      failedCount,
      duplicateCount,
      missingFieldCount,
      dataIntegrityIssues,
      averageTimePerRow: results.length > 0 ? `${(totalUploadTime / results.length).toFixed(2)}ms` : 'N/A'
    });

    logBulkUploadEvent('info', 'BULK_UPLOAD_COMPLETED', {
      summary: {
        totalRowsProcessed: results.length,
        successfulUploads: successCount,
        failedUploads: failedCount,
        duplicateEntries: duplicateCount,
        missingFields: missingFieldCount,
        dataIntegrityIssues,
        totalProcessingTime: `${totalUploadTime}ms`
      },
      performance: {
        averageTimePerRow: results.length > 0 ? `${(totalUploadTime / results.length).toFixed(2)}ms` : 'N/A',
        parsingTime: 'calculated',
        validationTime: 'calculated',
        insertionTime: 'calculated',
        integrityVerificationTime: `${integrityTime}ms`
      },
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      },
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Enhanced bulk upload completed: ${successCount} success, ${failedCount} failed, ${duplicateCount} duplicates, ${missingFieldCount} missing fields, ${dataIntegrityIssues} integrity issues`);

    res.json({
      success: true,
      message: `Enhanced bulk upload completed. ${successCount} submissions created, ${failedCount} failed.`,
      successCount,
      failedCount,
      duplicateCount,
      missingFieldCount,
      totalRows: results.length,
      dataIntegrityIssues,
      totalProcessingTime: `${totalUploadTime}ms`,
      errors: errors.slice(0, 50), // Increased error limit for better debugging
      processedRows: processedRows.slice(0, 100) // Include processing details
    });

  } catch (error) {
    const totalUploadTime = Date.now() - uploadStartTime;

    // Comprehensive error logging
    logBulkUploadError(null, 'BULK_UPLOAD_FAILED', error.message, {
      errorStack: error.stack,
      totalUploadTime: `${totalUploadTime}ms`,
      fileInfo: req.file ? {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      } : null,
      formId: req.body.formId,
      adminId: req.admin?.id
    });

    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      logBulkUploadEvent('info', 'ERROR_CLEANUP_COMPLETED', {
        filePath: req.file.path,
        cleanupReason: 'Error occurred during processing'
      });
    }

    // Log performance metrics even for failed uploads
    logPerformanceMetrics('FAILED_BULK_UPLOAD', uploadStartTime, Date.now(), {
      errorType: error.name,
      errorMessage: error.message,
      totalUploadTime: `${totalUploadTime}ms`
    });

    res.status(500).json({
      success: false,
      message: 'Server error during enhanced bulk upload',
      error: error.message,
      totalUploadTime: `${totalUploadTime}ms`,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (masterConn) {
      masterConn.release();
      logBulkUploadEvent('info', 'DATABASE_CONNECTION_RELEASED', {
        connectionType: 'masterPool',
        releaseReason: 'Upload process completed or failed'
      });
    }
  }
};

// Generate admission number series based on academic year
// Format: YEAR + 4-digit sequential number (e.g., 20250001, 20260001)
exports.generateAdmissionSeries = async (req, res) => {
  try {
    // Get academic year from request - can be a year (2025) or prefix input
    let academicYear = req.body.prefix || req.body.academicYear;
    const { autoAssign = false } = req.body;

    // Extract year if input contains range like "2024-2028" or other formats
    if (academicYear && typeof academicYear === 'string') {
      const yearMatch = academicYear.match(/(\d{4})/);
      if (yearMatch) {
        academicYear = yearMatch[1];
      }
    }

    // Default to current year if no academic year specified
    if (!academicYear) {
      academicYear = new Date().getFullYear().toString();
    }

    // Validate that we have a valid 4-digit year
    if (!/^\d{4}$/.test(academicYear)) {
      return res.status(400).json({
        success: false,
        message: 'Academic year must be a valid 4-digit year (e.g., 2025)'
      });
    }

    const yearPrefix = academicYear.toString();

    // Query MySQL to find max admission number for this year
    const masterConn = await masterPool.getConnection();
    const [existingRows] = await masterConn.query(
      `SELECT admission_number FROM students 
       WHERE admission_number REGEXP ? 
       ORDER BY admission_number DESC`,
      [`^${yearPrefix}[0-9]{4}$`]
    );
    masterConn.release();

    // Find the maximum sequence number for this year
    let maxSeq = 0;
    existingRows.forEach(row => {
      const admNum = row.admission_number;
      if (admNum && admNum.startsWith(yearPrefix)) {
        const seqPart = admNum.substring(yearPrefix.length);
        const seqNum = parseInt(seqPart, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });

    // Also check form_submissions for any pending numbers
    const [submissions] = await masterPool.query(
      'SELECT admission_number FROM form_submissions WHERE admission_number LIKE ?',
      [`${yearPrefix}%`]
    );

    if (submissions) {
      submissions.forEach(sub => {
        const admNum = sub.admission_number;
        if (admNum && admNum.startsWith(yearPrefix) && /^\d+$/.test(admNum.substring(yearPrefix.length))) {
          const seqNum = parseInt(admNum.substring(yearPrefix.length), 10);
          if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
          }
        }
      });
    }

    // Generate admission number
    const nextSeq = maxSeq + 1;
    const generatedAdmissionNumber = `${yearPrefix}${nextSeq.toString().padStart(4, '0')}`;
    const admissionNumbers = [generatedAdmissionNumber];

    console.log(`Generated admission number: ${generatedAdmissionNumber} for academic year ${academicYear}`);

    // If autoAssign is true, assign to pending submissions
    if (autoAssign) {
      try {
        // Get pending submissions that don't have admission numbers and match the academic year
        const [pendingSubmissions] = await masterPool.query(
          `SELECT submission_id, submission_data 
           FROM form_submissions 
           WHERE status = 'pending' AND (admission_number IS NULL OR admission_number = '')
           ORDER BY created_at ASC`
        );

        if (error) {
          console.error('Error fetching pending submissions:', error);
        } else if (pendingSubmissions && pendingSubmissions.length > 0) {
          // Filter submissions by academic year (batch) and assign numbers
          let assignedCount = 0;
          const masterConnAssign = await masterPool.getConnection();

          try {
            for (const submission of pendingSubmissions) {
              const subData = submission.submission_data || {};
              let subYear = subData.batch || subData.academic_year;

              // Extract year from batch
              if (subYear && typeof subYear === 'string') {
                const subYearMatch = subYear.match(/(\d{4})/);
                if (subYearMatch) {
                  subYear = subYearMatch[1];
                }
              }

              // Only assign if submission matches the academic year or has no year specified
              if (!subYear || subYear === academicYear) {
                // Get the next sequence number for this year
                const [latestRows] = await masterConnAssign.query(
                  `SELECT MAX(CAST(SUBSTRING(admission_number, 5) AS UNSIGNED)) as max_seq 
                   FROM students 
                   WHERE admission_number REGEXP ?`,
                  [`^${yearPrefix}[0-9]{4}$`]
                );

                let currentMaxSeq = latestRows[0]?.max_seq || 0;

                // Also check form_submissions
                const [latestSubs] = await masterConnAssign.query(
                  'SELECT admission_number FROM form_submissions WHERE admission_number LIKE ?',
                  [`${yearPrefix}%`]
                );

                if (latestSubs) {
                  latestSubs.forEach(sub => {
                    const admNum = sub.admission_number;
                    if (admNum && admNum.startsWith(yearPrefix)) {
                      const seqPart = admNum.substring(yearPrefix.length);
                      const seqNum = parseInt(seqPart, 10);
                      if (!isNaN(seqNum) && seqNum > currentMaxSeq) {
                        currentMaxSeq = seqNum;
                      }
                    }
                  });
                }

                const newAdmNum = `${yearPrefix}${(currentMaxSeq + 1).toString().padStart(4, '0')}`;

                await masterConnAssign.query(
                  'UPDATE form_submissions SET admission_number = ?, updated_at = ? WHERE submission_id = ?',
                  [newAdmNum, new Date(), submission.submission_id]
                );

                assignedCount++;
                console.log(`Assigned ${newAdmNum} to submission ${submission.submission_id}`);
              }
            }
          } finally {
            masterConnAssign.release();
          }

          console.log(`Auto-assigned ${assignedCount} admission numbers for academic year ${academicYear}`);
        } else {
          console.log('No pending submissions found for auto-assignment');
        }
      } catch (assignError) {
        console.error('Error auto-assigning admission numbers:', assignError);
      }
    }

    // Save the academic year as the current setting
    await masterPool.query(
      `INSERT INTO settings (\`key\`, value) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE value = ?`,
      ['admission_prefix', academicYear, academicYear]
    );

    res.json({
      success: true,
      data: {
        admissionNumbers,
        academicYear,
        prefix: academicYear,
        autoAssigned: autoAssign ? 1 : 0
      }
    });

  } catch (error) {
    console.error('Generate admission series error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating admission series'
    });
  }
};

// Get field completion status for a submission
exports.getFieldCompletionStatus = async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Get submission with form details
    const [submissions] = await masterPool.query(
      'SELECT * FROM form_submissions WHERE submission_id = ? LIMIT 1',
      [submissionId]
    );

    if (submissions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    const submission = submissions[0];
    const submissionData = parseJSON(submission.submission_data);

    // Get form fields
    const [forms] = await masterPool.query(
      'SELECT form_fields FROM forms WHERE form_id = ? LIMIT 1',
      [submission.form_id]
    );
    if (forms.length === 0) {
      // Return default completion status if form is not found
      return res.json({
        success: true,
        data: {
          totalFields: 0,
          completedFields: 0,
          pendingFields: 0,
          completionPercentage: 0,
          fieldStatus: [],
          formName: 'Unknown',
          missingFields: [],
          note: 'Form not found for this student'
        }
      });
    }

    const formFields = parseJSON(forms[0].form_fields);

    // Include both visible and hidden fields for completion calculation
    // Hidden fields should also count towards completion if they have values
    const allFields = formFields.filter(field => field.key); // Filter out any malformed fields

    // Calculate completion status considering all fields (visible + hidden)
    const totalFields = allFields.length;
    const completedFields = allFields.filter(field => {
      const value = submissionData[field.key];
      return value !== undefined && value !== null && value !== '';
    }).length;

    const fieldStatus = allFields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type || 'text',
      completed: submissionData[field.key] !== undefined && submissionData[field.key] !== null && submissionData[field.key] !== '',
      value: submissionData[field.key] || null,
      required: field.required || false,
      isHidden: field.isHidden || false
    }));

    res.json({
      success: true,
      data: {
        totalFields,
        completedFields,
        pendingFields: totalFields - completedFields,
        completionPercentage: totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0,
        fieldStatus
      }
    });

  } catch (error) {
    console.error('Get field completion status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching field completion status'
    });
  }
};

// Get student completion status based on form structure
exports.getStudentCompletionStatus = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    // Get student data
    const [students] = await masterPool.query(
      'SELECT * FROM students WHERE admission_number = ? OR admission_no = ?',
      [admissionNumber, admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = students[0];

    // We need to find which form this student came from
    // Check if student data contains form_id or look it up from submissions
    let formId = null;

    // First try to get form_id from the student_data JSON
    if (student.student_data) {
      try {
        const studentData = parseJSON(student.student_data);
        formId = studentData.form_id;
      } catch (error) {
        console.log('Could not parse student_data JSON for form_id');
      }
    }

    // If not found in JSON, look it up from submissions
    if (!formId) {
      const [submissions] = await masterPool.query(
        'SELECT form_id FROM form_submissions WHERE admission_number = ? LIMIT 1',
        [admissionNumber]
      );

      if (submissions && submissions.length > 0) {
        formId = submissions[0].form_id;
      }
    }

    if (!formId) {
      // Return default completion status if form_id is not available
      return res.json({
        success: true,
        data: {
          totalFields: 0,
          completedFields: 0,
          pendingFields: 0,
          completionPercentage: 0,
          fieldStatus: [],
          formName: 'Unknown',
          missingFields: [],
          note: 'Form structure not available for this student'
        }
      });
    }

    // Get form fields
    const [forms] = await masterPool.query(
      'SELECT form_fields, form_name FROM forms WHERE form_id = ? LIMIT 1',
      [formId]
    );
    if (forms.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    const formFields = parseJSON(forms[0].form_fields);
    const formName = forms[0].form_name;

    // Include both visible and hidden fields for completion calculation
    // Exclude PIN number fields as they are optional administrative fields
    const allFields = formFields.filter(field => field.key);
    const completionFields = allFields.filter(field =>
      !field.key.toLowerCase().includes('pin') &&
      field.key !== 'pin_no'
    );

    console.log(`\n🔍 STUDENT COMPLETION ANALYSIS: ${admissionNumber}`);
    console.log(`   📊 Form fields: ${allFields.length} total, ${completionFields.length} for completion (${allFields.length - completionFields.length} PIN fields excluded)`);

    // Calculate completion status considering all fields except PIN numbers
    const totalFields = completionFields.length;
    let completedFields = 0;

    const fieldStatus = allFields.map(field => {
      const key = field.key;
      const isPinField = key.toLowerCase().includes('pin') || key === 'pin_no';

      // Check if the field exists in the student record (individual columns take precedence)
      let value = null;
      let completed = false;
      let source = 'none';

      // First check individual database columns
      if (student[key] !== undefined && student[key] !== null && student[key] !== '') {
        value = student[key];
        source = 'database_column';
        // Only count non-PIN fields towards completion
        if (!isPinField) {
          completed = true;
          completedFields++;
        }
      }
      // Then check student_data JSON as fallback
      else if (student.student_data) {
        try {
          const studentData = parseJSON(student.student_data);
          if (studentData && studentData[key] !== undefined && studentData[key] !== null && studentData[key] !== '') {
            value = studentData[key];
            source = 'json_data';
            // Only count non-PIN fields towards completion
            if (!isPinField) {
              completed = true;
              completedFields++;
            }
          } else {
            source = 'json_empty';
          }
        } catch (error) {
          source = 'json_error';
        }
      } else {
        source = 'no_data';
      }

      // Enhanced logging for all fields
      const status = completed ? '✅' : (isPinField ? '🔄' : '❌');
      const fieldType = isPinField ? 'PIN' : 'REG';
      const sourceInfo = source !== 'none' ? `(${source})` : '';
      const valuePreview = value ? `"${value.substring ? value.substring(0, 30) + (value.length > 30 ? '...' : '') : value}"` : '""';

      console.log(`   ${status} ${fieldType} ${key.padEnd(25)} ${valuePreview.padEnd(35)} ${sourceInfo}`);

      return {
        key: field.key,
        label: field.label,
        type: field.type || 'text',
        completed: completed,
        value: value,
        required: field.required || false,
        isHidden: field.isHidden || false,
        isPinField: isPinField,
        source: source
      };
    });

    // Summary section
    const missingFields = fieldStatus.filter(field => !field.isPinField && !field.completed);
    const pinFields = fieldStatus.filter(field => field.isPinField);

    console.log(`\n📊 COMPLETION SUMMARY for ${admissionNumber}:`);
    console.log(`   ✅ Completed: ${completedFields}/${totalFields} fields (${Math.round((completedFields / totalFields) * 100)}%)`);

    if (missingFields.length > 0) {
      console.log(`   ❌ Missing ${missingFields.length} fields:`);
      missingFields.forEach(field => {
        console.log(`      • ${field.key}: ${field.source} - "${field.value || 'empty'}"`);
      });
    } else {
      console.log(`   🎉 All required fields completed!`);
    }

    if (pinFields.length > 0) {
      console.log(`   🔄 PIN fields (${pinFields.length}):`);
      pinFields.forEach(field => {
        console.log(`      • ${field.key}: ${field.source} - "${field.value || 'not assigned'}"`);
      });
    }

    console.log(`   📋 Data sources: DB columns + JSON fallback`);

    const completionPercentage = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

    console.log(`📊 Completion: ${completionPercentage}% (${completedFields}/${totalFields} fields completed)`);

    // Add summary of missing fields for easier debugging
    const missingFieldSummary = fieldStatus.filter(field => !field.isPinField && !field.completed).map(field => ({
      key: field.key,
      label: field.label,
      source: field.source,
      currentValue: field.value
    }));

    res.json({
      success: true,
      data: {
        totalFields,
        completedFields,
        pendingFields: totalFields - completedFields,
        completionPercentage,
        fieldStatus,
        formName,
        missingFields: missingFields,
        note: 'PIN number fields are excluded from completion calculation as they are optional administrative fields'
      }
    });

  } catch (error) {
    console.error('Get student completion status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching student completion status'
    });
  }
};

exports.getTemplateMetadata = async (req, res) => {
  try {
    const { formId } = req.params;
    const resources = await buildTemplateResources(formId);

    const {
      form,
      headers,
      fieldSummaries,
      requiredHeaders,
      optionalHeaders,
      sampleRow,
      courseOptions
    } = resources;

    res.json({
      success: true,
      data: {
        formId,
        formName: form.form_name,
        headers,
        requiredHeaders,
        optionalHeaders,
        fields: fieldSummaries,
        sampleRow,
        courseOptions,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    console.error('Template metadata error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while preparing template metadata'
    });
  }
};

// Download Excel template for bulk upload
exports.downloadExcelTemplate = async (req, res) => {
  try {
    const { formId } = req.params;
    const {
      course: courseQuery,
      courseCode: courseCodeQuery,
      branch: branchQuery,
      branchCode: branchCodeQuery
    } = req.query || {};

    const resources = await buildTemplateResources(formId);
    const {
      form,
      headers,
      sampleRow,
      fieldSummaries,
      courseOptions,
      courseIndex
    } = resources;

    const workbook = xlsx.utils.book_new();

    const templateData = [headers];
    const templateSampleRow = [...sampleRow];

    if (courseQuery || courseCodeQuery || branchQuery || branchCodeQuery) {
      const resolution = resolveCourseAndBranch(courseIndex, {
        courseValue: courseQuery,
        courseCodeValue: courseCodeQuery || courseQuery,
        branchValue: branchQuery,
        branchCodeValue: branchCodeQuery || branchQuery
      });

      if (resolution.errors && resolution.errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: resolution.errors[0]?.message || 'Invalid course or branch supplied',
          errors: resolution.errors
        });
      }

      const courseHeaderIndex = headers.findIndex(
        (header) => normalizeHeaderKey(header) === normalizeHeaderKey('Course')
      );
      if (resolution.course && courseHeaderIndex !== -1) {
        templateSampleRow[courseHeaderIndex] = resolution.course.name;
      }

      const branchHeaderIndex = headers.findIndex(
        (header) => normalizeHeaderKey(header) === normalizeHeaderKey('Branch')
      );
      if (resolution.branch && branchHeaderIndex !== -1) {
        templateSampleRow[branchHeaderIndex] = resolution.branch.name;
      }
    }

    templateData.push(templateSampleRow);

    const templateSheet = xlsx.utils.aoa_to_sheet(templateData);
    templateSheet['!cols'] = headers.map((header) => ({ wch: Math.max(header.length + 4, 18) }));
    templateSheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    const courseColumnIndex = headers.findIndex(
      (header) => normalizeHeaderKey(header) === normalizeHeaderKey('Course')
    );
    const branchColumnIndex = headers.findIndex(
      (header) => normalizeHeaderKey(header) === normalizeHeaderKey('Branch')
    );

    const totalBranchCount = courseOptions.reduce(
      (total, course) => total + (Array.isArray(course.branches) ? course.branches.length : 0),
      0
    );

    if (courseColumnIndex !== -1 && courseOptions.length > 0) {
      const courseColumnLetter = toExcelColumn(courseColumnIndex);
      templateSheet['!dataValidation'] = templateSheet['!dataValidation'] || [];
      templateSheet['!dataValidation'].push({
        type: 'list',
        allowBlank: true,
        showInputMessage: true,
        promptTitle: 'Course',
        prompt: 'Select a course from the reference sheet.',
        sqref: `${courseColumnLetter}2:${courseColumnLetter}5000`,
        formulas: [`'Course Branch Reference'!$A$2:$A$${courseOptions.length + 1}`]
      });
    }

    if (branchColumnIndex !== -1 && totalBranchCount > 0) {
      const branchColumnLetter = toExcelColumn(branchColumnIndex);
      templateSheet['!dataValidation'] = templateSheet['!dataValidation'] || [];
      templateSheet['!dataValidation'].push({
        type: 'list',
        allowBlank: true,
        showInputMessage: true,
        promptTitle: 'Branch',
        prompt: 'Select a branch that matches the chosen course.',
        sqref: `${branchColumnLetter}2:${branchColumnLetter}5000`,
        formulas: [`'Course Branch Reference'!$C$2:$C$${totalBranchCount + 1}`]
      });
    }

    xlsx.utils.book_append_sheet(workbook, templateSheet, 'Template');

    const requiredCount = fieldSummaries.filter((field) => field.required).length;
    const optionalCount = fieldSummaries.length - requiredCount;

    const instructionsData = [
      ['Template Information'],
      ['Form Name', form.form_name],
      ['Total Columns', headers.length],
      ['Required Columns', requiredCount],
      ['Optional Columns', optionalCount],
      [''],
      ['Field Name', 'Column Header', 'Required', 'Category', 'Example', 'Description']
    ];

    fieldSummaries.forEach((field) => {
      instructionsData.push([
        field.displayName || field.header,
        field.header,
        field.required ? 'Yes' : 'No',
        field.category || '',
        field.example || '',
        field.description || ''
      ]);
    });

    const instructionsSheet = xlsx.utils.aoa_to_sheet(instructionsData);
    instructionsSheet['!cols'] = [
      { wch: 32 },
      { wch: 32 },
      { wch: 10 },
      { wch: 20 },
      { wch: 24 },
      { wch: 70 }
    ];
    instructionsSheet['!freeze'] = { xSplit: 0, ySplit: 7 };
    xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    const referenceData = [['Course Name', 'Course Code', 'Branch Name', 'Branch Code']];
    courseOptions.forEach((course) => {
      if (Array.isArray(course.branches) && course.branches.length > 0) {
        course.branches.forEach((branch) => {
          referenceData.push([
            course.name,
            course.code || '',
            branch.name,
            branch.code || ''
          ]);
        });
      } else {
        referenceData.push([course.name, course.code || '', '', '']);
      }
    });

    const referenceSheet = xlsx.utils.aoa_to_sheet(referenceData);
    referenceSheet['!cols'] = [
      { wch: 32 },
      { wch: 16 },
      { wch: 38 },
      { wch: 16 }
    ];
    xlsx.utils.book_append_sheet(workbook, referenceSheet, 'Course Branch Reference');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${form.form_name}_template.xlsx"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    console.log(`✅ Excel template downloaded for form: ${form.form_name}`);

  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    console.error('Download Excel template error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating Excel template'
    });
  }
};

// Bulk delete submissions (admin only)
exports.bulkDeleteSubmissions = async (req, res) => {
  try {
    // Check for delete permission
    const user = req.user || req.admin;
    if (user && user.role !== 'super_admin' && user.role !== 'admin') {
      const { hasPermission, MODULES } = require('../constants/rbac');
      if (!hasPermission(user.permissions, MODULES.PRE_REGISTRATION, 'delete')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete submissions'
        });
      }
    }

    const { submissionIds } = req.body;

    if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Submission IDs array is required'
      });
    }

    console.log(`🔄 Starting bulk delete for ${submissionIds.length} submissions`);

    let deletedCount = 0;
    let failedCount = 0;
    const results = [];
    const errors = [];

    // Process each submission
    for (const submissionId of submissionIds) {
      try {
        console.log(`📋 Deleting submission: ${submissionId}`);

        // Delete submission - allow deletion of any status
        const [deleteResult] = await masterPool.query(
          'DELETE FROM form_submissions WHERE submission_id = ?',
          [submissionId]
        );

        if (deleteResult.affectedRows === 0) {
          console.error(`❌ Submission ${submissionId} not found`);
          errors.push({
            submissionId,
            error: 'Submission not found',
            type: 'not_found'
          });
          failedCount++;
          continue;
        }

        deletedCount++;
        results.push({
          submissionId,
          status: 'deleted'
        });

        console.log(`✅ Deleted submission ${submissionId}`);

      } catch (error) {
        console.error(`❌ Error deleting submission ${submissionId}:`, error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          sqlState: error.sqlState
        });
        errors.push({
          submissionId,
          error: error.message,
          type: 'delete_error'
        });
        failedCount++;
      }
    }

    // Log action
    try {
      await writeAuditLog(masterPool, {
        actionType: 'BULK_DELETE',
        entityType: 'SUBMISSION',
        entityId: JSON.stringify(submissionIds),
        req,
        actor: user || req.admin,
        details: { deletedCount, failedCount }
      });
    } catch (logError) {
      console.error('Error logging bulk delete action:', logError);
      // Don't fail the request if logging fails
    }

    console.log(`✅ Bulk delete completed: ${deletedCount} deleted, ${failedCount} failed`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedCount} deleted, ${failedCount} failed`,
      deletedCount,
      failedCount,
      results,
      errors
    });

  } catch (error) {
    console.error('❌ Bulk delete failed:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk delete',
      error: error.message
    });
  }
};

// Bulk approve submissions (admin only)
exports.bulkApproveSubmissions = async (req, res) => {
  let masterConn = null;
  const startTime = Date.now();

  try {
    const { submissionIds } = req.body;

    if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Submission IDs array is required'
      });
    }

    console.log(`🔄 Starting bulk approval for ${submissionIds.length} submissions`);

    // Get database connection
    masterConn = await masterPool.getConnection();

    let approvedCount = 0;
    let failedCount = 0;
    const results = [];
    const errors = [];

    // Process each submission
    for (const submissionId of submissionIds) {
      try {
        console.log(`📋 Processing submission: ${submissionId}`);

        // Get submission details
        const [submissions] = await masterPool.query(
          'SELECT * FROM form_submissions WHERE submission_id = ? AND status = ? LIMIT 1',
          [submissionId, 'pending']
        );

        if (!submissions || submissions.length === 0) {
          console.error(`❌ Submission ${submissionId} not found or not pending`);
          errors.push({
            submissionId,
            error: 'Submission not found or not pending',
            type: 'not_found'
          });
          failedCount++;
          continue;
        }

        const submission = submissions[0];
        const submissionData = parseJSON(submission.submission_data);

        // Generate admission number if not present
        const admissionNumber = submissionData.admission_number || `ADM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Update submission data with admission number
        const updatedSubmissionData = {
          ...submissionData,
          admission_number: admissionNumber
        };

        // Approve the submission (same logic as single approval)
        await approveSingleSubmission(submission, updatedSubmissionData, admissionNumber, masterConn, req.admin);

        approvedCount++;
        results.push({
          submissionId,
          admissionNumber,
          status: 'approved'
        });

        console.log(`✅ Approved submission ${submissionId} with admission number: ${admissionNumber}`);

      } catch (error) {
        console.error(`❌ Error approving submission ${submissionId}:`, error);
        errors.push({
          submissionId,
          error: error.message,
          type: 'approval_error'
        });
        failedCount++;
      }
    }

    const totalTime = Date.now() - startTime;

    // Log action
    await writeAuditLog(masterPool, {
      actionType: 'BULK_APPROVE',
      entityType: 'SUBMISSION',
      entityId: JSON.stringify(submissionIds),
      req,
      details: {
        approvedCount,
        failedCount,
        totalTime: `${totalTime}ms`
      }
    });

    console.log(`✅ Bulk approval completed: ${approvedCount} approved, ${failedCount} failed in ${totalTime}ms`);

    res.json({
      success: true,
      message: `Bulk approval completed: ${approvedCount} approved, ${failedCount} failed`,
      approvedCount,
      failedCount,
      totalTime: `${totalTime}ms`,
      results,
      errors
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ Bulk approval failed:', error);

    res.status(500).json({
      success: false,
      message: 'Server error during bulk approval',
      error: error.message,
      totalTime: `${totalTime}ms`
    });
  } finally {
    if (masterConn) {
      masterConn.release();
    }
  }
};

// Helper function to approve a single submission (extracted from original approveSubmission)
const approveSingleSubmission = async (submission, submissionData, admissionNumber, masterConn, admin) => {
  const finalAdmissionNumber = String(admissionNumber).trim();

  // Load form to determine dynamic table/columns in master DB
  const [forms] = await masterConn.query('SELECT * FROM forms WHERE form_id = ?', [submission.form_id]);
  const formFields = forms.length > 0 ? parseJSON(forms[0].form_fields) : [];

  // Determine destination table in master DB: single table per form, named by form_id
  const destinationTable = `form_${submission.form_id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  // Build DDL to ensure destination table exists with columns from formFields
  await masterConn.query(
    `CREATE TABLE IF NOT EXISTS ${destinationTable} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      admission_number VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );

  // Ensure columns for each field key exist
  for (const field of formFields) {
    const col = field.key?.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!col) continue;

    // Check if column exists (MySQL doesn't support IF NOT EXISTS in ALTER TABLE)
    const [columns] = await masterConn.query(
      `SELECT COUNT(*) as count 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ? 
       AND COLUMN_NAME = ?`,
      [destinationTable, col]
    );

    if (columns[0].count === 0) {
      await masterConn.query(
        `ALTER TABLE ${destinationTable} ADD COLUMN ${col} VARCHAR(1024) NULL`
      );
    }
  }

  // Prepare insert columns/values for dynamic table
  const insertCols = ['admission_number'];
  const insertVals = [finalAdmissionNumber];
  const placeholders = ['?'];

  for (const field of formFields) {
    const key = field.key;
    const col = key?.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!col) continue;
    insertCols.push(col);
    insertVals.push(submissionData[key] ?? null);
    placeholders.push('?');
  }

  await masterConn.query(
    `INSERT INTO ${destinationTable} (${insertCols.join(',')}) VALUES (${placeholders.join(',')})`,
    insertVals
  );

  // Check if student exists and update/create accordingly
  const [students] = await masterConn.query(
    'SELECT * FROM students WHERE admission_number = ? OR admission_no = ?',
    [finalAdmissionNumber, finalAdmissionNumber]
  );

  if (students.length > 0) {
    // Update existing student
    const existingStudent = students[0];
    const existingData = parseJSON(existingStudent.student_data) || {};
    const mergedData = { ...existingData };

    Object.entries(submissionData).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        mergedData[key] = value;
      }
    });

    mergedData.form_id = submission.form_id;

    const updateFields = [];
    const updateValues = [];
    const addedUpdateFields = new Set();

    Object.entries(submissionData).forEach(([key, value]) => {
      const columnName = getColumnNameForField(key);
      if (columnName && value !== undefined && value !== '' && !addedUpdateFields.has(columnName)) {
        updateFields.push(`${columnName} = ?`);
        updateValues.push(value);
        addedUpdateFields.add(columnName);
      }
    });

    if (!addedUpdateFields.has('student_data')) {
      const jsonMergedData = safeJSONStringify(mergedData);
      updateFields.push('student_data = ?');
      updateValues.push(jsonMergedData);
    }

    updateValues.push(finalAdmissionNumber);

    await masterConn.query(
      `UPDATE students SET ${updateFields.join(', ')} WHERE admission_number = ? OR admission_no = ?`,
      [...updateValues, finalAdmissionNumber, finalAdmissionNumber]
    );

    // Generate credentials if they don't exist (for updated students)
    try {
      const { generateCredentialsByAdmissionNumber } = require('../utils/studentCredentials');
      const credResult = await generateCredentialsByAdmissionNumber(finalAdmissionNumber);
      if (credResult.success) {
        console.log(`✅ Generated/updated login credentials for student ${finalAdmissionNumber} (username: ${credResult.username})`);
      }
    } catch (credError) {
      // Non-fatal error
      console.error('Error generating credentials for updated student (non-fatal):', credError);
    }
  } else {
    // Create new student
    const studentData = {};
    const fieldValuePairs = [];
    const addedFields = new Set();

    fieldValuePairs.push({ field: 'admission_number', value: finalAdmissionNumber });
    addedFields.add('admission_number');

    fieldValuePairs.push({ field: 'admission_no', value: finalAdmissionNumber });
    addedFields.add('admission_no');

    Object.entries(submissionData).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        let sanitizedValue = value;
        if (typeof value === 'string') {
          sanitizedValue = value.trim();
        }

        studentData[key] = sanitizedValue;

        const columnName = getColumnNameForField(key);
        if (columnName && !addedFields.has(columnName)) {
          fieldValuePairs.push({ field: columnName, value: sanitizedValue });
          addedFields.add(columnName);
        }
      }
    });

    studentData.form_id = submission.form_id;

    if (!addedFields.has('student_data')) {
      const jsonStudentData = safeJSONStringify(studentData);
      fieldValuePairs.push({ field: 'student_data', value: jsonStudentData });
      addedFields.add('student_data');
    }

    const insertFields = fieldValuePairs.map(pair => pair.field);
    const insertValues = fieldValuePairs.map(pair => pair.value);

    const placeholders = insertFields.map(() => '?').join(', ');
    const query = `INSERT INTO students (${insertFields.join(', ')}) VALUES (${placeholders})`;

    await masterConn.query(query, insertValues);

    // Generate student login credentials automatically
    try {
      const { generateCredentialsByAdmissionNumber } = require('../utils/studentCredentials');
      const credResult = await generateCredentialsByAdmissionNumber(finalAdmissionNumber);
      if (credResult.success) {
        console.log(`✅ Generated login credentials for student ${finalAdmissionNumber} (username: ${credResult.username})`);
      } else {
        console.warn(`⚠️  Could not generate credentials for student ${finalAdmissionNumber}: ${credResult.error}`);
      }
    } catch (credError) {
      console.error('Error generating student credentials (non-fatal):', credError);
      // Don't fail approval if credential generation fails
    }
  }

  // Update submission status
  await masterConn.query(
    `UPDATE form_submissions 
     SET status = ?, reviewed_at = ?, reviewed_by = ?, admission_number = ?
     WHERE submission_id = ?`,
    ['approved', new Date(), admin.id, finalAdmissionNumber, submission.submission_id]
  );
};

// Toggle auto-assign series setting
exports.toggleAutoAssignSeries = async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Enabled must be a boolean'
      });
    }

    // Update or insert setting
    await masterPool.query(
      `INSERT INTO settings (\`key\`, value) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE value = ?`,
      ['auto_assign_series', enabled.toString(), enabled.toString()]
    );

    res.json({
      success: true,
      message: `Auto-assign series ${enabled ? 'enabled' : 'disabled'}`
    });

  } catch (error) {
    console.error('Toggle auto-assign series error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling auto-assign series'
    });
  }
};

// Get auto-assign series setting (always returns enabled: true)
exports.getAutoAssignSeries = async (req, res) => {
  try {
    // Always return enabled: true (auto-assign is always on)
    res.json({
      success: true,
      data: { enabled: true }
    });

  } catch (error) {
    console.error('Get auto-assign series error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while getting auto-assign series setting'
    });
  }
};

// Export multer middleware
exports.uploadMiddleware = upload.single('file');
exports.upload = upload;

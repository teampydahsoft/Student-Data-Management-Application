const { masterPool, stagingPool } = require('../config/database');
const { fetchActiveQuotaCodes } = require('./quotaController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { studentsCache } = require('../services/cache');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const { generateRegistrationReportPDF } = require('../services/pdfService');
const { getISTDateString } = require('../utils/dateUtils');
const {
  getNextStage,
  normalizeStage
} = require('../services/academicProgression');
const sectionAssignmentService = require('../services/sectionAssignmentService');

// Section assignment is per batch: each batch gets its own A/B/C/D split (strength limits apply within the batch).
const maybeReassignBranchSections = async (course, branch, batch = null) => {
  if (!course || !branch) return;
  try {
    await sectionAssignmentService.reassignSectionsForStudentBranch(course, branch, batch);
  } catch (error) {
    console.error('Auto section assignment failed:', error);
  }
};

const resolveStudentSectionSql = () => `COALESCE(
  (SELECT ss.section_name FROM student_sections ss WHERE ss.student_id = students.id LIMIT 1),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(students.student_data, '$.section'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(students.student_data, '$.Section'))), '')
)`;
const { getScopeConditionString } = require('../utils/scoping');
const { otpCache } = require('../services/cache'); // Import otpCache
const smsService = require('../services/smsService'); // Import smsService
const {
  OTP_PE_ID,
  SEMESTER_OTP_SMS_TEMPLATE_ID,
  buildSemesterRegistrationOtpMessage,
  sendOtpSms
} = require('../utils/otpSmsTemplates');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Export multer middleware at the top level
exports.uploadMiddleware = upload.single('file');

const clearStudentsCache = () => {
  if (studentsCache && typeof studentsCache.clear === 'function') {
    studentsCache.clear();
  }
};

/**
 * Write an audit log entry safely, supporting both legacy admins (admins table)
 * and RBAC users (rbac_users table). If the actor has a non-'admin' role,
 * it is treated as an RBAC user and its id is stored in rbac_user_id.
 */
const writeAuditLog = async (pool, { actionType, entityType, entityId, actor, details }) => {
  try {
    const isRbacUser = actor && actor.role && actor.role !== 'admin';
    const adminId = isRbacUser ? null : (actor?.id || null);
    const rbacUserId = isRbacUser ? (actor?.id || null) : null;

    await pool.query(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, rbac_user_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actionType, entityType, entityId, adminId, rbacUserId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Audit log error (non-critical):', err.message);
  }
};

// Upload student photo to MySQL database
exports.uploadStudentPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file provided'
      });
    }

    const { admissionNumber } = req.body;
    if (!admissionNumber) {
      return res.status(400).json({
        success: false,
        message: 'Admission number is required'
      });
    }

    // Get student PIN number for logging
    const [studentRows] = await masterPool.query(
      'SELECT pin_no FROM students WHERE admission_number = ?',
      [admissionNumber]
    );
    const pinNo = studentRows.length > 0 ? studentRows[0].pin_no : null;

    // Read file and convert to base64
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Image = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Create data URL for the image
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    // Update student record with base64 image data
    const [result] = await masterPool.query(
      'UPDATE students SET student_photo = ? WHERE admission_number = ?',
      [imageDataUrl, admissionNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Log the successful upload with PIN number
    const logMessage = pinNo
      ? `✅ Photo updated for student with PIN: ${pinNo} (Admission: ${admissionNumber})`
      : `✅ Photo updated for student (Admission: ${admissionNumber})`;
    console.log(logMessage);

    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    clearStudentsCache();

    res.json({
      success: true,
      message: 'Photo uploaded successfully to MySQL database',
      data: {
        student_admission_number: admissionNumber,
        image_size: `${(base64Image.length / 1024).toFixed(2)} KB`,
        image_type: mimeType,
        storage: 'mysql',
        photo_url: imageDataUrl // Return the base64 data URL for immediate display
      }
    });

  } catch (error) {
    console.error('Upload student photo error:', error);

    // Clean up temporary file if it exists
    if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Server error while uploading photo'
    });
  }
};



// Helper to ensure previous college exists in the lookup table
const ensurePreviousCollegeExists = async (collegeName) => {
  if (!collegeName || !String(collegeName).trim()) return;
  const name = String(collegeName).trim();
  try {
    // Check if exists
    const [rows] = await masterPool.query('SELECT id FROM previous_colleges WHERE name = ?', [name]);
    if (rows.length === 0) {
      await masterPool.query('INSERT INTO previous_colleges (name) VALUES (?)', [name]);
    }
  } catch (error) {
    // Ignore duplicate errors or other non-critical failures
    // Table might not exist yet if migration failed, or race condition
    // silently fail
  }
};

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

// Clean up student metadata and recursion from JSON objects
const cleanStudentMetadata = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const cleanObj = { ...obj };

  // List of keys identified as causing recursion or bloat
  const keysToRemove = [
    'student_data', 'studentData', 'synchronizedData',
    'id', 'admission_number', 'admission_no',
    'created_at', 'updated_at', 'student_photo',
    'student_marks', 'student_attendance', 'today_attendance_status'
  ];

  keysToRemove.forEach(key => delete cleanObj[key]);
  return cleanObj;
};

const YEAR_KEYS = [
  'current_year',
  'Current Year',
  'Current Academic Year',
  'year',
  'Year',
  'currentYear'
];

const SEMESTER_KEYS = [
  'current_semester',
  'Current Semester',
  'semester',
  'Semester',
  'currentSemester'
];

const resolveStageFromData = (data, fallbackStage = { year: 1, semester: 1 }) => {
  if (!data || typeof data !== 'object') {
    return fallbackStage;
  }

  const yearValue = YEAR_KEYS.map(key => data[key])
    .find(value => value !== undefined && value !== null && value !== '');
  const semesterValue = SEMESTER_KEYS.map(key => data[key])
    .find(value => value !== undefined && value !== null && value !== '');

  if (yearValue !== undefined && semesterValue !== undefined) {
    try {
      return normalizeStage(yearValue, semesterValue);
    } catch (error) {
      if (error.message === 'INVALID_STAGE') {
        return fallbackStage;
      }
      throw error;
    }
  }

  return fallbackStage;
};

const applyStageToPayload = (payload, stage) => {
  if (!stage) {
    return;
  }

  payload.current_year = stage.year;
  payload.current_semester = stage.semester;
  payload['Current Academic Year'] = stage.year;
  payload['Current Semester'] = stage.semester;
};

const FIELD_MAPPING = {
  // Exact field names from Excel template
  'Pin Number': 'pin_no',
  'Batch': 'batch',
  'College': 'college',
  'Branch': 'branch',
  'StudType': 'stud_type',
  'Student Name': 'student_name',
  'Student Status': 'student_status',
  'Student Mobile number': 'student_mobile',
  'Parent Mobile Number 1': 'parent_mobile1',
  'Parent Mobile Number 2': 'parent_mobile2',
  'Caste': 'caste',
  'M/F': 'gender',
  'Father Name': 'father_name',
  'DOB (Date-Month-Year) Ex: 09-Sep-2003)': 'dob',
  'DOB (Date of Birth - DD-MM-YYYY)': 'dob',
  'ADHAR No': 'adhar_no',
  'Admission No': 'admission_no',
  'Admission Number': 'admission_number',
  'Student Address (D.no,Street name,village,mandal,Dist)': 'student_address',
  'Student Address (D.No, Str name, Village, Mandal, Dist)': 'student_address',
  'City/Village Name': 'city_village',
  'City/Village': 'city_village',
  'Mandal Name': 'mandal_name',
  'District': 'district',
  'Previous College Name': 'previous_college',
  'Certificates Status': 'certificates_status',
  'Student Photo': 'student_photo',
  'Remarks': 'remarks',
  'Course': 'course',
  'Year': 'current_year',
  'Semister': 'current_semester',
  'Semester': 'current_semester',
  'Fee Status': 'fee_status',
  'Registration Status': 'registration_status',


  // Alternative field names (for backward compatibility)
  'Student Mobile Number': 'student_mobile',
  'Admission Date': 'admission_date',
  'Branch Name': 'branch',
  branch_name: 'branch',
  // 'Branch Code': 'branch_code', // Removed - branch_code is stored in student_data JSON only, not as a column
  'Current Academic Year': 'current_year',
  'Current Year': 'current_year',
  current_year: 'current_year',
  currentYear: 'current_year',
  'Course Name': 'course',
  course: 'course',
  course_name: 'course',
  'Course Code': 'course_code',
  course_code: 'course_code',
  'Current Semester': 'current_semester',
  current_semester: 'current_semester',
  currentSemester: 'current_semester',
  'Scholar Status': 'scholar_status',

  // Database field names (direct mapping)
  pin_no: 'pin_no',
  previous_college: 'previous_college',
  certificates_status: 'certificates_status',
  student_photo: 'student_photo',
  student_name: 'student_name',
  student_mobile: 'student_mobile',
  father_name: 'father_name',
  dob: 'dob',
  adhar_no: 'adhar_no',
  admission_date: 'admission_date',
  admission_no: 'admission_no',
  admission_number: 'admission_number',
  batch: 'batch',
  college: 'college',
  branch: 'branch',
  // branch_code: 'branch_code', // Removed - branch_code is stored in student_data JSON only, not as a column
  stud_type: 'stud_type',
  parent_mobile1: 'parent_mobile1',
  parent_mobile2: 'parent_mobile2',
  student_address: 'student_address',
  city_village: 'city_village',
  mandal_name: 'mandal_name',
  district: 'district',
  caste: 'caste',
  gender: 'gender',
  student_status: 'student_status',
  scholar_status: 'scholar_status',
  remarks: 'remarks'
};

const normalizeIdentifier = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

// Enhanced normalization that handles more variations
const normalizeHeaderKeyForLookup = (header) => {
  if (header === undefined || header === null) {
    return '';
  }
  return header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric characters
    .replace(/\s+/g, ''); // Remove all spaces
};

// Create a comprehensive field mapping with all possible variations
const createComprehensiveFieldMapping = () => {
  const mapping = {};

  // Define all possible field name variations for each database field
  const fieldVariations = {
    pin_no: ['pinnumber', 'pin_no', 'pin', 'pinnumber', 'pin_number', 'rollno', 'rollnumber', 'roll_no', 'pinno', 'pin_no', 'pin', 'pinnumber', 'pin_number', 'rollno', 'rollnumber', 'roll_no', 'rollnumber', 'roll_number', 'rollno', 'roll_no'],
    batch: ['batch', 'batchyear', 'batch_year', 'year', 'academicyear', 'academic_year', 'batch', 'batchyear', 'batch_year', 'year', 'academicyear', 'academic_year', 'batchyear', 'batch_year', 'academicyear', 'academic_year'],
    college: ['college', 'collegename', 'college_name', 'institution', 'institutionname', 'institution_name', 'campus', 'campusname', 'campus_name', 'college', 'collegename', 'college_name', 'institution', 'institutionname', 'institution_name', 'campus', 'campusname', 'campus_name'],
    branch: ['branch', 'branchname', 'branch_name', 'department', 'dept', 'specialization', 'branch', 'branchname', 'branch_name', 'department', 'dept', 'specialization', 'specialisation', 'stream', 'discipline'],
    stud_type: ['studtype', 'studenttype', 'student_type', 'type', 'category', 'studentcategory', 'studtype', 'studenttype', 'student_type', 'type', 'category', 'studentcategory', 'studentcategory', 'student_category'],
    student_name: ['studentname', 'name', 'student', 'fullname', 'full_name', 'studentfullname', 'student_name', 'studentname', 'nameofstudent', 'name_of_student', 'sname', 's_name'],
    student_status: ['studentstatus', 'student_status', 'status', 'currentstatus', 'current_status', 'studentstatus', 'student_status', 'status', 'currentstatus', 'current_status', 'studstatus', 'stud_status'],
    student_mobile: ['studentmobilenumber', 'studentmobile', 'mobile', 'phone', 'studentphone', 'contact', 'studentcontact', 'mobilenumber', 'phonenumber', 'student_mobile', 'studentmobile', 'studentphone', 'student_phone', 'contactnumber', 'contact_number', 'mob', 'mobile_no', 'phone_no'],
    parent_mobile1: ['parentmobilenumber1', 'parentmobile1', 'parent_mobile1', 'parentmobile', 'parentphone', 'parentcontact', 'guardianmobile', 'guardianphone', 'fathermobile', 'fatherphone', 'parentmobile1', 'parent_mobile1', 'parentmobile', 'parentphone', 'parentcontact', 'guardianmobile', 'guardianphone', 'fathermobile', 'fatherphone', 'parent1mobile', 'parent1_mobile', 'parent1phone', 'parent1_phone'],
    parent_mobile2: ['parentmobilenumber2', 'parentmobile2', 'parent_mobile2', 'parentmobile2', 'mothermobile', 'motherphone', 'alternatemobile', 'alternatephone', 'parentmobile2', 'parent_mobile2', 'parentmobile2', 'mothermobile', 'motherphone', 'alternatemobile', 'alternatephone', 'parent2mobile', 'parent2_mobile', 'parent2phone', 'parent2_phone'],
    caste: ['caste', 'category', 'socialcategory', 'social_category', 'cast', 'caste', 'category', 'socialcategory', 'social_category', 'cast', 'socialcategory', 'social_category', 'castecategory', 'caste_category'],
    gender: ['mf', 'm/f', 'gender', 'sex', 'maleorfemale', 'male_or_female', 'gender', 'sex', 'mf', 'm/f', 'maleorfemale', 'male_or_female', 'gend', 'sex', 'maleorfemale', 'male_or_female'],
    father_name: ['fathername', 'father', 'fathersname', 'fathers_name', 'parentname', 'guardianname', 'father_name', 'fathername', 'fathersname', 'fathers_name', 'fname', 'f_name', 'guardian', 'guardian_name'],
    dob: ['dobdatemonthyearex09sep2003', 'dateofbirth', 'birthdate', 'birth_date', 'dob', 'date_of_birth', 'birthday', 'bdate', 'dateofbirth', 'dob', 'birthdate', 'birth_date', 'date_of_birth', 'birthday', 'bdate', 'date', 'birth'],
    adhar_no: ['adharno', 'adharnumber', 'aadhar', 'aadharno', 'aadharnumber', 'aadhaarno', 'aadhaarnumber', 'uid', 'uidnumber', 'adhar_no', 'adharno', 'adharnumber', 'aadhar', 'aadharno', 'aadharnumber', 'aadhaar', 'aadhaarno', 'aadhaarnumber', 'uid', 'uidnumber', 'uidai'],
    admission_no: ['admissionno', 'admissionnumber', 'admission_no', 'admission_number', 'admitno', 'admitnumber', 'enrollmentno', 'enrollmentnumber', 'admissionno', 'admissionnumber', 'admission_no', 'admission_number', 'admitno', 'admitnumber', 'enrollmentno', 'enrollmentnumber', 'admno', 'adm_no', 'regno', 'reg_no'],
    admission_number: ['admissionno', 'admissionnumber', 'admission_no', 'admission_number', 'admitno', 'admitnumber', 'enrollmentno', 'enrollmentnumber', 'admissionno', 'admissionnumber', 'admission_no', 'admission_number', 'admitno', 'admitnumber', 'enrollmentno', 'enrollmentnumber', 'admno', 'adm_no', 'regno', 'reg_no'],
    student_address: ['studentaddressdnostreetnamevillagemandaldist', 'studentaddress', 'address', 'fulladdress', 'full_address', 'permanentaddress', 'permanent_address', 'residentialaddress', 'studentaddress', 'address', 'fulladdress', 'full_address', 'permanentaddress', 'permanent_address', 'residentialaddress', 'homeaddress', 'home_address', 'localaddress', 'local_address'],
    city_village: ['cityvillagename', 'cityvillage', 'city_village', 'city', 'village', 'town', 'cityortown', 'cityvillage', 'city_village', 'city', 'village', 'town', 'cityortown', 'cityvillage', 'city_or_village'],
    mandal_name: ['mandalname', 'mandal_name', 'mandal', 'taluk', 'taluka', 'block', 'mandalname', 'mandal_name', 'mandal', 'taluk', 'taluka', 'block', 'tehsil', 'tehsilname', 'tehsil_name'],
    district: ['district', 'dist', 'districtname', 'district_name', 'district', 'dist', 'districtname', 'district_name', 'districtname', 'district_name'],
    previous_college: ['previouscollegename', 'previouscollege', 'previous_college', 'lastcollege', 'last_college', 'previousinstitution', 'previouscollege', 'previous_college', 'lastcollege', 'last_college', 'previousinstitution', 'previousinstitution', 'previous_institution', 'lastinstitution', 'last_institution'],
    certificates_status: ['certificatesstatus', 'certificates_status', 'certstatus', 'cert_status', 'documentstatus', 'certificatesstatus', 'certificates_status', 'certstatus', 'cert_status', 'documentstatus', 'certstatus', 'cert_status', 'documentstatus', 'document_status'],
    student_photo: ['studentphoto', 'student_photo', 'photo', 'picture', 'image', 'profilephoto', 'studentphoto', 'student_photo', 'photo', 'picture', 'image', 'profilephoto', 'photograph', 'profilepicture', 'profile_picture'],
    remarks: ['remarks', 'remark', 'notes', 'note', 'comments', 'comment', 'remarks', 'remark', 'notes', 'note', 'comments', 'comment', 'note', 'notes'],
    course: ['course', 'coursename', 'course_name', 'program', 'programme', 'degree', 'course', 'coursename', 'course_name', 'program', 'programme', 'degree', 'programname', 'program_name', 'degreeprogram', 'degree_program'],
    current_year: ['year', 'currentyear', 'current_year', 'academicyear', 'academic_year', 'currentacademicyear', 'currentyear', 'current_year', 'year', 'academicyear', 'academic_year', 'currentacademicyear', 'academicyear', 'academic_year'],
    current_semester: ['semister', 'semester', 'currentsemester', 'current_semester', 'sem', 'currentsem', 'currentsemester', 'current_semester', 'semester', 'sem', 'currentsem', 'semester', 'sem'],
    admission_date: ['admissiondate', 'admission_date', 'admitdate', 'admit_date', 'enrollmentdate', 'enrollment_date', 'admissiondate', 'admission_date', 'admitdate', 'admit_date', 'enrollmentdate', 'enrollment_date', 'dateofadmission', 'date_of_admission'],
    branch_code: ['branchcode', 'branch_code', 'deptcode', 'dept_code', 'departmentcode', 'department_code', 'branchcode', 'branch_code', 'deptcode', 'dept_code', 'departmentcode', 'department_code'],
    course_code: ['coursecode', 'course_code', 'programcode', 'program_code', 'coursecode', 'course_code', 'programcode', 'program_code'],
    scholar_status: ['scholarstatus', 'scholar_status', 'scholarshipstatus', 'scholarship_status', 'scholarship', 'scholarstatus', 'scholar_status', 'scholarshipstatus', 'scholarship_status', 'scholarship', 'scholarshipstatus', 'scholarship_status']
  };

  // Build mapping from variations to database fields
  Object.entries(fieldVariations).forEach(([dbField, variations]) => {
    variations.forEach(variation => {
      const normalized = normalizeHeaderKeyForLookup(variation);
      if (normalized && !mapping[normalized]) {
        mapping[normalized] = dbField;
      }
    });
  });

  // Also add the original FIELD_MAPPING entries
  Object.entries(FIELD_MAPPING).forEach(([header, key]) => {
    const normalized = normalizeHeaderKeyForLookup(header);
    if (normalized && !mapping[normalized]) {
      mapping[normalized] = key;
    }
  });

  return mapping;
};

const FIELD_LOOKUP = createComprehensiveFieldMapping();

const buildNormalizedSet = (...values) => {
  const set = new Set();
  values
    .filter((value) => value !== undefined && value !== null && value !== '')
    .forEach((value) => {
      const normalized = normalizeIdentifier(value);
      if (normalized) {
        set.add(normalized);
      }
    });
  return set;
};

const sanitizeCellValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  // Helper to format any valid Date object/timestamp to IST YYYY-MM-DD
  const toISTDateString = (dateObj) => {
    return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  if (value instanceof Date) {
    return toISTDateString(value);
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toString();
  }

  const str = value.toString().trim();
  if (str === '') return '';

  // Attempt to parse string as date matches first (specific formats)
  // standard YYYY-MM-DD
  const yyyymmdd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
  }

  // Indian format DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  // Try generic parsing last
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    // Force IST conversion for generic parsed dates (e.g. ISO strings with time)
    return toISTDateString(parsed);
  }

  return str;
};

const normalizeAdmissionNumber = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return value.toString().trim().toUpperCase();
};

const getFirstNonEmpty = (...values) =>
  values.find((value) => value !== undefined && value !== null && `${value}`.trim() !== '');

// Data conversion functions to handle various input formats
const convertDate = (value) => {
  if (!value || value === '') return '';

  const str = value.toString().trim();
  if (!str) return '';

  // Handle Excel date serial numbers
  if (typeof value === 'number' && value > 25569) {
    // Excel date serial number (days since 1900-01-01)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Handle Date objects
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Handle DD-Month-YYYY format (e.g., 09-Sep-2003)
  const monthNames = {
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
    'sep': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12'
  };

  const ddmonyyyy = str.match(/^(\d{1,2})[-/.\s]+([a-z]+)[-/.\s]+(\d{4})$/i);
  if (ddmonyyyy) {
    const day = ddmonyyyy[1].padStart(2, '0');
    const monthName = ddmonyyyy[2].toLowerCase();
    const year = ddmonyyyy[3];
    const month = monthNames[monthName];
    if (month) {
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime()) && date.getFullYear() == year) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Handle YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD (ISO format - highest priority)
  const yyyymmdd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    // Validate date
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime()) && date.getFullYear() == year) {
      return `${year}-${month}-${day}`;
    }
  }

  // Handle DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (Indian format - second priority)
  const ddmmyyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    // Validate date (check if day <= 31 and month <= 12)
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    if (dayNum <= 31 && monthNum <= 12) {
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime()) && date.getFullYear() == year) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Handle MM-DD-YYYY, MM/DD/YYYY, MM.DD.YYYY (US format - last priority)
  // Only try if DD-MM-YYYY didn't match or was invalid
  const mmddyyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mmddyyyy && !ddmmyyyy) {
    const month = mmddyyyy[1].padStart(2, '0');
    const day = mmddyyyy[2].padStart(2, '0');
    const year = mmddyyyy[3];
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime()) && date.getFullYear() == year) {
      return `${year}-${month}-${day}`;
    }
  }

  // Try parsing as ISO date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str; // Return as-is if can't parse
};

const convertGender = (value) => {
  if (!value || value === '') return '';

  const str = value.toString().trim().toUpperCase();

  // Handle various gender formats
  if (str === 'M' || str === 'MALE' || str === 'BOY' || str === '1') {
    return 'M';
  }
  if (str === 'F' || str === 'FEMALE' || str === 'GIRL' || str === '2') {
    return 'F';
  }
  if (str === 'OTHER' || str === 'O' || str === '3') {
    return 'Other';
  }

  return str; // Return as-is if not recognized
};

const convertStudentType = (value) => {
  if (!value || value === '') return '';

  const str = value.toString().trim().toUpperCase();

  // Normalize equivalent student types
  // CQ and CONV are the same - store as CONV
  if (str === 'CQ') {
    return 'CONV';
  }
  if (str === 'CONV') {
    return 'CONV';
  }

  // MQ and MANG are the same - store as MANG
  if (str === 'MQ') {
    return 'MANG';
  }
  if (str === 'MANG') {
    return 'MANG';
  }

  // Return as-is (uppercase) for other types like LSPOT, LATER, SPOT, etc.
  return str;
};

const convertPhoneNumber = (value) => {
  if (!value || value === '') return '';

  const str = value.toString().trim();

  // Remove common phone number formatting characters
  let cleaned = str.replace(/[\s\-\(\)\.]/g, '');

  // Handle Excel number formatting (remove scientific notation)
  if (typeof value === 'number') {
    cleaned = value.toString().replace(/\.0+$/, ''); // Remove trailing .0
  }

  // Remove leading + or 0 if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith('0') && cleaned.length > 10) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;
};

const convertAdmissionNumber = (value) => {
  if (!value || value === '') return '';

  const str = value.toString().trim();

  // Handle Excel number formatting
  if (typeof value === 'number') {
    return value.toString().replace(/\.0+$/, ''); // Remove trailing .0
  }

  return str.toUpperCase(); // Convert to uppercase
};

const convertText = (value, capitalize = false) => {
  if (!value || value === '') return '';

  const str = value.toString().trim();

  if (capitalize) {
    // Capitalize first letter of each word
    return str
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return str;
};

const convertNumber = (value) => {
  if (value === undefined || value === null || value === '') return '';

  if (typeof value === 'number') {
    return value.toString();
  }

  const str = value.toString().trim();
  if (str === '') return '';

  // Remove non-numeric characters except decimal point
  const cleaned = str.replace(/[^\d.]/g, '');

  // If it's a whole number, remove decimal point
  if (cleaned.includes('.') && cleaned.endsWith('.0')) {
    return cleaned.replace(/\.0+$/, '');
  }

  return cleaned || str;
};

// Field-specific conversion function
const convertFieldValue = (fieldName, value) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const field = fieldName.toLowerCase();

  // Date fields
  if (field.includes('dob') || field.includes('date') || field.includes('birth')) {
    return convertDate(value);
  }

  // Gender field
  if (field.includes('gender') || field === 'sex' || field === 'mf' || field === 'm/f') {
    return convertGender(value);
  }

  // Student type field - check for stud_type field
  if (field === 'stud_type' || field.includes('stud_type') || field.includes('studtype') || field.includes('studenttype') || field === 'type' || field === 'category') {
    return convertStudentType(value);
  }

  // Phone number fields
  if (field.includes('mobile') || field.includes('phone') || field.includes('contact')) {
    return convertPhoneNumber(value);
  }

  // Admission number fields
  if (field.includes('admission') || field.includes('admit') || field.includes('enrollment')) {
    return convertAdmissionNumber(value);
  }

  // Name fields - capitalize
  if (field.includes('name') && !field.includes('number')) {
    return convertText(value, true);
  }

  // Number fields
  if (field.includes('year') || field.includes('semester') || field.includes('sem')) {
    return convertNumber(value);
  }

  // Aadhar number - remove spaces and convert to uppercase
  if (field.includes('adhar') || field.includes('aadhar') || field.includes('uid')) {
    return value.toString().trim().replace(/\s+/g, '').toUpperCase();
  }

  // Batch field - preserve exact value, especially numeric values like "2025"
  if (field === 'batch') {
    // If it's a number, convert to string to preserve it exactly
    if (typeof value === 'number') {
      return value.toString();
    }
    // If it's a string, just trim it
    return value.toString().trim();
  }

  // Default: trim and return
  return convertText(value);
};

// Helper function to count filled fields in a record
const countFilledFields = (sanitized) => {
  if (!sanitized || typeof sanitized !== 'object') {
    return 0;
  }

  let count = 0;
  Object.values(sanitized).forEach((value) => {
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'string' && value.trim() !== '') {
        count++;
      } else if (typeof value !== 'string') {
        count++;
      }
    }
  });

  return count;
};

const mapRowToStudentRecord = (row, rowNumber) => {
  const raw = {};
  const sanitized = {};

  Object.entries(row || {}).forEach(([header, rawValue]) => {
    if (!header || header.toString().trim() === '') {
      return;
    }

    // Store raw value
    const cleanedValue = sanitizeCellValue(rawValue);
    raw[header] = cleanedValue;

    // Normalize header and find matching database field
    const normalizedHeader = normalizeHeaderKeyForLookup(header);
    const mappedKey = FIELD_LOOKUP[normalizedHeader];

    if (mappedKey && cleanedValue !== '') {
      // Convert value based on field type
      let convertedValue = convertFieldValue(mappedKey, rawValue);

      // Ensure student type conversion is applied (double-check)
      if (mappedKey === 'stud_type' && convertedValue) {
        convertedValue = convertStudentType(convertedValue);
      }

      if (convertedValue !== '') {
        sanitized[mappedKey] = convertedValue;
      }
    }
  });

  // Handle admission number aliases
  if (sanitized.admission_no && !sanitized.admission_number) {
    sanitized.admission_number = sanitized.admission_no;
  }
  if (!sanitized.admission_no && sanitized.admission_number) {
    sanitized.admission_no = sanitized.admission_number;
  }

  // Final cleanup - remove empty values
  Object.keys(sanitized).forEach((key) => {
    const value = sanitized[key];
    if (typeof value === 'string') {
      sanitized[key] = value.trim();
      if (sanitized[key] === '') {
        delete sanitized[key];
      }
    } else if (value === null || value === undefined) {
      delete sanitized[key];
    }
  });

  return {
    rowNumber,
    raw,
    sanitized
  };
};

const fetchExistingAdmissionNumbers = async (admissionNumbers = []) => {
  const normalized = Array.from(
    new Set(
      admissionNumbers
        .map((value) => normalizeAdmissionNumber(value))
        .filter((value) => value !== '')
    )
  );

  if (normalized.length === 0) {
    return new Set();
  }

  const existingSet = new Set();
  const chunkSize = 100;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    if (chunk.length === 0) {
      continue;
    }
    const placeholders = chunk.map(() => '?').join(', ');
    const [rows] = await masterPool.query(
      `SELECT admission_number FROM students WHERE UPPER(admission_number) IN (${placeholders})`,
      chunk
    );
    rows.forEach((row) => {
      if (row && row.admission_number) {
        existingSet.add(normalizeAdmissionNumber(row.admission_number));
      }
    });
  }

  return existingSet;
};

const buildCourseBranchIndex = async (collegeId = null) => {
  let query = 'SELECT id, name, code, college_id FROM courses WHERE is_active = 1';
  let queryParams = [];

  if (collegeId !== null && collegeId !== undefined) {
    const parsedCollegeId = parseInt(collegeId, 10);
    if (!Number.isNaN(parsedCollegeId)) {
      query += ' AND college_id = ?';
      queryParams.push(parsedCollegeId);
    }
  }

  const [courses] = await masterPool.query(query, queryParams);

  const baseIndex = {
    courses: [],
    courseLookup: new Map()
  };

  if (!courses || courses.length === 0) {
    return {
      ...baseIndex,
      findCourse: () => null,
      findBranch: () => null
    };
  }

  const courseMap = new Map();

  courses.forEach((course) => {
    const entry = {
      id: course.id,
      name: course.name,
      code: course.code,
      normalizedKeys: buildNormalizedSet(course.name, course.code),
      branchLookup: new Map(),
      branches: []
    };

    courseMap.set(course.id, entry);
    baseIndex.courses.push(entry);

    entry.normalizedKeys.forEach((key) => {
      if (key) {
        baseIndex.courseLookup.set(key, entry);
      }
    });
  });

  const courseIds = courses.map((course) => course.id);
  let branchRows = [];
  if (courseIds.length > 0) {
    const [branches] = await masterPool.query(
      'SELECT id, course_id, name, code FROM course_branches WHERE is_active = 1 AND course_id IN (?)',
      [courseIds]
    );
    branchRows = branches || [];
  }

  branchRows.forEach((branch) => {
    const courseEntry = courseMap.get(branch.course_id);
    if (!courseEntry) {
      return;
    }

    const branchEntry = {
      id: branch.id,
      courseId: branch.course_id,
      name: branch.name,
      code: branch.code,
      normalizedKeys: buildNormalizedSet(branch.name, branch.code)
    };

    courseEntry.branches.push(branchEntry);

    branchEntry.normalizedKeys.forEach((key) => {
      if (key) {
        courseEntry.branchLookup.set(key, branchEntry);
      }
    });
  });

  return {
    ...baseIndex,
    findCourse: (value) => {
      const normalized = normalizeIdentifier(value);
      if (!normalized) {
        return null;
      }
      return baseIndex.courseLookup.get(normalized) || null;
    },
    findBranch: (courseEntry, value) => {
      if (!courseEntry) {
        return null;
      }
      const normalized = normalizeIdentifier(value);
      if (!normalized) {
        return null;
      }
      return courseEntry.branchLookup.get(normalized) || null;
    }
  };
};

const validateCourseBranch = (payload, courseIndex) => {
  const issues = [];

  if (!payload || typeof payload !== 'object') {
    return {
      issues: ['Invalid student payload'],
      course: null,
      branch: null
    };
  }

  const courseIdentifier = getFirstNonEmpty(
    payload.course,
    payload.course_name,
    payload.course_code
  );
  const branchIdentifier = getFirstNonEmpty(
    payload.branch,
    payload.branch_name,
    payload.branch_code
  );

  let resolvedCourse = null;
  if (!courseIdentifier) {
    issues.push('Course is required');
  } else {
    resolvedCourse =
      courseIndex.findCourse(courseIdentifier) ||
      courseIndex.findCourse(payload.course_code);
    if (!resolvedCourse) {
      issues.push(
        `Course "${courseIdentifier}" does not match any active course in the selected college`
      );
    }
  }

  let resolvedBranch = null;
  if (!branchIdentifier) {
    issues.push('Branch is required');
  } else if (resolvedCourse) {
    resolvedBranch =
      courseIndex.findBranch(resolvedCourse, branchIdentifier) ||
      courseIndex.findBranch(resolvedCourse, payload.branch_code);
    if (!resolvedBranch) {
      issues.push(
        `Branch "${branchIdentifier}" is not configured for course "${resolvedCourse.name}" in the selected college`
      );
    }
  } else if (branchIdentifier) {
    issues.push('Branch could not be validated because course is invalid');
  }

  if (resolvedCourse) {
    payload.course = resolvedCourse.name;
    if (resolvedCourse.code) {
      payload.course_code = resolvedCourse.code;
    }
  }

  if (resolvedBranch) {
    payload.branch = resolvedBranch.name;
    if (resolvedBranch.code) {
      payload.branch_code = resolvedBranch.code;
    }
  }

  return {
    issues,
    course: resolvedCourse,
    branch: resolvedBranch
  };
};

const sanitizeStudentPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const sanitized = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') {
        // Apply student type conversion if this is a stud_type field
        if (key === 'stud_type' || key.toLowerCase().includes('stud_type') || key.toLowerCase().includes('studtype')) {
          sanitized[key] = convertStudentType(trimmed);
        } else {
          sanitized[key] = trimmed;
        }
      }
      return;
    }
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      sanitized[key] = `${year}-${month}-${day}`;
      return;
    }
    sanitized[key] = value;
  });

  if (sanitized.admission_no && !sanitized.admission_number) {
    sanitized.admission_number = sanitized.admission_no;
  }
  if (!sanitized.admission_no && sanitized.admission_number) {
    sanitized.admission_no = sanitized.admission_number;
  }

  return sanitized;
};

let stagingSyncDisabled = false;
let stagingSyncWarningLogged = false;

const updateStagingStudentStage = async (admissionNumber, stage, studentData) => {
  if (!stagingPool || !stage || !admissionNumber || stagingSyncDisabled) {
    return;
  }

  try {
    await stagingPool.query(
      `UPDATE students
       SET current_year = ?, current_semester = ?, student_data = ?
       WHERE admission_number = ? OR admission_no = ?`,
      [
        stage.year,
        stage.semester,
        studentData,
        admissionNumber,
        admissionNumber
      ]
    );
  } catch (error) {
    const databaseMissing =
      error?.code === 'ER_BAD_DB_ERROR' ||
      error?.code === 'ER_NO_DB_ERROR' ||
      /unknown database/i.test(error?.message || '');

    if (databaseMissing) {
      stagingSyncDisabled = true;
      if (!stagingSyncWarningLogged) {
        stagingSyncWarningLogged = true;
        console.warn(
          'Staging database not available. Student staging updates will be skipped for this session.'
        );
      }
      return;
    }

    console.warn('Unable to update staging student stage:', error.message);
  }
};

// Helper function to check if a student has completed all years and semesters
const checkCourseCompletion = (currentStage, courseConfig) => {
  if (!courseConfig || !currentStage) {
    return false;
  }

  const { year: currentYear, semester: currentSemester } = currentStage;
  const totalYears = courseConfig.totalYears || 4;
  const DEFAULT_SEMESTERS_PER_YEAR = 2;

  // Check if student is at the final year
  if (currentYear < totalYears) {
    return false;
  }

  // Get the number of semesters for the final year
  let semestersForFinalYear = DEFAULT_SEMESTERS_PER_YEAR;

  if (courseConfig.yearSemesterConfig && Array.isArray(courseConfig.yearSemesterConfig)) {
    const yearConfig = courseConfig.yearSemesterConfig.find(y => Number(y.year) === totalYears);
    if (yearConfig && yearConfig.semesters) {
      semestersForFinalYear = Number(yearConfig.semesters);
    } else {
      semestersForFinalYear = courseConfig.semestersPerYear || DEFAULT_SEMESTERS_PER_YEAR;
    }
  } else if (courseConfig.semestersPerYear) {
    semestersForFinalYear = Number(courseConfig.semestersPerYear) || DEFAULT_SEMESTERS_PER_YEAR;
  }

  // Check if student is at the final semester of the final year
  return currentYear === totalYears && currentSemester === semestersForFinalYear;
};

const performPromotion = async ({ connection, admissionNumber, targetStage, adminId, courseConfigCache = null }) => {
  const [students] = await connection.query(
    `SELECT id, admission_number, admission_no, current_year, current_semester, course, student_data
     FROM students WHERE admission_number = ? OR admission_no = ? FOR UPDATE`,
    [admissionNumber, admissionNumber]
  );

  if (students.length === 0) {
    return { status: 'NOT_FOUND' };
  }

  const student = students[0];
  const parsedStudentData = parseJSON(student.student_data) || {};

  const currentStage = resolveStageFromData(parsedStudentData, {
    year: student.current_year || 1,
    semester: student.current_semester || 1
  });

  let nextStage = targetStage;

  if (!nextStage) {
    // Fetch course configuration if student has a course (cache per batch to reduce round trips)
    let courseConfig = null;
    if (student.course) {
      const cached = courseConfigCache?.get(student.course);
      if (cached !== undefined) {
        courseConfig = cached;
      } else {
        try {
          const [courseRows] = await connection.query(
            `SELECT total_years, semesters_per_year, year_semester_config 
             FROM courses 
             WHERE name = ? AND is_active = 1 
             LIMIT 1`,
            [student.course]
          );

          if (courseRows.length > 0) {
            const course = courseRows[0];
            courseConfig = {
              totalYears: course.total_years,
              semestersPerYear: course.semesters_per_year,
              yearSemesterConfig: course.year_semester_config
                ? (typeof course.year_semester_config === 'string'
                  ? JSON.parse(course.year_semester_config)
                  : course.year_semester_config)
                : null
            };
          }
        } catch (error) {
          console.warn('Failed to fetch course config for promotion:', error.message);
          // Continue with default behavior if course fetch fails
        } finally {
          if (courseConfigCache) {
            courseConfigCache.set(student.course, courseConfig || null);
          }
        }
      }
    }

    nextStage = getNextStage(currentStage.year, currentStage.semester, courseConfig);

    if (!nextStage) {
      // Check if student has completed all years and semesters based on course configuration
      const hasCompletedCourse = checkCourseCompletion(currentStage, courseConfig);

      if (hasCompletedCourse) {
        // Mark student as course completed
        await connection.query(
          `UPDATE students
           SET student_status = 'Course Completed', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [student.id]
        );

        // Validate admin_id exists before inserting audit log
        let validAdminId = null;
        if (adminId) {
          try {
            const [adminRows] = await connection.query(
              'SELECT id FROM admins WHERE id = ? LIMIT 1',
              [adminId]
            );
            if (adminRows.length > 0) {
              validAdminId = adminId;
            }
          } catch (adminCheckError) {
            console.warn('Failed to validate admin_id for audit log:', adminCheckError.message);
          }
        }

        await connection.query(
          `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
           VALUES (?, ?, ?, ?, ?)`,
          [
            'COURSE_COMPLETED',
            'STUDENT',
            student.admission_number || admissionNumber,
            validAdminId,
            JSON.stringify({
              stage: currentStage,
              message: 'Student has completed all years and semesters of the course'
            })
          ]
        );

        return {
          status: 'COURSE_COMPLETED',
          student,
          currentStage,
          message: 'Student has completed all years and semesters. Status updated to "Course Completed".'
        };
      }

      return { status: 'MAX_STAGE', student, currentStage };
    }
  }

  // Ensure verification flags are preserved if they exist in current data
  if (parsedStudentData.is_student_mobile_verified === undefined && student.student_data) {
    // If for some reason they aren't in the parsed data but might be in the database, 
    // we should have them already in parsedStudentData from the parseJSON call above.
  }

  applyStageToPayload(parsedStudentData, nextStage);
  const serializedStudentData = JSON.stringify(parsedStudentData);

  // Check if fee_status and registration_status columns exist
  const hasFeeStatusColumn = await columnExists('fee_status');
  const hasRegStatusColumn = await columnExists('registration_status');
  let updateQuery = `UPDATE students
     SET current_year = ?, current_semester = ?, student_data = ?, updated_at = CURRENT_TIMESTAMP`;
  const updateParams = [nextStage.year, nextStage.semester, serializedStudentData];

  // Set fee_status to 'due' when promoting
  if (hasFeeStatusColumn) {
    updateQuery += `, fee_status = 'due'`;
  }
  // Set registration_status to 'pending' when promoting
  if (hasRegStatusColumn) {
    updateQuery += `, registration_status = 'pending'`;
  }

  updateQuery += ` WHERE id = ?`;
  updateParams.push(student.id);

  await connection.query(updateQuery, updateParams);

  // Expire transport requests in MySQL
  await connection.query(
    `UPDATE transport_requests SET status = 'expired' WHERE admission_number = ? AND status = 'approved'`,
    [student.admission_number || admissionNumber]
  );

  // Expire hostel status in MongoDB
  try {
    const hostelConn = require('../config/mongoConfig').getHostelConnection();
    if (hostelConn) {
      const collection = hostelConn.collection('users');
      // Look for the student in Hostel using admissionNumber or pin_no
      const identifiers = [];
      if (student.admission_number || admissionNumber) identifiers.push(student.admission_number || admissionNumber);
      if (student.pin_no) identifiers.push(student.pin_no);
      
      if (identifiers.length > 0) {
        await collection.updateMany(
          { 
            $or: [
              { admissionNumber: { $in: identifiers } },
              { rollNumber: { $in: identifiers } }
            ],
            hostelStatus: 'Active'
          },
          { $set: { hostelStatus: 'Expired' } }
        );
      }
    }
  } catch (err) {
    console.error('Error expiring hostel status during promotion:', err);
  }

  // Validate admin_id exists before inserting audit log
  let validAdminId = null;
  if (adminId) {
    try {
      const [adminRows] = await connection.query(
        'SELECT id FROM admins WHERE id = ? LIMIT 1',
        [adminId]
      );
      if (adminRows.length > 0) {
        validAdminId = adminId;
      }
    } catch (adminCheckError) {
      console.warn('Failed to validate admin_id for audit log:', adminCheckError.message);
    }
  }

  await connection.query(
    `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      'PROMOTE',
      'STUDENT',
      student.admission_number || admissionNumber,
      validAdminId,
      JSON.stringify({
        from: currentStage,
        to: nextStage
      })
    ]
  );

  // -- CLUB FEE UPDATE LOGIC --
  try {
    // Fetch all active club memberships for this student
    const [memberships] = await connection.query(
      `SELECT cm.club_id, c.fee_type, c.membership_fee 
       FROM club_members cm
       JOIN clubs c ON cm.club_id = c.id
       WHERE cm.student_id = ? AND cm.status = 'approved'`,
      [student.id]
    );

    for (const membership of memberships) {
      const feeTypeRaw = membership.fee_type || 'Yearly';
      const feeType = feeTypeRaw.trim().toLowerCase();
      const fee = parseFloat(membership.membership_fee) || 0;

      if (fee > 0) {
        let shouldUpdate = false;

        // Semesterly: Update if semester changed (or year changed implying semester reset)
        // Check for 'semesterly' and potential user typo 'semisterly'
        if (feeType === 'semesterly' || feeType === 'semisterly') {
          if (nextStage.semester !== currentStage.semester || nextStage.year !== currentStage.year) {
            shouldUpdate = true;
          }
        }
        // Yearly: Update if year changed
        else if (feeType === 'yearly') {
          if (nextStage.year !== currentStage.year) {
            shouldUpdate = true;
          }
        }

        if (shouldUpdate) {
          await connection.query(
            `UPDATE club_members 
             SET payment_status = 'payment_due', updated_at = CURRENT_TIMESTAMP 
             WHERE club_id = ? AND student_id = ?`,
            [membership.club_id, student.id]
          );
        }
      }
    }
  } catch (clubError) {
    console.warn('Failed to update club fees on promotion:', clubError);
    // Non-fatal, proceed
  }
  // -- END CLUB FEE UPDATE LOGIC --

  return {
    status: 'SUCCESS',
    student,
    currentStage,
    nextStage,
    serializedStudentData,
    parsedStudentData
  };
};

exports.previewBulkUploadStudents = async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Excel or CSV file is required'
      });
    }

    filePath = req.file.path;

    const workbook = xlsx.readFile(filePath, { cellDates: true });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No sheets found in the uploaded file'
      });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });

    if (!rows || rows.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'No student rows found in the uploaded file'
      });
    }

    const headerRow = rows[0] || [];
    const headers = headerRow
      .map((header) => sanitizeCellValue(header))
      .filter((header) => header && header !== '__EMPTY');

    if (headers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file does not contain recognizable headers'
      });
    }

    const processedRows = [];
    for (let i = 1; i < rows.length; i++) {
      const rowValues = rows[i];
      if (!Array.isArray(rowValues)) {
        continue;
      }
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = rowValues[index];
      });
      const hasData = Object.values(rowData).some(
        (value) => sanitizeCellValue(value) !== ''
      );
      if (!hasData) {
        continue;
      }
      processedRows.push(mapRowToStudentRecord(rowData, i + 1));
    }

    if (processedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file does not contain any student data rows'
      });
    }

    const uniqueAdmissionsForLookup = Array.from(
      new Set(
        processedRows
          .map((record) => normalizeAdmissionNumber(record.sanitized.admission_number))
          .filter((value) => value)
      )
    );

    const existingAdmissions = await fetchExistingAdmissionNumbers(uniqueAdmissionsForLookup);

    // Get collegeId from request body (for multipart/form-data) or query params
    const collegeId = req.body?.collegeId || req.query?.collegeId || null;
    const courseIndex = await buildCourseBranchIndex(collegeId);

    // Fetch college name if collegeId is provided
    let collegeName = null;
    if (collegeId) {
      try {
        const masterConn = await masterPool.getConnection();
        const [collegeRows] = await masterConn.query(
          'SELECT name FROM colleges WHERE id = ?',
          [collegeId]
        );
        masterConn.release();
        if (collegeRows && collegeRows.length > 0) {
          collegeName = collegeRows[0].name;
          console.log(`Preview using college: ${collegeName} (ID: ${collegeId})`);
        }
      } catch (error) {
        console.error('Error fetching college name:', error);
      }
    }

    // Auto-assign is always enabled - auto-generate admission numbers based on academic year (batch)
    // Format: YEAR + 4-digit sequential number (e.g., 20250001, 20260001)
    // Auto-assign is always on, so always generate admission numbers
    // Group records by academic year to find max admission number per year
    const recordsByYear = new Map(); // year -> array of records without admission numbers

    processedRows.forEach((record) => {
      const normalizedAdmission = normalizeAdmissionNumber(record.sanitized.admission_number);
      if (!normalizedAdmission) {
        // Get academic year from batch field
        let academicYear = record.sanitized.batch || record.sanitized.academic_year;

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

        if (!recordsByYear.has(academicYear)) {
          recordsByYear.set(academicYear, []);
        }
        recordsByYear.get(academicYear).push(record);
      }
    });

    // For each academic year, find max admission number and generate new ones
    if (recordsByYear.size > 0) {
      const masterConn = await masterPool.getConnection();
      try {
        for (const [year, records] of recordsByYear) {
          // Query MySQL to find max admission number for this year
          // Format: YEAR0001, YEAR0002, etc.
          const yearPrefix = year.toString();
          const [existingRows] = await masterConn.query(
            `SELECT admission_number FROM students 
               WHERE admission_number REGEXP ? 
               ORDER BY admission_number DESC`,
            [`^${yearPrefix}[0-9]{4}$`]
          );

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

          // Also check current batch for duplicates
          processedRows.forEach(r => {
            const admNum = r.sanitized.admission_number;
            if (admNum && admNum.startsWith(yearPrefix) && /^\d+$/.test(admNum.substring(yearPrefix.length))) {
              const seqNum = parseInt(admNum.substring(yearPrefix.length), 10);
              if (!isNaN(seqNum) && seqNum > maxSeq) {
                maxSeq = seqNum;
              }
            }
          });

          console.log(`Academic year ${year}: Found max sequence ${maxSeq}`);

          // Generate admission numbers for records in this year
          let nextSeq = maxSeq + 1;
          records.forEach((record) => {
            const generatedAdmission = `${yearPrefix}${nextSeq.toString().padStart(4, '0')}`;
            record.sanitized.admission_number = generatedAdmission;
            record.sanitized.admission_no = generatedAdmission;
            console.log(`Generated admission number: ${generatedAdmission} for academic year ${year}`);
            nextSeq++;
          });

          console.log(`Auto-generated ${records.length} admission numbers for academic year ${year}`);
        }
      } finally {
        masterConn.release();
      }
    }

    // Track duplicates: for each admission number, find the row with most filled fields
    const admissionGroups = new Map(); // admission -> array of {rowNumber, record, filledCount}
    const duplicateRowNumbers = new Set(); // row numbers that are duplicates (not the best one)
    const bestRowMap = new Map(); // admission -> best row number

    // Group records by admission number
    processedRows.forEach((record) => {
      const normalizedAdmission = normalizeAdmissionNumber(record.sanitized.admission_number);
      if (!normalizedAdmission) {
        return;
      }

      if (!admissionGroups.has(normalizedAdmission)) {
        admissionGroups.set(normalizedAdmission, []);
      }

      const filledCount = countFilledFields(record.sanitized);
      admissionGroups.get(normalizedAdmission).push({
        rowNumber: record.rowNumber,
        record: record,
        filledCount: filledCount
      });
    });

    // For each admission number, find the row with most filled fields
    admissionGroups.forEach((rows, normalizedAdmission) => {
      if (rows.length > 1) {
        // Multiple rows with same admission number - find the one with most filled fields
        // Sort by filled count (descending), then by row number (ascending) as tiebreaker
        rows.sort((a, b) => {
          if (b.filledCount !== a.filledCount) {
            return b.filledCount - a.filledCount;
          }
          return a.rowNumber - b.rowNumber;
        });

        const bestRow = rows[0];
        bestRowMap.set(normalizedAdmission, bestRow.rowNumber);

        // Mark all other rows as duplicates
        for (let i = 1; i < rows.length; i++) {
          duplicateRowNumbers.add(rows[i].rowNumber);
        }
      } else {
        // Only one row with this admission number - it's the best one
        bestRowMap.set(normalizedAdmission, rows[0].rowNumber);
      }
    });

    const validRecords = [];
    const invalidRecords = [];

    processedRows.forEach((record) => {
      const sanitized = { ...record.sanitized };
      Object.keys(sanitized).forEach((key) => {
        if (typeof sanitized[key] === 'string') {
          sanitized[key] = sanitized[key].trim();
        }
      });

      // Sync admission_no and admission_number
      if (sanitized.admission_no && !sanitized.admission_number) {
        sanitized.admission_number = sanitized.admission_no;
      }
      if (!sanitized.admission_no && sanitized.admission_number) {
        sanitized.admission_no = sanitized.admission_number;
      }

      // Set college name from selected college if not already present in record
      if (collegeName && !sanitized.college) {
        sanitized.college = collegeName;
      }

      const issues = [];
      const normalizedAdmission = normalizeAdmissionNumber(sanitized.admission_number);

      if (!sanitized.admission_number) {
        issues.push('Admission number is required');
      }

      // Check if this row is a duplicate (not the one with most filled fields)
      if (normalizedAdmission && duplicateRowNumbers.has(record.rowNumber)) {
        const bestRowNumber = bestRowMap.get(normalizedAdmission);
        const currentFilledCount = countFilledFields(sanitized);
        const bestRecord = processedRows.find(r => r.rowNumber === bestRowNumber);
        const bestFilledCount = bestRecord ? countFilledFields(bestRecord.sanitized) : 0;

        issues.push(
          `Admission number already appears in row ${bestRowNumber} (${bestFilledCount} fields filled). This row (${currentFilledCount} fields filled) will be skipped - the row with most filled fields is kept.`
        );
      }

      if (normalizedAdmission && existingAdmissions.has(normalizedAdmission)) {
        issues.push('Admission number already exists in the master database');
      }

      if (!sanitized.student_name) {
        issues.push('Student name is required');
      }

      const courseValidation = validateCourseBranch(sanitized, courseIndex);
      if (courseValidation.issues.length > 0) {
        issues.push(...courseValidation.issues);
      }

      const resultBase = {
        rowNumber: record.rowNumber,
        rawData: record.raw,
        sanitizedData: sanitized
      };

      if (issues.length === 0) {
        validRecords.push({
          ...resultBase,
          course: courseValidation.course
            ? {
              id: courseValidation.course.id,
              name: courseValidation.course.name,
              code: courseValidation.course.code || null
            }
            : null,
          branch: courseValidation.branch
            ? {
              id: courseValidation.branch.id,
              name: courseValidation.branch.name,
              code: courseValidation.branch.code || null
            }
            : null
        });
      } else {
        invalidRecords.push({
          ...resultBase,
          issues
        });
      }
    });

    const summary = {
      totalRows: processedRows.length,
      validCount: validRecords.length,
      invalidCount: invalidRecords.length,
      existingAdmissionCount: existingAdmissions.size,
      duplicateAdmissionCount: duplicateRowNumbers.size
    };

    res.json({
      success: true,
      data: {
        summary,
        headers,
        validRecords,
        invalidRecords
      }
    });
  } catch (error) {
    console.error('Bulk student upload preview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview bulk upload data',
      error: error.message
    });
  } finally {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Unable to remove uploaded file after preview:', unlinkError.message);
      }
    }
  }
};

exports.commitBulkUploadStudents = async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];

  if (records.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No student records provided for upload'
    });
  }

  const preparedRecords = records
    .map((record) => ({
      rowNumber: record?.rowNumber,
      sanitizedData: sanitizeStudentPayload(
        record?.sanitizedData || record?.payload || record?.studentData || {}
      )
    }))
    .filter(
      (record) =>
        record.rowNumber !== undefined && Object.keys(record.sanitizedData).length > 0
    );

  if (preparedRecords.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid student records were provided'
    });
  }

  const admissionsForLookup = Array.from(
    new Set(
      preparedRecords
        .map((record) => normalizeAdmissionNumber(record.sanitizedData.admission_number))
        .filter((value) => value)
    )
  );

  const existingAdmissions = await fetchExistingAdmissionNumbers(admissionsForLookup);
  // Get collegeId from request body
  const collegeId = req.body?.collegeId || null;
  const courseIndex = await buildCourseBranchIndex(collegeId);

  // Fetch college name if collegeId is provided
  let collegeName = null;
  if (collegeId) {
    try {
      const masterConn = await masterPool.getConnection();
      const [collegeRows] = await masterConn.query(
        'SELECT name FROM colleges WHERE id = ?',
        [collegeId]
      );
      masterConn.release();
      if (collegeRows && collegeRows.length > 0) {
        collegeName = collegeRows[0].name;
        console.log(`Using college: ${collegeName} (ID: ${collegeId})`);
      }
    } catch (error) {
      console.error('Error fetching college name:', error);
    }
  }

  // Auto-assign is always enabled - auto-generate admission numbers based on academic year (batch)
  // Format: YEAR + 4-digit sequential number (e.g., 20250001, 20260001)
  // Auto-assign is always on, so always generate admission numbers
  // Group records by academic year to find max admission number per year
  const recordsByYear = new Map(); // year -> array of records without admission numbers

  preparedRecords.forEach((record) => {
    const normalizedAdmission = normalizeAdmissionNumber(record.sanitizedData.admission_number);
    if (!normalizedAdmission) {
      // Get academic year from batch field
      let academicYear = record.sanitizedData.batch || record.sanitizedData.academic_year;

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

      if (!recordsByYear.has(academicYear)) {
        recordsByYear.set(academicYear, []);
      }
      recordsByYear.get(academicYear).push(record);
    }
  });

  // For each academic year, find max admission number and generate new ones
  if (recordsByYear.size > 0) {
    const masterConn = await masterPool.getConnection();
    try {
      for (const [year, records] of recordsByYear) {
        // Query MySQL to find max admission number for this year
        // Format: YEAR0001, YEAR0002, etc.
        const yearPrefix = year.toString();
        const [existingRows] = await masterConn.query(
          `SELECT admission_number FROM students 
             WHERE admission_number REGEXP ? 
             ORDER BY admission_number DESC`,
          [`^${yearPrefix}[0-9]{4}$`]
        );

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

        // Also check current batch for duplicates
        preparedRecords.forEach(r => {
          const admNum = r.sanitizedData.admission_number;
          if (admNum && admNum.startsWith(yearPrefix) && /^\d+$/.test(admNum.substring(yearPrefix.length))) {
            const seqNum = parseInt(admNum.substring(yearPrefix.length), 10);
            if (!isNaN(seqNum) && seqNum > maxSeq) {
              maxSeq = seqNum;
            }
          }
        });

        console.log(`Academic year ${year}: Found max sequence ${maxSeq}`);

        // Generate admission numbers for records in this year
        let nextSeq = maxSeq + 1;
        records.forEach((record) => {
          const generatedAdmission = `${yearPrefix}${nextSeq.toString().padStart(4, '0')}`;
          record.sanitizedData.admission_number = generatedAdmission;
          record.sanitizedData.admission_no = generatedAdmission;
          console.log(`Generated admission number: ${generatedAdmission} for academic year ${year}`);
          nextSeq++;
        });

        console.log(`Auto-generated ${records.length} admission numbers for academic year ${year}`);
      }
    } finally {
      masterConn.release();
    }
  }

  // Track duplicates: for each admission number, find the row with most filled fields
  const admissionGroups = new Map(); // admission -> array of {rowNumber, record, filledCount}
  const duplicateRowNumbers = new Set(); // row numbers that are duplicates (not the best one)
  const bestRowMap = new Map(); // admission -> best row number

  // Group records by admission number
  preparedRecords.forEach((record) => {
    const normalizedAdmission = normalizeAdmissionNumber(record.sanitizedData.admission_number);
    if (!normalizedAdmission) {
      return;
    }

    if (!admissionGroups.has(normalizedAdmission)) {
      admissionGroups.set(normalizedAdmission, []);
    }

    const filledCount = countFilledFields(record.sanitizedData);
    admissionGroups.get(normalizedAdmission).push({
      rowNumber: record.rowNumber,
      record: record,
      filledCount: filledCount
    });
  });

  // For each admission number, find the row with most filled fields
  admissionGroups.forEach((rows, normalizedAdmission) => {
    if (rows.length > 1) {
      // Multiple rows with same admission number - find the one with most filled fields
      // Sort by filled count (descending), then by row number (ascending) as tiebreaker
      rows.sort((a, b) => {
        if (b.filledCount !== a.filledCount) {
          return b.filledCount - a.filledCount;
        }
        return a.rowNumber - b.rowNumber;
      });

      const bestRow = rows[0];
      bestRowMap.set(normalizedAdmission, bestRow.rowNumber);

      // Mark all other rows as duplicates
      for (let i = 1; i < rows.length; i++) {
        duplicateRowNumbers.add(rows[i].rowNumber);
      }
    } else {
      // Only one row with this admission number - it's the best one
      bestRowMap.set(normalizedAdmission, rows[0].rowNumber);
    }
  });

  let connection;
  const successDetails = [];
  const failedDetails = [];

  let successCount = 0;
  let failedCount = 0;

  try {
    connection = await masterPool.getConnection();

    for (const record of preparedRecords) {
      const { rowNumber } = record;
      const sanitized = { ...record.sanitizedData };
      const errors = [];

      Object.keys(sanitized).forEach((key) => {
        if (typeof sanitized[key] === 'string') {
          sanitized[key] = sanitized[key].trim();
        }
      });

      if (sanitized.admission_no && !sanitized.admission_number) {
        sanitized.admission_number = sanitized.admission_no;
      }
      if (!sanitized.admission_no && sanitized.admission_number) {
        sanitized.admission_no = sanitized.admission_number;
      }

      // Set college name from selected college if not already present in record
      if (collegeName && !sanitized.college) {
        sanitized.college = collegeName;
      }

      const normalizedAdmission = normalizeAdmissionNumber(sanitized.admission_number);

      if (!sanitized.admission_number) {
        errors.push('Admission number is required');
      }

      // Check for duplicates within the upload batch
      if (normalizedAdmission && duplicateRowNumbers.has(rowNumber)) {
        // This row is a duplicate - skip it
        const bestRowNumber = bestRowMap.get(normalizedAdmission);
        const currentFilledCount = countFilledFields(sanitized);
        const bestRecord = preparedRecords.find(r => r.rowNumber === bestRowNumber);
        const bestFilledCount = bestRecord ? countFilledFields(bestRecord.sanitizedData) : 0;

        errors.push(
          `Admission number already appears in row ${bestRowNumber} (${bestFilledCount} fields filled). This row (${currentFilledCount} fields filled) will be skipped - the row with most filled fields is kept.`
        );
      }

      if (normalizedAdmission && existingAdmissions.has(normalizedAdmission)) {
        errors.push('Admission number already exists in the master database');
      }

      if (!sanitized.student_name) {
        errors.push('Student name is required');
      }

      const courseValidation = validateCourseBranch(sanitized, courseIndex);
      if (courseValidation.issues.length > 0) {
        errors.push(...courseValidation.issues);
      }

      const rawYear = getFirstNonEmpty(
        sanitized.current_year,
        sanitized['Current Academic Year']
      );
      if (rawYear !== undefined && rawYear !== null && rawYear !== '') {
        const parsedYear = parseInt(rawYear, 10);
        if (Number.isNaN(parsedYear)) {
          errors.push('Current academic year must be a number');
        } else {
          sanitized.current_year = parsedYear;
          sanitized['Current Academic Year'] = parsedYear;
        }
      }

      const rawSemester = getFirstNonEmpty(
        sanitized.current_semester,
        sanitized['Current Semester']
      );
      if (rawSemester !== undefined && rawSemester !== null && rawSemester !== '') {
        const parsedSemester = parseInt(rawSemester, 10);
        if (Number.isNaN(parsedSemester)) {
          errors.push('Current semester must be a number');
        } else {
          sanitized.current_semester = parsedSemester;
          sanitized['Current Semester'] = parsedSemester;
        }
      }

      let resolvedStage = null;

      if (errors.length === 0) {
        try {
          resolvedStage = resolveStageFromData(sanitized, {
            year: sanitized.current_year || 1,
            semester: sanitized.current_semester || 1
          });
        } catch (stageError) {
          if (stageError.message === 'INVALID_STAGE') {
            errors.push(
              'Invalid academic stage provided. Year must be 1-4 and semester must be 1-2.'
            );
          } else {
            throw stageError;
          }
        }
      }

      if (errors.length > 0) {
        failedCount++;
        failedDetails.push({
          rowNumber,
          admissionNumber: sanitized.admission_number || null,
          errors
        });
        continue;
      }

      applyStageToPayload(sanitized, resolvedStage);

      const studentDataJson = JSON.stringify(sanitized);
      const insertColumns = ['admission_number', 'current_year', 'current_semester', 'student_data'];
      const insertPlaceholders = ['?', '?', '?', '?'];
      const insertValues = [
        sanitized.admission_number,
        resolvedStage.year,
        resolvedStage.semester,
        studentDataJson
      ];
      const updatedColumns = new Set(['admission_number', 'current_year', 'current_semester']);

      Object.entries(sanitized).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === '{}') {
          return;
        }
        const columnName = FIELD_MAPPING[key];
        if (!columnName || updatedColumns.has(columnName)) {
          return;
        }
        // Skip branch_code - it's stored in student_data JSON only, not as a column
        if (columnName === 'branch_code') {
          return;
        }
        // Skip course_code - it's stored in student_data JSON only, not as a column
        if (columnName === 'course_code') {
          return;
        }
        insertColumns.push(columnName);
        insertPlaceholders.push('?');
        insertValues.push(value);
        updatedColumns.add(columnName);
      });

      const insertQuery = `INSERT INTO students (${insertColumns.join(
        ', '
      )}) VALUES (${insertPlaceholders.join(', ')})`;

      let studentId = null;
      try {
        await connection.query(insertQuery, insertValues);
        // Get the inserted student ID
        const [insertedStudent] = await connection.query(
          'SELECT id FROM students WHERE admission_number = ?',
          [sanitized.admission_number]
        );
        if (insertedStudent.length > 0) {
          studentId = insertedStudent[0].id;
        }
      } catch (dbError) {
        if (dbError.code === 'ER_DUP_ENTRY') {
          failedCount++;
          failedDetails.push({
            rowNumber,
            admissionNumber: sanitized.admission_number,
            errors: ['Admission number already exists in the master database']
          });
          existingAdmissions.add(normalizedAdmission);
          continue;
        }
        throw dbError;
      }

      // SYNC REMARKS TO HISTORY (Bulk Upload): If remarks are present, add to history log
      if (sanitized.remarks && String(sanitized.remarks).trim() !== '') {
        try {
          const actor = req.user || req.admin;
          const getCategory = (role) => {
            switch (role) {
              case 'college_principal': return 'Principal';
              case 'college_ao': return 'AO';
              case 'branch_hod': return 'HOD';
              case 'cashier': return 'Accountant';
              case 'super_admin':
              case 'admin': return 'Admin';
              default: return 'Other';
            }
          };
          const category = getCategory(actor?.role || 'admin');
          await connection.query(
            `INSERT INTO student_remarks 
             (admission_number, remark, remark_category, student_year, student_semester, created_by, created_by_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sanitized.admission_number, String(sanitized.remarks).trim(), category, resolvedStage.year, resolvedStage.semester, actor?.id || null, actor?.username || 'Admin']
          );
        } catch (remarkErr) {
          console.error('Failed to sync remark during bulk upload:', remarkErr.message);
        }
      }

      // Generate student login credentials automatically
      if (studentId && sanitized.student_name && sanitized.student_mobile) {
        try {
          const { generateStudentCredentials } = require('../utils/studentCredentials');
          const credResult = await generateStudentCredentials(
            studentId,
            sanitized.admission_number,
            sanitized.pin_no,
            sanitized.student_name,
            sanitized.student_mobile
          );
          if (credResult.success) {
            // Log silently for bulk operations to avoid spam
            if (successCount % 50 === 0) {
              console.log(`✅ Generated credentials for ${successCount + 1} students...`);
            }
          }
        } catch (credError) {
          // Non-fatal error - don't fail the bulk upload
          console.error(`Error generating credentials for ${sanitized.admission_number}:`, credError.message);
        }
      }

      // Log action (safe)
      try {
        await connection.query(
          `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
           VALUES (?, ?, ?, ?, ?)`,
          ['BULK_UPLOAD', 'STUDENT', sanitized.admission_number, req.admin.id, studentDataJson]
        );
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
        try {
          // Retry with NULL admin
          await connection.query(
            `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
             VALUES (?, ?, ?, NULL, ?)`,
            ['BULK_UPLOAD', 'STUDENT', sanitized.admission_number, studentDataJson]
          );
        } catch (e) {
          console.error('Audit log retry failed:', e.message);
        }
      }

      await updateStagingStudentStage(
        sanitized.admission_number,
        resolvedStage,
        studentDataJson
      );

      successCount++;
      successDetails.push({
        rowNumber,
        admissionNumber: sanitized.admission_number
      });

      if (normalizedAdmission) {
        existingAdmissions.add(normalizedAdmission);
      }
    }

    res.json({
      success: true,
      message:
        successCount > 0
          ? `${successCount} student record${successCount === 1 ? '' : 's'} uploaded successfully${failedCount > 0
            ? `, ${failedCount} record${failedCount === 1 ? '' : 's'} skipped`
            : ''
          }`
          : 'No student records were uploaded',
      successCount,
      failedCount,
      skippedCount: failedCount,
      details: {
        successes: successDetails,
        failures: failedDetails
      }
    });
  } catch (error) {
    console.error('Bulk student upload commit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while saving student records',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
    if (successCount > 0) {
      clearStudentsCache();
    }
  }
};

// Get all students
exports.getAllStudents = async (req, res) => {
  try {
    const {
      search,
      limit,
      offset = 0,
      sort_by,
      sort_order,
      filter_dateFrom,
      filter_dateTo,
      filter_pinNumberStatus,
      filter_year,
      filter_semester,
      filter_batch,
      filter_college,
      filter_course,
      filter_branch,
      filter_section,
      ...otherFilters
    } = req.query;

    const fetchAll = !limit || limit === 'all';
    const pageSize = fetchAll ? null : Math.max(1, parseInt(limit, 10) || 25);
    const pageOffset = fetchAll ? 0 : Math.max(0, parseInt(offset, 10) || 0);
    const parsedFilterYear = filter_year !== undefined ? parseInt(filter_year, 10) : null;
    const parsedFilterSemester = filter_semester !== undefined ? parseInt(filter_semester, 10) : null;
    const normalizedFilterBatch =
      typeof filter_batch === 'string' && filter_batch.trim().length > 0 ? filter_batch.trim() : null;
    const normalizedFilterCollege =
      typeof filter_college === 'string' && filter_college.trim().length > 0 ? filter_college.trim() : null;
    const normalizedFilterCourse =
      typeof filter_course === 'string' && filter_course.trim().length > 0 ? filter_course.trim() : null;
    const normalizedFilterBranch =
      typeof filter_branch === 'string' && filter_branch.trim().length > 0 ? filter_branch.trim() : null;
    const normalizedFilterSection =
      typeof filter_section === 'string' && filter_section.trim().length > 0 ? filter_section.trim() : null;
    const normalizedOtherFilters = Object.keys(otherFilters)
      .sort()
      .reduce((acc, key) => {
        acc[key] = otherFilters[key];
        return acc;
      }, {});

    // Student database field filters - defined once for reuse
    const studentFieldFilters = [
      'admission_number', 'pin_no', 'stud_type', 'student_name', 'student_status',
      'scholar_status', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
      'caste', 'gender', 'father_name', 'dob', 'adhar_no', 'admission_date',
      'student_address', 'city_village', 'mandal_name', 'district',
      'previous_college', 'certificates_status', 'remarks', 'college'
    ];

    // Create cache key that includes user ID and scope to prevent cache sharing between users
    const user = req.user || req.admin;
    const userId = user ? (user.id || user.username || 'anonymous') : 'anonymous';

    // Create a scope identifier from userScope
    let scopeId = 'unrestricted';
    if (req.userScope && !req.userScope.unrestricted) {
      // Create a deterministic string from scope properties
      const scopeParts = [
        req.userScope.collegeIds?.sort().join(',') || '',
        req.userScope.courseIds?.sort().join(',') || '',
        req.userScope.branchIds?.sort().join(',') || '',
        req.userScope.allCourses ? 'allCourses' : '',
        req.userScope.allBranches ? 'allBranches' : ''
      ];
      scopeId = scopeParts.filter(p => p).join('|');
    }

    const cacheKey = fetchAll
      ? null
      : JSON.stringify({
        userId: userId,
        scopeId: scopeId,
        search: search || '',
        limit: pageSize,
        offset: pageOffset,
        filter_dateFrom: filter_dateFrom || null,
        filter_dateTo: filter_dateTo || null,
        filter_pinNumberStatus: filter_pinNumberStatus || null,
        filter_year: parsedFilterYear,
        filter_semester: parsedFilterSemester,
        filter_batch: normalizedFilterBatch,
        filter_college: normalizedFilterCollege,
        filter_course: normalizedFilterCourse,
        filter_branch: normalizedFilterBranch,
        filter_section: normalizedFilterSection,
        filters: normalizedOtherFilters
      });

    if (cacheKey) {
      const cachedResponse = studentsCache.get(cacheKey);
      if (cachedResponse) {
        return res.json(cachedResponse);
      }
    }

    let query = `
      SELECT 
        id, admission_number, admission_no, pin_no, student_name, student_data, 
        fee_status, registration_status, student_mobile, parent_mobile1, parent_mobile2, created_at, 
        student_status, course, branch, current_year, current_semester, batch, 
        certificates_status, student_address, city_village, mandal_name, district, 
        stud_type, scholar_status, gender, dob, father_name, adhar_no, admission_date, 
        previous_college, remarks, college, caste,
        CASE
          WHEN certificates_status = 'Temporary' THEN 'Temporary'
          WHEN
            ((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND 
             (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
            (certificates_status LIKE '%Verified%' OR certificates_status = 'completed') AND
            (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
            (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
            (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '')
          THEN 'Completed'
          ELSE 'pending'
        END AS registration_status_computed
      FROM students WHERE 1=1`;
    const params = [];

    // Apply user scope filtering (college/course/branch restrictions)
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        query += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    // Note: All students (including Course Completed) are now included by default
    // Student status can still be filtered using filter_student_status parameter

    if (search) {
      // Only search by student name, PIN number, and admission number
      const searchPattern = `%${search.trim()}%`;
      query += ` AND (
        admission_number LIKE ? 
        OR admission_no LIKE ? 
        OR pin_no LIKE ? 
        OR student_name LIKE ?
      )`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Date range filter
    if (filter_dateFrom) {
      query += ' AND DATE(created_at) >= ?';
      params.push(filter_dateFrom);
    }

    if (filter_dateTo) {
      query += ' AND DATE(created_at) <= ?';
      params.push(filter_dateTo);
    }

    // PIN number status filter
    if (filter_pinNumberStatus === 'assigned') {
      query += ' AND pin_no IS NOT NULL';
    } else if (filter_pinNumberStatus === 'unassigned') {
      query += ' AND pin_no IS NULL';
    }

    if (parsedFilterYear && !isNaN(parsedFilterYear)) {
      query += ' AND current_year = ?';
      params.push(parsedFilterYear);
    }

    if (parsedFilterSemester && !isNaN(parsedFilterSemester)) {
      query += ' AND current_semester = ?';
      params.push(parsedFilterSemester);
    }

    if (normalizedFilterBatch) {
      query += ' AND batch = ?';
      params.push(normalizedFilterBatch);
    }

    if (normalizedFilterCollege) {
      query += ' AND college = ?';
      params.push(normalizedFilterCollege);
    }

    if (normalizedFilterCourse) {
      query += ' AND course = ?';
      params.push(normalizedFilterCourse);
    }

    if (normalizedFilterBranch) {
      query += ' AND branch = ?';
      params.push(normalizedFilterBranch);
    }

    if (normalizedFilterSection && normalizedFilterBranch) {
      query += ` AND ${resolveStudentSectionSql()} = ?`;
      params.push(normalizedFilterSection);
    }

    // Level filter - filter by courses with the specified level
    let validLevelCourseNames = [];
    if (normalizedOtherFilters.filter_level) {
      const level = normalizedOtherFilters.filter_level;
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      validLevelCourseNames = levelCourses.map(c => c.name);
      if (validLevelCourseNames.length > 0) {
        const placeholders = validLevelCourseNames.map(() => '?').join(',');
        query += ` AND course IN (${placeholders})`;
        params.push(...validLevelCourseNames);
      } else {
        // No courses with this level, return empty result
        query += ' AND 1=0';
      }
    }

    // Student database field filters
    studentFieldFilters.forEach(field => {
      const filterKey = `filter_${field}`;
      const filterValue = normalizedOtherFilters[filterKey];
      if (filterValue && typeof filterValue === 'string' && filterValue.trim().length > 0) {
        // Special handling for null certificate status
        if (field === 'certificates_status' && filterValue.trim() === '__NULL__') {
          query += ` AND ${field} IS NULL`;
        } else {
          query += ` AND ${field} LIKE ?`;
          params.push(`%${filterValue.trim()}%`);
        }
      }
    });

    // Created at date filter
    if (normalizedOtherFilters.filter_created_at) {
      query += ' AND DATE(created_at) = ?';
      params.push(normalizedOtherFilters.filter_created_at);
    }

    // Dynamic field filters (e.g., filter_field_Admission category)
    Object.entries(normalizedOtherFilters).forEach(([key, value]) => {
      if (key.startsWith('filter_field_') && value) {
        const fieldName = key.replace('filter_field_', '');
        // Escape field name for JSON path (handle spaces and special chars)
        const escapedFieldName = fieldName.replace(/"/g, '\\"');
        query += ` AND JSON_UNQUOTE(JSON_EXTRACT(student_data, '$."${escapedFieldName}"')) = ?`;
        params.push(value);
      }
    });

    const normalizedSortBy = typeof sort_by === 'string' ? sort_by.trim().toLowerCase() : '';
    const normalizedSortOrder = typeof sort_order === 'string' ? sort_order.trim().toLowerCase() : 'asc';
    const safeSortOrder = normalizedSortOrder === 'desc' ? 'DESC' : 'ASC';

    if (normalizedSortBy === 'roll_number') {
      query += ` ORDER BY
        CASE WHEN pin_no IS NULL OR TRIM(pin_no) = '' THEN 1 ELSE 0 END ASC,
        CASE WHEN pin_no REGEXP '^[0-9]+$' THEN 0 ELSE 1 END ASC,
        CASE WHEN pin_no REGEXP '^[0-9]+$' THEN CAST(pin_no AS UNSIGNED) END ${safeSortOrder},
        pin_no ${safeSortOrder},
        admission_number ${safeSortOrder},
        id ${safeSortOrder}`;
    } else {
      query += ' ORDER BY id DESC';
    }
    if (!fetchAll) {
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, pageOffset);
    }

    const [students] = await masterPool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM students WHERE 1=1';
    const countParams = [];

    // Apply user scope filtering to count query
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        countQuery += ` AND ${scopeCondition}`;
        countParams.push(...scopeParams);
      }
    }

    if (search) {
      // Only search by student name, PIN number, and admission number (matching main query)
      const searchPattern = `%${search}%`;
      countQuery += ` AND (
        admission_number LIKE ? 
        OR admission_no LIKE ? 
        OR pin_no LIKE ? 
        OR student_name LIKE ?
      )`;
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Apply same filters to count query
    if (filter_dateFrom) {
      countQuery += ' AND DATE(created_at) >= ?';
      countParams.push(filter_dateFrom);
    }

    if (filter_dateTo) {
      countQuery += ' AND DATE(created_at) <= ?';
      countParams.push(filter_dateTo);
    }

    if (filter_pinNumberStatus === 'assigned') {
      countQuery += ' AND pin_no IS NOT NULL';
    } else if (filter_pinNumberStatus === 'unassigned') {
      countQuery += ' AND pin_no IS NULL';
    }

    if (parsedFilterYear && !isNaN(parsedFilterYear)) {
      countQuery += ' AND current_year = ?';
      countParams.push(parsedFilterYear);
    }

    if (parsedFilterSemester && !isNaN(parsedFilterSemester)) {
      countQuery += ' AND current_semester = ?';
      countParams.push(parsedFilterSemester);
    }

    if (normalizedFilterBatch) {
      countQuery += ' AND batch = ?';
      countParams.push(normalizedFilterBatch);
    }

    if (normalizedFilterCollege) {
      countQuery += ' AND college = ?';
      countParams.push(normalizedFilterCollege);
    }

    if (normalizedFilterCourse) {
      countQuery += ' AND course = ?';
      countParams.push(normalizedFilterCourse);
    }

    if (normalizedFilterBranch) {
      countQuery += ' AND branch = ?';
      countParams.push(normalizedFilterBranch);
    }

    if (normalizedFilterSection && normalizedFilterBranch) {
      countQuery += ` AND ${resolveStudentSectionSql()} = ?`;
      countParams.push(normalizedFilterSection);
    }

    // Level filter for count query - reuse the same validLevelCourseNames
    if (normalizedOtherFilters.filter_level) {
      if (validLevelCourseNames.length > 0) {
        const placeholders = validLevelCourseNames.map(() => '?').join(',');
        countQuery += ` AND course IN (${placeholders})`;
        countParams.push(...validLevelCourseNames);
      } else {
        // No courses with this level, return empty result
        countQuery += ' AND 1=0';
      }
    }

    // Student database field filters for count query
    studentFieldFilters.forEach(field => {
      const filterKey = `filter_${field}`;
      const filterValue = normalizedOtherFilters[filterKey];
      if (filterValue && typeof filterValue === 'string' && filterValue.trim().length > 0) {
        // Special handling for null certificate status
        if (field === 'certificates_status' && filterValue.trim() === '__NULL__') {
          countQuery += ` AND ${field} IS NULL`;
        } else {
          countQuery += ` AND ${field} LIKE ?`;
          countParams.push(`%${filterValue.trim()}%`);
        }
      }
    });

    // Created at date filter for count query
    if (normalizedOtherFilters.filter_created_at) {
      countQuery += ' AND DATE(created_at) = ?';
      countParams.push(normalizedOtherFilters.filter_created_at);
    }

    // Apply dynamic field filters to count query
    Object.entries(normalizedOtherFilters).forEach(([key, value]) => {
      if (key.startsWith('filter_field_') && value) {
        const fieldName = key.replace('filter_field_', '');
        // Escape field name for JSON path (handle spaces and special chars)
        const escapedFieldName = fieldName.replace(/"/g, '\\"');
        countQuery += ` AND JSON_UNQUOTE(JSON_EXTRACT(student_data, '$."${escapedFieldName}"')) = ?`;
        countParams.push(value);
      }
    });

    const [countResult] = await masterPool.query(countQuery, countParams);

    const admissionNumbers = students.map(s => s.admission_number).filter(Boolean);
    const pinNumbers = students.map(s => s.pin_no).filter(Boolean);
    
    // Fetch Transport status from MySQL transport_requests table
    let transportStudents = new Set();
    if (admissionNumbers.length > 0) {
      try {
        const adNumPlaceholders = admissionNumbers.map(() => '?').join(',');
        const [transReqs] = await masterPool.query(
          `SELECT admission_number FROM transport_requests WHERE status = 'approved' AND admission_number IN (${adNumPlaceholders})`,
          [...admissionNumbers]
        );
        transReqs.forEach(req => transportStudents.add(req.admission_number));
      } catch (err) {
        console.error('Error fetching transport requests:', err);
      }
    }

    // Fetch Hostel status from Hostel MongoDB users collection
    let hostelStudents = new Set();
    try {
      const hostelConn = require('../config/mongoConfig').getHostelConnection();
      if (hostelConn && (admissionNumbers.length > 0 || pinNumbers.length > 0)) {
        const collection = hostelConn.collection('users');
        const query = {
          $or: [
            { admissionNumber: { $in: admissionNumbers } },
            { rollNumber: { $in: pinNumbers } }
          ],
          hostelStatus: 'Active'
        };
        const hostelUsers = await collection.find(query).toArray();
        
        hostelUsers.forEach(user => {
          if (user.admissionNumber) hostelStudents.add(user.admissionNumber);
          if (user.rollNumber) hostelStudents.add(user.rollNumber);
        });
      }
    } catch (err) {
      console.error('Error fetching hostel users:', err);
    }

    // Parse JSON fields
    const parsedStudents = students.map(student => {
      const parsedData = parseJSON(student.student_data) || {};
      const stage = resolveStageFromData(parsedData, {
        year: student.current_year || 1,
        semester: student.current_semester || 1
      });

      applyStageToPayload(parsedData, stage);

      // Resolve fee_status and registration_status to top-level fields
      const resolvedFeeStatus = (student.fee_status && String(student.fee_status).trim().length > 0)
        ? student.fee_status
        : (parsedData?.fee_status || parsedData?.['Fee Status'] || null);

      // Prefer the DB registration_status column if it's 'Completed'
      // Otherwise use the computed status or fallbacks
      const dbRegistrationStatus = (student.registration_status && String(student.registration_status).trim().length > 0)
        ? student.registration_status
        : (parsedData?.registration_status || parsedData?.['Registration Status'] || null);

      const resolvedRegistrationStatus = (dbRegistrationStatus && String(dbRegistrationStatus).toLowerCase() === 'completed')
        ? 'Completed'
        : (student.registration_status_computed || dbRegistrationStatus || 'pending');

      // Normalize scholarship status - empty/null should show as "Pending"
      const rawScholarStatus = student.scholar_status || parsedData?.scholar_status || parsedData?.['Scholar Status'] || '';
      const normalizedScholarStatus = (rawScholarStatus && String(rawScholarStatus).trim().length > 0 &&
        rawScholarStatus.toLowerCase() !== 'null' && rawScholarStatus.toLowerCase() !== 'undefined')
        ? rawScholarStatus
        : 'Pending';

      // Determine accommodation
      let accommodation = 'Own Transport';
      if (hostelStudents.has(student.admission_number) || (student.pin_no && hostelStudents.has(student.pin_no))) {
        accommodation = 'Hostel';
      } else if (transportStudents.has(student.admission_number)) {
        accommodation = 'Transport';
      }

      return {
        ...student,
        current_year: stage.year,
        current_semester: stage.semester,
        dob: sanitizeCellValue(student.dob),
        admission_date: sanitizeCellValue(student.admission_date),
        student_data: parsedData,
        fee_status: resolvedFeeStatus,
        registration_status: resolvedRegistrationStatus,
        scholar_status: normalizedScholarStatus,
        accommodation: accommodation
      };
    });

    const totalCount = countResult?.[0]?.total || 0;
    const totalPages = fetchAll ? 1 : (pageSize > 0 ? Math.ceil(totalCount / pageSize) : 1);

    const responsePayload = {
      success: true,
      data: parsedStudents,
      pagination: {
        total: totalCount,
        limit: fetchAll ? null : pageSize,
        offset: fetchAll ? 0 : pageOffset,
        totalPages: totalPages,
        currentPage: fetchAll ? 1 : Math.floor(pageOffset / pageSize) + 1
      }
    };

    if (cacheKey) {
      studentsCache.set(cacheKey, responsePayload);
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching students'
    });
  }
};

// Get student by admission number
exports.getStudentByAdmission = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    const [students] = await masterPool.query(
      `SELECT s.*,
              srn.roll_number AS roll_number,
              srn.branch_prefix AS roll_branch_prefix,
              srn.serial AS roll_serial,
        CASE
          WHEN s.certificates_status = 'Temporary' THEN 'Temporary'
          WHEN
            (s.student_data LIKE '%"is_student_mobile_verified":true%' AND s.student_data LIKE '%"is_parent_mobile_verified":true%') AND
            (s.certificates_status LIKE '%Verified%' OR s.certificates_status = 'completed') AND
            (s.fee_status LIKE '%no_due%' OR s.fee_status LIKE '%no due%' OR s.fee_status LIKE '%permitted%' OR s.fee_status LIKE '%completed%' OR s.fee_status LIKE '%nodue%') AND
            (s.current_year IS NOT NULL AND s.current_year != '' AND s.current_semester IS NOT NULL AND s.current_semester != '') AND
            (s.scholar_status IS NOT NULL AND TRIM(IFNULL(s.scholar_status,'')) != '')
          THEN 'Completed'
          ELSE 'pending'
        END AS registration_status_computed
      FROM students s
      LEFT JOIN student_roll_numbers srn ON srn.student_id = s.id
      WHERE s.admission_number = ? OR s.admission_no = ?`,
      [admissionNumber, admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const parsedData = parseJSON(students[0].student_data) || {};
    const stage = resolveStageFromData(parsedData, {
      year: students[0].current_year || 1,
      semester: students[0].current_semester || 1
    });

    applyStageToPayload(parsedData, stage);

    // Normalize scholarship status - empty/null should show as "Pending"
    const rawScholarStatus = students[0].scholar_status || parsedData?.scholar_status || parsedData?.['Scholar Status'] || '';
    const normalizedScholarStatus = (rawScholarStatus && String(rawScholarStatus).trim().length > 0 &&
      rawScholarStatus.toLowerCase() !== 'null' && rawScholarStatus.toLowerCase() !== 'undefined')
      ? rawScholarStatus
      : 'Pending';

    const student = {
      ...students[0],
      current_year: stage.year,
      current_semester: stage.semester,
      student_data: parsedData,
      // Ensure top-level fee/registration statuses are available even if columns are empty
      dob: sanitizeCellValue(students[0].dob),
      admission_date: sanitizeCellValue(students[0].admission_date),
      fee_status: (students[0].fee_status && String(students[0].fee_status).trim().length > 0)
        ? students[0].fee_status
        : (parsedData?.fee_status || parsedData?.['Fee Status'] || null),
      registration_status: students[0].registration_status_computed ||
        ((students[0].registration_status && String(students[0].registration_status).trim().length > 0)
          ? students[0].registration_status
          : (parsedData?.registration_status || parsedData?.['Registration Status'] || null)),
      scholar_status: normalizedScholarStatus
    };

    // Derive fee status from student_fees for the student's current year and semester
    // This ensures the portal reflects the latest payments even if the top-level column isn't updated
    try {
      const studentId = students[0].id;
      const currentYear = stage.year;
      const currentSemester = stage.semester;

      // Fetch fee records for the current stage
      const [feeRows] = await masterPool.query(
        `SELECT amount, paid_amount, payment_status
         FROM student_fees
         WHERE student_id = ? AND year = ? AND semester = ?`,
        [studentId, currentYear, currentSemester]
      );

      if (Array.isArray(feeRows) && feeRows.length > 0) {
        let allPaid = true;
        let anyPaidOrPartial = false;

        for (const row of feeRows) {
          const amountVal = parseFloat(row.amount) || 0;
          const paidVal = parseFloat(row.paid_amount) || 0;
          const status = String(row.payment_status || '').toLowerCase();

          const isPaid = status === 'paid' || paidVal >= amountVal;
          const isPartial = status === 'partial' || (paidVal > 0 && paidVal < amountVal);

          if (!isPaid) {
            allPaid = false;
          }
          if (isPaid || isPartial) {
            anyPaidOrPartial = true;
          }
        }

        let derivedStatus = 'pending';
        if (allPaid) {
          derivedStatus = 'completed';
        } else if (anyPaidOrPartial) {
          derivedStatus = 'partially_completed';
        }

        // Prefer derived status when fee records exist for the current stage
        student.fee_status = derivedStatus;
      }
    } catch (deriveError) {
      console.error('Failed to derive fee status from student_fees:', deriveError);
      // Keep existing fee_status fallback if derivation fails
    }

    // Fetch today's attendance (IST)
    try {
      const formattedDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const [attendanceRows] = await masterPool.query(
        'SELECT status FROM attendance_records WHERE student_id = ? AND attendance_date = ?',
        [students[0].id, formattedDate]
      );

      student.today_attendance_status = attendanceRows.length > 0 ? attendanceRows[0].status : 'Not Marked';
    } catch (attendanceError) {
      console.error('Failed to fetch attendance status:', attendanceError);
      student.today_attendance_status = 'Not Available';
    }

    res.json({
      success: true,
      data: student
    });

  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching student'
    });
  }
};

// Update student data
exports.updateStudent = async (req, res) => {
  try {
    const { admissionNumber } = req.params;
    const { studentData } = req.body;

    if (!studentData || typeof studentData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Student data is required'
      });
    }

    const incomingPhotoProbe =
      studentData.student_photo || studentData['Student Photo'];
    const needsPhotoColumn =
      typeof incomingPhotoProbe === 'string' &&
      incomingPhotoProbe.startsWith('data:image/');

    const selectColumns = await getStudentUpdateFetchColumns(needsPhotoColumn);

    const [existingStudents] = await masterPool.query(
      `SELECT ${selectColumns} FROM students WHERE admission_number = ?`,
      [admissionNumber]
    );

    if (existingStudents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const existingStudent = existingStudents[0];
    const currentStudent = existingStudent;
    const currentStudentData = parseJSON(currentStudent.student_data) || {};
    // Extract actual batch from DB column or JSON field
    const studentBatch = currentStudent.batch || currentStudentData.batch || currentStudentData.Batch || currentStudentData.BATCH;

    // Check if the student's batch is frozen
    if (studentBatch) {
      try {
        const [settings] = await masterPool.query(
          'SELECT value FROM settings WHERE `key` = ?',
          ['frozen_batches']
        );

        if (settings && settings.length > 0) {
          const storedConfig = JSON.parse(settings[0].value);
          let frozenBatches = {};

          if (Array.isArray(storedConfig)) {
            storedConfig.forEach(batch => { frozenBatches[batch] = ["ALL"]; });
          } else if (typeof storedConfig === 'object' && storedConfig !== null) {
            frozenBatches = storedConfig;
          }

          if (frozenBatches[String(studentBatch)]) {
            const frozenFields = frozenBatches[String(studentBatch)];

            if (frozenFields.includes("ALL")) {
              return res.status(403).json({
                success: false,
                message: `Update failed: The batch '${studentBatch}' is currently frozen.`
              });
            }

            // Strip frozen fields from the incoming data instead of blocking the entire update
            if (studentData && typeof studentData === 'object') {
              const incomingFields = Object.keys(studentData);
              const overlappingFields = incomingFields.filter(field => frozenFields.includes(field));

              if (overlappingFields.length > 0) {
                // Remove frozen fields from the update payload silently
                overlappingFields.forEach(field => {
                  delete studentData[field];
                });
                console.log(`⚠️ Stripped frozen fields from update for batch '${studentBatch}': ${overlappingFields.join(', ')}`);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking frozen batches:', err);
        // Continue if checking fails to avoid blocking legitimate saves due to a parsing error
      }
    }


    // Extract new PIN if provided to check for uniqueness
    let newPinNo = null;
    if (studentData && typeof studentData === 'object') {
      for (const [key, value] of Object.entries(studentData)) {
        const normalizedKey = normalizeHeaderKeyForLookup(key);
        if (FIELD_LOOKUP[normalizedKey] === 'pin_no' && value) {
          newPinNo = String(value).trim();
          break;
        }
      }
    }

    if (newPinNo && newPinNo !== currentStudent.pin_no) {
      const [existingPin] = await masterPool.query(
        'SELECT admission_number FROM students WHERE pin_no = ? AND admission_number != ?',
        [newPinNo, admissionNumber]
      );

      if (existingPin.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Update failed: The PIN number '${newPinNo}' is already assigned to another student (Admission: ${existingPin[0].admission_number}).`
        });
      }
    }


    // SECURITY: Define protected columns that cannot be updated via this generic endpoint.
    // These fields must be updated via their dedicated endpoints or are immutable/system-managed.
    const PROTECTED_COLUMNS = [
      'admission_number',
      'admission_no',
      'id',
      'created_at',
      'updated_at'
    ];

    // Strip system/metadata fields (often copied into student_data from imports) before merge
    if (studentData && typeof studentData === 'object') {
      const cleanedIncoming = cleanStudentMetadata(studentData);
      Object.keys(studentData).forEach((key) => delete studentData[key]);
      Object.assign(studentData, cleanedIncoming);

      const protectedSet = new Set(PROTECTED_COLUMNS);
      Object.keys(studentData).forEach((key) => {
        const mappedColumn = FIELD_MAPPING[key];
        if (protectedSet.has(mappedColumn) || protectedSet.has(key)) {
          delete studentData[key];
        }
      });
    }

    const incomingFieldCount = Object.keys(studentData).length;
    console.log(
      `Update student ${admissionNumber}: ${incomingFieldCount} field(s) in request`
    );

    // Parse existing student_data to merge with incoming data
    const existingStudentData = cleanStudentMetadata(parseJSON(existingStudent.student_data) || {});

    // Map form field names to database columns
    // Build update query for individual columns
    const updateFields = [];
    const updateValues = [];

    // Merge incoming data with existing data (incoming takes precedence)
    const mutableStudentData = { ...existingStudentData };

    // Clean up the incoming studentData too
    const incomingStudentData = cleanStudentMetadata(studentData);

    const clearedColumns = new Set();
    Object.keys(incomingStudentData).forEach(incomingKey => {
      const normalizedIncoming = normalizeHeaderKeyForLookup(incomingKey);
      const incomingCol = FIELD_LOOKUP[normalizedIncoming];

      if (incomingCol && !clearedColumns.has(incomingCol)) {
        // Remove all variations of this column from existing data to ensure the new one takes over
        // But only do this ONCE per column, preventing multiple incoming variations from overwriting each other
        Object.keys(mutableStudentData).forEach(existingKey => {
          const normalizedExisting = normalizeHeaderKeyForLookup(existingKey);
          if (FIELD_LOOKUP[normalizedExisting] === incomingCol) {
            delete mutableStudentData[existingKey];
          }
        });
        clearedColumns.add(incomingCol);
      }

      // Set the new value
      mutableStudentData[incomingKey] = incomingStudentData[incomingKey];
    });

    // Check if mobile numbers have changed and reset verification status if needed
    const oldStudentMobile = existingStudent.student_mobile || existingStudentData.student_mobile || existingStudentData['Student Mobile number'] || existingStudentData['Student Mobile Number'] || '';
    const newStudentMobile = studentData.student_mobile || studentData['Student Mobile number'] || studentData['Student Mobile Number'] || mutableStudentData.student_mobile || '';

    const oldParentMobile = existingStudent.parent_mobile1 || existingStudentData.parent_mobile1 || existingStudentData['Parent Mobile Number 1'] || '';
    const newParentMobile = studentData.parent_mobile1 || studentData['Parent Mobile Number 1'] || mutableStudentData.parent_mobile1 || '';

    // Normalize mobile numbers for comparison (remove spaces, dashes, etc.)
    const normalizeMobile = (mobile) => {
      if (!mobile) return '';
      return String(mobile).replace(/[\s\-\(\)]/g, '');
    };

    const normalizedOldStudentMobile = normalizeMobile(oldStudentMobile);
    const normalizedNewStudentMobile = normalizeMobile(newStudentMobile);
    const normalizedOldParentMobile = normalizeMobile(oldParentMobile);
    const normalizedNewParentMobile = normalizeMobile(newParentMobile);

    // If student mobile number changed, reset student mobile verification
    if (normalizedNewStudentMobile && normalizedNewStudentMobile !== normalizedOldStudentMobile) {
      mutableStudentData.is_student_mobile_verified = false;
      console.log(`🔄 Student mobile number changed for ${admissionNumber}. Resetting student mobile verification status.`);
    }

    // If parent mobile number changed, reset parent mobile verification
    if (normalizedNewParentMobile && normalizedNewParentMobile !== normalizedOldParentMobile) {
      mutableStudentData.is_parent_mobile_verified = false;
      console.log(`🔄 Parent mobile number changed for ${admissionNumber}. Resetting parent mobile verification status.`);
    }

    let resolvedStage;
    try {
      resolvedStage = resolveStageFromData(mutableStudentData, {
        year: existingStudent.current_year || 1,
        semester: existingStudent.current_semester || 1
      });
    } catch (error) {
      if (error.message === 'INVALID_STAGE') {
        return res.status(400).json({
          success: false,
          message: 'Invalid academic stage provided. Year must be 1-4 and semester must be 1-2.'
        });
      }
      throw error;
    }

    applyStageToPayload(mutableStudentData, resolvedStage);

    // Ensure previous college is added to the list if manually entered
    if (mutableStudentData.previous_college) {
      await ensurePreviousCollegeExists(mutableStudentData.previous_college);
    } else if (mutableStudentData['Previous College Name']) {
      await ensurePreviousCollegeExists(mutableStudentData['Previous College Name']);
    }

    const updatedColumns = new Set();
    // Allow clearing statuses (set to NULL) via inline dropdowns
    const allowEmptyUpdates = new Set([
      'scholar_status',
      'student_status',
      'registration_status',
      'fee_status',
      'certificates_status'
    ]);

    const sideEffectJsonKeys = new Set();
    if (normalizedNewStudentMobile && normalizedNewStudentMobile !== normalizedOldStudentMobile) {
      sideEffectJsonKeys.add('is_student_mobile_verified');
    }
    if (normalizedNewParentMobile && normalizedNewParentMobile !== normalizedOldParentMobile) {
      sideEffectJsonKeys.add('is_parent_mobile_verified');
    }

    const columnKeysToProcess = new Set(Object.keys(incomingStudentData));
    sideEffectJsonKeys.forEach((k) => columnKeysToProcess.add(k));

    if (
      Number(resolvedStage.year) !== Number(existingStudent.current_year) ||
      Number(resolvedStage.semester) !== Number(existingStudent.current_semester)
    ) {
      updateFields.push('current_year = ?', 'current_semester = ?');
      updateValues.push(resolvedStage.year, resolvedStage.semester);
      updatedColumns.add('current_year');
      updatedColumns.add('current_semester');
    }

    for (const key of columnKeysToProcess) {
      if (!(key in mutableStudentData)) {
        continue;
      }
      const value = mutableStudentData[key];
      const normalizedKey = normalizeHeaderKeyForLookup(key);
      const columnName = FIELD_LOOKUP[normalizedKey];

      if (columnName === 'current_year' || columnName === 'current_semester') {
        continue;
      }

      const isExplicitUpdate =
        Object.keys(incomingStudentData).some(
          (k) => normalizeHeaderKeyForLookup(k) === normalizedKey
        ) || sideEffectJsonKeys.has(key);

      const hasNonEmptyValue = value !== undefined && value !== '' && value !== '{}' && value !== null;
      const shouldAllowEmptyUpdate = columnName && (
        (allowEmptyUpdates.has(columnName) && (value === '' || value === null)) ||
        (isExplicitUpdate && (value === '' || value === null))
      );

      if (
        columnName &&
        !updatedColumns.has(columnName) &&
        (hasNonEmptyValue || shouldAllowEmptyUpdate)
      ) {
        // Skip updating missing status columns when they don't exist in schema
        if (columnName === 'registration_status' || columnName === 'fee_status') {
          const exists = await columnExists(columnName);
          if (!exists) {
            // Still stored into student_data JSON later; skip column update
            continue;
          }
        }

        // SECURITY: Block updates to sensitive/protected fields via this generic endpoint
        // These fields must be updated via their dedicated endpoints (e.g., updateFeeStatus, updateRegistrationStatus)
        // or are immutable (admission_number)
        if (PROTECTED_COLUMNS.includes(columnName)) {
          // Skip silently or with verbose logging if needed (sanitization occurred earlier)
          continue;
        }

        // Convert values for specific column types
        let convertedValue = value;
        if (shouldAllowEmptyUpdate) {
          convertedValue = null;
          mutableStudentData[key] = null;
        }

        // Handle gender ENUM conversion - must match MySQL ENUM('M', 'F', 'Other')
        if (columnName === 'gender') {
          if (value && typeof value === 'string' && value.trim() !== '') {
            const genderStr = value.toString().trim().toUpperCase();
            if (genderStr === 'M' || genderStr === 'MALE' || genderStr === 'BOY' || genderStr === '1') {
              convertedValue = 'M';
            } else if (genderStr === 'F' || genderStr === 'FEMALE' || genderStr === 'GIRL' || genderStr === '2') {
              convertedValue = 'F';
            } else if (genderStr === 'OTHER' || genderStr === 'O' || genderStr === '3') {
              convertedValue = 'Other';
            } else {
              // Skip invalid gender values to prevent ENUM errors
              continue;
            }
          } else {
            // Skip empty gender values
            continue;
          }
        }

        // Handle year/semester as integers
        if (columnName === 'current_year' || columnName === 'current_semester') {
          convertedValue = parseInt(value, 10) || 1;
        }

        if (columnName === 'branch_code' || columnName === 'course_code') {
          continue; // Skip these as they are stored in student_data JSON only
        }

        updateFields.push(`${columnName} = ?`);
        updateValues.push(convertedValue);
        updatedColumns.add(columnName);
      }
    }

    // Prepare JSON data (exclude large photo data to prevent bloating)
    const dataForJson = { ...mutableStudentData };
    if (dataForJson.student_photo && typeof dataForJson.student_photo === 'string' && dataForJson.student_photo.startsWith('data:image/')) {
      // Don't store base64 photo in JSON, it's already in the dedicated column
      delete dataForJson.student_photo;
    }
    if (dataForJson['Student Photo'] && typeof dataForJson['Student Photo'] === 'string' && dataForJson['Student Photo'].startsWith('data:image/')) {
      delete dataForJson['Student Photo'];
    }

    const serializedStudentData = JSON.stringify(dataForJson);
    const studentDataChanged = !jsonPayloadsEqual(dataForJson, existingStudentData);
    if (studentDataChanged) {
      updateFields.push('student_data = ?');
      updateValues.push(serializedStudentData);
    }

    if (updateFields.length === 0) {
      return res.json({
        success: true,
        message: 'No changes detected'
      });
    }

    updateValues.push(admissionNumber);

    // Execute the update query
    const [result] = await masterPool.query(
      `UPDATE students SET ${updateFields.join(', ')} WHERE admission_number = ?`,
      updateValues
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get PIN number for logging
    const pinNo = existingStudent.pin_no || null;
    const hasPhotoUpdate = mutableStudentData.student_photo || mutableStudentData['Student Photo'];

    // Log update with PIN number, especially if photo was updated
    if (hasPhotoUpdate) {
      const logMessage = pinNo
        ? `✅ Student details updated (Photo updated) - PIN: ${pinNo}, Admission: ${admissionNumber}`
        : `✅ Student details updated (Photo updated) - Admission: ${admissionNumber}`;
      console.log(logMessage);
    } else {
      const logMessage = pinNo
        ? `✅ Student details updated - PIN: ${pinNo}, Admission: ${admissionNumber}`
        : `✅ Student details updated - Admission: ${admissionNumber}`;
      console.log(logMessage);
    }

    // Build a field-level diff for the audit log — only include truly changed values
    const TRACKED_COLUMNS = [
      'student_name', 'father_name', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
      'student_address', 'city_village', 'mandal_name', 'district', 'previous_college',
      'student_status', 'fee_status', 'certificates_status', 'scholar_status', 'registration_status',
      'current_year', 'current_semester', 'batch', 'course', 'branch', 'stud_type',
      'gender', 'dob', 'adhar_no', 'caste', 'pin_no', 'remarks'
    ];
    const auditChanges = {};
    for (const col of TRACKED_COLUMNS) {
      const oldVal = existingStudent[col] ?? null;
      // Map the DB column back to what mutableStudentData might contain using robust FIELD_LOOKUP
      let newVal = mutableStudentData[col] ?? null;
      if (newVal === null) {
        for (const [k, v] of Object.entries(mutableStudentData)) {
          if (FIELD_LOOKUP[normalizeHeaderKeyForLookup(k)] === col) {
            newVal = v;
            break;
          }
        }
      }
      const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal).trim();
      const newStr = newVal === null || newVal === undefined ? '' : String(newVal).trim();
      if (oldStr !== newStr && (oldStr !== '' || newStr !== '')) {
        auditChanges[col] = { from: oldStr || null, to: newStr || null };
      }
    }
    // True only when a genuinely DIFFERENT photo was uploaded.
    // The frontend always sends the existing photo back in the payload, so we must
    // compare the incoming photo against what's currently stored in the DB.
    const incomingPhoto = studentData.student_photo || studentData['Student Photo'];
    const hasPhotoChange = !!(
      incomingPhoto &&
      typeof incomingPhoto === 'string' &&
      incomingPhoto.startsWith('data:image/') &&
      incomingPhoto !== existingStudent.student_photo   // different from what's already stored
    );

    // SYNC REMARKS TO HISTORY: If remarks changed via this update, add to student_remarks table
    if (auditChanges.remarks) {
      try {
        const newRemark = auditChanges.remarks.to;
        if (newRemark && newRemark.trim() !== '') {
          const actor = req.user || req.admin;
          // Local helper to match studentHistoryController category logic
          const getCategory = (role) => {
            switch (role) {
              case 'college_principal': return 'Principal';
              case 'college_ao': return 'AO';
              case 'branch_hod': return 'HOD';
              case 'cashier': return 'Accountant';
              case 'super_admin':
              case 'admin': return 'Admin';
              default: return 'Other';
            }
          };
          const category = getCategory(actor.role);
          await masterPool.query(
            `INSERT INTO student_remarks 
             (admission_number, remark, remark_category, student_year, student_semester, created_by, created_by_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [admissionNumber, newRemark, category, existingStudent.current_year, existingStudent.current_semester, actor.id, actor.username]
          );
        }
      } catch (err) {
        console.error('Failed to sync remark to history log:', err.message);
      }
    }

    // Log action (non-blocking - don't fail the operation if logging fails)
    await writeAuditLog(masterPool, {
      actionType: 'UPDATE',
      entityType: 'STUDENT',
      entityId: admissionNumber,
      actor: req.user || req.admin,
      details: {
        changes: auditChanges,
        photo_updated: hasPhotoChange,
        fields_changed: Object.keys(auditChanges),
        total_changed: Object.keys(auditChanges).length
      }
    });

    clearStudentsCache();

    const finalCourse = auditChanges.course?.to ?? existingStudent.course;
    const finalBranch = auditChanges.branch?.to ?? existingStudent.branch;
    const finalBatch = auditChanges.batch?.to ?? existingStudent.batch;
    const shouldReassignSections = ['course', 'branch', 'batch', 'pin_no'].some((key) => key in auditChanges);
    if (shouldReassignSections && finalCourse && finalBranch) {
      if (('course' in auditChanges || 'branch' in auditChanges || 'batch' in auditChanges) &&
        existingStudent.course && existingStudent.branch) {
        await maybeReassignBranchSections(
          existingStudent.course,
          existingStudent.branch,
          existingStudent.batch
        );
      }
      await maybeReassignBranchSections(finalCourse, finalBranch, finalBatch);
    } else {
      const manualSection =
        incomingStudentData.section ||
        incomingStudentData.Section ||
        mutableStudentData.section ||
        mutableStudentData.Section;
      if (manualSection) {
        await sectionAssignmentService.syncStudentSectionFromData({
          studentId: existingStudent.id,
          courseName: finalCourse,
          branchName: finalBranch,
          batch: finalBatch,
          sectionName: manualSection
        });
      }
    }

    res.json({
      success: true,
      message: 'Student data updated successfully'
    });

    runDeferredStudentUpdateTasks(admissionNumber, resolvedStage, serializedStudentData);

  } catch (error) {
    console.error('Update student error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });

    // Provide more specific error messages for common issues
    let errorMessage = 'Server error while updating student';
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.code === 'ER_DATA_TOO_LONG') {
      errorMessage = 'Invalid data format for one or more fields. Please check the values entered.';
    } else if (error.code === 'ER_BAD_NULL_ERROR') {
      errorMessage = 'A required field is missing.';
    } else if (error.sqlMessage) {
      errorMessage = `Database error: ${error.sqlMessage}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update student PIN number
exports.updatePinNumber = async (req, res) => {
  console.log('[PIN UPDATE] Request received for:', req.params.admissionNumber);
  console.log('[PIN UPDATE] Body:', req.body);

  try {
    const { admissionNumber } = req.params;
    const { pinNumber } = req.body;

    console.log('[PIN UPDATE] Admission Number:', admissionNumber, 'PIN:', pinNumber);

    if (!pinNumber || typeof pinNumber !== 'string') {
      console.log('[PIN UPDATE] ERROR: PIN number is required');
      return res.status(400).json({
        success: false,
        message: 'PIN number is required'
      });
    }

    // Check if PIN number already exists for another student
    const [existing] = await masterPool.query(
      'SELECT admission_number FROM students WHERE pin_no = ? AND admission_number != ?',
      [pinNumber.trim(), admissionNumber]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `PIN number '${pinNumber}' is already assigned to another student`
      });
    }

    const [result] = await masterPool.query(
      'UPDATE students SET pin_no = ? WHERE admission_number = ?',
      [pinNumber.trim(), admissionNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Log action (non-blocking - don't fail the operation if logging fails)
    await writeAuditLog(masterPool, {
      actionType: 'UPDATE_PIN_NUMBER',
      entityType: 'STUDENT',
      entityId: admissionNumber,
      actor: req.user || req.admin,
      details: { pinNumber }
    });

    clearStudentsCache();

    const [studentRow] = await masterPool.query(
      'SELECT course, branch, batch FROM students WHERE admission_number = ? LIMIT 1',
      [admissionNumber]
    );
    if (studentRow.length > 0) {
      await maybeReassignBranchSections(
        studentRow[0].course,
        studentRow[0].branch,
        studentRow[0].batch
      );
    }

    console.log('[PIN UPDATE] ✅ SUCCESS - PIN updated to:', pinNumber);

    res.json({
      success: true,
      message: 'PIN number updated successfully'
    });

  } catch (error) {
    console.error('[PIN UPDATE] ❌ ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating PIN number'
    });
  }
};

// View student password (returns plain password for display)
exports.viewStudentPassword = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    // Get student credentials
    const [credentials] = await masterPool.query(
      `SELECT sc.username, s.student_name, s.student_mobile, s.pin_no
       FROM student_credentials sc
       INNER JOIN students s ON sc.student_id = s.id
       WHERE sc.admission_number = ? OR s.admission_number = ?
       LIMIT 1`,
      [admissionNumber, admissionNumber]
    );

    if (credentials.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student credentials not found'
      });
    }

    const cred = credentials[0];

    // Generate password from student data (same logic as generation)
    const studentName = cred.student_name || '';
    const studentMobile = cred.student_mobile || '';
    const mobileNumber = studentMobile.replace(/\D/g, '');

    if (mobileNumber.length < 4 || studentName.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate password: insufficient student data'
      });
    }

    // Get first 4 letters (uppercase, remove spaces and special chars)
    const firstFourLetters = studentName
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 4)
      .toUpperCase();

    if (firstFourLetters.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate password: student name has insufficient letters'
      });
    }

    // Get last 4 digits of mobile number
    const lastFourDigits = mobileNumber.substring(mobileNumber.length - 4);

    // Combine to create password
    const plainPassword = firstFourLetters + lastFourDigits;

    res.json({
      success: true,
      data: {
        username: cred.username,
        password: plainPassword
      }
    });
  } catch (error) {
    console.error('View student password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving password'
    });
  }
};

// Reset student password (regenerates and sends SMS)
exports.resetStudentPassword = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    // Get student data
    const [students] = await masterPool.query(
      `SELECT id, admission_number, admission_no, pin_no, student_name, student_mobile
       FROM students
       WHERE admission_number = ? OR admission_no = ?
       LIMIT 1`,
      [admissionNumber, admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = students[0];

    // Regenerate credentials (pass isPasswordReset = true to use password reset SMS template)
    const { generateStudentCredentials } = require('../utils/studentCredentials');
    const credResult = await generateStudentCredentials(
      student.id,
      student.admission_number,
      student.pin_no,
      student.student_name,
      student.student_mobile,
      true, // isPasswordReset = true
      student.admission_no
    );

    if (!credResult.success) {
      return res.status(400).json({
        success: false,
        message: credResult.error || 'Failed to reset password'
      });
    }

    // Log action
    try {
      await masterPool.query(
        `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        ['RESET_PASSWORD', 'STUDENT', admissionNumber, req.admin?.id || null, JSON.stringify({ username: credResult.username })]
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError.message);
    }

    res.json({
      success: true,
      message: 'Password reset successfully. SMS sent to student.',
      data: {
        username: credResult.username,
        password: credResult.password // Return password for display
      }
    });
  } catch (error) {
    console.error('Reset student password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password'
    });
  }
};

// Bulk delete students
exports.bulkDeleteStudents = async (req, res) => {
  try {
    const { admissionNumbers } = req.body || {};

    if (!Array.isArray(admissionNumbers) || admissionNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'admissionNumbers array is required'
      });
    }

    const normalized = Array.from(
      new Set(
        admissionNumbers
          .map((value) => (value !== undefined && value !== null ? String(value).trim() : ''))
          .filter((value) => value.length > 0)
      )
    );

    if (normalized.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid admission numbers provided'
      });
    }

    const placeholders = normalized.map(() => '?').join(',');
    const [existingRows] = await masterPool.query(
      `SELECT admission_number FROM students WHERE admission_number IN (${placeholders})`,
      normalized
    );

    const existingNumbers = existingRows.map((row) => row.admission_number);
    const existingSet = new Set(existingNumbers);
    const notFound = normalized.filter((value) => !existingSet.has(value));

    if (existingNumbers.length === 0) {
      return res.json({
        success: true,
        deletedCount: 0,
        notFound
      });
    }

    const deletePlaceholders = existingNumbers.map(() => '?').join(',');
    const [deleteResult] = await masterPool.query(
      `DELETE FROM students WHERE admission_number IN (${deletePlaceholders})`,
      existingNumbers
    );

    const deletedCount = deleteResult.affectedRows || 0;

    if (deletedCount > 0) {
      await masterPool.query(
        `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        [
          'BULK_DELETE',
          'STUDENT',
          'bulk',
          req.admin?.id || null,
          JSON.stringify({ admissionNumbers: existingNumbers })
        ]
      );

      clearStudentsCache();
    }

    return res.json({
      success: true,
      deletedCount,
      notFound,
      deletedAdmissionNumbers: existingNumbers
    });
  } catch (error) {
    console.error('Bulk delete students error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk delete'
    });
  }
};

// Delete student
exports.deleteStudent = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    const [result] = await masterPool.query(
      'DELETE FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Log action
    // Log action (safe)
    try {
      await masterPool.query(
        `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id)
         VALUES (?, ?, ?, ?)`,
        ['DELETE', 'STUDENT', admissionNumber, req.admin.id]
      );
    } catch (auditError) {
      console.error('Delete audit log error:', auditError.message);
      try {
        await masterPool.query(
          `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id)
           VALUES (?, ?, ?, NULL)`,
          ['DELETE', 'STUDENT', admissionNumber]
        );
      } catch (e) { }
    }

    clearStudentsCache();

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });

  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting student'
    });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    // Build scope-aware query for regular students
    let statsQuery = "SELECT COUNT(*) as total FROM students WHERE student_status = 'Regular'";
    const statsParams = [];
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        statsQuery += ` AND ${scopeCondition}`;
        statsParams.push(...scopeParams);
      }
    }

    // Today's date in YYYY-MM-DD for attendance count
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    // Build the same scope condition for the attendance join (scoped to students table)
    let attendanceScopeJoin = '';
    const attendanceScopeParams = [];
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 's');
      if (scopeCondition) {
        attendanceScopeJoin = ` AND ${scopeCondition}`;
        attendanceScopeParams.push(...scopeParams);
      }
    }

    // Run all independent queries in parallel
    const [studentCountResult, pendingResult, recentSubmissionsResult, attendanceResult] = await Promise.allSettled([
      masterPool.query(statsQuery, statsParams),
      masterPool.query('SELECT COUNT(*) as count FROM form_submissions WHERE status = ?', ['pending']),
      masterPool.query(
        `SELECT fs.submission_id, fs.admission_number, fs.status, fs.created_at, fs.form_id,
                f.form_name
         FROM form_submissions fs
         LEFT JOIN forms f ON f.form_id = fs.form_id
         ORDER BY fs.created_at DESC
         LIMIT 10`
      ),
      // Today's present/absent counts — scoped to the same students visible to this user
      masterPool.query(
        `SELECT ar.status, COUNT(*) AS count
         FROM attendance_records ar
         INNER JOIN students s ON s.id = ar.student_id
         WHERE ar.attendance_date = ?
           AND s.student_status = 'Regular'${attendanceScopeJoin}
         GROUP BY ar.status`,
        [todayKey, ...attendanceScopeParams]
      ),
    ]);

    const masterDbConnected = studentCountResult.status === 'fulfilled';
    if (!masterDbConnected) {
      console.warn('Dashboard stats: master database unavailable', studentCountResult.reason?.message);
    }

    const totalStudents =
      studentCountResult.status === 'fulfilled'
        ? studentCountResult.value[0]?.[0]?.total || 0
        : 0;

    const pendingSubmissions =
      pendingResult.status === 'fulfilled'
        ? pendingResult.value[0]?.[0]?.count || 0
        : 0;

    if (pendingResult.status === 'rejected') {
      console.warn('Dashboard stats: unable to count pending submissions', pendingResult.reason?.message);
    }

    let recentWithNames = [];
    if (recentSubmissionsResult.status === 'fulfilled') {
      const rows = recentSubmissionsResult.value[0] || [];
      recentWithNames = rows.map((r) => ({ ...r, submitted_at: r.created_at }));
    } else {
      console.warn('Dashboard stats: unable to fetch recent submissions', recentSubmissionsResult.reason?.message);
    }

    // Parse today's attendance counts from the grouped result
    let presentToday = 0;
    let absentToday = 0;
    if (attendanceResult.status === 'fulfilled') {
      const rows = attendanceResult.value[0] || [];
      rows.forEach((row) => {
        if (row.status === 'present') presentToday = Number(row.count) || 0;
        if (row.status === 'absent') absentToday = Number(row.count) || 0;
      });
    } else {
      console.warn('Dashboard stats: unable to fetch today attendance counts', attendanceResult.reason?.message);
    }

    res.json({
      success: true,
      data: {
        totalStudents,
        pendingSubmissions,
        recentSubmissions: recentWithNames,
        presentToday,
        absentToday,
        attendanceDate: todayKey,
        completedProfiles: 0,
        averageCompletion: 0,
        masterDbConnected,
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics',
    });
  }
};

// Create student (manual entry)
exports.createStudent = async (req, res) => {
  try {
    console.log('📝 Create Student - Incoming request body:', JSON.stringify(req.body, null, 2));
    console.log('📝 Create Student - Files:', req.files ? req.files.map(f => ({ name: f.originalname, fieldname: f.fieldname })) : 'none');

    // Handle both JSON and FormData
    let incomingData;
    if (req.body.studentData && typeof req.body.studentData === 'object') {
      incomingData = { ...req.body.studentData };
    } else if (typeof req.body === 'object' && !Array.isArray(req.body)) {
      // Handle FormData - all fields are strings, need to parse numbers
      incomingData = { ...req.body };

      // Convert numeric fields
      if (incomingData.current_year) {
        incomingData.current_year = parseInt(incomingData.current_year, 10) || 1;
      }
      if (incomingData.current_semester) {
        incomingData.current_semester = parseInt(incomingData.current_semester, 10) || 1;
      }
    } else {
      incomingData = {};
    }

    delete incomingData.studentData;

    console.log('📝 Create Student - Parsed incomingData:', JSON.stringify({
      course: incomingData.course,
      branch: incomingData.branch,
      college: incomingData.college,
      batch: incomingData.batch
    }, null, 2));

    const admissionNumber =
      req.body.admissionNumber ||
      req.body.admission_no ||
      incomingData.admission_number ||
      incomingData.admission_no;

    if (!admissionNumber) {
      return res.status(400).json({
        success: false,
        message: 'Admission number is required'
      });
    }

    delete incomingData.admissionNumber;

    incomingData.admission_number = admissionNumber;
    if (!incomingData.admission_no) {
      incomingData.admission_no = admissionNumber;
    }

    // Check if student already exists
    const [existing] = await masterPool.query(
      'SELECT admission_number FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Student with this admission number already exists'
      });
    }

    let resolvedStage;
    try {
      resolvedStage = resolveStageFromData(incomingData, {
        year: incomingData.current_year || 1,
        semester: incomingData.current_semester || 1
      });
    } catch (error) {
      if (error.message === 'INVALID_STAGE') {
        return res.status(400).json({
          success: false,
          message: 'Invalid academic stage provided. Year must be 1-4 and semester must be 1-2.'
        });
      }
      throw error;
    }

    applyStageToPayload(incomingData, resolvedStage);

    // SECURITY: Sanitize incomingData to remove protected fields.
    // This prevents manual setting of sensitive statuses (fee, registration) during creation.
    // They will default to NULL/System Default.
    // Allowed: admission_number (required)
    // Blocked: id, created_at, updated_at, fee_status, registration_status
    // Note: pin_no is allowed as it may be migrated/assigned during creation.
    const PROTECTED_COLUMNS_CREATE = ['id', 'created_at', 'updated_at', 'fee_status', 'registration_status'];
    const protectedCreateSet = new Set(PROTECTED_COLUMNS_CREATE);

    Object.keys(incomingData).forEach(key => {
      // Check both direct key and mapped column via FIELD_LOOKUP
      const normalizedKey = normalizeHeaderKeyForLookup(key);
      const columnName = FIELD_LOOKUP[normalizedKey];

      if (protectedCreateSet.has(columnName) || protectedCreateSet.has(key)) {
        console.warn(`⚠️ Create Student: Removed protected field '${key}' (maps to '${columnName || key}')`);
        delete incomingData[key];
      }
    });

    // Ensure previous college is added to the list if manually entered
    if (incomingData.previous_college) {
      await ensurePreviousCollegeExists(incomingData.previous_college);
    } else if (incomingData['Previous College Name']) {
      await ensurePreviousCollegeExists(incomingData['Previous College Name']);
    }

    // Handle photo - store as base64 data URL directly in database (works with hosted environments)
    let photoDataUrl = null;
    if (incomingData.student_photo && typeof incomingData.student_photo === 'string') {
      const photoData = incomingData.student_photo;

      // If it's already a base64 data URL, keep it as-is
      if (photoData.startsWith('data:image/')) {
        photoDataUrl = photoData;
        const sizeKB = (photoData.length * 0.75 / 1024).toFixed(2); // Approximate size
        // Log without the actual image data
        console.log(`📷 Photo stored as base64 data URL (${sizeKB} KB)`);
      } else if (photoData.startsWith('http')) {
        // It's an HTTP URL, keep it as-is
        photoDataUrl = photoData;
        console.log('📷 Photo stored as HTTP URL');
      } else {
        // It's a filename - for backward compatibility, try to convert to base64 if file exists locally
        try {
          const filepath = `uploads/${photoData}`;
          if (fs.existsSync(filepath)) {
            const fileBuffer = fs.readFileSync(filepath);
            const base64 = fileBuffer.toString('base64');
            // Detect mime type from extension
            const ext = photoData.split('.').pop().toLowerCase();
            const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            photoDataUrl = `data:${mimeType};base64,${base64}`;
            console.log(`📷 Converted file to base64: ${photoData}`);
          } else {
            // File doesn't exist, keep the filename for reference
            photoDataUrl = photoData;
          }
        } catch (photoError) {
          console.error('Error reading photo file:', photoError);
          photoDataUrl = photoData; // Keep original value
        }
      }
    }

    // Remove photo from incomingData to prevent bloating student_data JSON
    const dataForJson = { ...incomingData };
    delete dataForJson.student_photo;

    // Don't store large base64 in JSON, only reference it
    if (photoDataUrl && !photoDataUrl.startsWith('data:')) {
      dataForJson.student_photo = photoDataUrl;
    }

    const serializedStudentData = JSON.stringify(dataForJson);

    const insertColumns = ['admission_number', 'current_year', 'current_semester', 'student_data'];
    const insertPlaceholders = ['?', '?', '?', '?'];
    const insertValues = [admissionNumber, resolvedStage.year, resolvedStage.semester, serializedStudentData];

    // Store photo as base64 data URL in dedicated column
    if (photoDataUrl) {
      incomingData.student_photo = photoDataUrl;
    }

    const updatedColumns = new Set(['admission_number', 'current_year', 'current_semester']);

    Object.entries(incomingData).forEach(([key, value]) => {
      const normalizedKey = normalizeHeaderKeyForLookup(key);
      const columnName = FIELD_LOOKUP[normalizedKey];

      if (
        columnName &&
        !updatedColumns.has(columnName) &&
        value !== undefined &&
        value !== '' &&
        value !== '{}' &&
        value !== null
      ) {
        // Skip branch_code - it's stored in student_data JSON only, not as a column
        if (columnName === 'branch_code') {
          return;
        }
        insertColumns.push(columnName);
        insertPlaceholders.push('?');
        insertValues.push(value);
        updatedColumns.add(columnName);
      }
    });

    const insertQuery = `INSERT INTO students (${insertColumns.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;

    console.log('📝 Create Student - Insert columns:', insertColumns);
    console.log('📝 Create Student - Checking for course/branch in columns:', {
      hasCourse: insertColumns.includes('course'),
      hasBranch: insertColumns.includes('branch'),
      hasCollege: insertColumns.includes('college')
    });

    await masterPool.query(insertQuery, insertValues);

    // Handle document uploads if files are present
    const uploadedDocuments = {};
    // S3 upload functionality has been removed as per configuration
    if (req.files && req.files.length > 0) {
      console.log('⚠️ S3 upload is disabled. Documents were not uploaded.');
      // Clean up temp files
      req.files.forEach(file => {
        try { // Use try-catch for safety
          const fs = require('fs');
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) { }
      });
    }

    // Auto-set certificates_status based on document requirements if certificates_status is not explicitly set
    // Check if documents are required and if all are uploaded
    if (!incomingData.certificates_status || incomingData.certificates_status === 'Pending') {
      try {
        const documentSettingsController = require('../controllers/documentSettingsController');

        // Determine course type
        const courseNameLower = (incomingData.course || '').toLowerCase();
        const courseType = courseNameLower.includes('pg') || courseNameLower.includes('post graduate') ||
          courseNameLower.includes('m.tech') || courseNameLower.includes('mtech') ? 'PG' : 'UG';

        // Get document requirements
        const stages = courseType === 'PG' ? ['10th', 'Inter', 'Diploma', 'UG'] : ['10th', 'Inter', 'Diploma'];
        let allDocumentsUploaded = true;
        let hasRequirements = false;

        for (const stage of stages) {
          try {
            const [reqRows] = await masterPool.query(
              'SELECT * FROM document_requirements WHERE course_type = ? AND academic_stage = ? AND is_enabled = 1',
              [courseType, stage]
            );

            if (reqRows.length > 0) {
              hasRequirements = true;
              const req = reqRows[0];
              const requiredDocs = parseJSON(req.required_documents) || [];

              for (const docName of requiredDocs) {
                // Check if document was uploaded (check both uploadedDocuments and student_data)
                const docKey = docName.replace(/\s+/g, '_');
                if (!uploadedDocuments[docName] && !uploadedDocuments[docKey]) {
                  allDocumentsUploaded = false;
                  break;
                }
              }

              if (!allDocumentsUploaded) break;
            }
          } catch (err) {
            console.log(`No requirements for ${courseType}/${stage}`);
          }
        }

        // Auto-set certificates_status
        if (hasRequirements) {
          const finalStatus = allDocumentsUploaded ? 'Submitted' : 'Pending';

          // Update certificates_status in database if it's in the columns
          if (insertColumns.includes('certificates_status')) {
            const statusIndex = insertColumns.indexOf('certificates_status');
            insertValues[statusIndex] = finalStatus;
            await masterPool.query(
              'UPDATE students SET certificates_status = ? WHERE admission_number = ?',
              [finalStatus, admissionNumber]
            );
          } else {
            // Add to student_data if not in columns
            const [currentStudentRows] = await masterPool.query(
              'SELECT student_data FROM students WHERE admission_number = ?',
              [admissionNumber]
            );
            if (currentStudentRows.length > 0) {
              const currentStudentData = parseJSON(currentStudentRows[0].student_data) || {};
              currentStudentData.certificates_status = finalStatus;
              await masterPool.query(
                'UPDATE students SET student_data = ? WHERE admission_number = ?',
                [JSON.stringify(currentStudentData), admissionNumber]
              );
            }
          }

          console.log(`📋 Auto-set certificates_status to "${finalStatus}" based on document upload status`);
        }
      } catch (statusError) {
        console.error('Error auto-setting certificates_status:', statusError);
        // Non-fatal error
      }
    }

    // Fetch the created student data
    const [createdStudents] = await masterPool.query(
      'SELECT * FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    const createdStudent = {
      ...createdStudents[0],
      student_data: parseJSON(createdStudents[0].student_data)
    };

    // Generate student login credentials automatically
    try {
      const { generateStudentCredentials } = require('../utils/studentCredentials');
      const credResult = await generateStudentCredentials(
        createdStudent.id,
        createdStudent.admission_number,
        createdStudent.pin_no,
        createdStudent.student_name,
        createdStudent.student_mobile
      );
      if (credResult.success) {
        console.log(`✅ Generated login credentials for student ${admissionNumber} (username: ${credResult.username})`);
      } else {
        console.warn(`⚠️  Could not generate credentials for student ${admissionNumber}: ${credResult.error}`);
      }
    } catch (credError) {
      console.error('Error generating student credentials (non-fatal):', credError);
      // Don't fail student creation if credential generation fails
    }

    await updateStagingStudentStage(admissionNumber, resolvedStage, serializedStudentData);

    // Log action
    // Log action
    try {
      await masterPool.query(
        `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        ['CREATE', 'STUDENT', admissionNumber, req.admin.id, serializedStudentData]
      );
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError.message);
      // If admin doesn't exist (FK violation), try with NULL admin
      if (auditError.code === 'ER_NO_REFERENCED_ROW_2') {
        try {
          await masterPool.query(
            `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
             VALUES (?, ?, ?, NULL, ?)`,
            ['CREATE', 'STUDENT', admissionNumber, serializedStudentData]
          );
          console.log('⚠️ Created audit log with NULL admin due to missing admin reference');
        } catch (retryError) {
          console.error('Failed to create audit log fallback:', retryError.message);
        }
      }
    }

    clearStudentsCache();

    await maybeReassignBranchSections(
      createdStudent.course,
      createdStudent.branch,
      createdStudent.batch
    );

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: createdStudent
    });

  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating student'
    });
  }
};

// Promote single student to next academic stage (or specified stage)
exports.promoteStudent = async (req, res) => {
  const connection = await masterPool.getConnection();
  const { admissionNumber } = req.params;
  const { targetYear, targetSemester } = req.body || {};

  let targetStage = null;

  if (targetYear !== undefined || targetSemester !== undefined) {
    if (targetYear === undefined || targetSemester === undefined) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Both targetYear and targetSemester are required to set a specific academic stage'
      });
    }

    try {
      targetStage = normalizeStage(targetYear, targetSemester);
    } catch (error) {
      if (error.message === 'INVALID_STAGE') {
        connection.release();
        return res.status(400).json({
          success: false,
          message: 'Invalid academic stage provided. Year must be 1-4 and semester must be 1-2.'
        });
      }
      throw error;
    }
  }

  try {
    await connection.beginTransaction();

    const promotionResult = await performPromotion({
      connection,
      admissionNumber,
      targetStage,
      adminId: req.admin?.id || null
    });

    if (promotionResult.status === 'NOT_FOUND') {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (promotionResult.status === 'MAX_STAGE') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Student is already at the final academic stage'
      });
    }

    if (promotionResult.status === 'COURSE_COMPLETED') {
      await connection.commit();
      clearStudentsCache();
      return res.json({
        success: true,
        message: promotionResult.message || 'Student has completed all years and semesters. Status updated to "Course Completed".',
        data: {
          admissionNumber: promotionResult.student.admission_number || admissionNumber,
          status: 'Course Completed',
          currentYear: promotionResult.currentStage.year,
          currentSemester: promotionResult.currentStage.semester
        }
      });
    }

    await connection.commit();

    await updateStagingStudentStage(
      admissionNumber,
      promotionResult.nextStage,
      promotionResult.serializedStudentData
    );

    clearStudentsCache();

    return res.json({
      success: true,
      message: 'Student promoted successfully',
      data: {
        admissionNumber: promotionResult.student.admission_number || admissionNumber,
        currentYear: promotionResult.nextStage.year,
        currentSemester: promotionResult.nextStage.semester
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Promote student error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while promoting student'
    });
  } finally {
    connection.release();
  }
};

// Bulk promotion endpoint
exports.bulkPromoteStudents = async (req, res) => {
  try {
    const { students, leftOutStudents } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'students array is required'
      });
    }

    const results = [];
    const leftOutResults = [];
    const courseConfigCache = new Map();
    const totalToProcess = Array.isArray(students) ? students.length : 0;
    let processedCount = 0;
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const MAX_PARALLEL = 5;

    const processWithLimit = async (items, limit, worker) => {
      const output = [];
      let index = 0;

      const runners = Array(Math.min(limit, items.length))
        .fill(null)
        .map(async () => {
          while (true) {
            const currentIndex = index;
            index += 1;
            if (currentIndex >= items.length) break;
            output[currentIndex] = await worker(items[currentIndex], currentIndex);
          }
        });

      await Promise.all(runners);
      return output;
    };

    const promotionWorker = async (entry) => {
      const admissionNumber = entry?.admissionNumber || entry?.admission_no;

      const progress = () => {
        processedCount += 1;
        return {
          current: processedCount,
          total: totalToProcess,
          label: `${processedCount}/${totalToProcess}`
        };
      };

      if (!admissionNumber) {
        errorCount += 1;
        const progressData = progress();
        results.push({
          admissionNumber: entry?.admissionNumber || null,
          status: 'error',
          message: 'Admission number is required',
          progress: progressData,
          statusSymbol: 'error'
        });
        return;
      }

      let targetStage = null;
      if (entry.targetYear !== undefined || entry.targetSemester !== undefined) {
        if (entry.targetYear === undefined || entry.targetSemester === undefined) {
          errorCount += 1;
          const progressData = progress();
          results.push({
            admissionNumber,
            status: 'error',
            message: 'Both targetYear and targetSemester are required for manual stage assignment',
            progress: progressData,
            statusSymbol: 'error'
          });
          return;
        }

        try {
          targetStage = normalizeStage(entry.targetYear, entry.targetSemester);
        } catch (error) {
          if (error.message === 'INVALID_STAGE') {
            errorCount += 1;
            const progressData = progress();
            results.push({
              admissionNumber,
              status: 'error',
              message: 'Invalid academic stage provided. Year must be 1-4 and semester must be 1-2.',
              progress: progressData,
              statusSymbol: 'error'
            });
            return;
          }
          throw error;
        }
      }

      let connection = null;
      try {
        connection = await masterPool.getConnection();
        await connection.beginTransaction();

        const promotionResult = await performPromotion({
          connection,
          admissionNumber,
          targetStage,
          adminId: req.admin?.id || null,
          courseConfigCache
        });

        if (promotionResult.status === 'NOT_FOUND') {
          await connection.rollback();
          errorCount += 1;
          const progressData = progress();
          results.push({
            admissionNumber,
            status: 'error',
            message: 'Student not found',
            progress: progressData,
            statusSymbol: 'error'
          });
          return;
        }

        if (promotionResult.status === 'MAX_STAGE') {
          await connection.rollback();
          skippedCount += 1;
          const progressData = progress();
          results.push({
            admissionNumber,
            status: 'skipped',
            message: 'Student already at final academic stage',
            progress: progressData,
            statusSymbol: 'skip'
          });
          return;
        }

        if (promotionResult.status === 'COURSE_COMPLETED') {
          await connection.commit();
          successCount += 1;
          const progressData = progress();
          results.push({
            admissionNumber: promotionResult.student.admission_number || admissionNumber,
            status: 'completed',
            message: promotionResult.message || 'Student has completed all years and semesters. Status updated to "Course Completed".',
            progress: progressData,
            statusSymbol: 'completed',
            currentYear: promotionResult.currentStage.year,
            currentSemester: promotionResult.currentStage.semester
          });
          return;
        }

        await connection.commit();

        if (promotionResult.nextStage) {
          await updateStagingStudentStage(
            admissionNumber,
            promotionResult.nextStage,
            promotionResult.serializedStudentData
          );
        }

        successCount += 1;
        const progressData = progress();
        results.push({
          admissionNumber: promotionResult.student.admission_number || admissionNumber,
          status: 'success',
          currentYear: promotionResult.nextStage.year,
          currentSemester: promotionResult.nextStage.semester,
          progress: progressData,
          statusSymbol: 'ok'
        });
      } catch (error) {
        if (connection) {
          try {
            await connection.rollback();
          } catch (_) {
            // ignore
          }
        }
        console.error('Bulk promotion error for student', admissionNumber, error);
        errorCount += 1;
        const progressData = progress();
        results.push({
          admissionNumber,
          status: 'error',
          message: 'Server error during promotion',
          progress: progressData,
          statusSymbol: 'error'
        });
      } finally {
        if (connection) connection.release();
      }
    };

    try {
      // Process promotions with limited parallelism
      await processWithLimit(students, MAX_PARALLEL, promotionWorker);

      // Process left-out students (update remarks and status) sequentially
      if (Array.isArray(leftOutStudents) && leftOutStudents.length > 0) {
        const connection = await masterPool.getConnection();
        try {
          for (const leftOutEntry of leftOutStudents) {
            const admissionNumber = leftOutEntry?.admissionNumber || leftOutEntry?.admission_no;

            if (!admissionNumber) {
              leftOutResults.push({
                admissionNumber: leftOutEntry?.admissionNumber || null,
                status: 'error',
                message: 'Admission number is required'
              });
              continue;
            }

            try {
              await connection.beginTransaction();

              // Check if student exists
              const [studentRows] = await connection.query(
                'SELECT id FROM students WHERE admission_number = ? OR admission_no = ? LIMIT 1',
                [admissionNumber, admissionNumber]
              );

              if (studentRows.length === 0) {
                await connection.rollback();
                leftOutResults.push({
                  admissionNumber,
                  status: 'error',
                  message: 'Student not found'
                });
                continue;
              }

              // Update remarks and status
              const updateFields = [];
              const updateValues = [];

              if (leftOutEntry.remarks !== undefined) {
                updateFields.push('remarks = ?');
                updateValues.push(leftOutEntry.remarks || null);
              }

              if (leftOutEntry.student_status !== undefined) {
                updateFields.push('student_status = ?');
                updateValues.push(leftOutEntry.student_status || null);
              }

              if (updateFields.length > 0) {
                updateValues.push(admissionNumber, admissionNumber);
                await connection.query(
                  `UPDATE students SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE admission_number = ? OR admission_no = ?`,
                  updateValues
                );
              }

              await connection.commit();

              leftOutResults.push({
                admissionNumber,
                status: 'success',
                message: 'Remarks and status updated successfully'
              });
            } catch (error) {
              await connection.rollback();
              console.error('Left-out student update error for', admissionNumber, error);
              leftOutResults.push({
                admissionNumber,
                status: 'error',
                message: 'Server error during update'
              });
            }
          }
        } finally {
          connection.release();
        }
      }

      const leftOutSuccessCount = leftOutResults.filter(result => result.status === 'success').length;
      const leftOutErrorCount = leftOutResults.filter(result => result.status === 'error').length;
      const hasSuccess = results.some(result => result.status === 'success' || result.status === 'completed') || leftOutSuccessCount > 0;

      if (hasSuccess) {
        clearStudentsCache();
      }

      return res.status(hasSuccess ? 200 : 400).json({
        success: hasSuccess,
        results,
        leftOutResults: leftOutResults.length > 0 ? leftOutResults : undefined,
        summary: {
          total: totalToProcess,
          processed: processedCount,
          success: successCount,
          skipped: skippedCount,
          errors: errorCount,
          leftOutSuccess: leftOutSuccessCount,
          leftOutErrors: leftOutErrorCount
        }
      });
    } catch (innerErr) {
      console.error('Error processing promotions:', innerErr);
      return res.status(500).json({
        success: false,
        message: 'Server error during bulk promotion processing',
        error: innerErr.message
      });
    }
  } catch (err) {
    console.error('Bulk promotion unexpected error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error during bulk promotion',
      error: err.message
    });
  }
};

// Get available filter fields configuration
exports.getFilterFields = async (_req, res) => {
  try {
    const [existingConfigs] = await masterPool.query('SELECT * FROM filter_fields');
    res.json({
      success: true,
      data: existingConfigs.map((config) => ({
        name: config.field_name,
        type: config.field_type,
        enabled: config.enabled,
        required: config.required,
        options: parseJSON(config.options) || []
      }))
    });
  } catch (dbError) {
    console.error('Get filter fields error:', dbError);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching filter fields'
    });
  }
};

// Get all unique filter values for dropdown filters
exports.getFilterOptions = async (req, res) => {
  try {
    // Get filter parameters from query string
    const { course, branch, batch, year, semester } = req.query;

    // Build WHERE clause based on applied filters
    let whereClause = 'WHERE 1=1';
    const params = [];

    // Apply user scope filtering first
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        whereClause += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    if (course) {
      whereClause += ' AND course = ?';
      params.push(course);
    }
    if (branch) {
      whereClause += ' AND branch = ?';
      params.push(branch);
    }
    if (batch) {
      whereClause += ' AND batch = ?';
      params.push(batch);
    }
    if (year) {
      whereClause += ' AND current_year = ?';
      params.push(parseInt(year, 10));
    }
    if (semester) {
      whereClause += ' AND current_semester = ?';
      params.push(parseInt(semester, 10));
    }

    // Get unique values for all dropdown filter fields, applying cascading filters
    const [studTypeRows] = await masterPool.query(
      `SELECT DISTINCT stud_type FROM students ${whereClause} AND stud_type IS NOT NULL AND stud_type <> '' ORDER BY stud_type ASC`,
      params
    );
    const configuredQuotaCodes = await fetchActiveQuotaCodes();
    const legacyStudTypes = studTypeRows.map((row) => row.stud_type);
    const studTypeOptions = configuredQuotaCodes.length > 0
      ? [
          ...configuredQuotaCodes,
          ...legacyStudTypes.filter((code) => !configuredQuotaCodes.includes(code))
        ]
      : legacyStudTypes;
    const [studentStatusRows] = await masterPool.query(
      `SELECT DISTINCT student_status FROM students ${whereClause} AND student_status IS NOT NULL AND student_status <> '' ORDER BY student_status ASC`,
      params
    );
    const [scholarStatusRows] = await masterPool.query(
      `SELECT DISTINCT scholar_status FROM students ${whereClause} AND scholar_status IS NOT NULL AND scholar_status <> '' ORDER BY scholar_status ASC`,
      params
    );
    const [casteRows] = await masterPool.query(
      `SELECT DISTINCT caste FROM students ${whereClause} AND caste IS NOT NULL AND caste <> '' ORDER BY caste ASC`,
      params
    );
    const [genderRows] = await masterPool.query(
      `SELECT DISTINCT gender FROM students ${whereClause} AND gender IS NOT NULL AND gender <> '' ORDER BY gender ASC`,
      params
    );
    const [certificatesStatusRows] = await masterPool.query(
      `SELECT DISTINCT certificates_status FROM students ${whereClause} AND certificates_status IS NOT NULL AND certificates_status <> '' ORDER BY certificates_status ASC`,
      params
    );
    const [remarksRows] = await masterPool.query(
      `SELECT DISTINCT remarks FROM students ${whereClause} AND remarks IS NOT NULL AND remarks <> '' ORDER BY remarks ASC`,
      params
    );
    const [districtRows] = await masterPool.query(
      `SELECT DISTINCT district FROM students ${whereClause} AND district IS NOT NULL AND district <> '' ORDER BY district ASC`,
      params
    );
    const [mandalRows] = await masterPool.query(
      `SELECT DISTINCT mandal_name FROM students ${whereClause} AND mandal_name IS NOT NULL AND mandal_name <> '' ORDER BY mandal_name ASC`,
      params
    );

    res.json({
      success: true,
      data: {
        stud_type: studTypeOptions,
        student_status: studentStatusRows.map((row) => row.student_status),
        scholar_status: scholarStatusRows.map((row) => row.scholar_status),
        caste: casteRows.map((row) => row.caste),
        gender: genderRows.map((row) => row.gender),
        certificates_status: certificatesStatusRows.map((row) => row.certificates_status),
        remarks: remarksRows.map((row) => row.remarks),
        district: districtRows.map((row) => row.district),
        mandal_name: mandalRows.map((row) => row.mandal_name)
      }
    });
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching filter options'
    });
  }
};

// Get quick filter options (batches, courses, branches, years, semesters) - WITHOUT course exclusions
// This is used by pages other than attendance that need all courses to be available
const fetchSectionFilterOptions = async ({ course, branch, batch, year, semester, college } = {}) => {
  if (!course || !branch) {
    return [];
  }

  try {
    const [courseRows] = await masterPool.query(
      'SELECT id FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
      [course]
    );
    if (courseRows.length === 0) {
      return [];
    }

    const [branchRows] = await masterPool.query(
      'SELECT metadata FROM course_branches WHERE course_id = ? AND name = ? AND is_active = 1 LIMIT 1',
      [courseRows[0].id, branch]
    );
    if (branchRows.length === 0 || !branchRows[0].metadata) {
      return [];
    }

    const metadata = typeof branchRows[0].metadata === 'string'
      ? JSON.parse(branchRows[0].metadata)
      : branchRows[0].metadata;

    if (!metadata?.sections?.enabled || !Array.isArray(metadata.sections.items)) {
      return [];
    }

    const configuredSections = metadata.sections.items
      .map((item) => item?.name)
      .filter(Boolean);

    const studentParams = [course, branch];
    let studentWhere = `WHERE s.course = ? AND s.branch = ?`;

    if (college) {
      studentWhere += ' AND s.college = ?';
      studentParams.push(college);
    }
    if (batch) {
      studentWhere += ' AND s.batch = ?';
      studentParams.push(batch);
    }
    if (year) {
      studentWhere += ' AND s.current_year = ?';
      studentParams.push(parseInt(year, 10));
    }
    if (semester) {
      studentWhere += ' AND s.current_semester = ?';
      studentParams.push(parseInt(semester, 10));
    }

    const [assignedRows] = await masterPool.query(
      `SELECT DISTINCT ss.section_name AS section
       FROM student_sections ss
       INNER JOIN students s ON s.id = ss.student_id
       ${studentWhere}
       ORDER BY ss.section_name ASC`,
      studentParams
    );

    let assignedSections = assignedRows
      .map((row) => row.section)
      .filter(Boolean);

    if (assignedSections.length === 0) {
      let jsonWhere = `
        WHERE course = ? AND branch = ?
          AND (
            (JSON_EXTRACT(student_data, '$.section') IS NOT NULL
              AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.section'))) <> '')
            OR (JSON_EXTRACT(student_data, '$.Section') IS NOT NULL
              AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.Section'))) <> '')
          )`;
      const jsonParams = [course, branch];
      if (college) {
        jsonWhere += ' AND college = ?';
        jsonParams.push(college);
      }
      if (batch) {
        jsonWhere += ' AND batch = ?';
        jsonParams.push(batch);
      }
      if (year) {
        jsonWhere += ' AND current_year = ?';
        jsonParams.push(parseInt(year, 10));
      }
      if (semester) {
        jsonWhere += ' AND current_semester = ?';
        jsonParams.push(parseInt(semester, 10));
      }

      const [jsonRows] = await masterPool.query(
        `SELECT DISTINCT COALESCE(
           NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.section'))), ''),
           NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(student_data, '$.Section'))), '')
         ) AS section
         FROM students
         ${jsonWhere}
         ORDER BY section ASC`,
        jsonParams
      );
      assignedSections = jsonRows.map((row) => row.section).filter(Boolean);
    }

    if (assignedSections.length === 0) {
      if (batch || year || semester || college) {
        return [];
      }
      return configuredSections;
    }

    const assignedSet = new Set(assignedSections);
    const orderedConfigured = configuredSections.filter((name) => assignedSet.has(name));
    const extras = assignedSections.filter((name) => !configuredSections.includes(name));

    return [...orderedConfigured, ...extras];
  } catch (error) {
    console.warn('Failed to fetch section filter options:', error);
    return [];
  }
};

exports.getQuickFilterOptions = async (req, res) => {
  try {
    // Get filter parameters from query string
    const { course, branch, batch, year, semester, college, level, applyExclusions } = req.query;

    // Build WHERE clause based on applied filters
    const params = [];
    let whereClause = `WHERE 1=1`;

    // Apply Exclusions if requested
    if (applyExclusions === 'true') {
      try {
        const [settings] = await masterPool.query(
          'SELECT value FROM settings WHERE `key` = ?',
          ['attendance_config']
        );
        if (settings && settings.length > 0) {
          const config = JSON.parse(settings[0].value);
          const excludedCourses = config.excludedCourses || [];
          if (Array.isArray(excludedCourses) && excludedCourses.length > 0) {
            whereClause += ` AND course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
            params.push(...excludedCourses);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch attendance config for filters:', err);
      }
    }

    // Apply user scope filtering first
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        whereClause += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    if (college) {
      whereClause += ' AND college = ?';
      params.push(college);
    }
    if (course) {
      whereClause += ' AND course = ?';
      params.push(course);
    }
    if (branch) {
      whereClause += ' AND branch = ?';
      params.push(branch);
    }
    if (batch) {
      whereClause += ' AND batch = ?';
      params.push(batch);
    }
    if (year) {
      whereClause += ' AND current_year = ?';
      params.push(parseInt(year, 10));
    }
    if (semester) {
      whereClause += ' AND current_semester = ?';
      params.push(parseInt(semester, 10));
    }

    // Fetch distinct values for each filter (only colleges that exist in colleges table, to exclude orphan names)
    const [collegeRows] = await masterPool.query(
      `SELECT DISTINCT college FROM students ${whereClause} AND college IS NOT NULL AND college <> '' AND college COLLATE utf8mb4_unicode_ci IN (SELECT name FROM colleges WHERE is_active = 1) ORDER BY college ASC`,
      params
    );

    // For batches, if level is selected, filter batches that have students with courses of that level
    let batchRows;
    if (level) {
      // Get courses with the specified level
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      const validCourseNames = levelCourses.map(c => c.name);
      if (validCourseNames.length > 0) {
        const placeholders = validCourseNames.map(() => '?').join(',');
        const batchWhereClause = `${whereClause} AND course IN (${placeholders})`;
        const batchParams = [...params, ...validCourseNames];
        [batchRows] = await masterPool.query(
          `SELECT DISTINCT batch FROM students ${batchWhereClause} AND batch IS NOT NULL AND batch <> '' ORDER BY batch ASC`,
          batchParams
        );
      } else {
        batchRows = [];
      }
    } else {
      [batchRows] = await masterPool.query(
        `SELECT DISTINCT batch FROM students ${whereClause} AND batch IS NOT NULL AND batch <> '' ORDER BY batch ASC`,
        params
      );
    }

    // For years and semesters, build separate WHERE clauses that exclude year/semester filters
    // so they cascade properly based on batch/course/branch
    const yearParams = [];
    let yearWhereClause = `WHERE 1=1`;

    // Apply user scope filtering
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        yearWhereClause += ` AND ${scopeCondition}`;
        yearParams.push(...scopeParams);
      }
    }

    if (college) {
      yearWhereClause += ' AND college = ?';
      yearParams.push(college);
    }
    if (level) {
      // Filter by level - get courses with that level
      const [levelCourses] = await masterPool.query(
        'SELECT name FROM courses WHERE level = ? AND is_active = 1',
        [level]
      );
      const validCourseNames = levelCourses.map(c => c.name);
      if (validCourseNames.length > 0) {
        const placeholders = validCourseNames.map(() => '?').join(',');
        yearWhereClause += ` AND course IN (${placeholders})`;
        yearParams.push(...validCourseNames);
      } else {
        // No courses with this level, return empty
        yearWhereClause += ' AND 1=0';
      }
    }
    if (course) {
      yearWhereClause += ' AND course = ?';
      yearParams.push(course);
    }
    if (branch) {
      yearWhereClause += ' AND branch = ?';
      yearParams.push(branch);
    }
    if (batch) {
      yearWhereClause += ' AND batch = ?';
      yearParams.push(batch);
    }
    // Note: year and semester are NOT included in the WHERE clause for years/semesters queries

    const [yearRows] = await masterPool.query(
      `SELECT DISTINCT current_year AS currentYear FROM students ${yearWhereClause} AND current_year IS NOT NULL AND current_year <> 0 ORDER BY current_year ASC`,
      yearParams
    );

    // For semesters, use the same WHERE clause as years
    const [semesterRows] = await masterPool.query(
      `SELECT DISTINCT current_semester AS currentSemester FROM students ${yearWhereClause} AND current_semester IS NOT NULL AND current_semester <> 0 ORDER BY current_semester ASC`,
      yearParams
    );

    // For courses, if college is selected, filter courses by college
    let courseRows;
    if (college) {
      // Get college ID from college name
      const [collegeRows] = await masterPool.query(
        'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [college]
      );

      if (collegeRows.length > 0) {
        const collegeId = collegeRows[0].id;
        // Get courses for this college from courses table (these are the valid courses for this college)
        // Filter by level if level is provided
        let courseQuery = 'SELECT name FROM courses WHERE college_id = ? AND is_active = 1';
        const courseParams = [collegeId];
        if (level) {
          courseQuery += ' AND level = ?';
          courseParams.push(level);
        }
        courseQuery += ' ORDER BY name ASC';
        const [collegeCourses] = await masterPool.query(courseQuery, courseParams);
        const validCourseNames = collegeCourses.map(c => c.name);

        if (validCourseNames.length > 0) {
          // Get distinct courses from students that match:
          // 1. The current filters (college, batch, year, semester, etc.)
          // 2. AND are in the list of valid courses for this college
          const placeholders = validCourseNames.map(() => '?').join(',');
          const courseWhereClause = `${whereClause} AND course IN (${placeholders})`;
          const courseParams = [...params, ...validCourseNames];
          [courseRows] = await masterPool.query(
            `SELECT DISTINCT course FROM students ${courseWhereClause} AND course IS NOT NULL AND course <> '' ORDER BY course ASC`,
            courseParams
          );
        } else {
          // No courses configured for this college
          courseRows = [];
        }
      } else {
        // College not found, return empty courses
        courseRows = [];
      }
    } else {
      // No college filter, get all courses from students (NO exclusions)
      // But if level is selected, filter courses by level
      if (level) {
        // Get courses with the specified level from courses table
        const [levelCourses] = await masterPool.query(
          'SELECT name FROM courses WHERE level = ? AND is_active = 1 ORDER BY name ASC',
          [level]
        );
        const validCourseNames = levelCourses.map(c => c.name);
        if (validCourseNames.length > 0) {
          const placeholders = validCourseNames.map(() => '?').join(',');
          const courseWhereClause = `${whereClause} AND course IN (${placeholders})`;
          const courseParams = [...params, ...validCourseNames];
          [courseRows] = await masterPool.query(
            `SELECT DISTINCT course FROM students ${courseWhereClause} AND course IS NOT NULL AND course <> '' ORDER BY course ASC`,
            courseParams
          );
        } else {
          courseRows = [];
        }
      } else {
        [courseRows] = await masterPool.query(
          `SELECT DISTINCT course FROM students ${whereClause} AND course IS NOT NULL AND course <> '' ORDER BY course ASC`,
          params
        );
      }
    }

    // For branches, if college is selected, filter branches by college and valid courses
    let branchRows;
    if (college) {
      // Get college ID from college name
      const [collegeRows] = await masterPool.query(
        'SELECT id FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [college]
      );

      if (collegeRows.length > 0) {
        const collegeId = collegeRows[0].id;
        // Get courses for this college from courses table
        // Filter by level if level is provided
        let branchCourseQuery = 'SELECT id, name FROM courses WHERE college_id = ? AND is_active = 1';
        const branchCourseParams = [collegeId];
        if (level) {
          branchCourseQuery += ' AND level = ?';
          branchCourseParams.push(level);
        }
        branchCourseQuery += ' ORDER BY name ASC';
        const [collegeCourses] = await masterPool.query(branchCourseQuery, branchCourseParams);
        const validCourseNames = collegeCourses.map(c => c.name);
        const validCourseIds = collegeCourses.map(c => c.id);

        if (validCourseNames.length > 0) {
          // If course is also selected, filter branches for that specific course
          if (course) {
            // Get course ID for the selected course
            const selectedCourse = collegeCourses.find(c => c.name === course);
            if (selectedCourse) {
              // Get branches for this specific course from course_branches table
              const [courseBranches] = await masterPool.query(
                'SELECT name FROM course_branches WHERE course_id = ? AND is_active = 1 ORDER BY name ASC',
                [selectedCourse.id]
              );
              const validBranchNames = courseBranches.map(b => b.name);

              // RETURN ALL branches for this course from config
              branchRows = validBranchNames.map(name => ({ branch: name }));
            } else {
              branchRows = [];
            }
          } else {
            // Selected course doesn't belong to this college
            branchRows = [];
          }
        } else {
          // No course selected, get all branches for all courses in this college
          // Get all branches for all courses in this college
          if (validCourseIds.length > 0) {
            const courseIdPlaceholders = validCourseIds.map(() => '?').join(',');
            const [allBranches] = await masterPool.query(
              `SELECT name FROM course_branches WHERE course_id IN (${courseIdPlaceholders}) AND is_active = 1 ORDER BY name ASC`,
              validCourseIds
            );
            const validBranchNames = allBranches.map(b => b.name);

            if (validBranchNames.length > 0) {
              // RETURN ALL branches for all courses in this college from config
              branchRows = validBranchNames.map(name => ({ branch: name }));
            } else {
              branchRows = [];
            }
          } else {
            branchRows = [];
          }
        }
      } else {
        // College not found, return empty branches
        branchRows = [];
      }
    } else {
      // No college filter, get all branches from students (NO exclusions)
      [branchRows] = await masterPool.query(
        `SELECT DISTINCT branch FROM students ${whereClause} AND branch IS NOT NULL AND branch <> '' ORDER BY branch ASC`,
        params
      );
    }

    res.json({
      success: true,
      data: {
        colleges: collegeRows.map((row) => row.college),
        batches: batchRows.map((row) => row.batch),
        years: yearRows.map((row) => row.currentYear),
        semesters: semesterRows.map((row) => row.currentSemester),
        courses: courseRows.map((row) => row.course),
        branches: branchRows.map((row) => row.branch),
        sections: await fetchSectionFilterOptions({ course, branch, batch, year, semester, college })
      }
    });
  } catch (error) {
    console.error('Failed to fetch quick filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching quick filter options'
    });
  }
};

// Add or update filter field configuration
exports.updateFilterField = async (req, res) => {
  try {
    const { fieldName } = req.params;
    const { enabled, type, required, options } = req.body;

    if (!fieldName) {
      return res.status(400).json({
        success: false,
        message: 'Field name is required'
      });
    }

    // Check if configuration already exists
    const [existing] = await masterPool.query(
      'SELECT id FROM filter_fields WHERE field_name = ?',
      [fieldName]
    );

    const configData = {
      field_type: type || 'text',
      enabled: enabled !== undefined ? enabled : true,
      required: required || false,
      options: JSON.stringify(options || [])
    };

    if (existing.length > 0) {
      // Update existing configuration
      await masterPool.query(
        'UPDATE filter_fields SET field_type = ?, enabled = ?, required = ?, options = ?, updated_at = CURRENT_TIMESTAMP WHERE field_name = ?',
        [configData.field_type, configData.enabled, configData.required, configData.options, fieldName]
      );
    } else {
      // Insert new configuration
      await masterPool.query(
        'INSERT INTO filter_fields (field_name, field_type, enabled, required, options) VALUES (?, ?, ?, ?, ?)',
        [fieldName, configData.field_type, configData.enabled, configData.required, configData.options]
      );
    }

    res.json({
      success: true,
      message: 'Filter field configuration updated successfully',
      data: {
        fieldName,
        enabled: configData.enabled,
        type: configData.field_type,
        required: configData.required,
        options: options || []
      }
    });

  } catch (error) {
    console.error('Update filter field error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating filter field'
    });
  }
};

// Bulk update PIN numbers (Optimized with batch processing)
exports.bulkUpdatePinNumbers = async (req, res) => {
  const connection = await masterPool.getConnection();
  const { executeBulkUpdates } = require('../utils/batchProcessor');

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    // Parse CSV file
    const results = [];
    const errors = [];
    let rowNumber = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
          rowNumber++;
          // Skip comment lines
          if (!data.admission_number || data.admission_number.startsWith('#')) {
            return;
          }
          results.push({ row: rowNumber, data });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Prepare bulk updates array
    const updates = [];
    let notFoundCount = 0;

    for (const result of results) {
      const { row, data } = result;
      const admissionNumber = data.admission_number?.toString().trim();
      const pinNumber = data.pin_number?.toString().trim();

      if (!admissionNumber) {
        errors.push({ row, message: 'Missing admission_number' });
        continue;
      }

      if (!pinNumber) {
        errors.push({ row, message: 'Missing pin_number' });
        continue;
      }

      updates.push({
        query: 'UPDATE students SET pin_no = ? WHERE admission_number = ?',
        params: [pinNumber, admissionNumber],
        row,
        admissionNumber
      });
    }

    // Execute bulk updates in optimized batches
    const bulkResults = await executeBulkUpdates(connection, updates, {
      batchSize: 500, // Process 500 updates per batch
      useTransaction: true
    });

    // Check which updates actually affected rows (student found)
    // Note: We can't easily check affectedRows with batch updates, so we'll verify separately
    // For now, we'll assume all updates in bulkResults.success found the student
    const successCount = bulkResults.success;
    const failedCount = bulkResults.failed + errors.length;

    // Verify which students were actually found (optional - can be skipped for performance)
    // This is a trade-off: verification adds time but provides accurate notFoundCount
    if (updates.length <= 1000) {
      // Only verify for smaller batches to avoid performance hit
      const admissionNumbers = updates.map(u => u.admissionNumber);
      const [foundStudents] = await connection.query(
        'SELECT admission_number FROM students WHERE admission_number IN (?)',
        [admissionNumbers]
      );
      const foundSet = new Set(foundStudents.map(s => s.admission_number));
      notFoundCount = admissionNumbers.filter(an => !foundSet.has(an)).length;
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Log action
    try {
      await masterPool.query(
        `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        ['BULK_UPDATE_PIN_NUMBERS', 'STUDENT', 'bulk', req.admin.id,
          JSON.stringify({ successCount, failedCount, notFoundCount, totalRows: results.length })]
      );
    } catch (auditError) {
      console.error('Bulk Pin audit error:', auditError.message);
      try {
        await masterPool.query(
          `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
           VALUES (?, ?, ?, NULL, ?)`,
          ['BULK_UPDATE_PIN_NUMBERS', 'STUDENT', 'bulk',
            JSON.stringify({ successCount, failedCount, notFoundCount, totalRows: results.length })]
        );
      } catch (e) { }
    }

    if (successCount > 0) {
      clearStudentsCache();
    }

    res.json({
      success: true,
      message: `Bulk update completed. ${successCount} PIN numbers updated, ${failedCount} failed.`,
      successCount,
      failedCount,
      notFoundCount,
      errors: errors.slice(0, 20) // Limit errors to first 20
    });

  } catch (error) {
    await connection.rollback();

    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('Bulk update PIN numbers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk update'
    });
  } finally {
    connection.release();
  }
};

// Student Login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find student credential
    const [credentials] = await masterPool.query(
      `SELECT sc.*, s.admission_number, s.admission_no, s.pin_no, s.student_name, s.student_mobile, s.current_year, s.current_semester, s.student_photo, s.course, s.branch, s.college, s.batch
       FROM student_credentials sc
       JOIN students s ON sc.student_id = s.id
       WHERE sc.username = ? OR sc.admission_number = ? OR s.admission_number = ? OR s.admission_no = ? OR s.pin_no = ?`,
      [username, username, username, username, username]
    );

    if (credentials.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your username.'
      });
    }

    const studentValid = credentials[0];

    // Verify password if hash exists
    if (!studentValid.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Account not initialized. Please contact administrator to generate credentials.'
      });
    }

    const isMatch = await bcrypt.compare(password, studentValid.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Create Token
    const token = jwt.sign(
      {
        id: studentValid.student_id,
        admissionNumber: studentValid.admission_number,
        pinNo: studentValid.pin_no || studentValid.username,
        role: 'student'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Filter sensitive data
    const user = {
      admission_number: studentValid.admission_number,
      pin_no: studentValid.pin_no,
      username: studentValid.username,
      name: studentValid.student_name,
      current_year: studentValid.current_year,
      current_semester: studentValid.current_semester,
      course: studentValid.course,
      branch: studentValid.branch,
      college: studentValid.college,
      student_photo: studentValid.student_photo
    };

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user
    });

  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Get Student by Admission Number (derive fee_status from student_fees for current stage)
exports.getStudentByAdmission = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    const [students] = await masterPool.query(
      `SELECT s.*, 
              sc.username,
              srn.roll_number AS roll_number,
              srn.branch_prefix AS roll_branch_prefix,
              srn.serial AS roll_serial
       FROM students s
       LEFT JOIN student_credentials sc ON s.id = sc.student_id
       LEFT JOIN student_roll_numbers srn ON srn.student_id = s.id
       WHERE s.admission_number = ?`,
      [admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = students[0];

    // Parse JSON student_data and resolve current stage
    const parsedData = parseJSON(student.student_data) || {};
    const stage = resolveStageFromData(parsedData, {
      year: student.current_year || 1,
      semester: student.current_semester || 1
    });
    applyStageToPayload(parsedData, stage);

    // Fallback fee/registration status (from columns or JSON)
    const fallbackFeeStatus = (student.fee_status && String(student.fee_status).trim().length > 0)
      ? student.fee_status
      : (parsedData?.fee_status || parsedData?.['Fee Status'] || null);
    const fallbackRegistrationStatus = (student.registration_status && String(student.registration_status).trim().length > 0)
      ? student.registration_status
      : (parsedData?.registration_status || parsedData?.['Registration Status'] || null);

    // Derive fee_status from student_fees for the student's current year/semester
    // BUT: if admin has explicitly set special statuses like 'permitted' or 'no due',
    // respect that value for the student portal and do not override it from payments.
    let derivedFeeStatus = fallbackFeeStatus || null;
    const normalizedFallbackFee =
      (fallbackFeeStatus || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    const protectedFeeStatuses = new Set(['permitted', 'no_due', 'nodue']);

    if (!protectedFeeStatuses.has(normalizedFallbackFee)) {
      try {
        const [feeRows] = await masterPool.query(
          `SELECT amount, paid_amount, payment_status
           FROM student_fees
           WHERE student_id = ? AND year = ? AND semester = ?`,
          [student.id, stage.year, stage.semester]
        );

        if (Array.isArray(feeRows) && feeRows.length > 0) {
          let allPaid = true;
          let anyPaidOrPartial = false;

          for (const row of feeRows) {
            const amountVal = parseFloat(row.amount) || 0;
            const paidVal = parseFloat(row.paid_amount) || 0;
            const status = String(row.payment_status || '').toLowerCase();

            const isPaid = status === 'paid' || paidVal >= amountVal;
            const isPartial = status === 'partial' || (paidVal > 0 && paidVal < amountVal);

            if (isPaid) {
              anyPaidOrPartial = true;
            } else if (isPartial) {
              anyPaidOrPartial = true;
              allPaid = false;
            } else {
              // pending
              allPaid = false;
            }
          }

          if (allPaid) {
            derivedFeeStatus = 'completed';
          } else if (anyPaidOrPartial) {
            derivedFeeStatus = 'partially_completed';
          } else {
            derivedFeeStatus = 'pending';
          }
        }
      } catch (e) {
        console.warn('Failed to derive fee status from student_fees:', e);
      }
    }

    // Normalize scholarship status - empty/null should show as "Pending"
    const rawScholarStatus = student.scholar_status || parsedData?.scholar_status || parsedData?.['Scholar Status'] || '';
    const normalizedScholarStatus = (rawScholarStatus && String(rawScholarStatus).trim().length > 0 &&
      rawScholarStatus.toLowerCase() !== 'null' && rawScholarStatus.toLowerCase() !== 'undefined')
      ? rawScholarStatus
      : 'Pending';

    const responsePayload = {
      ...student,
      current_year: stage.year,
      current_semester: stage.semester,
      student_data: parsedData,
      fee_status: derivedFeeStatus,
      registration_status: fallbackRegistrationStatus,
      scholar_status: normalizedScholarStatus
    };

    res.json({
      success: true,
      data: responsePayload
    });

  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching student details'
    });
  }
};

// Send OTP
exports.sendOtp = async (req, res) => {
  try {
    const { admissionNumber, mobileNumber, year, semester, type } = req.body;

    if (!admissionNumber || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Admission number and mobile number are required'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in cache (5 minutes TTL)
    const cacheKey = `otp:${admissionNumber}:${mobileNumber}`;
    otpCache.set(cacheKey, otp);

    const message = buildSemesterRegistrationOtpMessage(otp, { type, year, semester });
    await sendOtpSms(smsService, {
      to: mobileNumber,
      message,
      templateId: SEMESTER_OTP_SMS_TEMPLATE_ID,
      peId: OTP_PE_ID,
      meta: { template: 'semester_registration_otp' }
    });

    console.log(`[OTP] Sent ${otp} to ${mobileNumber} for ${admissionNumber}`);

    res.json({
      success: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending OTP'
    });
  }
};

// Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { admissionNumber, mobileNumber, otp, type } = req.body;

    if (!admissionNumber || !mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Admission number, mobile number, and OTP are required'
      });
    }

    const cacheKey = `otp:${admissionNumber}:${mobileNumber}`;
    const storedOtp = otpCache.get(cacheKey);

    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or not found'
      });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Clear OTP after successful verification
    otpCache.delete(cacheKey);

    // Persist verification status if type is provided
    if (type) {
      try {
        const [rows] = await masterPool.query(
          'SELECT id, student_data FROM students WHERE admission_number = ?',
          [admissionNumber]
        );

        if (rows.length > 0) {
          const student = rows[0];
          let data = {};
          try {
            data = typeof student.student_data === 'string'
              ? JSON.parse(student.student_data)
              : student.student_data || {};
          } catch (e) {
            data = {};
          }

          const key = type.toLowerCase() === 'student' ? 'is_student_mobile_verified' : 'is_parent_mobile_verified';
          data[key] = true;

          await masterPool.query(
            'UPDATE students SET student_data = ? WHERE id = ?',
            [JSON.stringify(data), student.id]
          );

          // Auto-check for registration completion after verification
          await checkAndAutoCompleteRegistration(admissionNumber);
        }
      } catch (dbError) {
        console.error('Error persisting OTP verification status:', dbError);
        // Don't fail the response, just log it; user is verified for this session at least
      }
    }

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP'
    });
  }
};

// Cached students table columns (avoids repeated information_schema queries per update)
const studentsTableColumnCache = { loaded: false, columns: new Set() };

const loadStudentsTableColumns = async () => {
  if (studentsTableColumnCache.loaded) {
    return;
  }
  try {
    const [rows] = await masterPool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'`
    );
    studentsTableColumnCache.columns = new Set(rows.map((r) => r.COLUMN_NAME));
    studentsTableColumnCache.loaded = true;
  } catch (err) {
    console.warn('Could not load students table column cache:', err.message);
  }
};

// Helper: check if column exists in students table
const columnExists = async (columnName) => {
  try {
    await loadStudentsTableColumns();
    if (studentsTableColumnCache.loaded) {
      return studentsTableColumnCache.columns.has(columnName);
    }
    const [rows] = await masterPool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = ?`,
      [columnName]
    );
    return Number(rows?.[0]?.count || 0) > 0;
  } catch (_e) {
    return false;
  }
};

// Core columns present in base schema; optional migration columns added only when they exist
const STUDENT_UPDATE_FETCH_BASE = [
  'id', 'admission_number', 'admission_no', 'pin_no', 'batch', 'current_year', 'current_semester',
  'student_name', 'father_name', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
  'student_address', 'city_village', 'mandal_name', 'district', 'previous_college',
  'student_status', 'certificates_status', 'scholar_status', 'course', 'branch', 'stud_type',
  'gender', 'dob', 'adhar_no', 'caste', 'admission_date', 'remarks', 'student_data'
];

const STUDENT_UPDATE_FETCH_OPTIONAL = [
  'college',
  'fee_status',
  'registration_status',
  'permit_ending_date',
  'permit_remarks'
];

const getStudentUpdateFetchColumns = async (includePhoto = false) => {
  await loadStudentsTableColumns();
  const columns = [...STUDENT_UPDATE_FETCH_BASE];

  if (studentsTableColumnCache.loaded) {
    STUDENT_UPDATE_FETCH_OPTIONAL.forEach((col) => {
      if (studentsTableColumnCache.columns.has(col)) {
        columns.push(col);
      }
    });
    if (includePhoto && studentsTableColumnCache.columns.has('student_photo')) {
      columns.push('student_photo');
    }
  } else if (includePhoto) {
    columns.push('student_photo');
  }

  return columns.join(', ');
};

const jsonPayloadsEqual = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

// Update fee status
exports.updateFeeStatus = async (req, res) => {
  try {
    const { admissionNumber } = req.params;
    const { fee_status, permit_ending_date, permit_remarks } = req.body;

    if (!fee_status) {
      return res.status(400).json({
        success: false,
        message: 'Fee status is required'
      });
    }

    // If fee_status is 'permitted', require permit_ending_date
    if (fee_status === 'permitted') {
      if (!permit_ending_date) {
        return res.status(400).json({
          success: false,
          message: 'Permit ending date is required when fee status is "permitted"'
        });
      }
      if (!permit_remarks || !permit_remarks.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: 'Permit remarks are required when fee status is "permitted"'
        });
      }
    }

    // Determine if the new fee status counts as "completed/no due"
    // Using the same list as checkAndAutoCompleteRegistration
    const isFeeCleared = ['no_due', 'no due', 'permitted', 'completed', 'nodue'].includes(fee_status.toLowerCase());

    // If column exists, update column; otherwise, update JSON field only
    const hasFeeStatusColumn = await columnExists('fee_status');
    const hasPermitEndingDateColumn = await columnExists('permit_ending_date');
    const hasPermitRemarksColumn = await columnExists('permit_remarks');
    const hasRegStatusColumn = await columnExists('registration_status');

    if (hasFeeStatusColumn) {
      let updateQuery = 'UPDATE students SET fee_status = ?';
      const updateParams = [fee_status];

      // Add permit fields if columns exist
      if (hasPermitEndingDateColumn) {
        updateQuery += ', permit_ending_date = ?';
        updateParams.push(permit_ending_date || null);
      }
      if (hasPermitRemarksColumn) {
        updateQuery += ', permit_remarks = ?';
        updateParams.push(permit_remarks || null);
      }

      // If fee is NOT cleared, force registration_status to pending
      if (!isFeeCleared && hasRegStatusColumn) {
        updateQuery += ', registration_status = ?';
        updateParams.push('pending');
      }

      updateQuery += ' WHERE admission_number = ?';
      updateParams.push(admissionNumber);

      const [result] = await masterPool.query(updateQuery, updateParams);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      // If permit ending date has passed, automatically set registration_status to 'pending'
      // Only needed if we haven't already set it to pending above
      if (isFeeCleared && fee_status === 'permitted' && permit_ending_date && hasRegStatusColumn) {
        const permitDate = new Date(permit_ending_date);
        const todayStr = getISTDateString();
        const todayDate = new Date(todayStr);

        if (permitDate < todayDate) {
          await masterPool.query(
            'UPDATE students SET registration_status = ? WHERE admission_number = ?',
            ['pending', admissionNumber]
          );
        }
      }
    } else {
      // Fallback: update JSON field inside student_data
      const [rows] = await masterPool.query(
        'SELECT student_data FROM students WHERE admission_number = ? LIMIT 1',
        [admissionNumber]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      const current = rows[0]?.student_data || '{}';
      let parsed;
      try { parsed = JSON.parse(current || '{}'); } catch (_e) { parsed = {}; }

      parsed.fee_status = fee_status;
      parsed['Fee Status'] = fee_status;

      if (permit_ending_date) {
        parsed.permit_ending_date = permit_ending_date;
        parsed['Permit Ending Date'] = permit_ending_date;
      }
      if (permit_remarks) {
        parsed.permit_remarks = permit_remarks;
        parsed['Permit Remarks'] = permit_remarks;
      }

      // If fee is NOT cleared, update registration status in JSON as well
      if (!isFeeCleared) {
        parsed.registration_status = 'pending';
        parsed['Registration Status'] = 'pending';
      }

      const serialized = JSON.stringify(parsed);
      const [upd] = await masterPool.query(
        'UPDATE students SET student_data = ? WHERE admission_number = ?',
        [serialized, admissionNumber]
      );
      if (upd.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
    }

    // Even if we set it to pending, checkAndAutoCompleteRegistration might set it back to completed
    // if the conditions are actually met (e.g. if the user mistakenly deemed it "not cleared" but the system logic says it is).
    // However, if !isFeeCleared, checkAndAutoCompleteRegistration's "Fee Check" will also fail, so it won't autoComplete.
    await checkAndAutoCompleteRegistration(admissionNumber);

    // Audit Log for Fee Status Update
    await writeAuditLog(masterPool, {
      actionType: 'UPDATE_FEE_STATUS',
      entityType: 'STUDENT',
      entityId: admissionNumber,
      actor: req.user || req.admin,
      details: {
        fee_status,
        permit_ending_date: permit_ending_date || null,
        permit_remarks: permit_remarks || null,
        registration_auto_check: true
      }
    });

    clearStudentsCache();

    res.json({
      success: true,
      message: 'Fee status updated successfully'
    });
  } catch (error) {
    console.error('Update fee status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating fee status'
    });
  }
};

// Helper: Check for registration auto-completion (column-first; JSON sync only when needed)
const checkAndAutoCompleteRegistration = async (admissionNumber) => {
  try {
    const [rows] = await masterPool.query(
      `SELECT student_data, certificates_status, fee_status, scholar_status,
              current_year, current_semester, registration_status
       FROM students WHERE admission_number = ?`,
      [admissionNumber]
    );

    if (rows.length === 0) return;

    const student = rows[0];
    const studentData = parseJSON(student.student_data) || {};

    const isMobileVerified = studentData.is_student_mobile_verified === true;
    const isParentVerified = studentData.is_parent_mobile_verified === true;
    const verificationCompleted = isMobileVerified && isParentVerified;

    const certStatus = student.certificates_status || '';
    const certificatesCompleted =
      certStatus &&
      (certStatus.includes('Verified') || certStatus.toLowerCase() === 'completed');

    const feeStatus = (student.fee_status || '').toLowerCase();
    const feeCompleted = ['no_due', 'no due', 'permitted', 'completed', 'nodue'].includes(feeStatus);

    const promotionCompleted = student.current_year && student.current_semester;

    const scholarStatus = (student.scholar_status || '').trim();
    const scholarshipCompleted =
      scholarStatus &&
      scholarStatus !== '' &&
      scholarStatus.toLowerCase() !== 'null' &&
      scholarStatus.toLowerCase() !== 'undefined';

    const hasRegColumn = await columnExists('registration_status');
    const allConditionsMet =
      verificationCompleted &&
      certificatesCompleted &&
      feeCompleted &&
      promotionCompleted &&
      scholarshipCompleted;

    const columnReg = (student.registration_status || '').trim();
    const jsonReg =
      studentData.registration_status ||
      studentData['Registration Status'] ||
      '';

    const syncRegistrationJson = async (status) => {
      const normalizedJson = String(jsonReg).trim().toLowerCase();
      const target = status.toLowerCase();
      if (normalizedJson === target) {
        return;
      }
      studentData.registration_status = status;
      studentData['Registration Status'] = status;
      await masterPool.query(
        'UPDATE students SET student_data = ? WHERE admission_number = ?',
        [JSON.stringify(studentData), admissionNumber]
      );
      clearStudentsCache();
    };

    if (allConditionsMet) {
      if (hasRegColumn && columnReg.toLowerCase() !== 'completed') {
        await masterPool.query(
          'UPDATE students SET registration_status = ? WHERE admission_number = ?',
          ['Completed', admissionNumber]
        );
        clearStudentsCache();
      }
      await syncRegistrationJson('Completed');
    } else if (columnReg.toLowerCase() === 'completed' || jsonReg.toLowerCase() === 'completed') {
      if (hasRegColumn) {
        await masterPool.query(
          'UPDATE students SET registration_status = ? WHERE admission_number = ?',
          ['pending', admissionNumber]
        );
        clearStudentsCache();
      }
      await syncRegistrationJson('pending');
    }
  } catch (err) {
    console.error(`Check auto-complete error for ${admissionNumber}:`, err);
  }
};

const runDeferredStudentUpdateTasks = (admissionNumber, resolvedStage, serializedStudentData) => {
  setImmediate(() => {
    updateStagingStudentStage(admissionNumber, resolvedStage, serializedStudentData).catch((err) => {
      console.warn(`Deferred staging sync failed for ${admissionNumber}:`, err.message);
    });
    checkAndAutoCompleteRegistration(admissionNumber).catch((err) => {
      console.warn(`Deferred registration auto-complete failed for ${admissionNumber}:`, err.message);
    });
  });
};

// Check and update registration status for expired permits
exports.checkExpiredPermits = async (req, res) => {
  try {
    const hasPermitEndingDateColumn = await columnExists('permit_ending_date');
    const hasRegStatusColumn = await columnExists('registration_status');
    const hasFeeStatusColumn = await columnExists('fee_status');

    if (!hasPermitEndingDateColumn || !hasRegStatusColumn || !hasFeeStatusColumn) {
      return res.json({
        success: true,
        message: 'Required columns do not exist',
        updated: 0
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getISTDateString();

    // Find all students with fee_status = 'permitted' and permit_ending_date < today
    const [students] = await masterPool.query(
      `SELECT admission_number, permit_ending_date, registration_status 
       FROM students 
       WHERE fee_status = 'permitted' 
       AND permit_ending_date IS NOT NULL 
       AND permit_ending_date < ? 
       AND registration_status != 'pending'`,
      [todayStr]
    );

    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No expired permits found',
        updated: 0
      });
    }

    // Update registration_status to 'pending' for all expired permits
    const [result] = await masterPool.query(
      `UPDATE students 
       SET registration_status = 'pending' 
       WHERE fee_status = 'permitted' 
       AND permit_ending_date IS NOT NULL 
       AND permit_ending_date < ? 
       AND registration_status != 'pending'`,
      [todayStr]
    );

    clearStudentsCache();

    res.json({
      success: true,
      message: `Updated ${result.affectedRows} student(s) with expired permits`,
      updated: result.affectedRows
    });
  } catch (error) {
    console.error('Check expired permits error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking expired permits'
    });
  }
};

// Update registration status
exports.updateRegistrationStatus = async (req, res) => {
  try {
    const { admissionNumber } = req.params;
    const { registration_status } = req.body;

    if (!registration_status) {
      return res.status(400).json({
        success: false,
        message: 'Registration status is required'
      });
    }

    try {
      // Try updating the column directly first
      const [result] = await masterPool.query(
        'UPDATE students SET registration_status = ? WHERE admission_number = ?',
        [registration_status, admissionNumber]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
    } catch (err) {
      // If column doesn't exist, fall back to JSON student_data
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await masterPool.query(
          'SELECT student_data FROM students WHERE admission_number = ? LIMIT 1',
          [admissionNumber]
        );
        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const current = rows[0]?.student_data || '{}';
        let parsed;
        try { parsed = JSON.parse(current || '{}'); } catch (_e) { parsed = {}; }

        parsed.registration_status = registration_status;
        parsed['Registration Status'] = registration_status;

        const serialized = JSON.stringify(parsed);
        const [upd] = await masterPool.query(
          'UPDATE students SET student_data = ? WHERE admission_number = ?',
          [serialized, admissionNumber]
        );
        if (upd.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Student not found' });
        }
      } else {
        throw err;
      }
    }

    // Audit Log for Registration Status Update
    await writeAuditLog(masterPool, {
      actionType: 'UPDATE_REGISTRATION_STATUS',
      entityType: 'STUDENT',
      entityId: admissionNumber,
      actor: req.user || req.admin,
      details: {
        registration_status
      }
    });

    clearStudentsCache();

    res.json({
      success: true,
      message: 'Registration status updated successfully'
    });
  } catch (error) {
    console.error('Update registration status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating registration status'
    });
  }
};

// Bulk resend passwords
exports.bulkResendPasswords = async (req, res) => {
  try {
    const { students } = req.body; // Array of admission numbers
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'No students selected' });
    }

    const { generateCredentialsByAdmissionNumber } = require('../utils/studentCredentials');
    const results = [];
    let successCount = 0;

    // Process in chunks to avoid overwhelming SMS provider
    const chunkSize = 5;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (admissionNumber) => {
        try {
          // Pass false for isPasswordReset to use the "Account Created" template (Template 1)
          // This matches the "First Password Creation" workflow as requested by the user
          const result = await generateCredentialsByAdmissionNumber(admissionNumber, false);
          if (result.success) {
            successCount++;
            results.push({
              admission_number: admissionNumber,
              status: 'Success',
              error: null
            });
          } else {
            results.push({
              admission_number: admissionNumber,
              status: 'Failed',
              error: result.error
            });
          }
        } catch (e) {
          results.push({
            admission_number: admissionNumber,
            status: 'Failed',
            error: e.message
          });
        }
      }));
    }

    res.json({
      success: true,
      data: results,
      summary: {
        total: students.length,
        success: successCount,
        failed: students.length - successCount
      }
    });
  } catch (error) {
    console.error('Bulk resend error:', error);
    res.status(500).json({ success: false, message: 'Server error during bulk processing' });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    // Sanitize mobile number (keep only digits)
    const cleanMobile = mobileNumber.replace(/\D/g, '');

    if (cleanMobile.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number'
      });
    }

    // Find students with this mobile number
    // We check both student_mobile and parent_mobile1 just in case, but usually student_mobile
    const [students] = await masterPool.query(
      `SELECT admission_number, student_name FROM students 
       WHERE REGEXP_REPLACE(student_mobile, '[^0-9]', '') LIKE ?`,
      [`%${cleanMobile}%`]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student found with this mobile number'
      });
    }

    const { generateCredentialsByAdmissionNumber } = require('../utils/studentCredentials');
    const results = [];

    // Generate and send new password for each matching student
    for (const student of students) {
      try {
        // isPasswordReset = true
        const result = await generateCredentialsByAdmissionNumber(student.admission_number, true);
        results.push({
          admission_number: student.admission_number,
          success: result.success,
          error: result.error
        });
      } catch (error) {
        results.push({
          admission_number: student.admission_number,
          success: false,
          error: error.message
        });
      }
    }

    const setCookie = results.some(r => r.success);

    if (!setCookie) {
      return res.status(500).json({
        success: false,
        message: 'Failed to reset password for found students',
        results
      });
    }

    res.json({
      success: true,
      message: 'New password has been sent to your mobile number',
      data: results
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing forgot password'
    });
  }
};

// Change Password (Authenticated Student)
exports.changePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    // User should be attached by auth middleware
    const studentId = req.user?.id;
    // JWT payload has admissionNumber (camelCase), but we checked for admission_number (snake_case)
    const admissionNumber = req.user?.admissionNumber || req.user?.admission_number;

    if (!studentId || !admissionNumber) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update credentials
    await masterPool.query(
      `UPDATE student_credentials 
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE admission_number = ?`,
      [passwordHash, admissionNumber]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password'
    });
  }
};

// Get student SMS logs
exports.getStudentSmsLogs = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    // First get student ID and scope check
    let query = 'SELECT id, college, course, branch FROM students WHERE admission_number = ?';
    let params = [admissionNumber];

    // Apply scope check if userScope exists
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        query += ` AND ${scopeCondition}`;
        params = [...params, ...scopeParams];
      }
    }

    const [students] = await masterPool.query(query, params);

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found or you don\'t have permission to view this student'
      });
    }

    const studentId = students[0].id;

    // Fetch SMS logs
    const [logs] = await masterPool.query(
      `SELECT 
        id, 
        message, 
        category, 
        current_year, 
        current_semester, 
        status, 
        sent_at, 
        mobile_number 
      FROM sms_logs 
      WHERE student_id = ? 
      ORDER BY sent_at DESC`,
      [studentId]
    );

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Failed to fetch SMS logs:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching SMS logs'
    });
  }
};

// Handle student rejoin - move student from one batch to another with rejoined status
exports.rejoinStudent = async (req, res) => {
  try {
    const { admissionNumber } = req.params;
    const { fromBatch, toBatch, remarks } = req.body;
    const adminId = req.user?.id;

    // Validation
    if (!fromBatch || !toBatch) {
      return res.status(400).json({
        success: false,
        message: 'Both fromBatch and toBatch are required'
      });
    }

    if (!remarks || !remarks.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Remarks are required for rejoining'
      });
    }

    if (fromBatch === toBatch) {
      return res.status(400).json({
        success: false,
        message: 'Student is already in the selected batch'
      });
    }

    // Fetch student
    const [students] = await masterPool.query(
      'SELECT * FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = students[0];

    // Parse student_data if it's a string
    let studentData = student.student_data;
    if (typeof studentData === 'string') {
      try {
        studentData = JSON.parse(studentData);
      } catch (e) {
        studentData = {};
      }
    }

    // Determine target batch's current year and semester
    let newYear = student.current_year;
    let newSemester = student.current_semester;

    try {
      const [targetBatchInfo] = await masterPool.query(
        `SELECT current_year, current_semester 
         FROM students 
         WHERE batch = ? AND course = ? AND branch = ? AND student_status = 'Regular' 
         AND current_year IS NOT NULL AND current_semester IS NOT NULL
         LIMIT 1`,
        [toBatch, student.course, student.branch]
      );

      if (targetBatchInfo.length > 0) {
        newYear = targetBatchInfo[0].current_year;
        newSemester = targetBatchInfo[0].current_semester;

        // Also update studentData with the new year and semester
        studentData['Current Year'] = newYear;
        studentData['Current Semester'] = newSemester;
      }
    } catch (batchErr) {
      console.error('Failed to get target batch year/semester info:', batchErr);
    }

    // Update student with new batch and rejoined status
    const updatedStudentData = {
      ...studentData,
      batch: toBatch,
      student_status: 'Regular',
      rejoin_status: 'Rejoined',
      rejoin_from_batch: fromBatch,
      rejoin_to_batch: toBatch,
      rejoin_date: new Date().toISOString().split('T')[0],
      rejoin_remarks: remarks
    };

    // Ensure student data has the remarks logged
    // Get the actor for remarks logging
    const actor = req.user || req.admin;
    const authorName = actor?.username || actor?.name || 'System';
    const authorId = actor?.id || null;

    const getCategory = (role) => {
      switch (role) {
        case 'college_principal': return 'Principal';
        case 'college_ao': return 'AO';
        case 'branch_hod': return 'HOD';
        case 'cashier': return 'Accountant';
        case 'super_admin':
        case 'admin': return 'Admin';
        default: return 'Other';
      }
    };
    const category = getCategory(actor?.role || 'admin');

    const rejoinRemarkStr = `[Rejoin] Rejoined from ${fromBatch} to ${toBatch} on ${new Date().toISOString().split('T')[0]}. ${remarks}`;

    // Update the student record
    await masterPool.query(
      `UPDATE students 
       SET batch = ?, 
           student_status = ?, 
           current_year = ?,
           current_semester = ?,
           student_data = ?
       WHERE admission_number = ?`,
      [
        toBatch,
        'Regular',
        newYear,
        newSemester,
        JSON.stringify(updatedStudentData),
        admissionNumber
      ]
    );

    // Record the remark in student_remarks table
    try {
      await masterPool.query(
        `INSERT INTO student_remarks 
             (admission_number, remark, remark_category, student_year, student_semester, created_by, created_by_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          admissionNumber,
          rejoinRemarkStr,
          category,
          newYear || 1,
          newSemester || 1,
          authorId,
          authorName
        ]
      );
    } catch (remarkErr) {
      console.error('Failed to sync rejoin remark to student_remarks:', remarkErr.message);
    }

    // Record in student history
    try {
      await masterPool.query(
        `INSERT INTO student_history 
         (student_id, admission_number, action_type, action_details, performed_by, performed_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          student.id,
          admissionNumber,
          'rejoin',
          JSON.stringify({
            fromBatch,
            toBatch,
            remarks,
            previousStatus: student.student_status,
            newStatus: 'Regular (Rejoined)',
            newYear,
            newSemester
          }),
          authorId
        ]
      );
    } catch (historyError) {
      console.error('Failed to record rejoin in history:', historyError);
      // Continue even if history recording fails
    }

    // Also record in audit_logs for the Edit History tab
    await writeAuditLog(masterPool, {
      actionType: 'REJOIN',
      entityType: 'STUDENT',
      entityId: admissionNumber,
      actor: actor,
      details: {
        fromBatch,
        toBatch,
        remarks,
        previousStatus: student.student_status,
        newStatus: 'Regular (Rejoined)',
        newYear,
        newSemester
      }
    });

    // Clear cache
    clearStudentsCache();

    // Fetch updated student
    const [updatedStudents] = await masterPool.query(
      'SELECT * FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    res.json({
      success: true,
      message: `Student successfully rejoined from ${fromBatch} to ${toBatch}`,
      data: updatedStudents[0]
    });

  } catch (error) {
    console.error('Failed to process student rejoin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing rejoin'
    });
  }
};
// Get Registration Report
exports.getRegistrationReport = async (req, res) => {
  try {
    const {
      filter_batch,
      filter_course,
      filter_branch,
      filter_year,
      filter_semester,
      filter_college,
      filter_level,
      filter_scholarship_status,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const offset = (pageNum - 1) * limitNum;

    const normalizedFilterBatch = filter_batch && filter_batch.trim().length > 0 ? filter_batch.trim() : null;
    const normalizedFilterCollege = filter_college && filter_college.trim().length > 0 ? filter_college.trim() : null;
    const normalizedFilterCourse = filter_course && filter_course.trim().length > 0 ? filter_course.trim() : null;
    const normalizedFilterBranch = filter_branch && filter_branch.trim().length > 0 ? filter_branch.trim() : null;
    const parsedFilterYear = filter_year ? parseInt(filter_year, 10) : null;
    const parsedFilterSemester = filter_semester ? parseInt(filter_semester, 10) : null;

    // Fetch exclude settings
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for registration report:', err);
    }

    let baseQuery = 'FROM students WHERE 1=1';
    const params = [];

    // Apply Exclusions
    /*
    if (excludedCourses.length > 0) {
      baseQuery += ` AND course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      params.push(...excludedCourses);
    }
    */

    if (excludedStudents.length > 0) {
      baseQuery += ` AND admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      params.push(...excludedStudents);
    }

    // Apply user scope filtering
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        baseQuery += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    // Filter for REGULAR students only (Matches Attendance Page Logic)
    baseQuery += " AND student_status = 'Regular'";

    // Apply Filters
    if (normalizedFilterBatch) {
      baseQuery += ' AND batch = ?';
      params.push(normalizedFilterBatch);
    }
    if (normalizedFilterCollege) {
      baseQuery += ' AND college = ?';
      params.push(normalizedFilterCollege);
    }
    if (normalizedFilterCourse) {
      baseQuery += ' AND course = ?';
      params.push(normalizedFilterCourse);
    }
    if (normalizedFilterBranch) {
      baseQuery += ' AND branch = ?';
      params.push(normalizedFilterBranch);
    }
    if (parsedFilterYear) {
      baseQuery += ' AND current_year = ?';
      params.push(parsedFilterYear);
    }
    if (parsedFilterSemester) {
      baseQuery += ' AND current_semester = ?';
      params.push(parsedFilterSemester);
    }

    // Filter by level if provided
    if (filter_level) {
      try {
        // Get courses with the specified level
        const [levelCourses] = await masterPool.query(
          'SELECT name FROM courses WHERE level = ? AND is_active = 1',
          [filter_level]
        );
        const validCourseNames = levelCourses.map(c => c.name);
        if (validCourseNames.length > 0) {
          const placeholders = validCourseNames.map(() => '?').join(',');
          baseQuery += ` AND course IN (${placeholders})`;
          params.push(...validCourseNames);
        } else {
          // No courses with this level, return empty result
          baseQuery += ' AND 1=0';
        }
      } catch (err) {
        console.warn('Failed to filter by level:', err);
      }
    }

    if (search) {
      const searchPattern = `%${search.trim()}%`;
      baseQuery += ` AND (
        admission_number LIKE ? 
        OR admission_no LIKE ? 
        OR pin_no LIKE ? 
        OR student_name LIKE ?
      )`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Scholarship status filter (pending = empty, eligible = has eligible/jvd/yes, not_eligible = not eligible)
    const scholarshipFilter = (filter_scholarship_status || '').trim().toLowerCase();
    if (scholarshipFilter === 'pending') {
      baseQuery += " AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '')";
    } else if (scholarshipFilter === 'eligible') {
      baseQuery += " AND scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' AND (LOWER(scholar_status) LIKE '%eligible%' OR LOWER(scholar_status) LIKE '%jvd%' OR LOWER(scholar_status) LIKE '%yes%')";
    } else if (scholarshipFilter === 'not_eligible') {
      baseQuery += " AND LOWER(IFNULL(scholar_status,'')) LIKE '%not%' AND LOWER(scholar_status) LIKE '%eligible%'";
    }

    // Get Total Count
    const countQuery = `SELECT COUNT(id) as total ${baseQuery}`;
    const [countResult] = await masterPool.query(countQuery, params);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Statistics Query - Efficient single-pass aggregation
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN (student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%') THEN 1 ELSE 0 END) as verification_completed,
        SUM(CASE WHEN certificates_status LIKE '%Verified%' OR certificates_status = 'completed' THEN 1 ELSE 0 END) as certificates_verified,
        SUM(CASE WHEN certificates_status = 'Temporary' OR certificates_status = 'temporary' THEN 1 ELSE 0 END) as certificates_temporary,
        SUM(CASE WHEN fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%' THEN 1 ELSE 0 END) as fee_cleared,
        SUM(CASE WHEN current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '' THEN 1 ELSE 0 END) as promotion_completed,
        SUM(CASE WHEN scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' THEN 1 ELSE 0 END) as scholarship_assigned,
        SUM(CASE WHEN scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '' THEN 1 ELSE 0 END) as scholarship_pending,
        SUM(CASE WHEN 
             (registration_status = 'Completed' OR registration_status = 'completed') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status LIKE '%Verified%' OR certificates_status = 'completed') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_completed,
        SUM(CASE WHEN 
             (registration_status = 'Temporary' OR registration_status = 'temporary') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status = 'Temporary' OR certificates_status = 'temporary') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_temporary
      ${baseQuery}
    `;

    const [statsResult] = await masterPool.query(statsQuery, params);
    const statsRow = statsResult[0] || {};
    const totalCount = parseInt(statsRow.total || 0);

    const statistics = {
      total: totalCount,
      registration: {
        completed: parseInt(statsRow.overall_completed || 0),
        temporary: parseInt(statsRow.overall_temporary || 0),
        pending: totalCount - parseInt(statsRow.overall_completed || 0) - parseInt(statsRow.overall_temporary || 0)
      },
      verification: {
        completed: parseInt(statsRow.verification_completed || 0),
        pending: totalCount - parseInt(statsRow.verification_completed || 0)
      },
      certificates: {
        verified: parseInt(statsRow.certificates_verified || 0),
        temporary: parseInt(statsRow.certificates_temporary || 0),
        pending: totalCount - parseInt(statsRow.certificates_verified || 0) - parseInt(statsRow.certificates_temporary || 0)
      },
      fees: {
        cleared: parseInt(statsRow.fee_cleared || 0),
        pending: totalCount - parseInt(statsRow.fee_cleared || 0)
      },
      promotion: {
        completed: parseInt(statsRow.promotion_completed || 0),
        pending: totalCount - parseInt(statsRow.promotion_completed || 0)
      },
      scholarship: {
        assigned: parseInt(statsRow.scholarship_assigned || 0),
        pending: parseInt(statsRow.scholarship_pending || 0)
      },
      overall: {
        completed: parseInt(statsRow.overall_completed || 0),
        temporary: parseInt(statsRow.overall_temporary || 0),
        pending: totalCount - parseInt(statsRow.overall_completed || 0) - parseInt(statsRow.overall_temporary || 0)
      }
    };

    // Get Data - specific columns only for performance
    const dataQuery = `
      SELECT 
        id, pin_no, student_name, admission_number, batch, course, branch, 
        current_year, current_semester, student_data, 
        certificates_status, fee_status, scholar_status, registration_status
      ${baseQuery} 
      ORDER BY pin_no ASC, id ASC 
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limitNum, offset];

    const [students] = await masterPool.query(dataQuery, dataParams);

    // Process students to calculate 5 stages status
    const reportData = students.map(student => {
      let studentData = {};
      try {
        studentData = typeof student.student_data === 'string'
          ? JSON.parse(student.student_data || '{}')
          : (student.student_data || {});
      } catch (e) {
        const raw = student.student_data || '';
        const studentVerMatch = raw.match(/"is_student_mobile_verified"\s*:\s*(true|false)/);
        const parentVerMatch  = raw.match(/"is_parent_mobile_verified"\s*:\s*(true|false)/);
        studentData = {
          is_student_mobile_verified: studentVerMatch ? studentVerMatch[1] === 'true' : false,
          is_parent_mobile_verified:  parentVerMatch  ? parentVerMatch[1]  === 'true' : false,
        };
      }

      // Stage 1: Verification
      const isStudentVerified = !!studentData.is_student_mobile_verified;
      const isParentVerified = !!studentData.is_parent_mobile_verified;
      const verificationStatus = (isStudentVerified && isParentVerified) ? 'completed' : 'pending';

      // Stage 2: Certificates
      const certStatusRaw = (student.certificates_status || '').toLowerCase();
      const isCertVerified = certStatusRaw.includes('verified');
      const isCertTemporary = certStatusRaw.includes('temporary');

      let certificatesStatusDisplay = 'Unverified';
      let certificatesStatus = 'pending';

      if (isCertTemporary) {
        certificatesStatusDisplay = 'Temporary';
        certificatesStatus = 'temporary';
      } else if (isCertVerified) {
        certificatesStatusDisplay = 'Verified';
        certificatesStatus = 'completed';
      }

      // Stage 3: Fee Status
      const feeRaw = (student.fee_status || '').toLowerCase();
      let feeStatusDisplay = student.fee_status || 'Pending';
      if (feeRaw.includes('no_due') || feeRaw.includes('nodue') || feeRaw.includes('no due')) feeStatusDisplay = 'No Due';
      else if (feeRaw.includes('permitted')) feeStatusDisplay = 'Permitted';
      else if (feeRaw.includes('completed')) feeStatusDisplay = 'No Due';

      const isFeeCleared = ['completed', 'no_due', 'nodue', 'no due', 'partially_completed', 'partial', 'permitted'].some(s => feeRaw.includes(s));
      const feeStatus = isFeeCleared ? 'completed' : 'pending';

      // Stage 4: Promotion
      const promotionStatus = (student.current_year && student.current_semester) ? 'completed' : 'pending';

      // Stage 5: Scholarship (MANDATORY - must have a status)
      const scholarRaw = (student.scholar_status || '').toLowerCase();
      let scholarshipStatusDisplay = student.scholar_status || 'Pending';

      if (scholarRaw.includes('jvd') || scholarRaw.includes('yes') || scholarRaw.includes('eligible')) {
        // Keep valid status as is
      } else if (!student.scholar_status || scholarRaw === '' || scholarRaw === 'null' || scholarRaw === 'undefined') {
        // Empty scholarship is NOT acceptable - step is mandatory
        scholarshipStatusDisplay = 'Pending';
      } else {
        // Any other status (not eligible, etc.) is considered reviewed/completed
        scholarshipStatusDisplay = student.scholar_status || 'Pending';
      }

      // Scholarship is MANDATORY - must have a status (not empty/null)
      const scholarshipStatus = (!student.scholar_status || scholarRaw === '' || scholarRaw === 'null' || scholarRaw === 'undefined')
        ? 'pending'  // Empty is NOT acceptable - step is mandatory
        : 'completed'; // Any status (including not eligible) means it's been reviewed

      // Overall Registration Status (All 5 steps must be completed including Scholarship)
      // Also consider the DB column if it's already marked as Completed or Temporary
      let overallStatus = 'pending';

      if (student.registration_status && student.registration_status.toLowerCase() === 'completed') {
        overallStatus = 'completed';
      } else if (student.registration_status && student.registration_status.toLowerCase() === 'temporary') {
        overallStatus = 'Temporary';
      } else if (
        verificationStatus === 'completed' &&
        certificatesStatus === 'completed' &&
        feeStatus === 'completed' &&
        promotionStatus === 'completed' &&
        scholarshipStatus === 'completed'
      ) {
        overallStatus = 'completed';
      } else if (
        verificationStatus === 'completed' &&
        certificatesStatus === 'temporary' &&
        feeStatus === 'completed' &&
        promotionStatus === 'completed' &&
        scholarshipStatus === 'completed'
      ) {
        overallStatus = 'Temporary';
      }

      return {
        id: student.id,
        pin_no: student.pin_no || student.admission_number || 'N/A',
        student_name: student.student_name,
        admission_number: student.admission_number,
        batch: student.batch || studentData.Batch || studentData.batch || 'Unknown',
        course: student.course,
        branch: student.branch,
        current_year: student.current_year,
        current_semester: student.current_semester,
        stages: {
          verification: verificationStatus,
          certificates: certificatesStatusDisplay,
          fee: feeStatusDisplay,
          promotion: promotionStatus,
          scholarship: scholarshipStatusDisplay
        },
        overall_status: overallStatus
      };
    });

    res.json({
      success: true,
      data: reportData,
      statistics,
      pagination: {
        total: totalRecords,
        page: pageNum,
        totalPages: totalPages,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching registration report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registration report'
    });
  }
};

// Get Registration Abstract (College/Course wise summary)
exports.getRegistrationAbstract = async (req, res) => {
  try {
    const {
      filter_batch,
      filter_course,
      filter_branch,
      filter_year,
      filter_semester,
      filter_college,
      filter_level,
      filter_scholarship_status,
      search
    } = req.query;

    // Fetch exclude settings
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for abstract:', err);
    }

    let baseQuery = 'FROM students WHERE 1=1';
    const params = [];

    // Apply user scope filtering
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        baseQuery += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }



    // Filter for REGULAR students only
    baseQuery += " AND student_status = 'Regular'";

    // Apply Exclusions
    /*
    if (excludedCourses.length > 0) {
      baseQuery += ` AND course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      params.push(...excludedCourses);
    }
    */

    if (excludedStudents.length > 0) {
      baseQuery += ` AND admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      params.push(...excludedStudents);
    }

    // Apply Filters
    const normalizedFilterBatch = filter_batch && filter_batch.trim().length > 0 ? filter_batch.trim() : null;
    const normalizedFilterCollege = filter_college && filter_college.trim().length > 0 ? filter_college.trim() : null;
    const normalizedFilterCourse = filter_course && filter_course.trim().length > 0 ? filter_course.trim() : null;
    const normalizedFilterBranch = filter_branch && filter_branch.trim().length > 0 ? filter_branch.trim() : null;
    const parsedFilterYear = filter_year ? parseInt(filter_year, 10) : null;
    const parsedFilterSemester = filter_semester ? parseInt(filter_semester, 10) : null;

    if (normalizedFilterBatch) { baseQuery += ' AND batch = ?'; params.push(normalizedFilterBatch); }
    if (normalizedFilterCollege) { baseQuery += ' AND college = ?'; params.push(normalizedFilterCollege); }
    if (normalizedFilterCourse) { baseQuery += ' AND course = ?'; params.push(normalizedFilterCourse); }
    if (normalizedFilterBranch) { baseQuery += ' AND branch = ?'; params.push(normalizedFilterBranch); }
    if (parsedFilterYear) { baseQuery += ' AND current_year = ?'; params.push(parsedFilterYear); }
    if (parsedFilterSemester) { baseQuery += ' AND current_semester = ?'; params.push(parsedFilterSemester); }

    // Filter by level if provided
    if (filter_level) {
      try {
        // Get courses with the specified level
        const [levelCourses] = await masterPool.query(
          'SELECT name FROM courses WHERE level = ? AND is_active = 1',
          [filter_level]
        );
        const validCourseNames = levelCourses.map(c => c.name);
        if (validCourseNames.length > 0) {
          const placeholders = validCourseNames.map(() => '?').join(',');
          baseQuery += ` AND course IN (${placeholders})`;
          params.push(...validCourseNames);
        } else {
          // No courses with this level, return empty result
          baseQuery += ' AND 1=0';
        }
      } catch (err) {
        console.warn('Failed to filter by level:', err);
      }
    }

    if (search) {
      const searchPattern = `%${search.trim()}%`;
      baseQuery += ` AND (admission_number LIKE ? OR admission_no LIKE ? OR pin_no LIKE ? OR student_name LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const scholarshipFilterAbstract = (filter_scholarship_status || req.query.filter_scholarshipStatus || '').trim().toLowerCase();
    if (scholarshipFilterAbstract === 'pending') {
      baseQuery += " AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '')";
    } else if (scholarshipFilterAbstract === 'eligible') {
      baseQuery += " AND scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' AND (LOWER(scholar_status) LIKE '%eligible%' OR LOWER(scholar_status) LIKE '%jvd%' OR LOWER(scholar_status) LIKE '%yes%')";
    } else if (scholarshipFilterAbstract === 'not_eligible') {
      baseQuery += " AND LOWER(IFNULL(scholar_status,'')) LIKE '%not%' AND LOWER(scholar_status) LIKE '%eligible%'";
    }

    // Grouping Logic:
    // If college is selected, group by Course? Or just College?
    // User asked for "with the collge wise". This usually means rows are colleges.
    // If a college IS filtered, we should probably drill down to Course.
    // Let's implement dynamic grouping based on filters level.
    // Detailed Grouping for Abstract View (User Request: "courses braches year and sem toatl clear wise with the all the 5 steps")
    const query = `
      SELECT 
        batch,
        college,
        course,
        branch,
        current_year,
        current_semester,
        COUNT(*) as total,
        SUM(CASE WHEN (student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%') THEN 1 ELSE 0 END) as verification_completed,
        SUM(CASE WHEN certificates_status LIKE '%Verified%' OR certificates_status = 'completed' THEN 1 ELSE 0 END) as certificates_verified,
        SUM(CASE WHEN certificates_status = 'Temporary' OR certificates_status = 'temporary' THEN 1 ELSE 0 END) as certificates_temporary,
        SUM(CASE WHEN fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%' THEN 1 ELSE 0 END) as fee_cleared,
        SUM(CASE WHEN current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '' THEN 1 ELSE 0 END) as promotion_completed,
        SUM(CASE WHEN scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' THEN 1 ELSE 0 END) as scholarship_assigned,
        SUM(CASE WHEN scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '' THEN 1 ELSE 0 END) as scholarship_pending,
        SUM(CASE WHEN 
             (registration_status = 'Completed' OR registration_status = 'completed') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status LIKE '%Verified%' OR certificates_status = 'completed') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_completed,
        SUM(CASE WHEN 
             (registration_status = 'Temporary' OR registration_status = 'temporary') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status = 'Temporary' OR certificates_status = 'temporary') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_temporary
      ${baseQuery}
      GROUP BY batch, college, course, branch, current_year, current_semester
      ORDER BY batch, college, course, branch, current_year, current_semester ASC
    `;

    const [rows] = await masterPool.query(query, params);

    res.json({
      success: true,
      data: rows,
      groupingParams: {
        key: 'custom',
        label: 'Detailed'
      }
    });

  } catch (error) {
    console.error('Error fetching registration abstract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registration abstract'
    });
  }
};

// Export Registration Report (Excel/PDF)
exports.exportRegistrationReport = async (req, res) => {
  try {
    const {
      filter_batch,
      filter_course,
      filter_branch,
      filter_year,
      filter_semester,
      filter_college,
      filter_level,
      filter_scholarship_status,
      search,
      format = 'excel'
    } = req.query;

    const normalizedFilterBatch = filter_batch && filter_batch.trim().length > 0 ? filter_batch.trim() : null;
    const normalizedFilterCollege = filter_college && filter_college.trim().length > 0 ? filter_college.trim() : null;
    const normalizedFilterCourse = filter_course && filter_course.trim().length > 0 ? filter_course.trim() : null;
    const normalizedFilterBranch = filter_branch && filter_branch.trim().length > 0 ? filter_branch.trim() : null;
    const parsedFilterYear = filter_year ? parseInt(filter_year, 10) : null;
    const parsedFilterSemester = filter_semester ? parseInt(filter_semester, 10) : null;

    // Fetch exclude settings
    let excludedCourses = [];
    let excludedStudents = [];
    try {
      const [settings] = await masterPool.query(
        'SELECT value FROM settings WHERE `key` = ?',
        ['attendance_config']
      );
      if (settings && settings.length > 0) {
        const config = JSON.parse(settings[0].value);
        if (Array.isArray(config.excludedCourses)) excludedCourses = config.excludedCourses;
        if (Array.isArray(config.excludedStudents)) excludedStudents = config.excludedStudents;
      }
    } catch (err) {
      console.warn('Failed to fetch attendance config for export:', err);
    }

    let baseQuery = 'FROM students WHERE 1=1';
    const params = [];

    // Apply user scope filtering
    if (req.userScope) {
      const { scopeCondition, params: scopeParams } = getScopeConditionString(req.userScope, 'students');
      if (scopeCondition) {
        baseQuery += ` AND ${scopeCondition}`;
        params.push(...scopeParams);
      }
    }

    baseQuery += " AND student_status = 'Regular'";

    // Apply Exclusions
    /*
    if (excludedCourses.length > 0) {
      baseQuery += ` AND course NOT IN (${excludedCourses.map(() => '?').join(',')})`;
      params.push(...excludedCourses);
    }
    */

    if (excludedStudents.length > 0) {
      baseQuery += ` AND admission_number NOT IN (${excludedStudents.map(() => '?').join(',')})`;
      params.push(...excludedStudents);
    }

    if (normalizedFilterBatch) { baseQuery += ' AND batch = ?'; params.push(normalizedFilterBatch); }
    if (normalizedFilterCollege) { baseQuery += ' AND college = ?'; params.push(normalizedFilterCollege); }
    if (normalizedFilterCourse) { baseQuery += ' AND course = ?'; params.push(normalizedFilterCourse); }
    if (normalizedFilterBranch) { baseQuery += ' AND branch = ?'; params.push(normalizedFilterBranch); }
    if (parsedFilterYear) { baseQuery += ' AND current_year = ?'; params.push(parsedFilterYear); }
    if (parsedFilterSemester) { baseQuery += ' AND current_semester = ?'; params.push(parsedFilterSemester); }

    // Filter by level if provided
    if (filter_level) {
      try {
        // Get courses with the specified level
        const [levelCourses] = await masterPool.query(
          'SELECT name FROM courses WHERE level = ? AND is_active = 1',
          [filter_level]
        );
        const validCourseNames = levelCourses.map(c => c.name);
        if (validCourseNames.length > 0) {
          const placeholders = validCourseNames.map(() => '?').join(',');
          baseQuery += ` AND course IN (${placeholders})`;
          params.push(...validCourseNames);
        } else {
          // No courses with this level, return empty result
          baseQuery += ' AND 1=0';
        }
      } catch (err) {
        console.warn('Failed to filter by level:', err);
      }
    }

    if (search) {
      const searchPattern = `%${search.trim()}%`;
      baseQuery += ` AND (admission_number LIKE ? OR admission_no LIKE ? OR pin_no LIKE ? OR student_name LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const scholarshipFilterExport = (filter_scholarship_status || req.query.filter_scholarshipStatus || '').trim().toLowerCase();
    if (scholarshipFilterExport === 'pending') {
      baseQuery += " AND (scholar_status IS NULL OR TRIM(IFNULL(scholar_status,'')) = '')";
    } else if (scholarshipFilterExport === 'eligible') {
      baseQuery += " AND scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != '' AND (LOWER(scholar_status) LIKE '%eligible%' OR LOWER(scholar_status) LIKE '%jvd%' OR LOWER(scholar_status) LIKE '%yes%')";
    } else if (scholarshipFilterExport === 'not_eligible') {
      baseQuery += " AND LOWER(IFNULL(scholar_status,'')) LIKE '%not%' AND LOWER(scholar_status) LIKE '%eligible%'";
    }

    // --- Statistics Query (For Abstract) ---
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN (student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%') THEN 1 ELSE 0 END) as verification_completed,
        SUM(CASE WHEN certificates_status LIKE '%Verified%' OR certificates_status = 'completed' THEN 1 ELSE 0 END) as certificates_verified,
        SUM(CASE WHEN fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%' THEN 1 ELSE 0 END) as fee_cleared,
        SUM(CASE WHEN 
             (registration_status = 'Completed' OR registration_status = 'completed') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status LIKE '%Verified%' OR certificates_status = 'completed') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_completed,
        SUM(CASE WHEN 
             (registration_status = 'Temporary' OR registration_status = 'temporary') OR
             (((student_data LIKE '%"is_student_mobile_verified":true%' OR student_data LIKE '%"is_student_mobile_verified": true%') AND (student_data LIKE '%"is_parent_mobile_verified":true%' OR student_data LIKE '%"is_parent_mobile_verified": true%')) AND
              (certificates_status = 'Temporary' OR certificates_status = 'temporary') AND
              (fee_status LIKE '%no_due%' OR fee_status LIKE '%no due%' OR fee_status LIKE '%permitted%' OR fee_status LIKE '%completed%' OR fee_status LIKE '%nodue%') AND
              (current_year IS NOT NULL AND current_year != '' AND current_semester IS NOT NULL AND current_semester != '') AND
              (scholar_status IS NOT NULL AND TRIM(IFNULL(scholar_status,'')) != ''))
             THEN 1 ELSE 0 END) as overall_temporary
      ${baseQuery}
    `;
    const [statsResult] = await masterPool.query(statsQuery, params);
    const statsRow = statsResult[0] || {};
    const totalCount = parseInt(statsRow.total || 0);

    const statistics = {
      total: totalCount,
      verification: { completed: parseInt(statsRow.verification_completed || 0) },
      certificates: { verified: parseInt(statsRow.certificates_verified || 0) },
      fees: { cleared: parseInt(statsRow.fee_cleared || 0) },
      overall: {
        completed: parseInt(statsRow.overall_completed || 0),
        temporary: parseInt(statsRow.overall_temporary || 0),
        pending: totalCount - parseInt(statsRow.overall_completed || 0) - parseInt(statsRow.overall_temporary || 0)
      }
    };

    // --- Data Query ---
    const dataQuery = `
      SELECT 
        id, pin_no, student_name, admission_number, course, branch, college, batch,
        current_year, current_semester, student_data, 
        certificates_status, fee_status, scholar_status, registration_status
      ${baseQuery} 
      ORDER BY pin_no ASC
    `;

    const [students] = await masterPool.query(dataQuery, params);

    // Process Data
    const processedData = students.map(student => {
      let studentData = {};
      try {
        studentData = typeof student.student_data === 'string'
          ? JSON.parse(student.student_data || '{}')
          : (student.student_data || {});
      } catch (e) {
        // student_data may be truncated (TEXT column limit) or malformed JSON.
        // Extract only the fields we need via regex as a fallback.
        const raw = student.student_data || '';
        const studentVerMatch = raw.match(/"is_student_mobile_verified"\s*:\s*(true|false)/);
        const parentVerMatch  = raw.match(/"is_parent_mobile_verified"\s*:\s*(true|false)/);
        studentData = {
          is_student_mobile_verified: studentVerMatch ? studentVerMatch[1] === 'true' : false,
          is_parent_mobile_verified:  parentVerMatch  ? parentVerMatch[1]  === 'true' : false,
        };
      }

      const isStudentVerified = studentData.is_student_mobile_verified === true;
      const isParentVerified = studentData.is_parent_mobile_verified === true;
      const verificationStatus = (isStudentVerified && isParentVerified) ? 'Completed' : 'Pending';

      const certStatusRaw = (student.certificates_status || '').toLowerCase();
      const isCertVerified = certStatusRaw.includes('verified') || certStatusRaw === 'completed';
      const isCertTemporary = certStatusRaw.includes('temporary');

      let certificatesStatus = 'Unverified';
      if (isCertTemporary) {
        certificatesStatus = 'Temporary';
      } else if (isCertVerified) {
        certificatesStatus = 'Verified';
      }

      const feeRaw = (student.fee_status || '').toLowerCase();
      let feeStatus = student.fee_status || 'Pending';
      if (feeRaw.includes('no_due') || feeRaw.includes('nodue') || feeRaw.includes('completed')) feeStatus = 'No Due';
      else if (feeRaw.includes('permitted')) feeStatus = 'Permitted';

      // Same fee-cleared logic as main report and stats query (including partial/permitted)
      const isFeeCleared = ['completed', 'no_due', 'nodue', 'no due', 'partially_completed', 'partial', 'permitted'].some(s => feeRaw.includes(s));

      let scholarshipStatus = student.scholar_status || 'Pending';
      const scholarRaw = (student.scholar_status || '').toLowerCase();
      if (!student.scholar_status || scholarRaw === '') scholarshipStatus = 'Pending';

      const promotionStatus = (student.current_year && student.current_semester) ? 'Completed' : 'Pending';

      // Overall Status Logic - must match main report and stats query (all 5 steps including scholarship)
      // Also prioritize the database column if it's already marked as Completed or Temporary
      const isScholarshipCompleted = student.scholar_status && student.scholar_status.trim() !== '' && student.scholar_status.toLowerCase() !== 'null' && student.scholar_status.toLowerCase() !== 'undefined';

      let overallStatus = 'Pending';
      if (student.registration_status && student.registration_status.toLowerCase() === 'completed') {
        overallStatus = 'Completed';
      } else if (student.registration_status && student.registration_status.toLowerCase() === 'temporary') {
        overallStatus = 'Temporary';
      } else if (
        verificationStatus === 'Completed' &&
        certificatesStatus === 'Verified' &&
        isFeeCleared &&
        promotionStatus === 'Completed' &&
        isScholarshipCompleted
      ) {
        overallStatus = 'Completed';
      } else if (
        verificationStatus === 'Completed' &&
        certificatesStatus === 'Temporary' &&
        isFeeCleared &&
        promotionStatus === 'Completed' &&
        isScholarshipCompleted
      ) {
        overallStatus = 'Temporary';
      }

      return {
        'Pin No': student.pin_no,
        'Student Name': student.student_name,
        'Admission No': student.admission_number,
        'Batch': student.batch || studentData.Batch || studentData.batch || 'Unknown',
        'College': student.college,
        'Course': student.course,
        'Branch': student.branch,
        'Year': student.current_year,
        'Semester': student.current_semester,
        'Verification': verificationStatus,
        'Certificates': certificatesStatus,
        'Fees': feeStatus,
        'Promotion': promotionStatus,
        'Scholarship': scholarshipStatus,
        'overall_status': overallStatus
      };
    });

    if (format === 'excel') {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      // -- Summary Sheet --
      const summaryData = [
        ['Registration Abstract Report'],
        ['Generated On', new Date().toLocaleString()],
        [''],
        ['Filters'],
        ['Batch', normalizedFilterBatch || 'All'],
        ['Course', normalizedFilterCourse || 'All'],
        ['Branch', normalizedFilterBranch || 'All'],
        [''],
        ['Statistics'],
        ['Total Students', statistics.total],
        ['Overall Completed', statistics.overall.completed],
        ['Overall Temporary', statistics.overall.temporary],
        ['Registration Pending', statistics.overall.pending],
        ['Mobile Verified', statistics.verification.completed],
        ['Fees Cleared', statistics.fees.cleared]
      ];
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);

      // -- 1. Aggregate Data for Abstract Table --
      const groupedData = {};

      processedData.forEach(student => {
        const batchKey = (student.Batch || 'Unknown').toString();
        const courseKey = (student.Course || 'Unknown').toString();
        const branchKey = (student.Branch || 'Unknown').toString();
        const yearKey = (student.Year || '0').toString();
        const semKey = (student.Semester || '0').toString();

        const uniqueKey = `${batchKey}|${courseKey}|${branchKey}|${yearKey}|${semKey}`;

        if (!groupedData[uniqueKey]) {
          groupedData[uniqueKey] = {
            batch: batchKey,
            course: courseKey,
            branch: branchKey,
            year: yearKey,
            sem: semKey,
            total: 0,
            overall_completed: 0,
            pending: 0,
            verification_completed: 0,
            certificates_verified: 0,
            fee_cleared: 0,
            promotion_completed: 0,
            scholarship_assigned: 0,
            scholarship_pending: 0
          };
        }

        const group = groupedData[uniqueKey];
        group.total++;

        // Status Logic matching frontend/pdf
        if (student.overall_status === 'Completed') group.overall_completed++;
        else group.pending++;

        // Detailed Breakdown
        // Detailed Breakdown
        if (student['Verification'] === 'Completed') group.verification_completed++;
        if (student['Certificates'] === 'Verified' || student['Certificates'] === 'completed') group.certificates_verified++;
        if (student['Fees'] === 'No Due' || student['Fees'] === 'Permitted' || student['Fees'] === 'completed') group.fee_cleared++;
        if (student['Promotion'] === 'Completed') group.promotion_completed++;
        if (student['Scholarship'] && student['Scholarship'] !== 'Pending') group.scholarship_assigned++;
        if (student['Scholarship'] === 'Pending') group.scholarship_pending++;
      });

      // Convert to rows and sort
      const abstractExcelRows = Object.values(groupedData).sort((a, b) => {
        if (a.batch !== b.batch) return a.batch.localeCompare(b.batch);
        if (a.course !== b.course) return a.course.localeCompare(b.course);
        if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
        if (a.year !== b.year) return a.year.localeCompare(b.year);
        return a.sem.localeCompare(b.sem);
      });

      // Prepare Abstract Sheet Data
      // Columns: Batch, Course, Branch, Year, Sem, Total, Overall Completed, Pending, Verify, Certs, Fees, Promo, Schol
      const abstractSheetData = abstractExcelRows.map(row => ({
        Batch: row.batch,
        Course: row.course,
        Branch: row.branch,
        Year: row.year,
        Sem: row.sem,
        'Total Students': row.total,
        'Overall Completed': row.overall_completed,
        'Pending': row.pending,
        'Verification': `${row.verification_completed}/${row.total - row.verification_completed}`,
        'Certificates': `${row.certificates_verified}/${row.total - row.certificates_verified}`,
        'Fees': `${row.fee_cleared}/${row.total - row.fee_cleared}`,
        'Promotion': `${row.promotion_completed}/${row.total - row.promotion_completed}`,
        'Scholarship': `${row.scholarship_assigned}/${row.scholarship_pending}`,
      }));

      // Add Grand Total Row
      const totals = abstractExcelRows.reduce((acc, row) => {
        acc.total += row.total;
        acc.overall_completed += row.overall_completed;
        acc.pending += row.pending;
        acc.verification_completed += row.verification_completed;
        acc.certificates_verified += row.certificates_verified;
        acc.fee_cleared += row.fee_cleared;
        acc.promotion_completed += row.promotion_completed;
        acc.scholarship_assigned += row.scholarship_assigned;
        acc.scholarship_pending += row.scholarship_pending;
        return acc;
      }, { total: 0, overall_completed: 0, pending: 0, verification_completed: 0, certificates_verified: 0, fee_cleared: 0, promotion_completed: 0, scholarship_assigned: 0, scholarship_pending: 0 });

      abstractSheetData.push({
        Batch: 'TOTAL',
        Course: '', Branch: '', Year: '', Sem: '',
        'Total Students': totals.total,
        'Overall Completed': totals.overall_completed,
        'Pending': totals.pending,
        'Verification': totals.verification_completed,
        'Certificates': totals.certificates_verified,
        'Fees': totals.fee_cleared,
        'Promotion': totals.promotion_completed,
        'Scholarship': `${totals.scholarship_assigned}/${totals.scholarship_pending}`
      });

      const abstractWs = XLSX.utils.json_to_sheet(abstractSheetData);

      // Add Abstract Sheet FIRST (Primary)
      XLSX.utils.book_append_sheet(wb, abstractWs, 'Abstract Report');

      // Add Summary stats sheet (Legacy, optional, rename to 'Summary Stats')
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary Stats');

      // -- Data Sheet (Detailed Student List) --
      // Process processedData for Excel
      const excelRows = processedData.map(d => {
        const row = { ...d };
        if (row.stages) {
          // Flatten stages for better excel view
          row['Stage: Verification'] = row.stages.verification;
          row['Stage: Certificates'] = row.stages.certificates;
          row['Stage: Fee'] = row.stages.fee;
          row['Stage: Promotion'] = row.stages.promotion;
          row['Stage: Scholarship'] = row.stages.scholarship;
          delete row.stages;
        }
        delete row.overall_status; // Redundant or map
        // Add calculated overall status text
        row['Overall Status'] = d.overall_status;
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wscols = Object.keys(excelRows[0] || {}).map(() => ({ wch: 20 }));
      ws['!cols'] = wscols;

      // Add detailed sheet second (or third)
      XLSX.utils.book_append_sheet(wb, ws, 'Detailed Data');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="Registration_Report.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    else if (format === 'pdf') {
      // Use the new centralized PDF generator
      const pdfPath = await generateRegistrationReportPDF({
        collegeName: normalizedFilterCollege || 'All Colleges',
        batch: normalizedFilterBatch,
        courseName: normalizedFilterCourse,
        branchName: normalizedFilterBranch,
        year: parsedFilterYear,
        semester: parsedFilterSemester,
        students: processedData,
        statistics: statistics
      });

      const fileBuffer = fs.readFileSync(pdfPath);
      fs.unlinkSync(pdfPath);

      res.setHeader('Content-Disposition', 'attachment; filename="Registration_Report.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(fileBuffer);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid format' });
    }

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Admin manually verify mobile (Student/Parent)
exports.adminVerifyMobile = async (req, res) => {
  try {
    const { admissionNumber, type } = req.body; // type: 'student' or 'parent'

    if (!admissionNumber || !type) {
      return res.status(400).json({
        success: false,
        message: 'Admission number and verification type are required'
      });
    }

    // 1. Fetch student
    const [students] = await masterPool.query(
      'SELECT id, student_data, pin_no FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = students[0];
    let studentData = {};
    try {
      studentData = typeof student.student_data === 'string'
        ? JSON.parse(student.student_data || '{}')
        : (student.student_data || {});
    } catch (e) {
      // Fallback: student_data may be truncated; start fresh so the verification flag can be saved
      studentData = {};
    }

    // 2. Update status based on type
    if (type === 'student') {
      studentData.is_student_mobile_verified = true;
    } else if (type === 'parent') {
      studentData.is_parent_mobile_verified = true;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid verification type' });
    }

    // 3. Save back to DB
    await masterPool.query(
      'UPDATE students SET student_data = ? WHERE id = ?',
      [JSON.stringify(studentData), student.id]
    );

    // 4. Clear cache
    clearStudentsCache();

    // 5. Auto-check for registration completion after verification
    await checkAndAutoCompleteRegistration(admissionNumber);

    res.json({
      success: true,
      message: `${type === 'student' ? 'Student' : 'Parent'} mobile marked as verified`,
      data: {
        is_student_mobile_verified: studentData.is_student_mobile_verified,
        is_parent_mobile_verified: studentData.is_parent_mobile_verified
      }
    });

  } catch (error) {
    console.error('Admin verify mobile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while verifying mobile'
    });
  }
};

// Get single student photo (Lazy Load)
exports.getStudentPhoto = async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    if (!admissionNumber) {
      return res.status(400).json({ success: false, message: 'Admission number required' });
    }

    const [students] = await masterPool.query(
      'SELECT student_photo FROM students WHERE admission_number = ?',
      [admissionNumber]
    );

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const photo = students[0].student_photo;

    // Return the photo data directly (it's likely a base64 string or blob)
    return res.json({
      success: true,
      data: photo
    });

  } catch (error) {
    console.error('Get student photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch photo' });
  }
};

// Get academic status (year/sem) for a given batch/course/branch context
exports.getBatchAcademicStatus = async (req, res) => {
  try {
    const { batch, course, branch } = req.query;

    if (!batch) {
      return res.status(400).json({
        success: false,
        message: 'Batch is required'
      });
    }

    let query = `
      SELECT current_year, current_semester, COUNT(*) as count 
      FROM students 
      WHERE batch = ?
    `;
    const params = [batch];

    if (course) {
      query += ` AND course = ?`;
      params.push(course);
    }

    if (branch) {
      query += ` AND branch = ?`;
      params.push(branch);
    }

    // Only consider students with valid year/sem (exclude 0 or null if any)
    query += ` AND current_year > 0 AND current_semester > 0`;

    query += `
      GROUP BY current_year, current_semester
      ORDER BY count DESC
      LIMIT 1
    `;

    const [rows] = await masterPool.query(query, params);

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No existing records found to derive status'
      });
    }

    res.json({
      success: true,
      data: {
        current_year: rows[0].current_year,
        current_semester: rows[0].current_semester
      }
    });

  } catch (error) {
    console.error('Get batch status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching batch status'
    });
  }
};

// Perform transfer for a single student
const performTransfer = async ({ connection, admissionNumber, targetCollege, targetBatch, targetCourse, targetBranch, targetStage, adminId }) => {
  const [students] = await connection.query(
    `SELECT id, admission_number, admission_no, current_year, current_semester, college, course, branch, batch, student_data
     FROM students WHERE admission_number = ? OR admission_no = ? FOR UPDATE`,
    [admissionNumber, admissionNumber]
  );

  if (students.length === 0) {
    return { status: 'NOT_FOUND' };
  }

  const student = students[0];
  const parsedStudentData = parseJSON(student.student_data) || {};

  const currentStage = resolveStageFromData(parsedStudentData, {
    year: student.current_year || 1,
    semester: student.current_semester || 1
  });

  // Prepare new data
  const nextStage = targetStage;

  // Update payload with new stage
  applyStageToPayload(parsedStudentData, nextStage);

  // Update payload with new academic details if provided
  if (targetCollege) parsedStudentData['College'] = targetCollege;
  if (targetBatch) parsedStudentData['Batch'] = targetBatch;
  if (targetCourse) parsedStudentData['Course'] = targetCourse;
  if (targetBranch) parsedStudentData['Branch'] = targetBranch;

  const serializedStudentData = JSON.stringify(parsedStudentData);

  let updateQuery = `UPDATE students
     SET current_year = ?, current_semester = ?, student_data = ?, updated_at = CURRENT_TIMESTAMP`;
  const updateParams = [nextStage.year, nextStage.semester, serializedStudentData];

  if (targetCollege) {
    updateQuery += `, college = ?`;
    updateParams.push(targetCollege);
  }
  if (targetBatch) {
    updateQuery += `, batch = ?`;
    updateParams.push(targetBatch);
  }
  if (targetCourse) {
    updateQuery += `, course = ?`;
    updateParams.push(targetCourse);
  }
  if (targetBranch) {
    updateQuery += `, branch = ?`;
    updateParams.push(targetBranch);
  }

  // No changes to fee_status or registration_status as requested by user
  // Checks removed to prevent resetting these fields

  updateQuery += ` WHERE id = ?`;
  updateParams.push(student.id);

  await connection.query(updateQuery, updateParams);

  // Audit Log
  let validAdminId = null;
  if (adminId) {
    try {
      const [adminRows] = await connection.query('SELECT id FROM admins WHERE id = ? LIMIT 1', [adminId]);
      if (adminRows.length > 0) validAdminId = adminId;
    } catch (e) { console.warn('Admin check failed', e); }
  }

  await connection.query(
    `INSERT INTO audit_logs (action_type, entity_type, entity_id, admin_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      'TRANSFER',
      'STUDENT',
      student.admission_number || admissionNumber,
      validAdminId,
      JSON.stringify({
        from: {
          college: student.college,
          batch: student.batch,
          course: student.course,
          branch: student.branch,
          ...currentStage
        },
        to: {
          college: targetCollege || student.college,
          batch: targetBatch || student.batch,
          course: targetCourse || student.course,
          branch: targetBranch || student.branch,
          ...nextStage
        }
      })
    ]
  );

  return {
    status: 'SUCCESS',
    student: { ...student, admission_number: admissionNumber },
    currentStage,
    nextStage
  };
};

// Bulk transfer endpoint
exports.bulkTransferStudents = async (req, res) => {
  try {
    const { students, leftOutStudents, targetCollege, targetBatch, targetCourse, targetBranch, targetYear, targetSemester } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'students array is required' });
    }

    if (!targetYear || !targetSemester) {
      return res.status(400).json({ success: false, message: 'Target Year and Semester are required for transfer.' });
    }

    let targetStage;
    try {
      targetStage = normalizeStage(targetYear, targetSemester);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid Target Year/Semester' });
    }

    const results = [];
    const totalToProcess = students.length;
    let processedCount = 0;
    let errorCount = 0;
    let successCount = 0;

    for (const entry of students) {
      const admissionNumber = entry.admissionNumber || entry.admission_no;
      processedCount++;
      const progress = {
        current: processedCount,
        total: totalToProcess,
        label: `${processedCount}/${totalToProcess}`
      };

      if (!admissionNumber) {
        results.push({ admissionNumber: null, status: 'error', message: 'Missing Admission Number', progress, statusSymbol: 'error' });
        errorCount++;
        continue;
      }

      let connection = null;
      try {
        connection = await masterPool.getConnection();
        await connection.beginTransaction();

        const transferResult = await performTransfer({
          connection,
          admissionNumber,
          targetCollege,
          targetBatch,
          targetCourse,
          targetBranch,
          targetStage,
          adminId: req.admin?.id || null
        });

        if (transferResult.status === 'NOT_FOUND') {
          await connection.rollback();
          results.push({ admissionNumber, status: 'error', message: 'Student not found', progress, statusSymbol: 'error' });
          errorCount++;
        } else {
          await connection.commit();
          results.push({
            admissionNumber,
            status: 'success',
            message: 'Transferred successfully',
            progress,
            statusSymbol: 'completed',
            currentYear: targetStage.year,
            currentSemester: targetStage.semester
          });
          successCount++;
        }

      } catch (err) {
        if (connection) await connection.rollback();
        console.error(`Transfer failed for ${admissionNumber}`, err);
        results.push({ admissionNumber, status: 'error', message: err.message, progress, statusSymbol: 'error' });
        errorCount++;
      } finally {
        if (connection) connection.release();
      }
    }

    // Handle Left Out Students
    if (Array.isArray(leftOutStudents) && leftOutStudents.length > 0) {
      let connection = null;
      try {
        connection = await masterPool.getConnection();
        for (const leftOut of leftOutStudents) {
          if (!leftOut.admissionNumber && !leftOut.admission_number) continue;
          await connection.query(
            `UPDATE students SET student_status = ?, student_data = JSON_SET(COALESCE(student_data, '{}'), '$.Remarks', ?) WHERE admission_number = ?`,
            [leftOut.student_status || 'Regular', leftOut.remarks || '', leftOut.admissionNumber || leftOut.admission_number]
          );
        }
      } catch (e) { console.warn('Left out update failed', e); }
      finally { if (connection) connection.release(); }
    }

    res.json({
      success: true,
      message: 'Bulk transfer process completed. NOTE: If students with active internships were transferred, please use the "Re-validate Attendance" feature in the Internship Admin panel to ensure their records remain accurate.',
      results,
      summary: { total: totalToProcess, success: successCount, errors: errorCount, skipped: 0 }
    });

  } catch (error) {
    console.error('Bulk transfer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during transfer' });
  }
};

exports.getBatches = async (req, res) => {
  try {
    const [rows] = await masterPool.query('SELECT DISTINCT batch FROM students WHERE batch IS NOT NULL AND batch != "" ORDER BY batch DESC');
    const batches = rows.map(r => ({ name: String(r.batch), yearLabel: String(r.batch) }));
    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({ success: false, data: [] });
  }
};

require('dotenv').config();
const { masterPool, admissionsPool } = require('../config/database');

/**
 * Helper to safely extract JSON data if stored as a string or object.
 */
function parseJson(data) {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

/**
 * Extract clean value prioritizing direct column value, then JSON payload field.
 */
function getValue(colVal, jsonObj, jsonKeys = []) {
  if (colVal !== undefined && colVal !== null && String(colVal).trim() !== '') {
    return String(colVal).trim();
  }
  for (const key of jsonKeys) {
    if (jsonObj[key] !== undefined && jsonObj[key] !== null && String(jsonObj[key]).trim() !== '') {
      return String(jsonObj[key]).trim();
    }
  }
  return null;
}

/**
 * Format date to YYYY-MM-DD for MySQL DATE columns if possible.
 */
function formatDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().split('T')[0];
  }
  return str;
}

const VALID_RESERVATION_VALUES = new Set(['oc', 'ews', 'bc-a', 'bc-b', 'bc-c', 'bc-d', 'bc-e', 'sc', 'st']);

function normalizeReservationGeneral(val) {
  if (!val) return null;
  let str = String(val).trim().toLowerCase();
  if (str === 'fc' || str === 'general') str = 'oc';
  if (str === 'bc_a') str = 'bc-a';
  if (str === 'bc_b') str = 'bc-b';
  if (str === 'bc_c') str = 'bc-c';
  if (str === 'bc_d') str = 'bc-d';
  if (str === 'bc_e') str = 'bc-e';
  return VALID_RESERVATION_VALUES.has(str) ? str : null;
}

function extractDoorStreet(rawAddress, village, mandal, district, state, pincode) {
  if (!rawAddress) return '';
  let str = String(rawAddress).trim();

  const esc = (s) => (s ? String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '');

  if (pincode) {
    str = str.replace(new RegExp(',?\\s*(PIN:?\\s*)?' + esc(pincode) + '$', 'i'), '');
  } else {
    str = str.replace(/,?\s*(PIN:?\s*)?\d{6}$/i, '');
  }

  if (state) {
    str = str.replace(new RegExp(',?\\s*' + esc(state).replace(/\s+/g, '\\s*') + '$', 'i'), '');
  } else {
    str = str.replace(/,?\s*(Andhra\s+Pradesh|Telangana)$/i, '');
  }

  if (district) {
    str = str.replace(new RegExp(',?\\s*' + esc(district) + '$', 'i'), '');
  }

  if (mandal) {
    str = str.replace(new RegExp(',?\\s*' + esc(mandal) + '$', 'i'), '');
  }

  if (village) {
    str = str.replace(new RegExp(',?\\s*' + esc(village) + '$', 'i'), '');
  }

  return str.trim();
}

/**
 * Core function to sync a single SDMS student record to admissions_db
 * @param {string} admissionNumber - The student admission number
 * @param {object|null} studentRecord - Optional pre-fetched student record row from SDMS
 * @returns {Promise<{success: boolean, admissionNumber: string, updatedTables: string[], error?: string}>}
 */
async function syncStudentToAdmissions(admissionNumber, studentRecord = null) {
  const normAdmissionNumber = String(admissionNumber || '').trim();
  if (!normAdmissionNumber) {
    return { success: false, error: 'Admission number is required for admissions sync' };
  }

  try {
    let student = studentRecord;
    if (!student) {
      const [rows] = await masterPool.query(
        `SELECT * FROM students WHERE admission_number = ? OR admission_no = ? LIMIT 1`,
        [normAdmissionNumber, normAdmissionNumber]
      );
      if (!rows || rows.length === 0) {
        return { success: false, admissionNumber: normAdmissionNumber, error: 'Student not found in SDMS database' };
      }
      student = rows[0];
    }

    const json = parseJson(student.student_data);

    // Consolidated fields
    const name = getValue(student.student_name, json, ['Student Name', 'student_name', 'name', 'Name']);
    const dob = formatDate(getValue(student.dob, json, ['Date of Birth', 'dob', 'date_of_birth', 'DOB']));
    const aadhaar = getValue(student.adhar_no, json, ['Aadhar Card Number', 'adhar_no', 'aadhaar', 'student_aadhaar_number']);
    const gender = getValue(student.gender, json, ['Gender', 'gender']);
    const email = getValue(student.email, json, ['Email', 'email', 'student_email']);
    const fatherName = getValue(student.father_name, json, ['Father Name', 'father_name', 'father']);
    const studentPhone = getValue(student.student_mobile, json, ['Student Mobile Number', 'student_mobile', 'phone', 'student_phone']);
    const fatherPhone = getValue(student.parent_mobile1, json, ['Parent Mobile Number', 'parent_mobile1', 'father_phone']);
    const motherPhone = getValue(student.parent_mobile2, json, ['Parent Mobile Number 2', 'parent_mobile2', 'mother_phone']);
    const preferredPhone = getValue(student.preferred_mobile_number, json, ['preferred_mobile_number']) || studentPhone || fatherPhone;


    const rawStreetAddress = getValue(student.student_address, json, ['Student Address', 'student_address', 'address_door_street', 'address']);
    const village = getValue(student.city_village, json, ['Village/City', 'city_village', 'village', 'address_village_city']);
    const mandal = getValue(student.mandal_name, json, ['Mandal Name', 'mandal_name', 'mandal', 'address_mandal']);
    const district = getValue(student.district, json, ['District', 'district', 'address_district']);
    const landmark = getValue(null, json, ['address_landmark', 'Landmark', 'landmark']);

    
    let pincode = getValue(null, json, ['pincode', 'pin_code', 'address_pin_code', 'Pincode', 'Pin Code']);
    let state = getValue(null, json, ['state', 'address_state', 'State']);

    if (!pincode && rawStreetAddress) {
      const pinMatch = String(rawStreetAddress).match(/\b(\d{6})\b/);
      if (pinMatch) pincode = pinMatch[1];
    }
    if (!state && rawStreetAddress) {
      if (/Andhra\s+Pradesh/i.test(rawStreetAddress)) state = 'Andhra Pradesh';
      else if (/Telangana/i.test(rawStreetAddress)) state = 'Telangana';
    }

    const cleanDoorStreet = extractDoorStreet(rawStreetAddress, village, mandal, district, state, pincode);
    const streetAddress = cleanDoorStreet || rawStreetAddress;

    const course = getValue(student.course, json, ['Course', 'course']);
    const branch = getValue(student.branch, json, ['Branch', 'branch']);
    const quota = getValue(student.stud_type, json, ['Stud Type', 'stud_type', 'quota', 'Quota']);
    const rawCaste = getValue(student.caste, json, ['Caste', 'caste', 'reservation_general']);
    const caste = normalizeReservationGeneral(rawCaste);

    const studentPhoto = getValue(student.student_photo, json, ['student_photo']);
    const fatherPhoto = getValue(student.father_photo, json, ['father_photo']);
    const motherPhoto = getValue(student.mother_photo, json, ['mother_photo']);
    const remarks = getValue(student.remarks, json, ['Remarks', 'remarks']);

    const updatedTables = [];

    // 1. Sync to admissions_db.admissions table
    const [admRows] = await admissionsPool.query(
      `SELECT id, lead_id, joining_id, lead_data FROM admissions WHERE admission_number = ?`,
      [normAdmissionNumber]
    );

    let leadId = null;
    let joiningId = null;

    if (admRows.length > 0) {
      leadId = admRows[0].lead_id;
      joiningId = admRows[0].joining_id;

      const admUpdateFields = [];
      const admParams = [];

      const setIfVal = (col, val) => {
        if (val !== undefined) {
          admUpdateFields.push(`${col} = ?`);
          admParams.push(val);
        }
      };

      setIfVal('student_name', name);
      setIfVal('student_phone', studentPhone);
      setIfVal('student_aadhaar_number', aadhaar);
      setIfVal('student_gender', gender);
      setIfVal('student_date_of_birth', dob);
      setIfVal('father_name', fatherName);
      setIfVal('father_phone', fatherPhone);
      setIfVal('mother_phone', motherPhone);
      setIfVal('preferred_mobile_number', preferredPhone);
      setIfVal('address_door_street', streetAddress);
      setIfVal('address_landmark', landmark || '');
      setIfVal('address_village_city', village);

      setIfVal('address_mandal', mandal);
      setIfVal('address_district', district);
      if (pincode) setIfVal('address_pin_code', pincode);
      if (state) setIfVal('address_state', state);

      setIfVal('course', course);
      setIfVal('branch', branch);
      setIfVal('quota', quota);
      setIfVal('reservation_general', caste);
      setIfVal('student_photo', studentPhoto);
      setIfVal('father_photo', fatherPhoto);
      setIfVal('mother_photo', motherPhoto);
      setIfVal('remarks', remarks);

      if (admRows[0].lead_data) {
        try {
          let leadData = typeof admRows[0].lead_data === 'string' ? JSON.parse(admRows[0].lead_data) : admRows[0].lead_data;
          if (leadData && typeof leadData === 'object') {
            if (name) leadData.name = name;
            if (studentPhone) leadData.phone = studentPhone;
            if (aadhaar) leadData.student_aadhaar_number = aadhaar;
            if (fatherName) leadData.fatherName = fatherName;
            if (fatherPhone) leadData.fatherPhone = fatherPhone;
            if (motherPhone) leadData.motherPhone = motherPhone;
            if (preferredPhone) leadData.preferred_mobile_number = preferredPhone;
            if (streetAddress) {
              leadData.address = streetAddress;
              leadData.address_door_street = streetAddress;
              leadData.student_address = rawStreetAddress || streetAddress;
            }
            if (village) leadData.village = village;
            if (mandal) leadData.mandal = mandal;
            if (district) leadData.district = district;
            if (pincode) leadData.pincode = pincode;
            if (state) leadData.state = state;
            setIfVal('lead_data', JSON.stringify(leadData));
          }
        } catch (e) {}
      }

      if (admUpdateFields.length > 0) {
        admUpdateFields.push('updated_at = CURRENT_TIMESTAMP');
        admParams.push(normAdmissionNumber);
        await admissionsPool.query(
          `UPDATE admissions SET ${admUpdateFields.join(', ')} WHERE admission_number = ?`,
          admParams
        );
        updatedTables.push('admissions');
      }
    }

    // 2. Sync to admissions_db.leads table
    const [leadSearchRows] = await admissionsPool.query(
      `SELECT id FROM leads WHERE admission_number = ? ${leadId ? 'OR id = ?' : ''}`,
      leadId ? [normAdmissionNumber, leadId] : [normAdmissionNumber]
    );

    if (leadSearchRows.length > 0) {
      const leadUpdateFields = [];
      const leadParams = [];

      const setLeadVal = (col, val) => {
        if (val !== undefined && val !== null) {
          leadUpdateFields.push(`${col} = ?`);
          leadParams.push(val);
        }
      };

      setLeadVal('name', name);
      setLeadVal('phone', studentPhone);
      setLeadVal('alternate_mobile', fatherPhone);
      setLeadVal('email', email);
      setLeadVal('father_name', fatherName);
      setLeadVal('father_phone', fatherPhone);
      setLeadVal('address', streetAddress || [village, mandal, district].filter(Boolean).join(', '));
      setLeadVal('village', village);
      setLeadVal('mandal', mandal);
      setLeadVal('district', district);
      if (state) setLeadVal('state', state);
      setLeadVal('quota', quota);
      if (course) setLeadVal('course_interested', course);

      if (leadUpdateFields.length > 0) {
        leadUpdateFields.push('updated_at = CURRENT_TIMESTAMP');
        const leadTargetId = leadSearchRows[0].id;
        leadParams.push(leadTargetId);
        await admissionsPool.query(
          `UPDATE leads SET ${leadUpdateFields.join(', ')} WHERE id = ?`,
          leadParams
        );
        updatedTables.push('leads');
      }
    }

    // 3. Sync to admissions_db.joinings table if joining_id or lead_id exists
    const [joiningSearchRows] = await admissionsPool.query(
      `SELECT id, lead_data FROM joinings WHERE ${joiningId ? 'id = ?' : '1=0'} ${leadId ? 'OR lead_id = ?' : ''}`,
      [joiningId || '', leadId || '']
    );

    if (joiningSearchRows.length > 0) {
      const joinUpdateFields = [];
      const joinParams = [];

      const setJoinVal = (col, val) => {
        if (val !== undefined) {
          joinUpdateFields.push(`${col} = ?`);
          joinParams.push(val);
        }
      };

      setJoinVal('student_name', name);
      setJoinVal('student_phone', studentPhone);
      setJoinVal('student_aadhaar_number', aadhaar);
      setJoinVal('student_gender', gender);
      setJoinVal('student_date_of_birth', dob);
      setJoinVal('father_name', fatherName);
      setJoinVal('father_phone', fatherPhone);
      setJoinVal('mother_phone', motherPhone);
      setJoinVal('preferred_mobile_number', preferredPhone);
      setJoinVal('address_door_street', streetAddress);
      setJoinVal('address_landmark', landmark || '');
      setJoinVal('address_village_city', village);

      setJoinVal('address_mandal', mandal);
      setJoinVal('address_district', district);
      if (pincode) setJoinVal('address_pin_code', pincode);
      if (state) setJoinVal('address_state', state);
      setJoinVal('course', course);
      setJoinVal('branch', branch);
      setJoinVal('quota', quota);
      setJoinVal('reservation_general', caste);
      setJoinVal('student_photo', studentPhoto);
      setJoinVal('father_photo', fatherPhoto);
      setJoinVal('mother_photo', motherPhoto);

      if (joiningSearchRows[0].lead_data) {
        try {
          let leadData = typeof joiningSearchRows[0].lead_data === 'string' ? JSON.parse(joiningSearchRows[0].lead_data) : joiningSearchRows[0].lead_data;
          if (leadData && typeof leadData === 'object') {
            if (name) leadData.name = name;
            if (studentPhone) leadData.phone = studentPhone;
            if (aadhaar) leadData.student_aadhaar_number = aadhaar;
            if (fatherName) leadData.fatherName = fatherName;
            if (fatherPhone) leadData.fatherPhone = fatherPhone;
            if (motherPhone) leadData.motherPhone = motherPhone;
            if (preferredPhone) leadData.preferred_mobile_number = preferredPhone;
            if (streetAddress) {
              leadData.address = streetAddress;
              leadData.address_door_street = streetAddress;
              leadData.student_address = rawStreetAddress || streetAddress;
            }
            if (village) leadData.village = village;
            if (mandal) leadData.mandal = mandal;
            if (district) leadData.district = district;
            if (pincode) leadData.pincode = pincode;
            if (state) leadData.state = state;
            setJoinVal('lead_data', JSON.stringify(leadData));
          }
        } catch (e) {}
      }

      if (joinUpdateFields.length > 0) {
        joinUpdateFields.push('updated_at = CURRENT_TIMESTAMP');
        const joinTargetId = joiningSearchRows[0].id;
        joinParams.push(joinTargetId);
        await admissionsPool.query(
          `UPDATE joinings SET ${joinUpdateFields.join(', ')} WHERE id = ?`,
          joinParams
        );
        updatedTables.push('joinings');
      }
    }

    return {
      success: true,
      admissionNumber: normAdmissionNumber,
      updatedTables,
      matched: updatedTables.length > 0
    };
  } catch (error) {
    console.error(`Error in syncStudentToAdmissions for ${admissionNumber}:`, error);
    return {
      success: false,
      admissionNumber: normAdmissionNumber,
      error: error.message
    };
  }
}

/**
 * Bulk sync all SDMS students (or a specific list of admission numbers) to admissions database
 * @param {object} options - Options for sync (limit, batchSize, admissionNumbers)
 */
async function bulkSyncAllStudentsToAdmissions(options = {}) {
  const { batchSize = 50, admissionNumbers = null } = options;
  const stats = { totalProcessed: 0, totalUpdated: 0, totalErrors: 0, errors: [] };

  try {
    let targetAdmissionNumbers = [];

    if (admissionNumbers && Array.isArray(admissionNumbers) && admissionNumbers.length > 0) {
      targetAdmissionNumbers = admissionNumbers.map(a => String(a).trim()).filter(Boolean);
    } else {
      // Find all admission_numbers present in admissions_db (admissions or leads tables)
      const [admRows] = await admissionsPool.query(
        `SELECT DISTINCT admission_number FROM admissions WHERE admission_number IS NOT NULL AND TRIM(admission_number) != ''`
      );
      const [leadRows] = await admissionsPool.query(
        `SELECT DISTINCT admission_number FROM leads WHERE admission_number IS NOT NULL AND TRIM(admission_number) != ''`
      );

      const admSet = new Set([
        ...admRows.map(r => String(r.admission_number).trim()),
        ...leadRows.map(r => String(r.admission_number).trim())
      ]);

      targetAdmissionNumbers = Array.from(admSet).filter(Boolean);
    }

    console.log(`[AdmissionsSync] Found ${targetAdmissionNumbers.length} target admission records in admissions_db. Starting bulk sync...`);

    for (let i = 0; i < targetAdmissionNumbers.length; i += batchSize) {
      const chunkAdmissions = targetAdmissionNumbers.slice(i, i + batchSize);
      const placeholders = chunkAdmissions.map(() => '?').join(',');

      const [sdmsStudents] = await masterPool.query(
        `SELECT * FROM students WHERE admission_number IN (${placeholders}) OR admission_no IN (${placeholders})`,
        [...chunkAdmissions, ...chunkAdmissions]
      );

      await Promise.all(
        sdmsStudents.map(async (student) => {
          const admNum = student.admission_number || student.admission_no;
          if (!admNum) return;
          stats.totalProcessed++;

          const res = await syncStudentToAdmissions(admNum, student);
          if (res.success && res.matched) {
            stats.totalUpdated++;
          } else if (!res.success) {
            stats.totalErrors++;
            if (stats.errors.length < 50) {
              stats.errors.push({ admissionNumber: admNum, error: res.error });
            }
          }
        })
      );
      console.log(`[AdmissionsSync] Processed ${Math.min(i + batchSize, targetAdmissionNumbers.length)} / ${targetAdmissionNumbers.length} target admission records.`);
    }

    console.log(`[AdmissionsSync] Bulk sync completed. Processed: ${stats.totalProcessed}, Updated: ${stats.totalUpdated}, Errors: ${stats.totalErrors}`);
    return stats;
  } catch (err) {
    console.error('[AdmissionsSync] Critical error during bulk sync:', err);
    throw err;
  }
}

/**
 * Direct update helper for dual-database edits (synchronous execution)
 */
async function triggerAdmissionsSyncAsync(admissionNumber, studentData = null) {
  return await syncStudentToAdmissions(admissionNumber, studentData);
}

module.exports = {
  syncStudentToAdmissions,
  bulkSyncAllStudentsToAdmissions,
  triggerAdmissionsSyncAsync
};


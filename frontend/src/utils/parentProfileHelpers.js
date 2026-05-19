export const formatParentDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatGender = (g) => {
  if (!g) return '—';
  const m = { M: 'Male', F: 'Female', Other: 'Other' };
  return m[g] || g;
};

/** Merge DB row + student_data JSON (same keys as admin student dialog) */
export const buildParentDisplayData = (row) => {
  if (!row) return {};
  let sd = {};
  try {
    sd = typeof row.student_data === 'string' ? JSON.parse(row.student_data) : (row.student_data || {});
  } catch {
    sd = {};
  }

  const pick = (...keys) => {
    for (const k of keys) {
      const v = row[k] ?? sd[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  };

  return {
    ...row,
    student_data: sd,
    admission_number: pick('admission_number', 'admission_no'),
    pin_no: pick('pin_no', 'Pin Number', 'PIN Number'),
    student_name: pick('student_name', 'Student Name'),
    college: pick('college', 'College', 'College Name'),
    course: pick('course', 'Course', 'Program'),
    branch: pick('branch', 'Branch'),
    batch: pick('batch', 'Batch'),
    current_year: pick('current_year', 'Current Academic Year', 'Current Year'),
    current_semester: pick('current_semester', 'Current Semester', 'Semester'),
    student_mobile: pick('student_mobile', 'Student Mobile Number'),
    parent_mobile1: pick('parent_mobile1', 'Parent Mobile Number 1'),
    parent_mobile2: pick('parent_mobile2', 'Parent Mobile Number 2'),
    father_name: pick('father_name', 'Father Name'),
    dob: pick('dob', 'DOB (Date of Birth - DD-MM-YYYY)', 'DOB (Date-Month-Year) Ex: 09-Sep-2003)'),
    gender: pick('gender', 'M/F'),
    caste: pick('caste', 'Caste'),
    adhar_no: pick('adhar_no', 'ADHAR No', 'Aadhar No'),
    apaar_id: pick('apaar_id', 'APAAR ID', 'apaar id'),
    admission_date: pick('admission_date', 'Admission Date'),
    student_address: pick('student_address', 'Student Address (D.No, Str name, Village, Mandal, Dist)'),
    city_village: pick('city_village', 'City/Village'),
    mandal_name: pick('mandal_name', 'Mandal Name'),
    district: pick('district', 'District'),
    pincode: pick('pincode', 'pin_code', 'Pincode', 'PIN Code'),
    student_status: pick('student_status', 'Student Status'),
    scholar_status: pick('scholar_status', 'Scholar Status'),
    fee_status: pick('fee_status', 'Fee Status'),
    certificates_status: pick('certificates_status', 'Certificates Status'),
    registration_status: pick('registration_status', 'Registration Status'),
    previous_college: pick('previous_college', 'Previous College Name', 'Previous College'),
    stud_type: pick('stud_type', 'Student Type', 'Stud Type'),
    is_parent_mobile_verified: sd.is_parent_mobile_verified === true,
    is_student_mobile_verified: sd.is_student_mobile_verified === true,
  };
};

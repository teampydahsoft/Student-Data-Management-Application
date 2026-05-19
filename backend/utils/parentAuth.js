const normalizeMobile = (mobile) => {
  if (!mobile) return '';
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

const mobilesMatch = (stored, input) => {
  const a = normalizeMobile(stored);
  const b = normalizeMobile(input);
  if (!a || !b) return false;
  return a === b;
};

// Only columns that exist on `students` table (pincode etc. may live in student_data JSON)
const PARENT_PROFILE_FIELDS = [
  'id', 'admission_number', 'student_name', 'student_photo', 'college', 'course', 'branch',
  'batch', 'current_year', 'current_semester', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
  'father_name', 'student_address', 'city_village', 'district', 'dob', 'gender'
];

const STUDENT_SELECT_FIELDS = `id, admission_number, student_name, student_photo, college, course, branch,
  current_year, current_semester, parent_mobile1, parent_mobile2`;

module.exports = {
  normalizeMobile,
  mobilesMatch,
  PARENT_PROFILE_FIELDS,
  STUDENT_SELECT_FIELDS
};

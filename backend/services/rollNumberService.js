/**
 * Resolve attendance display identifier: PIN when assigned, otherwise branch roll number.
 */

const resolveAttendanceDisplayNumber = ({ assignedRollNumber, pinNo, studentData } = {}) => {
  const data = studentData && typeof studentData === 'object' ? studentData : {};

  const pin =
    (pinNo != null ? String(pinNo).trim() : '') ||
    (data['PIN Number'] != null ? String(data['PIN Number']).trim() : '') ||
    (data['Pin Number'] != null ? String(data['Pin Number']).trim() : '') ||
    (data['pin_number'] != null ? String(data['pin_number']).trim() : '') ||
    (data.pin_no != null ? String(data.pin_no).trim() : '');

  if (pin) {
    return pin;
  }

  const roll = assignedRollNumber != null ? String(assignedRollNumber).trim() : '';
  return roll || null;
};

const resolveAttendanceDisplayNumberFromRow = (row, parseStudentData) => {
  const studentData = parseStudentData
    ? parseStudentData(row.student_data)
    : (row.student_data || {});

  return resolveAttendanceDisplayNumber({
    assignedRollNumber: row.assigned_roll_number ?? row.roll_number,
    pinNo: row.pin_no,
    studentData
  });
};

const STUDENT_ROLL_NUMBERS_JOIN = 'LEFT JOIN student_roll_numbers srn ON srn.student_id = s.id';

const STUDENT_ROLL_NUMBERS_SELECT = `
  srn.roll_number AS assigned_roll_number,
  srn.branch_prefix AS roll_branch_prefix,
  srn.serial AS roll_serial
`;

module.exports = {
  resolveAttendanceDisplayNumber,
  resolveAttendanceDisplayNumberFromRow,
  STUDENT_ROLL_NUMBERS_JOIN,
  STUDENT_ROLL_NUMBERS_SELECT
};

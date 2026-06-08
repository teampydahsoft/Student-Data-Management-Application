const TARGET_FIELDS = [
  'target_college',
  'target_batch',
  'target_course',
  'target_branch',
  'target_year',
  'target_semester'
];

export const emptyHolidayTargets = () => ({
  target_college: [],
  target_batch: [],
  target_course: [],
  target_branch: [],
  target_year: [],
  target_semester: []
});

export const isGlobalHolidayTarget = (targets = {}) =>
  TARGET_FIELDS.every((field) => !Array.isArray(targets[field]) || targets[field].length === 0);

export const formatHolidayScope = (holiday = {}) => {
  if (isGlobalHolidayTarget(holiday)) return 'All students';

  const parts = [];
  if (holiday.target_college?.length) parts.push(`Colleges: ${holiday.target_college.join(', ')}`);
  if (holiday.target_batch?.length) parts.push(`Batches: ${holiday.target_batch.join(', ')}`);
  if (holiday.target_course?.length) parts.push(`Programs: ${holiday.target_course.join(', ')}`);
  if (holiday.target_branch?.length) parts.push(`Branches: ${holiday.target_branch.join(', ')}`);
  if (holiday.target_year?.length) parts.push(`Years: ${holiday.target_year.join(', ')}`);
  if (holiday.target_semester?.length) parts.push(`Semesters: ${holiday.target_semester.join(', ')}`);

  return parts.join(' · ') || 'All students';
};

export const matchesStudentHoliday = (student, holiday = {}) => {
  if (!student) return false;
  if (isGlobalHolidayTarget(holiday)) return true;

  const checks = [
    ['target_college', student.college],
    ['target_batch', student.batch],
    ['target_course', student.course],
    ['target_branch', student.branch],
    ['target_year', student.currentYear != null ? String(student.currentYear) : student.current_year != null ? String(student.current_year) : ''],
    ['target_semester', student.currentSemester != null ? String(student.currentSemester) : student.current_semester != null ? String(student.current_semester) : '']
  ];

  return checks.every(([field, value]) => {
    const allowed = holiday[field];
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    return allowed.includes(value);
  });
};

export const getCustomHolidaysForDate = (customHolidays = [], date) => {
  if (!date) return [];
  const normalizedDate = date.split('T')[0];
  return (customHolidays || []).filter((holiday) => {
    const holidayDate = holiday.date ? holiday.date.split('T')[0] : holiday.date;
    return holidayDate === normalizedDate;
  });
};

export const findGlobalCustomHoliday = (customHolidays = []) =>
  customHolidays.find((holiday) => isGlobalHolidayTarget(holiday)) || null;

export const findMatchingCustomHoliday = (customHolidays = [], { student, filters } = {}) => {
  if (!Array.isArray(customHolidays) || customHolidays.length === 0) return null;

  if (student) {
    return customHolidays.find((holiday) => matchesStudentHoliday(student, holiday)) || null;
  }

  if (filters) {
    return customHolidays.find((holiday) => {
      if (isGlobalHolidayTarget(holiday)) return true;
      const checks = [
        ['target_college', filters.college],
        ['target_batch', filters.batch],
        ['target_course', filters.course],
        ['target_branch', filters.branch],
        ['target_year', filters.currentYear != null ? String(filters.currentYear) : ''],
        ['target_semester', filters.currentSemester != null ? String(filters.currentSemester) : '']
      ];
      return checks.every(([field, value]) => {
        const allowed = holiday[field];
        if (!Array.isArray(allowed) || allowed.length === 0) return true;
        if (!value) return allowed.length > 0;
        return allowed.includes(value);
      });
    }) || null;
  }

  return findGlobalCustomHoliday(customHolidays) || customHolidays[0] || null;
};

const AVAILABLE_OPERATIONS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'View institution-wide metrics and shortcuts.'
  },
  {
    key: 'students',
    label: 'Students',
    description: 'Manage student profiles, enrollment data, and filters.'
  },
  {
    key: 'promotions',
    label: 'Promotions',
    description: 'Promote students in bulk across academic stages.'
  },
  {
    key: 'section_partition',
    label: 'Section Partition',
    description: 'Assign students to sections within a branch and batch.'
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Mark daily attendance and review student attendance history.'
  },
  {
    key: 'submissions',
    label: 'Submissions',
    description: 'Review form submissions and manage approvals.'
  },
  {
    key: 'forms',
    label: 'Forms',
    description: 'Create, edit, and publish academic forms.'
  },
  {
    key: 'courses',
    label: 'Courses',
    description: 'Configure courses, branches, and academic structure.'
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Access attendance analytics, visual reports, and exports.'
  },
  {
    key: 'user-management',
    label: 'User Management',
    description: 'Create staff accounts and control access to operations.'
  }
];

const ALL_OPERATION_KEYS = AVAILABLE_OPERATIONS.map((operation) => operation.key);

const parseModules = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string');
  } catch (error) {
    return [];
  }
};

const normalizeModules = (modules) => {
  const incoming = parseModules(modules);
  const normalized = [];

  incoming.forEach((key) => {
    if (ALL_OPERATION_KEYS.includes(key) && !normalized.includes(key)) {
      normalized.push(key);
    }
  });

  return normalized;
};

module.exports = {
  AVAILABLE_OPERATIONS,
  ALL_OPERATION_KEYS,
  parseModules,
  normalizeModules
};



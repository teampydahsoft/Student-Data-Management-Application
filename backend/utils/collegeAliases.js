const { COLLEGE_LEGACY_ALIASES } = require('../constants/collegeAliases');

/**
 * Resolve a college name to its current canonical name.
 */
const getCanonicalCollegeName = (name) => {
  if (!name || typeof name !== 'string') return name;
  const trimmed = name.trim();
  return COLLEGE_LEGACY_ALIASES[trimmed] || trimmed;
};

/**
 * All student.college values that should match a filter for the given name
 * (canonical + any legacy aliases that map to it).
 */
const getCollegeNamesForFilter = (collegeName) => {
  const trimmed = String(collegeName || '').trim();
  if (!trimmed) return [];

  const canonical = getCanonicalCollegeName(trimmed);
  const names = new Set([canonical, trimmed]);

  for (const [legacy, current] of Object.entries(COLLEGE_LEGACY_ALIASES)) {
    if (current === canonical || legacy === trimmed) {
      names.add(legacy);
      names.add(current);
    }
  }

  return [...names];
};

/**
 * Build SQL clause + params for filtering students by college (handles legacy names).
 */
const buildCollegeNameFilter = (collegeName, tableAlias = 'students') => {
  const names = getCollegeNamesForFilter(collegeName);
  if (!names.length) {
    return { clause: '1=0', params: [] };
  }
  if (names.length === 1) {
    return {
      clause: `${tableAlias}.college = ?`,
      params: [names[0]]
    };
  }
  return {
    clause: `${tableAlias}.college IN (${names.map(() => '?').join(',')})`,
    params: names
  };
};

const appendCollegeNameFilter = (whereParts, params, collegeName, tableAlias = 'students') => {
  const { clause, params: collegeParams } = buildCollegeNameFilter(collegeName, tableAlias);
  whereParts.push(clause);
  params.push(...collegeParams);
};

module.exports = {
  getCanonicalCollegeName,
  getCollegeNamesForFilter,
  buildCollegeNameFilter,
  appendCollegeNameFilter
};

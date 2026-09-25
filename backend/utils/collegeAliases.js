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
 * Build SQL clause + params for filtering students by college(s) (handles numeric IDs, single/multiple names, and legacy aliases).
 */
const buildMultiCollegeFilter = (collegeVal, tableAlias = 'students') => {
  if (!collegeVal) return { clause: '', params: [] };

  let rawValues = [];
  if (Array.isArray(collegeVal)) {
    rawValues = collegeVal.flatMap(v => String(v).split(','));
  } else {
    rawValues = String(collegeVal).split(',');
  }

  const values = rawValues.map(v => v.trim()).filter(Boolean);
  if (values.length === 0) return { clause: '', params: [] };

  const isNumeric = (val) => /^\d+$/.test(val);
  const allNumeric = values.every(isNumeric);

  if (allNumeric) {
    const ids = values.map(v => parseInt(v, 10));
    if (ids.length === 1) {
      return { clause: `${tableAlias}.college_id = ?`, params: [ids[0]] };
    }
    return { clause: `${tableAlias}.college_id IN (${ids.map(() => '?').join(',')})`, params: ids };
  } else {
    const allNames = new Set();
    for (const val of values) {
      const names = getCollegeNamesForFilter(val);
      names.forEach(n => allNames.add(n));
    }
    const nameList = [...allNames];
    if (nameList.length === 0) return { clause: '', params: [] };
    if (nameList.length === 1) {
      return { clause: `${tableAlias}.college = ?`, params: [nameList[0]] };
    }
    return { clause: `${tableAlias}.college IN (${nameList.map(() => '?').join(',')})`, params: nameList };
  }
};

/**
 * Build SQL clause + params for filtering students by college (handles legacy names & multi-select).
 */
const buildCollegeNameFilter = (collegeName, tableAlias = 'students') => {
  return buildMultiCollegeFilter(collegeName, tableAlias);
};

const appendCollegeNameFilter = (whereParts, params, collegeName, tableAlias = 'students') => {
  const { clause, params: collegeParams } = buildMultiCollegeFilter(collegeName, tableAlias);
  if (clause) {
    whereParts.push(clause);
    params.push(...collegeParams);
  }
};

module.exports = {
  getCanonicalCollegeName,
  getCollegeNamesForFilter,
  buildCollegeNameFilter,
  appendCollegeNameFilter,
  buildMultiCollegeFilter
};

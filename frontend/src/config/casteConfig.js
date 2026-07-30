/** No static defaults — caste/subcaste options come only from Settings (API). */
export const CASTE_OPTIONS = [];

/**
 * Flatten nested caste → subcastes into a unique subcaste name list.
 * API still returns parent as "category" with nested "castes" (subcastes).
 */
export function flattenCasteNames(categories = [], { includeInactive = false } = {}) {
  const names = [];
  categories.forEach((category) => {
    if (!includeInactive && category.isActive === false) return;
    (category.castes || category.subcastes || []).forEach((caste) => {
      if (!includeInactive && caste.isActive === false) return;
      if (caste?.name && !names.includes(caste.name)) {
        names.push(caste.name);
      }
    });
  });
  return names;
}

/** Find the parent caste object for a given subcaste name. */
export function findCategoryForCaste(categories = [], casteName) {
  if (!casteName) return null;
  const needle = String(casteName).trim();
  for (const category of categories) {
    const match = (category.castes || category.subcastes || []).find(
      (caste) => String(caste.name).trim() === needle
    );
    if (match) return category;
  }
  // Fallback: parent caste name matches value
  return categories.find((cat) => cat.name === needle) || null;
}

/** Find parent caste + subcaste objects by subcaste id (castes.id). */
export function findByCasteId(categories = [], casteId) {
  if (casteId == null || casteId === '') return null;
  const id = Number(casteId);
  if (!Number.isFinite(id)) return null;

  for (const category of categories) {
    const caste = (category.castes || category.subcastes || []).find(
      (item) => Number(item.id) === id
    );
    if (caste) {
      return { category, caste, parent: category, subcaste: caste };
    }
  }
  return null;
}

/**
 * Display helpers for students table/dialog.
 * Linked when student.caste_id is set (Settings caste → subcaste).
 * When not linked, still expose the existing students.caste text so it is not hidden.
 *
 * - casteName: parent caste when linked; else legacy students.caste
 * - subcasteName: Settings subcaste when linked; else null
 * - legacyCaste: raw students.caste text
 */
export function getStudentCasteDisplay(categories = [], student = {}) {
  const legacyCaste =
    student?.caste != null && String(student.caste).trim() !== ''
      ? String(student.caste).trim()
      : null;
  const linked = student?.caste_id != null && student?.caste_id !== '';

  if (!linked) {
    return {
      linked: false,
      casteName: legacyCaste,
      subcasteName: null,
      categoryName: null,
      legacyCaste
    };
  }

  const found = findByCasteId(categories, student.caste_id);
  if (found) {
    const parentName = found.category?.name || null;
    const childName = found.caste?.name || null;
    return {
      linked: true,
      casteName: parentName || legacyCaste,
      subcasteName: childName || legacyCaste,
      categoryName: parentName,
      legacyCaste
    };
  }

  // caste_id set but not in settings list — fall back to stored name
  return {
    linked: true,
    casteName: legacyCaste,
    subcasteName: legacyCaste,
    categoryName: null,
    legacyCaste
  };
}

/**
 * Build select options for a student subcaste field.
 * Ensures the student's current value remains selectable even if removed from config.
 */
export function buildCasteSelectOptions(casteOptions = CASTE_OPTIONS, currentValue) {
  const options = [...casteOptions];
  const current = currentValue != null ? String(currentValue).trim() : '';
  if (current && !options.includes(current)) {
    options.unshift(current);
  }
  return options;
}

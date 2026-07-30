/** No static defaults — caste options come only from Settings (API). */
export const CASTE_OPTIONS = [];

/** Flatten nested category → castes into a unique name list (active castes only by default). */
export function flattenCasteNames(categories = [], { includeInactive = false } = {}) {
  const names = [];
  categories.forEach((category) => {
    if (!includeInactive && category.isActive === false) return;
    (category.castes || []).forEach((caste) => {
      if (!includeInactive && caste.isActive === false) return;
      if (caste?.name && !names.includes(caste.name)) {
        names.push(caste.name);
      }
    });
  });
  return names;
}

/** Find the parent category object for a given caste name. */
export function findCategoryForCaste(categories = [], casteName) {
  if (!casteName) return null;
  const needle = String(casteName).trim();
  for (const category of categories) {
    const match = (category.castes || []).find(
      (caste) => String(caste.name).trim() === needle
    );
    if (match) return category;
  }
  // Fallback: category name matches caste value (e.g. category "OC" used as caste)
  return categories.find((cat) => cat.name === needle) || null;
}

/** Find category + caste objects by castes.id */
export function findByCasteId(categories = [], casteId) {
  if (casteId == null || casteId === '') return null;
  const id = Number(casteId);
  if (!Number.isFinite(id)) return null;

  for (const category of categories) {
    const caste = (category.castes || []).find((item) => Number(item.id) === id);
    if (caste) {
      return { category, caste };
    }
  }
  return null;
}

/**
 * Display helpers for students table/dialog.
 * Only linked when student.caste_id is set.
 */
export function getStudentCasteDisplay(categories = [], student = {}) {
  const linked = student?.caste_id != null && student?.caste_id !== '';
  if (!linked) {
    return { linked: false, categoryName: null, casteName: null };
  }

  const found = findByCasteId(categories, student.caste_id);
  if (found) {
    return {
      linked: true,
      categoryName: found.category?.name || null,
      casteName: found.caste?.name || null
    };
  }

  // caste_id set but not in active settings list — fall back to stored name
  return {
    linked: true,
    categoryName: null,
    casteName: student.caste || null
  };
}

/**
 * Build select options for a student caste field.
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

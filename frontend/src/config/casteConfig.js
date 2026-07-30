/** No static defaults — category/caste options come only from Settings (API). */
export const CASTE_OPTIONS = [];

/**
 * Flatten nested category → castes into a unique caste name list.
 * API returns parent categories with nested `castes`.
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

/** Find parent category for a nested caste name (or category name itself). */
export function findCategoryForCaste(categories = [], casteName) {
  if (!casteName) return null;
  const needle = String(casteName).trim();
  for (const category of categories) {
    const match = (category.castes || category.subcastes || []).find(
      (caste) => String(caste.name).trim() === needle
    );
    if (match) return category;
  }
  return categories.find((cat) => String(cat.name).trim() === needle) || null;
}

/** Find category by exact name (BC-A, OC, …). */
export function findCategoryByName(categories = [], name) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  return (
    categories.find((cat) => String(cat.name || '').trim().toLowerCase() === needle) || null
  );
}

/** Find parent category + nested caste by castes.id. */
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
 *
 * Model (shared RDS contract for other apps):
 * - students.caste       = category text ("BC-A", "OC", …) — do not rename
 * - students.category_id = caste_categories.id (preferred link)
 * - students.caste_id    = castes.id for nested caste only, else NULL
 */
export function findCategoryById(categories = [], categoryId) {
  if (categoryId == null || categoryId === '') return null;
  const id = Number(categoryId);
  if (!Number.isFinite(id)) return null;
  return categories.find((cat) => Number(cat.id) === id) || null;
}

export function getStudentCasteDisplay(categories = [], student = {}) {
  const legacyCaste =
    student?.caste != null && String(student.caste).trim() !== ''
      ? String(student.caste).trim()
      : null;

  const byCategoryId = findCategoryById(categories, student?.category_id);
  const byId = findByCasteId(categories, student?.caste_id);
  const categoryFromText = findCategoryByName(categories, legacyCaste);

  // Mirror child (subcaste named same as parent) is not a real nested caste
  const isMirrorChild =
    byId &&
    byId.category &&
    byId.caste &&
    String(byId.caste.name).trim().toLowerCase() ===
      String(byId.category.name).trim().toLowerCase();

  const categoryName =
    byCategoryId?.name ||
    (byId && !isMirrorChild ? byId.category?.name : null) ||
    categoryFromText?.name ||
    (byId ? byId.category?.name : null) ||
    legacyCaste;

  const nestedCasteName =
    byId && !isMirrorChild ? byId.caste?.name || null : null;

  return {
    linked: Boolean(byId && !isMirrorChild),
    categoryName: categoryName || null,
    casteName: nestedCasteName,
    subcasteName: nestedCasteName,
    legacyCaste
  };
}

/**
 * Build select options for a student nested-caste field.
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../config/api';
import { flattenCasteNames, findCategoryForCaste, findByCasteId, getStudentCasteDisplay } from '../config/casteConfig';

/**
 * Load castes with nested subcastes from settings API.
 * Empty until castes/subcastes are created in Settings (no static defaults).
 * API path remains /caste-categories for compatibility.
 */
export function useCasteCategories({ includeInactive = false, publicOnly = false, enabled = true } = {}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  const fetchCategories = useCallback(async () => {
    if (!enabled) return [];

    try {
      setLoading(true);
      const endpoint = publicOnly
        ? '/caste-categories/public'
        : `/caste-categories${includeInactive ? '?includeInactive=true' : ''}`;
      const response = await api.get(endpoint);
      const data = response.data.data || [];
      setCategories(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch caste categories', error);
      setCategories([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled, includeInactive, publicOnly]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.isActive !== false),
    [categories]
  );

  const casteOptions = useMemo(
    () => flattenCasteNames(activeCategories),
    [activeCategories]
  );

  const getCategoryForCaste = useCallback(
    (casteName) => findCategoryForCaste(activeCategories, casteName),
    [activeCategories]
  );

  const getCastesForCategory = useCallback(
    (categoryIdOrName) => {
      if (!categoryIdOrName) return casteOptions;
      const match = activeCategories.find(
        (cat) =>
          String(cat.id) === String(categoryIdOrName) ||
          cat.name === categoryIdOrName
      );
      if (!match) return [];
      return (match.castes || [])
        .filter((c) => c.isActive !== false)
        .map((c) => c.name);
    },
    [activeCategories, casteOptions]
  );

  const resolveStudentCaste = useCallback(
    (student) => getStudentCasteDisplay(categories, student),
    [categories]
  );

  const getByCasteId = useCallback(
    (casteId) => findByCasteId(categories, casteId),
    [categories]
  );

  return {
    categories: activeCategories,
    allCategories: categories,
    casteOptions,
    loading,
    refetch: fetchCategories,
    getCategoryForCaste,
    getCastesForCategory,
    resolveStudentCaste,
    getByCasteId
  };
}

export default useCasteCategories;

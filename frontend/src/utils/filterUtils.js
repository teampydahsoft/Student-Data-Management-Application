/**
 * Shared Filter Utilities
 * Handles cascading filters across all pages
 */

import api from '../config/api';

/**
 * Filter dependency hierarchy
 */
const FILTER_HIERARCHY = {
  college: {
    clears: ['course', 'branch'],
    children: ['course']
  },
  course: {
    clears: ['branch'],
    children: ['branch']
  },
  batch: {
    clears: ['year', 'semester'],
    children: ['year', 'semester']
  },
  year: {
    clears: ['semester'],
    children: ['semester']
  }
};

/**
 * Create a filter change handler that properly handles cascading
 * @param {Function} setFilters - State setter for filters
 * @param {Function} refreshFilterOptions - Function to refresh filter options
 * @param {Object} options - Additional options
 * @returns {Function} handleFilterChange function
 */
export const createFilterChangeHandler = (setFilters, refreshFilterOptions, options = {}) => {
  const { onFilterChange, resetPage } = options;

  return (field, value) => {
    setFilters((prev) => {
      const newFilters = {
        ...prev,
        [field]: value || '' // Clear filter if empty value
      };

      // Remove empty filters
      if (!newFilters[field] || newFilters[field] === '') {
        delete newFilters[field];
      }

      // Clear dependent filters based on hierarchy
      const hierarchy = FILTER_HIERARCHY[field];
      if (hierarchy && hierarchy.clears) {
        hierarchy.clears.forEach(dependentField => {
          delete newFilters[dependentField];
        });
      }

      // Reset page if needed
      if (resetPage) {
        resetPage(1);
      }

      // Refresh filter options for cascading
      if (refreshFilterOptions) {
        refreshFilterOptions(newFilters);
      }

      // Call custom callback if provided
      if (onFilterChange) {
        onFilterChange(newFilters);
      }

      return newFilters;
    });
  };
};

/**
 * Create onFocus handler for filter dropdowns
 * Shows all available options when user clicks to change a filter
 * @param {Object} currentFilters - Current filter values
 * @param {string} field - Field being changed
 * @param {Function} fetchFilterOptions - Function to fetch filter options
 * @returns {Function} onFocus handler
 */
export const createFilterFocusHandler = (currentFilters, field, fetchFilterOptions) => {
  return () => {
    // Create a copy of filters without the field being changed
    const filtersForFetch = { ...currentFilters };
    if (filtersForFetch[field]) {
      delete filtersForFetch[field];
    }

    // Fetch options excluding the current field value
    if (fetchFilterOptions) {
      fetchFilterOptions(filtersForFetch, field).catch(err => {
        console.warn(`Failed to refresh ${field} options:`, err);
      });
    }
  };
};

/**
 * Fetch quick filter options with cascading support
 * @param {Object} filters - Current filters
 * @param {string} excludeField - Field to exclude from query (for showing all options)
 * @returns {Promise<Object>} Filter options
 */
export const fetchQuickFilterOptions = async (filters = {}, excludeField = null) => {
  try {
    const params = new URLSearchParams();

    // Include college if selected (unless college is being changed)
    if (filters.college && excludeField !== 'college') {
      params.append('college', filters.college);
    }

    // Include course only if:
    // 1. Course is selected AND
    // 2. Course is not being changed AND
    // 3. Branch is not being changed
    if (filters.course && excludeField !== 'course' && excludeField !== 'branch') {
      params.append('course', filters.course);
    }

    // Include batch only if batch/year/semester are not being changed
    if (filters.batch && excludeField !== 'batch' && excludeField !== 'year' && excludeField !== 'semester') {
      params.append('batch', filters.batch);
    }

    const queryString = params.toString();
    const url = `/students/quick-filters${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);

    if (response.data?.success) {
      return {
        batches: response.data.data.batches || [],
        courses: response.data.data.courses || [],
        branches: response.data.data.branches || [],
        years: response.data.data.years || [],
        semesters: response.data.data.semesters || []
      };
    }

    return {
      batches: [],
      courses: [],
      branches: [],
      years: [],
      semesters: []
    };
  } catch (error) {
    console.warn('Failed to fetch quick filter options:', error);
    return {
      batches: [],
      courses: [],
      branches: [],
      years: [],
      semesters: []
    };
  }
};

/**
 * Fetch dropdown filter options with cascading support
 * @param {Object} filters - Current filters
 * @param {string} excludeField - Field to exclude from query
 * @returns {Promise<Object>} Filter options
 */
export const fetchDropdownFilterOptions = async (filters = {}, excludeField = null) => {
  try {
    const params = new URLSearchParams();
    if (filters.college && excludeField !== 'college') params.append('college', filters.college);
    if (filters.course && excludeField !== 'course') params.append('course', filters.course);
    if (filters.branch && excludeField !== 'branch') params.append('branch', filters.branch);
    if (filters.batch && excludeField !== 'batch') params.append('batch', filters.batch);
    if (filters.year && excludeField !== 'year') params.append('year', filters.year);
    if (filters.semester && excludeField !== 'semester') params.append('semester', filters.semester);

    const queryString = params.toString();
    const url = `/students/filter-options${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);

    if (response.data?.success) {
      const data = response.data.data || {};
      return {
        stud_type: data.stud_type || [],
        student_status: data.student_status || [],
        scholar_status: data.scholar_status || [],
        category_id: data.category_id || [],
        gender: data.gender || [],
        certificates_status: data.certificates_status || [],
        remarks: data.remarks || []
      };
    }

    return {
      stud_type: [],
      student_status: [],
      scholar_status: [],
      category_id: [],
      gender: [],
      certificates_status: [],
      remarks: []
    };
  } catch (error) {
    console.warn('Failed to fetch dropdown filter options:', error);
    return {
      stud_type: [],
      student_status: [],
      scholar_status: [],
      category_id: [],
      gender: [],
      certificates_status: [],
      remarks: []
    };
  }
};


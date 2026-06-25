import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import api from '../config/api';
import toast from 'react-hot-toast';

// Query key factory for students
export const studentKeys = {
  all: ['students'],
  lists: () => [...studentKeys.all, 'list'],
  list: (filters) => [...studentKeys.lists(), filters],
  details: () => [...studentKeys.all, 'detail'],
  detail: (id) => [...studentKeys.details(), id],
  stats: () => [...studentKeys.all, 'stats'],
};

/**
 * Hook to fetch paginated students with filters and search
 * @param {Object} options - Query options
 * @param {number} options.page - Current page number (1-indexed)
 * @param {number} options.pageSize - Number of items per page
 * @param {Object} options.filters - Filter object
 * @param {string} options.search - Search term
 * @param {boolean} options.enabled - Whether the query should run
 */
export const useStudents = ({
  page = 1,
  pageSize = 25,
  filters = {},
  search = '',
  sortBy = '',
  sortOrder = 'asc',
  enabled = true
} = {}) => {
  return useQuery({
    queryKey: studentKeys.list({ page, pageSize, filters, search, sortBy, sortOrder }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          // Convert filter keys to backend format
          if (key === 'batch') queryParams.append('filter_batch', value);
          else if (key === 'course') queryParams.append('filter_course', value);
          else if (key === 'branch') queryParams.append('filter_branch', value);
          else if (key === 'section') queryParams.append('filter_section', value);
          else if (key === 'year') queryParams.append('filter_year', value);
          else if (key === 'semester') queryParams.append('filter_semester', value);
          else if (key === 'dateFrom') queryParams.append('filter_dateFrom', value);
          else if (key === 'dateTo') queryParams.append('filter_dateTo', value);
          else if (key === 'pinNumberStatus') queryParams.append('filter_pinNumberStatus', value);
          else if (key.startsWith('filter_')) {
            queryParams.append(key, value);
          } else if (key.startsWith('field_')) {
            queryParams.append(`filter_field_${key.replace('field_', '')}`, value);
          } else {
            queryParams.append(`filter_${key}`, value);
          }
        }
      });

      if (search && search.trim()) {
        queryParams.append('search', search.trim());
      }

      if (sortBy && sortBy.trim()) {
        queryParams.append('sort_by', sortBy.trim());
        queryParams.append('sort_order', sortOrder === 'desc' ? 'desc' : 'asc');
      }

      queryParams.append('limit', pageSize.toString());
      queryParams.append('offset', Math.max(0, (page - 1) * pageSize).toString());

      const response = await api.get(`/students?${queryParams.toString()}`);

      return {
        students: response.data?.data || [],
        pagination: {
          total: response.data?.pagination?.total || 0,
          limit: response.data?.pagination?.limit || pageSize,
          offset: response.data?.pagination?.offset || 0,
          totalPages: response.data?.pagination?.totalPages ||
            Math.ceil((response.data?.pagination?.total || 0) / pageSize),
        },
      };
    },
    enabled,
    // Keep data fresh for 5 minutes, cache for 30 minutes
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000, // Keep cached pages for 30 minutes
  });
};

/**
 * Hook to fetch all students (for dropdowns, etc.) - use with caution
 * @param {Object} options - Query options
 * @param {Object} options.filters - Filter object
 * @param {boolean} options.enabled - Whether the query should run
 */
export const useAllStudents = ({ filters = {}, enabled = true } = {}) => {
  return useQuery({
    queryKey: studentKeys.list({ page: 'all', pageSize: 'all', filters, search: '' }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'batch') queryParams.append('filter_batch', value);
          else if (key === 'course') queryParams.append('filter_course', value);
          else if (key === 'branch') queryParams.append('filter_branch', value);
          else if (key === 'section') queryParams.append('filter_section', value);
          else if (key === 'year') queryParams.append('filter_year', value);
          else if (key === 'semester') queryParams.append('filter_semester', value);
          else if (key.startsWith('filter_')) {
            queryParams.append(key, value);
          }
        }
      });

      queryParams.append('limit', 'all');

      const response = await api.get(`/students?${queryParams.toString()}`);
      return response.data?.data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // Shorter cache for "all" queries
  });
};

/**
 * Hook to fetch student by admission number
 */
export const useStudent = (admissionNumber, enabled = true) => {
  return useQuery({
    queryKey: studentKeys.detail(admissionNumber),
    queryFn: async () => {
      const response = await api.get(`/students/${admissionNumber}`);
      return response.data?.data;
    },
    enabled: enabled && !!admissionNumber,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook to fetch student statistics
 */
export const useStudentStats = ({ enabled = true } = {}) => {
  return useQuery({
    queryKey: studentKeys.stats(),
    queryFn: async () => {
      const response = await api.get('/students/stats');
      return response.data?.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Stats are unlikely to change within 5 minutes
    gcTime: 15 * 60 * 1000,   // Keep in cache for 15 minutes
  });
};

/**
 * Hook to create a new student
 */
export const useCreateStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (studentData) => {
      const response = await api.post('/students', studentData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all student lists to refetch
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      toast.success('Student created successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create student');
    },
  });
};

/**
 * Hook to update a student
 */
export const useUpdateStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ admissionNumber, data }) => {
      const response = await api.put(`/students/${admissionNumber}`, data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all student lists and the specific student detail
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(variables.admissionNumber) });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      toast.success('Student updated successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update student');
    },
  });
};

/**
 * Hook to delete a student
 */
export const useDeleteStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (admissionNumber) => {
      const response = await api.delete(`/students/${admissionNumber}`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all student lists and stats
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      toast.success('Student deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete student');
    },
  });
};

/**
 * Hook to bulk delete students
 */
export const useBulkDeleteStudents = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (admissionNumbers) => {
      const response = await api.post('/students/bulk-delete', { admissionNumbers });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all student lists and stats
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      toast.success('Students deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete students');
    },
  });
};

/**
 * Utility function to manually invalidate student cache
 * Useful for manual refresh scenarios
 */
export const useInvalidateStudents = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: studentKeys.all });
  }, [queryClient]);
};


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  Filter,
  Users,
  CheckCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowRight,
  X,
  Search,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import LoadingAnimation from '../components/LoadingAnimation';
import RejoinModal from '../components/RejoinModal';
import ProfileUpdateSettingsModal from '../components/Students/ProfileUpdateSettingsModal';

import { SkeletonTable } from '../components/SkeletonLoader';
import { formatDate } from '../utils/dateUtils';
import { useStudents, useInvalidateStudents } from '../hooks/useStudents';

const DEFAULT_MAX_YEAR = 10;
const DEFAULT_SEMESTERS_PER_YEAR = 2;

const syncStageFields = (data = {}, year, semester) => {
  if (!year || !semester) {
    return { ...data };
  }
  return {
    ...data,
    current_year: Number(year),
    current_semester: Number(semester),
    'Current Academic Year': Number(year),
    'Current Semester': Number(semester)
  };
};

const StudentPromotions = () => {
  const [filters, setFilters] = useState({
    batch: '',
    course: '',
    level: '',
    branch: '',
    year: '',
    semester: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilterOptions, setQuickFilterOptions] = useState({
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]); // Store courses with level info
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [selectedAdmissionNumbers, setSelectedAdmissionNumbers] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [loadingPromotionPlan, setLoadingPromotionPlan] = useState(false);
  const [promotionResults, setPromotionResults] = useState(null);
  const [promotionSummaryData, setPromotionSummaryData] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [promotionPlan, setPromotionPlan] = useState([]);
  const [hasStageConflicts, setHasStageConflicts] = useState(false);
  const lastAutoSelectRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pageSizeOptions = [10, 25, 50, 100];
  const invalidateStudents = useInvalidateStudents();
  const [leftOutStudents, setLeftOutStudents] = useState([]);
  const [leftOutModalOpen, setLeftOutModalOpen] = useState(false);
  const [leftOutStudentData, setLeftOutStudentData] = useState({});
  const [detectedLeftOutStudents, setDetectedLeftOutStudents] = useState([]);
  const [showRejoinModal, setShowRejoinModal] = useState(false);
  const [rejoinStudent, setRejoinStudent] = useState(null);
  const [showProfileUpdateSettings, setShowProfileUpdateSettings] = useState(false);

  const selectedCount = selectedAdmissionNumbers.size;


  useEffect(() => {
    fetchQuickFilterOptions();
  }, []);

  // Fetch courses with level information
  useEffect(() => {
    const fetchCoursesWithLevels = async () => {
      try {
        const response = await api.get('/courses?includeInactive=false');
        if (response.data?.success) {
          setCoursesWithLevels(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch courses with levels:', error);
      }
    };
    fetchCoursesWithLevels();
  }, []);

  // Fetch filter options with cascading filters
  useEffect(() => {
    fetchQuickFilterOptions(filters);
  }, [filters.batch, filters.course]);

  const fetchQuickFilterOptions = async (currentFilters = {}, excludeField = null) => {
    setLoadingFilters(true);
    try {
      // Build query params from current filters for cascading
      // When excludeField is set, exclude that field to show all options for that dropdown
      const params = new URLSearchParams();
      if (currentFilters.batch && excludeField !== 'batch') params.append('batch', currentFilters.batch);
      // Include course only if course is not being changed and branch is not being changed
      if (currentFilters.course && excludeField !== 'course' && excludeField !== 'branch') params.append('course', currentFilters.course);
      // Don't pass branch, year, semester to get all available options

      const queryString = params.toString();
      const url = `/students/quick-filters${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      if (response.data?.success) {
        const data = response.data.data || {};
        setQuickFilterOptions({
          batches: data.batches || [],
          courses: data.courses || [],
          branches: data.branches || [],
          years: data.years || [],
          semesters: data.semesters || []
        });
      }
    } catch (error) {
      console.warn('Failed to load filter metadata:', error);
    } finally {
      setLoadingFilters(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => {
      const newFilters = {
        ...prev,
        [key]: value || '' // Clear filter if empty value
      };

      // Remove empty filters
      if (!newFilters[key] || newFilters[key] === '') {
        delete newFilters[key];
      }

      // Clear dependent filters when parent filter changes
      if (key === 'batch') {
        // When batch changes, clear course, branch, year, and semester
        delete newFilters.course;
        delete newFilters.branch;
        delete newFilters.year;
        delete newFilters.semester;
      } else if (key === 'course') {
        // When course changes, clear branch, year, and semester
        delete newFilters.branch;
        delete newFilters.year;
        delete newFilters.semester;
      } else if (key === 'branch') {
        // When branch changes, clear year and semester
        delete newFilters.year;
        delete newFilters.semester;
      } else if (key === 'year') {
        // When year changes, clear semester
        delete newFilters.semester;
      }

      // Refresh filter options for cascading
      fetchQuickFilterOptions(newFilters).catch(err => {
        console.warn('Failed to refresh filter options:', err);
      });

      // Reset to first page when filters change
      setCurrentPage(1);
      // Reset auto-select tracking
      lastAutoSelectRef.current = '';

      return newFilters;
    });
  };

  // Handle search term changes
  useEffect(() => {
    if (searchTerm.trim().length > 0 || hasActiveFilters) {
      setCurrentPage(1);
      lastAutoSelectRef.current = '';
    }
  }, [searchTerm]);

  const clearFilters = () => {
    setFilters({
      batch: '',
      course: '',
      branch: '',
      year: '',
      semester: ''
    });
    setSearchTerm('');
    setCurrentPage(1);
    setSelectedAdmissionNumbers(new Set());
    setPromotionResults(null);
    lastAutoSelectRef.current = '';
  };

  // Use React Query to fetch paginated students with filters
  // Only show students with status "Regular" on promotions page
  const hasActiveFilters = Object.values(filters).some(value => value) || searchTerm.trim().length > 0;
  const {
    data: studentsData,
    isLoading: loadingStudents,
    isFetching: isFetchingStudents,
    refetch: refetchStudents
  } = useStudents({
    page: currentPage,
    pageSize: pageSize,
    filters: {
      batch: filters.batch,
      course: filters.course,
      branch: filters.branch,
      year: filters.year,
      semester: filters.semester,
      student_status: 'Regular', // Only show Regular students for promotions
    },
    search: searchTerm.trim(),
    enabled: hasActiveFilters // Only fetch when filters or search are applied
  });

  const students = studentsData?.students || [];
  const totalStudents = studentsData?.pagination?.total || 0;
  const totalPages = studentsData?.pagination?.totalPages || 1;
  const isAllSelected = students.length > 0 && students.every(s => selectedAdmissionNumbers.has(s.admission_number));

  // Auto-select ALL students matching filters when filters are first applied
  useEffect(() => {
    if (hasActiveFilters && currentPage === 1 && totalStudents > 0) {
      const filterKey = `${filters.batch}-${filters.course}-${filters.branch}-${filters.year}-${filters.semester}-${searchTerm}`;

      if (lastAutoSelectRef.current !== filterKey) {
        // Fetch and select all students matching current filters (only Regular status)
        const selectAllMatching = async () => {
          try {
            const queryParams = new URLSearchParams();
            if (filters.batch) queryParams.append('filter_batch', filters.batch);
            if (filters.course) queryParams.append('filter_course', filters.course);
            if (filters.branch) queryParams.append('filter_branch', filters.branch);
            if (filters.year) queryParams.append('filter_year', filters.year);
            if (filters.semester) queryParams.append('filter_semester', filters.semester);
            if (searchTerm.trim()) queryParams.append('search', searchTerm.trim());
            queryParams.append('filter_student_status', 'Regular'); // Only Regular students
            queryParams.append('limit', 'all');

            const response = await api.get(`/students?${queryParams.toString()}`);
            const allStudents = response.data?.data || [];
            const allAdmissionNumbers = allStudents.map(s => s.admission_number);
            setSelectedAdmissionNumbers(new Set(allAdmissionNumbers));
            lastAutoSelectRef.current = filterKey;
          } catch (error) {
            console.warn('Failed to auto-select all students:', error);
            // Fallback: select current page students
            const currentPageIds = students.map((s) => s.admission_number);
            setSelectedAdmissionNumbers(prev => {
              const updated = new Set(prev);
              currentPageIds.forEach(id => updated.add(id));
              return updated;
            });
            lastAutoSelectRef.current = filterKey;
          }
        };

        selectAllMatching();
      }
    }
  }, [hasActiveFilters, filters.batch, filters.course, filters.branch, filters.year, filters.semester, searchTerm, totalStudents, currentPage, students]);

  const handlePageChange = (newPage) => {
    if (newPage === currentPage || newPage < 1 || newPage > totalPages) {
      return;
    }
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (event) => {
    const newSize = parseInt(event.target.value, 10);
    if (Number.isNaN(newSize) || newSize <= 0 || newSize === pageSize) {
      return;
    }
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Select all students matching current filters (across all pages)
  const toggleSelectAllStudents = async (checked) => {
    if (checked) {
      // Fetch all students matching current filters to select them all (only Regular status)
      try {
        const queryParams = new URLSearchParams();
        if (filters.batch) queryParams.append('filter_batch', filters.batch);
        if (filters.course) queryParams.append('filter_course', filters.course);
        if (filters.branch) queryParams.append('filter_branch', filters.branch);
        if (filters.year) queryParams.append('filter_year', filters.year);
        if (filters.semester) queryParams.append('filter_semester', filters.semester);
        if (searchTerm.trim()) queryParams.append('search', searchTerm.trim());
        queryParams.append('filter_student_status', 'Regular'); // Only Regular students
        queryParams.append('limit', 'all'); // Fetch all matching students

        const response = await api.get(`/students?${queryParams.toString()}`);
        const allStudents = response.data?.data || [];
        const allAdmissionNumbers = allStudents.map(s => s.admission_number);
        setSelectedAdmissionNumbers(new Set(allAdmissionNumbers));
        toast.success(`Selected all ${allAdmissionNumbers.length} students matching filters`);
      } catch (error) {
        // Fallback: select all from current page if fetch fails
        setSelectedAdmissionNumbers(prev => {
          const updated = new Set(prev);
          students.forEach(s => updated.add(s.admission_number));
          return updated;
        });
        toast.error('Failed to select all students. Selected current page only.');
      }
    } else {
      // Clear all selections
      setSelectedAdmissionNumbers(new Set());
    }
  };

  const toggleSelectStudent = (admissionNumber) => {
    setSelectedAdmissionNumbers((prev) => {
      const updated = new Set(prev);
      if (updated.has(admissionNumber)) {
        updated.delete(admissionNumber);
      } else {
        updated.add(admissionNumber);
      }
      return updated;
    });
  };

  const getStudentName = (student) => {
    const data = student.student_data;
    if (data && typeof data === 'object') {
      const nameKey = Object.keys(data).find((key) => {
        const lower = key.toLowerCase();
        return lower === 'name' || lower.includes('student name');
      });
      if (nameKey && data[nameKey]) {
        return data[nameKey];
      }
    }
    return student.student_name || '-';
  };

  const promotionSummary = useMemo(() => {
    if (promotionSummaryData) {
      return promotionSummaryData;
    }
    if (!promotionResults || !Array.isArray(promotionResults)) {
      return null;
    }
    return promotionResults.reduce(
      (acc, result) => {
        if (result.status === 'success') acc.success += 1;
        else if (result.status === 'skipped') acc.skipped += 1;
        else acc.errors += 1;
        return acc;
      },
      { success: 0, skipped: 0, errors: 0 }
    );
  }, [promotionResults, promotionSummaryData]);

  const promotionProgress = useMemo(() => {
    const totalFromSummary = promotionSummaryData?.total;
    const processedFromSummary = promotionSummaryData?.processed;
    const latestResultProgress = Array.isArray(promotionResults) && promotionResults.length > 0
      ? promotionResults[promotionResults.length - 1]?.progress
      : null;

    const total =
      totalFromSummary ??
      (promotionPlan?.filter((item) => item.nextStage && item.issues.length === 0).length ||
        selectedAdmissionNumbers.size ||
        null);
    const processed =
      processedFromSummary ??
      (latestResultProgress?.current ?? (promotionResults ? promotionResults.length : 0));

    return {
      processed: processed || 0,
      total: total || 0,
      label: total ? `${processed || 0}/${total}` : null
    };
  }, [promotionSummaryData, promotionResults, promotionPlan, selectedAdmissionNumbers]);

  const getCurrentStageFromStudent = (student) => {
    if (!student) {
      return null;
    }

    const data = student.student_data || {};
    const year =
      Number(student.current_year) ||
      Number(data.current_year) ||
      Number(data['Current Academic Year']);
    const semester =
      Number(student.current_semester) ||
      Number(data.current_semester) ||
      Number(data['Current Semester']);

    if (!Number.isFinite(year) || !Number.isFinite(semester)) {
      return null;
    }

    return { year, semester };
  };

  const getNextStage = (year, semester, courseConfig = null) => {
    const normalizedYear = Number(year);
    const normalizedSemester = Number(semester);

    if (
      !Number.isInteger(normalizedYear) ||
      !Number.isInteger(normalizedSemester) ||
      normalizedYear < 1 ||
      normalizedSemester < 1
    ) {
      return null;
    }

    // Get semester count for current year from course configuration
    let semestersForCurrentYear = DEFAULT_SEMESTERS_PER_YEAR;
    const configuredTotalYears =
      courseConfig && Number.isInteger(Number(courseConfig.totalYears)) && Number(courseConfig.totalYears) > 0
        ? Number(courseConfig.totalYears)
        : null;

    if (courseConfig) {
      // Check for per-year semester configuration (prioritize this)
      if (courseConfig.yearSemesterConfig && Array.isArray(courseConfig.yearSemesterConfig) && courseConfig.yearSemesterConfig.length > 0) {
        const yearConfig = courseConfig.yearSemesterConfig.find(y => Number(y.year) === normalizedYear);
        if (yearConfig && yearConfig.semesters) {
          semestersForCurrentYear = Number(yearConfig.semesters);
        } else {
          // If year config not found, fallback to default semesters per year
          semestersForCurrentYear = courseConfig.semestersPerYear || DEFAULT_SEMESTERS_PER_YEAR;
        }
      } else if (courseConfig.semestersPerYear) {
        // Fallback to default semesters per year if no per-year config
        semestersForCurrentYear = Number(courseConfig.semestersPerYear) || DEFAULT_SEMESTERS_PER_YEAR;
      }
    }

    // If current semester is less than the semester count for this year, move to next semester
    if (normalizedSemester < semestersForCurrentYear) {
      return {
        year: normalizedYear,
        semester: normalizedSemester + 1
      };
    }

    // If we've completed all semesters for this year, move to next year
    const maxYears = configuredTotalYears || DEFAULT_MAX_YEAR;
    if (normalizedYear >= maxYears) {
      return null;
    }

    return {
      year: normalizedYear + 1,
      semester: 1
    };
  };

  const handlePromoteSelected = async () => {
    if (selectedAdmissionNumbers.size === 0) {
      toast.error('Select at least one student to promote');
      return;
    }

    // Fetch student data for all selected admission numbers (they might be on different pages)
    const selectedIds = Array.from(selectedAdmissionNumbers);
    setLoadingPromotionPlan(true);

    try {
      // Fetch all selected students in parallel to get their current stage info
      const studentPromises = selectedIds.map(async (admissionNumber) => {
        try {
          const response = await api.get(`/students/${admissionNumber}`);
          return response.data?.data;
        } catch (error) {
          console.warn(`Failed to fetch student ${admissionNumber}:`, error);
          return null;
        }
      });

      const fetchedStudents = await Promise.all(studentPromises);
      const studentMap = new Map();
      fetchedStudents.forEach((student, index) => {
        if (student) {
          studentMap.set(selectedIds[index], student);
        }
      });

      // Fetch course configurations for all unique courses
      const uniqueCourses = new Set();
      fetchedStudents.forEach(student => {
        if (student && student.course) {
          uniqueCourses.add(student.course);
        }
      });

      const courseConfigMap = new Map();
      if (uniqueCourses.size > 0) {
        try {
          const coursesResponse = await api.get('/courses?includeInactive=false');
          const allCourses = coursesResponse.data?.data || [];
          uniqueCourses.forEach(courseName => {
            const course = allCourses.find(c => c.name === courseName);
            if (course) {
              courseConfigMap.set(courseName, {
                totalYears: course.totalYears || course.total_years || course.defaultYears,
                semestersPerYear: course.semestersPerYear || course.semesters_per_year,
                yearSemesterConfig: course.yearSemesterConfig || course.year_semester_config
              });
            }
          });
        } catch (error) {
          console.warn('Failed to fetch course configurations:', error);
        }
      }

      // Create promotion plan with fetched student data
      const plan = selectedIds.map((admissionNumber) => {
        const student = studentMap.get(admissionNumber) || students.find((s) => s.admission_number === admissionNumber);
        const currentStage = student ? getCurrentStageFromStudent(student) : null;
        const courseConfig = student && student.course ? courseConfigMap.get(student.course) : null;
        const nextStage = currentStage ? getNextStage(currentStage.year, currentStage.semester, {
          totalYears: courseConfig?.totalYears,
          semestersPerYear: courseConfig?.semestersPerYear,
          yearSemesterConfig: courseConfig?.yearSemesterConfig
        }) : null;

        const issues = [];
        const infoNotes = [];

        if (!student) {
          issues.push('Student record not found');
        } else if (!currentStage) {
          issues.push('Missing current academic stage');
        }

        // Note: Course completion check is done after issues array is built
        // to properly set isCourseCompleted flag

        // Check conflicts with all fetched students
        let hasConflict = false;
        if (nextStage && student) {
          hasConflict = Array.from(studentMap.values()).some(
            (candidate) =>
              candidate.admission_number !== admissionNumber &&
              Number(candidate.current_year) === Number(nextStage.year) &&
              Number(candidate.current_semester) === Number(nextStage.semester)
          );
        }

        // Determine if student has completed the course
        let isCourseCompleted = false;
        if (!nextStage && courseConfig && currentStage && issues.length === 0) {
          const totalYears = courseConfig.totalYears || 4;
          const DEFAULT_SEMESTERS_PER_YEAR = 2;
          let semestersForFinalYear = DEFAULT_SEMESTERS_PER_YEAR;

          if (courseConfig.yearSemesterConfig && Array.isArray(courseConfig.yearSemesterConfig)) {
            const yearConfig = courseConfig.yearSemesterConfig.find(y => Number(y.year) === totalYears);
            if (yearConfig && yearConfig.semesters) {
              semestersForFinalYear = Number(yearConfig.semesters);
            } else {
              semestersForFinalYear = courseConfig.semestersPerYear || DEFAULT_SEMESTERS_PER_YEAR;
            }
          } else if (courseConfig.semestersPerYear) {
            semestersForFinalYear = Number(courseConfig.semestersPerYear) || DEFAULT_SEMESTERS_PER_YEAR;
          }

          if (currentStage.year === totalYears && currentStage.semester === semestersForFinalYear) {
            isCourseCompleted = true;
            infoNotes.push('Student has completed all years and semesters. Will be marked as "Course Completed".');
          }
        }

        return {
          admissionNumber,
          studentName: student ? getStudentName(student) : 'Unknown',
          currentStage,
          nextStage,
          issues,
          hasConflict,
          isCourseCompleted,
          infoNotes
        };
      });

      setPromotionPlan(plan);
      setHasStageConflicts(plan.some((item) => item.hasConflict));

      // Check for left-out students early (students matching filters but not selected)
      try {
        const allMatchingStudents = await fetchAllMatchingStudents();
        const leftOut = allMatchingStudents.filter(
          (student) => !selectedIds.includes(student.admission_number)
        );
        setDetectedLeftOutStudents(leftOut);

        // Pre-initialize left-out student data if any
        if (leftOut.length > 0) {
          const initialData = {};
          leftOut.forEach((student) => {
            initialData[student.admission_number] = {
              remarks: student.remarks || '',
              student_status: student.student_status || 'Regular'
            };
          });
          setLeftOutStudentData(initialData);
        }
      } catch (error) {
        console.warn('Failed to check for left-out students:', error);
        setDetectedLeftOutStudents([]);
      }

      setConfirmationOpen(true);
    } catch (error) {
      toast.error('Failed to load student data for promotion plan');
      console.error('Error fetching students for promotion:', error);
    } finally {
      setLoadingPromotionPlan(false);
    }
  };

  const executePromotion = async () => {
    // Include students who can be promoted OR students who have completed the course
    const promotableStudents = promotionPlan.filter(
      (item) => (item.nextStage && item.issues.length === 0) ||
        (item.isCourseCompleted && item.issues.length === 0)
    );

    if (promotableStudents.length === 0) {
      toast.error('No eligible students to promote');
      return;
    }

    // Use the already detected left-out students
    const leftOut = detectedLeftOutStudents;

    // If there are left-out students, show modal to add remarks/status
    if (leftOut.length > 0) {
      setLeftOutStudents(leftOut);
      setLeftOutModalOpen(true);
      setConfirmationOpen(false);
      return;
    }

    // No left-out students, proceed with promotion
    await performPromotion(promotableStudents, []);
  };

  const fetchAllMatchingStudents = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.batch) queryParams.append('filter_batch', filters.batch);
      if (filters.course) queryParams.append('filter_course', filters.course);
      if (filters.branch) queryParams.append('filter_branch', filters.branch);
      if (filters.year) queryParams.append('filter_year', filters.year);
      if (filters.semester) queryParams.append('filter_semester', filters.semester);
      if (searchTerm.trim()) queryParams.append('search', searchTerm.trim());
      queryParams.append('filter_student_status', 'Regular'); // Only Regular students
      queryParams.append('limit', 'all');

      const response = await api.get(`/students?${queryParams.toString()}`);
      return response.data?.data || [];
    } catch (error) {
      console.error('Failed to fetch all matching students:', error);
      return [];
    }
  };

  const performPromotion = async (promotableStudents, leftOutUpdates = []) => {
    setSubmitting(true);
    try {
      const response = await api.post('/students/promotions/bulk', {
        students: promotableStudents.map((item) => ({ admissionNumber: item.admissionNumber })),
        leftOutStudents: leftOutUpdates
      });

      const results = response.data?.results || [];
      const leftOutResults = response.data?.leftOutResults || [];
      setPromotionSummaryData(response.data?.summary || null);
      setPromotionResults([...results, ...leftOutResults]);

      const successCount = results.filter((result) => result.status === 'success').length;
      const completedCount = results.filter((result) => result.status === 'completed').length;
      const leftOutSuccessCount = leftOutResults.filter((result) => result.status === 'success').length;

      if (successCount > 0 || completedCount > 0 || leftOutSuccessCount > 0) {
        const messages = [];
        if (successCount > 0) {
          messages.push(`Successfully promoted ${successCount} student${successCount === 1 ? '' : 's'}`);
        }
        if (completedCount > 0) {
          messages.push(`${completedCount} student${completedCount === 1 ? ' has' : 's have'} completed the course`);
        }
        if (leftOutSuccessCount > 0) {
          messages.push(`Updated ${leftOutSuccessCount} left-out student${leftOutSuccessCount === 1 ? '' : 's'}`);
        }
        toast.success(messages.join('. '));
        // Invalidate cache to refetch updated student data
        invalidateStudents();
        // Clear selections after successful promotion
        setSelectedAdmissionNumbers(new Set());
        // Reset to first page
        setCurrentPage(1);
      } else {
        toast.error('No students were promoted or updated');
      }
      setConfirmationOpen(false);
      setLeftOutModalOpen(false);
      setLeftOutStudents([]);
      setLeftOutStudentData({});
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to promote students');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeftOutSubmit = async () => {
    // Validate that all left-out students have status and remarks
    const missingData = [];
    leftOutStudents.forEach((student) => {
      const data = leftOutStudentData[student.admission_number];
      if (!data || !data.student_status || !data.student_status.trim()) {
        missingData.push(`${student.admission_number} - missing status`);
      }
      if (!data || !data.remarks || !data.remarks.trim()) {
        missingData.push(`${student.admission_number} - missing remarks`);
      }
    });

    if (missingData.length > 0) {
      toast.error(`Please fill in status and remarks for all left-out students. Missing: ${missingData.join(', ')}`);
      return;
    }

    // Prepare left-out student updates
    const leftOutUpdates = leftOutStudents.map((student) => {
      const data = leftOutStudentData[student.admission_number];
      return {
        admissionNumber: student.admission_number,
        remarks: (data?.remarks || '').trim(),
        student_status: (data?.student_status || 'Regular').trim()
      };
    });

    // Get promotable students from promotion plan
    const promotableStudents = promotionPlan.filter(
      (item) => item.nextStage && item.issues.length === 0
    );

    // Perform promotion with left-out updates
    await performPromotion(promotableStudents, leftOutUpdates);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 heading-font flex items-center gap-2 sm:gap-3">
            <TrendingUp className="text-indigo-600" size={24} />
            Student Promotions
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowProfileUpdateSettings(true)}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation min-h-[44px] text-sm"
            title="Configure Student Profile Update Request Fields"
          >
            <Settings size={18} className="text-gray-500" />
            <span className="hidden sm:inline">Settings</span>
            <span className="sm:hidden text-xs">Settings</span>
          </button>
          <button
            onClick={fetchQuickFilterOptions}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation min-h-[44px] text-sm"
            disabled={loadingFilters}
          >
            {loadingFilters ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">Refresh Options</span>
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>

      </div>

      {/* Filter Card with Inline Promotion Review */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 text-gray-700">
          <Filter size={18} />
          <h2 className="text-base sm:text-lg font-semibold">Promotion Criteria</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Batch</label>
            <select
              value={filters.batch}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
              className="px-3 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 touch-manipulation min-h-[44px]"
            >
              <option value="">All Batches</option>
              {(quickFilterOptions.batches || []).map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Program</label>
            <select
              value={filters.course || ''}
              onChange={(e) => handleFilterChange('course', e.target.value)}
              onFocus={() => {
                // When user focuses on course dropdown, refresh options excluding current course
                // This shows all courses for the selected batch, allowing direct selection
                const filtersForFetch = { ...filters };
                if (filtersForFetch.course) {
                  delete filtersForFetch.course;
                }
                fetchQuickFilterOptions(filtersForFetch, 'course').catch(err => {
                  console.warn('Failed to refresh course options:', err);
                });
              }}
              disabled={!filters.batch}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">All Programs</option>
              {(quickFilterOptions.courses || [])
                .filter(course => {
                  // Filter by level if level is selected
                  if (filters.level) {
                    const courseInfo = coursesWithLevels.find(c => c.name === course);
                    return courseInfo?.level === filters.level;
                  }
                  return true;
                })
                .map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Level</label>
            <select
              value={filters.level || ''}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              <option value="">All Levels</option>
              <option value="diploma">Diploma</option>
              <option value="ug">UG</option>
              <option value="pg">PG</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Branch</label>
            <select
              value={filters.branch || ''}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              onFocus={() => {
                // When user focuses on branch dropdown, refresh options excluding current branch
                // This shows all branches for the selected course, allowing direct selection
                const filtersForFetch = { ...filters };
                if (filtersForFetch.branch) {
                  delete filtersForFetch.branch;
                }
                fetchQuickFilterOptions(filtersForFetch, 'branch').catch(err => {
                  console.warn('Failed to refresh branch options:', err);
                });
              }}
              disabled={!filters.course}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">All Branches</option>
              {(quickFilterOptions.branches || []).map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Current Year
            </label>
            <select
              value={filters.year}
              onChange={(e) => handleFilterChange('year', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              <option value="">All Years</option>
              {(quickFilterOptions.years || []).map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Current Semester
            </label>
            <select
              value={filters.semester}
              onChange={(e) => handleFilterChange('semester', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              <option value="">All Semesters</option>
              {(quickFilterOptions.semesters || []).map((semester) => (
                <option key={semester} value={semester}>
                  Semester {semester}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Promotion Review Inline */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendingUp size={18} className="text-indigo-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Promotion Review</h3>
                <p className="text-xs text-gray-600">
                  Selected {selectedCount} of {totalStudents.toLocaleString()} student{totalStudents === 1 ? '' : 's'}
                  {totalStudents > 0 && selectedCount > 0 && (
                    <span className="ml-1 text-gray-500">
                      ({students.filter(s => selectedAdmissionNumbers.has(s.admission_number)).length} visible on this page)
                    </span>
                  )}
                </p>
                {totalStudents > 0 && selectedCount < totalStudents && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    ⚠️ {totalStudents - selectedCount} student{totalStudents - selectedCount === 1 ? '' : 's'} will require remarks/status update
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => toggleSelectAllStudents(true)}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px]"
                disabled={totalStudents === 0 || loadingStudents}
                title="Select all students matching current filters (across all pages)"
              >
                <span className="hidden sm:inline">Select All ({totalStudents.toLocaleString()})</span>
                <span className="sm:hidden">Select All</span>
              </button>
              <button
                onClick={() => setSelectedAdmissionNumbers(new Set())}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px]"
                disabled={selectedCount === 0}
              >
                Clear
              </button>
              <button
                onClick={handlePromoteSelected}
                className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 active:bg-indigo-800 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
                disabled={selectedCount === 0 || submitting || loadingPromotionPlan}
              >
                {loadingPromotionPlan ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span className="hidden sm:inline">Loading Plan...</span>
                    <span className="sm:hidden">Loading...</span>
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>
                      Promoting{promotionProgress?.label ? ` (${promotionProgress.label})` : '...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Promote Selected</span>
                    <span className="sm:hidden">Promote</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {promotionSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
              <div className="flex items-center gap-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <RefreshCw size={16} className="text-indigo-600" />
                <span>
                  Progress: {promotionSummary.processed ?? promotionSummary.success + promotionSummary.skipped + promotionSummary.errors}/{promotionSummary.total ?? '-'}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-100 rounded-lg px-3 py-2 text-sm">
                <CheckCircle size={16} />
                <span>Promoted: {promotionSummary.success}</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-3 py-2 text-sm">
                <RefreshCw size={16} />
                <span>Skipped: {promotionSummary.skipped}</span>
              </div>
              <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-100 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle size={16} />
                <span>Errors: {promotionSummary.errors + (promotionSummary.leftOutErrors || 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Adjust the filters to refresh the matching students automatically.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCurrentPage(1);
                  }
                }}
                placeholder="Search by name or PIN number..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none"
              />
            </div>
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Matched Students</h2>
            <p className="text-sm text-gray-600">
              Review the students that match the current criteria and choose who to promote.
            </p>
          </div>
          <div className="text-sm text-gray-600">
            Total: {totalStudents.toLocaleString()} student{totalStudents === 1 ? '' : 's'}
            {totalStudents > 0 && (
              <span className="ml-2 text-gray-500">
                (Showing {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, totalStudents).toLocaleString()})
              </span>
            )}
          </div>
        </div>

        {(loadingStudents || isFetchingStudents) ? (
          <div className="p-6">
            <SkeletonTable rows={pageSize || 10} cols={6} />
          </div>
        ) : students.length === 0 ? (
          <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
            Adjust the filters to find the students you want to promote.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={(e) => toggleSelectAllStudents(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Batch
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Admission Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      PIN Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Student Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Course
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Branch
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Year
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Semester
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student) => {
                    const admissionNumber = student.admission_number;
                    const isSelected = selectedAdmissionNumbers.has(admissionNumber);
                    return (
                      <tr
                        key={admissionNumber}
                        className={isSelected ? 'bg-indigo-50/40' : 'bg-white'}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(admissionNumber)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-medium">{student.batch || '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {admissionNumber}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.pin_no ? (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
                              {student.pin_no}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {getStudentName(student)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-medium">
                          {student.course || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="text-xs uppercase tracking-wide">
                            {student.branch || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.current_year || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.current_semester || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalStudents > 0 && (
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-4 py-4 border-t border-gray-100 mt-4">
                <div className="text-sm text-gray-600">
                  {totalStudents === 0
                    ? 'No students to display'
                    : `Showing ${((currentPage - 1) * pageSize + 1).toLocaleString()}-${Math.min(currentPage * pageSize, totalStudents).toLocaleString()} of ${totalStudents.toLocaleString()}`}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={handlePageSizeChange}
                      className="px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      disabled={loadingStudents || isFetchingStudents}
                    >
                      {pageSizeOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1 || loadingStudents || isFetchingStudents || totalStudents === 0}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {Math.min(currentPage, totalPages).toLocaleString()} of {totalPages.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages || loadingStudents || isFetchingStudents || totalStudents === 0}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {promotionResults && promotionResults.length > 0 && (
              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-100 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-700">Latest Promotion Results</h3>
                  {promotionProgress?.label && (
                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
                      Progress: {promotionProgress.label}
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                  {promotionResults.map((result, index) => {
                    const isSuccess = result.status === 'success';
                    const isCompleted = result.status === 'completed';
                    const isSkipped = result.status === 'skipped';
                    const statusColor = isSuccess
                      ? 'text-green-700'
                      : isCompleted
                        ? 'text-blue-700'
                        : isSkipped
                          ? 'text-amber-700'
                          : 'text-red-700';
                    const statusBg = isSuccess
                      ? 'bg-green-50 border-green-100'
                      : isCompleted
                        ? 'bg-blue-50 border-blue-100'
                        : isSkipped
                          ? 'bg-amber-50 border-amber-100'
                          : 'bg-red-50 border-red-100';
                    const progressLabel = result?.progress?.label;
                    return (
                      <li
                        key={`${result.admissionNumber || index}-${result.status}`}
                        className={`px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-l-4 ${statusBg}`}
                      >
                        <div className="flex items-center gap-3">
                          {isSuccess ? (
                            <CheckCircle size={18} className="text-green-600" />
                          ) : isCompleted ? (
                            <CheckCircle size={18} className="text-blue-600" />
                          ) : isSkipped ? (
                            <RefreshCw size={18} className="text-amber-600" />
                          ) : (
                            <AlertTriangle size={18} className="text-red-600" />
                          )}
                          <div>
                            <p className={`font-semibold ${statusColor}`}>
                              {result.admissionNumber || 'Unknown admission number'}
                            </p>
                            <p className="text-xs text-gray-600">
                              {isSuccess
                                ? `Updated to Year ${result.currentYear}, Semester ${result.currentSemester}`
                                : isCompleted
                                  ? result.message || 'Course completed. Status updated to "Course Completed".'
                                  : result.message || 'No additional details provided.'}
                            </p>
                          </div>
                        </div>
                        <div className={`text-xs font-semibold uppercase ${statusColor}`}>
                          <div className="flex items-center gap-2">
                            <span>{isCompleted ? 'Course Completed' : result.status}</span>
                            {progressLabel && (
                              <span className="px-2 py-0.5 rounded-full bg-white text-gray-700 border border-gray-300 lowercase">
                                {progressLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {confirmationOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Confirm Promotion</h3>
                  <p className="text-sm text-indigo-100 mt-0.5">
                    Review the promotion plan before proceeding
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmationOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                disabled={submitting}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {hasStageConflicts && (
                <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Stage Conflicts Detected</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Some selected students already have peers in the target stage. Please review carefully before proceeding.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Promotion Summary
                    </h4>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                      {promotionPlan.filter(item => (item.nextStage && item.issues.length === 0) || (item.isCourseCompleted && item.issues.length === 0)).length} Eligible
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100/80 backdrop-blur-sm">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Admission No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Student Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Current Stage
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Next Stage
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {promotionPlan.map((item) => {
                        const isEligible = (item.nextStage && item.issues.length === 0) ||
                          (item.isCourseCompleted && item.issues.length === 0);
                        const issueText = item.issues.filter(Boolean).join(', ');
                        const infoText = Array.isArray(item.infoNotes) ? item.infoNotes.filter(Boolean).join('. ') : '';
                        const conflictText = item.hasConflict
                          ? 'Target stage already contains students'
                          : '';
                        const noteText = [issueText, conflictText, infoText].filter(Boolean).join('. ');
                        return (
                          <tr
                            key={item.admissionNumber}
                            className={`transition-colors ${isEligible
                              ? 'hover:bg-indigo-50/50'
                              : 'bg-red-50/30 hover:bg-red-50/50'
                              }`}
                          >
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                              {item.admissionNumber}
                            </td>
                            <td className="px-4 py-3 text-gray-800 font-medium">
                              {item.studentName || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {item.currentStage ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold">
                                  Year {item.currentStage.year} • Sem {item.currentStage.semester}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {item.nextStage ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold">
                                  <ArrowRight size={14} className="text-indigo-600" />
                                  Year {item.nextStage.year} • Sem {item.nextStage.semester}
                                </span>
                              ) : item.isCourseCompleted ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold">
                                  <CheckCircle size={14} className="text-blue-600" />
                                  Course Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-700 border border-red-200 text-xs font-semibold">
                                  Not eligible
                                </span>
                              )}
                              {noteText && (
                                <p className="mt-1.5 text-xs text-gray-500 italic">{noteText}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEligible ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                  <CheckCircle size={14} />
                                  Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                                  <AlertTriangle size={14} />
                                  Issue
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-2">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <CheckCircle className="text-blue-600" size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Promotion Notice</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Only students marked as eligible will be promoted.
                    {detectedLeftOutStudents.length > 0 && (
                      <span className="block mt-1 text-amber-600 font-medium">
                        ⚠️ {detectedLeftOutStudents.length} left-out student{detectedLeftOutStudents.length === 1 ? '' : 's'} will require status/remarks update.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setConfirmationOpen(false)}
                  className="px-5 py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={executePromotion}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold shadow-lg hover:from-indigo-700 hover:to-indigo-800 transition-all transform hover:scale-105 active:scale-95 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      Promoting...
                    </span>
                  ) : (
                    'Confirm Promotion'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Left-Out Students Modal */}
      {leftOutModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Handle Left-Out Students</h3>
                  <p className="text-sm text-amber-100 mt-0.5">
                    {leftOutStudents.length} student{leftOutStudents.length === 1 ? '' : 's'} not selected for promotion
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLeftOutModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                disabled={submitting}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Action Required</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Please add remarks and update the status for students who were not promoted.
                    Common statuses include: Regular, Detained, Discontinued, etc.
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                    Left-Out Students ({leftOutStudents.length})
                  </h4>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <div className="divide-y divide-gray-200">
                    {leftOutStudents.map((student) => {
                      const studentData = leftOutStudentData[student.admission_number] || {
                        remarks: student.remarks || '',
                        student_status: student.student_status || 'Regular'
                      };
                      return (
                        <div key={student.admission_number} className="p-4 bg-white hover:bg-gray-50 transition-colors border-l-4 border-amber-200">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                              <div className="space-y-1">
                                <p className="font-semibold text-gray-900">{getStudentName(student)}</p>
                                <p className="text-xs text-gray-600 font-mono">{student.admission_number}</p>
                                <p className="text-xs text-gray-500">
                                  {student.course} • {student.branch}
                                </p>
                                {student.current_year && student.current_semester && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Year {student.current_year} • Sem {student.current_semester}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="md:col-span-1">
                              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                                Student Status <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={studentData.student_status}
                                onChange={(e) => {
                                  const newStatus = e.target.value;
                                  if (newStatus === 'Rejoined') {
                                    setRejoinStudent(student);
                                    setShowRejoinModal(true);
                                    // Don't update local state yet, wait for modal completion
                                  } else {
                                    setLeftOutStudentData((prev) => ({
                                      ...prev,
                                      [student.admission_number]: {
                                        ...prev[student.admission_number],
                                        student_status: newStatus
                                      }
                                    }));
                                  }
                                }}
                                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium bg-white"
                                disabled={submitting}
                                required
                              >
                                <option value="Regular">Regular</option>
                                <option value="Detained">Detained</option>
                                <option value="Discontinued">Discontinued</option>
                                <option value="Completed">Completed</option>
                                <option value="Transferred">Transferred</option>
                                <option value="Absent">Absent</option>
                                <option value="Long Absent">Long Absent</option>
                                <option value="Admission Cancelled">Admission Cancelled</option>
                                <option value="Rejoined">Rejoined</option>
                              </select>
                              <p className="text-xs text-gray-500 mt-1">
                                Current: <span className="font-medium">{student.student_status || 'Regular'}</span>
                              </p>
                            </div>
                            <div className="md:col-span-1">
                              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                                Remarks <span className="text-amber-600">(Required)</span>
                              </label>
                              <textarea
                                value={studentData.remarks}
                                onChange={(e) => {
                                  setLeftOutStudentData((prev) => ({
                                    ...prev,
                                    [student.admission_number]: {
                                      ...prev[student.admission_number],
                                      remarks: e.target.value
                                    }
                                  }));
                                }}
                                placeholder="Enter remarks (e.g., Detained due to low attendance, Failed in exams, etc.)"
                                rows="3"
                                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm resize-none"
                                disabled={submitting}
                                required
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                {studentData.remarks.length} characters
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-2">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <AlertTriangle className="text-amber-600" size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Important Notice</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    These students will <strong>NOT</strong> be promoted. Please update their status and add remarks explaining why they were not promoted.
                  </p>
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    ⚠️ Status and remarks are required for all left-out students.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setLeftOutModalOpen(false);
                    setLeftOutStudents([]);
                    setLeftOutStudentData({});
                  }}
                  className="px-5 py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeftOutSubmit}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold shadow-lg hover:from-amber-700 hover:to-amber-800 transition-all transform hover:scale-105 active:scale-95 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      Processing...
                    </span>
                  ) : (
                    'Confirm & Promote'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Rejoin Modal */}
      <RejoinModal
        isOpen={showRejoinModal}
        onClose={() => {
          setShowRejoinModal(false);
          setRejoinStudent(null);
        }}
        student={rejoinStudent}
        onRejoinComplete={(updatedStudent) => {
          // Remove the student from the left-out list as they have been moved to another batch
          setLeftOutStudents((prev) => prev.filter(s => s.admission_number !== updatedStudent.admission_number));

          setShowRejoinModal(false);
          setRejoinStudent(null);
          toast.success('Student rejoin processed successfully');
          // Invalidate to refresh main lists
          invalidateStudents();
        }}
      />
      <ProfileUpdateSettingsModal
        isOpen={showProfileUpdateSettings}
        onClose={() => setShowProfileUpdateSettings(false)}
      />

    </div>
  );

};

export default StudentPromotions;


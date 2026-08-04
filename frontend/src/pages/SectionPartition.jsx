import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  LayoutGrid,
  Filter,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Save,
  Users,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import { SkeletonTable } from '../components/SkeletonLoader';
import useAuthStore from '../store/authStore';
import {
  hasPermission,
  hasModuleAccess,
  isFullAccessRole,
  BACKEND_MODULES,
  FRONTEND_MODULES
} from '../constants/rbac';

const CHUNK_SIZE = 50;

const getBranchSectionConfig = (coursesWithLevels, courseName, branchName) => {
  if (!branchName) {
    return { enabled: false, items: [] };
  }

  const courseObj = coursesWithLevels.find((course) => course.name === courseName);
  const branchObj = (courseObj?.branches || []).find((branch) => branch.name === branchName);
  if (!branchObj?.metadata?.sections?.enabled) {
    return { enabled: false, items: [] };
  }

  const items = (branchObj.metadata?.sections?.items || [])
    .map((item) => item?.name)
    .filter(Boolean);

  return { enabled: items.length > 0, items };
};

const normalizeSectionValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const getStudentKey = (student) => student?.admissionNumber || String(student?.id ?? '');

const SectionPartition = () => {
  const { user } = useAuthStore();
  const userPermissions = user?.permissions || {};
  const canViewSectionPartition =
    isFullAccessRole(user?.role) ||
    hasModuleAccess(userPermissions, FRONTEND_MODULES.SECTION_PARTITION) ||
    (Array.isArray(user?.modules) && user.modules.includes(FRONTEND_MODULES.SECTION_PARTITION));
  const canEditSection =
    isFullAccessRole(user?.role) ||
    hasPermission(userPermissions, BACKEND_MODULES.SECTION_PARTITION, 'manage');

  const [filters, setFilters] = useState({
    college: '',
    course: '',
    branch: '',
    batch: ''
  });
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(false);
  const [quickFilterOptions, setQuickFilterOptions] = useState({
    batches: [],
    courses: [],
    branches: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [students, setStudents] = useState([]);
  const [sectionOptions, setSectionOptions] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [draftSections, setDraftSections] = useState({});
  const [savedSections, setSavedSections] = useState({});
  const [selectedStudentKeys, setSelectedStudentKeys] = useState(new Set());
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [bulkAssignSection, setBulkAssignSection] = useState('');

  const scrollContainerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);

  const filtersReady = Boolean(
    filters.college && filters.course && filters.branch && filters.batch
  );

  const branchHasSections = useMemo(() => {
    return getBranchSectionConfig(coursesWithLevels, filters.course, filters.branch).enabled;
  }, [coursesWithLevels, filters.course, filters.branch]);

  const availableBranches = useMemo(() => {
    if (!filters.course) return [];
    return (quickFilterOptions.branches || []).filter((branchName) =>
      getBranchSectionConfig(coursesWithLevels, filters.course, branchName).enabled
    );
  }, [quickFilterOptions.branches, filters.course, coursesWithLevels]);

  const configuredSectionItems = useMemo(() => {
    if (sectionOptions.length > 0) return sectionOptions;
    return getBranchSectionConfig(coursesWithLevels, filters.course, filters.branch).items;
  }, [sectionOptions, coursesWithLevels, filters.course, filters.branch]);

  const unsavedCount = useMemo(() => {
    return students.filter((student) => {
      const key = getStudentKey(student);
      const draft = normalizeSectionValue(draftSections[key]);
      const saved = normalizeSectionValue(savedSections[key]);
      return draft !== saved;
    }).length;
  }, [students, draftSections, savedSections]);

  const selectedCount = selectedStudentKeys.size;

  const isAllLoadedSelected = useMemo(() => {
    if (students.length === 0) return false;
    return students.every((student) => selectedStudentKeys.has(getStudentKey(student)));
  }, [students, selectedStudentKeys]);

  const applyRowsToSectionState = useCallback((rows, reset = false) => {
    setSavedSections((prev) => {
      const next = reset ? {} : { ...prev };
      rows.forEach((student) => {
        const key = getStudentKey(student);
        if (reset || next[key] === undefined) {
          next[key] = normalizeSectionValue(student.section);
        }
      });
      return next;
    });
    setDraftSections((prev) => {
      const next = reset ? {} : { ...prev };
      rows.forEach((student) => {
        const key = getStudentKey(student);
        if (reset || next[key] === undefined) {
          next[key] = normalizeSectionValue(student.section);
        }
      });
      return next;
    });
  }, []);

  const fetchColleges = useCallback(async () => {
    setCollegesLoading(true);
    try {
      const response = await api.get('/colleges');
      if (response.data?.success) {
        setColleges(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch colleges:', error);
      toast.error('Failed to load colleges');
    } finally {
      setCollegesLoading(false);
    }
  }, []);

  const fetchCoursesWithLevels = useCallback(async () => {
    try {
      const response = await api.get('/courses?includeInactive=false');
      if (response.data?.success) {
        setCoursesWithLevels(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  }, []);

  const fetchQuickFilterOptions = useCallback(async (currentFilters = {}) => {
    setLoadingFilters(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.college) params.append('college', currentFilters.college);
      if (currentFilters.course) params.append('course', currentFilters.course);
      if (currentFilters.batch) params.append('batch', currentFilters.batch);

      const queryString = params.toString();
      const url = `/students/quick-filters${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      if (response.data?.success) {
        const data = response.data.data || {};
        setQuickFilterOptions((prev) => ({
          batches: currentFilters.batch ? prev.batches : (data.batches || []),
          courses: currentFilters.course ? prev.courses : (data.courses || []),
          branches: data.branches || []
        }));
      }
    } catch (error) {
      console.warn('Failed to load filter metadata:', error);
    } finally {
      setLoadingFilters(false);
    }
  }, []);

  const resetStudentList = useCallback(() => {
    setStudents([]);
    setDraftSections({});
    setSavedSections({});
    setSelectedStudentKeys(new Set());
    setTotalStudents(0);
    setHasMore(false);
    setNextOffset(0);
  }, []);

  const loadStudents = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (!filtersReady || !branchHasSections) {
      resetStudentList();
      return;
    }

    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoadingInitial(true);
    }

    try {
      const params = new URLSearchParams({
        college: filters.college,
        course: filters.course,
        branch: filters.branch,
        batch: filters.batch,
        limit: String(CHUNK_SIZE),
        offset: String(offset)
      });

      const response = await api.get(`/students/section-partition?${params.toString()}`);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to load students');
      }

      const data = response.data.data || {};
      const rows = data.students || [];
      const pagination = data.pagination || {};

      setSectionOptions(data.sections || []);
      setTotalStudents(pagination.total || 0);
      setHasMore(Boolean(pagination.hasMore));
      setNextOffset(offset + rows.length);

      if (append) {
        setStudents((prev) => {
          const existing = new Set(prev.map((s) => s.admissionNumber || s.id));
          return [...prev, ...rows.filter((s) => !existing.has(s.admissionNumber || s.id))];
        });
        applyRowsToSectionState(rows, false);
      } else {
        setStudents(rows);
        applyRowsToSectionState(rows, true);
      }
    } catch (error) {
      console.error('Failed to fetch section partition students:', error);
      toast.error(error.response?.data?.message || 'Failed to load students');
      if (!append) {
        resetStudentList();
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else {
        setLoadingInitial(false);
      }
    }
  }, [filters, filtersReady, branchHasSections, resetStudentList, applyRowsToSectionState]);

  useEffect(() => {
    fetchColleges();
    fetchCoursesWithLevels();
  }, [fetchColleges, fetchCoursesWithLevels]);

  useEffect(() => {
    fetchQuickFilterOptions(filters);
  }, [filters.college, filters.course, filters.batch, fetchQuickFilterOptions]);

  useEffect(() => {
    if (!filtersReady || !branchHasSections) {
      resetStudentList();
      return;
    }
    loadStudents({ offset: 0, append: false });
  }, [filtersReady, branchHasSections, filters.college, filters.course, filters.branch, filters.batch]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || !hasMore || loadingInitial || loadingMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMoreRef.current && !loadingInitial) {
          loadStudents({ offset: nextOffset, append: true });
        }
      },
      { root, rootMargin: '120px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingInitial, loadingMore, nextOffset, loadStudents]);

  const handleFilterChange = (key, value) => {
    setSelectedStudentKeys(new Set());
    setFilters((prev) => {
      const next = { ...prev, [key]: value || '' };
      if (key === 'college') {
        next.course = '';
        next.branch = '';
        next.batch = '';
      } else if (key === 'course') {
        next.branch = '';
        next.batch = '';
      } else if (key === 'branch') {
        next.batch = '';
      }
      return next;
    });
  };

  const handleSectionDraftChange = (studentKey, sectionValue) => {
    if (!canEditSection) {
      toast.error('You do not have permission to update sections');
      return;
    }
    setDraftSections((prev) => ({
      ...prev,
      [studentKey]: normalizeSectionValue(sectionValue)
    }));
  };

  const toggleStudentSelection = (studentKey) => {
    setSelectedStudentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(studentKey)) {
        next.delete(studentKey);
      } else {
        next.add(studentKey);
      }
      return next;
    });
  };

  const toggleSelectAllLoaded = (checked) => {
    if (!checked) {
      setSelectedStudentKeys(new Set());
      return;
    }
    setSelectedStudentKeys(new Set(students.map((student) => getStudentKey(student))));
  };

  const applyBulkSectionToSelected = (sectionValue) => {
    if (!canEditSection) {
      toast.error('You do not have permission to update sections');
      return;
    }
    if (selectedStudentKeys.size === 0) {
      toast.error('Select at least one student');
      return;
    }

    const normalized = normalizeSectionValue(sectionValue);
    setDraftSections((prev) => {
      const next = { ...prev };
      selectedStudentKeys.forEach((key) => {
        next[key] = normalized;
      });
      return next;
    });

    const label = normalized || 'None';
    toast.success(`Assigned section ${label} to ${selectedStudentKeys.size} student(s)`);
    setBulkAssignModalOpen(false);
    setBulkAssignSection('');
  };

  const openBulkAssignModal = () => {
    if (selectedStudentKeys.size === 0) {
      toast.error('Select at least one student');
      return;
    }
    setBulkAssignSection('');
    setBulkAssignModalOpen(true);
  };

  const handleBulkAssignConfirm = () => {
    applyBulkSectionToSelected(bulkAssignSection);
  };

  const handleSave = async () => {
    if (!canEditSection) {
      toast.error('You do not have permission to save sections');
      return;
    }

    const assignments = students
      .filter((student) => {
        const key = getStudentKey(student);
        const draft = normalizeSectionValue(draftSections[key]);
        const saved = normalizeSectionValue(savedSections[key]);
        return draft !== saved;
      })
      .map((student) => ({
        admissionNumber: student.admissionNumber,
        section: normalizeSectionValue(draftSections[getStudentKey(student)])
      }));

    if (assignments.length === 0) {
      toast.error('No section changes to save');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('/students/section-partition/save', { assignments });
      if (response.data?.success || response.data?.data?.success > 0) {
        const updatedSaved = { ...savedSections };
        assignments.forEach(({ admissionNumber, section }) => {
          updatedSaved[admissionNumber] = section;
          const match = students.find((s) => s.admissionNumber === admissionNumber);
          if (match) {
            updatedSaved[getStudentKey(match)] = section;
          }
        });
        setSavedSections(updatedSaved);
        setStudents((prev) =>
          prev.map((student) => {
            const change = assignments.find((a) => a.admissionNumber === student.admissionNumber);
            if (!change) return student;
            return {
              ...student,
              section: change.section || null
            };
          })
        );
        toast.success(response.data?.message || `Saved ${assignments.length} section assignment(s)`);
      } else {
        throw new Error(response.data?.message || 'Failed to save sections');
      }
    } catch (error) {
      console.error('Failed to save sections:', error);
      toast.error(error.response?.data?.message || 'Failed to save section assignments');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFilters({ college: '', course: '', branch: '', batch: '' });
    resetStudentList();
  };

  const handleRefresh = () => {
    if (!filtersReady || !branchHasSections) return;
    loadStudents({ offset: 0, append: false });
  };

  const tableHeadCellClass =
    'sticky top-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide shadow-[0_1px_0_0_rgb(229,231,235)]';

  if (!canViewSectionPartition) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden gap-3 p-4 lg:p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <LayoutGrid size={20} />
              <span className="text-xs font-bold uppercase tracking-widest">Students</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Section Partition</h1>
            <p className="text-sm text-gray-600 mt-1">
              Regular students in the selected batch are listed by PIN order. Assign sections and click Save.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!filtersReady || loadingInitial}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw size={16} className={loadingInitial ? 'animate-spin' : ''} />
              Refresh
            </button>
            {canEditSection && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!filtersReady || saving || unsavedCount === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save{unsavedCount > 0 ? ` (${unsavedCount})` : ''}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              College
            </label>
            <select
              value={filters.college}
              onChange={(e) => handleFilterChange('college', e.target.value)}
              disabled={collegesLoading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select College</option>
              {colleges.filter((c) => c.isActive !== false).map((college) => (
                <option key={college.id} value={college.name}>{college.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Course
            </label>
            <select
              value={filters.course}
              onChange={(e) => handleFilterChange('course', e.target.value)}
              disabled={!filters.college || loadingFilters}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">Select Course</option>
              {quickFilterOptions.courses.map((course) => (
                <option key={course} value={course.id || course}>{course.name || course}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Branch
            </label>
            <select
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              disabled={!filters.course || loadingFilters}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">Select Branch</option>
              {availableBranches.map((branch) => (
                <option key={branch} value={branch.id || branch}>{branch.name || branch}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Batch
            </label>
            <select
              value={filters.batch}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
              disabled={!filters.branch || loadingFilters}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">Select Batch</option>
              {quickFilterOptions.batches.map((batch) => (
                <option key={batch} value={batch.id || batch}>{batch.name || batch}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter size={16} />
            <span>Select college, course, branch, and batch to load all students in PIN order.</span>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm"
          >
            Clear Filters
          </button>
        </div>

        {filters.branch && !branchHasSections && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>
              Section breakdown is not enabled for the selected branch. Enable it in Course Settings first.
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Students</h2>
            <p className="text-sm text-gray-600">
              Only Regular students are shown in PIN order. Assign sections using the table dropdown or Bulk Assign, then click Save.
            </p>
          </div>
          {filtersReady && branchHasSections && (
            <div className="text-sm text-gray-700 font-medium">
              <span className="text-indigo-600">{students.length.toLocaleString()}</span>
              {' of '}
              <span className="text-gray-900">{totalStudents.toLocaleString()}</span>
              {' student'}
              {totalStudents === 1 ? '' : 's'}
              {unsavedCount > 0 && (
                <span className="ml-2 text-amber-600">({unsavedCount} unsaved)</span>
              )}
            </div>
          )}
        </div>

        {!filtersReady ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
            Select all filters above to view students eligible for section partition.
          </div>
        ) : !branchHasSections ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
            This branch does not support section partition.
          </div>
        ) : loadingInitial && students.length === 0 ? (
          <SkeletonTable rows={10} cols={7} />
        ) : students.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
            No students found for the selected filters.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
            {canEditSection && selectedCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50 shrink-0">
                <div className="text-sm text-indigo-900">
                  <span className="font-semibold">{selectedCount}</span>
                  {' student'}
                  {selectedCount === 1 ? '' : 's'}
                  {' selected'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentKeys(new Set())}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={openBulkAssignModal}
                    className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Users size={16} />
                    Bulk Assign
                  </button>
                </div>
              </div>
            )}

            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-auto border border-gray-100 rounded-lg max-h-[calc(100dvh-26rem)] sm:max-h-[calc(100dvh-24rem)] lg:max-h-[calc(100dvh-22rem)]"
            >
              <table className="min-w-full border-separate border-spacing-0 divide-y divide-gray-200 text-sm">
                <thead>
                  <tr>
                    {canEditSection && (
                      <th className={`${tableHeadCellClass} px-3 w-10 z-20`}>
                        <input
                          type="checkbox"
                          checked={isAllLoadedSelected}
                          onChange={(e) => toggleSelectAllLoaded(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          title="Select all loaded students"
                        />
                      </th>
                    )}
                    <th className={`${tableHeadCellClass} w-12`}>
                      #
                    </th>
                    <th className={tableHeadCellClass}>
                      Batch
                    </th>
                    <th className={tableHeadCellClass}>
                      PIN Number
                    </th>
                    <th className={tableHeadCellClass}>
                      Student Name
                    </th>
                    <th className={tableHeadCellClass}>
                      Course
                    </th>
                    <th className={tableHeadCellClass}>
                      Branch
                    </th>
                    <th className={tableHeadCellClass}>
                      Section
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student, index) => {
                    const studentKey = getStudentKey(student);
                    const draftValue = normalizeSectionValue(draftSections[studentKey]);
                    const savedValue = normalizeSectionValue(savedSections[studentKey]);
                    const isDirty = draftValue !== savedValue;
                    const isSelected = selectedStudentKeys.has(studentKey);

                    return (
                      <tr
                        key={studentKey}
                        onClick={() => {
                          if (canEditSection) {
                            toggleStudentSelection(studentKey);
                          }
                        }}
                        className={`hover:bg-gray-50 ${isDirty ? 'bg-amber-50/50' : ''} ${isSelected ? 'bg-indigo-50/40' : ''} ${canEditSection ? 'cursor-pointer' : ''}`}
                      >
                        {canEditSection && (
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStudentSelection(studentKey)}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                              aria-label={`Select ${student.studentName || student.pinNo || 'student'}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-500 text-xs">{index + 1}</td>
                        <td className="px-4 py-3 text-gray-900">{student.batch || '-'}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{student.pinNo || '-'}</td>
                        <td className="px-4 py-3 text-gray-900">{student.studentName || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{student.course || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{student.branch || '-'}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={draftValue}
                            onChange={(e) =>
                              handleSectionDraftChange(studentKey, e.target.value)
                            }
                            disabled={!canEditSection || saving}
                            className={`w-full min-w-[140px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500 ${
                              isDirty ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                            }`}
                          >
                            <option value="">—</option>
                            {configuredSectionItems.map((section) => (
                              <option key={section} value={section.id || section}>{section.name || section}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div ref={loadMoreRef} className="py-4 flex justify-center">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 size={18} className="animate-spin text-indigo-600" />
                    Loading more students...
                  </div>
                )}
                {!loadingMore && hasMore && (
                  <span className="text-xs text-gray-400">Scroll for more</span>
                )}
                {!hasMore && students.length > 0 && (
                  <span className="text-xs text-gray-500">
                    All {totalStudents.toLocaleString()} students loaded
                  </span>
                )}
              </div>
            </div>

            {canEditSection && (
              <div className="flex justify-end pt-4 mt-2 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || unsavedCount === 0}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Section Assignments{unsavedCount > 0 ? ` (${unsavedCount})` : ''}
                </button>
              </div>
            )}

            {bulkAssignModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                <div
                  className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="bulk-assign-title"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div>
                      <h3 id="bulk-assign-title" className="text-lg font-semibold text-gray-900">
                        Bulk Assign Section
                      </h3>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {selectedCount} student{selectedCount === 1 ? '' : 's'} selected
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBulkAssignModalOpen(false)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Select Section
                      </label>
                      <select
                        value={bulkAssignSection}
                        onChange={(e) => setBulkAssignSection(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        autoFocus
                      >
                        <option value="">None (clear section)</option>
                        {configuredSectionItems.map((section) => (
                          <option key={section} value={section.id || section}>{section.name || section}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-500">
                      This updates the draft for selected students. Click Save on the page to store in the database.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                    <button
                      type="button"
                      onClick={() => setBulkAssignModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkAssignConfirm}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Apply to selected
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionPartition;

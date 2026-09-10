import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertCircle, CheckCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from './LoadingAnimation';
import { useStudents } from '../hooks/useStudents';

const PAGE_SIZE = 50;

const extractName = (student) => {
  if (student?.student_name && String(student.student_name).trim()) {
    return student.student_name;
  }
  const data = student?.student_data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '-';
  const nameField = Object.keys(data).find((key) =>
    key.toLowerCase().includes('name') && !key.toLowerCase().includes('father') && !key.toLowerCase().includes('mother')
  );
  return nameField && data[nameField] ? data[nameField] : '-';
};

const ManualRollNumberModal = ({
  isOpen,
  onClose,
  onUpdateComplete,
  initialFilters = {},
  colleges: collegesProp = [],
  coursesWithLevels = [],
}) => {
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rollNumbers, setRollNumbers] = useState({});
  const [showOnlyPending, setShowOnlyPending] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const [pinFilters, setPinFilters] = useState({
    college: '',
    course: '',
    branch: '',
  });
  const [localColleges, setLocalColleges] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, showOnlyPending, pinFilters.college, pinFilters.course, pinFilters.branch]);

  // Seed filters from the Students page when the modal opens
  useEffect(() => {
    if (!isOpen) return;

    setPinFilters({
      college: initialFilters.college || '',
      course: initialFilters.course || '',
      branch: initialFilters.branch || '',
    });
    setSearchTerm('');
    setDebouncedSearch('');
    setShowOnlyPending(true);
    setCurrentPage(1);
    setRollNumbers({});

    // Fallback colleges fetch if parent hasn't loaded them yet
    if (!collegesProp?.length) {
      api.get('/colleges')
        .then((res) => {
          const list = res.data?.data || res.data || [];
          setLocalColleges(Array.isArray(list) ? list : []);
        })
        .catch(() => setLocalColleges([]));
    }
  }, [isOpen, initialFilters.college, initialFilters.course, initialFilters.branch, collegesProp?.length]);

  const colleges = collegesProp?.length ? collegesProp : localColleges;

  const selectedCollege = useMemo(
    () => colleges.find((c) => c.name === pinFilters.college) || null,
    [colleges, pinFilters.college]
  );

  // Same college → course filtering used on the Students edit sidebar
  const courseOptions = useMemo(() => {
    const active = (coursesWithLevels || []).filter((c) => c.isActive !== false);
    if (!selectedCollege) return active;
    return active.filter((c) => {
      const cid = c.collegeId ?? c.college_id;
      return !cid || Number(cid) === Number(selectedCollege.id);
    });
  }, [coursesWithLevels, selectedCollege]);

  const branchOptions = useMemo(() => {
    if (pinFilters.course) {
      const courseObj = courseOptions.find((c) => c.name === pinFilters.course)
        || (coursesWithLevels || []).find((c) => c.name === pinFilters.course);
      return (courseObj?.branches || []).filter((b) => b.isActive !== false);
    }
    // No course selected: show all branches for visible courses
    const names = new Set();
    const branches = [];
    courseOptions.forEach((course) => {
      (course.branches || []).forEach((branch) => {
        if (branch.isActive === false) return;
        const name = branch.name || branch;
        if (!names.has(name)) {
          names.add(name);
          branches.push(typeof branch === 'string' ? { name: branch } : branch);
        }
      });
    });
    return branches;
  }, [pinFilters.course, courseOptions, coursesWithLevels]);

  const handlePinFilterChange = (field, value) => {
    setPinFilters((prev) => {
      const next = {
        ...prev,
        [field]: value || '',
      };
      if (field === 'college') {
        next.course = '';
        next.branch = '';
      } else if (field === 'course') {
        next.branch = '';
      }
      return next;
    });
  };

  const filters = useMemo(() => {
    const next = {};
    if (showOnlyPending) next.pinNumberStatus = 'unassigned';
    if (pinFilters.college) next.college = pinFilters.college;
    if (pinFilters.course) next.course = pinFilters.course;
    if (pinFilters.branch) next.branch = pinFilters.branch;
    return next;
  }, [showOnlyPending, pinFilters]);

  const {
    data: studentsData,
    isLoading: loadingStudents,
    isFetching,
    isError,
    error,
    refetch,
  } = useStudents({
    page: currentPage,
    pageSize: PAGE_SIZE,
    filters,
    search: debouncedSearch,
    lite: true,
    enabled: isOpen,
  });

  const students = studentsData?.students || [];
  const totalStudents = studentsData?.pagination?.total || 0;
  const totalPages = Math.max(1, studentsData?.pagination?.totalPages || 1);

  useEffect(() => {
    if (!isOpen || students.length === 0) return;
    setRollNumbers((prev) => {
      const next = { ...prev };
      students.forEach((student) => {
        if (next[student.admission_number] === undefined) {
          next[student.admission_number] = student.pin_no || '';
        }
      });
      return next;
    });
  }, [isOpen, students]);

  const handleRollNumberChange = (admissionNumber, value) => {
    setRollNumbers((prev) => ({
      ...prev,
      [admissionNumber]: value,
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true);

    try {
      const updates = students
        .map((student) => {
          const newPinNumber = rollNumbers[student.admission_number]?.trim();
          const oldPinNumber = (student.pin_no || '').trim();
          if (newPinNumber && newPinNumber !== oldPinNumber) {
            return {
              admission_number: student.admission_number,
              pin_no: newPinNumber,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (updates.length === 0) {
        toast.error('No changes to save on this page');
        setSaving(false);
        return;
      }

      let successCount = 0;
      let failedCount = 0;
      const errors = [];
      const BATCH_SIZE = 10;

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((update) =>
            api.put(`/students/${update.admission_number}/pin-number`, {
              pinNumber: update.pin_no,
            })
          )
        );

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failedCount++;
            errors.push({
              admission: batch[idx].admission_number,
              message: result.reason?.response?.data?.message || 'Update failed',
            });
          }
        });
      }

      if (successCount > 0) {
        toast.success(`Successfully updated ${successCount} PIN number(s)`);
        setRollNumbers((prev) => {
          const next = { ...prev };
          updates.forEach((u) => {
            if (!errors.some((e) => e.admission === u.admission_number)) {
              delete next[u.admission_number];
            }
          });
          return next;
        });
        if (onUpdateComplete) onUpdateComplete();
        await refetch();
      }

      if (failedCount > 0) {
        toast.error(`Failed to update ${failedCount} PIN number(s)`);
        console.error('Update errors:', errors);
      }
    } catch (err) {
      toast.error('Failed to save PIN numbers');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setShowOnlyPending(true);
    setCurrentPage(1);
    setRollNumbers({});
    setPinFilters({ college: '', course: '', branch: '' });
    onClose();
  };

  if (!isOpen) return null;

  const showLoading = loadingStudents && students.length === 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Update PIN Numbers</h3>
            <p className="text-sm text-gray-600 mt-1">
              Filter by college / program / branch, then assign PIN numbers page by page
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            type="button"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                College
              </label>
              <select
                value={pinFilters.college}
                onChange={(e) => handlePinFilterChange('college', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">All Colleges</option>
                {colleges
                  .filter((c) => c.isActive !== false)
                  .map((college) => (
                    <option key={college.id || college.name} value={college.name}>
                      {college.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Program (Course)
              </label>
              <select
                value={pinFilters.course}
                onChange={(e) => handlePinFilterChange('course', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">All Programs</option>
                {courseOptions.map((course) => (
                  <option key={course.id || course.name} value={course.name}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Branch
              </label>
              <select
                value={pinFilters.branch}
                onChange={(e) => handlePinFilterChange('branch', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">All Branches</option>
                {branchOptions.map((branch) => {
                  const name = branch.name || branch;
                  return (
                    <option key={branch.id || name} value={name}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by admission number, name, or PIN..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={showOnlyPending}
                onChange={(e) => setShowOnlyPending(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">Show only pending</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600">
            <div>
              Showing <strong>{students.length}</strong> of <strong>{totalStudents}</strong> student(s)
              {showOnlyPending && (
                <span className="ml-2 text-orange-600">(without PIN numbers)</span>
              )}
              {isFetching && !showLoading && (
                <span className="ml-2 text-gray-400">Refreshing…</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loadingStudents}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-medium text-gray-700">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loadingStudents}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showLoading ? (
            <div className="flex items-center justify-center h-64">
              <LoadingAnimation size="lg" message="Loading students..." />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-500">
              <AlertCircle size={48} className="mb-4" />
              <p className="text-lg font-medium">Failed to load students</p>
              <p className="text-sm text-gray-500 mb-4">
                {error?.response?.data?.message || error?.message || 'Please try again'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Retry
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertCircle size={48} className="mb-4" />
              <p className="text-lg font-medium">No students found</p>
              <p className="text-sm text-center max-w-md">
                Try adjusting college / program / branch filters
                {showOnlyPending ? ', clearing search, or unchecking "Show only pending"' : ' or search'}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {students.map((student) => (
                <div
                  key={student.admission_number}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
                >
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Admission Number
                      </label>
                      <p className="text-sm font-semibold text-gray-900">
                        {student.admission_number}
                      </p>
                      {(student.course || student.branch) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {[student.course, student.branch].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Student Name
                      </label>
                      <p className="text-sm text-gray-900">{extractName(student)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        PIN Number *
                      </label>
                      <input
                        type="text"
                        value={rollNumbers[student.admission_number] ?? ''}
                        onChange={(e) =>
                          handleRollNumberChange(student.admission_number, e.target.value)
                        }
                        placeholder="Enter PIN number"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  {student.pin_no ? (
                    <div className="flex items-center gap-1 text-green-600 shrink-0">
                      <CheckCircle size={16} />
                      <span className="text-xs font-medium">Assigned</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAll}
              disabled={saving || showLoading || students.length === 0}
              type="button"
              className="flex-1 bg-gradient-to-r from-gray-800 via-gray-900 to-black text-white px-8 py-3 rounded-xl font-semibold
             hover:from-gray-900 hover:via-black hover:to-gray-800 focus:ring-4 focus:ring-gray-500/40
             transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed
             flex items-center justify-center gap-2 shadow-md hover:shadow-2xl transform hover:scale-105 active:scale-95"
            >
              {saving ? (
                <>
                  <LoadingAnimation width={20} height={20} variant="inline" showMessage={false} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Save Changes on This Page
                </>
              )}
            </button>

            <button
              onClick={handleClose}
              disabled={saving}
              type="button"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualRollNumberModal;

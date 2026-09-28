import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertCircle, CheckCircle, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from './LoadingAnimation';
import { useStudents } from '../hooks/useStudents';
import { fetchQuickFilterOptions } from '../utils/filterUtils';

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
    batch: '',
    course: '',
    branch: '',
  });
  const [localColleges, setLocalColleges] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, showOnlyPending, pinFilters.college, pinFilters.batch, pinFilters.course, pinFilters.branch]);

  // Seed filters from the Students page when the modal opens
  useEffect(() => {
    if (!isOpen) return;

    setPinFilters({
      college: initialFilters.college || '',
      batch: initialFilters.batch || '',
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
  }, [isOpen, initialFilters.college, initialFilters.batch, initialFilters.course, initialFilters.branch, collegesProp?.length]);

  // Fetch actual student database batches whenever modal opens or parent filters change
  useEffect(() => {
    if (!isOpen) return;

    fetchQuickFilterOptions(pinFilters)
      .then((opts) => {
        if (opts && Array.isArray(opts.batches)) {
          const list = opts.batches
            .map((b) => (typeof b === 'string' ? b : b?.batch || b?.name))
            .filter(Boolean);
          setAvailableBatches(list);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch student database batches for modal:', err);
        setAvailableBatches([]);
      });
  }, [isOpen, pinFilters.college, pinFilters.course, pinFilters.branch]);

  const colleges = collegesProp?.length ? collegesProp : localColleges;

  const batchOptions = useMemo(() => {
    return Array.from(new Set(availableBatches))
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)));
  }, [availableBatches]);

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
    if (pinFilters.batch) next.batch = pinFilters.batch;
    if (pinFilters.course) next.course = pinFilters.course;
    if (pinFilters.branch) next.branch = pinFilters.branch;
    return next;
  }, [showOnlyPending, pinFilters]);

  const hasAllFourFilters = Boolean(
    pinFilters.college &&
    pinFilters.batch &&
    pinFilters.course &&
    pinFilters.branch
  );

  const {
    data: studentsData,
    isLoading: loadingStudents,
    isFetching,
    isError,
    error,
    refetch,
  } = useStudents({
    page: hasAllFourFilters ? 1 : currentPage,
    pageSize: hasAllFourFilters ? 'all' : PAGE_SIZE,
    filters,
    search: debouncedSearch,
    lite: true,
    enabled: isOpen,
  });

  const students = studentsData?.students || [];
  const totalStudents = studentsData?.pagination?.total || 0;
  const totalPages = Math.max(1, studentsData?.pagination?.totalPages || 1);

  const [sortField, setSortField] = useState('admission_number');
  const [sortOrder, setSortOrder] = useState('asc');

  const sortedStudents = useMemo(() => {
    const list = [...students];
    return list.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (sortField === 'admission_number') {
        aVal = String(a.admission_number || '');
        bVal = String(b.admission_number || '');
      } else if (sortField === 'name') {
        aVal = String(extractName(a) || '');
        bVal = String(extractName(b) || '');
      } else if (sortField === 'pin_no') {
        aVal = String(rollNumbers[a.admission_number] ?? a.pin_no ?? '');
        bVal = String(rollNumbers[b.admission_number] ?? b.pin_no ?? '');
      } else if (sortField === 'status') {
        aVal = a.pin_no ? '1_assigned' : '0_pending';
        bVal = b.pin_no ? '1_assigned' : '0_pending';
      }

      const aNum = Number(aVal);
      const bNum = Number(bVal);
      let cmp = 0;
      if (!isNaN(aNum) && !isNaN(bNum) && String(aNum) === aVal.trim() && String(bNum) === bVal.trim()) {
        cmp = aNum - bNum;
      } else {
        cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [students, sortField, sortOrder, rollNumbers]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown size={13} className="text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} className="text-primary-600 font-bold" />
    ) : (
      <ArrowDown size={13} className="text-primary-600 font-bold" />
    );
  };

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
    setPinFilters({ college: '', batch: '', course: '', branch: '' });
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
              Filter by college / batch / program / branch, then assign PIN numbers page by page
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                Batch
              </label>
              <select
                value={pinFilters.batch}
                onChange={(e) => handlePinFilterChange('batch', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">All Batches</option>
                {batchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
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

          <div className="flex gap-3 flex-wrap items-center">
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
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-300">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sort:</span>
              <select
                value={`${sortField}-${sortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split('-');
                  setSortField(f);
                  setSortOrder(o);
                }}
                className="text-xs font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
              >
                <option value="admission_number-asc">Admission No (Ascending 0-9)</option>
                <option value="admission_number-desc">Admission No (Descending 9-0)</option>
                <option value="name-asc">Student Name (A to Z)</option>
                <option value="name-desc">Student Name (Z to A)</option>
                <option value="pin_no-asc">PIN Number (Ascending)</option>
                <option value="pin_no-desc">PIN Number (Descending)</option>
                <option value="status-asc">Status (Pending First)</option>
                <option value="status-desc">Status (Assigned First)</option>
              </select>
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
              {hasAllFourFilters ? (
                <>Showing all <strong>{sortedStudents.length}</strong> student(s)</>
              ) : (
                <>Showing <strong>{sortedStudents.length}</strong> of <strong>{totalStudents}</strong> student(s)</>
              )}
              {showOnlyPending && (
                <span className="ml-2 text-orange-600">(without PIN numbers)</span>
              )}
              {isFetching && !showLoading && (
                <span className="ml-2 text-gray-400">Refreshing…</span>
              )}
            </div>
            {!hasAllFourFilters && totalPages > 1 && (
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
            )}
            {hasAllFourFilters && (
              <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                All Students Displayed
              </span>
            )}
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
          ) : sortedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertCircle size={48} className="mb-4" />
              <p className="text-lg font-medium">No students found</p>
              <p className="text-sm text-center max-w-md">
                Try adjusting college / batch / program / branch filters
                {showOnlyPending ? ', clearing search, or unchecking "Show only pending"' : ' or search'}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 z-10 select-none">
                    <th
                      onClick={() => handleSort('admission_number')}
                      className="py-3 px-4 text-center w-14 bg-gray-100 cursor-pointer hover:bg-gray-200/80 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>S.No</span>
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('admission_number')}
                      className="py-3 px-4 bg-gray-100 cursor-pointer hover:bg-gray-200/80 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Admission No</span>
                        {renderSortIcon('admission_number')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('name')}
                      className="py-3 px-4 bg-gray-100 cursor-pointer hover:bg-gray-200/80 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Student Name</span>
                        {renderSortIcon('name')}
                      </div>
                    </th>
                    <th className="py-3 px-4 bg-gray-100">Program / Branch</th>
                    <th
                      onClick={() => handleSort('pin_no')}
                      className="py-3 px-4 bg-gray-100 min-w-[200px] cursor-pointer hover:bg-gray-200/80 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>PIN Number *</span>
                        {renderSortIcon('pin_no')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('status')}
                      className="py-3 px-4 text-center w-28 bg-gray-100 cursor-pointer hover:bg-gray-200/80 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Status</span>
                        {renderSortIcon('status')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white text-sm">
                  {sortedStudents.map((student, idx) => {
                    const serialNumber = hasAllFourFilters
                      ? idx + 1
                      : (currentPage - 1) * PAGE_SIZE + idx + 1;
                    const isAssigned = Boolean(student.pin_no);
                    const draftVal = rollNumbers[student.admission_number];
                    const isEdited = draftVal !== undefined && draftVal.trim() !== (student.pin_no || '').trim();

                    return (
                      <tr
                        key={student.admission_number}
                        className="hover:bg-gray-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 text-center text-xs font-medium text-gray-500">
                          {serialNumber}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900 whitespace-nowrap">
                          {student.admission_number}
                        </td>
                        <td className="py-3 px-4 text-gray-900 font-medium">
                          {extractName(student)}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-600">
                          {[student.course, student.branch].filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={rollNumbers[student.admission_number] ?? ''}
                            onChange={(e) =>
                              handleRollNumberChange(student.admission_number, e.target.value)
                            }
                            placeholder="Enter PIN number"
                            className={`w-full px-3 py-1.5 text-sm border rounded-lg outline-none font-mono transition-all ${
                              isEdited
                                ? 'border-primary-500 bg-primary-50/30 ring-2 ring-primary-500/20'
                                : 'border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'
                            }`}
                          />
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isAssigned ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              <CheckCircle size={13} /> Assigned
                            </span>
                          ) : isEdited ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                  {hasAllFourFilters ? 'Save All Changes' : 'Save Changes on This Page'}
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

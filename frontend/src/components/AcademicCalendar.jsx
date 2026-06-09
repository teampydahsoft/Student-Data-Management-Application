import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  GraduationCap,
  Landmark,
  Check,
  Save,
  Loader2,
  GitBranch,
  Settings2,
  Archive
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import LoadingAnimation from './LoadingAnimation';

const BRANCH_ALL = 'ALL';

const isSessionRangeLabel = (label) => /^\d{4}-\d{2,4}$/.test(String(label || '').trim());

const normalizeBatchValue = (value) => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const str = String(value).trim();
    if (!str || str === '[object Object]') return null;
    return str;
  }
  if (typeof value === 'object') {
    const candidate = value.name ?? value.yearLabel ?? value.batch ?? value.label ?? value.value;
    if (candidate != null) return normalizeBatchValue(candidate);
  }
  return null;
};

const deriveAcademicYearLabel = (batch, yearOfStudy) => {
  const batchYear = parseInt(batch, 10);
  const year = parseInt(yearOfStudy, 10);
  if (!batchYear || !year || year < 1) return null;
  const startYear = batchYear + year - 1;
  return `${startYear}-${startYear + 1}`;
};

const getBatchLabel = (semester) => {
  if (semester.batchLabel) return String(semester.batchLabel);
  const label = (semester.academicYearLabel || '').trim().replace(/\s/g, '');
  const year = parseInt(semester.yearOfStudy, 10);
  if (!label || !year || year < 1) return null;
  let startYear = null;
  const rangeMatch = label.match(/^(\d{4})-(\d{2,4})$/);
  if (rangeMatch) {
    startYear = parseInt(rangeMatch[1], 10);
  } else {
    const singleYearMatch = label.match(/^(\d{4})$/);
    if (singleYearMatch) startYear = parseInt(singleYearMatch[1], 10);
  }
  if (startYear == null) return null;
  return String(startYear - year + 1);
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const toDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 disabled:cursor-not-allowed';

const AcademicCalendar = ({ colleges, courses, academicYears }) => {
  const [activeSubTab, setActiveSubTab] = useState('configure');
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentBatches, setStudentBatches] = useState([]);
  const [savingKey, setSavingKey] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(BRANCH_ALL);

  const [cascadeOptions, setCascadeOptions] = useState({
    colleges: [],
    courses: [],
    branches: []
  });
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [semesterDrafts, setSemesterDrafts] = useState({});

  const fetchSemesters = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/semesters');
      setSemesters(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch semesters', error);
      toast.error(error.response?.data?.message || 'Failed to fetch semesters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSemesters();
    api.get('/students/batches')
      .then((res) => setStudentBatches(res.data?.data || []))
      .catch(() => setStudentBatches([]));
  }, [fetchSemesters]);

  const allBatches = useMemo(() => {
    const batchSet = new Set();
    studentBatches.forEach((b) => {
      const label = normalizeBatchValue(b);
      if (label && !isSessionRangeLabel(label)) batchSet.add(label);
    });
    academicYears.filter((y) => y.isActive !== false).forEach((y) => {
      const label = normalizeBatchValue(y.yearLabel);
      if (label && !isSessionRangeLabel(label)) batchSet.add(label);
    });
    semesters.forEach((s) => {
      const b = getBatchLabel(s);
      if (b && !isSessionRangeLabel(b)) batchSet.add(b);
    });
    return Array.from(batchSet)
      .filter(Boolean)
      .sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return b.localeCompare(a);
      });
  }, [academicYears, studentBatches, semesters]);

  const savedSemesterRows = useMemo(() => {
    return semesters
      .filter((s) => s.startDate && s.endDate)
      .map((s) => ({
        ...s,
        batch: getBatchLabel(s),
        yearSemLabel: `${s.yearOfStudy}-${s.semesterNumber}`
      }))
      .sort((a, b) => {
        if (a.batch !== b.batch) return (b.batch || '').localeCompare(a.batch || '');
        if (a.collegeName !== b.collegeName) return (a.collegeName || '').localeCompare(b.collegeName || '');
        if (a.courseName !== b.courseName) return (a.courseName || '').localeCompare(b.courseName || '');
        if (a.yearOfStudy !== b.yearOfStudy) return a.yearOfStudy - b.yearOfStudy;
        return a.semesterNumber - b.semesterNumber;
      });
  }, [semesters]);

  const savedConfigurations = useMemo(() => {
    const map = new Map();
    savedSemesterRows.forEach((s) => {
      const key = `${s.batch}|${s.collegeId || ''}|${s.courseId}`;
      if (!map.has(key)) {
        map.set(key, {
          batch: s.batch,
          collegeId: s.collegeId,
          collegeName: s.collegeName || 'All Colleges',
          courseId: s.courseId,
          courseName: s.courseName,
          semesterCount: 0
        });
      }
      map.get(key).semesterCount += 1;
    });
    return Array.from(map.values());
  }, [savedSemesterRows]);

  useEffect(() => {
    if (!selectedBatch) {
      setCascadeOptions({ colleges: [], courses: [], branches: [] });
      return;
    }

    const loadCascade = async () => {
      setCascadeLoading(true);
      try {
        const collegeRes = await api.get('/students/quick-filters', {
          params: { batch: selectedBatch, applyExclusions: 'true' }
        });
        const collegeNames = collegeRes.data?.data?.colleges || [];

        let courseNames = [];
        if (selectedCollegeId) {
          const college = colleges.find((c) => c.id === parseInt(selectedCollegeId, 10));
          if (college?.name) {
            const courseRes = await api.get('/students/quick-filters', {
              params: { batch: selectedBatch, college: college.name, applyExclusions: 'true' }
            });
            courseNames = courseRes.data?.data?.courses || [];
          }
        }

        let branchNames = [];
        if (selectedCollegeId && selectedCourseId) {
          const college = colleges.find((c) => c.id === parseInt(selectedCollegeId, 10));
          const course = courses.find((c) => c.id === parseInt(selectedCourseId, 10));
          if (college?.name && course?.name) {
            const branchRes = await api.get('/students/quick-filters', {
              params: {
                batch: selectedBatch,
                college: college.name,
                course: course.name,
                applyExclusions: 'true'
              }
            });
            branchNames = branchRes.data?.data?.branches || [];
          }
        }

        setCascadeOptions({ colleges: collegeNames, courses: courseNames, branches: branchNames });
      } catch (error) {
        console.error('Failed to load cascade options', error);
        setCascadeOptions({ colleges: [], courses: [], branches: [] });
      } finally {
        setCascadeLoading(false);
      }
    };

    loadCascade();
  }, [selectedBatch, selectedCollegeId, selectedCourseId, colleges, courses]);

  const collegeDropdownOptions = useMemo(() => {
    return cascadeOptions.colleges
      .map((name) => colleges.find((c) => c.name === name && c.isActive !== false))
      .filter(Boolean);
  }, [cascadeOptions.colleges, colleges]);

  const courseDropdownOptions = useMemo(() => {
    if (!selectedCollegeId) return [];
    return cascadeOptions.courses
      .map((name) =>
        courses.find(
          (c) =>
            c.name === name &&
            c.collegeId === parseInt(selectedCollegeId, 10) &&
            c.isActive !== false
        )
      )
      .filter(Boolean);
  }, [cascadeOptions.courses, courses, selectedCollegeId]);

  const branchPillOptions = useMemo(() => {
    const pills = [{ value: BRANCH_ALL, label: 'All Branches' }];
    cascadeOptions.branches.forEach((name) => {
      pills.push({ value: name, label: name });
    });
    return pills;
  }, [cascadeOptions.branches]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === parseInt(selectedCourseId, 10)),
    [courses, selectedCourseId]
  );

  const getSemestersPerYear = useCallback((course, yearOfStudy) => {
    if (!course) return 2;
    if (course.yearSemesterConfig && Array.isArray(course.yearSemesterConfig) && yearOfStudy) {
      const yearConfig = course.yearSemesterConfig.find((y) => y.year === yearOfStudy);
      if (yearConfig?.semesters) return yearConfig.semesters;
    }
    return course.semestersPerYear || 2;
  }, []);

  const flatSemesterRows = useMemo(() => {
    if (!selectedCourse || !selectedBatch) return [];

    const collegeId = selectedCollegeId ? parseInt(selectedCollegeId, 10) : null;
    const years = Array.from({ length: selectedCourse.totalYears || 4 }, (_, i) => i + 1);
    const rows = [];

    years.forEach((yearOfStudy) => {
      const semesterCount = getSemestersPerYear(selectedCourse, yearOfStudy);
      Array.from({ length: semesterCount }, (_, i) => i + 1).forEach((semesterNumber) => {
        const existing = semesters.find((s) => {
          const batch = getBatchLabel(s);
          const collegeMatch = collegeId == null
            ? s.collegeId == null
            : s.collegeId === collegeId || s.collegeId == null;
          return (
            batch === selectedBatch &&
            s.courseId === selectedCourse.id &&
            collegeMatch &&
            s.yearOfStudy === yearOfStudy &&
            s.semesterNumber === semesterNumber
          );
        });
        const branchKey = selectedBranch === BRANCH_ALL ? 'ALL' : selectedBranch;
        const key = `${selectedBatch}|${selectedCollegeId}|${selectedCourse.id}|${branchKey}|${yearOfStudy}|${semesterNumber}`;
        const draft = semesterDrafts[key];
        rows.push({
          key,
          yearOfStudy,
          semesterNumber,
          label: `${yearOfStudy}-${semesterNumber}`,
          academicYearLabel: deriveAcademicYearLabel(selectedBatch, yearOfStudy),
          existing,
          startDate: draft?.startDate ?? toDateInput(existing?.startDate) ?? '',
          endDate: draft?.endDate ?? toDateInput(existing?.endDate) ?? '',
          isDirty: Boolean(draft)
        });
      });
    });

    return rows;
  }, [
    selectedCourse,
    selectedBatch,
    selectedCollegeId,
    selectedBranch,
    semesters,
    semesterDrafts,
    getSemestersPerYear
  ]);

  const resetConfigureSelections = () => {
    setSemesterDrafts({});
  };

  const handleBatchChange = (batch) => {
    setSelectedBatch(batch);
    setSelectedCollegeId('');
    setSelectedCourseId('');
    setSelectedBranch(BRANCH_ALL);
    resetConfigureSelections();
  };

  const handleCollegeChange = (collegeId) => {
    setSelectedCollegeId(collegeId);
    setSelectedCourseId('');
    setSelectedBranch(BRANCH_ALL);
    resetConfigureSelections();
  };

  const handleCourseChange = (courseId) => {
    setSelectedCourseId(courseId);
    setSelectedBranch(BRANCH_ALL);
    resetConfigureSelections();
  };

  const loadSavedIntoConfigure = (config) => {
    setActiveSubTab('configure');
    setSelectedBatch(config.batch);
    setSelectedCollegeId(config.collegeId ? String(config.collegeId) : '');
    setSelectedCourseId(String(config.courseId));
    setSelectedBranch(BRANCH_ALL);
    resetConfigureSelections();
  };

  const updateDraft = (key, field, value) => {
    setSemesterDrafts((prev) => {
      const current = prev[key] || {};
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  };

  const clearDraft = (key) => {
    setSemesterDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveSemesterRow = async (row, { silent = false } = {}) => {
    if (!row.startDate || !row.endDate) {
      if (!silent) toast.error(`Set start and end dates for ${row.label}`);
      return false;
    }
    if (new Date(row.startDate) >= new Date(row.endDate)) {
      if (!silent) toast.error('End date must be after start date');
      return false;
    }

    const payload = {
      collegeId: selectedCollegeId ? parseInt(selectedCollegeId, 10) : null,
      courseId: parseInt(selectedCourseId, 10),
      batch: selectedBatch,
      yearOfStudy: row.yearOfStudy,
      semesterNumber: row.semesterNumber,
      startDate: row.startDate,
      endDate: row.endDate,
      academicYearLabel: deriveAcademicYearLabel(selectedBatch, row.yearOfStudy)
    };

    try {
      setSavingKey(row.key);
      if (row.existing?.id) {
        await api.put(`/semesters/${row.existing.id}`, payload);
        if (!silent) toast.success(`Updated ${row.label}`);
      } else {
        await api.post('/semesters', payload);
        if (!silent) toast.success(`Saved ${row.label}`);
      }
      clearDraft(row.key);
      if (!silent) await fetchSemesters();
      return true;
    } catch (error) {
      console.error('Failed to save semester', error);
      if (!silent) toast.error(error.response?.data?.message || 'Failed to save semester');
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const saveAllDirty = async () => {
    const rowsToSave = flatSemesterRows.filter(
      (s) => s.isDirty || (!s.existing && s.startDate && s.endDate)
    );
    if (rowsToSave.length === 0) {
      toast.error('No semester dates to save');
      return;
    }
    setBulkSaving(true);
    let saved = 0;
    for (const row of rowsToSave) {
      const ok = await saveSemesterRow(row, { silent: true });
      if (ok) saved += 1;
    }
    await fetchSemesters();
    setBulkSaving(false);
    if (saved > 0) {
      toast.success(`Saved ${saved} semester(s)`);
    } else {
      toast.error('Failed to save semester dates');
    }
  };

  const handleDeleteSemester = async (semester) => {
    if (!window.confirm(`Delete semester ${semester.yearOfStudy}-${semester.semesterNumber} for Batch ${getBatchLabel(semester)}?`)) {
      return;
    }
    try {
      await api.delete(`/semesters/${semester.id}`);
      toast.success('Semester deleted');
      await fetchSemesters();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete semester');
    }
  };

  const canShowSemesterGrid = selectedBatch && selectedCollegeId && selectedCourseId;
  const branchLabel = selectedBranch === BRANCH_ALL ? 'All Branches' : selectedBranch;

  if (loading && semesters.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation width={32} height={32} message="Loading academic calendar..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Academic Calendar</h2>
        <p className="text-sm text-gray-600">
          Configure semester start and end dates. Attendance marking uses these dates.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('configure')}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeSubTab === 'configure'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings2 size={16} />
          Configure
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('saved')}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeSubTab === 'saved'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Archive size={16} />
          Saved
          {savedSemesterRows.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {savedSemesterRows.length}
            </span>
          )}
        </button>
      </div>

      {/* Configure tab */}
      {activeSubTab === 'configure' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Selection Filters
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Batch dropdown */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar size={14} className="text-gray-400" />
                  Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => handleBatchChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select batch</option>
                  {allBatches.map((batch) => (
                    <option key={batch} value={batch}>
                      Batch {batch}
                    </option>
                  ))}
                </select>
              </div>

              {/* College dropdown */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Landmark size={14} className="text-gray-400" />
                  College
                </label>
                <select
                  value={selectedCollegeId}
                  onChange={(e) => handleCollegeChange(e.target.value)}
                  disabled={!selectedBatch || cascadeLoading}
                  className={selectClass}
                >
                  <option value="">
                    {!selectedBatch ? 'Select batch first' : cascadeLoading ? 'Loading...' : 'Select college'}
                  </option>
                  {collegeDropdownOptions.map((college) => (
                    <option key={college.id} value={college.id}>
                      {college.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Course dropdown */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <GraduationCap size={14} className="text-gray-400" />
                  Program / Course
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  disabled={!selectedCollegeId || cascadeLoading}
                  className={selectClass}
                >
                  <option value="">
                    {!selectedCollegeId ? 'Select college first' : cascadeLoading ? 'Loading...' : 'Select program'}
                  </option>
                  {courseDropdownOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Branch: All or individual pills */}
            {selectedCourseId && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <GitBranch size={14} className="text-gray-400" />
                  Branch
                </label>
                <div className="flex flex-wrap gap-2">
                  {branchPillOptions.map((option) => {
                    const isSelected = selectedBranch === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedBranch(option.value)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Choose &quot;All Branches&quot; to apply dates for the entire program, or pick a specific branch.
                </p>
              </div>
            )}
          </div>

          {!canShowSemesterGrid ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">
                Select batch, college, and program to configure semester dates
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Semester Dates — Batch {selectedBatch} · {branchLabel}
                  </h3>
                  <p className="text-xs text-gray-500">
                    All years as Year-Sem (1-1, 1-2, 2-1, …). Set start and end dates for each.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveAllDirty}
                  disabled={bulkSaving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save All
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Year-Sem</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Session</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Start Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">End Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Status</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {flatSemesterRows.map((row) => (
                      <tr
                        key={row.key}
                        className={row.existing ? 'bg-emerald-50/30' : 'bg-white hover:bg-gray-50'}
                      >
                        <td className="px-3 py-2">
                          <span className="inline-flex min-w-[40px] items-center justify-center rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                            {row.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                          {row.academicYearLabel}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={row.startDate}
                            onChange={(e) => updateDraft(row.key, 'startDate', e.target.value)}
                            className="w-full min-w-[130px] rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={row.endDate}
                            min={row.startDate || undefined}
                            onChange={(e) => updateDraft(row.key, 'endDate', e.target.value)}
                            className="w-full min-w-[130px] rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {row.existing ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <Check size={12} />
                              Saved
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => saveSemesterRow(row)}
                            disabled={savingKey === row.key || !row.startDate || !row.endDate}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {savingKey === row.key ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            {row.existing ? 'Update' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved tab */}
      {activeSubTab === 'saved' && (
        <div className="space-y-4">
          {savedConfigurations.length > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Quick Open ({savedConfigurations.length} configurations)
              </p>
              <div className="flex flex-wrap gap-2">
                {savedConfigurations.map((config) => (
                  <button
                    key={`${config.batch}-${config.collegeId}-${config.courseId}`}
                    type="button"
                    onClick={() => loadSavedIntoConfigure(config)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    <Check size={12} />
                    Batch {config.batch} · {config.collegeName} · {config.courseName}
                    <span className="text-emerald-500">({config.semesterCount} sem)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {savedSemesterRows.length === 0 ? (
              <div className="py-12 text-center">
                <Archive size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">No saved semester dates yet</p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('configure')}
                  className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Go to Configure →
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">
                    {savedSemesterRows.length} saved semester{savedSemesterRows.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Batch</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">College</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Program</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Year-Sem</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Session</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Start Date</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">End Date</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {savedSemesterRows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs font-medium text-gray-900">{row.batch}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{row.collegeName || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{row.courseName}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                              {row.yearSemLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                            {row.academicYearLabel}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            {formatDate(row.startDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            {formatDate(row.endDate)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                loadSavedIntoConfigure({
                                  batch: row.batch,
                                  collegeId: row.collegeId,
                                  courseId: row.courseId
                                })
                              }
                              className="mr-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSemester(row)}
                              className="text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicCalendar;

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
  FileSpreadsheet,
  Download,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
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

const getSemestersPerYearForCourse = (course, yearOfStudy) => {
  if (!course) return 2;
  if (course.yearSemesterConfig && Array.isArray(course.yearSemesterConfig) && yearOfStudy) {
    const yearConfig = course.yearSemesterConfig.find((y) => y.year === yearOfStudy);
    if (yearConfig?.semesters) return yearConfig.semesters;
  }
  return course.semestersPerYear || 2;
};

const matchesAcademicYearLabel = (candidateLabel, selectedLabel) => {
  const candidate = String(candidateLabel || '').trim();
  const selected = String(selectedLabel || '').trim();
  if (!candidate || !selected) return false;
  if (candidate === selected) return true;
  if (candidate.startsWith(`${selected}-`) || candidate.endsWith(`-${selected}`)) return true;
  if (/^\d{4}$/.test(selected) && candidate.includes(selected)) return true;
  return false;
};

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 disabled:cursor-not-allowed';

const AcademicCalendar = ({ colleges, courses, academicYears, readOnly = false }) => {
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

  const [reportFilters, setReportFilters] = useState({
    academicYear: '',
    batch: '',
    collegeId: '',
    courseId: ''
  });
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [editingReportRowKey, setEditingReportRowKey] = useState(null);
  const [reportRowDrafts, setReportRowDrafts] = useState({});

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

  const academicYearReportRows = useMemo(() => {
    const selectedAcademicYear = reportFilters.academicYear;
    if (!selectedAcademicYear) return [];

    const rows = [];
    const activeCourses = courses.filter((course) => course.isActive !== false);

    activeCourses.forEach((course) => {
      const college = colleges.find((c) => c.id === course.collegeId);
      const collegeName = college?.name || 'All Colleges';
      const collegeId = course.collegeId || null;

      allBatches.forEach((batch) => {
        const totalYears = course.totalYears || 4;
        for (let yearOfStudy = 1; yearOfStudy <= totalYears; yearOfStudy += 1) {
          const session = deriveAcademicYearLabel(batch, yearOfStudy);
          if (!matchesAcademicYearLabel(session, selectedAcademicYear)) continue;

          const semesterCount = getSemestersPerYearForCourse(course, yearOfStudy);
          for (let semesterNumber = 1; semesterNumber <= semesterCount; semesterNumber += 1) {
            const existing = semesters.find((semester) => {
              const semesterBatch = semester.batch || semester.batchLabel || getBatchLabel(semester);
              const collegeMatch = collegeId == null
                ? semester.collegeId == null
                : semester.collegeId === collegeId || semester.collegeId == null;
              return (
                matchesAcademicYearLabel(semester.academicYearLabel, selectedAcademicYear) &&
                String(semesterBatch) === String(batch) &&
                semester.courseId === course.id &&
                collegeMatch &&
                semester.yearOfStudy === yearOfStudy &&
                semester.semesterNumber === semesterNumber
              );
            });

            const isConfigured = Boolean(existing?.startDate && existing?.endDate);

            rows.push({
              key: `${selectedAcademicYear}|${batch}|${collegeId}|${course.id}|${yearOfStudy}|${semesterNumber}`,
              semesterId: existing?.id || null,
              academicYearLabel: selectedAcademicYear,
              batch,
              collegeName,
              collegeId,
              courseName: course.name,
              courseId: course.id,
              yearSemLabel: `${yearOfStudy}-${semesterNumber}`,
              yearOfStudy,
              semesterNumber,
              startDate: existing?.startDate || null,
              endDate: existing?.endDate || null,
              status: isConfigured ? 'Configured' : 'Pending'
            });
          }
        }
      });
    });

    return rows.sort((a, b) => {
      if (a.batch !== b.batch) return (b.batch || '').localeCompare(a.batch || '');
      if (a.collegeName !== b.collegeName) return (a.collegeName || '').localeCompare(b.collegeName || '');
      if (a.courseName !== b.courseName) return (a.courseName || '').localeCompare(b.courseName || '');
      if (a.yearOfStudy !== b.yearOfStudy) return a.yearOfStudy - b.yearOfStudy;
      return a.semesterNumber - b.semesterNumber;
    });
  }, [reportFilters.academicYear, courses, colleges, allBatches, semesters]);

  const reportFilterOptions = useMemo(() => {
    const batches = new Set();
    const collegesMap = new Map();
    const coursesMap = new Map();

    academicYearReportRows.forEach((row) => {
      if (row.batch) batches.add(row.batch);
      if (row.collegeId) {
        collegesMap.set(row.collegeId, row.collegeName || `College ${row.collegeId}`);
      }
      if (row.courseId) {
        coursesMap.set(row.courseId, row.courseName || `Program ${row.courseId}`);
      }
    });

    return {
      batches: Array.from(batches).sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return b.localeCompare(a);
      }),
      colleges: Array.from(collegesMap.entries())
        .map(([id, name]) => ({ id: String(id), name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      courses: Array.from(coursesMap.entries())
        .map(([id, name]) => ({ id: String(id), name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [academicYearReportRows]);

  const filteredReportRows = useMemo(() => {
    return academicYearReportRows.filter((row) => {
      if (reportFilters.batch && row.batch !== reportFilters.batch) return false;
      if (reportFilters.collegeId && String(row.collegeId || '') !== reportFilters.collegeId) return false;
      if (reportFilters.courseId && String(row.courseId) !== reportFilters.courseId) return false;
      return true;
    });
  }, [academicYearReportRows, reportFilters]);

  const reportSummary = useMemo(() => {
    const configured = filteredReportRows.filter((row) => row.status === 'Configured').length;
    const pending = filteredReportRows.filter((row) => row.status === 'Pending').length;
    return { configured, pending, total: filteredReportRows.length };
  }, [filteredReportRows]);

  const academicYearOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    const addOption = (id, label) => {
      const normalized = String(label || '').trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      options.push({ id: id || null, label: normalized });
    };
    academicYears
      .filter((y) => y.isActive !== false)
      .forEach((y) => addOption(y.id, y.yearLabel));
    semesters.forEach((s) => addOption(s.academicYearId, s.academicYearLabel));
    allBatches.forEach((batch) => {
      courses.forEach((course) => {
        const totalYears = course.totalYears || 4;
        for (let yearOfStudy = 1; yearOfStudy <= totalYears; yearOfStudy += 1) {
          const session = deriveAcademicYearLabel(batch, yearOfStudy);
          if (session) addOption(null, session);
        }
      });
    });
    return options.sort((a, b) => b.label.localeCompare(a.label));
  }, [academicYears, semesters, allBatches, courses]);


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

  const getSemestersPerYear = useCallback(
    (course, yearOfStudy) => getSemestersPerYearForCourse(course, yearOfStudy),
    []
  );

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

  const startEditReportRow = (row) => {
    setEditingReportRowKey(row.key);
    setReportRowDrafts((prev) => ({
      ...prev,
      [row.key]: {
        startDate: toDateInput(row.startDate) || '',
        endDate: toDateInput(row.endDate) || ''
      }
    }));
  };

  const cancelEditReportRow = (rowKey) => {
    setEditingReportRowKey((current) => (current === rowKey ? null : current));
    setReportRowDrafts((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  const updateReportDraft = (rowKey, field, value) => {
    setReportRowDrafts((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [field]: value }
    }));
  };

  const saveReportRow = async (row) => {
    const draft = reportRowDrafts[row.key] || {};
    const startDate = draft.startDate || '';
    const endDate = draft.endDate || '';

    if (!startDate || !endDate) {
      toast.error(`Set start and end dates for ${row.yearSemLabel}`);
      return false;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      toast.error('End date must be after start date');
      return false;
    }

    const payload = {
      collegeId: row.collegeId ? parseInt(row.collegeId, 10) : null,
      courseId: parseInt(row.courseId, 10),
      batch: row.batch,
      yearOfStudy: row.yearOfStudy,
      semesterNumber: row.semesterNumber,
      startDate,
      endDate,
      academicYearLabel: row.academicYearLabel || deriveAcademicYearLabel(row.batch, row.yearOfStudy)
    };

    try {
      setSavingKey(row.key);
      if (row.semesterId) {
        await api.put(`/semesters/${row.semesterId}`, payload);
        toast.success(`Updated ${row.yearSemLabel}`);
      } else {
        await api.post('/semesters', payload);
        toast.success(`Saved ${row.yearSemLabel}`);
      }
      cancelEditReportRow(row.key);
      await fetchSemesters();
      return true;
    } catch (error) {
      console.error('Failed to save semester from report', error);
      toast.error(error.response?.data?.message || 'Failed to save semester');
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const handleReportFilterChange = (field, value) => {
    setReportFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleReportAcademicYearChange = (academicYear) => {
    setEditingReportRowKey(null);
    setReportRowDrafts({});
    setReportFilters({
      academicYear,
      batch: '',
      collegeId: '',
      courseId: ''
    });
  };

  const handleDownloadReportExcel = async () => {
    if (!reportFilters.academicYear) {
      toast.error('Select an academic year first');
      return;
    }
    if (filteredReportRows.length === 0) {
      toast.error('No report data to download');
      return;
    }

    setDownloadingReport(true);
    const downloadToast = toast.loading('Preparing Excel...');
    try {
      const header = [
        'Academic Year',
        'Batch',
        'College',
        'Program',
        'Year-Sem',
        'Start Date',
        'End Date',
        'Status'
      ];
      const dataRows = filteredReportRows.map((row) => [
        row.academicYearLabel,
        row.batch,
        row.collegeName,
        row.courseName,
        row.yearSemLabel,
        row.startDate ? formatDate(row.startDate) : '',
        row.endDate ? formatDate(row.endDate) : '',
        row.status
      ]);
      const summaryRows = [
        [],
        ['Summary'],
        ['Academic Year', reportFilters.academicYear],
        ['Total Rows', reportSummary.total],
        ['Configured', reportSummary.configured],
        ['Pending', reportSummary.pending]
      ];
      const worksheet = XLSX.utils.aoa_to_sheet([header, ...dataRows, ...summaryRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Academic Year Report');
      const dateStr = new Date().toISOString().split('T')[0];
      const safeYear = String(reportFilters.academicYear).replace(/[^\w-]+/g, '_');
      XLSX.writeFile(workbook, `academic_year_report_${safeYear}_${dateStr}.xlsx`);
      toast.success('Excel downloaded', { id: downloadToast });
    } catch (error) {
      console.error('Failed to download academic year report', error);
      toast.error('Failed to download Excel', { id: downloadToast });
    } finally {
      setDownloadingReport(false);
    }
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
          onClick={() => setActiveSubTab('report')}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeSubTab === 'report'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileSpreadsheet size={16} />
          Academic Year Wise Report
          {reportSummary.pending > 0 && reportFilters.academicYear && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {reportSummary.pending} pending
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
                {!readOnly && (
                <button
                  type="button"
                  onClick={saveAllDirty}
                  disabled={bulkSaving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save All
                </button>
                )}
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
                          {!readOnly && (
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
                          )}
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

      {/* Academic Year Wise Report tab */}
      {activeSubTab === 'report' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Report Filters
              </p>
              <button
                type="button"
                onClick={handleDownloadReportExcel}
                disabled={downloadingReport || !reportFilters.academicYear || filteredReportRows.length === 0}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloadingReport ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Download Excel
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar size={14} className="text-gray-400" />
                  Academic Year
                </label>
                <select
                  value={reportFilters.academicYear}
                  onChange={(e) => handleReportAcademicYearChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select academic year</option>
                  {academicYearOptions.map((year) => (
                    <option key={year.label} value={year.label}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar size={14} className="text-gray-400" />
                  Batch
                </label>
                <select
                  value={reportFilters.batch}
                  onChange={(e) => handleReportFilterChange('batch', e.target.value)}
                  disabled={!reportFilters.academicYear}
                  className={selectClass}
                >
                  <option value="">All batches</option>
                  {reportFilterOptions.batches.map((batch) => (
                    <option key={batch} value={batch}>
                      Batch {batch}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Landmark size={14} className="text-gray-400" />
                  College
                </label>
                <select
                  value={reportFilters.collegeId}
                  onChange={(e) => handleReportFilterChange('collegeId', e.target.value)}
                  disabled={!reportFilters.academicYear}
                  className={selectClass}
                >
                  <option value="">All colleges</option>
                  {reportFilterOptions.colleges.map((college) => (
                    <option key={college.id} value={college.id}>
                      {college.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <GraduationCap size={14} className="text-gray-400" />
                  Program / Course
                </label>
                <select
                  value={reportFilters.courseId}
                  onChange={(e) => handleReportFilterChange('courseId', e.target.value)}
                  disabled={!reportFilters.academicYear}
                  className={selectClass}
                >
                  <option value="">All programs</option>
                  {reportFilterOptions.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!reportFilters.academicYear ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Select an academic year to view the report</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{reportSummary.total}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Configured</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">{reportSummary.configured}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Pending</p>
                  <p className="mt-1 text-2xl font-bold text-amber-800">{reportSummary.pending}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                {filteredReportRows.length === 0 ? (
                  <div className="py-12 text-center">
                    <AlertCircle size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-500">No records match the selected filters</p>
                    <button
                      type="button"
                      onClick={() => setReportFilters((prev) => ({
                        ...prev,
                        batch: '',
                        collegeId: '',
                        courseId: ''
                      }))}
                      className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {filteredReportRows.length} record{filteredReportRows.length !== 1 ? 's' : ''} for {reportFilters.academicYear}
                        {filteredReportRows.length !== academicYearReportRows.length && (
                          <span className="text-gray-500"> of {academicYearReportRows.length}</span>
                        )}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Academic Year</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Batch</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">College</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Program</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Year-Sem</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Start Date</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">End Date</th>
                            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-600">Status</th>
                            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-600">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredReportRows.map((row) => {
                            const isEditing = editingReportRowKey === row.key;
                            const draft = reportRowDrafts[row.key];
                            const displayStatus = isEditing
                              ? (draft?.startDate && draft?.endDate ? 'Configured' : 'Pending')
                              : row.status;

                            return (
                            <tr
                              key={row.key}
                              className={
                                isEditing
                                  ? 'bg-blue-50/60'
                                  : row.status === 'Pending'
                                    ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                    : 'hover:bg-gray-50'
                              }
                            >
                              <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-gray-900">
                                {row.academicYearLabel}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-gray-900">{row.batch}</td>
                              <td className="px-3 py-2 text-xs text-gray-700">{row.collegeName || '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-700">{row.courseName}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                                  {row.yearSemLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={draft?.startDate || ''}
                                    onChange={(e) => updateReportDraft(row.key, 'startDate', e.target.value)}
                                    className="w-full min-w-[130px] rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                                  />
                                ) : (
                                  <span className="whitespace-nowrap text-xs text-gray-600">
                                    {row.startDate ? formatDate(row.startDate) : '-'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={draft?.endDate || ''}
                                    min={draft?.startDate || undefined}
                                    onChange={(e) => updateReportDraft(row.key, 'endDate', e.target.value)}
                                    className="w-full min-w-[130px] rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                                  />
                                ) : (
                                  <span className="whitespace-nowrap text-xs text-gray-600">
                                    {row.endDate ? formatDate(row.endDate) : '-'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {displayStatus === 'Configured' ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                    <Check size={12} />
                                    Configured
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    <AlertCircle size={12} />
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => cancelEditReportRow(row.key)}
                                      disabled={savingKey === row.key}
                                      className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveReportRow(row)}
                                      disabled={
                                        savingKey === row.key ||
                                        !draft?.startDate ||
                                        !draft?.endDate
                                      }
                                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                    >
                                      {savingKey === row.key ? (
                                        <Loader2 size={12} className="animate-spin" />
                                      ) : (
                                        <Save size={12} />
                                      )}
                                      Save
                                    </button>
                                  </div>
                                ) : (
                                  !readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => startEditReportRow(row)}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    {row.status === 'Configured' ? 'Edit' : 'Configure'}
                                  </button>
                                  )
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AcademicCalendar;

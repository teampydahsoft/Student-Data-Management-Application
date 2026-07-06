import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Download,
  Award,
  XCircle,
  Building2,
  Calendar,
  BookOpen,
  GitBranch,
  Layers,
  Lock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';
import {
  SCHOLARSHIP_RTF_RELEASED_LABEL,
  SCHOLARSHIP_RTF_DUE_LABEL
} from '../config/scholarshipConfig';

const formatAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '—';
  return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Mirror of backend formatAcademicYearLabel — batch like "2023" or "2023-24"
const extractBatchStartYear = (batch) => {
  if (!batch) return null;
  const text = String(batch).trim();
  const full = text.match(/^(\d{4})/);
  if (full) return Number(full[1]);
  const short = text.match(/^(\d{2})/);
  if (short) {
    const y = Number(short[1]);
    return y <= 50 ? 2000 + y : 1900 + y;
  }
  return null;
};

const formatAcademicYearLabel = (batch, studentYear) => {
  const start = extractBatchStartYear(batch);
  const idx = Math.max(1, Number(studentYear) || 1);
  if (!start) return `Year ${idx}`;
  const from = start + idx - 1;
  return `${from}-${from + 1}`;
};

/** Program year index (1, 2, …) for the current June–May academic cycle. */
const getCurrentProgramYear = (batch, maxYears = 10) => {
  const batchStart = extractBatchStartYear(batch);
  if (!batchStart) return 1;
  const now = new Date();
  const calendarYear = now.getFullYear();
  const academicStartYear = now.getMonth() >= 5 ? calendarYear : calendarYear - 1;
  const programYear = academicStartYear - batchStart + 1;
  return Math.min(Math.max(1, programYear), maxYears);
};

function ScholarshipReport() {
  const { user } = useAuthStore();

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_scholarship');
  }, [user]);

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to view Scholarship Reports.
        </p>
      </div>
    );
  }

  const [filters, setFilters] = useState({
    college: '',
    batch: '',
    course: '',
    branch: '',
    academic_year: '',      // program year index: '' | '1' | '2' ...
    scholarship_status: ''  // '' | 'eligible' | 'pending' | 'rejected' | 'not_eligible' | 'not_applied'
  });
  const [filterOptions, setFilterOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]);
  const [collegesList, setCollegesList] = useState([]);
  const [batchTotalYears, setBatchTotalYears] = useState(0); // total years for selected batch/course
  const [reportData, setReportData] = useState([]);
  const [totalYears, setTotalYears] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // sort: { key: 'pin' | 'name', dir: 'asc' | 'desc' }
  const [sort, setSort] = useState({ key: 'pin', dir: 'asc' });

  const handleSortToggle = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const sortedData = useMemo(() => {
    if (!reportData.length) return reportData;
    return [...reportData].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sort.key === 'pin') {
        aVal = (a.pin_no || a.admission_number || '').toLowerCase();
        bVal = (b.pin_no || b.admission_number || '').toLowerCase();
      } else {
        aVal = (a.student_name || '').toLowerCase();
        bVal = (b.student_name || '').toLowerCase();
      }
      if (aVal < bVal) return sort.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reportData, sort]);

  const colsPerYear = 3;

  const filtersReady = Boolean(filters.college && filters.batch && filters.course && filters.branch);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({ college: '', batch: '', course: '', branch: '', academic_year: '', scholarship_status: '' });
  };

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [quickRes, coursesRes, collegesRes] = await Promise.all([
          api.get('/students/quick-filters?applyExclusions=true'),
          api.get('/courses?includeInactive=false'),
          api.get('/colleges?includeInactive=false')
        ]);
        if (quickRes.data?.success) {
          const d = quickRes.data.data || {};
          setFilterOptions({
            colleges: d.colleges || [],
            batches: d.batches || [],
            courses: d.courses || [],
            branches: d.branches || []
          });
        }
        if (coursesRes.data?.success) setCoursesWithLevels(coursesRes.data.data || []);
        if (collegesRes.data?.success) setCollegesList(collegesRes.data.data || []);
      } catch (err) {
        console.warn('Failed to fetch filter options:', err);
      }
    };
    fetchInitial();
  }, []);

  useEffect(() => {
    const update = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.batch) params.append('batch', filters.batch);
        if (filters.course) params.append('course', filters.course);
        if (filters.branch) params.append('branch', filters.branch);
        params.append('applyExclusions', 'true');
        const res = await api.get(`/students/quick-filters?${params.toString()}`);
        if (res.data?.success) {
          const d = res.data.data || {};
          setFilterOptions((prev) => ({
            ...prev,
            batches: d.batches || prev.batches,
            courses: d.courses || prev.courses,
            branches: d.branches || prev.branches
          }));
        }
      } catch (err) {
        console.warn('Failed to update filter options:', err);
      }
    };
    update();
  }, [filters.college, filters.batch, filters.course, filters.branch]);

  const availableCourses = useMemo(() => {
    if (!coursesWithLevels?.length) return (filterOptions.courses || []).sort();
    let list = coursesWithLevels;
    if (filters.college) {
      const college = collegesList.find((c) => c.name === filters.college);
      if (college?.id) {
        list = list.filter((c) => (c.collegeId || c.college_id) === college.id);
      } else return [];
    }
    return [...new Set(list.map((c) => c.name).filter(Boolean))].sort();
  }, [coursesWithLevels, collegesList, filters.college, filterOptions.courses]);

  // Resolve total years for the selected course; default academic year to current cycle
  useEffect(() => {
    if (!filters.course) {
      setBatchTotalYears(0);
      setFilters((prev) => ({ ...prev, academic_year: '' }));
      return;
    }
    const matched = coursesWithLevels.find((c) => c.name === filters.course);
    const years = matched?.total_years || matched?.totalYears || 4;
    const total = Number(years) || 4;
    setBatchTotalYears(total);
    setFilters((prev) => {
      const currentYear = getCurrentProgramYear(prev.batch, total);
      return { ...prev, academic_year: String(currentYear) };
    });
  }, [filters.course, coursesWithLevels]);

  // When batch changes while course is selected, snap to current cycle (unless All Years)
  useEffect(() => {
    if (!filters.batch || !batchTotalYears || !filters.course) return;
    const currentYear = String(getCurrentProgramYear(filters.batch, batchTotalYears));
    setFilters((prev) => {
      if (!prev.academic_year) return prev;
      return { ...prev, academic_year: currentYear };
    });
  }, [filters.batch, batchTotalYears, filters.course]);

  useEffect(() => {
    if (!filtersReady) {
      setReportData([]);
      setTotalYears(0);
      return;
    }

    const fetchReport = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('filter_college', filters.college);
        params.append('filter_batch', filters.batch);
        params.append('filter_course', filters.course);
        params.append('filter_branch', filters.branch);
        if (filters.academic_year && filters.academic_year !== 'all') {
          params.append('filter_academic_year', filters.academic_year);
        }
        if (filters.scholarship_status) {
          params.append('filter_scholarship_status', filters.scholarship_status);
        }

        const res = await api.get(`/students/reports/scholarship?${params.toString()}`);
        if (res.data?.success) {
          setReportData(res.data.data || []);
          setTotalYears(res.data.totalYears || 0);
        } else {
          setReportData([]);
          setTotalYears(0);
        }
      } catch (err) {
        console.error('Failed to load scholarship report:', err);
        toast.error('Failed to load scholarship report');
        setReportData([]);
        setTotalYears(0);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [filters, filtersReady, refreshKey]);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    params.append('filter_college', filters.college);
    params.append('filter_batch', filters.batch);
    params.append('filter_course', filters.course);
    params.append('filter_branch', filters.branch);
    if (filters.academic_year && filters.academic_year !== 'all') {
      params.append('filter_academic_year', filters.academic_year);
    }
    if (filters.scholarship_status) {
      params.append('filter_scholarship_status', filters.scholarship_status);
    }
    return params;
  };

  const handleDownload = async () => {
    if (!filtersReady) {
      toast.error('Select college, batch, program and branch first');
      return;
    }
    setDownloading(true);
    const downloadToast = toast.loading('Preparing Excel...');
    try {
      const params = buildExportParams();
      const res = await api.get(`/students/reports/scholarship/export?${params.toString()}`, {
        responseType: 'blob',
        validateStatus: (status) => status >= 200 && status < 300
      });

      if (res.data.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorData = JSON.parse(reader.result);
            toast.error(errorData.message || 'Export failed', { id: downloadToast });
          } catch {
            toast.error('Export failed on server', { id: downloadToast });
          }
        };
        reader.readAsText(res.data);
        return;
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `scholarship_report_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel downloaded', { id: downloadToast });
    } catch (e) {
      console.error('Download error:', e);
      toast.error('Failed to download Excel', { id: downloadToast });
    } finally {
      setDownloading(false);
    }
  };

  const yearColumns = useMemo(() => {
    if (filters.academic_year && filters.academic_year !== 'all') {
      return [Number(filters.academic_year)];
    }
    if (!totalYears) return [];
    return Array.from({ length: totalYears }, (_, index) => index + 1);
  }, [filters.academic_year, totalYears]);

  // Build academic year options: [{ value: '1', label: '2023-2024' }, ...]
  const academicYearOptions = useMemo(() => {
    if (!batchTotalYears || !filters.batch) return [];
    const currentProgramYear = getCurrentProgramYear(filters.batch, batchTotalYears);
    return Array.from({ length: batchTotalYears }, (_, i) => ({
      value: String(i + 1),
      label: formatAcademicYearLabel(filters.batch, i + 1),
      isCurrent: i + 1 === currentProgramYear
    }));
  }, [batchTotalYears, filters.batch]);

  const SortIcon = ({ colKey }) => {
    if (sort.key !== colKey) return <ArrowUpDown size={13} className="text-gray-400 ml-1 inline-block" />;
    return sort.dir === 'asc'
      ? <ArrowUp size={13} className="text-amber-600 ml-1 inline-block" />
      : <ArrowDown size={13} className="text-amber-600 ml-1 inline-block" />;
  };

  const hasActiveFilters = filters.college || filters.batch || filters.course || filters.branch || filters.academic_year || filters.scholarship_status;

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-4">
      <header className="flex-shrink-0 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
            <Award size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Scholarship Report</h1>
            <p className="text-sm text-gray-500">
              Year-wise sanctioned, released and due amounts by batch, college, program and branch
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || !filtersReady}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !filtersReady || reportData.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 text-sm font-medium disabled:opacity-50"
          >
            <Download size={16} />
            Download Excel
          </button>
        </div>
      </header>

      <section className="flex-shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Layers size={16} />
          Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">College</label>
            <select
              value={filters.college || ''}
              onChange={(e) => handleFilterChange('college', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select College</option>
              {(filterOptions.colleges || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Batch</label>
            <select
              value={filters.batch || ''}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select Batch</option>
              {(filterOptions.batches || []).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Program</label>
            <select
              value={filters.course || ''}
              onChange={(e) => handleFilterChange('course', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select Program</option>
              {availableCourses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
            <select
              value={filters.branch || ''}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select Branch</option>
              {(filterOptions.branches || []).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
            <select
              value={filters.academic_year || ''}
              onChange={(e) => handleFilterChange('academic_year', e.target.value)}
              disabled={!filters.batch || !filters.course}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:bg-gray-50"
            >
              <option value="">All Years</option>
              {academicYearOptions.map(({ value, label, isCurrent }) => (
                <option key={value} value={value}>
                  {label}{isCurrent ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Scholarship Status</label>
            <select
              value={filters.scholarship_status || ''}
              onChange={(e) => handleFilterChange('scholarship_status', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Statuses</option>
              <option value="eligible">✅ Eligible</option>
              <option value="non_eligible_all">🔴 All Remaining (Non-Eligible)</option>
            </select>
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
          >
            <XCircle size={16} />
            Clear filters
          </button>
        )}
      </section>

      {filtersReady && (
        <div className="flex-shrink-0 flex flex-col gap-2">
          {/* Active filter chips + student count */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="font-medium text-gray-700">Showing:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs">
              <Building2 size={12} /> {filters.college}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs">
              <Calendar size={12} /> {filters.batch}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs">
              <BookOpen size={12} /> {filters.course}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs">
              <GitBranch size={12} /> {filters.branch}
            </span>
            {filters.academic_year && filters.academic_year !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-medium text-xs">
                <Layers size={12} /> {formatAcademicYearLabel(filters.batch, filters.academic_year)}
              </span>
            )}
            {filters.scholarship_status && (() => {
              const statusMeta = {
                eligible:         { label: 'Eligible',                    cls: 'bg-green-50 border-green-200 text-green-700' },
                non_eligible_all: { label: 'All Remaining (Non-Eligible)', cls: 'bg-red-50 border-red-200 text-red-700' }
              };
              const meta = statusMeta[filters.scholarship_status] || { label: filters.scholarship_status, cls: 'bg-gray-50 border-gray-200 text-gray-600' };
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium text-xs ${meta.cls}`}>
                  {meta.label}
                </span>
              );
            })()}
            <span className="ml-auto text-gray-500 text-xs font-medium">{reportData.length} students</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {!filtersReady ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
              Select college, batch, program and branch to load the scholarship report.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm gap-2">
              <RefreshCw size={18} className="animate-spin" />
              Loading report...
            </div>
          ) : reportData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
              No students found for the selected filters.
            </div>
          ) : (
            <table className="min-w-full text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap text-[11px]">
                    #
                  </th>
                  <th
                    rowSpan={2}
                    onClick={() => handleSortToggle('name')}
                    className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap min-w-[140px] cursor-pointer select-none hover:bg-gray-100 text-[11px]"
                  >
                    Student Name <SortIcon colKey="name" />
                  </th>
                  <th
                    rowSpan={2}
                    onClick={() => handleSortToggle('pin')}
                    className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 text-[11px]"
                  >
                    PIN / Adm No <SortIcon colKey="pin" />
                  </th>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap text-[11px]">
                    Branch
                  </th>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap text-[11px]">
                    Quota
                  </th>
                  <th rowSpan={2} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap text-[11px]">
                    Caste
                  </th>
                  {filters.scholarship_status === 'non_eligible_all' && (
                    <th rowSpan={2} className="border-b border-r border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap text-[11px]">
                      Scholarship Status
                    </th>
                  )}
                  {yearColumns.map((year) => (
                    <th
                      key={`year-${year}`}
                      colSpan={colsPerYear}
                      className="border-b border-r border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-700 bg-amber-50/60 text-[11px]"
                    >
                      {formatAcademicYearLabel(filters.batch, year)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {yearColumns.map((year) => (
                    <React.Fragment key={`sub-${year}`}>
                      <th className="border-b border-r border-gray-200 px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap">
                        Sanctioned
                      </th>
                      <th className="border-b border-r border-gray-200 px-1.5 py-1 text-center text-[10px] font-medium text-emerald-600 whitespace-nowrap">
                        {SCHOLARSHIP_RTF_RELEASED_LABEL}
                      </th>
                      <th className="border-b border-r border-gray-200 px-1.5 py-1 text-center text-[10px] font-medium text-pink-600 whitespace-nowrap">
                        {SCHOLARSHIP_RTF_DUE_LABEL}
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((student, index) => (
                  <tr key={student.student_id || student.admission_number} className="hover:bg-gray-50/80">
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 text-gray-500 text-[11px]">{index + 1}</td>
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 font-medium text-gray-900 text-[11px]">
                      {student.student_name || '—'}
                    </td>
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 text-gray-700 font-mono text-[10px]">
                      {student.pin_no || student.admission_number || '—'}
                    </td>
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 text-gray-600 text-[11px]">
                      {student.branch || '—'}
                    </td>
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 text-gray-600 text-[11px]">
                      {student.stud_type || '—'}
                    </td>
                    <td className="border-b border-r border-gray-100 px-2 py-1.5 text-gray-600 text-[11px]">
                      {student.caste || '—'}
                    </td>
                    {filters.scholarship_status === 'non_eligible_all' && (
                      <td className="border-b border-r border-gray-100 px-2 py-1.5 text-[11px]">
                        {(() => {
                          const raw = (student.scholar_status || '').toLowerCase().trim();
                          const statusDisplay = {
                            not_eligible: { label: 'Not Eligible',  cls: 'text-orange-700 bg-orange-50 border border-orange-200' },
                            pending:      { label: 'Pending',        cls: 'text-yellow-700 bg-yellow-50 border border-yellow-200' },
                            rejected:     { label: 'Rejected',       cls: 'text-red-700 bg-red-50 border border-red-200' },
                            not_applied:  { label: 'Not Applied',    cls: 'text-gray-600 bg-gray-50 border border-gray-200' }
                          };
                          const meta = statusDisplay[raw];
                          if (meta) {
                            return (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.cls}`}>
                                {meta.label}
                              </span>
                            );
                          }
                          return <span className="text-gray-500">{student.scholar_status || '—'}</span>;
                        })()}
                      </td>
                    )}
                    {yearColumns.map((year) => {
                      const yearData = student.years?.find((entry) => entry.student_year === year) || {
                        sanctioned_amount: 0,
                        released_amount: 0,
                        due_amount: 0
                      };
                      return (
                        <React.Fragment key={`${student.student_id}-${year}`}>
                          <td className="border-b border-r border-gray-100 px-1.5 py-1.5 text-right text-gray-700 tabular-nums text-[11px]">
                            {formatAmount(yearData.sanctioned_amount)}
                          </td>
                          <td className="border-b border-r border-gray-100 px-1.5 py-1.5 text-right text-emerald-700 tabular-nums text-[11px]">
                            {formatAmount(yearData.released_amount)}
                          </td>
                          <td className="border-b border-r border-gray-100 px-1.5 py-1.5 text-right text-pink-700 tabular-nums text-[11px] font-medium">
                            {formatAmount(yearData.due_amount)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScholarshipReport;

import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Download,
  FileText,
  AlertCircle,
  XCircle,
  BarChart3,
  Building2,
  Calendar,
  BookOpen,
  GitBranch,
  Hash,
  Layers,
  Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

function CategoryReport() {
  const { user } = useAuthStore();

  // Permission check
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;

    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_category');
  }, [user]);

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to view Category Reports.
        </p>
      </div>
    );
  }
  const [filters, setFilters] = useState({
    college: '',
    batch: '',
    course: '',
    level: '',
    branch: '',
    year: '',
    semester: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]);
  const [collegesList, setCollegesList] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [categoryColumns, setCategoryColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      college: '',
      batch: '',
      course: '',
      level: '',
      branch: '',
      year: '',
      semester: ''
    });
  };

  // Initial filter options
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
          setFilterOptions((prev) => ({
            ...prev,
            colleges: d.colleges || [],
            batches: d.batches || [],
            courses: d.courses || [],
            branches: d.branches || [],
            years: d.years || [],
            semesters: d.semesters || []
          }));
        }
        if (coursesRes.data?.success) setCoursesWithLevels(coursesRes.data.data || []);
        if (collegesRes.data?.success) setCollegesList(collegesRes.data.data || []);
      } catch (err) {
        console.warn('Failed to fetch filter options:', err);
      }
    };
    fetchInitial();
  }, []);

  // Update dependents when college, level, batch, or course change
  useEffect(() => {
    const update = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.level) params.append('level', filters.level);
        if (filters.batch) params.append('batch', filters.batch);
        if (filters.course) params.append('course', filters.course);
        if (filters.branch) params.append('branch', filters.branch);
        if (filters.year) params.append('year', filters.year);
        params.append('applyExclusions', 'true');
        const res = await api.get(`/students/quick-filters?${params.toString()}`);
        if (res.data?.success) {
          const d = res.data.data || {};
          setFilterOptions((prev) => ({
            ...prev,
            batches: d.batches || prev.batches,
            courses: d.courses || prev.courses,
            branches: d.branches || prev.branches,
            years: d.years ?? prev.years,
            semesters: d.semesters ?? prev.semesters
          }));
        }
      } catch (err) {
        console.warn('Failed to update filter options:', err);
      }
    };
    update();
  }, [filters.college, filters.level, filters.batch, filters.course, filters.branch, filters.year]);

  const availableCourses = useMemo(() => {
    if (!coursesWithLevels?.length) return (filterOptions.courses || []).sort();
    let list = coursesWithLevels;
    if (filters.college) {
      const college = collegesList.find((c) => c.name === filters.college);
      if (college?.id) {
        list = list.filter((c) => (c.collegeId || c.college_id) === college.id);
      } else return [];
    }
    if (filters.level) list = list.filter((c) => c.level === filters.level);
    return [...new Set(list.map((c) => c.name).filter(Boolean))].sort();
  }, [coursesWithLevels, collegesList, filters.college, filters.level]);

  const availableYears = useMemo(() => {
    const list = filterOptions.years || [];
    return list.length ? [...list].sort((a, b) => a - b) : [1, 2, 3, 4];
  }, [filterOptions.years]);

  const availableSemesters = useMemo(() => {
    const list = filterOptions.semesters || [];
    return list.length ? [...list].sort((a, b) => a - b) : [1, 2];
  }, [filterOptions.semesters]);

  // Fetch category report data
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('filter_college', filters.college);
        if (filters.batch) params.append('filter_batch', filters.batch);
        if (filters.course) params.append('filter_course', filters.course);
        if (filters.level) params.append('filter_level', filters.level);
        if (filters.branch) params.append('filter_branch', filters.branch);
        if (filters.year) params.append('filter_year', filters.year);
        if (filters.semester) params.append('filter_semester', filters.semester);

        const res = await api.get(`/students/reports/category?${params.toString()}`);
        if (res.data?.success) {
          setCategoryData(res.data.data || []);
          setCategoryColumns(res.data.categoryColumns || []);
        } else {
          setCategoryData([]);
          setCategoryColumns([]);
        }
      } catch (err) {
        console.error('Failed to load category report:', err);
        toast.error('Failed to load category report');
        setCategoryData([]);
        setCategoryColumns([]);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [filters, refreshKey]);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (filters.college) params.append('filter_college', filters.college);
    if (filters.batch) params.append('filter_batch', filters.batch);
    if (filters.course) params.append('filter_course', filters.course);
    if (filters.level) params.append('filter_level', filters.level);
    if (filters.branch) params.append('filter_branch', filters.branch);
    if (filters.year) params.append('filter_year', filters.year);
    if (filters.semester) params.append('filter_semester', filters.semester);
    return params;
  };

  const handleDownload = async (format) => {
    setDownloading(true);
    const downloadToast = toast.loading(`Preparing ${format === 'pdf' ? 'PDF' : 'Excel'}...`);
    try {
      const params = buildExportParams();
      params.append('format', format);

      const res = await api.get(`/students/reports/category/export?${params.toString()}`, {
        responseType: 'blob',
        // Ensure we catch server-side errors even with blob response
        validateStatus: (status) => status >= 200 && status < 300
      });

      // Check if result is actually a JSON error (can happen if header isn't set right or interceptors miss it)
      if (res.data.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorData = JSON.parse(reader.result);
            toast.error(errorData.message || 'Export failed', { id: downloadToast });
          } catch (e) {
            toast.error('Export failed on server', { id: downloadToast });
          }
        };
        reader.readAsText(res.data);
        return;
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `category_report_${dateStr}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} downloaded`, { id: downloadToast });
    } catch (e) {
      console.error('Download error:', e);
      const message = e.response?.data?.message || `Failed to download ${format.toUpperCase()}`;
      toast.error(message, { id: downloadToast });
    } finally {
      setDownloading(false);
    }
  };

  const hasActiveFilters = filters.college || filters.batch || filters.course || filters.level || filters.branch || filters.year || filters.semester;
  const totalCount = categoryData.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const isAbstract = categoryData.length > 0 && categoryColumns.length > 0 && categoryData[0].category_breakdown != null;

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-4">
      {/* Page header */}
      <header className="flex-shrink-0 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Category Report</h1>
            <p className="text-sm text-gray-500">Caste-wise student counts by college, batch, program and branch</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => handleDownload('excel')}
            disabled={downloading || categoryData.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 text-sm font-medium disabled:opacity-50"
          >
            <Download size={16} />
            Download Excel
          </button>
          <button
            type="button"
            onClick={() => handleDownload('pdf')}
            disabled={downloading || categoryData.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 text-sm font-medium disabled:opacity-50"
          >
            <FileText size={16} />
            Download PDF
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="flex-shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Layers size={16} />
          Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">College</label>
            <select
              value={filters.college || ''}
              onChange={(e) => handleFilterChange('college', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Colleges</option>
              {(filterOptions.colleges || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
            <select
              value={filters.level || ''}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Levels</option>
              <option value="diploma">Diploma</option>
              <option value="ug">UG</option>
              <option value="pg">PG</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Batch</label>
            <select
              value={filters.batch || ''}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Batches</option>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Programs</option>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Branches</option>
              {(filterOptions.branches || []).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select
              value={filters.year || ''}
              onChange={(e) => handleFilterChange('year', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>Year {y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Semester</label>
            <select
              value={filters.semester || ''}
              onChange={(e) => handleFilterChange('semester', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Semesters</option>
              {availableSemesters.map((s) => (
                <option key={s} value={String(s)}>Sem {s}</option>
              ))}
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

      {/* Summary: selected filters */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span className="font-medium text-gray-700">Showing:</span>
          {filters.college && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <Building2 size={14} /> College: {filters.college}
            </span>
          )}
          {filters.batch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <Calendar size={14} /> Batch: {filters.batch}
            </span>
          )}
          {filters.course && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <BookOpen size={14} /> Program: {filters.course}
            </span>
          )}
          {filters.branch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <GitBranch size={14} /> Branch: {filters.branch}
            </span>
          )}
          {filters.year && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <Hash size={14} /> Year: {filters.year}
            </span>
          )}
          {filters.semester && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200">
              <Layers size={14} /> Semester: {filters.semester}
            </span>
          )}
        </div>
      )}

      {/* Table: abstract style - College, Batch, Program, Branch, Year, Sem, Total, then category columns */}
      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-gray-500 py-16">
              <RefreshCw className="animate-spin" size={32} />
              <p>Loading category report...</p>
            </div>
          ) : categoryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-gray-500 py-16">
              <AlertCircle size={40} />
              <p>No category data found for the current filters.</p>
            </div>
          ) : isAbstract ? (
            <table className="w-full text-sm text-left relative">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 whitespace-nowrap bg-gray-50">College</th>
                  <th className="px-3 py-2.5 whitespace-nowrap bg-gray-50">Batch</th>
                  <th className="px-3 py-2.5 whitespace-nowrap bg-gray-50">Program</th>
                  <th className="px-3 py-2.5 bg-gray-50 max-w-[140px] whitespace-normal">Branch</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-center bg-gray-50">Year</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-center bg-gray-50">Sem</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-center bg-gray-50">Total</th>
                  {categoryColumns.map((cat) => (
                    <th key={cat} className="px-3 py-2.5 whitespace-nowrap text-center text-xs text-gray-500 bg-gray-50">
                      {cat}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categoryData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-700">{row.college || '-'}</td>
                    <td className="px-3 py-2.5 text-gray-700">{row.batch || '-'}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{row.course || '-'}</td>
                    <td className="px-3 py-2.5 text-gray-700">{row.branch || '-'}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700">{row.current_year ?? '-'}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700">{row.current_semester ?? '-'}</td>
                    <td className="px-3 py-2.5 text-center font-semibold">{row.total ?? 0}</td>
                    {categoryColumns.map((cat) => (
                      <td key={cat} className="px-3 py-2.5 text-center text-gray-600">
                        {row.category_breakdown?.[cat] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                <tr>
                  <td className="px-3 py-2.5" colSpan={6}>Total</td>
                  <td className="px-3 py-2.5 text-center">{totalCount}</td>
                  {categoryColumns.map((cat) => (
                    <td key={cat} className="px-3 py-2.5 text-center">
                      {categoryData.reduce((sum, r) => sum + (Number(r.category_breakdown?.[cat]) || 0), 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Caste / Subcaste</th>
                  <th className="px-4 py-3 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categoryData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.category || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-200 sticky bottom-0">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{totalCount}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default CategoryReport;

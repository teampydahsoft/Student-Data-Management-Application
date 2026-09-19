import React, { useState, useEffect, useMemo } from 'react';
import {
  FileCheck,
  Search,
  RefreshCw,
  Download,
  Filter,
  Users,
  Award,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  BookOpen,
  GitBranch,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  XCircle,
  X,
  Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';
import { useStudents } from '../hooks/useStudents';
import { getCourseType, getCertificatesForCourse, certificateConfig as defaultCertificateConfig } from '../config/certificateConfig';

const CERTIFICATE_STATUS_OPTIONS = [
  'Verified',
  'Unverified',
  'Pending'
];

const getCertificateBadgeClass = (status) => {
  const norm = String(status || '').trim().toLowerCase();
  if (norm === 'verified') return 'bg-green-100 text-green-800 border-green-200';
  if (norm === 'submitted') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (norm === 'unverified') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (norm === 'partial') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (norm === 'originals returned') return 'bg-teal-100 text-teal-800 border-teal-200';
  if (norm === 'not required') return 'bg-gray-100 text-gray-700 border-gray-200';
  return 'bg-yellow-100 text-yellow-800 border-yellow-200';
};

const getOptionValue = (item) => {
  if (!item) return '';
  if (typeof item === 'object') return item.name || item.label || item.value || String(item.id || '');
  return String(item);
};

const getOptionLabel = (item) => {
  if (!item) return '';
  if (typeof item === 'object') return item.name || item.label || item.value || String(item.id || '');
  return String(item);
};

const CertificatesReport = () => {
  const { user } = useAuthStore();

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_registration') ||
           hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_scholarship') ||
           hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view');
  }, [user]);

  // Filters State
  const [filters, setFilters] = useState({
    college: '',
    level: '',
    batch: '',
    course: '',
    branch: '',
    section: '',
    certificates_status: ''
  });

  const [hasFetched, setHasFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [settingsCertConfig, setSettingsCertConfig] = useState(null);

  // Dynamic filter options from quick-filters & Settings certificate config
  const [filterOptions, setFilterOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: [],
    sections: ['A', 'B', 'C', 'D', 'E']
  });

  // Fetch quick filter options and Settings certificate config
  useEffect(() => {
    const fetchInitialOptions = async () => {
      try {
        const [quickRes, certsRes] = await Promise.allSettled([
          api.get('/students/quick-filters?applyExclusions=true'),
          api.get('/settings/certificates')
        ]);

        if (quickRes.status === 'fulfilled' && quickRes.value.data?.success) {
          const d = quickRes.value.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            colleges: d.colleges || [],
            batches: d.batches || [],
            courses: d.courses || [],
            branches: d.branches || []
          }));
        }

        if (certsRes.status === 'fulfilled' && certsRes.value.data?.data) {
          setSettingsCertConfig(certsRes.value.data.data);
        }
      } catch (err) {
        console.warn('Failed to load initial settings / filter options:', err);
      }
    };
    fetchInitialOptions();
  }, []);

  // Update dynamic dependent options
  useEffect(() => {
    const updateOptions = async () => {
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
          setFilterOptions(prev => ({
            ...prev,
            batches: filters.batch ? prev.batches : (d.batches || prev.batches),
            courses: filters.course ? prev.courses : (d.courses || prev.courses),
            branches: d.branches || prev.branches
          }));
        }
      } catch (err) {
        console.warn('Failed to update options:', err);
      }
    };
    updateOptions();
  }, [filters.college, filters.batch, filters.course, filters.branch]);

  // Use student query (Only runs when hasFetched is true)
  const { data: studentData, isLoading, isError, refetch } = useStudents({
    page,
    pageSize,
    filters,
    search: searchTerm,
    enabled: hasAccess && hasFetched
  });

  const students = studentData?.students || [];
  const totalStudents = studentData?.pagination?.total || 0;
  const totalPages = studentData?.pagination?.totalPages || 1;

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleFetchData = () => {
    setHasFetched(true);
    setPage(1);
    if (hasFetched) {
      refetch();
    }
  };

  const handleClearFilters = () => {
    setFilters({
      college: '',
      level: '',
      batch: '',
      course: '',
      branch: '',
      section: '',
      certificates_status: ''
    });
    setSearchTerm('');
    setPage(1);
    setHasFetched(false);
  };

  const handleViewStudent = (student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  // Calculate unique certificate columns based on selected Level filter (or all levels if empty)
  const allCertColumns = useMemo(() => {
    const activeConfig = settingsCertConfig || defaultCertificateConfig;
    const list = [];
    const addedKeys = new Set();
    const selectedLevelKey = String(filters.level || '').trim().toLowerCase();
    const levelsToInclude = selectedLevelKey
      ? [selectedLevelKey]
      : ['diploma', 'ug', 'pg'];

    levelsToInclude.forEach((level) => {
      const certs = activeConfig[level] || defaultCertificateConfig[level] || [];
      certs.forEach((c) => {
        const key = c.id || c.key;
        if (key && !addedKeys.has(key)) {
          addedKeys.add(key);
          list.push({
            key,
            name: c.name || c.label,
            level: level.toUpperCase()
          });
        }
      });
    });

    return list;
  }, [settingsCertConfig, filters.level]);

  // Export Certificates Report as CSV
  const handleExportCSV = () => {
    if (!students.length) {
      toast.error('No student records to export');
      return;
    }

    const headers = [
      'Student Name',
      'Roll Number',
      'Adm No',
      'Batch',
      'Overall Certificates Status',
      ...allCertColumns.map(c => `${c.name} (${c.level})`)
    ];

    const rows = students.map(s => {
      const p = s.course_name || s.program || s.course || '';
      const courseLvl = getCourseType(p) || 'UG';
      const typeKey = courseLvl.toLowerCase();
      const activeConfig = settingsCertConfig || defaultCertificateConfig;
      const reqCerts = activeConfig[typeKey] || defaultCertificateConfig[typeKey] || [];

      const certValues = allCertColumns.map(certCol => {
        const isApplicable = reqCerts.some(c => (c.id || c.key) === certCol.key);
        if (!isApplicable) return 'N/A';

        const val = s?.[certCol.key] ?? s?.certificates?.[certCol.key];
        const isYes = val === true || val === 'Submitted' || val === 'Verified' || val === 'yes' || val === 'Yes' || val === 'Original Returned' || val === 'Originals Returned';
        return isYes ? 'Yes' : 'No';
      });

      return [
        `"${s.student_name || s.name || ''}"`,
        `"${s.pin || s.pin_no || s.roll_number || ''}"`,
        `"${s.admission_number || s.adm_no || ''}"`,
        `"${s.batch || ''}"`,
        `"${s.certificates_status || 'Pending'}"`,
        ...certValues.map(v => `"${v}"`)
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `certificates_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Certificates report downloaded');
  };

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to view Certificates Reports.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Unified Header & Filter Card */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
        {/* Top Header & Search Controls Row */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
              <FileCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Certificates Page</h1>
              <p className="text-sm text-gray-500">
                View student database and certificate submission status for all enrolled students
              </p>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full xl:w-auto justify-start xl:justify-end">
            {/* Decreased width Search Input */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search name, roll no, adm no..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-7 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={handleFetchData}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors whitespace-nowrap"
            >
              <Search size={14} />
              Fetch Data
            </button>

            <button
              onClick={() => {
                if (hasFetched) refetch();
              }}
              disabled={!hasFetched}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Download size={14} />
              Export Report
            </button>

            {(filters.college || filters.level || filters.batch || filters.course || filters.branch || filters.section || filters.certificates_status || searchTerm) && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 whitespace-nowrap"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Level Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Level</label>
            <select
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Levels</option>
              <option value="Diploma">Diploma</option>
              <option value="UG">UG</option>
              <option value="PG">PG</option>
            </select>
          </div>

          {/* College Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">College</label>
            <select
              value={filters.college}
              onChange={(e) => handleFilterChange('college', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Colleges</option>
              {filterOptions.colleges.map((c, idx) => {
                const val = getOptionValue(c);
                const label = getOptionLabel(c);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Batch Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Batch</label>
            <select
              value={filters.batch}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Batches</option>
              {filterOptions.batches.map((b, idx) => {
                const val = getOptionValue(b);
                const label = getOptionLabel(b);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Program / Course Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Program</label>
            <select
              value={filters.course}
              onChange={(e) => handleFilterChange('course', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Programs</option>
              {filterOptions.courses.map((cr, idx) => {
                const val = getOptionValue(cr);
                const label = getOptionLabel(cr);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Branch</label>
            <select
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Branches</option>
              {filterOptions.branches.map((br, idx) => {
                const val = getOptionValue(br);
                const label = getOptionLabel(br);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Section</label>
            <select
              value={filters.section}
              onChange={(e) => handleFilterChange('section', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Sections</option>
              {filterOptions.sections.map((sec, idx) => {
                const val = getOptionValue(sec);
                const label = getOptionLabel(sec);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>

          {/* Certificates Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Certificates Status</label>
            <select
              value={filters.certificates_status}
              onChange={(e) => handleFilterChange('certificates_status', e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Statuses</option>
              {CERTIFICATE_STATUS_OPTIONS.map((st, idx) => {
                const val = getOptionValue(st);
                const label = getOptionLabel(st);
                return <option key={val || idx} value={val}>{label}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Student Certificates Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {!hasFetched ? (
          <div className="text-center py-16 px-4 bg-gray-50/50">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Search size={24} />
            </div>
            <h4 className="text-base font-semibold text-gray-800 mb-1">Select Filters & Click "Fetch Data"</h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
              Select your desired filters (Level, Batch, Program, Branch, Section, Status) above and click <span className="font-semibold text-blue-700">"Fetch Data"</span> to view student certificate records.
            </p>
            <button
              onClick={handleFetchData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
            >
              <Search size={14} />
              Fetch Data Now
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="text-sm font-semibold text-gray-700">
            Total Students Found: <span className="text-blue-600 font-bold">{totalStudents}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs border border-gray-300 rounded p-1 bg-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100/70 text-gray-700 text-xs uppercase font-semibold border-b border-gray-200">
              <tr>
                <th rowSpan={2} className="py-3 px-4 whitespace-nowrap align-middle border-r border-gray-200 bg-gray-50">Student Name</th>
                <th rowSpan={2} className="py-3 px-4 whitespace-nowrap align-middle border-r border-gray-200 bg-gray-50">Roll Number</th>
                <th rowSpan={2} className="py-3 px-4 whitespace-nowrap align-middle border-r border-gray-200 bg-gray-50">Adm No</th>
                <th rowSpan={2} className="py-3 px-4 whitespace-nowrap align-middle border-r border-gray-200 bg-gray-50">Batch</th>
                <th rowSpan={2} className="py-3 px-4 whitespace-nowrap align-middle border-r border-gray-200 bg-gray-50">Overall Status</th>
                <th colSpan={allCertColumns.length || 1} className="py-2.5 px-4 text-center bg-blue-50/80 text-blue-900 font-bold text-xs uppercase tracking-wider border-b border-blue-200">
                  Certificate Breakdown
                </th>
              </tr>
              <tr>
                {allCertColumns.map((c) => (
                  <th key={c.key} className="py-2.5 px-3 text-center whitespace-nowrap min-w-[115px] bg-gray-50/80 border-r border-gray-200 last:border-r-0" title={`${c.name} (${c.level})`}>
                    <div className="font-semibold text-gray-800 text-[11px] normal-case">{c.name}</div>
                    <div className="text-[9px] text-gray-400 font-normal lowercase">{c.level}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5 + (allCertColumns.length || 1)} className="text-center py-12 text-gray-500">
                    <RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />
                    Loading student certificate records...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5 + (allCertColumns.length || 1)} className="text-center py-12 text-red-500">
                    Failed to fetch student data. Please click Refresh to try again.
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5 + (allCertColumns.length || 1)} className="text-center py-12 text-gray-500">
                    No student certificate records found matching the criteria.
                  </td>
                </tr>
              ) : (
                students.map((student, idx) => {
                  const studentName = typeof (student.student_name || student.name) === 'object'
                    ? (student.student_name?.name || student.name?.name || '—')
                    : (student.student_name || student.name || '—');
                  const rollNumber = typeof (student.pin || student.pin_no || student.roll_number) === 'object'
                    ? (student.pin?.name || student.pin_no?.name || '—')
                    : (student.pin || student.pin_no || student.roll_number || '—');
                  const admNo = typeof (student.admission_number || student.adm_no || student.admNo) === 'object'
                    ? (student.admission_number?.name || student.adm_no?.name || '—')
                    : (student.admission_number || student.adm_no || student.admNo || '—');
                  const batch = typeof student.batch === 'object' ? (student.batch?.name || '—') : (student.batch || '—');
                  const program = typeof (student.course_name || student.program || student.course) === 'object'
                    ? (student.course_name?.name || student.program?.name || student.course?.name || '—')
                    : (student.course_name || student.program || student.course || '—');
                  const certStatus = typeof student.certificates_status === 'object'
                    ? (student.certificates_status?.name || 'Pending')
                    : (student.certificates_status || 'Pending');

                  const courseLvl = getCourseType(program) || 'UG';
                  const typeKey = courseLvl.toLowerCase();
                  const activeConfig = settingsCertConfig || defaultCertificateConfig;
                  const reqCerts = activeConfig[typeKey] || defaultCertificateConfig[typeKey] || [];

                  return (
                    <tr key={student.id || idx} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 align-middle font-semibold text-gray-900 whitespace-nowrap border-r border-gray-100">
                        <button
                          onClick={() => handleViewStudent(student)}
                          className="text-left font-semibold text-blue-600 hover:text-blue-800 hover:underline focus:outline-none"
                          title="Click to view/update full details"
                        >
                          {studentName}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap border-r border-gray-100">
                        <span className="font-mono text-xs font-medium text-blue-700 bg-blue-50/50 rounded px-1.5 py-0.5 inline-block">
                          {rollNumber}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-middle text-xs text-gray-700 whitespace-nowrap border-r border-gray-100">
                        {admNo}
                      </td>
                      <td className="py-3.5 px-4 align-middle text-xs font-medium text-gray-700 whitespace-nowrap border-r border-gray-100">
                        {batch}
                      </td>
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap border-r border-gray-100">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getCertificateBadgeClass(certStatus)}`}>
                          {certStatus}
                        </span>
                      </td>
                      {allCertColumns.map((certCol) => {
                        const isApplicable = reqCerts.some((c) => (c.id || c.key) === certCol.key);

                        if (!isApplicable) {
                          return (
                            <td key={certCol.key} className="py-3.5 px-3 align-middle text-center text-xs text-gray-300 border-r border-gray-100 last:border-r-0">
                              —
                            </td>
                          );
                        }

                        const val = student?.[certCol.key] ?? student?.certificates?.[certCol.key];
                        const isYes = val === true || val === 'Submitted' || val === 'Verified' || val === 'yes' || val === 'Yes' || val === 'Original Returned' || val === 'Originals Returned';

                        return (
                          <td key={certCol.key} className="py-3.5 px-3 align-middle text-center border-r border-gray-100 last:border-r-0">
                            {isYes ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-700 border border-green-200">
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-600 border border-red-200">
                                No
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50">
            <div className="text-xs text-gray-500">
              Showing page <span className="font-semibold text-gray-900">{page}</span> of{' '}
              <span className="font-semibold text-gray-900">{totalPages}</span> ({totalStudents} total records)
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <div className="text-xs font-medium px-2 text-gray-700">
                {page} / {totalPages}
              </div>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Student Certificate Details Modal */}
      {isModalOpen && selectedStudent && (
        <StudentCertificateModal
          student={selectedStudent}
          settingsCertConfig={settingsCertConfig}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedStudent(null);
          }}
          onUpdateStatus={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
};

/* --- Sub-component: Student Certificate Modal --- */
const StudentCertificateModal = ({ student, settingsCertConfig, onClose, onUpdateStatus }) => {
  const [currentCertStatus, setCurrentCertStatus] = useState(
    typeof student?.certificates_status === 'object'
      ? (student.certificates_status?.name || 'Pending')
      : (student?.certificates_status || 'Pending')
  );
  const [updating, setUpdating] = useState(false);

  const studentName = typeof (student?.student_name || student?.name) === 'object'
    ? (student?.student_name?.name || student?.name?.name || '—')
    : (student?.student_name || student?.name || '—');
  const rollNumber = typeof (student?.pin || student?.pin_no || student?.roll_number) === 'object'
    ? (student?.pin?.name || student?.pin_no?.name || '—')
    : (student?.pin || student?.pin_no || student?.roll_number || '—');
  const admNo = typeof (student?.admission_number || student?.adm_no || student?.admNo) === 'object'
    ? (student?.admission_number?.name || student?.adm_no?.name || '—')
    : (student?.admission_number || student?.adm_no || student?.admNo || '—');
  const batch = typeof student?.batch === 'object' ? (student.batch?.name || '—') : (student?.batch || '—');
  const college = typeof (student?.college_name || student?.college) === 'object'
    ? (student?.college_name?.name || student?.college?.name || '—')
    : (student?.college_name || student?.college || '—');
  const program = typeof (student?.course_name || student?.program || student?.course) === 'object'
    ? (student?.course_name?.name || student?.program?.name || student?.course?.name || '—')
    : (student?.course_name || student?.program || student?.course || '—');
  const branch = typeof (student?.branch_name || student?.branch) === 'object'
    ? (student?.branch_name?.name || student?.branch?.name || '—')
    : (student?.branch_name || student?.branch || '—');
  const section = typeof student?.section === 'object' ? (student.section?.name || '—') : (student?.section || '—');

  // Course level resolution (Diploma, UG, PG)
  const courseLevel = useMemo(() => getCourseType(program) || 'UG', [program]);
  const typeKey = courseLevel.toLowerCase();

  // Dynamic level-based certificates list from Settings or default config
  const levelCertList = useMemo(() => {
    const activeConfig = settingsCertConfig || defaultCertificateConfig;
    const items = activeConfig[typeKey] || defaultCertificateConfig[typeKey] || [];
    return items.map(c => ({
      id: c.id || c.key,
      key: c.id || c.key,
      name: c.name || c.label,
      required: c.required !== false
    }));
  }, [settingsCertConfig, typeKey]);

  // State for individual certificate fields
  const [certFields, setCertFields] = useState(() => {
    const initial = {};
    levelCertList.forEach(cert => {
      const val = student?.[cert.key] ?? student?.certificates?.[cert.key];
      if (val === true || val === 'Submitted' || val === 'yes' || val === 'Yes') {
        initial[cert.key] = 'Submitted';
      } else if (val === 'Verified') {
        initial[cert.key] = 'Verified';
      } else if (val === 'Original Returned' || val === 'Originals Returned') {
        initial[cert.key] = 'Original Returned';
      } else if (val === 'Not Required') {
        initial[cert.key] = 'Not Required';
      } else {
        initial[cert.key] = typeof val === 'string' && val ? val : 'Pending';
      }
    });
    return initial;
  });

  const handleCertFieldChange = (certKey, value) => {
    setCertFields(prev => ({ ...prev, [certKey]: value }));
  };

  const handleSaveCertStatus = async () => {
    try {
      setUpdating(true);
      const identifier = student.admission_number || student.adm_no || student.pin || student.id;
      if (identifier) {
        const payload = {
          certificates_status: currentCertStatus,
          ...certFields
        };
        await api.put(`/students/${identifier}`, payload);
        toast.success(`Certificates updated successfully for ${studentName}`);
        if (onUpdateStatus) onUpdateStatus();
      }
    } catch (err) {
      console.warn('Failed to update cert status:', err);
      toast.error('Failed to update certificates status');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg">
              <FileCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{studentName}</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-blue-100 text-blue-800 rounded">
                  {courseLevel} Level
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Roll No: <span className="font-semibold text-blue-600">{rollNumber}</span> | Adm No: <span className="font-semibold text-gray-700">{admNo}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Overall Certificates Status Card */}
          <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
                Overall Certificates Status
              </span>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getCertificateBadgeClass(currentCertStatus)}`}>
                {currentCertStatus}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <select
                value={currentCertStatus}
                onChange={(e) => setCurrentCertStatus(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              >
                {CERTIFICATE_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <button
                onClick={handleSaveCertStatus}
                disabled={updating}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {updating ? 'Saving...' : 'Update All Changes'}
              </button>
            </div>
          </div>

          {/* Level-Based Configured Certificates List */}
          <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-blue-600" />
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  {courseLevel} Program Certificates Checklist
                </h3>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">
                Configured in Settings for {courseLevel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {levelCertList.length === 0 ? (
                <div className="col-span-2 text-center py-4 text-xs text-gray-500">
                  No certificate requirements configured for {courseLevel} program level.
                </div>
              ) : (
                levelCertList.map((cert) => {
                  const val = certFields[cert.key] || 'Pending';

                  return (
                    <div
                      key={cert.key}
                      className="p-3 bg-white rounded-lg border border-gray-200 shadow-2xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-800 leading-snug">
                          {cert.name}
                        </span>
                        {cert.required ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 shrink-0">
                            Required
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                            Optional
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={val}
                          onChange={(e) => handleCertFieldChange(cert.key, e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded p-1.5 bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Submitted">Submitted</option>
                          <option value="Verified">Verified</option>
                          <option value="Original Returned">Original Returned</option>
                          <option value="Not Required">Not Required</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Academic & Institution Details */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Academic & Institution Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Batch</span>
                <span className="font-semibold text-gray-800">{batch}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">College</span>
                <span className="font-semibold text-gray-800">{college}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Program</span>
                <span className="font-semibold text-gray-800">{program} ({courseLevel})</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Branch</span>
                <span className="font-semibold text-gray-800">{branch}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Section</span>
                <span className="font-semibold text-gray-800">{section}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Year / Semester</span>
                <span className="font-semibold text-gray-800">
                  Year {student?.current_year || 1} - Sem {student?.current_semester || 1}
                </span>
              </div>
            </div>
          </div>

          {/* Personal & Contact Details */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Student Contact & Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Student Mobile</span>
                <span className="font-medium text-gray-800">{student?.student_mobile || student?.mobile || '—'}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Parent Mobile</span>
                <span className="font-medium text-gray-800">{student?.parent_mobile1 || student?.parent_mobile || '—'}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block mb-1">Father Name</span>
                <span className="font-medium text-gray-800">{student?.father_name || '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSaveCertStatus}
            disabled={updating}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {updating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CertificatesReport;

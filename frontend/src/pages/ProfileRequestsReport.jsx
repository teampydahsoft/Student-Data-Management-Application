import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Clock3, Download, FileText, Lock, RefreshCw, Search, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

const EMPTY_FILTERS = {
  status: 'all',
  college: '',
  batch: '',
  course: '',
  branch: '',
  year: '',
  semester: '',
  search: ''
};

const ProfileRequestsReport = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const hasAccess = useMemo(() => {
    if (!user) return false;
    return isFullAccessRole(user.role) ||
      hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_profile_reports');
  }, [user]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: []
  });
  const [requests, setRequests] = useState([]);
  const [completionSummary, setCompletionSummary] = useState({ total: 0, completed: 0, pending: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const buildFilterParams = (currentFilters) => {
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, value);
    });
    return params;
  };

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      try {
        const response = await api.get('/students/quick-filters?applyExclusions=true');
        if (active && response.data?.success) {
          setOptions(response.data.data || {});
        }
      } catch (error) {
        console.error('Failed to load profile request report filters:', error);
        toast.error('Failed to load report filter options');
      }
    };
    loadOptions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = buildFilterParams(filters);
        params.set('page', String(pagination.page));
        params.set('pageSize', String(pagination.pageSize));
        const response = await api.get(`/profile-changes/report?${params.toString()}`);
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Failed to load student profiles');
        }
        if (active) {
          setRequests(Array.isArray(response.data.data) ? response.data.data : []);
          setCompletionSummary(response.data.summary || { total: 0, completed: 0, pending: 0 });
          setPagination(previous => ({
            ...previous,
            ...(response.data.pagination || {})
          }));
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load profile completion report:', error);
          toast.error(error.response?.data?.message || error.message || 'Failed to load profile completion report');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, filters.search ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, pagination.page, pagination.pageSize]);

  const courses = useMemo(() => {
    const names = (options.courses || []).map(item => item.name || item).filter(Boolean);
    return [...new Set(names)].sort();
  }, [options.courses]);
  const branches = useMemo(() => {
    const names = (options.branches || []).map(item => item.name || item).filter(Boolean);
    return [...new Set(names)].sort();
  }, [options.branches]);

  const totals = useMemo(() => ({
    total: completionSummary.total,
    completed: completionSummary.completed,
    pending: completionSummary.pending
  }), [completionSummary]);

  const updateFilter = (key, value) => {
    setFilters(previous => ({
      ...previous,
      [key]: value,
      ...(key === 'course' ? { branch: '' } : {})
    }));
    setPagination(previous => ({ ...previous, page: 1 }));
  };

  const handleDownload = async (format) => {
    setDownloading(true);
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const downloadToast = toast.loading(`Preparing profile report ${formatLabel}...`);
    try {
      const params = buildFilterParams(filters);
      params.set('pageSize', 'all');
      const response = await api.get(`/profile-changes/report?${params.toString()}`);
      if (!response.data?.success || !Array.isArray(response.data.data)) {
        throw new Error(response.data?.message || 'Failed to load filtered student profiles');
      }
      const summary = response.data.summary || { total: 0, completed: 0, pending: 0 };

      const rows = response.data.data.map(student => ({
          'Student Name': student.student_name || '',
          'Admission Number': student.admission_number || '',
          College: student.college || '',
          Batch: student.batch || '',
          Program: student.course || '',
          Branch: student.branch || '',
          Year: student.current_year || '',
          Semester: student.current_semester || '',
          'Profile Status': student.profile_status === 'completed' ? 'Completed' : 'Pending',
          'Completion Percentage': `${student.completion_percentage}%`,
          'Pending Fields': (student.pending_fields || []).join(', ')
        }));

      const date = new Date().toISOString().slice(0, 10);
      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const columns = [
          { key: 'Student Name', label: 'Student', width: 30 },
          { key: 'Admission Number', label: 'Admission No.', width: 27 },
          { key: 'College', label: 'College', width: 32 },
          { key: 'Batch', label: 'Batch', width: 18 },
          { key: 'Program', label: 'Program', width: 28 },
          { key: 'Branch', label: 'Branch', width: 30 },
          { key: 'Year', label: 'Year', width: 11 },
          { key: 'Semester', label: 'Sem.', width: 11 },
          { key: 'Profile Status', label: 'Profile Status', width: 20 },
          { key: 'Completion Percentage', label: 'Complete %', width: 17 },
          { key: 'Pending Fields', label: 'Pending Fields', width: 55 }
        ];
        const margin = 8;
        const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const left = Math.max(margin, (pageWidth - tableWidth) / 2);
        const rowLineHeight = 3.2;
        let y = 18;

        const drawHeader = () => {
          doc.setFontSize(13);
          doc.setFont(undefined, 'bold');
          doc.text('Profile Reports', left, 9);
          doc.setFontSize(7);
          doc.setFont(undefined, 'normal');
          doc.text(
            `Students: ${summary.total} | Completed: ${summary.completed} | Pending: ${summary.pending} | Generated: ${date}`,
            left,
            14
          );
          let x = left;
          doc.setFillColor(238, 242, 247);
          doc.rect(left, y, tableWidth, 8, 'F');
          doc.setFont(undefined, 'bold');
          columns.forEach(column => {
            doc.text(column.label, x + 1, y + 5.2, { maxWidth: column.width - 2 });
            x += column.width;
          });
          doc.setFont(undefined, 'normal');
          y += 8;
        };

        drawHeader();
        doc.setFontSize(6.5);
        rows.forEach(row => {
          const cellLines = columns.map(column => {
            const value = String(row[column.key] ?? '').replace(/\s+/g, ' ').trim();
            return doc.splitTextToSize(value || '—', column.width - 2);
          });
          const rowHeight = Math.max(6, ...cellLines.map(lines => lines.length * rowLineHeight + 2));
          if (y + rowHeight > pageHeight - margin) {
            doc.addPage();
            y = 18;
            drawHeader();
          }

          let x = left;
          cellLines.forEach((lines, index) => {
            doc.text(lines, x + 1, y + 3.5, { maxWidth: columns[index].width - 2 });
            x += columns[index].width;
          });
          doc.setDrawColor(220, 224, 230);
          doc.line(left, y + rowHeight, left + tableWidth, y + rowHeight);
          y += rowHeight;
        });
        doc.save(`profile_report_${date}.pdf`);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [
          { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 24 },
          { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 16 },
          { wch: 60 }
        ];
        const workbook = XLSX.utils.book_new();
        const summaryWorksheet = XLSX.utils.aoa_to_sheet([
          ['Profile Completion Summary'],
          ['Total Students', summary.total],
          ['Completed Profiles', summary.completed],
          ['Pending Profiles', summary.pending]
        ]);
        XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Profile Report');
        XLSX.writeFile(workbook, `profile_report_${date}.xlsx`);
      }
      toast.success(`${formatLabel} downloaded with ${rows.length} filtered students`, { id: downloadToast });
    } catch (error) {
      console.error(`Failed to download profile report ${formatLabel}:`, error);
      toast.error(error.response?.data?.message || error.message || `Failed to download profile report ${formatLabel}`, { id: downloadToast });
    } finally {
      setDownloading(false);
    }
  };

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">You do not have permission to view student profile reports.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 h-full min-h-0">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 heading-font">Profile Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Track student profile completion and fields that still need attention.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to Reports
          </button>
          <button
            type="button"
            onClick={() => handleDownload('excel')}
            disabled={downloading || loading}
            className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-green-500 text-green-700 hover:bg-green-50 text-sm font-medium disabled:opacity-50"
          >
            {downloading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            Download Excel
          </button>
          <button
            type="button"
            onClick={() => handleDownload('pdf')}
            disabled={downloading || loading}
            className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium disabled:opacity-50"
          >
            {downloading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters({ ...EMPTY_FILTERS });
              setPagination(previous => ({ ...previous, page: 1 }));
            }}
            className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            <RefreshCw size={16} />
            Clear Filters
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Total Students', value: totals.total, icon: FileText, cardClass: 'bg-blue-50 border-blue-100', labelClass: 'text-blue-700', valueClass: 'text-blue-900' },
          { label: 'Completed Profiles', value: totals.completed, icon: CheckCircle, cardClass: 'bg-green-50 border-green-100', labelClass: 'text-green-700', valueClass: 'text-green-900' },
          { label: 'Pending Profiles', value: totals.pending, icon: Clock3, cardClass: 'bg-amber-50 border-amber-100', labelClass: 'text-amber-700', valueClass: 'text-amber-900' }
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.cardClass}`}>
            <div className={`flex items-center gap-2 text-sm font-medium ${card.labelClass}`}>
              <card.icon size={17} />
              {card.label}
            </div>
            <div className={`mt-2 text-2xl font-bold ${card.valueClass}`}>{card.value}</div>
          </div>
        ))}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={filters.search}
              onChange={event => updateFilter('search', event.target.value)}
              placeholder="Search name, admission no..."
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <select value={filters.status} onChange={event => updateFilter('status', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All Profile Statuses</option>
            <option value="pending">Pending Profile</option>
            <option value="completed">Completed Profile</option>
          </select>
          <select value={filters.college} onChange={event => updateFilter('college', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Colleges</option>
            {(options.colleges || []).map(item => (
              <option key={item.id || item.name || item} value={item.id || item.name || item}>{item.name || item}</option>
            ))}
          </select>
          <select value={filters.batch} onChange={event => updateFilter('batch', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Batches</option>
            {(options.batches || []).map(item => (
              <option key={item.id || item.name || item} value={item.id || item.name || item}>{item.name || item}</option>
            ))}
          </select>
          <select value={filters.course} onChange={event => updateFilter('course', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Programs</option>
            {courses.map(course => <option key={course} value={course}>{course}</option>)}
          </select>
          <select value={filters.branch} onChange={event => updateFilter('branch', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Branches</option>
            {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select>
          <select value={filters.year} onChange={event => updateFilter('year', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Years</option>
            {(options.years || []).map(year => <option key={year} value={year}>Year {year}</option>)}
          </select>
          <select value={filters.semester} onChange={event => updateFilter('semester', event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Semesters</option>
            {(options.semesters || []).map(semester => <option key={semester} value={semester}>Semester {semester}</option>)}
          </select>
        </div>
      </section>

      <section className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-xl">
        {loading ? (
          <div className="h-48 flex items-center justify-center gap-2 text-gray-500">
            <RefreshCw className="animate-spin" size={18} />
            Loading student profiles...
          </div>
        ) : requests.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-gray-500">
            <AlertCircle size={28} />
            <p>No students match the selected filters.</p>
          </div>
        ) : (
          <table className="w-full min-w-[1200px] text-sm text-left">
            <thead className="sticky top-0 bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                {['Student', 'Admission No.', 'College', 'Batch', 'Program / Branch', 'Year / Semester', 'Profile Status', 'Completion', 'Pending Fields'].map(column => (
                  <th key={column} className="px-4 py-3 font-semibold whitespace-nowrap">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(student => {
                const statusStyle = student.profile_status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700';
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{student.student_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{student.admission_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{student.college || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{student.batch || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{[student.course, student.branch].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{[student.current_year && `Year ${student.current_year}`, student.current_semester && `Sem ${student.current_semester}`].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle}`}>
                        {student.profile_status === 'completed' ? 'Completed' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{student.completion_percentage}%</td>
                    <td className="px-4 py-3 text-gray-600">
                      {(student.pending_fields || []).join(', ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pagination.pageSize}
            onChange={event => setPagination(previous => ({
              ...previous,
              page: 1,
              pageSize: Number(event.target.value)
            }))}
            className="rounded-lg border border-gray-300 px-2 py-1.5"
          >
            {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>
            {pagination.total === 0
              ? '0 students'
              : `${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} students`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagination(previous => ({ ...previous, page: Math.max(1, previous.page - 1) }))}
            disabled={loading || pagination.page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
          <button
            type="button"
            onClick={() => setPagination(previous => ({ ...previous, page: Math.min(previous.totalPages, previous.page + 1) }))}
            disabled={loading || pagination.page >= pagination.totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileRequestsReport;

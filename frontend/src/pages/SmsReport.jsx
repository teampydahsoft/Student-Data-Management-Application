import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Wallet,
  AlertCircle,
  Lock,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

function SmsReport() {
  const { user } = useAuthStore();

  // Permission check
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;

    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_sms_reports');
  }, [user]);

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to view SMS Reports.
        </p>
      </div>
    );
  }
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    category: '',
    status: ''
  });
  const [report, setReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const buildParams = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return params;
  }, [filters]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ date_from: '', date_to: '', category: '', status: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/students/reports/sms?${buildParams().toString()}`);
        if (res.data?.success) setReport(res.data.data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load SMS report');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [buildParams, refreshKey]);

  useEffect(() => {
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const params = buildParams({ page: pagination.page, limit: pagination.limit });
        const res = await api.get(`/students/reports/sms/logs?${params.toString()}`);
        if (res.data?.success) {
          setLogs(res.data.data || []);
          setPagination((prev) => ({ ...prev, ...res.data.pagination }));
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load SMS logs');
      } finally {
        setLogsLoading(false);
      }
    };
    fetchLogs();
  }, [buildParams, refreshKey, pagination.page, pagination.limit]);

  const chartData = useMemo(() => {
    if (!report?.byDate?.length) return [];
    return [...report.byDate].reverse().map((row) => ({
      date: row.date
        ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : '',
      Sent: row.sent,
      Failed: row.failed
    }));
  }, [report?.byDate]);

  const summary = report?.summary || { total: 0, sent: 0, failed: 0, other: 0 };
  const balance = report?.accountBalance;
  const categories = report?.categories || [];

  const formatCredits = () => {
    if (!balance) return '\u2014';
    if (balance.testMode) return 'Test mode';
    if (balance.success && balance.credits != null) {
      return Number(balance.credits).toLocaleString('en-IN');
    }
    return 'Unavailable';
  };

  const hasActiveFilters = filters.date_from || filters.date_to || filters.category || filters.status;

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-4">
      {/* Page header */}
      <header className="flex-shrink-0 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
            <MessageSquare size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">SMS Reports</h1>
            <p className="text-sm text-gray-500">Track sent messages and account SMS credits</p>
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
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <Wallet size={18} />
            <span className="text-xs font-semibold uppercase">Account Credits</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCredits()}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <CheckCircle2 size={18} />
            <span className="text-xs font-semibold uppercase">Sent</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.sent}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <XCircle size={18} />
            <span className="text-xs font-semibold uppercase">Failed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <MessageSquare size={18} />
            <span className="text-xs font-semibold uppercase">Total Logged</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
      </section>

      <section className="flex-shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Filter size={16} />
          Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input type="date" value={filters.date_from} onChange={(e) => handleFilterChange('date_from', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input type="date" value={filters.date_to} onChange={(e) => handleFilterChange('date_to', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All Categories</option>
              {categories.map((cat) => (<option key={cat} value={cat.id || cat}>{cat.name || cat}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All Statuses</option>
              <option value="Sent">Sent</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="mt-3 text-sm text-red-600 hover:underline">Clear filters</button>
        )}
      </section>

      <section className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b font-semibold text-gray-800">Recent SMS Activity</div>
        <div className="flex-1 overflow-auto">
          {logsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center py-12 text-gray-500">No SMS logs found for the selected filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 text-gray-600"><tr>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Mobile</th>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Message</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{log.status}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{log.sent_at ? new Date(log.sent_at).toLocaleString('en-IN') : '-'}</td>
                    <td className="px-4 py-2">{log.category || 'General'}</td>
                    <td className="px-4 py-2">{log.mobile_number}</td>
                    <td className="px-4 py-2">{log.student_name || log.admission_number || '-'}</td>
                    <td className="px-4 py-2 max-w-md truncate" title={log.message}>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
            <div className="flex gap-2">
              <button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="p-2 border rounded disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="p-2 border rounded disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default SmsReport;

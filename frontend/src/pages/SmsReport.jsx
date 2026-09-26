import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Wallet,
  Lock,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function SmsReport() {
  const { user } = useAuthStore();
  const todayStr = useMemo(() => getTodayDateString(), []);

  // Permission check
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, 'view_sms_reports');
  }, [user]);

  const [filters, setFilters] = useState({
    date_from: todayStr,
    date_to: todayStr,
    category: '',
    status: ''
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
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
    if (selectedTemplateId) params.append('template_id', selectedTemplateId);
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return params;
  }, [filters, selectedTemplateId]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    if (field === 'category') {
      setSelectedTemplateId('');
    }
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ date_from: '', date_to: '', category: '', status: '' });
    setSelectedTemplateId('');
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

  const summary = report?.summary || { total: 0, sent: 0, failed: 0, other: 0 };
  const balance = report?.accountBalance;
  const categories = report?.categories || [];
  const templates = report?.templates || [];

  const categoryCountMap = useMemo(() => {
    const map = {};
    (report?.byCategory || []).forEach((c) => {
      const catName = c.category === 'SMS Template' ? 'General' : c.category;
      map[catName] = (map[catName] || 0) + c.sent;
    });
    return map;
  }, [report?.byCategory]);

  const allCategoryNames = useMemo(() => {
    const set = new Set();
    categories.forEach((cat) => {
      if (cat) {
        const catName = (typeof cat === 'object' ? cat.name || cat.id : cat);
        set.add(catName === 'SMS Template' ? 'General' : catName);
      }
    });
    (report?.byCategory || []).forEach((c) => {
      if (c.category) {
        set.add(c.category === 'SMS Template' ? 'General' : c.category);
      }
    });
    return Array.from(set).sort();
  }, [categories, report?.byCategory]);

  const totalAllSentCount = useMemo(() => {
    return Object.values(categoryCountMap).reduce((sum, val) => sum + Number(val || 0), 0);
  }, [categoryCountMap]);

  const totalTemplateSentCount = useMemo(() => {
    return templates.reduce((acc, t) => acc + (t.sent_count || 0), 0);
  }, [templates]);

  const formatCredits = () => {
    if (!balance) return '—';
    if (balance.testMode) return 'Test mode';
    if (balance.success && balance.credits != null) {
      return Number(balance.credits).toLocaleString('en-IN');
    }
    return 'Unavailable';
  };

  const hasActiveFilters = filters.category || filters.status || selectedTemplateId || filters.date_from || filters.date_to;

  const getCategoryDisplayName = (log) => {
    if (log.category === 'SMS Template' || !log.category) {
      return 'General';
    }
    return log.category;
  };

  const getTemplateName = (log) => {
    if (log.template_id) {
      const found = templates.find((t) => String(t.template_id) === String(log.template_id));
      if (found?.name) return found.name;
    }
    const matched = templates.find((t) => {
      if (!t.content) return false;
      const parts = t.content.split(/\{#var#\}|\{\{.*?\}\}/);
      const snippet = (parts.find((p) => p.trim().length >= 8) || parts[0] || '').trim();
      return snippet && log.message && log.message.includes(snippet);
    });
    if (matched?.name) return matched.name;
    return '-';
  };

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-3">
          <Lock className="text-red-500" size={28} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Access Denied</h2>
        <p className="text-gray-600 text-xs max-w-sm">
          You do not have permission to view SMS Reports.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3">
      {/* Compact Page header */}
      <header className="shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-blue-100 p-1.5 text-blue-600">
            <MessageSquare size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">SMS Reports</h1>
            <p className="text-xs text-gray-500 leading-tight">Track sent messages and account SMS credits</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold disabled:opacity-50 transition-all shadow-2xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Compact Summary Cards */}
      <section className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-xl border border-blue-100 shadow-2xs p-3">
          <div className="flex items-center gap-1.5 text-blue-600 mb-1">
            <Wallet size={15} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Account Credits</span>
          </div>
          <p className="text-xl font-black text-gray-900">{formatCredits()}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 shadow-2xs p-3">
          <div className="flex items-center gap-1.5 text-green-600 mb-1">
            <CheckCircle2 size={15} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Sent</span>
          </div>
          <p className="text-xl font-black text-gray-900">{summary.sent}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 shadow-2xs p-3">
          <div className="flex items-center gap-1.5 text-red-600 mb-1">
            <XCircle size={15} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Failed</span>
          </div>
          <p className="text-xl font-black text-gray-900">{summary.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-3">
          <div className="flex items-center gap-1.5 text-gray-600 mb-1">
            <MessageSquare size={15} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Logged</span>
          </div>
          <p className="text-xl font-black text-gray-900">{summary.total}</p>
        </div>
      </section>

      {/* Main Table Container with Header Controls */}
      <section className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden flex flex-col">
        {/* Top Control Bar with Categories & Sub-filters */}
        <div className="px-3.5 py-2.5 bg-gray-50/80 border-b border-gray-200 flex flex-col gap-2 shrink-0">
          {/* Row 1: Activity Title & Compact Filters (Date From, Date To, Status) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Recent SMS Activity</h2>
            </div>

            {/* Compact Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-2 py-1 shadow-2xs">
                <span className="text-gray-500 font-semibold text-[11px]">From:</span>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className="border-none p-0 text-xs focus:ring-0 text-gray-700 bg-transparent font-medium"
                />
              </div>

              <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-2 py-1 shadow-2xs">
                <span className="text-gray-500 font-semibold text-[11px]">To:</span>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className="border-none p-0 text-xs focus:ring-0 text-gray-700 bg-transparent font-medium"
                />
              </div>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700 font-medium focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value="">All Statuses</option>
                <option value="Sent">Sent</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Row 2: Category Pills Row with Individual Sent Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full no-scrollbar">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider shrink-0 mr-1">Category:</span>
            <button
              type="button"
              onClick={() => handleFilterChange('category', '')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                !filters.category
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              All ({totalAllSentCount})
            </button>
            {allCategoryNames.map((catName) => {
              const count = categoryCountMap[catName] || 0;
              const isSelected = filters.category === catName;
              return (
                <button
                  key={catName}
                  type="button"
                  onClick={() => handleFilterChange('category', catName)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {catName} ({count})
                </button>
              );
            })}
          </div>

          {/* Row 3: Sub-filters Row for Templates (Visible when General category is selected or a template filter is active) */}
          {(filters.category === 'General' || selectedTemplateId) && templates.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full pt-1.5 border-t border-gray-200/60 no-scrollbar">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider shrink-0 mr-1">Templates:</span>
              <button
                type="button"
                onClick={() => handleTemplateSelect('')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                  !selectedTemplateId
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                All Templates ({totalTemplateSentCount})
              </button>
              {templates.map((tpl) => (
                <button
                  key={tpl.id || tpl.template_id}
                  type="button"
                  onClick={() => handleTemplateSelect(tpl.template_id)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                    selectedTemplateId === tpl.template_id
                      ? 'bg-blue-700 text-white shadow-2xs'
                      : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                  }`}
                  title={tpl.content}
                >
                  {tpl.name} ({tpl.sent_count || 0})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SMS Logs Table */}
        <div className="flex-1 overflow-auto">
          {logsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center py-12 text-xs text-gray-500">No SMS logs found for the selected filters.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 text-gray-600 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Template Name</th>
                  <th className="px-3 py-2 text-left">Mobile</th>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'Sent' || log.status === 'Delivered'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{log.sent_at ? new Date(log.sent_at).toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{getCategoryDisplayName(log)}</td>
                    <td className="px-3 py-2 font-semibold text-blue-700">{getTemplateName(log)}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{log.mobile_number}</td>
                    <td className="px-3 py-2 text-gray-900">{log.student_name || log.admission_number || '-'}</td>
                    <td className="px-3 py-2 max-w-md truncate text-gray-600" title={log.message}>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-between items-center px-3.5 py-2 border-t border-gray-100 bg-gray-50/50 shrink-0">
            <span className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="p-1 border border-gray-300 rounded-md hover:bg-white disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="p-1 border border-gray-300 rounded-md hover:bg-white disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default SmsReport;

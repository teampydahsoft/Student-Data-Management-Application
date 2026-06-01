import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart2,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { RiBookOpenLine } from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../config/api';
import useAuthStore from '../../store/authStore';
import { SkeletonBox } from '../../components/SkeletonLoader';

/** Prefer server-formatted IST string from API; fallback to ISO / test name date. */
function formatSubmitted(row) {
  if (row?.submitted_at_display && row.submitted_at_display !== '—') {
    return row.submitted_at_display;
  }
  if (row?.submitted_date && row?.submitted_time) {
    return `${row.submitted_date}, ${row.submitted_time}`;
  }
  if (row?.submitted_date) return row.submitted_date;

  const raw = row?.submitted_at;
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function formatSubmittedShort(row) {
  if (row?.submitted_date) return row.submitted_date;
  const full = formatSubmitted(row);
  if (full === '—') return '—';
  return full.split(',')[0].trim();
}

function formatScore(row) {
  if (row.score !== null && row.score !== undefined) return `${Math.round(row.score)}%`;
  return '—';
}

function scoreTone(score) {
  if (score === null || score === undefined) return 'slate';
  if (score >= 75) return 'emerald';
  if (score >= 50) return 'amber';
  return 'rose';
}

const toneClasses = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
  slate: 'bg-slate-50 text-slate-600 border-slate-100',
};

function TestResultDetailView({
  detail,
  loading,
  onBack,
  formatSubmitted,
  formatScore,
  scoreTone,
  toneClasses,
}) {
  const questions = detail?.results || [];
  const correctCount = questions.filter((q) => q.is_correct === true).length;
  const incorrectCount = questions.filter((q) => q.is_correct === false).length;

  return (
    <div className="w-full max-w-none space-y-5 sm:space-y-6 animate-fade-in-up pb-8 lg:pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to all tests
      </button>

      <div className="bg-white rounded-[1.75rem] border border-slate-100 shadow-lg shadow-slate-200/40 p-5 sm:p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">
              Test result review
            </p>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
              {detail?.test_name || 'Test'}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              <span className="font-semibold text-slate-700">{detail?.module_id || '—'}</span>
              {detail?.test_type && (
                <span className="text-slate-400"> · {detail.test_type}</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Submitted: {formatSubmitted(detail)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 text-base font-black px-4 py-2 rounded-xl border ${toneClasses[scoreTone(detail?.score)]}`}
            >
              <Award size={18} />
              {formatScore(detail)}
            </span>
            {detail?.correct_answers != null && (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                <BarChart2 size={16} />
                {detail.correct_answers}/{detail.total_questions} correct
              </span>
            )}
          </div>
        </div>

        {!loading && questions.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
              <p className="text-lg font-black text-slate-900">{questions.length}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Correct</p>
              <p className="text-lg font-black text-emerald-700">{correctCount}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Incorrect</p>
              <p className="text-lg font-black text-rose-700">{incorrectCount}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[1.75rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
            Question-wise answers
          </h2>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-slate-500 text-sm">No question-level details for this attempt.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <article
                  key={q.question_id || `q-${i}`}
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    q.is_correct === true
                      ? 'border-emerald-100 bg-emerald-50/40'
                      : q.is_correct === false
                        ? 'border-rose-100 bg-rose-50/40'
                        : 'border-slate-100 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <span className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-sm font-black text-slate-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed">
                        {q.question || q.question_id || 'Question'}
                      </p>
                      {q.question_type && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                          {q.question_type}
                        </p>
                      )}
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl p-4 border border-slate-100">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Your answer
                          </p>
                          <p className="font-bold text-slate-800 mt-2 text-sm break-words">
                            {formatAnswer(q.student_answer)}
                          </p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-slate-100">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Correct answer
                          </p>
                          <p className="font-bold text-slate-800 mt-2 text-sm break-words">
                            {formatAnswer(q.correct_answer)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        {q.is_correct === true ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/80 px-3 py-1 rounded-lg">
                            <CheckCircle2 size={16} /> Correct
                          </span>
                        ) : q.is_correct === false ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-rose-700 bg-rose-100/80 px-3 py-1 rounded-lg">
                            <XCircle size={16} /> Incorrect
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 font-medium">Not graded</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50"
        >
          <ArrowLeft size={18} />
          Back to all tests
        </button>
      </div>
    </div>
  );
}

function formatAnswer(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function TestResultCard({ row, onOpen, formatSubmitted, formatScore, scoreTone, toneClasses }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left bg-white rounded-[1.5rem] p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all active:scale-[0.995] w-full h-full flex flex-col"
    >
      <div className="flex items-start gap-3 mb-2">
        <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 flex-1 min-w-0">
          {row.test_name || 'Test'}
        </h3>
        <span
          className={`shrink-0 text-xs sm:text-sm font-black px-2.5 py-1 rounded-lg border ${toneClasses[scoreTone(row.score)]}`}
        >
          {formatScore(row)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
          {row.module_id || '—'}
        </span>
        {row.test_type && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {row.test_type}
          </span>
        )}
      </div>
      <div className="mt-auto pt-3 border-t border-slate-50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="font-medium">{formatSubmitted(row)}</span>
        {row.correct_answers != null && (
          <span className="font-semibold text-slate-600">
            {row.correct_answers}/{row.total_questions} correct
          </span>
        )}
      </div>
    </button>
  );
}

const pendingStatusTone = {
  scheduled: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  available: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  assigned: 'bg-sky-50 text-sky-800 border-sky-200',
  started: 'bg-amber-50 text-amber-800 border-amber-200',
};

function pendingTone(row) {
  const key = String(row.availability || row.status || 'pending').toLowerCase().replace(/\s/g, '_');
  return pendingStatusTone[key] || pendingStatusTone.pending;
}

function pendingHint(row) {
  if (row.can_resume) return 'Resume in the CRT training app';
  if (row.availability === 'scheduled') return 'Opens at the scheduled time in the CRT app';
  if (row.availability === 'available') return 'Available now — open the CRT training app';
  return 'Open the CRT training app to begin';
}

function PendingTestCard({ row }) {
  return (
    <div className="bg-white rounded-[1.5rem] p-4 sm:p-5 border border-amber-100 shadow-sm w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 flex-1 min-w-0">
          {row.test_name || 'CRT test'}
        </h3>
        <span
          className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${pendingTone(row)}`}
        >
          {row.status_label || 'Pending'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
          {row.module_id || '—'}
        </span>
        {row.test_type && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {row.test_type}
          </span>
        )}
      </div>
      <div className="mt-auto pt-3 border-t border-amber-50/80 space-y-1 text-xs text-slate-500">
        {row.scheduled_at_display && (
          <p className="font-semibold text-indigo-700/90">Starts: {row.scheduled_at_display}</p>
        )}
        {row.due_at_display && (
          <p className="font-semibold text-rose-600/90">Due: {row.due_at_display}</p>
        )}
        {row.start_at_display && (
          <p className="font-medium">Started: {row.start_at_display}</p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-1">
          {pendingHint(row)}
        </p>
      </div>
    </div>
  );
}

const VersantTests = () => {
  const { user } = useAuthStore();
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [linkInfo, setLinkInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ testType: '', moduleId: '' });
  const [filterOptions, setFilterOptions] = useState({ modules: [], testTypes: [] });
  const [view, setView] = useState('list');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const buildParams = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams();
      if (filters.testType) params.set('testType', filters.testType);
      if (filters.moduleId) params.set('moduleId', filters.moduleId);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, v);
      });
      return params;
    },
    [filters, pagination.page, pagination.limit],
  );

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/versant/test-results/me?${buildParams().toString()}`);
      if (res.data?.success) {
        setResults(res.data.data || []);
        setPending(res.data.pending || []);
        setPagination((prev) => ({ ...prev, ...(res.data.pagination || {}) }));
        setLinkInfo({
          linked: res.data.linked,
          sdms: res.data.sdms,
          versantMatch: res.data.versantMatch,
        });
        setMessage(res.data.message || '');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load CRT test results');
      setResults([]);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    const modules = [
      ...new Set([...results, ...pending].map((r) => r.module_id).filter(Boolean)),
    ].sort();
    const testTypes = [
      ...new Set([...results, ...pending].map((r) => r.test_type).filter(Boolean)),
    ].sort();
    setFilterOptions({ modules, testTypes });
  }, [results, pending]);

  const filteredPending = useMemo(() => {
    return pending.filter((p) => {
      if (filters.testType && p.test_type !== filters.testType) return false;
      if (filters.moduleId && p.module_id !== filters.moduleId) return false;
      return true;
    });
  }, [pending, filters.testType, filters.moduleId]);

  const stats = useMemo(() => {
    const scored = results.filter((r) => r.score != null);
    const avg =
      scored.length > 0
        ? scored.reduce((sum, r) => sum + Number(r.score), 0) / scored.length
        : null;
    const latest = results[0];
    return {
      total: pagination.total || results.length,
      pendingCount: filteredPending.length,
      average: avg,
      latestModule: latest?.module_id || '—',
      latestScore: latest?.score ?? null,
      latestDate: latest ? formatSubmittedShort(latest) : '—',
    };
  }, [results, pagination.total, filteredPending.length]);

  const openDetail = async (row) => {
    setView('detail');
    setDetailLoading(true);
    setDetail(row);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const params = new URLSearchParams();
      if (row.source) params.set('source', row.source);
      const res = await api.get(
        `/versant/test-results/me/${row.id}?${params.toString()}`,
      );
      if (res.data?.success) {
        setDetail(res.data.data);
      } else {
        toast.error('Could not load test details');
        setView('list');
        setDetail(null);
      }
    } catch {
      toast.error('Could not load question details');
      setView('list');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setView('list');
    setDetail(null);
    setDetailLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (view === 'detail' && detail) {
    return (
      <TestResultDetailView
        detail={detail}
        loading={detailLoading}
        onBack={closeDetail}
        formatSubmitted={formatSubmitted}
        formatScore={formatScore}
        scoreTone={scoreTone}
        toneClasses={toneClasses}
      />
    );
  }

  if (loading && !linkInfo) {
    return (
      <div className="w-full max-w-none space-y-6 animate-pulse pb-10">
        <SkeletonBox className="h-24 w-full rounded-[2rem]" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonBox className="h-28 rounded-[2rem]" />
          <SkeletonBox className="h-28 rounded-[2rem]" />
          <SkeletonBox className="h-28 rounded-[2rem]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <SkeletonBox className="h-36 rounded-[1.5rem]" />
          <SkeletonBox className="h-36 rounded-[1.5rem]" />
          <SkeletonBox className="h-36 rounded-[1.5rem]" />
          <SkeletonBox className="h-36 rounded-[1.5rem] hidden 2xl:block" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-5 sm:space-y-6 animate-fade-in-up pb-8 lg:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 shrink-0">
              <RiBookOpenLine size={26} />
            </div>
            <span>CRT Tests</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] flex items-center gap-2 sm:ml-[3.25rem]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
            Campus recruitment training scores & practice
          </p>
        </div>
        {linkInfo?.linked && (
          <button
            type="button"
            onClick={() => fetchResults()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all shrink-0"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {linkInfo && !linkInfo.linked && (
        <div className="bg-white rounded-[2rem] p-8 shadow-xl shadow-slate-200/50 border border-amber-100 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h3 className="text-lg font-black text-slate-900">No CRT scores found yet</h3>
          <p className="text-slate-500 mt-2 max-w-md mx-auto text-sm leading-relaxed">
            {message ||
              'We could not match your portal account to CRT training records. Your PIN or roll number in the student database should match your CRT login.'}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-4">
            PIN: {linkInfo.sdms?.pin_no || user?.username || '—'} · Admission:{' '}
            {linkInfo.sdms?.admission_number || user?.admission_number || '—'}
          </p>
        </div>
      )}

      {linkInfo?.linked && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 sm:p-6 rounded-[1.75rem] shadow-lg shadow-amber-200/30 border border-amber-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Pending tests
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tighter">
                {stats.pendingCount}
              </h3>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-[1.75rem] shadow-lg shadow-slate-200/40 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Tests completed
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-indigo-600 tracking-tighter">
                {stats.total}
              </h3>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-[1.75rem] shadow-lg shadow-slate-200/40 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Average score
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tighter">
                {stats.average != null ? `${Math.round(stats.average)}%` : '—'}
              </h3>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-[1.75rem] shadow-lg shadow-slate-200/40 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Latest module
              </p>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                {stats.latestModule}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {stats.latestScore != null && (
                  <span
                    className={`inline-flex text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${toneClasses[scoreTone(stats.latestScore)]}`}
                  >
                    {Math.round(stats.latestScore)}%
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400">{stats.latestDate}</span>
              </div>
            </div>
          </div>

          {filteredPending.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    Pending, scheduled & in progress
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Assigned online tests — available now or opening soon
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filteredPending.map((row) => (
                  <PendingTestCard key={`pending-${row.source}-${row.id}`} row={row} />
                ))}
              </div>
            </section>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Award size={18} className="text-indigo-500 shrink-0" />
            <h2 className="text-base font-black text-slate-800 tracking-tight">Completed tests</h2>
          </div>

          <div className="bg-white rounded-[1.25rem] border border-slate-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3 lg:items-center w-full">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest shrink-0">
              <Filter size={14} />
              Filter
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 w-full lg:max-w-2xl xl:max-w-3xl">
              <select
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={filters.testType}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, testType: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">All types</option>
                {filterOptions.testTypes?.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={filters.moduleId}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, moduleId: e.target.value }));
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">All modules</option>
                {filterOptions.modules?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-[2rem] shadow-sm border border-slate-100">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={32} />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {filteredPending.length > 0
                  ? 'No completed tests in this filter'
                  : 'No tests in this filter'}
              </h3>
              <p className="text-slate-500 mt-1 text-sm">
                {filteredPending.length > 0
                  ? 'You have pending tests above. Adjust filters to see completed scores.'
                  : 'Try clearing filters or check back after your next CRT session.'}
              </p>
            </div>
          ) : (
            <>
              {/* Card grid — mobile / tablet */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 xl:hidden">
                {results.map((row) => (
                  <TestResultCard
                    key={`${row.source}-${row.id}`}
                    row={row}
                    onOpen={() => openDetail(row)}
                    formatSubmitted={formatSubmitted}
                    formatScore={formatScore}
                    toneClasses={toneClasses}
                    scoreTone={scoreTone}
                  />
                ))}
              </div>

              {/* Table — large screens (uses full content width) */}
              <div className="hidden xl:block bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden w-full">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-[38%]" />
                      <col className="w-[14%]" />
                      <col className="w-[12%]" />
                      <col className="w-[22%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-left">
                        <th className="px-5 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Test
                        </th>
                        <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Module
                        </th>
                        <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Score
                        </th>
                        <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Submitted
                        </th>
                        <th className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row) => (
                        <tr
                          key={`tbl-${row.source}-${row.id}`}
                          className="border-t border-slate-50 hover:bg-indigo-50/30 transition-colors"
                        >
                          <td className="px-5 py-4 align-top">
                            <p className="font-bold text-slate-900 leading-snug line-clamp-2">
                              {row.test_name || 'Test'}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                              {row.test_type || 'online'}
                            </p>
                          </td>
                          <td className="px-4 py-4 align-top font-medium text-slate-700 text-xs">
                            {row.module_id || '—'}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <span
                              className={`inline-flex text-sm font-black px-2.5 py-1 rounded-lg border ${toneClasses[scoreTone(row.score)]}`}
                            >
                              {formatScore(row)}
                            </span>
                            {row.correct_answers != null && (
                              <p className="text-[10px] text-slate-400 mt-1">
                                {row.correct_answers}/{row.total_questions}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-slate-600 text-xs whitespace-nowrap">
                            {formatSubmitted(row)}
                          </td>
                          <td className="px-4 py-4 align-top text-center">
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                              title="View answers"
                            >
                              <Eye size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                    }
                    className="inline-flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() =>
                      setPagination((p) => ({
                        ...p,
                        page: Math.min(p.totalPages, p.page + 1),
                      }))
                    }
                    className="inline-flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default VersantTests;

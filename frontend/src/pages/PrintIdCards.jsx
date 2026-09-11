import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Filter,
  Loader2,
  Printer,
  Search,
  RefreshCw,
  Eye,
  X,
  Users,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import { useStudents } from '../hooks/useStudents';
import DigitalStudentCard from '../components/DigitalStudentCard';
import DigitalIdCardBack from '../components/DigitalIdCardBack';
import { printIdCardFrontAndBack } from '../utils/printDigitalIdCard';
import StudentAvatar from '../components/StudentAvatar';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

const emptyFilters = {
  college: '',
  level: '',
  course: '',
  branch: '',
  batch: '',
  year: '',
  section: '',
};

/** Quick-filter API returns strings or { id, name } — never render raw objects. */
const optionLabel = (item) => {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return String(item.name ?? item.label ?? item.id ?? '');
};

const optionValue = (item) => optionLabel(item);

const optionKey = (item, idx) => {
  if (item == null) return `opt-${idx}`;
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return String(item.id ?? item.name ?? idx);
};

const studentKey = (s) => {
  if (!s) return '';
  return String(s.admission_number || s.admission_no || s.id || '');
};

const PrintIdCards = () => {
  const { user } = useAuthStore();

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasPermission(user.permissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'print_id_cards');
  }, [user]);

  const [filters, setFilters] = useState(emptyFilters);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [colleges, setColleges] = useState([]);
  const [quickFilters, setQuickFilters] = useState({
    levels: [],
    courses: [],
    branches: [],
    batches: [],
    years: [],
    sections: [],
  });
  const [loadingFilters, setLoadingFilters] = useState(false);
  /** admission/id → student object */
  const [selectedMap, setSelectedMap] = useState({});
  const [previewKey, setPreviewKey] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [backOrientation, setBackOrientation] = useState(() => {
    try {
      return localStorage.getItem('id_card_back_orientation') || 'straight';
    } catch {
      return 'straight';
    }
  });

  const handleOrientationChange = (val) => {
    setBackOrientation(val);
    try {
      localStorage.setItem('id_card_back_orientation', val);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    api.get('/colleges')
      .then((res) => {
        if (res.data?.success) setColleges(res.data.data || []);
      })
      .catch(() => {});
  }, []);

  const fetchQuickFilters = useCallback(async (current = {}) => {
    setLoadingFilters(true);
    try {
      const params = new URLSearchParams();
      Object.entries(current).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      const res = await api.get(`/students/quick-filters?${params.toString()}`);
      if (res.data?.success) {
        const d = res.data.data || {};
        setQuickFilters({
          levels: d.levels || [],
          courses: d.courses || [],
          branches: d.branches || [],
          batches: d.batches || [],
          years: d.years || [],
          sections: d.sections || [],
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFilters(false);
    }
  }, []);

  useEffect(() => {
    fetchQuickFilters(filters);
  }, [
    filters.college,
    filters.level,
    filters.course,
    filters.branch,
    filters.batch,
    filters.year,
    fetchQuickFilters,
  ]);

  const activeFilters = useMemo(() => {
    const f = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) f[k] = v;
    });
    return f;
  }, [filters]);

  const { data, isLoading, isFetching, refetch } = useStudents({
    page,
    pageSize,
    filters: activeFilters,
    search: debouncedSearch,
    enabled: true,
  });

  const students = data?.students || [];
  const total = data?.pagination?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectedStudents = useMemo(
    () => Object.values(selectedMap),
    [selectedMap]
  );
  const selectedCount = selectedStudents.length;

  const previewStudent = useMemo(() => {
    if (previewKey && selectedMap[previewKey]) return selectedMap[previewKey];
    return selectedStudents[selectedStudents.length - 1] || null;
  }, [previewKey, selectedMap, selectedStudents]);

  const clearSelection = () => {
    setSelectedMap({});
    setPreviewKey(null);
    setShowPreview(false);
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'college') {
        next.level = '';
        next.course = '';
        next.branch = '';
        next.section = '';
      } else if (key === 'level') {
        next.course = '';
        next.branch = '';
        next.section = '';
      } else if (key === 'course') {
        next.branch = '';
        next.section = '';
      } else if (key === 'branch') {
        next.section = '';
      }
      return next;
    });
    setPage(1);
    clearSelection();
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setSearchTerm('');
    setPage(1);
    clearSelection();
  };

  const getStudentData = useCallback((student) => {
    return (key, fallback = '') => {
      if (!student?.student_data) return fallback;
      const dk = Object.keys(student.student_data).find(
        (k) => k.toLowerCase() === String(key).toLowerCase()
      );
      const v = dk ? student.student_data[dk] : undefined;
      return v !== undefined && v !== null && v !== '' ? v : fallback;
    };
  }, []);

  const resolveCollege = useCallback((student) => {
    if (!student) return 'PYDAH GROUP';
    const g = getStudentData(student);
    return student.college || g('College') || g('college') || 'PYDAH GROUP';
  }, [getStudentData]);

  const resolveCollegeSignature = useCallback((student) => {
    if (!student || !colleges.length) return null;
    const colName = String(resolveCollege(student) || '').trim().toLowerCase();
    const colObj = colleges.find(c =>
      (c.id && (c.id === student.college_id || c.id === student.collegeId)) ||
      (c.name && c.name.trim().toLowerCase() === colName) ||
      (c.code && c.code.trim().toLowerCase() === colName)
    );
    return colObj?.principal_signature_url || null;
  }, [colleges, resolveCollege]);

  const collegeName = useMemo(
    () => resolveCollege(previewStudent),
    [previewStudent, resolveCollege]
  );

  const toggleStudent = (student, { previewOnly = false } = {}) => {
    const key = studentKey(student);
    if (!key) return;

    if (previewOnly) {
      if (selectedMap[key]) {
        setPreviewKey(key);
        setShowPreview(true);
      }
      return;
    }

    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        setPreviewKey((pk) => {
          if (pk !== key) return pk;
          const remaining = Object.keys(next);
          return remaining[remaining.length - 1] || null;
        });
        if (Object.keys(next).length === 0) setShowPreview(false);
      } else {
        next[key] = student;
        setPreviewKey(key);
        setShowPreview(true);
      }
      return next;
    });
  };

  const pageAllSelected =
    students.length > 0 &&
    students.every((s) => Boolean(selectedMap[studentKey(s)]));

  const toggleSelectAllPage = () => {
    if (pageAllSelected) {
      setSelectedMap((prev) => {
        const next = { ...prev };
        students.forEach((s) => {
          delete next[studentKey(s)];
        });
        const remainingKeys = Object.keys(next);
        setPreviewKey(remainingKeys[remainingKeys.length - 1] || null);
        if (remainingKeys.length === 0) setShowPreview(false);
        return next;
      });
      return;
    }
    setSelectedMap((prev) => {
      const next = { ...prev };
      students.forEach((s) => {
        const key = studentKey(s);
        if (key) next[key] = s;
      });
      return next;
    });
    if (students[0]) {
      setPreviewKey(studentKey(students[0]));
      setShowPreview(true);
    }
  };

  const handlePrintSelected = () => {
    if (!selectedCount) {
      toast.error('Select at least one student');
      return;
    }
    setShowPreview(true);
    setPrinting(true);

    // Batch cards stay mounted for selected students; brief wait for photos/QR.
    const waitMs = Math.min(2200, 350 + selectedCount * 200);
    window.setTimeout(() => {
      try {
        const result = printIdCardFrontAndBack(
          '.id-card-batch-front',
          '.id-card-batch-back',
          { backOrientation }
        );
        if (result.students < selectedCount) {
          toast.error(
            `Only ${result.students} of ${selectedCount} cards were ready — try print again`
          );
        } else {
          toast.success(
            result.students === 1
              ? `Print dialog: 2 pages (Front + Back [${backOrientation === 'rotate180' ? '180° Rotated' : 'Straight'}])`
              : `Print dialog: ${result.pages} pages (${result.students} students × Front + Back [${backOrientation === 'rotate180' ? '180° Rotated' : 'Straight'}])`
          );
        }
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Unable to open print dialog');
      } finally {
        setPrinting(false);
      }
    }, waitMs);
  };

  const selectClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400';

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to print ID cards. Ask an admin to enable{' '}
          <strong>Print ID Cards</strong> under Student Management.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none flex flex-col gap-3 min-h-[calc(100vh-1rem)] -m-4 lg:-m-8 p-3 lg:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
            <CreditCard className="text-red-700" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Print ID Cards</h1>
            <p className="text-xs text-gray-500">
              Preview shows one student · Print includes every checked student (front + back each)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-red-700" />
          <h2 className="text-sm font-bold text-gray-900">Filters</h2>
          {loadingFilters && <Loader2 size={14} className="animate-spin text-gray-400" />}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">College</label>
            <select
              className={selectClass}
              value={filters.college}
              onChange={(e) => handleFilterChange('college', e.target.value)}
            >
              <option value="">All</option>
              {colleges.map((c, idx) => (
                <option key={optionKey(c, idx)} value={optionValue(c)}>
                  {optionLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Level</label>
            <select
              className={selectClass}
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
            >
              <option value="">All</option>
              <option value="diploma">Diploma</option>
              <option value="ug">UG</option>
              <option value="pg">PG</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Course / Program</label>
            <select
              className={selectClass}
              value={filters.course}
              onChange={(e) => handleFilterChange('course', e.target.value)}
            >
              <option value="">All</option>
              {quickFilters.courses.map((v, idx) => (
                <option key={optionKey(v, idx)} value={optionValue(v)}>{optionLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Branch</label>
            <select
              className={selectClass}
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
            >
              <option value="">All</option>
              {quickFilters.branches.map((v, idx) => (
                <option key={optionKey(v, idx)} value={optionValue(v)}>{optionLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Batch</label>
            <select
              className={selectClass}
              value={filters.batch}
              onChange={(e) => handleFilterChange('batch', e.target.value)}
            >
              <option value="">All</option>
              {quickFilters.batches.map((v, idx) => (
                <option key={optionKey(v, idx)} value={optionValue(v)}>{optionLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Year</label>
            <select
              className={selectClass}
              value={filters.year}
              onChange={(e) => handleFilterChange('year', e.target.value)}
            >
              <option value="">All</option>
              {quickFilters.years.map((v, idx) => (
                <option key={optionKey(v, idx)} value={optionValue(v)}>{optionLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Section</label>
            <select
              className={selectClass}
              value={filters.section}
              onChange={(e) => handleFilterChange('section', e.target.value)}
            >
              <option value="">All</option>
              {quickFilters.sections.map((v, idx) => (
                <option key={optionKey(v, idx)} value={optionValue(v)}>{optionLabel(v)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, PIN, admission no…"
              className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0 xl:items-stretch">
        {/* Student list */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[55vh] xl:min-h-[calc(100vh-14rem)]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <span className="text-sm font-bold text-gray-900">Students</span>
              <span className="text-xs text-gray-400 font-semibold">{total} found</span>
              {selectedCount > 0 && (
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-lg">
                  {selectedCount} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] font-bold text-gray-500 hover:text-gray-800"
                >
                  Clear selection
                </button>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Checklist multi-select
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading…
              </div>
            ) : students.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">
                No students match these filters
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2.5 font-bold w-10">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={toggleSelectAllPage}
                        className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                        title="Select all on this page"
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-bold">Student</th>
                    <th className="px-3 py-2.5 font-bold">PIN / Adm</th>
                    <th className="px-3 py-2.5 font-bold hidden md:table-cell">Course</th>
                    <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Branch</th>
                    <th className="px-3 py-2.5 font-bold w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {students.map((s) => {
                    const key = studentKey(s);
                    const checked = Boolean(selectedMap[key]);
                    const isPreview = previewStudent && studentKey(previewStudent) === key;
                    const name = s.student_name || s.name || '—';
                    const pin = s.pin_no || key || '—';
                    return (
                      <tr
                        key={s.id || key}
                        className={`hover:bg-red-50/40 transition-colors ${checked ? 'bg-red-50/70' : ''} ${isPreview ? 'ring-1 ring-inset ring-red-200' : ''}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(s)}
                            className="h-4 w-4 rounded border-gray-300 text-red-700 focus:ring-red-500"
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td
                          className="px-3 py-2.5 cursor-pointer"
                          onClick={() => {
                            if (!checked) toggleStudent(s);
                            else toggleStudent(s, { previewOnly: true });
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              admissionNumber={key}
                              studentName={name}
                              className="w-8 h-8"
                              iconSize={14}
                            />
                            <span className="font-semibold text-gray-900 truncate">{name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{pin}</td>
                        <td className="px-3 py-2.5 text-gray-600 hidden md:table-cell">{s.course || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600 hidden lg:table-cell">{s.branch || '—'}</td>
                        <td className="px-3 py-2.5">
                          {checked && (
                            <button
                              type="button"
                              onClick={() => toggleStudent(s, { previewOnly: true })}
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg ${isPreview ? 'bg-red-700 text-white' : 'bg-white border border-red-200 text-red-700 hover:bg-red-50'}`}
                            >
                              {isPreview ? 'Preview' : 'View'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview + print */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 flex flex-col gap-4 min-h-[55vh] xl:min-h-[calc(100vh-14rem)]">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Card preview</h2>
              <p className="text-[11px] text-gray-400">
                One student on screen · all {selectedCount || 0} checked go to print
              </p>
            </div>
            {previewStudent && (
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-800"
              >
                {showPreview ? <X size={14} /> : <Eye size={14} />}
                {showPreview ? 'Hide' : 'Show'}
              </button>
            )}
          </div>

          {!previewStudent ? (
            <div className="flex-1 min-h-[280px] rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-center px-6 gap-2">
              <CreditCard className="text-gray-300" size={36} />
              <p className="text-sm font-semibold text-gray-500">Check students from the list</p>
              <p className="text-xs text-gray-400">Use the checklist to select one or many, then print</p>
            </div>
          ) : !showPreview ? (
            <div className="flex-1 min-h-[280px] rounded-2xl border border-dashed border-red-100 bg-red-50/40 flex flex-col items-center justify-center text-center px-6 gap-3">
              <p className="text-sm font-bold text-gray-800">
                {previewStudent.student_name || previewStudent.name}
              </p>
              <p className="text-xs text-gray-500 font-mono">
                {previewStudent.pin_no || previewStudent.admission_number}
              </p>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-bold hover:bg-red-800"
              >
                <Eye size={16} /> Preview ID Card
              </button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Front Side</p>
                <div className="id-card-preview-scaler-box">
                  <div className="id-card-preview-scaler">
                    <DigitalStudentCard
                      className="id-card-print-front"
                      student={previewStudent}
                      getStudentData={getStudentData(previewStudent)}
                      principalSignatureUrl={resolveCollegeSignature(previewStudent)}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Back Side</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    backOrientation === 'straight' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {backOrientation === 'straight' ? 'Straight (0°)' : 'Rotated (180°)'}
                  </span>
                </div>
                <div className="id-card-preview-scaler-box">
                  <div className="id-card-preview-scaler">
                    <DigitalIdCardBack
                      className="id-card-print-back"
                      college={collegeName}
                      rotate180={backOrientation === 'rotate180'}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Back Side Flip Orientation Selector */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800">Back Side Flip Edge</span>
              <span className="text-[10px] text-gray-500 font-semibold">
                {backOrientation === 'straight' ? 'Straight (Upright)' : 'Rotate 180° (Flipped)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOrientationChange('straight')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  backOrientation === 'straight'
                    ? 'bg-red-700 text-white shadow-sm ring-2 ring-red-700/20'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>Straight (0°)</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrientationChange('rotate180')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  backOrientation === 'rotate180'
                    ? 'bg-red-700 text-white shadow-sm ring-2 ring-red-700/20'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>Rotate 180°</span>
              </button>
            </div>

            <p className="text-[10px] text-gray-500 leading-normal">
              <strong>Straight (Default):</strong> Card back prints upright. In system print dialog (under More settings → Two-sided), choose <strong>&apos;Flip on long edge&apos;</strong>. Use <strong>Rotate 180°</strong> only if your printer flipper reverses the card.
            </p>
          </div>

          <button
            type="button"
            disabled={!selectedCount || printing}
            onClick={handlePrintSelected}
            className="w-full shrink-0 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            {selectedCount > 1
              ? `Generate Print (${selectedCount} Students · ${selectedCount * 2} Pages · Back: ${backOrientation === 'rotate180' ? '180°' : 'Straight'})`
              : `Generate Print (Front + Back · Back: ${backOrientation === 'rotate180' ? '180°' : 'Straight'})`}
          </button>
          <p className="text-[10px] text-gray-500 text-center leading-relaxed shrink-0">
            Print dialog lists {selectedCount || 0} × 2 CR80 pages with crisp high-contrast dark text.<br />
            Evolis · CR80 · Margins: None · Background graphics: On.
          </p>
        </div>
      </div>

      {/* Always mount checked cards so multi-print is ready (photos/QR preload) */}
      {selectedStudents.length > 0 && (
        <div
          id="id-card-batch-source"
          className="fixed left-[-10000px] top-0 w-[54mm] pointer-events-none opacity-0"
          aria-hidden="true"
        >
          {selectedStudents.map((s) => {
            const key = studentKey(s);
            return (
              <div key={`batch-${key}`} data-batch-student={key}>
                <DigitalStudentCard
                  className="id-card-batch-front"
                  student={s}
                  getStudentData={getStudentData(s)}
                  principalSignatureUrl={resolveCollegeSignature(s)}
                />
                <DigitalIdCardBack
                  className="id-card-batch-back"
                  college={resolveCollege(s)}
                  rotate180={backOrientation === 'rotate180'}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PrintIdCards;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  Calendar,
  Clock,
  Loader2,
  Search,
  Filter,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  BarChart3,
  History as HistoryIcon,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  Users,
  Settings
} from 'lucide-react';
import StudentAvatar from '../components/StudentAvatar';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import api, { getStaticFileUrlDirect } from '../config/api';
import LoadingAnimation from '../components/LoadingAnimation';
import { SkeletonTable, SkeletonAttendanceTable } from '../components/SkeletonLoader';
import HolidayCalendarModal from '../components/Attendance/HolidayCalendarModal';
import AttendanceSettingsModal from '../components/Attendance/AttendanceSettingsModal';
import useAuthStore from '../store/authStore';
import { isFullAccessRole } from '../constants/rbac';
import { useInvalidateStudents } from '../hooks/useStudents';

const normalizeDateToIST = (dateStr) => {
  if (!dateStr) return '';
  // If it's already YYYY-MM-DD, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // If it's an ISO string, convert to IST date (YYYY-MM-DD)
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    return dateStr;
  }
};

const formatDateInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const computeSundaysForMonthKey = (monthKey) => {
  if (typeof monthKey !== 'string') return [];
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (Number.isNaN(year) || Number.isNaN(month)) return [];

  const sundays = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  while (cursor <= end) {
    if (cursor.getUTCDay() === 0) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');
      sundays.push(`${y}-${m}-${d}`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sundays;
};

const formatFriendlyDate = (dateString) => {
  if (!dateString) return '';
  // Append IST offset to ensure we interpret the date as IST midnight
  const date = new Date(`${dateString}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

const createEmptyCalendarData = (monthKey) => ({
  month: monthKey,
  countryCode: 'IN',
  regionCode: null,
  sundays: computeSundaysForMonthKey(monthKey),
  publicHolidays: [],
  customHolidays: [],
  attendanceStatus: {},
  fetchedAt: new Date().toISOString(),
  fromCache: false
});

const getMonthKeyFromDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  return dateString.slice(0, 7);
};

const Attendance = () => {
  const StatPill = ({ label, value, color }) => {
    const colorMap = {
      gray: 'bg-gray-50 border-gray-200 text-gray-900',
      green: 'bg-green-50 border-green-100 text-green-800',
      blue: 'bg-blue-50 border-blue-100 text-blue-800',
      red: 'bg-red-50 border-red-100 text-red-800',
      amber: 'bg-amber-50 border-amber-100 text-amber-800'
    };
    const safeValue = Number.isFinite(value) ? value : Number(value) || 0;
    return (
      <div className={`border rounded-lg p-2 ${colorMap[color] || colorMap.gray}`}>
        <p className="text-[10px] text-gray-600 leading-tight whitespace-normal">{label}</p>
        <p className="text-sm sm:text-base font-bold">{safeValue}</p>
      </div>
    );
  };

  const [attendanceDate, setAttendanceDate] = useState(() => formatDateInput(new Date()));
  const [filters, setFilters] = useState({
    batch: '',
    course: '',
    level: '',
    branch: '',
    currentYear: '',
    currentSemester: '',
    studentName: '',
    parentMobile: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]); // Store courses with level info
  const [coursesWithBranches, setCoursesWithBranches] = useState([]);
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  const [columnOrder, setColumnOrder] = useState([
    'student', 'pin', 'registrationStatus', 'batch', 'course', 'branch', 'year', 'semester', 'parentContact', 'attendance', 'smsStatus'
  ]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const invalidateStudents = useInvalidateStudents();
  const [saving, setSaving] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [initialStatusMap, setInitialStatusMap] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalStudents, setTotalStudents] = useState(0);
  // Infinite scroll state for filtered results
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPages, setLoadedPages] = useState(1);
  const scrollObserverRef = useRef(null);
  const [attendanceStatistics, setAttendanceStatistics] = useState({
    total: 0,
    present: 0,
    absent: 0,
    marked: 0,
    unmarked: 0
  });
  const pageSizeOptions = [10, 25, 50, 100];
  const [smsResults, setSmsResults] = useState([]);
  const [smsStatusMap, setSmsStatusMap] = useState({}); // Map studentId to SMS status
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsCurrentPage, setSmsCurrentPage] = useState(1);
  const [smsPageSize] = useState(10);
  const [retryingSmsFor, setRetryingSmsFor] = useState(null); // Track which student SMS is being retried
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const attendanceCache = useRef(new Map());
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache for faster re-renders
  const pendingRequestRef = useRef(null);
  const searchEffectInitialized = useRef(false);
  const filterOptionsCacheRef = useRef(new Map());
  const FILTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache for filter options
  const [dayEndReportOpen, setDayEndReportOpen] = useState(false);
  const [dayEndReportLoading, setDayEndReportLoading] = useState(false);
  const [dayEndReportData, setDayEndReportData] = useState(null);
  const [dayEndGrouped, setDayEndGrouped] = useState([]);
  const [dayEndPreviewFilter, setDayEndPreviewFilter] = useState('all'); // all | marked | unmarked
  const [dayEndSortBy, setDayEndSortBy] = useState('none'); // none | branch | yearSem | course
  const [dayEndFilters, setDayEndFilters] = useState({
    college: '',
    batch: '',
    course: '',
    branch: '',
    year: '',
    semester: ''
  });
  const [dayEndFilterOptions, setDayEndFilterOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: [],
    allData: [] // Store all data for cascading filters
  });
  const [sendingReports, setSendingReports] = useState(false);
  const [markHolidayLoading, setMarkHolidayLoading] = useState(false);
  const [holidayReasonModalOpen, setHolidayReasonModalOpen] = useState(false);
  const [holidayReason, setHolidayReason] = useState('');
  const [pendingHolidayRecords, setPendingHolidayRecords] = useState([]);
  const [pendingFilter, setPendingFilter] = useState('all'); // all | pending | marked
  const [showPendingStudents, setShowPendingStudents] = useState(false);
  const [allBatchesMarkedModalOpen, setAllBatchesMarkedModalOpen] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [gettingDeleteCount, setGettingDeleteCount] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);


  // Prevent background scrolling when day end report popup is open
  const dayEndStatsRef = useRef(null);
  const [statsSectionHeight, setStatsSectionHeight] = useState(180);

  useEffect(() => {
    if (dayEndReportOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Disable body scrolling
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      // Measure stats section height after render
      const measureHeight = () => {
        if (dayEndStatsRef.current) {
          const height = dayEndStatsRef.current.offsetHeight;
          setStatsSectionHeight(height);
        }
      };

      // Measure immediately and after a short delay to account for dynamic content
      measureHeight();
      const timeoutId = setTimeout(measureHeight, 100);

      return () => {
        clearTimeout(timeoutId);
        // Re-enable body scrolling when popup closes
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [dayEndReportOpen]);

  // Filter branches based on selected college and course
  const filteredBranches = useMemo(() => {
    if (!dayEndFilterOptions.allData || dayEndFilterOptions.allData.length === 0) {
      return dayEndFilterOptions.branches || [];
    }

    let filteredData = dayEndFilterOptions.allData;

    // Filter by college if selected
    if (dayEndFilters.college) {
      filteredData = filteredData.filter(item => item.college === dayEndFilters.college);
    }

    // Filter by course if selected
    if (dayEndFilters.course) {
      filteredData = filteredData.filter(item => item.course === dayEndFilters.course);
    }

    // Extract unique branches from filtered data
    const branches = [...new Set(filteredData.map(item => item.branch).filter(Boolean))].sort();
    return branches;
  }, [dayEndFilterOptions.allData, dayEndFilters.college, dayEndFilters.course]);

  // Filter courses based on selected college
  const filteredCourses = useMemo(() => {
    if (!dayEndFilterOptions.allData || dayEndFilterOptions.allData.length === 0) {
      return dayEndFilterOptions.courses || [];
    }

    let filteredData = dayEndFilterOptions.allData;

    // Filter by college if selected
    if (dayEndFilters.college) {
      filteredData = filteredData.filter(item => item.college === dayEndFilters.college);
    }

    // Extract unique courses from filtered data
    const courses = [...new Set(filteredData.map(item => item.course).filter(Boolean))].sort();
    return courses;
  }, [dayEndFilterOptions.allData, dayEndFilters.college]);

  const dayEndGroupedDisplay = useMemo(() => {
    let rows = Array.isArray(dayEndGrouped) ? [...dayEndGrouped] : [];
    rows = rows.filter((row) => {
      if (dayEndPreviewFilter === 'marked' && (row.markedToday || 0) === 0) return false;
      if (dayEndPreviewFilter === 'unmarked' && (row.pendingToday || 0) === 0) return false;

      if (dayEndFilters.college && row.college !== dayEndFilters.college) return false;
      if (dayEndFilters.batch && row.batch !== dayEndFilters.batch) return false;
      if (dayEndFilters.course && row.course !== dayEndFilters.course) return false;
      if (dayEndFilters.branch && row.branch !== dayEndFilters.branch) return false;
      if (dayEndFilters.year && String(row.year) !== String(dayEndFilters.year)) return false;
      if (dayEndFilters.semester && String(row.semester) !== String(dayEndFilters.semester)) return false;

      return true;
    });

    const compareNumber = (a, b) => (a || 0) - (b || 0);
    if (dayEndSortBy === 'branch') {
      rows.sort((a, b) => (a.branch || '').localeCompare(b.branch || '') || compareNumber(a.year, b.year) || compareNumber(a.semester, b.semester));
    } else if (dayEndSortBy === 'yearSem') {
      rows.sort((a, b) => compareNumber(a.year, b.year) || compareNumber(a.semester, b.semester) || (a.branch || '').localeCompare(b.branch || ''));
    } else if (dayEndSortBy === 'course') {
      rows.sort((a, b) => (a.course || '').localeCompare(b.course || '') || compareNumber(a.year, b.year) || compareNumber(a.semester, b.semester));
    }
    return rows;
  }, [dayEndGrouped, dayEndPreviewFilter, dayEndSortBy, dayEndFilters]);

  // Calculate filtered stats based on table header selections
  const filteredStats = useMemo(() => {
    const filteredRows = dayEndGroupedDisplay;
    const totalStudents = filteredRows.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
    const markedToday = filteredRows.reduce((sum, row) => sum + (row.markedToday || 0), 0);
    const absentToday = filteredRows.reduce((sum, row) => sum + (row.absentToday || 0), 0);
    const presentToday = filteredRows.reduce((sum, row) => sum + (row.presentToday || 0), 0);
    const holidayToday = filteredRows.reduce((sum, row) => sum + (row.holidayToday || 0), 0);
    const unmarkedToday = filteredRows.reduce((sum, row) => sum + (row.pendingToday || 0), 0);

    // Get holiday reasons from filtered rows
    const holidayReasons = [...new Set(filteredRows
      .filter(row => row.holidayReasons)
      .map(row => row.holidayReasons)
      .join(', ')
      .split(', ')
      .filter(Boolean)
    )].join(', ');

    return {
      totalStudents,
      markedToday,
      absentToday,
      presentToday,
      holidayToday,
      unmarkedToday,
      holidayReason: holidayReasons || null
    };
  }, [dayEndGroupedDisplay]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [downloadingStudentId, setDownloadingStudentId] = useState(null);
  const [calendarInfo, setCalendarInfo] = useState({
    month: '',
    countryCode: 'IN',
    sundays: [],
    publicHolidays: [],
    customHolidays: [],
    fetchedAt: null,
    fromCache: false,
    attendanceStatus: {}
  });
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarViewMonthKey, setCalendarViewMonthKey] = useState(null);
  const [calendarViewData, setCalendarViewData] = useState(null);
  const [calendarViewLoading, setCalendarViewLoading] = useState(false);
  const [calendarViewError, setCalendarViewError] = useState(null);
  const [calendarMutationLoading, setCalendarMutationLoading] = useState(false);
  const [selectedDateHolidayInfo, setSelectedDateHolidayInfo] = useState(null);
  const [holidayAlertShown, setHolidayAlertShown] = useState(false);
  const [showHolidayAlert, setShowHolidayAlert] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const calendarCacheRef = useRef(new Map());

  const user = useAuthStore((state) => state.user);
  const isAdmin = isFullAccessRole(user?.role);

  const setCachedCalendarData = (monthKey, updater) => {
    if (!monthKey) return null;
    const previous = calendarCacheRef.current.get(monthKey) || createEmptyCalendarData(monthKey);
    const nextValue = typeof updater === 'function' ? updater(previous) : updater;
    calendarCacheRef.current.set(monthKey, nextValue);
    setCalendarInfo((prev) => (prev.month === monthKey ? nextValue : prev));
    setCalendarViewData((prev) => (prev?.month === monthKey ? nextValue : prev));
    return nextValue;
  };

  const fetchCalendarMonth = async (monthKey, options = {}) => {
    if (!monthKey) return null;
    const { force = false, applyToHeader = false, applyToModal = false } = options;

    if (!force && calendarCacheRef.current.has(monthKey)) {
      const cached = calendarCacheRef.current.get(monthKey);
      if (applyToHeader) {
        setCalendarInfo(cached);
      }
      if (applyToModal) {
        setCalendarViewData(cached);
      }
      return cached;
    }

    const loadingSetter = applyToHeader
      ? setCalendarLoading
      : applyToModal
        ? setCalendarViewLoading
        : null;
    const errorSetter = applyToHeader
      ? setCalendarError
      : applyToModal
        ? setCalendarViewError
        : null;

    if (loadingSetter) loadingSetter(true);
    if (errorSetter) errorSetter(null);

    try {
      const response = await api.get('/calendar/non-working-days', {
        params: {
          month: monthKey,
          countryCode: 'IN'
        }
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to load calendar data');
      }

      const payload = response.data.data || {};
      const normalized = {
        month: payload.month || monthKey,
        countryCode: payload.countryCode || 'IN',
        regionCode: payload.regionCode || null,
        sundays:
          Array.isArray(payload.sundays) && payload.sundays.length > 0
            ? payload.sundays
            : computeSundaysForMonthKey(monthKey),
        publicHolidays: Array.isArray(payload.publicHolidays)
          ? payload.publicHolidays.map(h => ({ ...h, date: normalizeDateToIST(h.date) }))
          : [],
        customHolidays: Array.isArray(payload.customHolidays)
          ? payload.customHolidays.map(h => ({ ...h, date: normalizeDateToIST(h.date) }))
          : [],
        attendanceStatus:
          payload.attendanceStatus && typeof payload.attendanceStatus === 'object'
            ? payload.attendanceStatus
            : {},
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        fromCache: Boolean(payload.fromCache)
      };

      calendarCacheRef.current.set(normalized.month, normalized);
      if (applyToHeader) {
        setCalendarInfo(normalized);
      }
      if (applyToModal) {
        setCalendarViewData(normalized);
      }
      return normalized;
    } catch (error) {
      if (errorSetter) {
        errorSetter(error.response?.data?.message || error.message || 'Unable to load calendar information');
      }
      throw error;
    } finally {
      if (loadingSetter) loadingSetter(false);
    }
  };

  const ensureCalendarFallback = (monthKey) => {
    if (!monthKey) return null;
    const fallback = createEmptyCalendarData(monthKey);
    calendarCacheRef.current.set(monthKey, fallback);
    setCalendarInfo((prev) => (prev.month === monthKey ? fallback : prev));
    setCalendarViewData((prev) => (prev?.month === monthKey ? fallback : prev));
    return fallback;
  };

  const effectiveStatus = (studentId) => {
    const status = statusMap[studentId];
    // Default to 'present' if no status is set
    return status ? status.toLowerCase() : 'present';
  };

  // Use statistics from API (based on total students, not just current page)
  const presentCount = useMemo(() => {
    return attendanceStatistics.present || 0;
  }, [attendanceStatistics.present]);

  const absentCount = useMemo(() => {
    return attendanceStatistics.absent || 0;
  }, [attendanceStatistics.absent]);

  const unmarkedCount = useMemo(() => {
    return attendanceStatistics.unmarked || 0;
  }, [attendanceStatistics.unmarked]);

  // Calculate marked count (students with attendance status in DB) - from API
  const markedCount = useMemo(() => {
    return attendanceStatistics.marked || 0;
  }, [attendanceStatistics.marked]);

  // Pending Marked = Total unmarked students (students that need to be marked)
  // This should be based on total students, not just current page
  const pendingCount = useMemo(() => {
    return attendanceStatistics.unmarked || 0;
  }, [attendanceStatistics.unmarked]);

  // Filter branches based on selected course and batch
  const availableBranches = useMemo(() => {
    // When a course is selected (with or without batch), use filterOptions.branches directly
    // The backend already filters branches by course, so we can trust filterOptions.branches
    if (filters.course) {
      return filterOptions.branches || [];
    }

    // When no course is selected, use filterOptions.branches directly
    // This shows all branches (filtered by batch if batch is selected, or all if no batch)
    return filterOptions.branches || [];
  }, [filters.course, filters.batch, filterOptions.branches]);

  // Pagination calculations
  const safePageSize = pageSize || 1;
  const totalPages = totalStudents > 0 ? Math.max(1, Math.ceil(totalStudents / safePageSize)) : 1;
  const showingFromRaw = totalStudents === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const showingFrom = totalStudents === 0 ? 0 : Math.min(showingFromRaw, totalStudents);
  const showingTo = totalStudents === 0 ? 0 : Math.min(totalStudents, showingFrom + Math.max(students.length - 1, 0));
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  const hasChanges = useMemo(() => {
    // Allow saving if there are students, even if no changes detected
    // This ensures attendance can be saved even when all students are present
    if (students.length === 0) return false;

    // Check if there are any changes
    const hasStatusChanges = students.some((student) => {
      const current = effectiveStatus(student.id);
      const initial = initialStatusMap[student.id] || 'present';
      return current !== initial;
    });

    // Also check if there are students that need to be saved (not yet marked)
    // A student needs to be saved if they don't have an initial status (not yet marked in DB)
    const hasUnmarkedStudents = students.some((student) => {
      return initialStatusMap[student.id] === undefined;
    });

    return hasStatusChanges || hasUnmarkedStudents;
  }, [students, statusMap, initialStatusMap]);

  const calendarMonthKey = useMemo(() => {
    if (!attendanceDate || typeof attendanceDate !== 'string') return null;
    return attendanceDate.slice(0, 7);
  }, [attendanceDate]);

  const selectedDateIsSunday = useMemo(() => {
    if (!attendanceDate) return false;
    if (selectedDateHolidayInfo?.isSunday) return true;
    if (Array.isArray(calendarInfo.sundays) && calendarInfo.sundays.includes(attendanceDate)) {
      return true;
    }
    const selectedDate = new Date(`${attendanceDate}T00:00:00`);
    return selectedDate.getDay() === 0;
  }, [attendanceDate, calendarInfo.sundays, selectedDateHolidayInfo]);

  const publicHolidayMatches = useMemo(() => {
    if (!attendanceDate) {
      return [];
    }
    const calendarMatches = Array.isArray(calendarInfo.publicHolidays)
      ? calendarInfo.publicHolidays.filter((holiday) => holiday.date === attendanceDate)
      : [];

    if (calendarMatches.length > 0) {
      return calendarMatches;
    }

    if (selectedDateHolidayInfo?.publicHoliday) {
      return [selectedDateHolidayInfo.publicHoliday];
    }

    return [];
  }, [attendanceDate, calendarInfo.publicHolidays, selectedDateHolidayInfo]);

  const customHolidayForDate = useMemo(() => {
    if (!attendanceDate) {
      return null;
    }
    const calendarMatch = Array.isArray(calendarInfo.customHolidays)
      ? calendarInfo.customHolidays.find((holiday) => holiday.date === attendanceDate)
      : null;

    if (calendarMatch) {
      return calendarMatch;
    }

    return selectedDateHolidayInfo?.customHoliday || null;
  }, [attendanceDate, calendarInfo.customHolidays, selectedDateHolidayInfo]);

  const nonWorkingDayDetails = useMemo(() => {
    const reasons = [];

    if (selectedDateIsSunday) {
      reasons.push('Sunday');
    }

    if (publicHolidayMatches.length > 0) {
      const labels = publicHolidayMatches
        .map((holiday) => holiday.localName || holiday.name)
        .filter(Boolean);
      const labelText =
        labels.length > 0
          ? `Public holiday${labels.length > 1 ? 's' : ''}: ${labels.join(', ')}`
          : 'Public holiday';
      reasons.push(labelText);
    }

    if (customHolidayForDate) {
      reasons.push(
        customHolidayForDate.title
          ? `Institute holiday: ${customHolidayForDate.title}`
          : 'Institute holiday'
      );
    }

    if (Array.isArray(selectedDateHolidayInfo?.reasons)) {
      selectedDateHolidayInfo.reasons.forEach((reason) => {
        if (reason && !reasons.includes(reason)) {
          reasons.push(reason);
        }
      });
    }

    return {
      isNonWorkingDay:
        selectedDateIsSunday || publicHolidayMatches.length > 0 || !!customHolidayForDate,
      reasons,
      holidays: publicHolidayMatches,
      customHoliday: customHolidayForDate,
      backend: selectedDateHolidayInfo
    };
  }, [selectedDateIsSunday, publicHolidayMatches, customHolidayForDate, selectedDateHolidayInfo]);

  const upcomingHolidays = useMemo(() => {
    const todayKey = attendanceDate || formatDateInput(new Date());

    const combined = [
      ...(Array.isArray(calendarInfo.publicHolidays)
        ? calendarInfo.publicHolidays.map((holiday) => ({
          date: holiday.date,
          label: holiday.localName || holiday.name,
          type: 'public',
          details: holiday
        }))
        : []),
      ...(Array.isArray(calendarInfo.customHolidays)
        ? calendarInfo.customHolidays.map((holiday) => ({
          date: holiday.date,
          label: holiday.title || 'Institute Holiday',
          type: 'custom',
          details: holiday
        }))
        : [])
    ].filter((entry) => entry.date >= todayKey);

    combined.sort((a, b) => a.date.localeCompare(b.date));

    return combined.slice(0, 4);
  }, [calendarInfo.publicHolidays, calendarInfo.customHolidays, attendanceDate]);

  const todayKey = useMemo(() => formatDateInput(new Date()), []);
  const calendarMonthLoaded = calendarInfo.month === calendarMonthKey;
  const attendanceDateLabel = useMemo(() => {
    if (!attendanceDate) return 'Select date';
    // Append IST offset to ensure we interpret the date as IST midnight
    const date = new Date(`${attendanceDate}T00:00:00+05:30`);
    if (Number.isNaN(date.getTime())) return attendanceDate;
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
  }, [attendanceDate]);
  const selectedDateStatus = useMemo(
    () => calendarInfo.attendanceStatus?.[attendanceDate] || null,
    [calendarInfo.attendanceStatus, attendanceDate]
  );
  const isToday = attendanceDate === todayKey;
  const editingLocked =
    nonWorkingDayDetails.isNonWorkingDay || !isToday;
  const editingLockReason = nonWorkingDayDetails.isNonWorkingDay
    ? 'Attendance is disabled on holidays.'
    : !isToday
      ? 'Attendance can only be recorded for today.'
      : null;

  // Show holiday alert when date is a holiday (show every time page loads on a holiday)
  useEffect(() => {
    if (!isAdmin || !attendanceDate) {
      setShowHolidayAlert(false);
      return;
    }

    // Check multiple sources for holiday status
    // Priority: selectedDateHolidayInfo (from attendance API) > nonWorkingDayDetails > calendarInfo
    const isHoliday =
      selectedDateHolidayInfo?.isNonWorkingDay ||
      !!selectedDateHolidayInfo?.customHoliday ||
      !!selectedDateHolidayInfo?.publicHoliday ||
      nonWorkingDayDetails.isNonWorkingDay ||
      selectedDateIsSunday ||
      !!customHolidayForDate ||
      publicHolidayMatches.length > 0;

    // Show alert if it's a holiday and attendance data has loaded
    // Don't wait for calendar data if we have holiday info from attendance API
    const hasHolidayInfoFromAPI = !!selectedDateHolidayInfo?.isNonWorkingDay ||
      !!selectedDateHolidayInfo?.customHoliday ||
      !!selectedDateHolidayInfo?.publicHoliday;
    const calendarReady = hasHolidayInfoFromAPI || calendarMonthLoaded || calendarInfo.month === calendarMonthKey;

    if (isHoliday && !loading && calendarReady) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        if (!holidayAlertShown) {
          setShowHolidayAlert(true);
          setHolidayAlertShown(true);
        }
      }, 800);

      return () => clearTimeout(timer);
    } else {
      setShowHolidayAlert(false);
    }
  }, [
    isAdmin,
    nonWorkingDayDetails.isNonWorkingDay,
    selectedDateHolidayInfo,
    selectedDateIsSunday,
    customHolidayForDate,
    publicHolidayMatches,
    attendanceDate,
    holidayAlertShown,
    loading,
    calendarMonthLoaded,
    calendarInfo.month,
    calendarMonthKey
  ]);

  // Reset holiday alert when date changes
  useEffect(() => {
    setHolidayAlertShown(false);
    setShowHolidayAlert(false);
  }, [attendanceDate]);

  const statusSummaryMeta = {
    submitted: {
      message: 'Attendance already submitted for this date.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700'
    },
    not_marked: {
      message: 'Attendance was not marked on this date.',
      className: 'border-rose-200 bg-rose-50 text-rose-700'
    },
    pending: {
      message: 'Attendance is pending submission today.',
      className: 'border-amber-200 bg-amber-50 text-amber-700'
    },
    upcoming: {
      message: 'This is an upcoming day. Attendance opens on the selected date.',
      className: 'border-blue-200 bg-blue-50 text-blue-700'
    }
  };

  const loadFilterOptions = async (filtersOverride = null, excludeField = null) => {
    try {
      // Use override filters if provided, otherwise use current filters
      const filtersToUse = filtersOverride || filters;

      const cacheKey = JSON.stringify({
        batch: filtersToUse.batch,
        level: filtersToUse.level,
        course: filtersToUse.course,
        branch: filtersToUse.branch,
        excludeField: excludeField
      });
      const cached = filterOptionsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < FILTER_CACHE_TTL_MS) {
        setFilterOptions(cached.filterOptions);
        setCoursesWithBranches(cached.coursesWithBranches || []);
        return;
      }

      // Build query params based on filters for cascading
      // Exclude the field being changed to show all available options
      // IMPORTANT: Always include course filter when course is selected, even when excludeField is 'branch'
      // This ensures branches are always filtered by course when a course is selected
      const params = new URLSearchParams();
      if (filtersToUse.batch && excludeField !== 'batch') params.append('batch', filtersToUse.batch);
      if (filtersToUse.level && excludeField !== 'level') params.append('level', filtersToUse.level);
      // Always include course filter when course is selected (unless course itself is being changed)
      if (filtersToUse.course && excludeField !== 'course') {
        params.append('course', filtersToUse.course);
      }
      if (filtersToUse.branch && excludeField !== 'branch') params.append('branch', filtersToUse.branch);
      // Note: year and semester are not included so they cascade properly

      const [filtersResponse, coursesResponse] = await Promise.all([
        api.get(`/attendance/filters?${params.toString()}`),
        api.get('/courses', { params: { includeInactive: false } })
      ]);

      if (filtersResponse.data?.success) {
        const data = filtersResponse.data.data || {};
        const nextOptions = {
          batches: data.batches || [],
          courses: data.courses || [],
          branches: data.branches || [],
          years: data.years || [],
          semesters: data.semesters || []
        };
        setFilterOptions(nextOptions);

        filterOptionsCacheRef.current.set(cacheKey, {
          filterOptions: nextOptions,
          coursesWithBranches: coursesResponse.data?.success ? (coursesResponse.data.data || []) : [],
          timestamp: Date.now()
        });
      }

      if (coursesResponse.data?.success) {
        setCoursesWithBranches(coursesResponse.data.data || []);
      }

      // Keep cache bounded
      if (filterOptionsCacheRef.current.size > 30) {
        const firstKey = filterOptionsCacheRef.current.keys().next().value;
        filterOptionsCacheRef.current.delete(firstKey);
      }
    } catch (error) {
      console.warn('Unable to load attendance filter options', error);
    }
  };

  const buildCacheKey = (pageToUse) => {
    const keyObj = {
      attendanceDate,
      page: pageToUse,
      pageSize,
      filters,
      pendingFilter
    };
    return JSON.stringify(keyObj);
  };

  const hydrateFromCache = (cacheEntry) => {
    setStudents(cacheEntry.students || []);
    setStatusMap(cacheEntry.statusMap || {});
    setInitialStatusMap(cacheEntry.initialStatusMap || {});
    setTotalStudents(cacheEntry.totalStudents || 0);
    setAttendanceStatistics(cacheEntry.attendanceStatistics || {
      total: 0,
      present: 0,
      absent: 0,
      marked: 0,
      unmarked: 0
    });
    setSmsResults([]); // keep workflow same
    setSmsStatusMap(cacheEntry.smsStatusMap || {});
    setLastUpdatedAt(null);
    setSelectedDateHolidayInfo(cacheEntry.holidayInfo || null);
  };

  // Helper function to extract holiday reason from grouped data
  const extractHolidayReason = (groupedData) => {
    if (!Array.isArray(groupedData) || groupedData.length === 0) {
      return null;
    }

    // Find the first non-null holiday reason
    for (const item of groupedData) {
      if (item.holidayReasons && item.holidayReasons.trim()) {
        return item.holidayReasons.trim();
      }
    }

    return null;
  };

  const handleDayEndReport = async () => {
    // If modal is already open, just return (prevent multiple opens)
    if (dayEndReportOpen) return;

    setDayEndReportLoading(true);
    try {
      const params = {
        date: attendanceDate,
        student_status: 'Regular'
      };
      if (filters.batch) params.batch = filters.batch;
      if (filters.course) params.course = filters.course;
      if (filters.branch) params.branch = filters.branch;
      if (filters.currentYear) params.year = filters.currentYear;
      if (filters.currentSemester) params.semester = filters.currentSemester;

      const response = await api.get('/attendance/summary', { params });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to fetch day-end report');
      }

      const summary = response.data?.data || {};
      const totalStudents = summary.totalStudents || 0;
      const dailyArray = Array.isArray(summary.daily) ? summary.daily : Object.values(summary.daily || {});
      const safeDaily = (dailyArray || []).filter((d) => d && typeof d === 'object');
      const presentToday = Number(
        safeDaily.find((d) => d.status === 'present')?.count ?? summary.daily?.present ?? 0
      ) || 0;
      const absentToday = Number(
        safeDaily.find((d) => d.status === 'absent')?.count ?? summary.daily?.absent ?? 0
      ) || 0;
      const holidayToday = Number(
        safeDaily.find((d) => d.status === 'holiday')?.count ?? summary.daily?.holiday ?? 0
      ) || 0;
      const markedToday = presentToday + absentToday + holidayToday;
      const unmarkedToday = Math.max(0, totalStudents - markedToday);

      const groupedData = summary.groupedSummary || [];
      setDayEndGrouped(groupedData);

      setDayEndReportData({
        totalStudents,
        presentToday,
        absentToday,
        holidayToday,
        markedToday,
        unmarkedToday,
        filtersSnapshot: { ...filters },
        date: attendanceDate,
        holidayReason: extractHolidayReason(groupedData)
      });

      // Extract unique filter options from the data
      const colleges = [...new Set(groupedData.map(item => item.college).filter(Boolean))].sort();
      const batches = [...new Set(groupedData.map(item => item.batch).filter(Boolean))].sort();
      const courses = [...new Set(groupedData.map(item => item.course).filter(Boolean))].sort();
      // Branches will be filtered dynamically based on college and course selections
      const branches = [...new Set(groupedData.map(item => item.branch).filter(Boolean))].sort();
      // Backend returns 'year' and 'semester', not 'currentYear' and 'currentSemester'
      const years = [...new Set(groupedData.map(item => item.year || item.currentYear).filter(Boolean))].sort();
      const semesters = [...new Set(groupedData.map(item => item.semester || item.currentSemester).filter(Boolean))].sort();

      setDayEndFilterOptions({
        colleges,
        batches,
        courses,
        branches,
        years,
        semesters,
        allData: groupedData // Store all data for cascading filters
      });
      setDayEndReportOpen(true);
    } catch (error) {
      console.error('Day-end report error:', error);
      toast.error(error.response?.data?.message || 'Unable to fetch day-end report');
    } finally {
      setDayEndReportLoading(false);
    }
  };

  const handleDayEndDownload = async (format = 'xlsx') => {
    try {
      const params = new URLSearchParams();
      params.append('date', attendanceDate);
      params.append('format', format);
      params.append('student_status', 'Regular');
      params.append('include_holiday_reason', 'true'); // Include holiday reasons in download
      // Use dayEndFilters instead of filters for table header selections
      if (dayEndFilters.college) params.append('college', dayEndFilters.college);
      if (dayEndFilters.batch) params.append('batch', dayEndFilters.batch);
      if (dayEndFilters.course) params.append('course', dayEndFilters.course);
      if (dayEndFilters.branch) params.append('branch', dayEndFilters.branch);
      if (dayEndFilters.year) params.append('year', dayEndFilters.year);
      if (dayEndFilters.semester) params.append('semester', dayEndFilters.semester);

      const response = await api.get(`/attendance/day-end-download?${params.toString()}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `day_end_report_${attendanceDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${format.toUpperCase()} report`);
    } catch (error) {
      console.error('Download report error:', error);
      toast.error(error.response?.data?.message || 'Unable to download report');
    }
  };

  const handleSendDayEndReports = async () => {
    if (!attendanceDate) {
      toast.error('Please select a date');
      return;
    }

    setSendingReports(true);
    try {
      const response = await api.post('/attendance/send-day-end-reports', {
        date: attendanceDate
      });

      if (response.data?.success) {
        const { totalSent, totalFailed, totalRecipients } = response.data.data || {};
        if (totalSent > 0) {
          toast.success(`Reports sent successfully to ${totalSent} recipient(s)`);
        } else {
          toast.info('No reports were sent. Please check if there are any recipients configured.');
        }
        if (totalFailed > 0) {
          toast.error(`${totalFailed} report(s) failed to send`);
        }
      } else {
        throw new Error(response.data?.message || 'Failed to send reports');
      }
    } catch (error) {
      console.error('Send reports error:', error);
      toast.error(error.response?.data?.message || 'Unable to send reports');
    } finally {
      setSendingReports(false);
    }
  };

  const handleMarkHolidayForFiltered = async () => {
    if (!filters.currentYear || !filters.currentSemester) {
      toast.error('Select year and semester to mark no class work');
      return;
    }

    // Fetch ALL students matching the filters from backend (not just loaded ones)
    // This ensures we mark all students, not just the 50 currently loaded
    setMarkHolidayLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('date', attendanceDate);

      // Add all filter parameters
      if (filters.batch) params.append('batch', filters.batch);
      if (filters.course) params.append('course', filters.course);
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.currentYear) params.append('currentYear', filters.currentYear);
      if (filters.currentSemester) params.append('currentSemester', filters.currentSemester);

      // Use a very large limit to get all students matching the filters
      params.append('limit', '10000');
      params.append('offset', '0');

      const response = await api.get(`/attendance?${params.toString()}`);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to fetch students');
      }

      const allFilteredStudents = response.data.data?.students || [];
      const records = allFilteredStudents
        .filter((s) => Number.isInteger(s.id))
        .map((s) => ({ studentId: s.id, status: 'holiday' }));

      if (records.length === 0) {
        toast.error('No students found to mark as holiday');
        setMarkHolidayLoading(false);
        return;
      }

      // Show modal to enter holiday reason
      setPendingHolidayRecords(records);
      setHolidayReason('');
      setHolidayReasonModalOpen(true);
    } catch (error) {
      console.error('Failed to fetch students for holiday marking:', error);
      toast.error(error.response?.data?.message || 'Unable to fetch students');
    } finally {
      setMarkHolidayLoading(false);
    }
  };

  const handleConfirmHolidayMarking = async () => {
    if (!holidayReason.trim()) {
      toast.error('Please enter a reason for no class work');
      return;
    }
    setHolidayReasonModalOpen(false);
    setMarkHolidayLoading(true);
    try {
      const records = pendingHolidayRecords.map((r) => ({
        ...r,
        holidayReason: holidayReason.trim()
      }));

      // Debug: Log what we're sending to backend
      console.log('Sending holiday records to backend:', {
        attendanceDate,
        recordsCount: records.length,
        sampleRecord: records[0],
        holidayReason: holidayReason.trim(),
        allRecords: records
      });

      await api.post('/attendance', {
        attendanceDate,
        records
      });

      // Debug: Log the response from backend after marking
      console.log('Backend response after marking holidays:', {
        success: true,
        recordsSaved: records.length,
        holidayReasonSent: holidayReason.trim()
      });

      toast.success('Marked as no class work for selected filters');
      await loadAttendance();
      setHolidayReason('');
      setPendingHolidayRecords([]);
    } catch (error) {
      console.error('Mark holiday failed:', error);
      toast.error(error.response?.data?.message || 'Unable to mark as no class work');
    } finally {
      setMarkHolidayLoading(false);
    }
  };

  const handleGetDeleteCount = async () => {
    setGettingDeleteCount(true);
    try {
      const params = new URLSearchParams({
        date: attendanceDate,
        countOnly: 'true'
      });

      // Add filter parameters if they exist
      if (filters.batch) params.append('batch', filters.batch);
      if (filters.course) params.append('course', filters.course);
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.currentYear) params.append('currentYear', filters.currentYear);
      if (filters.currentSemester) params.append('currentSemester', filters.currentSemester);
      if (filters.studentName) params.append('studentName', filters.studentName);
      if (filters.parentMobile) params.append('parentMobile', filters.parentMobile);

      // Use DELETE endpoint with countOnly=true to get the count (it won't actually delete)
      const response = await api.delete(`/attendance?${params.toString()}`);
      setDeleteCount(response.data.data.count || 0);
      setDeleteConfirmModalOpen(true);
    } catch (error) {
      console.error('Failed to get delete count:', error);
      toast.error(error.response?.data?.message || 'Failed to get count of records');
    } finally {
      setGettingDeleteCount(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteConfirmModalOpen(false);
    setDeleteLoading(true);
    try {
      const params = new URLSearchParams({
        date: attendanceDate
      });

      // Add filter parameters if they exist
      if (filters.batch) params.append('batch', filters.batch);
      if (filters.course) params.append('course', filters.course);
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.currentYear) params.append('currentYear', filters.currentYear);
      if (filters.currentSemester) params.append('currentSemester', filters.currentSemester);
      if (filters.studentName) params.append('studentName', filters.studentName);
      if (filters.parentMobile) params.append('parentMobile', filters.parentMobile);

      const response = await api.delete(`/attendance?${params.toString()}`);
      toast.success(response.data.message || `Deleted ${response.data.data.deletedCount} attendance record(s)`);
      await loadAttendance(1);
    } catch (error) {
      console.error('Failed to delete attendance:', error);
      toast.error(error.response?.data?.message || 'Failed to delete attendance records');
    } finally {
      setDeleteLoading(false);
      setDeleteCount(0);
    }
  };

  const loadAttendance = async (pageOverride = null, append = false) => {
    // If appending (infinite scroll), use loadingMore instead of loading
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setSelectedDateHolidayInfo(null);
      // Clear statistics and total students when loading starts to show loading state
      setAttendanceStatistics({
        total: 0,
        present: 0,
        absent: 0,
        marked: 0,
        unmarked: 0
      });
      setTotalStudents(0); // Clear total students count to show loading state
      setLoadedPages(1); // Reset loaded pages when starting fresh
    }

    try {
      // Cancel any in-flight attendance request to avoid queueing when filters change rapidly
      if (pendingRequestRef.current) {
        pendingRequestRef.current.abort();
        pendingRequestRef.current = null;
      }

      const controller = new AbortController();
      pendingRequestRef.current = controller;

      // Check if filters are applied (excluding search filters like studentName and parentMobile)
      const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);

      // When filters are applied, use infinite scroll with 50 students per page
      // When no filters, use pagination normally
      let pageToUse;
      if (hasFilters) {
        if (append) {
          // When appending, load the next page
          pageToUse = loadedPages + 1;
        } else {
          // When starting fresh, reset to page 1
          pageToUse = 1;
        }
      } else {
        pageToUse = pageOverride !== null ? pageOverride : currentPage;
      }
      const cacheKey = buildCacheKey(pageToUse);

      // Check cache and use it immediately if fresh, otherwise continue with fetch
      const cached = attendanceCache.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        hydrateFromCache(cached);
        setCurrentPage(pageToUse);
        setLoading(false);
        return cached.attendanceStatistics || {
          total: 0,
          present: 0,
          absent: 0,
          marked: 0,
          unmarked: 0
        };
      }

      const params = new URLSearchParams();
      params.append('date', attendanceDate);

      if (filters.batch) params.append('batch', filters.batch);
      if (filters.course) params.append('course', filters.course);
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.currentYear) params.append('currentYear', filters.currentYear);
      if (filters.currentSemester) params.append('currentSemester', filters.currentSemester);
      if (filters.studentName) params.append('studentName', filters.studentName.trim());
      if (filters.parentMobile) params.append('parentMobile', filters.parentMobile.trim());

      // Apply attendance status filter based on pendingFilter
      if (pendingFilter === 'pending') {
        params.append('attendanceStatus', 'unmarked');
      } else if (pendingFilter === 'marked') {
        params.append('attendanceStatus', 'marked');
      }

      // When filters are applied, use infinite scroll with 50 students per page
      // When no filters, use pagination normally
      if (hasFilters) {
        // Use 50 students per page for infinite scroll when filters are applied
        const filterPageSize = 50;
        params.append('limit', filterPageSize.toString());
        params.append('offset', ((pageToUse - 1) * filterPageSize).toString());
      } else {
        // When no filters, use pagination for better performance
        params.append('limit', pageSize.toString());
        params.append('offset', ((pageToUse - 1) * pageSize).toString());
      }

      const response = await api.get(`/attendance?${params.toString()}`, { signal: controller.signal });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to fetch attendance');
      }

      // Debug: Log what we received from backend
      console.log('Received attendance data from backend:', {
        success: response.data?.success,
        totalStudents: response.data?.data?.students?.length,
        sampleStudents: response.data?.data?.students?.slice(0, 3).map(s => ({
          id: s.id,
          name: s.name,
          attendanceStatus: s.attendance_status,
          holidayReason: s.holiday_reason,
          attendanceRecordId: s.attendance_record_id,
          allFields: Object.keys(s)
        })),
        fullResponse: response.data
      });

      const fetchedStudents = (response.data.data?.students || []).map((student) => {
        // Parse student_data if present to derive statuses
        let parsedData = {};
        if (student.student_data) {
          try {
            parsedData =
              typeof student.student_data === 'string'
                ? JSON.parse(student.student_data || '{}')
                : student.student_data || {};
          } catch (_e) {
            parsedData = {};
          }
        }

        const regRaw =
          student.registration_status ||
          parsedData['Registration Status'] ||
          student.registrationStatus ||
          parsedData.registration_status ||
          parsedData['Registration Status'] ||
          '';
        const registration_status = regRaw && typeof regRaw === 'string'
          ? regRaw.trim()
          : regRaw;

        // If student has attendanceStatus, use it; otherwise default to 'present' for display
        const status = student.attendanceStatus ? student.attendanceStatus.toLowerCase() : 'present';

        // Enhanced holiday reason mapping - ensure we get it from multiple possible sources
        let holidayReason = student.holiday_reason || null;

        // If no holiday_reason from main query, try to get it from student_data as fallback
        if (!holidayReason && parsedData && parsedData.holiday_reason) {
          holidayReason = parsedData.holiday_reason;
        }

        // Debug: Log holiday data for investigation
        if (student.attendanceStatus === 'holiday' || student.holiday_reason || holidayReason) {
          console.log('Holiday Data Debug:', {
            studentId: student.id,
            studentName: student.name,
            attendanceStatus: student.attendanceStatus,
            holiday_reason: student.holiday_reason,
            holidayReason: holidayReason,
            parsedDataHoliday: parsedData.holiday_reason,
            originalStudent: student,
            mappedStatus: status,
            hasHolidayReason: !!holidayReason,
            allStudentFields: Object.keys(student)
          });
        }

        return {
          ...student,
          registration_status,
          attendanceStatus: status,
          holidayReason: holidayReason,
          // Normalize admission number field for downstream handlers
          admissionNumber: student.admissionNumber || student.admission_number || student.admissionNo || null,
          // Keep track of whether student was actually marked in DB
          hasAttendanceRecord: !!student.attendanceStatus
        };
      });

      // Debug: Log the final mapped students
      console.log('Final mapped students:', {
        totalMapped: fetchedStudents.length,
        holidayStudents: fetchedStudents.filter(s => s.attendanceStatus === 'holiday').map(s => ({
          id: s.id,
          name: s.name,
          attendanceStatus: s.attendanceStatus,
          holidayReason: s.holidayReason,
          hasHolidayReason: !!s.holidayReason
        }))
      });

      const statusSnapshot = {};
      fetchedStudents.forEach((student) => {
        // Only set initial status if student was actually marked in database
        // If not marked, leave undefined so we know it needs to be saved
        if (student.hasAttendanceRecord) {
          statusSnapshot[student.id] = student.attendanceStatus || 'present';
        }
        // If not marked, don't set initial status - this allows saving even when all are present
      });

      // Build SMS status map from API response
      const newSmsStatusMap = {};
      fetchedStudents.forEach((student) => {
        // Only show SMS status for absent students who have SMS sent status
        if (student.attendanceStatus === 'absent' && student.smsSent) {
          newSmsStatusMap[student.id] = {
            success: true,
            mocked: false,
            skipped: false,
            reason: null,
            sentTo: student.parentMobile1 || student.parentMobile2 || null,
            studentName: student.studentName,
            admissionNumber: student.admissionNumber || null
          };
        }
      });

      // Get pagination data
      const paginationData = response.data?.pagination || {};
      const total = paginationData.total ?? fetchedStudents.length ?? 0;

      // Get statistics from API response (based on total students, not just current page)
      const statistics = response.data?.data?.statistics;

      // If statistics not provided, calculate defaults
      let finalStatistics;
      if (!statistics) {
        finalStatistics = {
          total: total,
          present: 0,
          absent: 0,
          marked: 0,
          unmarked: total
        };
      } else {
        // Ensure unmarked is calculated correctly
        const calculatedUnmarked = Math.max(0, (statistics.total || total) - (statistics.marked || 0));
        finalStatistics = {
          ...statistics,
          total: statistics.total || total,
          unmarked: statistics.unmarked !== undefined ? statistics.unmarked : calculatedUnmarked
        };
      }

      // Handle appending for infinite scroll vs replacing
      if (append && hasFilters) {
        // Append new students to existing list
        setStudents(prevStudents => {
          // Avoid duplicates by checking IDs
          const existingIds = new Set(prevStudents.map(s => s.id));
          const newStudents = fetchedStudents.filter(s => !existingIds.has(s.id));
          const updatedStudents = [...prevStudents, ...newStudents];
          // Update hasMore based on whether we got a full page and if there are more to load
          setHasMore(fetchedStudents.length === 50 && updatedStudents.length < total);
          return updatedStudents;
        });
        // Merge status maps
        setStatusMap(prev => ({ ...prev, ...statusSnapshot }));
        setInitialStatusMap(prev => ({ ...prev, ...statusSnapshot }));
        setSmsStatusMap(prev => ({ ...prev, ...newSmsStatusMap }));
        setLoadedPages(pageToUse);
      } else {
        // Replace students (initial load or no filters)
        setStudents(fetchedStudents);
        setStatusMap(statusSnapshot);
        setInitialStatusMap({ ...statusSnapshot });
        setSmsStatusMap(newSmsStatusMap);
        if (hasFilters) {
          setLoadedPages(1);
          // Check if there are more pages to load
          setHasMore(fetchedStudents.length === 50 && fetchedStudents.length < total);
        }
      }

      setTotalStudents(total);
      setAttendanceStatistics(finalStatistics);

      // Always set current page to the page we just loaded
      setCurrentPage(pageToUse);
      setSmsResults([]);
      setLastUpdatedAt(null); // Clear last updated when loading new data

      if (response.data?.data?.holiday) {
        setSelectedDateHolidayInfo(response.data.data.holiday);
      }

      // Cache the result for fast subsequent renders with same filters/date/page
      attendanceCache.current.set(cacheKey, {
        students: fetchedStudents,
        statusMap: statusSnapshot,
        initialStatusMap: { ...statusSnapshot },
        totalStudents: total,
        attendanceStatistics: finalStatistics,
        smsStatusMap: newSmsStatusMap,
        holidayInfo: response.data?.data?.holiday || null,
        timestamp: Date.now()
      });
      // Keep cache size bounded
      if (attendanceCache.current.size > 50) {
        const firstKey = attendanceCache.current.keys().next().value;
        attendanceCache.current.delete(firstKey);
      }

      // Reset pending filter when loading new data if no pending students
      if (pendingFilter !== 'all' && finalStatistics.unmarked === 0) {
        setPendingFilter('all');
      }

      // Return statistics so we can check if all batches are marked after save
      return finalStatistics;
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.name === 'AbortError') {
        // Request was aborted; let the next request handle UI updates
        return;
      }
      console.error('Attendance fetch failed:', error);
      if (append) {
        setLoadingMore(false);
      } else {
        toast.error(error.response?.data?.message || 'Unable to load attendance');
        setStudents([]);
        setStatusMap({});
        setInitialStatusMap({});
        setTotalStudents(0);
        setSelectedDateHolidayInfo(null);
        // Keep statistics cleared on error to show loading state
        setAttendanceStatistics({
          total: 0,
          present: 0,
          absent: 0,
          marked: 0,
          unmarked: 0
        });
      }
    } finally {
      // Only clear loading if this is the latest request
      pendingRequestRef.current = null;
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }

    // Return default statistics if function completes without returning
    return {
      total: 0,
      present: 0,
      absent: 0,
      marked: 0,
      unmarked: 0
    };
  };

  // Load more students for infinite scroll
  const loadMoreStudents = async () => {
    const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);
    if (!hasFilters || loadingMore || !hasMore) {
      return;
    }
    await loadAttendance(null, true);
  };

  // Set up Intersection Observer for infinite scroll when filters are applied
  useEffect(() => {
    const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);

    if (!hasFilters || !scrollObserverRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore) {
          loadMoreStudents();
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching the bottom
        threshold: 0.1
      }
    );

    observer.observe(scrollObserverRef.current);

    return () => {
      if (scrollObserverRef.current) {
        observer.unobserve(scrollObserverRef.current);
      }
    };
  }, [filters.batch, filters.course, filters.branch, filters.currentYear, filters.currentSemester, hasMore, loadingMore, students.length]);

  useEffect(() => {
    if (!calendarMonthKey) return;
    fetchCalendarMonth(calendarMonthKey, { applyToHeader: true }).catch(() => {
      ensureCalendarFallback(calendarMonthKey);
    });
  }, [calendarMonthKey]);

  useEffect(() => {
    if (!calendarModalOpen) return;
    if (!calendarViewMonthKey) return;
    fetchCalendarMonth(calendarViewMonthKey, { applyToModal: true }).catch(() => {
      ensureCalendarFallback(calendarViewMonthKey);
    });
  }, [calendarModalOpen, calendarViewMonthKey]);

  const filtersLoadedRef = useRef(false);

  // Fetch courses with level information
  useEffect(() => {
    const fetchCoursesWithLevels = async () => {
      try {
        const response = await api.get('/courses?includeInactive=false');
        if (response.data?.success) {
          setCoursesWithLevels(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch courses with levels:', error);
      }
    };
    fetchCoursesWithLevels();
  }, []);

  useEffect(() => {
    const initializeAttendance = async () => {
      // Load filter options and attendance in parallel for faster initial load
      // This reduces the time to first meaningful paint
      const [filterOptionsResult] = await Promise.allSettled([
        loadFilterOptions()
      ]);

      filtersLoadedRef.current = true;

      // Load attendance immediately, even if filter options are still loading
      // This ensures data appears as quickly as possible
      setCurrentPage(1);
      loadAttendance(1);
    };
    initializeAttendance();
  }, []);

  // Reload filter options when batch, level, course, or branch changes (for cascading)
  // This ensures child filters show correct options when parent filters change
  useEffect(() => {
    if (filtersLoadedRef.current) {
      loadFilterOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.batch, filters.level, filters.course, filters.branch]);

  // Load attendance with debouncing when filters change (only after initial load)
  // This prevents excessive API calls when filters change rapidly
  useEffect(() => {
    if (!filtersLoadedRef.current) return;

    setCurrentPage(1);
    setLoadedPages(1); // Reset loaded pages when filters change
    setHasMore(false); // Reset hasMore when filters change

    // Debounce filter changes to avoid excessive API calls
    const debounceTimer = setTimeout(() => {
      loadAttendance(1);
    }, 300); // 300ms debounce for filter changes

    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attendanceDate,
    filters.batch,
    filters.course,
    filters.branch,
    filters.currentYear,
    filters.currentSemester,
    pageSize,
    pendingFilter
  ]);

  useEffect(() => {
    if (!searchEffectInitialized.current) {
      searchEffectInitialized.current = true;
      return;
    }

    setCurrentPage(1);
    const handle = setTimeout(() => {
      loadAttendance(1);
    }, 400);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.studentName, filters.parentMobile]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      const newFilters = {
        ...prev,
        [field]: value || '' // Clear filter if empty value
      };

      // Remove empty filters
      if (!newFilters[field] || newFilters[field] === '') {
        delete newFilters[field];
      }

      // Clear dependent filters when parent filter changes
      if (field === 'course') {
        // When course changes, clear branch
        delete newFilters.branch;
      } else if (field === 'level') {
        // When level changes, clear course and branch (course options change)
        delete newFilters.course;
        delete newFilters.branch;
      } else if (field === 'batch') {
        // When batch changes, clear year and semester
        delete newFilters.currentYear;
        delete newFilters.currentSemester;
      } else if (field === 'currentYear') {
        // When year changes, clear semester
        delete newFilters.currentSemester;
      }

      return newFilters;
    });
  };

  // Sorting handler
  const handleSort = (field) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return { field, direction: 'asc' };
    });
  };

  // Column reordering handlers
  const moveColumn = (columnKey, direction) => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(columnKey);
      if (index === -1) return prev;

      const newOrder = [...prev];
      if (direction === 'left' && index > 0) {
        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      } else if (direction === 'right' && index < newOrder.length - 1) {
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      }
      return newOrder;
    });
  };

  // Helper function to extract numeric part from PIN (last 4-5 digits)
  const extractPinNumeric = (pinString) => {
    if (!pinString) return 0;
    const pin = String(pinString);
    // Extract the last 4-5 consecutive digits from the end
    // Match digits at the end of the string (greedy, up to 5 digits)
    const match = pin.match(/(\d{4,5})$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    // Fallback: try to extract any numeric part
    const allDigits = pin.match(/\d+/g);
    if (allDigits && allDigits.length > 0) {
      // Take the last group of digits
      return parseInt(allDigits[allDigits.length - 1], 10);
    }
    // If no digits found, try parsing the whole string
    const parsed = parseFloat(pin);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Helper function to extract series prefix from PIN
  const extractPinSeries = (pinString) => {
    if (!pinString) return '';
    const pin = String(pinString);
    // Remove the last 4-5 digits to get the series prefix
    const numericMatch = pin.match(/(\d{4,5})$/);
    if (numericMatch) {
      return pin.substring(0, pin.length - numericMatch[1].length);
    }
    // Fallback: return everything except the last numeric part
    const allDigits = pin.match(/\d+/g);
    if (allDigits && allDigits.length > 0) {
      const lastDigits = allDigits[allDigits.length - 1];
      const lastIndex = pin.lastIndexOf(lastDigits);
      return pin.substring(0, lastIndex);
    }
    return pin;
  };

  // Filter students based on pending filter
  // Since we now filter on the backend via pendingFilter -> attendanceStatus param,
  // we just return the students array as is.
  const filteredStudents = useMemo(() => {
    return students;
  }, [students]);

  // Sort students based on sortConfig
  const sortedStudents = useMemo(() => {
    if (!sortConfig.field) return filteredStudents;

    return [...students].sort((a, b) => {
      let aValue, bValue;
      let isNumeric = false; // Flag to determine if we should sort numerically

      switch (sortConfig.field) {
        case 'student':
          // Name: string sorting (alphabetical)
          aValue = (a.studentName || '').toLowerCase();
          bValue = (b.studentName || '').toLowerCase();
          isNumeric = false;
          break;
        case 'pin':
          // PIN/Roll Number: extract numeric part from the end (last 4-5 digits)
          // First compare by series, then by numeric part
          const aPin = String(a.pinNumber || '');
          const bPin = String(b.pinNumber || '');
          const aSeries = extractPinSeries(aPin);
          const bSeries = extractPinSeries(bPin);

          // If series are different, sort by series first
          if (aSeries !== bSeries) {
            const seriesComparison = aSeries.localeCompare(bSeries);
            return sortConfig.direction === 'asc' ? seriesComparison : -seriesComparison;
          }

          // Same series, sort by numeric part
          aValue = extractPinNumeric(aPin);
          bValue = extractPinNumeric(bPin);
          isNumeric = true;
          break;
        case 'batch':
          // Batch: try numeric first, fallback to string
          aValue = a.batch || '';
          bValue = b.batch || '';
          const aBatchNum = parseFloat(aValue);
          const bBatchNum = parseFloat(bValue);
          if (!isNaN(aBatchNum) && !isNaN(bBatchNum)) {
            aValue = aBatchNum;
            bValue = bBatchNum;
            isNumeric = true;
          } else {
            aValue = String(aValue).toLowerCase();
            bValue = String(bValue).toLowerCase();
            isNumeric = false;
          }
          break;
        case 'course':
          // Course: string sorting
          aValue = (a.course || '').toLowerCase();
          bValue = (b.course || '').toLowerCase();
          isNumeric = false;
          break;
        case 'branch':
          // Branch: string sorting
          aValue = (a.branch || '').toLowerCase();
          bValue = (b.branch || '').toLowerCase();
          isNumeric = false;
          break;
        case 'year':
          // Year: numeric sorting
          aValue = parseFloat(a.currentYear) || 0;
          bValue = parseFloat(b.currentYear) || 0;
          isNumeric = true;
          break;
        case 'semester':
          // Semester: numeric sorting
          aValue = parseFloat(a.currentSemester) || 0;
          bValue = parseFloat(b.currentSemester) || 0;
          isNumeric = true;
          break;
        case 'parentContact':
          // Parent Contact: string sorting (phone numbers as strings)
          aValue = (a.parentMobile1 || a.parentMobile2 || '').toLowerCase();
          bValue = (b.parentMobile1 || b.parentMobile2 || '').toLowerCase();
          isNumeric = false;
          break;
        case 'attendance':
          // Attendance: string sorting (present/absent)
          aValue = (effectiveStatus(a.id) || '').toLowerCase();
          bValue = (effectiveStatus(b.id) || '').toLowerCase();
          isNumeric = false;
          break;
        default:
          return 0;
      }

      // Handle numeric sorting
      if (isNumeric) {
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      // Handle string sorting
      const comparison = String(aValue).localeCompare(String(bValue));
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredStudents, sortConfig, statusMap]);

  // Handle student row click to show report
  const handleStudentClick = async (student) => {
    setSelectedStudent(student);
    setHistoryData(null);
    setHistoryModalOpen(true);
    setHistoryLoading(true);

    try {
      const data = await fetchStudentHistoryData(student.id);
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to load student attendance history:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to load attendance history');
      setHistoryModalOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStatusChange = (studentId, status) => {
    if (editingLocked) {
      toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
      return;
    }
    setStatusMap((prev) => {
      const current = prev[studentId] || null;
      if (current === status) {
        return prev;
      }
      return {
        ...prev,
        [studentId]: status
      };
    });
  };



  const handlePageChange = (newPage) => {
    if (loading) {
      return;
    }

    const safePageSize = pageSize || 1;
    const totalPages = totalStudents > 0 ? Math.max(1, Math.ceil(totalStudents / safePageSize)) : 1;

    if (newPage === currentPage || newPage < 1 || newPage > totalPages) {
      return;
    }

    loadAttendance(newPage);
  };

  const handlePageSizeChange = (event) => {
    const newSize = parseInt(event.target.value, 10);

    if (loading) {
      return;
    }

    if (Number.isNaN(newSize) || newSize <= 0 || newSize === pageSize) {
      return;
    }

    setCurrentPage(1);
    setPageSize(newSize);
    // loadAttendance will be called by useEffect when pageSize changes
  };

  const handleRetryCalendarFetch = () => {
    if (!calendarMonthKey) return;
    fetchCalendarMonth(calendarMonthKey, { applyToHeader: true, force: true }).catch(() => {
      ensureCalendarFallback(calendarMonthKey);
    });
  };

  const handleOpenCalendarModal = async () => {
    const monthKey = calendarMonthKey || getMonthKeyFromDate(formatDateInput(new Date()));
    setCalendarModalOpen(true);
    setCalendarViewError(null);
    setCalendarViewMonthKey(monthKey);
    try {
      await fetchCalendarMonth(monthKey, { applyToModal: true });
    } catch (error) {
      ensureCalendarFallback(monthKey);
    }
  };

  const handleCloseCalendarModal = () => {
    setCalendarModalOpen(false);
    setCalendarViewError(null);
  };

  const handleCalendarMonthChange = (newMonthKey) => {
    if (!newMonthKey) return;
    setCalendarViewError(null);
    setCalendarViewMonthKey(newMonthKey);
  };

  const handleCalendarDateSelect = (date) => {
    if (!date) return;
    setAttendanceDate(date);
    const nextMonthKey = getMonthKeyFromDate(date);
    if (nextMonthKey && nextMonthKey !== calendarViewMonthKey) {
      setCalendarViewMonthKey(nextMonthKey);
    }
  };

  const handleCreateInstituteHoliday = async ({ date, title, description }) => {
    if (!date) return;
    setCalendarMutationLoading(true);
    try {
      const response = await api.post('/calendar/custom-holidays', {
        date,
        title,
        description
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save holiday');
      }

      const savedHoliday = response.data.data;
      const holidayMonthKey = getMonthKeyFromDate(savedHoliday?.date || date);
      const modalMonthKey = calendarViewMonthKey || (calendarModalOpen ? getMonthKeyFromDate(attendanceDate) : null);

      // Refresh the month where the holiday was saved
      await fetchCalendarMonth(holidayMonthKey, {
        applyToHeader: holidayMonthKey === calendarMonthKey,
        applyToModal: calendarModalOpen && holidayMonthKey === modalMonthKey,
        force: true
      });

      // If modal is viewing a different month, refresh that month too
      if (calendarModalOpen && modalMonthKey && modalMonthKey !== holidayMonthKey) {
        await fetchCalendarMonth(modalMonthKey, {
          applyToHeader: false,
          applyToModal: true,
          force: true
        });
      }

      toast.success('Institute holiday saved');

      if (attendanceDate === savedHoliday?.date) {
        const reasons = [];
        if (selectedDateIsSunday) {
          reasons.push('Sunday');
        }
        if (selectedDateHolidayInfo?.publicHoliday) {
          reasons.push(
            selectedDateHolidayInfo.publicHoliday.localName ||
            selectedDateHolidayInfo.publicHoliday.name ||
            'Public holiday'
          );
        }
        reasons.push(
          savedHoliday.title ? `Institute holiday: ${savedHoliday.title}` : 'Institute holiday'
        );

        setSelectedDateHolidayInfo({
          date: savedHoliday.date,
          isNonWorkingDay: true,
          isSunday: selectedDateIsSunday,
          publicHoliday: selectedDateHolidayInfo?.publicHoliday || null,
          customHoliday: savedHoliday,
          reasons
        });
      }
    } catch (error) {
      console.error('Failed to save custom holiday:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to save holiday');
    } finally {
      setCalendarMutationLoading(false);
    }
  };

  const handleRemoveInstituteHoliday = async (date) => {
    if (!date) return;
    setCalendarMutationLoading(true);
    try {
      const response = await api.delete(`/calendar/custom-holidays/${date}`);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to remove holiday');
      }

      const monthKey = getMonthKeyFromDate(date);

      await fetchCalendarMonth(monthKey, {
        applyToHeader: monthKey === calendarMonthKey,
        applyToModal: calendarModalOpen && monthKey === (calendarViewMonthKey || monthKey),
        force: true
      });

      toast.success('Institute holiday removed');

      if (attendanceDate === date) {
        const reasons = [];
        if (selectedDateIsSunday) {
          reasons.push('Sunday');
        }
        if (selectedDateHolidayInfo?.publicHoliday) {
          reasons.push(
            selectedDateHolidayInfo.publicHoliday.localName ||
            selectedDateHolidayInfo.publicHoliday.name ||
            'Public holiday'
          );
        }

        const isStillHoliday = reasons.length > 0;

        setSelectedDateHolidayInfo(
          isStillHoliday
            ? {
              date,
              isNonWorkingDay: true,
              isSunday: selectedDateIsSunday,
              publicHoliday: selectedDateHolidayInfo?.publicHoliday || null,
              customHoliday: null,
              reasons
            }
            : null
        );
      }
    } catch (error) {
      console.error('Failed to delete custom holiday:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to delete holiday');
    } finally {
      setCalendarMutationLoading(false);
    }
  };

  const handleCalendarModalRetry = () => {
    if (!calendarViewMonthKey) return;
    fetchCalendarMonth(calendarViewMonthKey, { applyToModal: true, force: true }).catch(() => {
      ensureCalendarFallback(calendarViewMonthKey);
    });
  };

  const prepareAttendanceReport = () => {
    const presentStudents = [];
    const absentStudents = [];

    students.forEach((student) => {
      const current = effectiveStatus(student.id);
      if (current === 'present') {
        presentStudents.push(student);
      } else if (current === 'absent') {
        absentStudents.push(student);
      }
    });

    return {
      totalStudents: totalStudents, // Use total from pagination
      presentCount: presentStudents.length,
      absentCount: absentStudents.length,
      presentStudents,
      absentStudents,
      absentPinNumbers: absentStudents
        .map(s => s.pinNumber || s.pin_no || 'N/A')
        .filter(pin => pin !== 'N/A')
    };
  };

  const handleSaveClick = () => {
    if (editingLocked) {
      toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
      return;
    }

    const report = prepareAttendanceReport();

    // Check if there are any changes or unmarked students
    const hasChanges = students.some((student) => {
      const current = effectiveStatus(student.id);
      const initial = initialStatusMap[student.id];
      // If student doesn't have initial status, they need to be saved
      if (initial === undefined) return true;
      return current !== initial;
    });

    // Allow saving if there are students, even if all are present
    // Only prevent if there are truly no students to save
    if (!hasChanges && students.length === 0) {
      toast('Nothing to save');
      return;
    }

    setAttendanceReport(report);
    setShowReportModal(true);
  };

  const handleConfirmSave = async () => {
    if (editingLocked) {
      toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
      return;
    }
    const records = students
      .map((student) => {
        const current = effectiveStatus(student.id);
        const initial = initialStatusMap[student.id];

        // Save if:
        // 1. Status has changed from initial, OR
        // 2. Student doesn't have an initial status (not yet marked in database)
        // This allows saving even when all students are present
        if (initial !== undefined && current === initial) {
          return null; // No change, skip
        }

        return {
          studentId: student.id,
          status: current,
          studentName: student.studentName,
          parentMobile: student.parentMobile1 || student.parentMobile2,
          batch: student.batch,
          course: student.course,
          branch: student.branch,
          currentYear: student.currentYear,
          currentSemester: student.currentSemester
        };
      })
      .filter(Boolean);

    if (records.length === 0) {
      toast('Nothing to save');
      setShowReportModal(false);
      return;
    }

    setSaving(true);
    setShowReportModal(false);
    try {
      const response = await api.post('/attendance', {
        attendanceDate,
        records
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to save attendance');
      }

      setInitialStatusMap({ ...statusMap });
      setStudents((prev) =>
        prev.map((student) => ({
          ...student,
          attendanceStatus: statusMap[student.id] || 'present'
        }))
      );

      // Invalidate cache for current date to ensure fresh data after save
      const cacheKey = buildCacheKey(currentPage);
      attendanceCache.current.delete(cacheKey);
      // Also invalidate all cache entries for this date to ensure consistency
      const dateCacheKey = JSON.stringify({ attendanceDate, page: null });
      for (const key of attendanceCache.current.keys()) {
        if (key.includes(attendanceDate)) {
          attendanceCache.current.delete(key);
        }
      }

      // Reload attendance to get updated statistics
      const updatedStats = await loadAttendance(currentPage);

      // Check if all batches are marked - if unmarked count is 0, show day-end report popup
      if (updatedStats && updatedStats.unmarked === 0 && updatedStats.total > 0 && !allBatchesMarkedModalOpen) {
        // Show day-end report popup after a short delay to let the user see the success message
        setTimeout(() => {
          handleDayEndReport();
          setAllBatchesMarkedModalOpen(true);
        }, 1000);
      }

      const results = response.data.data?.smsResults || [];
      setSmsResults(results);

      // Build SMS status map for quick lookup
      const newSmsStatusMap = {};
      results.forEach(result => {
        newSmsStatusMap[result.studentId] = {
          success: result.success,
          mocked: result.mocked,
          skipped: result.skipped,
          reason: result.reason,
          sentTo: result.sentTo || result.parentMobile,
          studentName: result.studentName,
          admissionNumber: result.admissionNumber
        };
      });
      setSmsStatusMap(newSmsStatusMap);

      setSmsCurrentPage(1);
      if (results.length > 0) {
        setSmsModalOpen(true);
      }
      setLastUpdatedAt(new Date().toISOString());

      const smsSent = results.filter((result) => !result.skipped && result.success).length;
      const smsSkipped = results.filter((result) => result.skipped).length;
      const smsFailed = results.filter((result) => !result.success && !result.skipped).length;

      let successMessage = 'Attendance updated successfully';
      if (smsSent || smsSkipped || smsFailed) {
        successMessage += ` (SMS: ${smsSent} sent`;
        if (smsSkipped) successMessage += `, ${smsSkipped} skipped`;
        if (smsFailed) successMessage += `, ${smsFailed} failed`;
        successMessage += ')';
      }

      toast.success(successMessage);
    } catch (error) {
      console.error('Attendance save failed:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = handleSaveClick;

  // Retry SMS for a specific student
  const handleRetrySms = async (student) => {
    if (!student || retryingSmsFor) return;

    setRetryingSmsFor(student.id);
    try {
      const response = await api.post('/attendance/retry-sms', {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        attendanceDate: attendanceDate,
        parentMobile: student.parentMobile1 || student.parentMobile2
      });

      if (response.data?.success) {
        const result = response.data.data;

        // Update SMS status map
        setSmsStatusMap(prev => ({
          ...prev,
          [student.id]: {
            success: result.success,
            mocked: result.mocked,
            skipped: result.skipped,
            reason: result.reason,
            sentTo: result.sentTo,
            studentName: student.studentName,
            admissionNumber: student.admissionNumber
          }
        }));

        // Update smsResults array
        setSmsResults(prev => prev.map(r =>
          r.studentId === student.id
            ? { ...r, ...result }
            : r
        ));

        if (result.success) {
          toast.success(`SMS ${result.mocked ? 'simulated' : 'sent'} to ${result.sentTo || student.parentMobile1}`);
        } else {
          toast.error(`SMS failed: ${result.reason || 'Unknown error'}`);
        }
      } else {
        toast.error(response.data?.message || 'Failed to retry SMS');
      }
    } catch (error) {
      console.error('SMS retry failed:', error);
      toast.error(error.response?.data?.message || 'Failed to retry SMS');
    } finally {
      setRetryingSmsFor(null);
    }
  };

  const renderPhoto = (student) => {
    if (student.photo) {
      const src = student.photo.startsWith('data:')
        ? student.photo
        : getStaticFileUrlDirect(student.photo);
      return (
        <img
          src={src}
          alt={student.studentName || 'Student'}
          className="w-7 h-7 rounded-full object-cover border border-gray-100"
        />
      );
    }

    const initials = (student.studentName || 'NA')
      .split(' ')
      .slice(0, 1)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();

    return (
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold">
        {initials || 'NA'}
      </div>
    );
  };

  const fetchStudentHistoryData = async (studentId) => {
    const response = await api.get(`/attendance/student/${studentId}/history`);
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to fetch attendance history');
    }
    return response.data.data;
  };



  const csvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const buildStudentReportCsv = (student, history) => {
    const rows = [];
    const weeklyTotals = history?.weekly?.totals || { present: 0, absent: 0, unmarked: 0 };
    const monthlyTotals = history?.monthly?.totals || { present: 0, absent: 0, unmarked: 0 };
    const semesterTotals = history?.semester?.totals || { present: 0, absent: 0, unmarked: 0 };

    rows.push(csvValue('Student Name') + ',' + csvValue(student.studentName || 'Unknown'));
    rows.push(csvValue('PIN Number') + ',' + csvValue(student.pinNumber || 'N/A'));
    rows.push(csvValue('Batch') + ',' + csvValue(student.batch || 'N/A'));
    rows.push(csvValue('Course') + ',' + csvValue(student.course || 'N/A'));
    rows.push(csvValue('Branch') + ',' + csvValue(student.branch || 'N/A'));
    rows.push(csvValue('Current Year') + ',' + csvValue(student.currentYear || 'N/A'));
    rows.push(csvValue('Current Semester') + ',' + csvValue(student.currentSemester || 'N/A'));
    rows.push('');

    if (history?.semester) {
      rows.push(csvValue('Semester Summary'));
      rows.push(csvValue('Period') + ',' + csvValue(`${history.semester.startDate} → ${history.semester.endDate}`));
      rows.push(
        [csvValue('Present'), csvValue('Absent'), csvValue('Unmarked'), csvValue('Holidays')].join(',')
      );
      rows.push(
        [
          csvValue(semesterTotals.present || 0),
          csvValue(semesterTotals.absent || 0),
          csvValue(semesterTotals.unmarked || 0),
          csvValue(semesterTotals.holidays || 0)
        ].join(',')
      );
      const totalWorkingDays = (semesterTotals.present || 0) + (semesterTotals.absent || 0) + (semesterTotals.unmarked || 0);
      const presentDays = semesterTotals.present || 0;
      const percentage = totalWorkingDays > 0 ? ((presentDays / totalWorkingDays) * 100).toFixed(2) : '0.00';
      rows.push(csvValue('Attendance Percentage') + ',' + csvValue(`${percentage}%`));
      rows.push('');
    }

    rows.push(csvValue('Weekly Summary'));
    rows.push(
      [csvValue('Present'), csvValue('Absent'), csvValue('Unmarked'), csvValue('Holidays')].join(',')
    );
    rows.push(
      [
        csvValue(weeklyTotals.present || 0),
        csvValue(weeklyTotals.absent || 0),
        csvValue(weeklyTotals.unmarked || 0),
        csvValue(weeklyTotals.holidays || 0)
      ].join(',')
    );
    rows.push('');

    rows.push(csvValue('Monthly Summary'));
    rows.push(
      [csvValue('Present'), csvValue('Absent'), csvValue('Unmarked'), csvValue('Holidays')].join(',')
    );
    rows.push(
      [
        csvValue(monthlyTotals.present || 0),
        csvValue(monthlyTotals.absent || 0),
        csvValue(monthlyTotals.unmarked || 0),
        csvValue(monthlyTotals.holidays || 0)
      ].join(',')
    );
    rows.push('');

    rows.push([csvValue('Date'), csvValue('Status')].join(','));
    const seriesToUse = history?.semester?.series || history?.monthly?.series || [];
    seriesToUse.forEach((entry) => {
      const status = entry.status
        ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1)
        : entry.isHoliday ? 'Holiday' : 'Unmarked';
      rows.push([csvValue(entry.date), csvValue(status)].join(','));
    });

    return rows.join('\n');
  };

  const sanitizeFileName = (name) => {
    if (!name) return 'student';
    return name.replace(/[^a-z0-9_\-]+/gi, '_').substring(0, 60) || 'student';
  };

  const handleDownloadReport = async (student) => {
    setDownloadingStudentId(student.id);
    try {
      const history =
        selectedStudent?.id === student.id && historyData
          ? historyData
          : await fetchStudentHistoryData(student.id);

      const csvContent = buildStudentReportCsv(student, history);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      link.href = url;
      link.setAttribute(
        'download',
        `${sanitizeFileName(student.studentName || student.pinNumber || 'student')}_attendance_${today}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Attendance report downloaded');
    } catch (error) {
      console.error('Failed to download attendance report:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to download report');
    } finally {
      setDownloadingStudentId(null);
    }
  };

  const buildChartSeries = (series = []) =>
    series.map((entry) => ({
      date: entry.date,
      present: entry.status === 'present' ? 1 : 0,
      absent: entry.status === 'absent' ? 1 : 0,
      unmarked: entry.status === 'unmarked' ? 1 : 0,
      holiday: entry.status === 'holiday' ? 1 : 0
    }));

  const weeklyChartSeries = historyData ? buildChartSeries(historyData.weekly?.series) : [];
  const monthlyChartSeries = historyData ? buildChartSeries(historyData.monthly?.series) : [];
  const semesterChartSeries = historyData ? buildChartSeries(historyData.semester?.series) : [];

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-2 lg:space-y-3">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between py-1">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-blue-100 p-1.5 text-blue-600 flex-shrink-0">
            <CalendarCheck size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 heading-font">Attendance</h1>
            <p className="text-[10px] sm:text-[11px] text-gray-600 leading-tight">
              Mark daily attendance.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="flex-1 sm:flex-none rounded-md border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[44px]"
          />
          <button
            type="button"
            onClick={handleOpenCalendarModal}
            className="rounded-md border border-gray-300 px-3 py-2.5 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Open calendar"
          >
            <CalendarDays size={18} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="rounded-md border border-gray-300 px-3 py-2.5 sm:py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Configuration"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </header >

      <section className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm p-2 sm:p-2.5">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 px-0.5">
            <Filter size={14} className="text-gray-600 flex-shrink-0" />
            <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Filters</h3>
          </div>

          {/* Dropdown Filters and Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={filters.batch}
              onChange={(event) => handleFilterChange('batch', event.target.value)}
              className="min-w-[120px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Batches</option>
              {filterOptions.batches.map((batchOption) => (
                <option key={batchOption} value={batchOption}>
                  {batchOption}
                </option>
              ))}
            </select>
            <select
              value={filters.level || ''}
              onChange={(event) => handleFilterChange('level', event.target.value)}
              className="min-w-[100px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Levels</option>
              <option value="diploma">Diploma</option>
              <option value="ug">UG</option>
              <option value="pg">PG</option>
            </select>
            <select
              value={filters.course || ''}
              onChange={(event) => handleFilterChange('course', event.target.value)}
              onFocus={() => {
                const filtersForFetch = { ...filters };
                if (filtersForFetch.course) {
                  delete filtersForFetch.course;
                }
                loadFilterOptions(filtersForFetch, 'course');
              }}
              className="min-w-[120px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Programs</option>
              {filterOptions.courses
                .filter(courseOption => {
                  // Filter by level if level is selected
                  if (filters.level) {
                    const courseInfo = coursesWithLevels.find(c => c.name === courseOption);
                    return courseInfo?.level === filters.level;
                  }
                  return true;
                })
                .map((courseOption) => (
                  <option key={courseOption} value={courseOption}>
                    {courseOption}
                  </option>
                ))}
            </select>
            <select
              value={filters.branch || ''}
              onChange={(event) => handleFilterChange('branch', event.target.value)}
              onFocus={() => {
                const filtersForFetch = { ...filters };
                if (filtersForFetch.branch) {
                  delete filtersForFetch.branch;
                }
                loadFilterOptions(filtersForFetch, 'branch');
              }}
              className="min-w-[120px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Branches</option>
              {availableBranches.map((branchOption) => (
                <option key={branchOption} value={branchOption}>
                  {branchOption}
                </option>
              ))}
            </select>
            <select
              value={filters.currentYear}
              onChange={(event) => handleFilterChange('currentYear', event.target.value)}
              className="min-w-[100px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Years</option>
              {filterOptions.years.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  Year {yearOption}
                </option>
              ))}
            </select>
            <select
              value={filters.currentSemester}
              onChange={(event) => handleFilterChange('currentSemester', event.target.value)}
              className="min-w-[110px] flex-1 sm:flex-none rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
            >
              <option value="">All Semesters</option>
              {filterOptions.semesters.map((semesterOption) => (
                <option key={semesterOption} value={semesterOption}>
                  Sem {semesterOption}
                </option>
              ))}
            </select>





            <button
              type="button"
              onClick={handleDayEndReport}
              disabled={dayEndReportLoading}
              className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-semibold shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-[36px] whitespace-nowrap"
            >
              <Download size={14} />
              {dayEndReportLoading ? 'Loading...' : 'Day End Report'}
            </button>

            {filters.currentYear && filters.currentSemester && (
              <button
                type="button"
                onClick={handleMarkHolidayForFiltered}
                disabled={markHolidayLoading}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-white bg-amber-600 rounded-md hover:bg-amber-700 active:bg-amber-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation min-h-[36px] px-3"
              >
                {markHolidayLoading ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                Mark No Class
              </button>
            )}
          </div>

          {/* Search Inputs - Full Width on Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Student name or PIN"
                value={filters.studentName}
                onChange={(event) => handleFilterChange('studentName', event.target.value)}
                className="w-full rounded-md border border-gray-300 pl-8 pr-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
              />
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Parent mobile"
                value={filters.parentMobile}
                onChange={(event) => handleFilterChange('parentMobile', event.target.value)}
                className="w-full rounded-md border border-gray-300 pl-8 pr-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation min-h-[36px]"
              />
            </div>
          </div>


        </div>
      </section>

      {/* Day End Report Modal */}
      {
        dayEndReportOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setDayEndReportOpen(false);
              }
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="bg-white w-full max-w-[95vw] max-h-[90vh] rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
              {/* Sticky Header */}
              <div className="px-5 py-4 flex items-start justify-between border-b border-gray-200 shrink-0 bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Day End Report</h3>
                  <p className="text-xs text-gray-500">{dayEndReportData?.date || attendanceDate}</p>

                  {/* Filter Toggles */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-medium text-gray-500">Show:</span>
                    <div className="inline-flex rounded-md shadow-sm" role="group">
                      <button
                        type="button"
                        onClick={() => setDayEndPreviewFilter('all')}
                        className={`px-3 py-1 text-xs font-medium rounded-l-md ${dayEndPreviewFilter === 'all'
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayEndPreviewFilter('marked')}
                        className={`px-3 py-1 text-xs font-medium ${dayEndPreviewFilter === 'marked'
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border-t border-b border-gray-300'
                          }`}
                      >
                        Marked
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayEndPreviewFilter('unmarked')}
                        className={`px-3 py-1 text-xs font-medium rounded-r-md ${dayEndPreviewFilter === 'unmarked'
                          ? 'bg-amber-100 text-amber-700 border border-amber-300'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                      >
                        Unmarked
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDayEndReportOpen(false)}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-5">
                  {/* Sticky Stats Section */}
                  <div
                    ref={dayEndStatsRef}
                    className="sticky top-0 bg-white z-10 pb-4 border-b border-gray-200 -mx-5 px-5"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-4">
                      <StatPill label="Total Students" value={filteredStats.totalStudents} color="gray" />
                      <StatPill label="Marked Today" value={filteredStats.markedToday} color="green" />
                      <StatPill label="Absent Today" value={filteredStats.absentToday} color="red" />
                      <StatPill label="Present Today" value={filteredStats.presentToday} color="blue" />
                      <StatPill
                        label={filteredStats.holidayReason ? `Holiday: ${filteredStats.holidayReason.length > 20 ? filteredStats.holidayReason.substring(0, 20) + '...' : filteredStats.holidayReason}` : 'No Class Work Today'}
                        value={filteredStats.holidayToday}
                        color="green"
                        title={filteredStats.holidayReason}
                      />
                      <StatPill label="Unmarked Today" value={filteredStats.unmarkedToday} color="amber" />
                    </div>
                    {/* Table Header - Replaces Filters Section */}
                    <div className="overflow-x-auto -mx-5 px-5">
                      <table className="w-full border-collapse table-fixed">
                        <colgroup>
                          <col style={{ width: '180px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '120px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '60px' }} />
                          <col style={{ width: '60px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '150px' }} />
                          <col style={{ width: '100px' }} />
                        </colgroup>
                        <thead className="bg-gray-50 sticky" style={{ position: 'sticky', top: `${statsSectionHeight}px`, zIndex: 20 }}>
                          <tr>
                            <th className="px-2 py-2 text-left align-top">
                              <select
                                value={dayEndFilters.college}
                                onChange={(e) => {
                                  setDayEndFilters(prev => ({ ...prev, college: e.target.value, course: '', branch: '' }));
                                }}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs truncate"
                              >
                                <option value="">COLLEGE</option>
                                {dayEndFilterOptions.colleges.map(opt => (
                                  <option key={opt} value={opt} title={opt} className="truncate">{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-left align-top">
                              <select
                                value={dayEndFilters.batch}
                                onChange={(e) => setDayEndFilters(prev => ({ ...prev, batch: e.target.value }))}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs"
                              >
                                <option value="">BATCH</option>
                                {dayEndFilterOptions.batches.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-left align-top">
                              <select
                                value={dayEndFilters.course}
                                onChange={(e) => {
                                  setDayEndFilters(prev => ({ ...prev, course: e.target.value, branch: '' }));
                                }}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs"
                              >
                                <option value="">COURSE</option>
                                {filteredCourses.map(opt => (
                                  <option key={opt} value={opt} title={opt} className="truncate">{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-left align-top">
                              <select
                                value={dayEndFilters.branch}
                                onChange={(e) => setDayEndFilters(prev => ({ ...prev, branch: e.target.value }))}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs"
                              >
                                <option value="">BRANCH</option>
                                {filteredBranches.map(opt => (
                                  <option key={opt} value={opt} title={opt} className="truncate">{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-1 py-2 text-center align-top">
                              <select
                                value={dayEndFilters.year}
                                onChange={(e) => setDayEndFilters(prev => ({ ...prev, year: e.target.value }))}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-center text-xs"
                              >
                                <option value="">YEAR</option>
                                {dayEndFilterOptions.years.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-1 py-2 text-center align-top">
                              <select
                                value={dayEndFilters.semester}
                                onChange={(e) => setDayEndFilters(prev => ({ ...prev, semester: e.target.value }))}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-center text-xs"
                              >
                                <option value="">SEM</option>
                                {dayEndFilterOptions.semesters.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Students</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Absent</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Marked</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Percentage %</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Pending</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">No Class Work</th>
                            <th className="px-2 py-2 text-right align-top text-xs font-semibold">Time Stamp</th>
                          </tr>
                        </thead>
                      </table>
                    </div>
                  </div>
                  <>
                    {dayEndGroupedDisplay.length > 0 ? (
                      <div className="-mx-5">
                        <div className="overflow-x-auto px-5">
                          <table className="w-full divide-y divide-gray-200 border-collapse table-fixed">
                            <colgroup>
                              <col style={{ width: '180px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '120px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '60px' }} />
                              <col style={{ width: '60px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '150px' }} />
                              <col style={{ width: '100px' }} />
                            </colgroup>
                            <tbody className="divide-y divide-gray-100">
                              {dayEndGroupedDisplay.map((row, idx) => (
                                <tr key={`${row.college || 'N/A'}-${idx}`} className="bg-white hover:bg-gray-50">
                                  <td className="px-2 py-2 text-gray-800 text-sm truncate" title={row.college || ''}>
                                    {row.college || '—'}
                                  </td>
                                  <td className="px-2 py-2 text-gray-800 text-sm truncate" title={row.batch || ''}>
                                    {row.batch || '—'}
                                  </td>
                                  <td className="px-2 py-2 text-gray-800 text-sm truncate" title={row.course || ''}>
                                    {row.course || '—'}
                                  </td>
                                  <td className="px-2 py-2 text-gray-800 text-sm truncate" title={row.branch || ''}>
                                    {row.branch || '—'}
                                  </td>
                                  <td className="px-1 py-2 text-center text-gray-800 text-sm">
                                    {row.year || '—'}
                                  </td>
                                  <td className="px-1 py-2 text-center text-gray-800 text-sm">
                                    {row.semester || '—'}
                                  </td>
                                  <td className="px-2 py-2 text-right font-semibold text-gray-900 text-sm">
                                    {row.totalStudents ?? 0}
                                  </td>
                                  <td className="px-2 py-2 text-right text-red-700 font-semibold text-sm">
                                    {row.absentToday ?? 0}
                                  </td>
                                  <td className="px-2 py-2 text-right text-green-700 font-semibold text-sm">
                                    {row.markedToday ?? 0}
                                  </td>
                                  <td className="px-2 py-2 text-right text-blue-700 font-semibold text-sm">
                                    {row.totalStudents > 0
                                      ? ((row.presentToday / row.totalStudents) * 100).toFixed(1) + '%'
                                      : '0.0%'
                                    }
                                  </td>
                                  <td className="px-2 py-2 text-right text-amber-700 font-semibold text-sm">
                                    {row.pendingToday ?? 0}
                                  </td>
                                  <td className="px-2 py-2 text-right text-green-700 font-semibold text-sm">
                                    <div className="flex flex-col items-end">
                                      <span>{row.holidayToday ?? 0}</span>
                                      {row.holidayReasons && (
                                        <span className="text-xs text-gray-600 font-normal truncate max-w-full" title={row.holidayReasons}>
                                          {row.holidayReasons.length > 20 ? `${row.holidayReasons.substring(0, 20)}...` : row.holidayReasons}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-right text-gray-600 text-xs">
                                    {row.lastUpdated ? new Date(row.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No records found matching the current filters
                      </div>
                    )}
                  </>
                  {/* Fixed Download Buttons at Bottom */}
                  <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDayEndDownload('pdf')}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold"
                      >
                        <Download size={14} />
                        PDF
                      </button>
                      <button
                        onClick={() => handleDayEndDownload('xlsx')}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold"
                      >
                        <Download size={14} />
                        Excel
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSendDayEndReports}
                        disabled={sendingReports}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-xs"
                      >
                        {sendingReports ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Sending
                          </>
                        ) : (
                          <>
                            <Mail size={14} />
                            Send Reports
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setDayEndReportOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Holiday Reason Modal */}
      {
        holidayReasonModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Mark as No Class Work</h3>
                  <p className="text-xs text-gray-500">Enter reason for marking {pendingHolidayRecords.length} students as no class work</p>
                </div>
                <button
                  onClick={() => {
                    setHolidayReasonModalOpen(false);
                    setHolidayReason('');
                    setPendingHolidayRecords([]);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    No Class Work Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={holidayReason}
                    onChange={(e) => setHolidayReason(e.target.value)}
                    placeholder="e.g., Festival holiday, College function, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={4}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setHolidayReasonModalOpen(false);
                      setHolidayReason('');
                      setPendingHolidayRecords([]);
                    }}
                    className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmHolidayMarking}
                    disabled={markHolidayLoading || !holidayReason.trim()}
                    className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {markHolidayLoading ? 'Marking...' : 'Mark as No Class Work'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Delete Confirmation Modal */}
      {
        deleteConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Clear Today's Attendance</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    This will delete attendance records for {attendanceDate} matching your current filters
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDeleteConfirmModalOpen(false);
                    setDeleteCount(0);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  disabled={deleteLoading}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-red-100 p-2">
                      <AlertTriangle size={20} className="text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900">
                        {deleteCount} attendance record{deleteCount !== 1 ? 's' : ''} will be deleted
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        This action cannot be undone. Make sure you want to delete these records.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setDeleteConfirmModalOpen(false);
                      setDeleteCount(0);
                    }}
                    disabled={deleteLoading}
                    className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading}
                    className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Confirm Delete'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Attendance Statistics */}
      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Students Card */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5 sm:p-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-slate-100 p-1">
              <Users size={14} className="text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-600 leading-tight">Total Students</p>
              {loading && totalStudents === 0 ? (
                <div className="animate-pulse bg-gray-200 rounded h-4 w-12 mt-0.5" />
              ) : (
                <p className="text-sm font-bold text-slate-700 leading-tight">{totalStudents.toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5 sm:p-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-green-100 p-1">
              <Check size={14} className="text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-600 leading-tight">Total Present</p>
              {loading && attendanceStatistics.total === 0 ? (
                <div className="animate-pulse bg-gray-200 rounded h-4 w-12 mt-0.5" />
              ) : (
                <p className="text-sm font-bold text-green-700 leading-tight">{presentCount}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5 sm:p-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-red-100 p-1">
              <X size={14} className="text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-600 leading-tight">Total Absent</p>
              {loading && attendanceStatistics.total === 0 ? (
                <div className="animate-pulse bg-gray-200 rounded h-4 w-12 mt-0.5" />
              ) : (
                <p className="text-sm font-bold text-red-700 leading-tight">{absentCount}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5 sm:p-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-blue-100 p-1">
              <CalendarCheck size={14} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-600 leading-tight">Completed Marking</p>
              {loading && attendanceStatistics.total === 0 ? (
                <div className="animate-pulse bg-gray-200 rounded h-4 w-12 mt-0.5" />
              ) : (
                <p className="text-sm font-bold text-blue-700 leading-tight">{markedCount}</p>
              )}
            </div>
          </div>
        </div>

        <div
          className={`bg-white border rounded-lg shadow-sm p-1.5 sm:p-2 transition-all duration-200 
            ${pendingFilter === 'pending'
              ? 'border-amber-500 ring-1 ring-amber-200 bg-amber-50'
              : pendingCount > 0 && !loading
                ? 'border-amber-300 hover:border-amber-400 hover:bg-gray-50 cursor-pointer'
                : 'border-gray-200'
            }`}
          onClick={() => {
            if (pendingCount > 0 && !loading) {
              setPendingFilter(pendingFilter === 'pending' ? 'all' : 'pending');
            }
          }}
          title={pendingCount > 0 && !loading ? "Click to view pending students" : ""}
        >
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-amber-100 p-1">
              <AlertTriangle size={14} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-600 leading-tight">Pending Marking</p>
              {loading && attendanceStatistics.total === 0 ? (
                <div className="animate-pulse bg-gray-200 rounded h-4 w-12 mt-0.5" />
              ) : (
                <p className="text-sm font-bold text-amber-700 leading-tight">{pendingCount}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1 min-h-0 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-2.5 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-700 font-semibold text-xs">
            <CalendarCheck size={16} />
            <span>Daily Attendance</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {isAdmin && isToday && (
              <button
                type="button"
                onClick={handleGetDeleteCount}
                disabled={gettingDeleteCount || deleteLoading}
                className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors touch-manipulation min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gettingDeleteCount || deleteLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {gettingDeleteCount ? 'Counting...' : 'Deleting...'}
                  </>
                ) : (
                  <>
                    <X size={12} />
                    Clear
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saving || editingLocked}
              className={`inline-flex items-center justify-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-colors touch-manipulation min-h-[32px] ${hasChanges && !saving && !editingLocked
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
            >
              {saving ? (
                <>
                  <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={12} />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
        {editingLocked && (
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
            {editingLockReason || 'Attendance is read-only for this date.'}
          </div>
        )}

        {loading || saving ? (
          <div className="p-4">
            <SkeletonAttendanceTable rows={pageSize || 10} />
          </div>
        ) : sortedStudents.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-500">
            <AlertTriangle size={32} />
            <p>
              {pendingFilter === 'pending'
                ? 'No pending students found. All students are marked.'
                : pendingFilter === 'marked'
                  ? 'No marked students found.'
                  : 'No students found for the selected filters.'}
            </p>
            {pendingFilter !== 'all' && (
              <button
                onClick={() => setPendingFilter('all')}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Show All Students
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto no-scrollbar">
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {columnOrder.map((columnKey) => {
                        const columnConfig = {
                          student: { label: 'Student', sortable: true },
                          pin: { label: 'PIN', sortable: true },
                          registrationStatus: { label: 'Registration Status', sortable: true },
                          batch: { label: 'Batch', sortable: true },
                          course: { label: 'Program', sortable: true },
                          branch: { label: 'Branch', sortable: true },
                          year: { label: 'Year', sortable: true },
                          semester: { label: 'Semester', sortable: true },
                          parentContact: { label: 'Parent Contact', sortable: true },
                          attendance: { label: 'Attendance', sortable: true },
                          smsStatus: { label: 'SMS Status', sortable: false }
                        };
                        const config = columnConfig[columnKey];
                        if (!config) return null;

                        return (
                          <th key={columnKey} className={`px-1 py-1 text-[10px] ${config.align === 'right' ? 'text-right' : ''}`}>
                            <div className={`flex items-center gap-2 ${config.align === 'right' ? 'justify-end' : ''}`}>
                              <div className={`flex items-center gap-1 ${config.align === 'right' ? '' : 'flex-1'}`}>
                                {config.sortable ? (
                                  <button
                                    onClick={() => handleSort(columnKey)}
                                    className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                                  >
                                    <span>{config.label}</span>
                                    {sortConfig.field === columnKey && (
                                      <ArrowUpDown size={14} className={sortConfig.direction === 'asc' ? 'rotate-180' : ''} />
                                    )}
                                  </button>
                                ) : (
                                  <span>{config.label}</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <button
                                  onClick={() => moveColumn(columnKey, 'left')}
                                  disabled={columnOrder.indexOf(columnKey) === 0}
                                  className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move left"
                                >
                                  <ChevronLeft size={12} />
                                </button>
                                <button
                                  onClick={() => moveColumn(columnKey, 'right')}
                                  disabled={columnOrder.indexOf(columnKey) === columnOrder.length - 1}
                                  className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move right"
                                >
                                  <ChevronRight size={12} />
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {sortedStudents.map((student) => {
                      const status = effectiveStatus(student.id);
                      const parentContact = student.parentMobile1 || student.parentMobile2 || 'Not available';
                      return (
                        <tr
                          key={student.id}
                          className="hover:bg-gray-50"
                        >
                          {columnOrder.map((columnKey) => {
                            if (columnKey === 'student') {
                              return (
                                <td key={columnKey} className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1.5">
                                    <StudentAvatar
                                      admissionNumber={student.admissionNumber}
                                      studentName={student.studentName}
                                      className="w-7 h-7"
                                    />
                                    <div className="font-semibold text-gray-900 text-[10px] leading-tight max-w-[90px] truncate" title={student.studentName}>
                                      {student.studentName || 'Unknown Student'}
                                    </div>
                                  </div>
                                </td>
                              );
                            }
                            if (columnKey === 'pin') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.pinNumber || 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'registrationStatus') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const raw = (student.registration_status || '').toLowerCase();
                                    const isCompleted = raw === 'completed' || raw === 'registered' || raw === 'done';
                                    const label = isCompleted ? 'Completed' : 'Pending';
                                    const cls = isCompleted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';
                                    return (
                                      <span
                                        title="Registration status is updated when student completes registration on student portal"
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cls}`}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                              );
                            }
                            if (columnKey === 'batch') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.batch || 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'course') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.course || 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'branch') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.branch || 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'year') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.currentYear ? `Year ${student.currentYear}` : 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'semester') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  {student.currentSemester ? `Semester ${student.currentSemester}` : 'N/A'}
                                </td>
                              );
                            }
                            if (columnKey === 'parentContact') {
                              return (
                                <td key={columnKey} className="px-1 py-1.5 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  <div>{parentContact}</div>
                                </td>
                              );
                            }
                            if (columnKey === 'attendance') {
                              return (
                                <td key={columnKey} className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                  {/* Attendance status logic:
                            - hasDbRecord: student.attendanceStatus is not null (record exists in DB for this date)
                            - statusChanged: current status differs from initial loaded status
                            - justSaved: attendance was saved in this session
                            
                            Show "Marked" only if:
                            1. There's a DB record AND status hasn't been changed locally
                            2. OR attendance was just saved in this session
                        */}
                                  {(() => {
                                    const hasDbRecord = student.attendanceStatus !== null;
                                    const statusChanged = statusMap[student.id] !== initialStatusMap[student.id];
                                    const justSaved = lastUpdatedAt !== null;

                                    // Show marked state if saved or has existing record that wasn't changed
                                    const isHoliday = status === 'holiday';
                                    const showMarked = justSaved || (hasDbRecord && !statusChanged);

                                    if (showMarked && !statusChanged) {
                                      return (
                                        <div className="flex items-center gap-1.5">
                                          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isHoliday
                                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                            : status === 'present'
                                              ? 'bg-green-100 text-green-700 border border-green-200'
                                              : 'bg-red-100 text-red-700 border border-red-200'
                                            }`}>
                                            {isHoliday ? <AlertTriangle size={12} /> : <Check size={12} />}
                                            <div className="flex flex-col items-start text-left leading-tight">
                                              <span>{isHoliday ? 'No Class' : status === 'present' ? 'Present' : 'Absent'}</span>
                                              {isHoliday && student.holidayReason && (
                                                <span className="text-[8px] font-normal italic opacity-80 mt-0.5 block">{student.holidayReason}</span>
                                              )}
                                            </div>
                                          </div>
                                          {/* Still allow changing even if marked */}
                                          {!isHoliday && (
                                            <label className="flex items-center gap-1 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={status === 'absent'}
                                                onChange={(e) => {
                                                  if (editingLocked) {
                                                    toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
                                                    return;
                                                  }
                                                  handleStatusChange(student.id, e.target.checked ? 'absent' : 'present');
                                                }}
                                                disabled={editingLocked}
                                                className="w-3.5 h-3.5 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                              />
                                              <span className={`text-[10px] font-bold ${editingLocked ? 'text-gray-400' : 'text-gray-600'}`}>
                                                Change
                                              </span>
                                            </label>
                                          )}
                                        </div>
                                      );
                                    }

                                    // Not marked yet - show toggle controls
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${status === 'holiday'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                          : status === 'present'
                                            ? 'bg-green-50 text-green-600 border border-green-100'
                                            : 'bg-red-50 text-red-600 border border-red-100'
                                          }`}>
                                          {status === 'holiday' ? (
                                            <>
                                              <AlertTriangle size={12} />
                                              <div className="flex flex-col items-start text-left leading-tight">
                                                <span>No Class</span>
                                                {student.holidayReason && (
                                                  <span className="text-[8px] font-normal italic opacity-80 mt-0.5 block">{student.holidayReason}</span>
                                                )}
                                              </div>
                                            </>
                                          ) : status === 'present' ? (
                                            <>
                                              <Check size={12} />
                                              Present
                                            </>
                                          ) : (
                                            <>
                                              <X size={12} />
                                              Absent
                                            </>
                                          )}
                                        </div>
                                        {status !== 'holiday' && (
                                          <label className="flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={status === 'absent'}
                                              onChange={(e) => {
                                                if (editingLocked) {
                                                  toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
                                                  return;
                                                }
                                                handleStatusChange(student.id, e.target.checked ? 'absent' : 'present');
                                              }}
                                              disabled={editingLocked}
                                              className="w-3.5 h-3.5 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                            <span className={`text-[10px] font-bold ${editingLocked ? 'text-gray-400' : 'text-gray-600'}`}>
                                              Absent
                                            </span>
                                          </label>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            }
                            if (columnKey === 'smsStatus') {
                              return (
                                <td key={columnKey} className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const smsStatus = smsStatusMap[student.id];
                                    if (!smsStatus) {
                                      if (status === 'absent') {
                                        return (
                                          <button
                                            onClick={() => handleRetrySms(student)}
                                            disabled={retryingSmsFor === student.id}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                                            title="Click to send SMS notification"
                                          >
                                            {retryingSmsFor === student.id ? (
                                              <>
                                                <RefreshCw size={10} className="animate-spin" />
                                                Sending
                                              </>
                                            ) : (
                                              <>
                                                <AlertTriangle size={10} />
                                                Pending
                                              </>
                                            )}
                                          </button>
                                        );
                                      }
                                      return <span className="text-xs text-gray-400">-</span>;
                                    }

                                    if (smsStatus.success) {
                                      return smsStatus.mocked ? (
                                        <button
                                          onClick={() => handleRetrySms(student)}
                                          disabled={retryingSmsFor === student.id}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer disabled:opacity-50"
                                          title="Test mode - Click to send again"
                                        >
                                          {retryingSmsFor === student.id ? (
                                            <>
                                              <RefreshCw size={10} className="animate-spin" />
                                              Sending
                                            </>
                                          ) : (
                                            <>
                                              <RefreshCw size={10} />
                                              Test/Retry
                                            </>
                                          )}
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleRetrySms(student)}
                                          disabled={retryingSmsFor === student.id}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 hover:bg-green-200 transition-colors cursor-pointer disabled:opacity-50"
                                          title="SMS sent - Click to send again"
                                        >
                                          {retryingSmsFor === student.id ? (
                                            <>
                                              <RefreshCw size={10} className="animate-spin" />
                                              Sending
                                            </>
                                          ) : (
                                            <>
                                              <Check size={10} />
                                              Sent/Retry
                                            </>
                                          )}
                                        </button>
                                      );
                                    }

                                    if (smsStatus.skipped) {
                                      return (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700" title={smsStatus.reason}>
                                          <AlertTriangle size={10} />
                                          {smsStatus.reason === 'missing_parent_mobile' ? 'No Mobile' : 'Skipped'}
                                        </span>
                                      );
                                    }

                                    return (
                                      <button
                                        onClick={() => handleRetrySms(student)}
                                        disabled={retryingSmsFor === student.id}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer disabled:opacity-50"
                                        title={`Failed: ${smsStatus.reason || 'Unknown error'}. Click to retry.`}
                                      >
                                        {retryingSmsFor === student.id ? (
                                          <>
                                            <RefreshCw size={10} className="animate-spin" />
                                            Retrying
                                          </>
                                        ) : (
                                          <>
                                            <X size={10} />
                                            Retry
                                          </>
                                        )}
                                      </button>
                                    );
                                  })()}
                                </td>
                              );
                            }

                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-3 p-3 sm:p-4">
                {sortedStudents.map((student) => {
                  const status = effectiveStatus(student.id);
                  const parentContact = student.parentMobile1 || student.parentMobile2 || 'Not available';
                  const hasDbRecord = student.attendanceStatus !== null;
                  const statusChanged = statusMap[student.id] !== initialStatusMap[student.id];
                  const justSaved = lastUpdatedAt !== null;
                  const showMarked = justSaved || (hasDbRecord && !statusChanged);

                  return (
                    <div
                      key={student.id}
                      className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="p-4 space-y-3">
                        {/* Header with Photo and Name */}
                        <div className="flex items-start gap-3">
                          {renderPhoto(student)}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-base truncate">{student.studentName || 'Unknown Student'}</h3>
                            <p className="text-sm text-gray-600 mt-1">{student.pinNumber || 'N/A'}</p>
                          </div>
                        </div>

                        {/* Key Information */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                          <div>
                            <p className="text-xs text-gray-500">Batch</p>
                            <p className="text-sm font-medium text-gray-900">{student.batch || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Course</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={student.course || ''}>{student.course || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Branch</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={student.branch || ''}>{student.branch || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Year/Sem</p>
                            <p className="text-sm font-medium text-gray-900">
                              {student.currentYear ? `Y${student.currentYear}` : 'N/A'}/{student.currentSemester ? `S${student.currentSemester}` : 'N/A'}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-gray-500">Parent Contact</p>
                            <p className="text-sm font-medium text-gray-900">{parentContact}</p>
                          </div>
                        </div>

                        {/* Attendance Status */}
                        <div className="pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                          {showMarked && !statusChanged ? (
                            <div className="flex flex-col gap-2">
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${status === 'present'
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-red-100 text-red-700 border border-red-200'
                                }`}>
                                {status === 'present' ? <Check size={16} /> : <X size={16} />}
                                {status === 'present' ? 'Present (Marked)' : 'Absent (Marked)'}
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                                <input
                                  type="checkbox"
                                  checked={status === 'absent'}
                                  onChange={(e) => {
                                    if (editingLocked) {
                                      toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
                                      return;
                                    }
                                    handleStatusChange(student.id, e.target.checked ? 'absent' : 'present');
                                  }}
                                  disabled={editingLocked}
                                  className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50"
                                />
                                <span className={`text-sm ${editingLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                                  Change Status
                                </span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${status === 'present'
                                ? 'bg-green-50 text-green-600 border border-green-100'
                                : 'bg-red-50 text-red-600 border border-red-100'
                                }`}>
                                {status === 'present' ? <Check size={16} /> : <X size={16} />}
                                {status === 'present' ? 'Present' : 'Absent'}
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                                <input
                                  type="checkbox"
                                  checked={status === 'absent'}
                                  onChange={(e) => {
                                    if (editingLocked) {
                                      toast.error(editingLockReason || 'Attendance editing is disabled for this date.');
                                      return;
                                    }
                                    handleStatusChange(student.id, e.target.checked ? 'absent' : 'present');
                                  }}
                                  disabled={editingLocked}
                                  className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50"
                                />
                                <span className={`text-sm ${editingLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                                  Mark as Absent
                                </span>
                              </label>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Infinite scroll observer and loading indicator */}
              {(() => {
                const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);
                if (hasFilters && hasMore) {
                  return (
                    <div ref={scrollObserverRef} className="py-4 flex justify-center">
                      {loadingMore && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Loader2 size={20} className="animate-spin" />
                          <span className="text-sm">Loading more students...</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 border-t border-gray-100">
              <div className="text-[11px] text-gray-600">
                {totalStudents === 0
                  ? 'No students to display'
                  : (() => {
                    // Check if filters are applied
                    const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);
                    if (hasFilters) {
                      // When filters are applied, show loaded vs total students
                      return `Showing ${students.length.toLocaleString()} of ${totalStudents.toLocaleString()} student${totalStudents !== 1 ? 's' : ''}`;
                    } else {
                      // When no filters, show pagination info
                      return `Showing ${showingFrom.toLocaleString()}-${showingTo.toLocaleString()} of ${totalStudents.toLocaleString()}`;
                    }
                  })()}
              </div>
              {(() => {
                // Check if filters are applied - hide pagination controls when filters are active
                const hasFilters = !!(filters.batch || filters.course || filters.branch || filters.currentYear || filters.currentSemester);
                if (hasFilters) {
                  return null; // Don't show pagination controls when filters are applied
                }
                return (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <label className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-600">
                      <span className="hidden sm:inline">Rows per page</span>
                      <span className="sm:hidden">Per page</span>
                      <select
                        value={pageSize}
                        onChange={handlePageSizeChange}
                        className="px-1.5 py-0.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-[11px] touch-manipulation min-h-[28px] sm:min-h-[32px]"
                        disabled={loading}
                      >
                        {pageSizeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={isFirstPage || loading || totalStudents === 0}
                        className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[32px] font-semibold"
                      >
                        Previous
                      </button>
                      <span className="text-[10px] sm:text-[11px] text-gray-600 px-1 text-center whitespace-nowrap">
                        Page {Math.min(currentPage, totalPages).toLocaleString()} of {totalPages.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={isLastPage || loading || totalStudents === 0}
                        className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[32px] font-semibold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </section>

      {/* SMS Results Summary Button - Shows when there are results */}
      {
        smsResults.length > 0 && (
          <button
            onClick={() => setSmsModalOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <CalendarCheck size={20} />
            <span className="font-medium">SMS Report</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
              {smsResults.length}
            </span>
          </button>
        )
      }

      {/* SMS Dispatch Summary Modal */}
      {
        smsModalOpen && smsResults.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <CalendarCheck size={24} className="text-white" />
                  <div>
                    <h3 className="font-bold text-white text-lg">SMS Dispatch Summary</h3>
                    <p className="text-blue-100 text-sm">{attendanceDate} • {smsResults.length} students</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const headers = ['Student Name', 'PIN Number', 'Admission Number', 'College', 'Course', 'Branch', 'Year', 'Semester', 'Parent Mobile', 'Status', 'Reason'];
                      const rows = smsResults.map(result => [
                        result.studentName || '-',
                        result.pinNumber || '-',
                        result.admissionNumber || '-',
                        result.college || '-',
                        result.course || '-',
                        result.branch || '-',
                        result.year || '-',
                        result.semester || '-',
                        result.sentTo || result.parentMobile || '-',
                        result.success ? (result.mocked ? 'Simulated (Test)' : 'Sent') : (result.skipped ? 'Skipped' : 'Failed'),
                        result.reason || '-'
                      ]);
                      const csvContent = [
                        headers.join(','),
                        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                      ].join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = `sms-dispatch-report-${attendanceDate}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(link.href);
                      toast.success('SMS report downloaded');
                    }}
                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download size={16} />
                    Download CSV
                  </button>
                  <button
                    onClick={() => setSmsModalOpen(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-2 bg-green-100 border border-green-200 rounded-lg px-3 py-2">
                  <Check size={16} className="text-green-600" />
                  <div>
                    <div className="text-xs text-green-700 font-medium">Sent</div>
                    <div className="text-lg font-bold text-green-800">
                      {smsResults.filter(r => r.success && !r.mocked).length}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-100 border border-blue-200 rounded-lg px-3 py-2">
                  <RefreshCw size={16} className="text-blue-600" />
                  <div>
                    <div className="text-xs text-blue-700 font-medium">Test Mode</div>
                    <div className="text-lg font-bold text-blue-800">
                      {smsResults.filter(r => r.success && r.mocked).length}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <div>
                    <div className="text-xs text-amber-700 font-medium">Skipped</div>
                    <div className="text-lg font-bold text-amber-800">
                      {smsResults.filter(r => r.skipped).length}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                  <X size={16} className="text-red-600" />
                  <div>
                    <div className="text-xs text-red-700 font-medium">Failed</div>
                    <div className="text-lg font-bold text-red-800">
                      {smsResults.filter(r => !r.success && !r.skipped).length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Table with Scroll */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Student Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">PIN</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Admission No</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">College</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Program</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Branch</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Year</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Sem</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Parent Mobile</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {smsResults
                      .slice((smsCurrentPage - 1) * smsPageSize, smsCurrentPage * smsPageSize)
                      .map((result, index) => (
                        <tr key={result.studentId || index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{result.studentName || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.pinNumber || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.admissionNumber || '-'}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={result.college}>{result.college || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.course || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.branch || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.year || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{result.semester || '-'}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{result.sentTo || result.parentMobile || '-'}</td>
                          <td className="px-3 py-2">
                            {result.success ? (
                              result.mocked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  <RefreshCw size={12} />
                                  Test Mode
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  <Check size={12} />
                                  Sent
                                </span>
                              )
                            ) : result.skipped ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700" title={result.reason}>
                                <AlertTriangle size={12} />
                                {result.reason === 'missing_parent_mobile' ? 'No Mobile' : 'Skipped'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={result.reason || result.details}>
                                <X size={12} />
                                Failed
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {smsResults.length > smsPageSize && (
                <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                  <div className="text-[11px] text-gray-600">
                    Showing {((smsCurrentPage - 1) * smsPageSize) + 1} to {Math.min(smsCurrentPage * smsPageSize, smsResults.length)} of {smsResults.length} students
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSmsCurrentPage(p => Math.max(1, p - 1))}
                      disabled={smsCurrentPage === 1}
                      className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
                    >
                      Previous
                    </button>
                    <span className="text-[11px] text-gray-600">
                      Page {smsCurrentPage} of {Math.ceil(smsResults.length / smsPageSize)}
                    </span>
                    <button
                      onClick={() => setSmsCurrentPage(p => Math.min(Math.ceil(smsResults.length / smsPageSize), p + 1))}
                      disabled={smsCurrentPage >= Math.ceil(smsResults.length / smsPageSize)}
                      className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }
      {/* Holiday Alert Modal - Shows for both Public and Institute Holidays */}
      {
        showHolidayAlert && (nonWorkingDayDetails.isNonWorkingDay || customHolidayForDate || publicHolidayMatches.length > 0 || selectedDateIsSunday) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-6">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-amber-100 p-3 flex-shrink-0">
                  <AlertTriangle className="text-amber-600" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Today is a Holiday</h3>
                  <div className="space-y-2">
                    {/* Institute Holiday Section - Show prominently */}
                    {(nonWorkingDayDetails.customHoliday || customHolidayForDate || selectedDateHolidayInfo?.customHoliday) && (
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="text-xs font-semibold uppercase tracking-wide text-purple-800 mb-1">
                          Institute Holiday
                        </div>
                        <div className="text-sm font-semibold text-purple-900">
                          {(nonWorkingDayDetails.customHoliday || customHolidayForDate || selectedDateHolidayInfo?.customHoliday)?.title || 'Institute Holiday'}
                        </div>
                        {(nonWorkingDayDetails.customHoliday || customHolidayForDate || selectedDateHolidayInfo?.customHoliday)?.description && (
                          <div className="text-xs text-purple-700 mt-1">
                            {(nonWorkingDayDetails.customHoliday || customHolidayForDate || selectedDateHolidayInfo?.customHoliday).description}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Public Holiday Section */}
                    {(() => {
                      const publicHolidays = [];
                      if (nonWorkingDayDetails.holidays && nonWorkingDayDetails.holidays.length > 0) {
                        publicHolidays.push(...nonWorkingDayDetails.holidays);
                      }
                      if (publicHolidayMatches.length > 0) {
                        publicHolidays.push(...publicHolidayMatches);
                      }
                      if (selectedDateHolidayInfo?.publicHoliday) {
                        publicHolidays.push(selectedDateHolidayInfo.publicHoliday);
                      }

                      return publicHolidays.length > 0 ? (
                        <div className="space-y-2">
                          {publicHolidays.map((holiday, index) => (
                            <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                              <div className="text-xs font-semibold uppercase tracking-wide text-orange-800 mb-1">
                                Public Holiday
                              </div>
                              <div className="text-sm font-semibold text-orange-900">
                                {holiday.localName || holiday.name}
                              </div>
                              {holiday.name && holiday.localName && holiday.localName !== holiday.name && (
                                <div className="text-xs text-orange-700 mt-1">
                                  {holiday.name}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Sunday Section */}
                    {selectedDateIsSunday && !nonWorkingDayDetails.customHoliday && !customHolidayForDate && publicHolidayMatches.length === 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">
                          Weekly Holiday
                        </div>
                        <div className="text-sm font-semibold text-amber-900">
                          Sunday
                        </div>
                      </div>
                    )}

                    {/* General reasons list if available */}
                    {nonWorkingDayDetails.reasons && nonWorkingDayDetails.reasons.length > 0 && (
                      <div className="space-y-1 text-sm text-gray-600">
                        {nonWorkingDayDetails.reasons.map((reason, index) => (
                          <div key={index} className="text-xs">
                            • {reason}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-sm text-amber-800">
                        <strong>Note:</strong> Attendance cannot be marked on holidays. Please select a working day to mark attendance.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowHolidayAlert(false);
                    setHolidayAlertShown(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Attendance Report Modal */}
      {
        showReportModal && attendanceReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Attendance Report</h2>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Total Students</p>
                    <p className="text-2xl font-bold text-blue-700">{attendanceReport.totalStudents.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Present</p>
                    <p className="text-2xl font-bold text-green-700">{attendanceReport.presentCount.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Absent</p>
                    <p className="text-2xl font-bold text-red-700">{attendanceReport.absentCount.toLocaleString()}</p>
                  </div>
                </div>

                {attendanceReport.absentCount > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Absent Students PIN Numbers</h3>
                    <div className="flex flex-wrap gap-2">
                      {attendanceReport.absentPinNumbers.length > 0 ? (
                        attendanceReport.absentPinNumbers.map((pin, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-3 py-1 rounded-md bg-red-100 text-red-800 text-sm font-medium border border-red-200"
                          >
                            {pin}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No PIN numbers available for absent students</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Date & Filters</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium">Date:</span> {attendanceDateLabel}</p>
                    {filters.batch && <p><span className="font-medium">Batch:</span> {filters.batch}</p>}
                    {filters.course && <p><span className="font-medium">Course:</span> {filters.course}</p>}
                    {filters.branch && <p><span className="font-medium">Branch:</span> {filters.branch}</p>}
                    {filters.currentYear && <p><span className="font-medium">Year:</span> {filters.currentYear}</p>}
                    {filters.currentSemester && <p><span className="font-medium">Semester:</span> {filters.currentSemester}</p>}
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      <HolidayCalendarModal
        isOpen={calendarModalOpen}
        onClose={handleCloseCalendarModal}
        monthKey={calendarViewMonthKey || calendarMonthKey || getMonthKeyFromDate(attendanceDate)}
        onMonthChange={handleCalendarMonthChange}
        selectedDate={attendanceDate}
        onSelectDate={handleCalendarDateSelect}
        calendarData={calendarViewData}
        loading={calendarViewLoading}
        error={calendarViewError}
        onRetry={handleCalendarModalRetry}
        onCreateHoliday={handleCreateInstituteHoliday}
        onRemoveHoliday={handleRemoveInstituteHoliday}
        mutationLoading={calendarMutationLoading}
        isAdmin={isAdmin}
        upcomingHolidays={upcomingHolidays}
        nonWorkingDayDetails={nonWorkingDayDetails}
        selectedDateStatus={selectedDateStatus}
        statusSummaryMeta={statusSummaryMeta}
        presentCount={presentCount}
        absentCount={absentCount}
        unmarkedCount={unmarkedCount}
        lastUpdatedAt={lastUpdatedAt}
        editingLockReason={editingLockReason}
        calendarError={calendarError}
        onRetryCalendarFetch={handleRetryCalendarFetch}
      />
      <AttendanceSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSettingsChange={() => {
          loadAttendance();
          // Refetch other data if needed
        }}
      />
    </div>
  );
};

export default Attendance;


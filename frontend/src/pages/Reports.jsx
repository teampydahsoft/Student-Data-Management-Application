import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RefreshCw,
  Users as UsersIcon,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  FileText,
  BookOpen,
  Zap,
  Award,
  Search,
  XCircle,
  X,
  ArrowLeft,
  User,
  Calendar,
  CalendarDays,
  Mail,
  Loader2,
  Lock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line
} from 'recharts';
import toast from 'react-hot-toast';
import { Navigate } from 'react-router-dom';
import RegistrationDownloadModal from '../components/Reports/RegistrationDownloadModal';
import api from '../config/api';
import CalendarWidget from '../components/Attendance/CalendarWidget';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';
import { formatDateToLocalISO } from '../utils/dateUtils';

const StatusBadge = ({ status, type = 'icon' }) => {
  const isCompleted = status === 'completed' || status === 'Verified' || status === 'No Due';
  const isPermitted = status === 'Permitted';
  const isPending = status === 'pending' || status === 'Unverified' || status === 'Pending' || status === '—';
  const isTemporary = status === 'Temporary' || status === 'temporary';

  if (type === 'text') {
    let colorClass = 'bg-gray-100 text-gray-700'; // Default
    if (status === 'No Due' || status === 'Verified' || status === 'completed' || status === 'eligible' || status === 'rejected') colorClass = 'bg-green-100 text-green-700';
    else if (status === 'Permitted') colorClass = 'bg-orange-100 text-orange-700';
    else if (status === 'Unverified' || status === 'Pending' || status === 'pending' || status === '—') colorClass = 'bg-gray-100 text-gray-500';
    else if (isTemporary) colorClass = 'bg-amber-100 text-amber-700';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap capitalize ${colorClass}`}>
        {status === 'completed' ? 'Completed' : status === 'pending' ? 'Pending' : status}
      </span>
    );
  }

  // Icon checks (strictly for 'completed' vs others logic usually)
  const isIconCompleted = status === 'completed';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${isIconCompleted ? 'bg-green-100 text-green-700' : isTemporary ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'
      }`}>
      {isIconCompleted ? <CheckCircle size={12} /> : isTemporary ? <AlertCircle size={12} /> : <Clock size={12} />}
      {isIconCompleted ? 'Completed' : isTemporary ? 'Temporary' : 'Pending'}
    </span>
  );
};

const Reports = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const isAttendanceReports = location.pathname === '/reports/attendance';
  const isDayEndReports = location.pathname === '/reports/day-end';
  const reportType = isDayEndReports ? 'dayend' : (isAttendanceReports ? 'attendance' : 'registration');

  // Permission check
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;

    let action = 'view_registration';
    if (isAttendanceReports) action = 'view_attendance';
    else if (isDayEndReports) action = 'view_day_end';

    return hasPermission(user.permissions, BACKEND_MODULES.REPORTS, action);
  }, [user, isAttendanceReports, isDayEndReports]);

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 max-w-sm">
          You do not have permission to view {isDayEndReports ? 'Day End' : (isAttendanceReports ? 'Attendance' : 'Registration')} Reports.
        </p>
      </div>
    );
  }

  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 0,
    totalRecords: 0
  });
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('abstract');

  const [filters, setFilters] = useState({
    college: '',
    batch: '',
    course: '',
    level: '',
    branch: '',
    year: '',
    semester: '',
    scholarshipStatus: '',
    search: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    colleges: [],
    batches: [],
    courses: [],
    branches: [],
    years: [],
    semesters: []
  });
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // Abstract Data State
  const [abstractData, setAbstractData] = useState([]);
  const [abstractLoading, setAbstractLoading] = useState(false);
  const [groupingParams, setGroupingParams] = useState({ key: 'college', label: 'College' });

  // Attendance Reports State
  const [attendanceReportData, setAttendanceReportData] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceAbstractData, setAttendanceAbstractData] = useState([]);
  const [attendanceAbstractLoading, setAttendanceAbstractLoading] = useState(false);
  const [showDetailedView, setShowDetailedView] = useState(false); // true when showing detailed view after drill-down
  const [selectedBranchForDrillDown, setSelectedBranchForDrillDown] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [attendanceFilters, setAttendanceFilters] = useState({
    college: '',
    batch: '',
    course: '',
    level: '',
    branch: '',
    year: '',
    semester: '',
    studentIds: [] // Array of selected student IDs
  });
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [attendanceDateRange, setAttendanceDateRange] = useState({
    fromDate: formatDateToLocalISO(new Date(new Date().setDate(new Date().getDate() - 30))),
    toDate: formatDateToLocalISO(new Date())
  });
  const [attendanceDateMode, setAttendanceDateMode] = useState('range'); // 'today' or 'range' or 'monthly'
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewType, setViewType] = useState('list'); // 'list' or 'grid'
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarAttendanceData, setCalendarAttendanceData] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Day End Report State
  const [dayEndReportLoading, setDayEndReportLoading] = useState(false);
  const [dayEndReportData, setDayEndReportData] = useState(null);
  const [dayEndGrouped, setDayEndGrouped] = useState([]);
  const [dayEndPreviewFilter, setDayEndPreviewFilter] = useState('all'); // all | marked | unmarked
  const [dayEndSortBy, setDayEndSortBy] = useState('none'); // none | branch | yearSem | course
  const [dayEndFilters, setDayEndFilters] = useState({
    college: '',
    batch: '',
    course: '',
    level: '',
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
    allData: []
  });
  const [coursesWithLevels, setCoursesWithLevels] = useState([]); // Store courses with level info
  const [collegesList, setCollegesList] = useState([]); // Store colleges with IDs for matching
  const [sendingReports, setSendingReports] = useState(false);
  const dayEndStatsRef = useRef(null);
  const [statsSectionHeight, setStatsSectionHeight] = useState(180);
  const [dayEndDate, setDayEndDate] = useState(formatDateToLocalISO(new Date()));

  // Fetch Abstract Data
  useEffect(() => {
    if (reportType === 'registration' && activeTab === 'abstract') {
      const fetchAbstract = async () => {
        setAbstractLoading(true);
        try {
          const params = new URLSearchParams();
          if (filters.college) params.append('filter_college', filters.college);
          if (filters.batch) params.append('filter_batch', filters.batch);
          if (filters.course) params.append('filter_course', filters.course);
          if (filters.level) params.append('filter_level', filters.level);
          if (filters.branch) params.append('filter_branch', filters.branch);
          if (filters.year) params.append('filter_year', filters.year);
          if (filters.semester) params.append('filter_semester', filters.semester);
          if (filters.scholarshipStatus) params.append('filter_scholarship_status', filters.scholarshipStatus);
          if (filters.search) params.append('search', filters.search);

          const response = await api.get(`/students/reports/registration/abstract?${params.toString()}`);
          if (response.data?.success) {
            setAbstractData(response.data.data || []);
            setGroupingParams(response.data.groupingParams || { key: 'college', label: 'College' });
          }
        } catch (error) {
          console.error('Failed to load abstract:', error);
          toast.error('Failed to load abstract report');
        } finally {
          setAbstractLoading(false);
        }
      };
      fetchAbstract();
    }
  }, [reportType, activeTab, filters]);

  // Debounced search
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchTerm }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadReport = useCallback(
    async (overrideFilters) => {
      const activeFilters = overrideFilters ?? filters;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeFilters.college) params.append('filter_college', activeFilters.college);
        if (activeFilters.batch) params.append('filter_batch', activeFilters.batch);
        if (activeFilters.course) params.append('filter_course', activeFilters.course);
        if (activeFilters.level) params.append('filter_level', activeFilters.level);
        if (activeFilters.branch) params.append('filter_branch', activeFilters.branch);
        if (activeFilters.year) params.append('filter_year', activeFilters.year);
        if (activeFilters.semester) params.append('filter_semester', activeFilters.semester);
        if (activeFilters.scholarshipStatus) params.append('filter_scholarship_status', activeFilters.scholarshipStatus);
        if (activeFilters.search) params.append('search', activeFilters.search);
        if (activeFilters.page) params.append('page', activeFilters.page);
        if (activeFilters.limit) params.append('limit', activeFilters.limit);

        const query = params.toString();
        const response = await api.get(`/students/reports/registration${query ? `?${query}` : ''}`);

        if (response.data?.success) {
          setReportData(response.data.data || []);
          if (response.data.pagination) {
            setPagination(prev => ({
              ...prev,
              page: parseInt(response.data.pagination.page),
              totalPages: parseInt(response.data.pagination.totalPages),
              totalRecords: parseInt(response.data.pagination.total),
              limit: parseInt(response.data.pagination.limit)
            }));
          }
          if (response.data.statistics) {
            setStats(response.data.statistics);
          }
        } else {
          throw new Error(response.data?.message || 'Unable to load reports');
        }
      } catch (error) {
        console.error('Failed to load registration report:', error);
        toast.error(
          error.response?.data?.message || error.message || 'Unable to load registration report'
        );
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );
  // Fetch initial options only once on mount
  useEffect(() => {
    const fetchInitialOptions = async () => {
      try {
        const response = await api.get('/students/quick-filters?applyExclusions=true');
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            colleges: data.colleges || [],
            batches: data.batches || [],
            courses: data.courses || [],
            branches: data.branches || [],
            years: data.years || [],
            semesters: data.semesters || []
          }));
        }
      } catch (error) {
        console.warn('Failed to fetch initial filter options:', error);
      }
    };
    fetchInitialOptions();
  }, []);

  // Fetch courses with level information for all report types
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

  // Fetch colleges list to get college IDs
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const response = await api.get('/colleges?includeInactive=false');
        if (response.data?.success) {
          setCollegesList(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch colleges:', error);
      }
    };
    fetchColleges();
  }, []);

  // Update Dependents when College, Level, or Batch changes
  useEffect(() => {
    const updateCollegeBatchDependents = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.level) params.append('level', filters.level);
        if (filters.batch) params.append('batch', filters.batch);
        // Only include course if it's selected (for branch filtering)
        if (filters.course) params.append('course', filters.course);
        params.append('applyExclusions', 'true');

        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            batches: data.batches || [],
            courses: data.courses || [],
            // Update branches based on current filters (will be filtered by course if course is selected)
            branches: data.branches || [],
            years: !filters.branch ? (data.years || []) : prev.years,
            semesters: (!filters.branch && !filters.year) ? (data.semesters || []) : prev.semesters
          }));
        }
      } catch (error) {
        console.warn('Failed to update college/batch dependents:', error);
      }
    };
    updateCollegeBatchDependents();
  }, [filters.college, filters.level, filters.batch, filters.course, filters.branch, filters.year]);

  // Update Dependents when Course changes
  useEffect(() => {
    if (!filters.course) return;

    const updateCourseDependents = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.level) params.append('level', filters.level);
        if (filters.batch) params.append('batch', filters.batch);
        params.append('course', filters.course);
        params.append('applyExclusions', 'true');

        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            branches: data.branches || [],
            years: !filters.branch ? (data.years || []) : prev.years,
            semesters: (!filters.branch && !filters.year) ? (data.semesters || []) : prev.semesters
          }));
        }
      } catch (error) {
        console.warn('Failed to update course dependents:', error);
      }
    };
    updateCourseDependents();
  }, [filters.course, filters.branch, filters.year]);

  // Update Dependents when Branch changes
  useEffect(() => {
    if (!filters.branch) return;

    const updateBranchDependents = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.level) params.append('level', filters.level);
        if (filters.batch) params.append('batch', filters.batch);
        if (filters.course) params.append('course', filters.course);
        params.append('branch', filters.branch);
        params.append('applyExclusions', 'true');

        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            years: data.years || [],
            semesters: !filters.year ? (data.semesters || []) : prev.semesters
          }));
        }
      } catch (error) {
        console.warn('Failed to update branch dependents:', error);
      }
    };
    updateBranchDependents();
  }, [filters.branch, filters.year]);

  // Update Dependents when Year changes
  useEffect(() => {
    if (!filters.year) return;

    const updateYearDependents = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.college) params.append('college', filters.college);
        if (filters.level) params.append('level', filters.level);
        if (filters.batch) params.append('batch', filters.batch);
        if (filters.course) params.append('course', filters.course);
        if (filters.branch) params.append('branch', filters.branch);
        params.append('year', filters.year);
        params.append('applyExclusions', 'true');

        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            semesters: data.semesters || []
          }));
        }
      } catch (error) {
        console.warn('Failed to update year dependents:', error);
      }
    };
    updateYearDependents();
  }, [filters.year]);

  useEffect(() => {
    loadReport({ ...filters, page: 1 });
  }, [filters, loadReport]);

  // Update Attendance Filter Options when College or Level changes
  useEffect(() => {
    const updateAttendanceFilterOptions = async () => {
      try {
        const params = new URLSearchParams();
        if (attendanceFilters.college) params.append('college', attendanceFilters.college);
        if (attendanceFilters.level) params.append('level', attendanceFilters.level);
        if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
        params.append('applyExclusions', 'true');

        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setFilterOptions(prev => ({
            ...prev,
            batches: data.batches || [],
            courses: data.courses || [],
            // Reset downstream options if their parents aren't selected
            branches: !attendanceFilters.course ? (data.branches || []) : prev.branches
          }));
        }
      } catch (error) {
        console.warn('Failed to update attendance filter options:', error);
      }
    };
    updateAttendanceFilterOptions();
  }, [attendanceFilters.college, attendanceFilters.level, attendanceFilters.batch]);

  // Fetch attendance report data
  const fetchAttendanceReport = useCallback(async () => {
    let fromDate = attendanceDateRange.fromDate;
    let toDate = attendanceDateRange.toDate;

    // If in today mode and dates are not set, use today's date
    if (attendanceDateMode === 'today' && (!fromDate || !toDate)) {
      const today = formatDateToLocalISO(new Date());
      fromDate = today;
      toDate = today;
      setAttendanceDateRange({ fromDate: today, toDate: today });
    }

    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    setAttendanceLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('fromDate', fromDate);
      params.append('toDate', toDate);

      if (attendanceFilters.college) params.append('college', attendanceFilters.college);
      if (attendanceFilters.level) params.append('level', attendanceFilters.level);
      if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
      if (attendanceFilters.course) params.append('course', attendanceFilters.course);
      if (attendanceFilters.branch) params.append('branch', attendanceFilters.branch);
      if (attendanceFilters.year) params.append('year', attendanceFilters.year);
      if (attendanceFilters.semester) params.append('semester', attendanceFilters.semester);

      const response = await api.get(`/attendance/report-for-students?${params.toString()}`);
      if (response.data?.success) {
        setAttendanceReportData(response.data.data);
      } else {
        throw new Error(response.data?.message || 'Failed to fetch attendance report');
      }
    } catch (error) {
      console.error('Failed to fetch attendance report:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to fetch attendance report');
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceDateRange, attendanceFilters, attendanceDateMode]);

  // Fetch attendance abstract data
  const fetchAttendanceAbstract = useCallback(async () => {
    const fromDate = attendanceDateRange.fromDate;
    const toDate = attendanceDateRange.toDate;

    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    setAttendanceAbstractLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('fromDate', fromDate);
      params.append('toDate', toDate);

      if (attendanceFilters.college) params.append('college', attendanceFilters.college);
      if (attendanceFilters.level) params.append('level', attendanceFilters.level);
      if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
      if (attendanceFilters.course) params.append('course', attendanceFilters.course);
      if (attendanceFilters.branch) params.append('branch', attendanceFilters.branch);
      if (attendanceFilters.year) params.append('year', attendanceFilters.year);
      if (attendanceFilters.semester) params.append('semester', attendanceFilters.semester);

      const response = await api.get(`/attendance/report/abstract?${params.toString()}`);
      if (response.data?.success) {
        setAttendanceAbstractData(response.data.data || []);
      } else {
        throw new Error(response.data?.message || 'Failed to fetch attendance abstract');
      }
    } catch (error) {
      console.error('Failed to fetch attendance abstract:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to fetch attendance abstract');
    } finally {
      setAttendanceAbstractLoading(false);
    }
  }, [attendanceDateRange, attendanceFilters, attendanceDateMode]);

  // Fetch calendar attendance data
  const fetchCalendarAttendanceData = useCallback(async () => {
    const fromDate = attendanceDateRange.fromDate;
    const toDate = attendanceDateRange.toDate;

    if (!fromDate || !toDate) {
      return;
    }

    setCalendarLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('fromDate', fromDate);
      params.append('toDate', toDate);

      if (attendanceFilters.college) params.append('college', attendanceFilters.college);
      if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
      if (attendanceFilters.course) params.append('course', attendanceFilters.course);
      if (attendanceFilters.branch) params.append('branch', attendanceFilters.branch);
      if (attendanceFilters.year) params.append('year', attendanceFilters.year);
      if (attendanceFilters.semester) params.append('semester', attendanceFilters.semester);

      const response = await api.get(`/attendance/report-for-students?${params.toString()}`);
      if (response.data?.success) {
        setCalendarAttendanceData(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch calendar attendance data:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, [attendanceDateRange, attendanceFilters]);

  // Fetch calendar data when modal opens
  useEffect(() => {
    if (calendarModalOpen) {
      fetchCalendarAttendanceData();
    }
  }, [calendarModalOpen, fetchCalendarAttendanceData]);

  // Handle Monthly date range calculation
  useEffect(() => {
    if (attendanceDateMode === 'monthly') {
      const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
      const lastDay = new Date(selectedYear, selectedMonth, 0);

      const fromDate = formatDateToLocalISO(firstDay);
      const toDate = formatDateToLocalISO(lastDay);

      if (attendanceDateRange.fromDate !== fromDate || attendanceDateRange.toDate !== toDate) {
        setAttendanceDateRange({ fromDate, toDate });
      }
    }
  }, [attendanceDateMode, selectedMonth, selectedYear, attendanceDateRange.fromDate, attendanceDateRange.toDate]);

  // Auto-fetch data when filters or date range change
  useEffect(() => {
    if (!attendanceDateRange.fromDate || !attendanceDateRange.toDate) {
      return;
    }

    const timer = setTimeout(() => {
      if (showDetailedView) {
        fetchAttendanceReport();
      } else {
        fetchAttendanceAbstract();
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timer);
  }, [
    attendanceDateRange.fromDate,
    attendanceDateRange.toDate,
    attendanceFilters.college,
    attendanceFilters.batch,
    attendanceFilters.course,
    attendanceFilters.branch,
    attendanceFilters.year,
    attendanceFilters.semester,
    showDetailedView,
    attendanceDateMode,
    fetchAttendanceAbstract,
    fetchAttendanceReport
  ]);

  // Handle branch drill down
  const handleBranchDrillDown = useCallback((branchData) => {
    setSelectedBranchForDrillDown(branchData);
    setShowDetailedView(true);
    // Set filters to match the selected branch
    const newFilters = {
      college: branchData.college || '',
      batch: branchData.batch || '',
      branch: branchData.branch || '',
      year: branchData.year || '',
      semester: branchData.semester || ''
    };
    setAttendanceFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  // Day End Report Helper Functions
  const extractHolidayReason = (groupedData) => {
    if (!Array.isArray(groupedData) || groupedData.length === 0) {
      return null;
    }
    for (const item of groupedData) {
      if (item.holidayReasons && item.holidayReasons.trim()) {
        return item.holidayReasons.trim();
      }
    }
    return null;
  };

  const filteredBranches = useMemo(() => {
    if (!dayEndFilterOptions.allData || dayEndFilterOptions.allData.length === 0) {
      return dayEndFilterOptions.branches || [];
    }
    let filteredData = dayEndFilterOptions.allData;
    if (dayEndFilters.college) {
      filteredData = filteredData.filter(item => item.college === dayEndFilters.college);
    }
    if (dayEndFilters.course) {
      filteredData = filteredData.filter(item => item.course === dayEndFilters.course);
    }
    const branches = [...new Set(filteredData.map(item => item.branch).filter(Boolean))].sort();
    return branches;
  }, [dayEndFilterOptions.allData, dayEndFilters.college, dayEndFilters.course]);

  const filteredCourses = useMemo(() => {
    if (!dayEndFilterOptions.allData || dayEndFilterOptions.allData.length === 0) {
      // If no data, return courses from filter options with level info
      const courseNames = dayEndFilterOptions.courses || [];
      return courseNames.map(courseName => {
        const courseInfo = coursesWithLevels.find(c => c.name === courseName);
        return {
          name: courseName,
          level: courseInfo?.level || null
        };
      });
    }
    let filteredData = dayEndFilterOptions.allData;
    if (dayEndFilters.college) {
      filteredData = filteredData.filter(item => item.college === dayEndFilters.college);
    }
    const courseNames = [...new Set(filteredData.map(item => item.course).filter(Boolean))].sort();
    // Map course names to objects with level information
    return courseNames.map(courseName => {
      const courseInfo = coursesWithLevels.find(c => c.name === courseName);
      return {
        name: courseName,
        level: courseInfo?.level || null
      };
    });
  }, [dayEndFilterOptions.allData, dayEndFilters.college, dayEndFilters.level, coursesWithLevels]);

  const dayEndGroupedDisplay = useMemo(() => {
    let rows = Array.isArray(dayEndGrouped) ? [...dayEndGrouped] : [];
    rows = rows.filter((row) => {
      if (dayEndPreviewFilter === 'marked' && (row.markedToday || 0) === 0) return false;
      if (dayEndPreviewFilter === 'unmarked' && (row.pendingToday || 0) === 0) return false;
      if (dayEndFilters.college && row.college !== dayEndFilters.college) return false;
      // Filter by level - check if the course matches the selected level
      if (dayEndFilters.level) {
        const courseInfo = coursesWithLevels.find(c => c.name === row.course);
        if (!courseInfo || courseInfo.level !== dayEndFilters.level) return false;
      }
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
  }, [dayEndGrouped, dayEndPreviewFilter, dayEndSortBy, dayEndFilters, coursesWithLevels]);

  const filteredStats = useMemo(() => {
    const filteredRows = dayEndGroupedDisplay;
    const totalStudents = filteredRows.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
    const markedToday = filteredRows.reduce((sum, row) => sum + (row.markedToday || 0), 0);
    const absentToday = filteredRows.reduce((sum, row) => sum + (row.absentToday || 0), 0);
    const presentToday = filteredRows.reduce((sum, row) => sum + (row.presentToday || 0), 0);
    const holidayToday = filteredRows.reduce((sum, row) => sum + (row.holidayToday || 0), 0);
    const unmarkedToday = filteredRows.reduce((sum, row) => sum + (row.pendingToday || 0), 0);
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

  // Day End Report Handlers
  const handleDayEndReport = async () => {
    setDayEndReportLoading(true);
    try {
      const params = {
        date: dayEndDate,
        student_status: 'Regular'
      };
      const response = await api.get('/attendance/summary', { params });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to fetch day-end report');
      }
      const summary = response.data?.data || {};
      const totalStudents = summary.totalStudents || 0;
      const dailyArray = Array.isArray(summary.daily) ? summary.daily : Object.values(summary.daily || {});
      const safeDaily = (dailyArray || []).filter((d) => d && typeof d === 'object');
      const presentToday = Number(safeDaily.find((d) => d.status === 'present')?.count ?? summary.daily?.present ?? 0) || 0;
      const absentToday = Number(safeDaily.find((d) => d.status === 'absent')?.count ?? summary.daily?.absent ?? 0) || 0;
      const holidayToday = Number(safeDaily.find((d) => d.status === 'holiday')?.count ?? summary.daily?.holiday ?? 0) || 0;
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
        date: dayEndDate,
        holidayReason: extractHolidayReason(groupedData)
      });

      // Fetch courses with level information
      try {
        const coursesResponse = await api.get('/courses?includeInactive=false');
        if (coursesResponse.data?.success) {
          setCoursesWithLevels(coursesResponse.data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch courses with levels:', error);
      }

      const colleges = [...new Set(groupedData.map(item => item.college).filter(Boolean))].sort();
      const batches = [...new Set(groupedData.map(item => item.batch).filter(Boolean))].sort();
      const courses = [...new Set(groupedData.map(item => item.course).filter(Boolean))].sort();
      const branches = [...new Set(groupedData.map(item => item.branch).filter(Boolean))].sort();
      const years = [...new Set(groupedData.map(item => item.year || item.currentYear).filter(Boolean))].sort();
      const semesters = [...new Set(groupedData.map(item => item.semester || item.currentSemester).filter(Boolean))].sort();
      setDayEndFilterOptions({
        colleges,
        batches,
        courses,
        branches,
        years,
        semesters,
        allData: groupedData
      });
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
      params.append('date', dayEndDate);
      params.append('format', format);
      params.append('student_status', 'Regular');
      params.append('include_holiday_reason', 'true');
      if (dayEndFilters.college) params.append('college', dayEndFilters.college);
      if (dayEndFilters.batch) params.append('batch', dayEndFilters.batch);
      if (dayEndFilters.course) params.append('course', dayEndFilters.course);
      if (dayEndFilters.branch) params.append('branch', dayEndFilters.branch);
      if (dayEndFilters.year) params.append('year', dayEndFilters.year);
      if (dayEndFilters.semester) params.append('semester', dayEndFilters.semester);
      if (dayEndPreviewFilter && dayEndPreviewFilter !== 'all') {
        params.append('previewFilter', dayEndPreviewFilter);
      }
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
      const filterSuffix = dayEndPreviewFilter && dayEndPreviewFilter !== 'all' ? `_${dayEndPreviewFilter}` : '';
      const fileName = `day_end_report_${dayEndDate}${filterSuffix}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
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
    if (!dayEndDate) {
      toast.error('Please select a date');
      return;
    }
    setSendingReports(true);
    try {
      const response = await api.post('/attendance/send-day-end-reports', {
        date: dayEndDate
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

  // Auto-load Day End Report when on day-end page or when date changes
  useEffect(() => {
    if (reportType === 'dayend' && dayEndDate) {
      // Only auto-load if we don't have data for this specific date
      if (!dayEndReportData || dayEndReportData.date !== dayEndDate) {
        handleDayEndReport();
      }
    }
  }, [reportType, dayEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Measure stats section height for sticky positioning
  useEffect(() => {
    if (reportType === 'dayend' && dayEndReportData) {
      const measureHeight = () => {
        if (dayEndStatsRef.current) {
          const height = dayEndStatsRef.current.offsetHeight;
          setStatsSectionHeight(height);
        }
      };
      measureHeight();
      const timeoutId = setTimeout(measureHeight, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [reportType, dayEndReportData]);

  // Download attendance report as PDF
  const downloadAttendancePDF = async () => {
    if (!attendanceReportData) {
      toast.error('Please generate the report first');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm', 'a4');

      // Title
      doc.setFontSize(18);
      doc.text('Attendance Report', 14, 15);
      doc.setFontSize(12);
      doc.text(`Period: ${attendanceReportData.fromDate} to ${attendanceReportData.toDate}`, 14, 22);

      let yPos = 30;

      // Statistics
      doc.setFontSize(11);
      doc.text(`Total Students: ${attendanceReportData.statistics.totalStudents}`, 14, yPos);
      yPos += 6;
      doc.text(`Working Days: ${attendanceReportData.statistics.totalWorkingDays}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Present: ${attendanceReportData.statistics.totalPresent}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Absent: ${attendanceReportData.statistics.totalAbsent}`, 14, yPos);
      yPos += 6;
      doc.text(`Overall Attendance Percentage: ${attendanceReportData.statistics.overallAttendancePercentage.toFixed(2)}%`, 14, yPos);
      yPos += 10;

      // Table headers
      doc.setFontSize(10);
      doc.text('PIN', 14, yPos);
      doc.text('Student Name', 30, yPos);
      doc.text('Course', 80, yPos);
      doc.text('Branch', 110, yPos);
      doc.text('Working Days', 140, yPos);
      doc.text('Present', 165, yPos);
      doc.text('Absent', 185, yPos);
      doc.text('Percentage', 205, yPos);
      yPos += 6;

      // Table rows
      attendanceReportData.students.forEach((student) => {
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(student.pinNumber || '-', 14, yPos);
        doc.text(student.studentName || '-', 30, yPos);
        doc.text(student.course || '-', 80, yPos);
        doc.text(student.branch || '-', 110, yPos);
        doc.text(student.statistics.workingDays.toString(), 140, yPos);
        doc.text(student.statistics.presentDays.toString(), 165, yPos);
        doc.text(student.statistics.absentDays.toString(), 185, yPos);
        doc.text(`${student.statistics.attendancePercentage.toFixed(2)}%`, 205, yPos);
        yPos += 6;
      });

      doc.save(`attendance_report_${attendanceReportData.fromDate}_to_${attendanceReportData.toDate}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  // Download attendance report as Excel
  const downloadAttendanceExcel = async () => {
    if (!attendanceReportData) {
      toast.error('Please generate the report first');
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('fromDate', attendanceReportData.fromDate);
      params.append('toDate', attendanceReportData.toDate);
      params.append('format', 'excel');

      if (attendanceFilters.college) params.append('college', attendanceFilters.college);
      if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
      if (attendanceFilters.course) params.append('course', attendanceFilters.course);
      if (attendanceFilters.branch) params.append('branch', attendanceFilters.branch);
      if (attendanceFilters.year) params.append('year', attendanceFilters.year);
      if (attendanceFilters.semester) params.append('semester', attendanceFilters.semester);

      const response = await api.get(`/attendance/download?${params.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${attendanceReportData.fromDate}_to_${attendanceReportData.toDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Excel file downloaded successfully');
    } catch (error) {
      console.error('Failed to download Excel:', error);
      toast.error(error.response?.data?.message || 'Failed to download Excel file');
    }
  };

  // Download attendance abstract as Excel
  const downloadAbstractExcel = async () => {
    if (!attendanceAbstractData || attendanceAbstractData.length === 0) {
      toast.error('Please generate the abstract report first');
      return;
    }

    if (!attendanceDateRange.fromDate || !attendanceDateRange.toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('fromDate', attendanceDateRange.fromDate);
      params.append('toDate', attendanceDateRange.toDate);
      params.append('format', 'excel');

      // Only add filters if they are set (empty filters mean "all students" which generates aggregated report)
      if (attendanceFilters.college) params.append('college', attendanceFilters.college);
      if (attendanceFilters.batch) params.append('batch', attendanceFilters.batch);
      if (attendanceFilters.course) params.append('course', attendanceFilters.course);
      if (attendanceFilters.branch) params.append('branch', attendanceFilters.branch);
      if (attendanceFilters.year) params.append('year', attendanceFilters.year);
      if (attendanceFilters.semester) params.append('semester', attendanceFilters.semester);

      const response = await api.get(`/attendance/download?${params.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_abstract_${attendanceDateRange.fromDate}_to_${attendanceDateRange.toDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Excel file downloaded successfully');
    } catch (error) {
      console.error('Failed to download Excel:', error);
      toast.error(error.response?.data?.message || 'Failed to download Excel file');
    }
  };

  // Download attendance abstract as PDF
  const downloadAbstractPDF = async () => {
    if (!attendanceAbstractData || attendanceAbstractData.length === 0) {
      toast.error('Please generate the abstract report first');
      return;
    }

    if (!attendanceDateRange.fromDate || !attendanceDateRange.toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm', 'a4');

      // Title
      doc.setFontSize(18);
      doc.text('Attendance Abstract Report', 14, 15);
      doc.setFontSize(12);
      doc.text(`Period: ${attendanceDateRange.fromDate} to ${attendanceDateRange.toDate}`, 14, 22);

      // Calculate totals
      const totalStudents = attendanceAbstractData.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
      const workingDays = attendanceAbstractData[0]?.workingDays || 0;
      const totalPresent = attendanceAbstractData.reduce((sum, row) => sum + (row.totalPresentDays || 0), 0);
      const totalAbsent = attendanceAbstractData.reduce((sum, row) => sum + (row.totalAbsentDays || 0), 0);
      const totalMarked = totalPresent + totalAbsent;

      const overallPresentPercentage = workingDays > 0 && totalStudents > 0
        ? ((totalPresent / (totalStudents * workingDays)) * 100).toFixed(2)
        : '0.00';
      const overallAbsentPercentage = workingDays > 0 && totalStudents > 0
        ? ((totalAbsent / (totalStudents * workingDays)) * 100).toFixed(2)
        : '0.00';
      const overallAttendancePercentage = workingDays > 0 && totalStudents > 0
        ? ((totalPresent / (totalStudents * workingDays)) * 100).toFixed(2)
        : '0.00';

      let yPos = 30;

      // Statistics
      doc.setFontSize(11);
      doc.text(`Total Students: ${totalStudents}`, 14, yPos);
      yPos += 6;
      doc.text(`Working Days: ${workingDays}`, 14, yPos);
      yPos += 6;
      doc.text(`Overall Present %: ${overallPresentPercentage}%`, 14, yPos);
      yPos += 6;
      doc.text(`Overall Absent %: ${overallAbsentPercentage}%`, 14, yPos);
      yPos += 6;
      doc.text(`Overall Attendance %: ${overallAttendancePercentage}%`, 14, yPos);
      yPos += 10;

      // Table headers
      doc.setFontSize(10);
      const headers = ['College', 'Batch', 'Branch', 'Year', 'Sem', 'Students', 'Working Days', 'Present %', 'Absent %', 'Attendance %'];
      const colWidths = [45, 20, 35, 15, 12, 18, 25, 18, 18, 20];
      const headerStartX = 14;
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);

      // Draw header background
      doc.setFillColor(240, 240, 240);
      doc.rect(headerStartX, yPos - 5, tableWidth, 7, 'F');

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      let xPos = headerStartX;
      headers.forEach((header, idx) => {
        doc.text(header, xPos + 2, yPos);
        xPos += colWidths[idx];
      });
      doc.setFont(undefined, 'normal');

      // Draw header bottom line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);
      yPos += 7;

      // Table rows
      attendanceAbstractData.forEach((row, idx) => {
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
          // Redraw headers
          doc.setFillColor(240, 240, 240);
          doc.rect(headerStartX, yPos - 5, tableWidth, 7, 'F');
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          xPos = headerStartX;
          headers.forEach((header, i) => {
            doc.text(header, xPos + 2, yPos);
            xPos += colWidths[i];
          });
          doc.setFont(undefined, 'normal');
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);
          yPos += 7;
        }

        // Alternating row background
        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248);
          doc.rect(headerStartX, yPos - 4, tableWidth, 6, 'F');
        }

        // Draw cell borders
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.05);
        xPos = headerStartX;
        headers.forEach((_, i) => {
          if (i > 0) {
            doc.line(xPos, yPos - 4, xPos, yPos + 2);
          }
          xPos += colWidths[i];
        });
        doc.line(headerStartX + tableWidth, yPos - 4, headerStartX + tableWidth, yPos + 2);
        doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);

        // Row data
        xPos = headerStartX;
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text((row.college || '-').substring(0, 20), xPos + 2, yPos, { maxWidth: colWidths[0] - 4 });
        xPos += colWidths[0];
        doc.text((row.batch || '-').substring(0, 8), xPos + 2, yPos);
        xPos += colWidths[1];
        doc.text((row.branch || '-').substring(0, 12), xPos + 2, yPos);
        xPos += colWidths[2];
        doc.text(String(row.year || '-'), xPos + 2, yPos);
        xPos += colWidths[3];
        doc.text(String(row.semester || '-'), xPos + 2, yPos);
        xPos += colWidths[4];
        doc.text(String(row.totalStudents || 0), xPos + 2, yPos);
        xPos += colWidths[5];
        doc.text(String(row.workingDays || 0), xPos + 2, yPos);
        xPos += colWidths[6];
        doc.setTextColor(0, 128, 0);
        doc.text(`${(row.presentPercentage || 0).toFixed(2)}%`, xPos + 2, yPos);
        xPos += colWidths[7];
        doc.setTextColor(200, 0, 0);
        doc.text(`${(row.absentPercentage || 0).toFixed(2)}%`, xPos + 2, yPos);
        xPos += colWidths[8];
        doc.setTextColor(0, 0, 0);
        doc.text(`${(row.attendancePercentage || 0).toFixed(2)}%`, xPos + 2, yPos);

        yPos += 6;
      });

      // Draw closing line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(headerStartX, yPos - 4, headerStartX + tableWidth, yPos - 4);

      // Save PDF
      doc.save(`attendance_abstract_${attendanceDateRange.fromDate}_to_${attendanceDateRange.toDate}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      loadReport({ ...filters, page: newPage });
    }
  };

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
      if (field === 'college') {
        delete newFilters.level;
        delete newFilters.batch;
        delete newFilters.course;
        delete newFilters.branch;
      } else if (field === 'level') {
        // If level changes, clear batch, course and branch
        delete newFilters.batch;
        delete newFilters.course;
        delete newFilters.branch;
        delete newFilters.year;
        delete newFilters.semester;
      } else if (field === 'batch') {
        delete newFilters.course;
        delete newFilters.branch;
        delete newFilters.year;
        delete newFilters.semester;
      } else if (field === 'course') {
        delete newFilters.branch;
        delete newFilters.year;
        delete newFilters.semester;
      } else if (field === 'branch') {
        delete newFilters.year;
        delete newFilters.semester;
      } else if (field === 'year') {
        delete newFilters.semester;
      }

      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters({
      college: '',
      batch: '',
      course: '',
      branch: '',
      year: '',
      semester: '',
      scholarshipStatus: '',
      search: ''
    });
    setSearchTerm('');
  };

  const activeFilterEntries = useMemo(() => {
    const entries = [];
    if (filters.college) entries.push({ key: 'college', label: `College: ${filters.college}` });
    if (filters.batch) entries.push({ key: 'batch', label: `Batch: ${filters.batch}` });
    if (filters.course) entries.push({ key: 'course', label: `Program: ${filters.course}` });
    if (filters.branch) entries.push({ key: 'branch', label: `Branch: ${filters.branch}` });
    if (filters.year) entries.push({ key: 'year', label: `Year: ${filters.year}` });
    if (filters.semester) entries.push({ key: 'semester', label: `Semester: ${filters.semester}` });
    if (filters.scholarshipStatus) entries.push({ key: 'scholarshipStatus', label: `Scholarship: ${filters.scholarshipStatus === 'pending' ? 'Not assigned' : filters.scholarshipStatus === 'eligible' ? 'Eligible' : 'Rejected'}` });
    return entries;
  }, [filters]);

  const availableYears = useMemo(() => {
    const list = filterOptions.years || [];
    if (list.length === 0) {
      return [1, 2, 3, 4];
    }
    return [...list].sort((a, b) => a - b);
  }, [filterOptions.years]);

  const availableSemesters = useMemo(() => {
    const list = filterOptions.semesters || [];
    if (list.length === 0) {
      return [1, 2];
    }
    return [...list].sort((a, b) => a - b);
  }, [filterOptions.semesters]);

  // Get available courses filtered by college and level (for Registration Reports)
  const availableCourses = useMemo(() => {
    if (!coursesWithLevels || coursesWithLevels.length === 0) {
      // Fallback to filterOptions.courses if coursesWithLevels is not loaded
      return (filterOptions.courses || []).sort();
    }

    let filteredCourses = coursesWithLevels;

    // Filter by college if college is selected
    if (filters.college) {
      // Find college ID from college name
      const selectedCollege = collegesList.find(c => c.name === filters.college);
      if (selectedCollege && selectedCollege.id) {
        // Filter courses by collegeId
        filteredCourses = filteredCourses.filter(course => {
          const courseCollegeId = course.collegeId || course.college_id;
          return courseCollegeId === selectedCollege.id;
        });
      } else {
        // College not found in list, return empty
        return [];
      }
    }

    // Filter by level if level is selected
    if (filters.level) {
      filteredCourses = filteredCourses.filter(course => course.level === filters.level);
    }

    // Extract course names, remove duplicates, filter out empty values, and sort
    return [...new Set(filteredCourses.map(c => c.name).filter(Boolean))].sort();
  }, [coursesWithLevels, collegesList, filters.college, filters.level]);

  const hasActiveFilters = activeFilterEntries.length > 0;

  // Transform stats for charts
  const overviewChartData = useMemo(() => {
    if (!stats) return [];
    return [
      {
        name: 'Verification',
        completed: stats.verification?.completed || 0,
        pending: stats.verification?.pending || 0
      },
      {
        name: 'Certificates',
        completed: stats.certificates?.verified || 0,
        pending: stats.certificates?.pending || 0
      },
      {
        name: 'Fees',
        completed: stats.fees?.cleared || 0,
        pending: stats.fees?.pending || 0
      },
      {
        name: 'Promotion',
        completed: stats.promotion?.completed || 0,
        pending: stats.promotion?.pending || 0
      },
      {
        name: 'Scholarship',
        completed: stats.scholarship?.assigned || 0,
        pending: stats.scholarship?.pending || 0
      }
    ];
  }, [stats]);


  // Chart Data Helpers
  const renderSingleStageChart = (stageName, completed, pending, colors = ['#10B981', '#EF4444']) => {
    const data = [
      { name: 'Completed', value: completed },
      { name: 'Pending', value: pending }
    ];
    // Don't render if no data
    if (completed === 0 && pending === 0) return null;

    return (
      <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center h-full">
        <h3 className="text-xs font-semibold text-gray-700 mb-1">{stageName}</h3>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="80%"
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-2 text-[10px] mt-1">
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: colors[0] }}></div>
            <span className="text-gray-600">{completed}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: colors[1] }}></div>
            <span className="text-gray-600">{pending}</span>
          </div>
        </div>
      </div>
    );
  };

  const StatsGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 flex-shrink-0">
      <div className="bg-blue-50 p-2 md:p-3 rounded-lg border border-blue-100">
        <div className="text-[10px] md:text-xs text-blue-600 uppercase font-semibold">Total</div>
        <div className="text-lg md:text-xl font-bold text-blue-900">{stats?.total || 0}</div>
      </div>
      <div className="bg-gray-50 p-2 md:p-3 rounded-lg border border-gray-100">
        <div className="text-[10px] md:text-xs text-gray-600 uppercase font-semibold">Registration</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-green-600">{stats?.registration?.completed || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-amber-500">{stats?.registration?.temporary || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-red-500">{stats?.registration?.pending || 0}</span>
        </div>
      </div>
      <div className="bg-yellow-50 p-2 md:p-3 rounded-lg border border-yellow-100">
        <div className="text-[10px] md:text-xs text-yellow-600 uppercase font-semibold">Verification</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-green-600">{stats?.verification?.completed || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-red-500">{stats?.verification?.pending || 0}</span>
        </div>
      </div>
      <div className="bg-purple-50 p-2 md:p-3 rounded-lg border border-purple-100">
        <div className="text-[10px] md:text-xs text-purple-600 uppercase font-semibold">Certificates</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-green-600">{stats?.certificates?.verified || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-amber-500">{stats?.certificates?.temporary || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-red-500">{stats?.certificates?.pending || 0}</span>
        </div>
      </div>
      <div className="bg-green-50 p-2 md:p-3 rounded-lg border border-green-100">
        <div className="text-[10px] md:text-xs text-green-600 uppercase font-semibold">Fees</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-green-600">{stats?.fees?.cleared || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-red-500">{stats?.fees?.pending || 0}</span>
        </div>
      </div>
      <div className="bg-indigo-50 p-2 md:p-3 rounded-lg border border-indigo-100">
        <div className="text-[10px] md:text-xs text-indigo-600 uppercase font-semibold">Promotion</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-green-600">{stats?.promotion?.completed || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-sm font-bold text-red-500">{stats?.promotion?.pending || 0}</span>
        </div>
      </div>
      <div className="bg-pink-50 p-2 md:p-3 rounded-lg border border-pink-100">
        <div className="text-[10px] md:text-xs text-pink-600 uppercase font-semibold">Scholarship</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-sm font-bold text-green-600">{stats?.scholarship?.assigned || 0}</span>
          <span className="text-xs text-gray-400">/</span>
          {(stats?.scholarship?.pending || 0) > 0 ? (
            <button
              type="button"
              onClick={() => {
                setFilters(prev => ({ ...prev, scholarshipStatus: 'pending' }));
                setActiveTab('sheet');
                setTimeout(() => loadReport({ ...filters, scholarshipStatus: 'pending', page: 1 }), 0);
              }}
              className="text-sm font-bold text-red-500 hover:text-red-700 hover:underline focus:outline-none focus:underline"
              title="Show only students with scholarship pending (empty)"
            >
              {stats?.scholarship?.pending || 0}
            </button>
          ) : (
            <span className="text-sm font-bold text-red-500">{stats?.scholarship?.pending || 0}</span>
          )}
        </div>
        {(stats?.scholarship?.pending || 0) > 0 && (
          <div className="text-[10px] text-pink-600 mt-0.5">Click number to view pending</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full h-full overflow-hidden">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <div className="rounded-full bg-blue-100 p-3 text-blue-600">
            <FileText size={32} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 heading-font">
                  {reportType === 'registration' ? 'Registration Reports' : reportType === 'dayend' ? 'Day End Report' : 'Attendance Reports'}
                </h1>
                <p className="text-sm text-gray-600">
                  {reportType === 'registration'
                    ? 'Track student registration status across the 5 stages.'
                    : reportType === 'dayend'
                      ? 'View daily attendance summary and statistics.'
                      : 'View and analyze student attendance with percentage calculations.'}
                </p>
              </div>
              {/* Today/Range Tabs and Calendar - Only for Attendance Reports */}
              {reportType === 'attendance' && (
                <>
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => {
                        setAttendanceDateMode('today');
                        const today = formatDateToLocalISO(new Date());
                        setAttendanceDateRange({ fromDate: today, toDate: today });
                      }}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${attendanceDateMode === 'today'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setAttendanceDateMode('range')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${attendanceDateMode === 'range'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      Range
                    </button>
                    <button
                      onClick={() => setAttendanceDateMode('monthly')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${attendanceDateMode === 'monthly'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      Monthly
                    </button>
                  </div>
                  <button
                    onClick={() => setCalendarModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
                    title="View Calendar"
                  >
                    <CalendarDays size={18} />
                    Calendar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Registration Report Tabs - Only show when registration is selected */}
          {reportType === 'registration' && (
            <div className='flex bg-gray-100 p-1 rounded-lg mr-2'>
              <button
                onClick={() => setActiveTab('abstract')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'abstract'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Abstract
              </button>
              <button
                onClick={() => setActiveTab('sheet')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'sheet'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Sheets
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'analytics'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Graphs
              </button>
            </div>
          )}




          {reportType === 'registration' && (
            <>
              <button
                onClick={() => loadReport(filters)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                {loading ? <span className="h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={16} />}
                Refresh
              </button>
              <button
                onClick={() => setDownloadModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 text-sm font-medium transition-colors"
              >
                <Download size={16} />
                Download
              </button>
            </>
          )}
          {reportType === 'dayend' && (
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dayEndDate}
                onChange={(e) => setDayEndDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleDayEndReport}
                disabled={dayEndReportLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {dayEndReportLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Refresh Report
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Filters Section - Only for Registration Reports */}
      {reportType === 'registration' && (
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex-shrink-0">
          {/* Filters and Actions Row */}
          <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 w-full">


              {/* College */}
              <select
                value={filters.college || ''}
                onChange={(e) => handleFilterChange('college', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Colleges</option>
                {filterOptions.colleges.map((college) => (
                  <option key={college} value={college}>
                    {college}
                  </option>
                ))}
              </select>

              {/* Level */}
              <select
                value={filters.level || ''}
                onChange={(e) => handleFilterChange('level', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                <option value="diploma">Diploma</option>
                <option value="ug">UG</option>
                <option value="pg">PG</option>
              </select>

              {/* Batch */}
              <select
                value={filters.batch}
                onChange={(e) => handleFilterChange('batch', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Batches</option>
                {(filterOptions.batches || []).map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>

              {/* Program */}
              <select
                value={filters.course || ''}
                onChange={(e) => handleFilterChange('course', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Programs</option>
                {availableCourses.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>

              {/* Branch */}
              <select
                value={filters.branch || ''}
                onChange={(e) => handleFilterChange('branch', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Branches</option>
                {(filterOptions.branches || []).map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>

              {/* Year */}
              <select
                value={filters.year}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={String(year)}>
                    Year {year}
                  </option>
                ))}
              </select>

              {/* Semester */}
              <select
                value={filters.semester}
                onChange={(e) => handleFilterChange('semester', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sems</option>
                {availableSemesters.map((semester) => (
                  <option key={semester} value={String(semester)}>
                    Sem {semester}
                  </option>
                ))}
              </select>

              {/* Scholarship Status - quickly find pending/eligible/not eligible */}
              <select
                value={filters.scholarshipStatus || ''}
                onChange={(e) => handleFilterChange('scholarshipStatus', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Filter by scholarship status to find students"
              >
                <option value="">All Scholarship</option>
                <option value="pending">Not assigned (—)</option>
                <option value="eligible">Eligible</option>
                <option value="not_eligible">Rejected</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
              >
                <XCircle size={16} />
                Clear
              </button>
            )}
          </div>
        </section>
      )}

      {/* Abstract View */}
      {reportType === 'registration' && activeTab === 'abstract' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300 gap-4">
          {/* Stats Grid - Shared */}
          {stats && (
            <div className="flex-shrink-0">
              <StatsGrid />
            </div>
          )}

          {abstractLoading && abstractData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500" >
              <RefreshCw className="animate-spin" size={24} />
              Loading abstract data...
            </div>
          ) : abstractData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
              <AlertCircle size={32} />
              <p>No summary data found matching current filters.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">
              {abstractLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                  <RefreshCw className="animate-spin text-gray-500" size={24} />
                </div>
              )}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left relative">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Batch</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">College</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Program</th>
                      <th className="px-4 py-3 bg-gray-50 max-w-[200px] whitespace-normal">Branch</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Year</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Sem</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center">Total Students</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center">Overall Completed</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center">Temporary</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center">Pending</th>
                      {/* Removed Completion % */}
                      {/* Detailed Breakdowns - Unified (No border-l) */}
                      <th className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">Verification</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">Certificates</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">Fees</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">Promotion</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">Scholarship</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {abstractData.map((row, idx) => {
                      const total = parseInt(row.total || 0);
                      const completed = parseInt(row.overall_completed || 0);
                      const pending = total - completed;

                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-700">{row.batch || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.college || '-'}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.course || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.branch || '-'}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{row.current_year || '-'}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{row.current_semester || '-'}</td>
                          <td className="px-4 py-3 text-center font-semibold">{total}</td>
                          <td className="px-4 py-3 text-center text-green-600 font-medium">{completed}</td>
                          <td className="px-4 py-3 text-center text-amber-600 font-medium">{parseInt(row.overall_temporary || 0)}</td>
                          <td className="px-4 py-3 text-center text-red-500 font-medium">{pending - parseInt(row.overall_temporary || 0)}</td>
                          {/* Removed Completion % Cell */}

                          {/* Breakdown Columns - Matches Header */}
                          <td className="px-4 py-3 text-center text-gray-600">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{row.verification_completed}</span> / <span className="text-red-400">{total - row.verification_completed}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{row.certificates_verified}</span> / <span className="text-amber-600 font-medium">{row.certificates_temporary || 0}</span> / <span className="text-red-400">{total - row.certificates_verified - parseInt(row.certificates_temporary || 0)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{row.fee_cleared}</span> / <span className="text-red-400">{total - row.fee_cleared}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{row.promotion_completed}</span> / <span className="text-red-400">{total - row.promotion_completed}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{row.scholarship_assigned}</span> / <span className="text-red-400">{row.scholarship_pending ?? (total - row.scholarship_assigned)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                    {/* Grand Total Row */}
                    {abstractData.length > 0 && (
                      <tr>
                        <td className="px-4 py-3" colSpan={6}>Total</td>
                        <td className="px-4 py-3 text-center">{abstractData.reduce((acc, r) => acc + parseInt(r.total || 0), 0)}</td>
                        <td className="px-4 py-3 text-center text-green-700">{abstractData.reduce((acc, r) => acc + parseInt(r.overall_completed || 0), 0)}</td>
                        <td className="px-4 py-3 text-center text-amber-600">{abstractData.reduce((acc, r) => acc + parseInt(r.overall_temporary || 0), 0)}</td>
                        <td className="px-4 py-3 text-center text-red-600">{
                          abstractData.reduce((acc, r) => acc + (parseInt(r.total || 0) - parseInt(r.overall_completed || 0) - parseInt(r.overall_temporary || 0)), 0)
                        }</td>
                        {/* Removed % Total Cell */}
                        <td className="px-4 py-3 text-center">
                          {abstractData.reduce((acc, r) => acc + parseInt(r.verification_completed || 0), 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-green-700">{abstractData.reduce((acc, r) => acc + parseInt(r.certificates_verified || 0), 0)}</span> / <span className="text-amber-600">{abstractData.reduce((acc, r) => acc + parseInt(r.certificates_temporary || 0), 0)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {abstractData.reduce((acc, r) => acc + parseInt(r.fee_cleared || 0), 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {abstractData.reduce((acc, r) => acc + parseInt(r.promotion_completed || 0), 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-green-700">{abstractData.reduce((acc, r) => acc + parseInt(r.scholarship_assigned || 0), 0)}</span>
                          {' / '}
                          <span className="text-red-600">{abstractData.reduce((acc, r) => acc + parseInt(r.scholarship_pending ?? 0), 0)}</span>
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics View */}
      {reportType === 'registration' && activeTab === 'analytics' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-4 animate-in fade-in duration-300">
          {stats && <StatsGrid />}

          {stats && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* Overview Charts (Bar + Line) */}
              <div className="h-80 shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bar Chart */}
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <h3 className="text-sm font-bold text-gray-800 mb-2 flex-shrink-0">Stage-wise Overview</h3>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overviewChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pending" fill="#EF4444" name="Pending" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Line Chart */}
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <h3 className="text-sm font-bold text-gray-800 mb-2 flex-shrink-0">Stage-wise Trends</h3>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overviewChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} name="Completed" dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="pending" stroke="#EF4444" strokeWidth={2} name="Pending" dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Detailed Pie Charts Grid - Strip at bottom */}
              <div className="h-48 shrink-0 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {renderSingleStageChart('Verification', stats.verification?.completed || 0, stats.verification?.pending || 0, ['#EAB308', '#FCA5A5'])}
                {renderSingleStageChart('Certificates', stats.certificates?.verified || 0, stats.certificates?.pending || 0, ['#A855F7', '#FCA5A5'])}
                {renderSingleStageChart('Fees', stats.fees?.cleared || 0, stats.fees?.pending || 0, ['#22C55E', '#FCA5A5'])}
                {renderSingleStageChart('Promotion', stats.promotion?.completed || 0, stats.promotion?.pending || 0, ['#6366F1', '#FCA5A5'])}
                {renderSingleStageChart('Scholarship', stats.scholarship?.assigned || 0, stats.scholarship?.pending || 0, ['#EC4899', '#FCA5A5'])}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sheets View */}
      {reportType === 'registration' && activeTab === 'sheet' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300 gap-4">

          {/* Stats Grid - Fixed at top of Sheets view */}
          <div className="flex-shrink-0">
            {stats && <StatsGrid />}
          </div>

          {/* Table Area - Grows to fill remaining space */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500" >
              <RefreshCw className="animate-spin" size={24} />
              Loading report data...
            </div>
          ) : reportData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
              <AlertCircle size={32} />
              <p>No students found matching current filters.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {/* Scrollable Table Body */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left relative">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Pin No</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Student Name</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Program</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Branch</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Year</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Sem</th>
                      <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Registration Status</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Information Verification</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Certificates</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Fees</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Promotion</th>
                      <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Scholarship</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.map((student) => (
                      <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{student.pin_no}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div>
                            <div className="font-medium">{student.student_name}</div>
                            <div className="text-xs text-gray-500">{student.admission_number}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{student.course}</td>
                        <td className="px-4 py-3 text-gray-600">{student.branch}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{student.current_year}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{student.current_semester}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={student.overall_status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={student.stages.verification} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={student.stages.certificates} type="text" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={student.stages.fee} type="text" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={student.stages.promotion} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={student.stages.scholarship} type="text" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Fixed Footer: Pagination */}
              <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shadow-[0_-2px_4px_rgba(0,0,0,0.02)] z-20">
                <div className="text-xs text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalRecords)} of {pagination.totalRecords} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1 || loading}
                    className="px-3 py-1 rounded border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages || loading}
                    className="px-3 py-1 rounded border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attendance Reports View */}
      {reportType === 'attendance' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300 gap-4">
          {/* Back Button (only in detailed view) */}
          {showDetailedView && (
            <button
              onClick={() => {
                setShowDetailedView(false);
                setSelectedBranchForDrillDown(null);
                setAttendanceFilters(prev => ({
                  ...prev,
                  college: '',
                  batch: '',
                  branch: '',
                  year: '',
                  semester: ''
                }));
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors self-start"
            >
              <ArrowLeft size={18} />
              Back to Summary
            </button>
          )}

          {/* Filters Section */}
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex-shrink-0">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 gap-2">
                {/* Date Range - Only show in range mode */}
                {attendanceDateMode === 'range' && (
                  <div className="col-span-3 flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                      <input
                        type="date"
                        value={attendanceDateRange.fromDate}
                        onChange={(e) => setAttendanceDateRange(prev => ({ ...prev, fromDate: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                      <input
                        type="date"
                        value={attendanceDateRange.toDate}
                        onChange={(e) => setAttendanceDateRange(prev => ({ ...prev, toDate: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* Monthly Selection */}
                {attendanceDateMode === 'monthly' && (
                  <div className="col-span-12 md:col-span-4 lg:col-span-3 xl:col-span-3 flex items-center justify-between gap-3 bg-gray-50 border border-gray-300 rounded-lg px-2 py-1">
                    <button
                      onClick={() => {
                        const newMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
                        const newYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
                        setSelectedMonth(newMonth);
                        setSelectedYear(newYear);
                      }}
                      className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1 text-center">
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Attendance Month</div>
                      <div className="text-sm font-bold text-blue-700">
                        {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const newMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
                        const newYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
                        setSelectedMonth(newMonth);
                        setSelectedYear(newYear);
                      }}
                      className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-600"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}

                {/* College */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">College</label>
                  <select
                    value={attendanceFilters.college || ''}
                    onChange={(e) => {
                      const newCollege = e.target.value;
                      setAttendanceFilters(prev => {
                        const newFilters = { ...prev, college: newCollege };
                        // Clear dependent filters when college changes
                        if (!newCollege) {
                          delete newFilters.college;
                        } else {
                          delete newFilters.level;
                          delete newFilters.batch;
                          delete newFilters.course;
                          delete newFilters.branch;
                        }
                        return newFilters;
                      });
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Colleges</option>
                    {filterOptions.colleges.map((college) => (
                      <option key={college} value={college}>
                        {college}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Level */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Level</label>
                  <select
                    value={attendanceFilters.level || ''}
                    onChange={(e) => {
                      const newLevel = e.target.value;
                      setAttendanceFilters(prev => {
                        const newFilters = { ...prev, level: newLevel };
                        // Clear dependent filters when level changes
                        if (!newLevel) {
                          delete newFilters.level;
                        } else {
                          delete newFilters.batch;
                          delete newFilters.course;
                          delete newFilters.branch;
                        }
                        return newFilters;
                      });
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Levels</option>
                    <option value="diploma">Diploma</option>
                    <option value="ug">UG</option>
                    <option value="pg">PG</option>
                  </select>
                </div>

                {/* Batch */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Batch</label>
                  <select
                    value={attendanceFilters.batch || ''}
                    onChange={(e) => setAttendanceFilters(prev => ({ ...prev, batch: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Batches</option>
                    {(filterOptions.batches || []).map((batch) => (
                      <option key={batch} value={batch}>
                        {batch}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Program */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Program</label>
                  <select
                    value={attendanceFilters.course || ''}
                    onChange={(e) => setAttendanceFilters(prev => ({ ...prev, course: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Programs</option>
                    {(filterOptions.courses || [])
                      .filter(course => {
                        // Filter by level if level is selected
                        if (attendanceFilters.level) {
                          const courseInfo = coursesWithLevels.find(c => c.name === course);
                          return courseInfo?.level === attendanceFilters.level;
                        }
                        return true;
                      })
                      .map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    value={attendanceFilters.branch || ''}
                    onChange={(e) => setAttendanceFilters(prev => ({ ...prev, branch: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Branches</option>
                    {(filterOptions.branches || []).map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                  <select
                    value={attendanceFilters.year || ''}
                    onChange={(e) => setAttendanceFilters(prev => ({ ...prev, year: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Years</option>
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Semester */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Semester</label>
                  <select
                    value={attendanceFilters.semester || ''}
                    onChange={(e) => setAttendanceFilters(prev => ({ ...prev, semester: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Sems</option>
                    {availableSemesters.map((semester) => (
                      <option key={semester} value={String(semester)}>
                        Sem {semester}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Download Buttons - Inline with filters */}
                {showDetailedView && attendanceReportData && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                      <button
                        onClick={downloadAttendancePDF}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
                      >
                        <Download size={16} />
                        PDF
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                      <button
                        onClick={downloadAttendanceExcel}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 text-sm font-medium transition-colors"
                      >
                        <Download size={16} />
                        Excel
                      </button>
                    </div>
                  </>
                )}
                {/* Download Buttons for Abstract View - Inline with filters */}
                {!showDetailedView && attendanceAbstractData.length > 0 && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                      <button
                        onClick={downloadAbstractPDF}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
                      >
                        <Download size={16} />
                        PDF
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                      <button
                        onClick={downloadAbstractExcel}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 text-sm font-medium transition-colors"
                      >
                        <Download size={16} />
                        Excel
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Loading Indicator */}
              {(showDetailedView ? attendanceLoading : attendanceAbstractLoading) && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <span className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Loading report...
                </div>
              )}
            </div>
          </section>

          {/* Abstract View (Default) */}
          {!showDetailedView && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300 gap-4">
              {attendanceAbstractLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <RefreshCw className="animate-spin" size={24} />
                  Loading abstract data...
                </div>
              ) : attendanceAbstractData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <AlertCircle size={32} />
                  <p>No summary data found matching current filters.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left relative">
                      <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-4 py-3 whitespace-nowrap bg-gray-50">College</th>
                          <th className="px-4 py-3 whitespace-nowrap bg-gray-50">Batch</th>
                          <th className="px-4 py-3 bg-gray-50 max-w-[200px] whitespace-normal">Branch</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Year</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Sem</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Total Students</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-gray-50">Working Days</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-green-50">Present %</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-red-50">Absent %</th>
                          <th className="px-4 py-3 whitespace-nowrap text-center bg-blue-50">Attendance %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {attendanceAbstractData.map((row, idx) => (
                          <tr
                            key={idx}
                            onClick={() => handleBranchDrillDown(row)}
                            className="hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-gray-700">{row.college || '-'}</td>
                            <td className="px-4 py-3 text-gray-700">{row.batch || '-'}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{row.branch || '-'}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.year || '-'}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.semester || '-'}</td>
                            <td className="px-4 py-3 text-center font-semibold">{row.totalStudents || 0}</td>
                            <td className="px-4 py-3 text-center font-semibold">{row.workingDays || 0}</td>
                            <td className="px-4 py-3 text-center text-green-600 font-medium">
                              {row.presentPercentage?.toFixed(2) || '0.00'}%
                            </td>
                            <td className="px-4 py-3 text-center text-red-500 font-medium">
                              {row.absentPercentage?.toFixed(2) || '0.00'}%
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${row.attendancePercentage >= 75
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : row.attendancePercentage >= 60
                                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                                  : 'bg-red-100 text-red-800 border border-red-300'
                                }`}>
                                {row.attendancePercentage?.toFixed(2) || '0.00'}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                        {attendanceAbstractData.length > 0 && (
                          <tr>
                            <td className="px-4 py-3" colSpan={5}>Total</td>
                            <td className="px-4 py-3 text-center">
                              {attendanceAbstractData.reduce((sum, row) => sum + (row.totalStudents || 0), 0)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {attendanceAbstractData[0]?.workingDays || 0}
                            </td>
                            <td className="px-4 py-3 text-center text-green-600">
                              {(() => {
                                const totalPresent = attendanceAbstractData.reduce((sum, row) => sum + (row.totalPresentDays || 0), 0);
                                const totalStudents = attendanceAbstractData.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
                                const workingDays = attendanceAbstractData[0]?.workingDays || 0;
                                return workingDays > 0 && totalStudents > 0
                                  ? ((totalPresent / (totalStudents * workingDays)) * 100).toFixed(2)
                                  : '0.00';
                              })()}%
                            </td>
                            <td className="px-4 py-3 text-center text-red-500">
                              {(() => {
                                const totalAbsent = attendanceAbstractData.reduce((sum, row) => sum + (row.totalAbsentDays || 0), 0);
                                const totalStudents = attendanceAbstractData.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
                                const workingDays = attendanceAbstractData[0]?.workingDays || 0;
                                return workingDays > 0 && totalStudents > 0
                                  ? ((totalAbsent / (totalStudents * workingDays)) * 100).toFixed(2)
                                  : '0.00';
                              })()}%
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(() => {
                                const totalPresent = attendanceAbstractData.reduce((sum, row) => sum + (row.totalPresentDays || 0), 0);
                                const totalStudents = attendanceAbstractData.reduce((sum, row) => sum + (row.totalStudents || 0), 0);
                                const workingDays = attendanceAbstractData[0]?.workingDays || 0;
                                const overallPercentage = workingDays > 0 && totalStudents > 0
                                  ? (totalPresent / (totalStudents * workingDays)) * 100
                                  : 0;
                                return (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${overallPercentage >= 75
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : overallPercentage >= 60
                                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                    }`}>
                                    {overallPercentage.toFixed(2)}%
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detailed View (After drill-down) */}
          {showDetailedView && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300 gap-4">
              {/* Search Student - Only in detailed view */}
              <div className="flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search students by name, PIN, or admission number..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {studentSearchQuery && (
                    <button
                      onClick={() => setStudentSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
              {/* Statistics Cards */}
              {attendanceReportData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 uppercase font-semibold">Total Students</div>
                    <div className="text-lg font-bold text-blue-900">{attendanceReportData.statistics.totalStudents}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-600 uppercase font-semibold">Working Days</div>
                    <div className="text-lg font-bold text-gray-900">{attendanceReportData.statistics.totalWorkingDays}</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 uppercase font-semibold">Present Students %</div>
                    <div className="text-lg font-bold text-green-900">
                      {attendanceReportData.statistics.presentStudentsPercentage?.toFixed(2) || '0.00'}%
                    </div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xs text-red-600 uppercase font-semibold">Absent Students %</div>
                    <div className="text-lg font-bold text-red-900">
                      {attendanceReportData.statistics.absentStudentsPercentage?.toFixed(2) || '0.00'}%
                    </div>
                  </div>
                </div>
              )}

              {/* View Type Toggler - Only in detailed view */}
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setViewType('list')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewType === 'list'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    List View
                  </button>
                  <button
                    onClick={() => setViewType('grid')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewType === 'grid'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Grid View
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs text-gray-600">Present (P)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-xs text-gray-600">Absent (A)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span className="text-xs text-gray-600">Holiday (H)</span>
                  </div>
                </div>
              </div>

              {/* Report Table / Grid */}
              {attendanceLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <RefreshCw className="animate-spin" size={24} />
                  Loading attendance report...
                </div>
              ) : attendanceReportData && attendanceReportData.students.length > 0 ? (
                viewType === 'list' ? (
                  <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">PIN No</th>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Student Name</th>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Admission No</th>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Batch</th>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Course</th>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Branch</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Year</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">Sem</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 bg-blue-50">Working Days</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 bg-green-50">Present %</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 bg-red-50">Absent %</th>
                            <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-purple-50">Attendance %</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {attendanceReportData.students
                            .filter(student => {
                              if (!studentSearchQuery) return true;
                              const query = studentSearchQuery.toLowerCase();
                              return (
                                (student.studentName || '').toLowerCase().includes(query) ||
                                (student.pinNumber || '').toLowerCase().includes(query) ||
                                (student.admissionNumber || '').toLowerCase().includes(query)
                              );
                            })
                            .map((student, index) => (
                              <tr
                                key={student.id}
                                onClick={() => {
                                  setSelectedStudent(student);
                                  setShowStudentModal(true);
                                }}
                                className={`hover:bg-blue-50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                              >
                                <td className="px-4 py-3 font-semibold text-gray-900 border-r border-gray-100">{student.pinNumber || '-'}</td>
                                <td className="px-4 py-3 text-gray-800 font-medium border-r border-gray-100">{student.studentName || '-'}</td>
                                <td className="px-4 py-3 text-gray-600 border-r border-gray-100">{student.admissionNumber || '-'}</td>
                                <td className="px-4 py-3 text-gray-600 border-r border-gray-100">{student.batch || '-'}</td>
                                <td className="px-4 py-3 text-gray-600 border-r border-gray-100">{student.course || '-'}</td>
                                <td className="px-4 py-3 text-gray-600 border-r border-gray-100">{student.branch || '-'}</td>
                                <td className="px-4 py-3 text-center text-gray-700 font-medium border-r border-gray-100">{student.year || '-'}</td>
                                <td className="px-4 py-3 text-center text-gray-700 font-medium border-r border-gray-100">{student.semester || '-'}</td>
                                <td className="px-4 py-3 text-center font-bold text-blue-700 bg-blue-50/50 border-r border-gray-100">{student.statistics.workingDays}</td>
                                <td className="px-4 py-3 text-center font-bold bg-green-50/50 border-r border-gray-100">
                                  <span className="text-green-700">
                                    {(() => {
                                      const markedDays = (student.statistics.presentDays || 0) + (student.statistics.absentDays || 0);
                                      return markedDays > 0
                                        ? ((student.statistics.presentDays / markedDays) * 100).toFixed(2)
                                        : '0.00';
                                    })()}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center font-bold bg-red-50/50 border-r border-gray-100">
                                  <span className="text-red-700">
                                    {(() => {
                                      const markedDays = (student.statistics.presentDays || 0) + (student.statistics.absentDays || 0);
                                      return markedDays > 0
                                        ? ((student.statistics.absentDays / markedDays) * 100).toFixed(2)
                                        : '0.00';
                                    })()}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center font-bold bg-purple-50/50">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${student.statistics.attendancePercentage >= 75
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : student.statistics.attendancePercentage >= 60
                                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                    }`}>
                                    {student.statistics.attendancePercentage.toFixed(2)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        {attendanceReportData.students.length > 0 && (
                          <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                            <tr>
                              <td colSpan="8" className="px-4 py-3 text-right text-gray-700">Total:</td>
                              <td className="px-4 py-3 text-center text-blue-700 bg-blue-100 border-r border-gray-200">
                                {attendanceReportData.statistics.totalWorkingDays}
                              </td>
                              <td className="px-4 py-3 text-center text-green-700 bg-green-100 border-r border-gray-200">
                                {attendanceReportData.statistics.presentStudentsPercentage?.toFixed(2) || '0.00'}%
                              </td>
                              <td className="px-4 py-3 text-center text-red-700 bg-red-100 border-r border-gray-200">
                                {attendanceReportData.statistics.absentStudentsPercentage?.toFixed(2) || '0.00'}%
                              </td>
                              <td className="px-4 py-3 text-center text-purple-700 bg-purple-100">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-200 text-purple-900 border border-purple-300">
                                  {attendanceReportData.statistics.overallAttendancePercentage.toFixed(2)}%
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-20">
                          <tr>
                            <th rowSpan={2} className="px-3 py-2 border-b border-r bg-gray-50 sticky left-0 z-30 min-w-[120px] text-xs font-bold text-gray-700 uppercase">PIN No</th>
                            <th rowSpan={2} className="px-3 py-2 border-b border-r bg-gray-50 sticky left-[120px] z-30 min-w-[200px] text-xs font-bold text-gray-700 uppercase">Student Name</th>
                            {(attendanceReportData.dates || []).map((date) => (
                              <th key={`num-${date}`} className="px-1 py-1 border-b border-r text-center min-w-[32px] font-bold text-gray-700 bg-blue-50/30">
                                {new Date(date).getDate()}
                              </th>
                            ))}
                            <th rowSpan={2} className="px-3 py-2 border-b border-r bg-blue-50 sticky right-[120px] z-30 min-w-[60px] text-center text-xs font-bold text-blue-700 uppercase">TOTAL</th>
                            <th rowSpan={2} className="px-3 py-2 border-b border-r bg-gray-50 sticky right-[60px] z-30 min-w-[60px] text-center text-xs font-bold text-gray-700 uppercase">PRES</th>
                            <th rowSpan={2} className="px-3 py-2 border-b bg-gray-50 sticky right-0 z-30 min-w-[60px] text-center text-xs font-bold text-gray-700 uppercase">%</th>
                          </tr>
                          <tr className="bg-gray-50">
                            {(attendanceReportData.dates || []).map((date) => (
                              <th key={`day-${date}`} className="px-1 py-1 border-b border-r text-center min-w-[32px] text-[9px] font-medium uppercase text-gray-500">
                                {new Date(date).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {(attendanceReportData.students || [])
                            .filter(student => {
                              if (!studentSearchQuery) return true;
                              const query = studentSearchQuery.toLowerCase();
                              return (
                                (student.studentName || '').toLowerCase().includes(query) ||
                                (student.pinNumber || '').toLowerCase().includes(query) ||
                                (student.admissionNumber || '').toLowerCase().includes(query)
                              );
                            })
                            .map((student, index) => (
                              <tr
                                key={student.id}
                                onClick={() => {
                                  setSelectedStudent(student);
                                  setShowStudentModal(true);
                                }}
                                className={`hover:bg-blue-50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                              >
                                <td className="px-3 py-2 border-r bg-white sticky left-0 z-10 font-medium">{student.pinNumber || '-'}</td>
                                <td className="px-3 py-2 border-r bg-white sticky left-[120px] z-10 font-medium truncate max-w-[200px]" title={student.studentName}>
                                  {student.studentName}
                                </td>
                                {(attendanceReportData.dates || []).map((date) => {
                                  const status = student.attendance?.[date];
                                  const isHoliday = attendanceReportData.holidayInfo?.dates?.includes(date) ||
                                    new Date(date).getDay() === 0;

                                  let cellContent = '-';
                                  let cellClass = 'text-gray-300';

                                  if (status === 'present') {
                                    cellContent = 'P';
                                    cellClass = 'bg-green-100 text-green-700 font-bold';
                                  } else if (status === 'absent') {
                                    cellContent = 'A';
                                    cellClass = 'bg-red-100 text-red-700 font-bold';
                                  } else if (status === 'holiday' || isHoliday) {
                                    cellContent = 'H';
                                    cellClass = 'bg-gray-100 text-gray-500 font-bold';
                                  }

                                  return (
                                    <td key={date} className={`px-1 py-2 border-r text-center text-[10px] ${cellClass}`}>
                                      {cellContent}
                                    </td>
                                  );
                                })}
                                {(() => {
                                  // Calculate student's personal working days
                                  // Global working days (excluding global holidays)
                                  const globalWorkingDays = attendanceReportData.statistics?.totalWorkingDays || 0;

                                  // Count days marked as 'holiday' for THIS student that are otherwise working days
                                  // (i.e. days in the grid that are NOT global holidays)
                                  let studentHolidays = 0;
                                  (attendanceReportData.dates || []).forEach(date => {
                                    const status = student.attendance?.[date];
                                    // If student is marked as 'holiday' on a day that is NOT a global holiday/Sunday, it's a personal exemption
                                    // We need to check if this date is part of the global working days set
                                    // The global working days are dates in range - global holidays
                                    const isGlobalHoliday = attendanceReportData.holidayInfo?.dates?.includes(date) || new Date(date).getDay() === 0;

                                    if (!isGlobalHoliday && status === 'holiday') {
                                      studentHolidays++;
                                    }
                                  });

                                  const studentWorkingDays = Math.max(0, globalWorkingDays - studentHolidays);

                                  // Calculate percentage based on student's personal working days
                                  const pct = studentWorkingDays > 0
                                    ? (student.statistics?.presentDays || 0) / studentWorkingDays * 100
                                    : 0;

                                  const colorClass = pct >= 75 ? 'bg-green-50 text-green-700' :
                                    pct >= 60 ? 'bg-yellow-50 text-yellow-700' :
                                      'bg-red-50 text-red-700';

                                  return (
                                    <>
                                      <td className="px-3 py-2 sticky right-[120px] z-10 font-bold text-center border-l border-r bg-blue-50 text-blue-700">
                                        {studentWorkingDays}
                                      </td>
                                      <td className={`px-3 py-2 sticky right-[60px] z-10 font-bold text-center border-r ${student.statistics?.presentDays >= studentWorkingDays * 0.75 ? 'bg-green-50 text-green-700' :
                                        student.statistics?.presentDays >= studentWorkingDays * 0.60 ? 'bg-yellow-50 text-yellow-700' :
                                          'bg-red-50 text-red-700'
                                        }`}>
                                        {student.statistics?.presentDays || 0}
                                      </td>
                                      <td className={`px-3 py-2 sticky right-0 z-10 font-bold text-center border-l ${colorClass}`}>
                                        {pct.toFixed(1)}%
                                      </td>
                                    </>
                                  );
                                })()}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ) : attendanceReportData && attendanceReportData.students.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <AlertCircle size={32} />
                  <p>No students found matching the selected criteria.</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <RegistrationDownloadModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        initialFilters={filters}
        filterOptions={filterOptions}
      />

      {/* Student Detail Modal */}
      {showStudentModal && (
        (() => {
          const currentStudent = (attendanceReportData?.students || []).find(s => s.id === selectedStudent?.id) || selectedStudent;
          if (!currentStudent) return null;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-6 overflow-y-auto">
              <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowStudentModal(false);
                        setSelectedStudent(null);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Back"
                    >
                      <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div className="rounded-full bg-blue-100 p-3 text-blue-600">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{currentStudent.studentName || 'Student Details'}</h2>
                      <p className="text-sm text-gray-500">
                        {currentStudent.pinNumber || currentStudent.admissionNumber || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStudentModal(false);
                      setSelectedStudent(null);
                    }}
                    className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Student Information */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">PIN Number</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.pinNumber || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Admission Number</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.admissionNumber || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Batch</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.batch || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Program</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.course || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Branch</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.branch || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Year</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.year || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Semester</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{currentStudent.semester || '-'}</p>
                    </div>
                  </div>

                  {/* Attendance Statistics */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-base font-semibold text-gray-900 mb-4">Attendance Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <div className="text-xs text-blue-600 uppercase font-semibold">Working Days</div>
                        <div className="text-2xl font-bold text-blue-900 mt-1">{currentStudent.statistics?.workingDays || 0}</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <div className="text-xs text-green-600 uppercase font-semibold">Present Days</div>
                        <div className="text-2xl font-bold text-green-900 mt-1">{currentStudent.statistics?.presentDays || 0}</div>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                        <div className="text-xs text-red-600 uppercase font-semibold">Absent Days</div>
                        <div className="text-2xl font-bold text-red-900 mt-1">{currentStudent.statistics?.absentDays || 0}</div>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <div className="text-xs text-purple-600 uppercase font-semibold">Agg. Attendance %</div>
                        <div className="text-2xl font-bold text-purple-900 mt-1">{(currentStudent.statistics?.attendancePercentage || 0).toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}


      {/* Calendar Modal */}
      {
        calendarModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-6 overflow-y-auto">
            <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-3 text-blue-600">
                    <CalendarDays size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Attendance Calendar</h2>
                    <p className="text-sm text-gray-500">
                      View working days and holidays for the selected period.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarModalOpen(false)}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close calendar"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                {calendarLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <RefreshCw className="animate-spin" size={24} />
                      <p>Loading calendar data...</p>
                    </div>
                  </div>
                ) : (
                  <CalendarWidget
                    monthKey={(() => {
                      const date = calendarAttendanceData?.fromDate || attendanceReportData?.fromDate
                        ? new Date(calendarAttendanceData?.fromDate || attendanceReportData.fromDate)
                        : new Date(attendanceDateRange.fromDate);
                      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    })()}
                    onMonthChange={(monthKey) => {
                      const [year, month] = monthKey.split('-');
                      const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1);
                      const lastDay = new Date(parseInt(year), parseInt(month), 0);
                      setAttendanceDateRange({
                        fromDate: firstDay.toISOString().split('T')[0],
                        toDate: lastDay.toISOString().split('T')[0]
                      });
                    }}
                    calendarData={{
                      sundays: [],
                      publicHolidays: ((calendarAttendanceData || attendanceReportData)?.holidayInfo?.details || [])
                        .filter(h => h.type === 'public' || !h.type)
                        .map(h => ({ date: h.date, name: h.name || h.title || 'Holiday' })),
                      customHolidays: ((calendarAttendanceData || attendanceReportData)?.holidayInfo?.details || [])
                        .filter(h => h.type === 'custom')
                        .map(h => ({ date: h.date, title: h.title || h.name || 'Holiday' })),
                      attendanceStatus: (() => {
                        // Use calendarAttendanceData if available, otherwise fall back to attendanceReportData
                        const dataSource = calendarAttendanceData || attendanceReportData;
                        const statusMap = {};
                        if (dataSource?.dates && dataSource?.students) {
                          dataSource.dates.forEach(date => {
                            const holidayDates = new Set(dataSource.holidayInfo?.dates || []);
                            if (!holidayDates.has(date)) {
                              // Check if any student has attendance for this date
                              const hasAttendance = dataSource.students.some(student =>
                                student.attendance && student.attendance[date]
                              );
                              if (hasAttendance) {
                                statusMap[date] = 'present'; // Marked day
                              } else {
                                statusMap[date] = 'absent'; // Unmarked day (shown as red)
                              }
                            }
                          });
                        }
                        return statusMap;
                      })()
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Day End Report Content */}
      {
        reportType === 'dayend' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="px-5 py-4 flex items-start justify-between border-b border-gray-200 shrink-0 bg-white">
              <div>
                <p className="text-sm font-medium text-gray-700">{dayEndReportData?.date || dayEndDate}</p>
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
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {dayEndReportLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="ml-3 text-gray-600">Loading day end report...</span>
                </div>
              ) : dayEndReportData ? (
                <div className="p-5">
                  {/* Sticky Stats Section */}
                  <div
                    ref={dayEndStatsRef}
                    className="sticky top-0 bg-white z-10 pb-4 border-b border-gray-200 -mx-5 px-5"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-4">
                      <div className="bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-600 font-medium">Total Students</div>
                        <div className="text-lg font-bold text-gray-900">{filteredStats.totalStudents}</div>
                      </div>
                      <div className="bg-green-50 p-2 rounded-lg border border-green-200">
                        <div className="text-xs text-green-600 font-medium">Marked Today</div>
                        <div className="text-lg font-bold text-green-700">{filteredStats.markedToday}</div>
                      </div>
                      <div className="bg-red-50 p-2 rounded-lg border border-red-200">
                        <div className="text-xs text-red-600 font-medium">Absent Today</div>
                        <div className="text-lg font-bold text-red-700">{filteredStats.absentToday}</div>
                      </div>
                      <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                        <div className="text-xs text-blue-600 font-medium">Present Today</div>
                        <div className="text-lg font-bold text-blue-700">{filteredStats.presentToday}</div>
                      </div>
                      <div className="bg-green-50 p-2 rounded-lg border border-green-200" title={filteredStats.holidayReason}>
                        <div className="text-xs text-green-600 font-medium truncate">
                          {filteredStats.holidayReason ? `Holiday: ${filteredStats.holidayReason.length > 20 ? filteredStats.holidayReason.substring(0, 20) + '...' : filteredStats.holidayReason}` : 'No Class Work Today'}
                        </div>
                        <div className="text-lg font-bold text-green-700">{filteredStats.holidayToday}</div>
                      </div>
                      <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                        <div className="text-xs text-amber-600 font-medium">Unmarked Today</div>
                        <div className="text-lg font-bold text-amber-700">{filteredStats.unmarkedToday}</div>
                      </div>
                    </div>
                    {/* Table Header with Filters */}
                    <div className="overflow-x-auto -mx-5 px-5">
                      <table className="w-full border-collapse table-fixed">
                        <colgroup>
                          <col style={{ width: '180px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '120px' }} />
                          <col style={{ width: '80px' }} />
                          <col style={{ width: '60px' }} />
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
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs"
                              >
                                <option value="">COLLEGE</option>
                                {dayEndFilterOptions.colleges.map(opt => (
                                  <option key={opt} value={opt} title={opt}>{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-left align-top">
                              <select
                                value={dayEndFilters.level}
                                onChange={(e) => {
                                  setDayEndFilters(prev => ({ ...prev, level: e.target.value, course: '' }));
                                }}
                                className="bg-transparent font-bold outline-none cursor-pointer w-full text-xs"
                              >
                                <option value="">LEVEL</option>
                                <option value="diploma">DIPLOMA</option>
                                <option value="ug">UG</option>
                                <option value="pg">PG</option>
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
                                <option value="">PROGRAM</option>
                                {filteredCourses
                                  .filter(opt => {
                                    // Filter by level if level is selected
                                    if (dayEndFilters.level) {
                                      const courseName = typeof opt === 'string' ? opt : opt.name;
                                      const courseInfo = coursesWithLevels.find(c => c.name === courseName);
                                      return courseInfo?.level === dayEndFilters.level;
                                    }
                                    return true;
                                  })
                                  .map(opt => {
                                    const courseName = typeof opt === 'string' ? opt : opt.name;
                                    return (
                                      <option key={courseName} value={courseName} title={courseName}>
                                        {courseName}
                                      </option>
                                    );
                                  })}
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
                                  <option key={opt} value={opt} title={opt}>{opt}</option>
                                ))}
                              </select>
                            </th>
                            <th className="px-2 py-2 text-center align-top">
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
                            <th className="px-2 py-2 text-center align-top">
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
                              {dayEndGroupedDisplay.map((row, idx) => {
                                const courseInfo = coursesWithLevels.find(c => c.name === row.course);
                                const level = courseInfo?.level ? courseInfo.level.toUpperCase() : '—';
                                return (
                                  <tr key={`${row.college || 'N/A'}-${idx}`} className="bg-white hover:bg-gray-50">
                                    <td className="px-2 py-2 text-gray-800 text-sm truncate" title={row.college || ''}>
                                      {row.college || '—'}
                                    </td>
                                    <td className="px-2 py-2 text-gray-800 text-sm truncate" title={level}>
                                      {level}
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
                                    <td className="px-2 py-2 text-center text-gray-800 text-sm">
                                      {row.year || '—'}
                                    </td>
                                    <td className="px-2 py-2 text-center text-gray-800 text-sm">
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
                                );
                              })}
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
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center p-12 text-gray-500">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Select a date and click "Refresh Report" to generate the day end report</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }
    </div>
  );
};

export default Reports;

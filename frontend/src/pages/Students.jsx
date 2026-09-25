import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Edit,
  Trash2,
  Download,
  Filter,
  Upload,
  X,
  UserCog,
  Plus,
  Users,
  CheckCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Key,
  FileSpreadsheet,
  FileText,
  Eye,
  EyeOff,
  RefreshCw,
  Book,
  Calendar,
  History,
  MessageSquare,
  User,
  AlertTriangle,
  Shield,
  Mail,
  CreditCard,
  Loader2,
  GitBranch,
  GraduationCap,
  Award,
  Printer,
  MapPin,
  Phone,
  Copy,
  Check,
  Camera,
  Quote,
  Activity,
  Info,
  MoreHorizontal,
  Sparkles,
  Bus
} from 'lucide-react';
import StudentAvatar from '../components/StudentAvatar';
import DigitalStudentCard from '../components/DigitalStudentCard';
import { Link, useLocation } from 'react-router-dom';
import api, { getStaticFileUrlDirect } from '../config/api';
import { printDigitalIdCard } from '../utils/printDigitalIdCard';
import StudentAttendanceTab from '../components/Students/StudentAttendanceTab';
import ParentEngagementPanel from '../components/Students/ParentEngagementPanel';
import StudentSmsTab from '../components/Students/StudentSmsTab';
import toast from 'react-hot-toast';
import MobileVerificationModal from '../components/Students/MobileVerificationModal';
import StudentPhotoUploadModal from '../components/Students/StudentPhotoUploadModal';
import StudentRemarksModal from '../components/Students/StudentRemarksModal';
import StudentRemarksContent from '../components/Students/StudentRemarksContent';
import StudentHistoryLogs from '../components/Students/StudentHistoryLogs';
import StudentScholarshipHistoryTab from '../components/Students/StudentScholarshipHistoryTab';
import StudentTransportHostelTab from '../components/Students/StudentTransportHostelTab';
import StudentMeritStatusTab from '../components/Students/StudentMeritStatusTab';
import StudentExportModal from '../components/Students/StudentExportModal';
import BulkUploadModal from '../components/BulkUploadModal';
import ManualRollNumberModal from '../components/ManualRollNumberModal';
import RejoinModal from '../components/RejoinModal';
import LoadingAnimation from '../components/LoadingAnimation';
import { SkeletonTable, SkeletonStudentsTable } from '../components/SkeletonLoader';
import { formatDate, formatDateToLocalISO } from '../utils/dateUtils';
import {
  buildPartialStudentUpdatePayload,
  cloneStudentFormSnapshot,
  stripReadonlyStudentPayloadFields
} from '../utils/studentUpdatePayload';
import { QRCodeSVG } from 'qrcode.react';
import { useStudents, useUpdateStudent, useDeleteStudent, useBulkDeleteStudents, useInvalidateStudents, usePrefetchAdjacentStudents } from '../hooks/useStudents';
import useStudentQuotas from '../hooks/useStudentQuotas';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission as hasModulePermission, USER_ROLES, hasModuleAccess, FRONTEND_MODULES } from '../constants/rbac';
import { formatMeritStatusDisplay, MERIT_STATUS_FILTER_OPTIONS } from '../config/studentProgramYears';
import { certificateConfig as sharedCertificateConfig, getCourseType, getCertificatesForCourse, getCertificateValue, isCertificatePresent, getCertificateBadgeClass } from '../config/certificateConfig';
import {
  SCHOLARSHIP_ELIGIBLE_OPTIONS,
  SCHOLARSHIP_STATUS_FILTER_OPTIONS,
  getCurrentScholarshipStatus,
  formatScholarshipStatusDisplay,
  isScholarshipRegistrationComplete,
  getRegistrationScholarshipStatus,
  resolveRegistrationScholarshipDisplay
} from '../config/scholarshipConfig';
import {
  isVerificationCompleteForCycle,
  isStudentMobileVerifiedForCycle,
  isParentMobileVerifiedForCycle,
  isPromotionCompleteForCycle,
  isCertificatesStatusComplete,
  REGISTRATION_EMPTY_DISPLAY
} from '../config/registrationCycle';
import {
  computeRegistrationStageDisplays,
  resolveRegistrationOverallStatus
} from '../config/registrationStages.jsx';
import { resolveRegistrationBranchYear } from '../config/registrationBranchYear';
import { buildCasteSelectOptions } from '../config/casteConfig';
import useCasteCategories from '../hooks/useCasteCategories';

const formatRegistrationStatusLabel = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'temporary') return 'Temporary';
  return 'Pending';
};

const getRegistrationStatusBadgeClass = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed') return 'text-green-700 bg-green-50';
  if (normalized === 'temporary') return 'text-amber-700 bg-amber-50 font-medium';
  return 'text-yellow-700 bg-yellow-50';
};

// Student status options
const STUDENT_STATUS_OPTIONS = [
  'Regular',
  'Admission Cancelled',
  'Detained',
  'Discontinued',
  'Long Absent',
  'Rejoined',
  'Course Completed'
];

// Certificate status options
const CERTIFICATES_STATUS_OPTIONS = [
  'Verified',
  'Unverified',
  'Submitted',
  'Pending',
  'Partial',
  'Originals Returned',
  'Not Required'
];

// Fee status options
const FEE_STATUS_OPTIONS = [
  'no due',
  'due',
  'permitted'
];

// Scholarship status options (synced with student_scholarship table)
const SCHOLAR_STATUS_OPTIONS = SCHOLARSHIP_STATUS_FILTER_OPTIONS.map((option) => option.value);


// Registration status options
const REGISTRATION_STATUS_OPTIONS = [
  'Pending',
  'Temporary',
  'Completed'
];

// Utility function to mask mobile number (show only last 3 digits)
const maskMobileNumber = (mobile) => {
  if (!mobile || mobile === '-') return mobile;
  const mobileStr = String(mobile).trim();
  if (mobileStr.length <= 3) return mobileStr;
  const lastThree = mobileStr.slice(-3);
  const maskedPart = 'x'.repeat(mobileStr.length - 3);
  return maskedPart + lastThree;
};

// Helper component for sidebar details
const SidebarDetailItem = ({ label, value, icon, editable, disabled, type = 'text', options = [], onChange, onFocus }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
      {icon}
      <span>{label}</span>
    </div>
    {editable ? (
      type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          disabled={disabled}
          className="w-full bg-white border-2 border-indigo-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all font-sans disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          <option value="">Select {label}</option>
          {options.map((opt) => (
            <option key={opt.id || opt} value={opt.name || opt}>{opt.name || opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-white border-2 border-indigo-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all font-sans placeholder-gray-300 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      )
    ) : (
      <div className="text-sm font-bold text-gray-900">{value || '-'}</div>
    )}
  </div>
);

const getStudentSection = (editData = {}, student = null) => {
  if (editData && Object.prototype.hasOwnProperty.call(editData, 'section')) {
    const value = editData.section;
    return value === null || value === undefined ? '' : String(value).trim();
  }
  if (editData?.Section !== undefined && editData?.Section !== null) {
    return String(editData.Section).trim();
  }
  if (student?.section !== undefined && student?.section !== null) {
    return String(student.section).trim();
  }
  return '';
};

const getBranchSectionConfig = (coursesWithLevels, courseName, branchName) => {
  if (!branchName) {
    return { enabled: false, items: [] };
  }

  const matchingBranches = [];
  if (courseName) {
    const courseObj = coursesWithLevels.find((course) => course.name === courseName);
    const branchObj = (courseObj?.branches || []).find((branch) => branch.name === branchName);
    if (branchObj) matchingBranches.push(branchObj);
  } else {
    coursesWithLevels.forEach((course) => {
      const branchObj = (course.branches || []).find((branch) => branch.name === branchName);
      if (branchObj) matchingBranches.push(branchObj);
    });
  }

  const branchWithSections = matchingBranches.find((branch) => branch?.metadata?.sections?.enabled);
  if (!branchWithSections) {
    return { enabled: false, items: [] };
  }

  const items = (branchWithSections.metadata?.sections?.items || [])
    .map((item) => item?.name)
    .filter(Boolean);

  return { enabled: items.length > 0, items };
};

// Helper components for Details tab
const SummaryPill = ({ label, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    violet: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className={`flex flex-col gap-2 p-4 rounded-2xl ${colorClasses[color] || 'bg-gray-50 text-gray-600'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span>
      </div>
      <div className="text-sm font-bold truncate">
        {value || '-'}
      </div>
    </div>
  );
};

const SectionHeader = ({ title, sub }) => (
  <div className="flex flex-col gap-1 border-b border-gray-100 pb-4 mb-6">
    <h4 className="text-lg font-black text-gray-900 tracking-tight">{title}</h4>
    {sub && <p className="text-xs font-bold text-gray-500">{sub}</p>}
  </div>
);

const DetailTile = ({ label, value, icon }) => (
  <div className="flex gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all">
    <div className="w-10 h-10 shrink-0 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
      {icon}
    </div>
    <div className="flex flex-col justify-center min-w-0">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-900 truncate">{value || '-'}</p>
    </div>
  </div>
);

const Students = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const { quotas: studentQuotas } = useStudentQuotas();
  const {
    categories: casteCategories,
    casteOptions: dynamicCasteOptions,
    getCategoryForCaste,
    getCastesForCategory,
    resolveStudentCaste,
    getByCasteId,
    getByCategoryId
  } = useCasteCategories();
  const [dialogCasteCategoryId, setDialogCasteCategoryId] = useState('');
  const [bulkPasswordState, setBulkPasswordState] = useState({
    isOpen: false,
    processing: false,
    results: null,
    summary: null
  });
  const userPermissions = user?.permissions || {};

  // RBAC-derived capabilities for Student Management
  const canViewStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view');
  const canAddStudent = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'add_student');
  const canBulkUploadStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'bulk_upload');
  // Check if user has edit permissions - check for both edit_details and edit_student permissions
  const canEditDetails = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'edit_details');
  const canEditStudentsReal = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'edit_student');
  // User can edit if they have either edit_details or edit_student permission
  const canEditStudents = canEditDetails || canEditStudentsReal;
  const canEditStudentDetails = canEditStudents || user?.role === 'admin' || user?.role === 'super_admin';
  const canDeleteStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'delete_student');
  const canUpdatePin = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'update_pin');
  const canExportStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'export');
  const isCashier = user?.role === USER_ROLES.CASHIER;
  // SMS tab should be visible for super admin, admin, or users with view_sms permission
  const canViewSms = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view_sms');
  const canViewMeritStatus = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view_merit_status') || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'edit_merit_status');
  const canEditMeritStatus = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'edit_merit_status');
  const smPerms = userPermissions?.[BACKEND_MODULES.STUDENT_MANAGEMENT];
  // Shows by default (same as before) unless explicitly disabled (false) on the role or user
  const canViewScholarship = user?.role === 'super_admin' || user?.role === 'admin' || (
    canViewStudents && (smPerms?.view_scholarship !== false || smPerms?.edit_scholarship === true)
  );
  const canEditScholarship = user?.role === 'super_admin' || user?.role === 'admin' || (
    canEditStudents && smPerms?.edit_scholarship !== false
  );
  // Table column: show for anyone who can open the Students list (seeded values must be visible)
  const showMeritColumn = canViewStudents && !isCashier;
  // Check if user has access to Attendance module
  const canViewAttendance = hasModuleAccess(userPermissions, FRONTEND_MODULES.ATTENDANCE);
  const canAddRemarks = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'add_remarks');
  const canManageRemarks = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'manage_remarks');

  // Helper to check field-level permissions
  const canViewField = useCallback((fieldKey) => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    const fieldPerms = userPermissions?.student_management?.field_permissions;
    if (!fieldPerms) return true;
    return fieldPerms[fieldKey]?.view === true;
  }, [userPermissions, user?.role]);

  // Helper to check field-level edit permissions
  const canEditField = useCallback((fieldKey) => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    const fieldPerms = userPermissions?.student_management?.field_permissions;
    if (!fieldPerms) return true;
    return fieldPerms[fieldKey]?.edit === true;
  }, [userPermissions, user?.role]);

  const [frozenBatches, setFrozenBatches] = useState({});
  const [frozenBatchesLoading, setFrozenBatchesLoading] = useState(true);

  // Helper to check if a specific field is frozen for a student's batch
  const isFieldFrozen = useCallback((student, fieldKey) => {
    if (!student) return false;
    const batchKey = student.batch || student.student_data?.batch;
    if (!batchKey) return false;
    const batchConfig = frozenBatches[batchKey] || [];
    return batchConfig.includes("ALL") || batchConfig.includes(fieldKey);
  }, [frozenBatches]);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [scholarshipData, setScholarshipData] = useState(null);
  const [scholarshipLoading, setScholarshipLoading] = useState(false);
  const [regOptionalStages, setRegOptionalStages] = useState([]); // optional stages for selected student's branch+year
  const [registrationStageConfig, setRegistrationStageConfig] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [activeStudentTab, setActiveStudentTab] = useState('details');
  const [historySubTab, setHistorySubTab] = useState('remarks');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [editBaseline, setEditBaseline] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ student_status: 'Regular', level: '' }); // Default to show only Regular students
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true); // Track overall filter loading state
  const [quickFilterOptions, setQuickFilterOptions] = useState({
    batches: [],
    colleges: [],
    courses: [],
    branches: [],
    years: [],
    semesters: [],
    sections: []
  });
  const [academicYearOptions, setAcademicYearOptions] = useState([]);
  const [coursesWithLevels, setCoursesWithLevels] = useState([]); // Store courses with level info
  const [availableFields, setAvailableFields] = useState([]);
  const [dropdownFilterOptions, setDropdownFilterOptions] = useState({
    stud_type: [],
    student_status: [],
    scholar_status: [],
    category_id: [],
    gender: [],
    certificates_status: [],
    remarks: [],
    district: [],
    mandal_name: []
  });
  const [showManualRollNumber, setShowManualRollNumber] = useState(false);
  const [showBulkStudentUpload, setShowBulkStudentUpload] = useState(false);
  const [editingRollNumber, setEditingRollNumber] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [photoUploadTab, setPhotoUploadTab] = useState('file');
  const [revealedMobiles, setRevealedMobiles] = useState({});
  const toggleRevealMobile = useCallback((fieldKey) => {
    setRevealedMobiles((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  }, []);
  const [tempRollNumber, setTempRollNumber] = useState('');
  const [savingPinNumber, setSavingPinNumber] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewingPassword, setViewingPassword] = useState(false);
  const [studentPassword, setStudentPassword] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [completionPercentages, setCompletionPercentages] = useState({});
  const [profileCompletion, setProfileCompletion] = useState({ percentage: 0, filledCount: 0, totalCount: 0 });
  const [showIdCardPreview, setShowIdCardPreview] = useState(false);
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [certificateConfig, setCertificateConfig] = useState(sharedCertificateConfig);
  const [selectedAdmissionNumbers, setSelectedAdmissionNumbers] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  const [editRegistrationStatus, setEditRegistrationStatus] = useState('');
  const [editFeeStatus, setEditFeeStatus] = useState('');
  const [showPermitModal, setShowPermitModal] = useState(false);
  const [permitEndingDate, setPermitEndingDate] = useState('');
  const [permitRemarks, setPermitRemarks] = useState('');
  const [pendingFeeStatusChange, setPendingFeeStatusChange] = useState(null);
  const [pendingPermitAdmissionNumber, setPendingPermitAdmissionNumber] = useState(null);
  const [showRejoinModal, setShowRejoinModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rejoinStudent, setRejoinStudent] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { studentId, field }
  const [cellEditValue, setCellEditValue] = useState('');
  const [inlineEditChanges, setInlineEditChanges] = useState(new Map()); // Track changes before saving
  const skipFilterFetchRef = useRef(false);
  const filtersRef = useRef(filters);
  const searchTermRef = useRef(searchTerm);
  const pageSizeRef = useRef(pageSize);
  const pageSizeOptions = [10, 25, 50, 100, 200, 300, 400, 500];

  // React Query hooks
  // --- Action Handlers ---
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showRemarksHistoryModal, setShowRemarksHistoryModal] = useState(false);

  const handleVerificationComplete = async () => {
    if (!selectedStudent?.admission_number) return;
    try {
      const response = await api.get(`/students/${selectedStudent.admission_number}`);
      if (response.data?.success) {
        setSelectedStudent(response.data.data);
      }
    } catch (error) {
      console.error('Failed to refresh student after verification:', error);
    }
  };

  const updateStudentMutation = useUpdateStudent();
  const deleteStudentMutation = useDeleteStudent();
  const bulkDeleteMutation = useBulkDeleteStudents();
  const invalidateStudents = useInvalidateStudents();

  // Memoize filters for React Query - use stable comparison to prevent unnecessary refetches
  const prevFiltersStringRef = useRef('');
  const prevFiltersObjectRef = useRef({});

  const memoizedFilters = useMemo(() => {
    const filterParams = {};

    // Standard filters
    if (filters.dateFrom) filterParams.dateFrom = filters.dateFrom;
    if (filters.dateTo) filterParams.dateTo = filters.dateTo;
    if (filters.pinNumberStatus) filterParams.pinNumberStatus = filters.pinNumberStatus;
    if (filters.year) filterParams.year = filters.year;
    if (filters.semester) filterParams.semester = filters.semester;
    if (filters.batch) filterParams.batch = filters.batch;
    if (filters.college) filterParams.college = filters.college;
    if (filters.course) filterParams.course = filters.course;
    if (filters.level) filterParams.level = filters.level;
    if (filters.branch) filterParams.branch = filters.branch;
    if (filters.section) filterParams.section = filters.section;
    if (filters.category_id) filterParams.category_id = filters.category_id;

    // All student database fields
    const studentFields = [
      'admission_number', 'pin_no', 'stud_type', 'student_name', 'student_status',
      'scholar_status', 'merit_status', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
      'caste', 'gender', 'father_name', 'dob', 'adhar_no', 'admission_date',
      'student_address', 'city_village', 'mandal_name', 'district',
      'previous_college', 'certificates_status', 'remarks', 'created_at'
    ];

    studentFields.forEach(field => {
      if (filters[field]) {
        filterParams[field] = filters[field];
      }
    });

    // Dynamic field filters (for fields in student_data JSON)
    Object.entries(filters).forEach(([key, value]) => {
      if (key.startsWith('field_') && value) {
        filterParams[key] = value;
      }
    });

    // Compare with previous filters to return same reference if unchanged
    const filtersString = JSON.stringify(filterParams);
    if (prevFiltersStringRef.current === filtersString) {
      return prevFiltersObjectRef.current;
    }

    prevFiltersStringRef.current = filtersString;
    prevFiltersObjectRef.current = filterParams;
    return filterParams;
  }, [filters]);

  // Use React Query to fetch students
  // Only enable students query after filters are loaded
  const {
    data: studentsData,
    isLoading,
    isFetching,
    isError,
    error
  } = useStudents({
    page: currentPage,
    pageSize: pageSize,
    filters: memoizedFilters,
    search: debouncedSearch,
    enabled: !filtersLoading // Disable until filters are loaded
  });

  const students = studentsData?.students || [];
  const totalStudents = studentsData?.pagination?.total || 0;

  // Helper function to extract numeric part from PIN (last 4-5 digits)
  const extractPinNumeric = (pinString) => {
    if (!pinString) return 0;
    const pin = String(pinString);
    const match = pin.match(/(\d{4,5})$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const allDigits = pin.match(/\d+/g);
    if (allDigits && allDigits.length > 0) {
      return parseInt(allDigits[allDigits.length - 1], 10);
    }
    const parsed = parseFloat(pin);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Helper function to extract series prefix from PIN
  const extractPinSeries = (pinString) => {
    if (!pinString) return '';
    const pin = String(pinString);
    const numericMatch = pin.match(/(\d{4,5})$/);
    if (numericMatch) {
      return pin.substring(0, pin.length - numericMatch[1].length);
    }
    const allDigits = pin.match(/\d+/g);
    if (allDigits && allDigits.length > 0) {
      const lastDigits = allDigits[allDigits.length - 1];
      const lastIndex = pin.lastIndexOf(lastDigits);
      return pin.substring(0, lastIndex);
    }
    return pin;
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

  // Sort students based on sortConfig
  const sortedStudents = useMemo(() => {
    if (!sortConfig.field) return students;

    return [...students].sort((a, b) => {
      let aValue, bValue;
      let isNumeric = false;

      switch (sortConfig.field) {
        case 'pinNumber':
          const aPin = String(a.pin_no || '');
          const bPin = String(b.pin_no || '');
          const aSeries = extractPinSeries(aPin);
          const bSeries = extractPinSeries(bPin);

          if (aSeries !== bSeries) {
            const seriesComparison = aSeries.localeCompare(bSeries);
            return sortConfig.direction === 'asc' ? seriesComparison : -seriesComparison;
          }

          aValue = extractPinNumeric(aPin);
          bValue = extractPinNumeric(bPin);
          isNumeric = true;
          break;
        default:
          return 0;
      }

      if (isNumeric) {
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [students, sortConfig]);

  // Compute year and semester dropdown options for the student edit panel
  // Based on the selected student's course+branch structure + additional year from branch metadata
  const studentEditYearOptions = useMemo(() => {
    const courseName = editData?.course || selectedStudent?.course;
    const branchName = editData?.branch || selectedStudent?.branch;

    if (!courseName || !coursesWithLevels?.length) {
      return ['1', '2', '3', '4'];
    }

    const courseObj = coursesWithLevels.find(c => c.name === courseName);
    if (!courseObj) return ['1', '2', '3', '4'];

    // Determine total years from branch override or course default
    const branchObj = (courseObj.branches || []).find(b => b.name === branchName);
    const structure = branchObj?.structure || courseObj.structure;
    const totalYears = Number(structure?.totalYears)
      || Number(branchObj?.totalYears || courseObj.totalYears)
      || (Array.isArray(structure?.years) ? structure.years.length : 0)
      || 4;

    const years = Array.from({ length: totalYears }, (_, i) => String(i + 1));

    // If branch has an additional year configured, always show it
    const branchMeta = branchObj?.metadata || {};
    if (branchMeta.hasAdditionalYear && branchMeta.additionalYear) {
      const addYearStr = String(branchMeta.additionalYear);
      if (!years.includes(addYearStr)) {
        years.push(addYearStr);
      }
    }

    return years;
  }, [editData?.course, editData?.branch, selectedStudent?.course, selectedStudent?.branch, coursesWithLevels]);

  const studentEditSemesterOptions = useMemo(() => {
    const courseName = editData?.course || selectedStudent?.course;
    const branchName = editData?.branch || selectedStudent?.branch;
    const currentYear = Number(editData?.current_year || selectedStudent?.current_year) || 1;

    if (!courseName || !coursesWithLevels?.length) {
      return ['1', '2'];
    }

    const courseObj = coursesWithLevels.find(c => c.name === courseName);
    if (!courseObj) return ['1', '2'];

    const branchObj = (courseObj.branches || []).find(b => b.name === branchName);
    const branchMeta = branchObj?.metadata || {};

    // Check if current year is the additional year — use its semester count
    if (branchMeta.hasAdditionalYear && branchMeta.additionalYear) {
      if (currentYear === Number(branchMeta.additionalYear)) {
        const addSems = Number(branchMeta.additionalYearSemesters) || 2;
        return Array.from({ length: addSems }, (_, i) => String(i + 1));
      }
    }

    // Use per-year semester config if available
    const structure = branchObj?.structure || courseObj.structure;
    if (structure?.years && Array.isArray(structure.years)) {
      const yearConfig = structure.years.find(y => y.yearNumber === currentYear);
      if (yearConfig?.semesters?.length) {
        return yearConfig.semesters.map(s => String(s.semesterNumber));
      }
    }

    const semPerYear = Number(branchObj?.semestersPerYear || courseObj.semestersPerYear) || 2;
    return Array.from({ length: semPerYear }, (_, i) => String(i + 1));
  }, [editData?.course, editData?.branch, editData?.current_year, selectedStudent?.course, selectedStudent?.branch, selectedStudent?.current_year, coursesWithLevels]);

  const batchOptions = useMemo(() => {
    return [...new Set([...(academicYearOptions || []), ...(quickFilterOptions.batches || [])])]
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [academicYearOptions, quickFilterOptions.batches]);

  const studentSectionOptions = useMemo(() => {
    const courseName = editData?.course || selectedStudent?.course;
    const branchName = editData?.branch || selectedStudent?.branch;
    return getBranchSectionConfig(coursesWithLevels, courseName, branchName).items;
  }, [editData?.course, editData?.branch, selectedStudent?.course, selectedStudent?.branch, coursesWithLevels]);

  const studentBranchHasSections = useMemo(() => {
    const courseName = editData?.course || selectedStudent?.course;
    const branchName = editData?.branch || selectedStudent?.branch;
    return getBranchSectionConfig(coursesWithLevels, courseName, branchName).enabled;
  }, [editData?.course, editData?.branch, selectedStudent?.course, selectedStudent?.branch, coursesWithLevels]);

  const filterBranchHasSections = useMemo(() => {
    if (!filters.course || !filters.branch) return false;
    return getBranchSectionConfig(coursesWithLevels, filters.course, filters.branch).enabled;
  }, [filters.course, filters.branch, coursesWithLevels]);

  const showSectionColumn = useMemo(() => {
    if (filterBranchHasSections) return true;
    return students.some((student) =>
      getBranchSectionConfig(coursesWithLevels, student.course, student.branch).enabled
    );
  }, [filterBranchHasSections, students, coursesWithLevels]);

  useEffect(() => {
    if (!filters.section) return;
    if (!filters.course || !filters.branch) return;
    if (!coursesWithLevels.length) return;
    if (!filterBranchHasSections) {
      setFilters((prev) => {
        if (!prev.section) return prev;
        const next = { ...prev };
        delete next.section;
        filtersRef.current = next;
        return next;
      });
    }
  }, [filterBranchHasSections, filters.section, filters.course, filters.branch, coursesWithLevels.length]);

  useEffect(() => {
    if (!filters.section) return;
    const availableSections = quickFilterOptions.sections || [];
    if (availableSections.length > 0 && !availableSections.includes(filters.section)) {
      setFilters((prev) => {
        if (!prev.section) return prev;
        const next = { ...prev };
        delete next.section;
        filtersRef.current = next;
        return next;
      });
    }
  }, [quickFilterOptions.sections, filters.section]);

  const totalPages = studentsData?.pagination?.totalPages ||
    (totalStudents > 0 ? Math.max(1, Math.ceil(totalStudents / (pageSize || 1))) : 1);
  // Only show loading for students table, not the entire page
  // Page structure (header, filters) should always be visible
  // Show loading when filters are still loading OR when students query is loading with no data yet
  const tableLoading = filtersLoading || (isLoading && students.length === 0);
  // Table is fetching when students query is fetching (but filters are already loaded)
  const tableFetching = (isFetching || isLoading) && !filtersLoading;

  const safePageSize = pageSize || 1;
  const showingFromRaw = totalStudents === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const showingFrom = totalStudents === 0 ? 0 : Math.min(showingFromRaw, totalStudents);
  const showingTo = totalStudents === 0 ? 0 : Math.min(totalStudents, showingFrom + Math.max(students.length - 1, 0));
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  const prefetchAdjacentStudents = usePrefetchAdjacentStudents();

  // Automatically prefetch next and previous pages for instant page clicks
  useEffect(() => {
    if (!filtersLoading && totalPages > 1) {
      prefetchAdjacentStudents({
        page: currentPage,
        pageSize,
        totalPages,
        filters: memoizedFilters,
        search: debouncedSearch
      });
    }
  }, [currentPage, totalPages, pageSize, memoizedFilters, debouncedSearch, filtersLoading, prefetchAdjacentStudents]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    searchTermRef.current = searchTerm;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500); // 500ms debounce delay for immediate fetch
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset ID card preview when switching between students
  useEffect(() => {
    setShowIdCardPreview(false);
    setScholarshipData(null);
    setRegOptionalStages([]);
    setRegistrationStageConfig({});
  }, [selectedStudent?.admission_number]);

  const fetchMeritForStudent = useCallback(async (admissionNumber) => {
    if (!admissionNumber || !canViewMeritStatus) return null;

    try {
      const response = await api.get(`/student-merit-status/${encodeURIComponent(admissionNumber)}`);
      if (response.data.success) {
        const data = response.data.data;
        const currentYear = Math.max(1, Number(data?.currentYear) || 1);
        const currentMerit = data?.years?.find(
          (entry) => Number(entry.student_year) === currentYear
        )?.merit_status || '';
        setSelectedStudent((prev) => (prev ? { ...prev, merit_status: currentMerit } : prev));
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch merit status:', error);
    }
    return null;
  }, [canViewMeritStatus]);

  const fetchScholarshipForStudent = useCallback(async (admissionNumber) => {
    if (!admissionNumber || !canViewScholarship) {
      setScholarshipData(null);
      return null;
    }

    setScholarshipLoading(true);
    try {
      const response = await api.get(`/student-scholarship/${encodeURIComponent(admissionNumber)}`);
      if (response.data.success) {
        const data = response.data.data;
        setScholarshipData(data);
        // Derive the most accurate status from the full scholarship payload
        const status = getCurrentScholarshipStatus(data, data?.student);
        setSelectedStudent((prev) => (prev ? { ...prev, scholar_status: status } : prev));
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch scholarship data:', error);
      setScholarshipData(null);
    } finally {
      setScholarshipLoading(false);
    }
    return null;
  }, [canViewScholarship]);

  // Fetch certificate settings and forms on mount
  useEffect(() => {
    fetchForms();
  }, []);

  // Fetch full student details (including photo) when opening modal
  useEffect(() => {
    const fetchFullDetails = async () => {
      if (showModal && selectedStudent?.admission_number) {
        try {
          const response = await api.get(`/students/${selectedStudent.admission_number}`);
          if (response.data.success) {
            const freshData = response.data.data;
            setSelectedStudent(prev => ({
              ...prev,
              ...freshData,
              id: prev.id
            }));
            setEditData(prev => ({
              ...prev,
              ...freshData
            }));

            // Fetch optional stages using fresh branch + current_year from DB
            const branchCode = freshData.branch || selectedStudent.branch;
            const currentYear = freshData.current_year ?? selectedStudent.current_year;
            if (branchCode && currentYear != null) {
              try {
                const cfgRes = await api.get(
                  `/settings/registration-stage-config/branch/${encodeURIComponent(branchCode)}`
                );
                if (cfgRes.data?.success) {
                  const yearData = cfgRes.data.data || {};
                  const configYear = resolveRegistrationBranchYear(branchCode, currentYear);
                  setRegOptionalStages(yearData[String(configYear)]?.optionalStages || []);
                  setRegistrationStageConfig(
                    Object.fromEntries(
                      Object.entries(yearData).map(([year, config]) => [
                        `${String(branchCode).trim()}::${year}`,
                        config
                      ])
                    )
                  );
                } else {
                  setRegOptionalStages([]);
                  setRegistrationStageConfig({});
                }
              } catch {
                setRegOptionalStages([]);
                setRegistrationStageConfig({});
              }
            } else {
              setRegOptionalStages([]);
              setRegistrationStageConfig({});
            }
          }
        } catch (error) {
          console.error("Failed to fetch full student details:", error);
        }
      }
    };

    fetchFullDetails();
    fetchScholarshipForStudent(selectedStudent?.admission_number);
    fetchMeritForStudent(selectedStudent?.admission_number);
  }, [showModal, selectedStudent?.admission_number, fetchScholarshipForStudent, fetchMeritForStudent]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  // Get completion percentage for a student from backend
  const getStudentCompletionPercentage = async (admissionNumber) => {
    if (!admissionNumber) {
      return 0; // Return 0 if admission number is missing
    }
    try {
      const response = await api.get(`/submissions/student/${admissionNumber}/completion-status`);
      return response.data.data.completionPercentage;
    } catch (error) {
      // Silently return 0 if completion status can't be fetched
      return 0;
    }
  };

  const syncStageFields = (data, year, semester) => {
    // If year or semester is provided as empty string, respect it (though typically required)
    const y = (year !== undefined && year !== null) ? year : data.current_year;
    const s = (semester !== undefined && semester !== null) ? semester : data.current_semester;

    return {
      ...data,
      current_year: (y !== '' && y !== null && y !== undefined) ? Number(y) : y,
      current_semester: (s !== '' && s !== null && s !== undefined) ? Number(s) : s,
      'Current Academic Year': (y !== '' && y !== null && y !== undefined) ? Number(y) : y,
      'Current Semester': (s !== '' && s !== null && s !== undefined) ? Number(s) : s
    };
  };

  /**
   * Calculate student profile completion percentage
   * @param {Object} student - Student object with all fields
   * @param {Object} studentData - Parsed student_data object
   * @returns {Object} { percentage, filledCount, totalCount }
   */
  const calculateProfileCompletion = useCallback((student, studentData = {}) => {
    // Helper to parse student_data if it's a string
    let parsedData = studentData;
    if (typeof studentData === 'string') {
      try {
        parsedData = JSON.parse(studentData || '{}');
      } catch (e) {
        parsedData = {};
      }
    }

    // Also check if student has student_data that needs parsing
    if (student.student_data && typeof student.student_data === 'string') {
      try {
        const parsed = JSON.parse(student.student_data || '{}');
        parsedData = { ...parsedData, ...parsed };
      } catch (e) {
        // Ignore parse errors
      }
    } else if (student.student_data && typeof student.student_data === 'object') {
      parsedData = { ...parsedData, ...student.student_data };
    }

    // Helper to check if a value is valid (not empty, null, undefined, "N/A", "-")
    const isValidValue = (value) => {
      if (value === null || value === undefined) return false;
      const str = String(value).trim().toLowerCase();
      return str !== '' && str !== 'n/a' && str !== '-' && str !== '{}' && str !== 'null' && str !== 'undefined';
    };

    // Helper to get field value from student object or studentData
    const getFieldValue = (fieldKey, altKeys = []) => {
      // Check individual database columns first
      if (student[fieldKey] !== undefined && student[fieldKey] !== null && student[fieldKey] !== '') {
        return student[fieldKey];
      }
      // Check parsedData JSON
      if (parsedData[fieldKey] !== undefined && parsedData[fieldKey] !== null && parsedData[fieldKey] !== '') {
        return parsedData[fieldKey];
      }
      // Check alternative keys
      for (const altKey of altKeys) {
        if (student[altKey] !== undefined && student[altKey] !== null && student[altKey] !== '') {
          return student[altKey];
        }
        if (parsedData[altKey] !== undefined && parsedData[altKey] !== null && parsedData[altKey] !== '') {
          return parsedData[altKey];
        }
      }
      return null;
    };

    // Define all fields that count towards completion
    const profileFields = [
      // Identity Fields
      { key: 'student_name', label: 'Student Name', altKeys: ['Student Name', 'studentname'] },
      { key: 'pin_no', label: 'Roll Number', altKeys: ['Pin Number', 'PIN Number', 'roll_no', 'roll_number'] },
      { key: 'dob', label: 'Date of Birth', altKeys: ['DOB (Date of Birth - DD-MM-YYYY)', 'DOB (Date-Month-Year) Ex: 09-Sep-2003)', 'date_of_birth'] },
      { key: 'adhar_no', label: 'Aadhaar Number', altKeys: ['ADHAR No', 'aadhar_no', 'aadhaar_no'] },
      { key: 'apaar_id', label: 'APAAR ID', altKeys: ['APAAR ID', 'apaar id'] },
      { key: 'father_name', label: 'Father Name', altKeys: ['Father Name', 'fathername'] },
      { key: 'gender', label: 'Gender', altKeys: ['M/F', 'Gender'] },
      { key: 'category_id', label: 'Category', altKeys: ['Category'] },

      // Academic Fields
      { key: 'admission_number', label: 'Admission Number', altKeys: ['Admission Number', 'Admission No', 'admission_no'] },
      { key: 'course', label: 'Program', altKeys: ['Program', 'Program Name'] },
      { key: 'branch', label: 'Branch', altKeys: ['Branch', 'Branch Name'] },
      { key: 'batch', label: 'Batch', altKeys: ['Batch'] },
      { key: 'college', label: 'College', altKeys: ['College', 'College Name'] },
      { key: 'stud_type', label: 'Quota', altKeys: ['StudType', 'Student Type', 'student_type'] },
      { key: 'current_year', label: 'Current Year', altKeys: ['Current Academic Year', 'Current Year', 'Year'] },
      { key: 'current_semester', label: 'Current Semester', altKeys: ['Current Semester', 'Semester', 'Semister'] },
      { key: 'admission_date', label: 'Admission Date', altKeys: ['Admission Date', 'admission_date'] },

      // Parent Information
      { key: 'parent_mobile1', label: 'Parent Mobile 1', altKeys: ['Parent Mobile Number 1', 'Parent Mobile 1', 'parent_mobile_1'] },
      { key: 'parent_mobile2', label: 'Parent Mobile 2', altKeys: ['Parent Mobile Number 2', 'Parent Mobile 2', 'parent_mobile_2'] },

      // Address Fields
      { key: 'student_address', label: 'Permanent Address', altKeys: ['Student Address (D.No, Str name, Village, Mandal, Dist)', 'Student Address', 'address'] },
      { key: 'city_village', label: 'City/Village', altKeys: ['City/Village', 'City/Village Name', 'city_village_name'] },
      { key: 'mandal_name', label: 'Mandal', altKeys: ['Mandal Name', 'Mandal', 'mandal'] },
      { key: 'district', label: 'District', altKeys: ['District', 'District Name'] },

      // Administrative Fields
      { key: 'student_status', label: 'Student Status', altKeys: ['Student Status', 'studentstatus'] },
      { key: 'scholar_status', label: 'Scholar Status', altKeys: ['Scholar Status', 'scholarstatus'] },
      { key: 'certificates_status', label: 'Certificate Status', altKeys: ['Certificates Status', 'Certificate Status', 'certificatesstatus'] },
      { key: 'previous_college', label: 'Previous College', altKeys: ['Previous College Name', 'Previous College', 'previouscollege'] },
      { key: 'remarks', label: 'Remarks', altKeys: ['Remarks', 'remark'] },

      // Photo
      { key: 'student_photo', label: 'Student Photo', altKeys: ['Student Photo', 'photo', 'studentphoto'] }
    ];

    let filledCount = 0;
    const missingFields = [];
    const totalCount = profileFields.length;

    // Count filled fields
    profileFields.forEach(field => {
      const value = getFieldValue(field.key, field.altKeys);
      if (isValidValue(value)) {
        filledCount++;
      } else {
        missingFields.push(field.label);
      }
    });

    // Calculate percentage
    const percentage = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

    return {
      percentage,
      filledCount,
      totalCount,
      missingFields
    };
  }, []);

  const selectedCount = selectedAdmissionNumbers.size;
  const isAllSelected = students.length > 0 && selectedCount === students.length;

  const toggleSelectAllStudents = (checked) => {
    if (checked) {
      setSelectedAdmissionNumbers(new Set(students.map((student) => student.admission_number)));
    } else {
      setSelectedAdmissionNumbers(new Set());
    }
  };

  const toggleSelectStudent = (admissionNumber) => {
    setSelectedAdmissionNumbers((prev) => {
      const updated = new Set(prev);
      if (updated.has(admissionNumber)) {
        updated.delete(admissionNumber);
      } else {
        updated.add(admissionNumber);
      }
      return updated;
    });
  };

  useEffect(() => {
    const newStudent = location.state?.newStudent;
    if (newStudent) {
      // Invalidate cache to refetch with new student
      invalidateStudents();
      setCurrentPage(1);
      // Fetch completion percentage for the new student
      getStudentCompletionPercentage(newStudent.admission_number).then(percentage => {
        setCompletionPercentages(prev => ({
          ...prev,
          [newStudent.admission_number]: percentage
        }));
      });
      // Clear the state to avoid re-adding on re-renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state, invalidateStudents]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (showModal) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Disable body scrolling
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        // Re-enable body scrolling when modal closes
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [showModal]);

  // Recalculate profile completion when editData changes (in edit mode)
  useEffect(() => {
    if (showModal && selectedStudent && editData) {
      const parsedStudentData = typeof editData === 'string'
        ? JSON.parse(editData || '{}')
        : editData;
      const completion = calculateProfileCompletion(selectedStudent, parsedStudentData);
      setProfileCompletion(completion);
    }
  }, [editData, showModal, selectedStudent, calculateProfileCompletion]);

  // Sync dialog category from category_id, nested caste_id, or students.caste text
  useEffect(() => {
    if (!showModal) {
      setDialogCasteCategoryId('');
      return;
    }
    const byCategoryId = getByCategoryId(selectedStudent?.category_id);
    if (byCategoryId) {
      setDialogCasteCategoryId(String(byCategoryId.id));
      return;
    }
    const byId = getByCasteId(selectedStudent?.caste_id);
    if (byId?.category) {
      setDialogCasteCategoryId(String(byId.category.id));
      return;
    }
    const byName = casteCategories.find(
      (cat) =>
        String(cat.name || '').trim().toLowerCase() ===
        String(selectedStudent?.caste || '').trim().toLowerCase()
    );
    setDialogCasteCategoryId(byName ? String(byName.id) : '');
  }, [showModal, selectedStudent?.admission_number, selectedStudent?.category_id, selectedStudent?.caste_id, selectedStudent?.caste, getByCategoryId, getByCasteId, casteCategories]);

  // Fetch secure QR token for selected student
  const [activeQrToken, setActiveQrToken] = useState(null);
  useEffect(() => {
    if (selectedStudent && selectedStudent.admission_number) {
      if (selectedStudent.qr_token) {
        setActiveQrToken(selectedStudent.qr_token);
      } else {
        setActiveQrToken(null);
        api.get(`/qr/token/${encodeURIComponent(selectedStudent.admission_number)}`)
          .then(res => {
            if (res.data?.success && res.data?.data?.token) {
              setActiveQrToken(res.data.data.token);
              // Optimistically update the student object to avoid refetching
              selectedStudent.qr_token = res.data.data.token;
            }
          })
          .catch(e => console.error('Failed to fetch QR token for UI', e));
      }
    } else {
      setActiveQrToken(null);
    }
  }, [selectedStudent]);

  // Check expired permits on component mount and when students data changes
  useEffect(() => {
    const checkExpiredPermits = async () => {
      try {
        const response = await api.post('/students/check-expired-permits');
        if (response.data?.success && response.data?.updated > 0) {
          // Silently refresh students if any were updated
          invalidateStudents();
        }
      } catch (error) {
        // Silently fail - don't show error to user on background check
        console.error('Failed to check expired permits:', error);
      }
    };

    // Check on mount and when students data is available
    // Only perform this check if user has permission to edit students
    if (students && students.length > 0 && canEditStudentsReal) {
      checkExpiredPermits();
    }
  }, [students, invalidateStudents]);

  // Calculate stats when students or filters change - update immediately
  const studentsLengthRef = useRef(0);
  const studentsIdsRef = useRef('');
  const filtersRefForStats = useRef(JSON.stringify(filters));

  useEffect(() => {
    const currentIds = students.map(s => s.admission_number).sort().join(',');
    const currentLength = students.length;
    const currentFiltersStr = JSON.stringify(filters);

    // Recalculate if students changed OR filters changed
    const studentsChanged = currentLength !== studentsLengthRef.current || currentIds !== studentsIdsRef.current;
    const filtersChanged = currentFiltersStr !== filtersRefForStats.current;

    if (studentsChanged || filtersChanged) {
      studentsLengthRef.current = currentLength;
      studentsIdsRef.current = currentIds;
      filtersRefForStats.current = currentFiltersStr;

      // Call calculateOverallStats directly without including it in dependencies
      (async () => {
        if (students.length === 0) {
          setStats({ total: 0, completed: 0, averageCompletion: 0 });
          return;
        }

        // Filter to only count Regular students
        const regularStudents = students.filter(student => {
          const status = student.student_status || student.student_data?.student_status || student.student_data?.['Student Status'];
          return status === 'Regular';
        });

        const totalStudents = regularStudents.length;
        let completedStudents = 0;
        let totalCompletion = 0;

        // Fetch completion percentages for all regular students in parallel
        const promises = regularStudents
          .filter(student => student.admission_number)
          .map(async (student) => {
            const percentage = await getStudentCompletionPercentage(student.admission_number);
            return { percentage, admissionNumber: student.admission_number };
          });

        const results = await Promise.all(promises);

        results.forEach(result => {
          totalCompletion += result.percentage;
          if (result.percentage >= 80) {
            completedStudents++;
          }
        });

        const averageCompletion = totalStudents > 0 ? Math.round(totalCompletion / totalStudents) : 0;

        setStats({
          total: totalStudents,
          completed: completedStudents,
          averageCompletion
        });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, filters]);

  // Fetch colleges on component mount
  const fetchColleges = async () => {
    try {
      setCollegesLoading(true);
      const response = await api.get('/colleges');
      if (response.data?.success) {
        setColleges(response.data.data || []);
      } else {
        throw new Error('Failed to fetch colleges');
      }
    } catch (error) {
      console.error('Failed to fetch colleges:', error);
      toast.error(error.response?.data?.message || 'Failed to load colleges');
    } finally {
      setCollegesLoading(false);
    }
  };

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

  // Load all filters in sequence: colleges → quick filters → dropdown filters
  // This ensures filters are ready before students query runs
  const loadAllFilters = async () => {
    try {
      setFiltersLoading(true);

      // Step 1: Load colleges first (independent)
      await fetchColleges();

      try {
        const academicResponse = await api.get('/academic-years/active');
        if (academicResponse.data?.success) {
          const labels = (academicResponse.data.data || [])
            .map((year) => year.yearLabel || year.year_label)
            .filter(Boolean);
          setAcademicYearOptions(labels);
        }
      } catch (error) {
        console.warn('Failed to load academic years for batch options:', error);
      }

      // Step 2: Load quick filter options (with current filters for cascading)
      await fetchQuickFilterOptions(filters);

      // Step 3: Load dropdown filter options (with current filters for cascading)
      await fetchDropdownFilterOptions(filters);

    } catch (error) {
      console.error('Failed to load filters:', error);
      toast.error('Failed to load some filter options');
    } finally {
      setFiltersLoading(false);
    }
  };

  // Fetch filter fields when component mounts - load in sequence
  useEffect(() => {
    loadAllFilters();
  }, []); // Only run on mount

  // Refetch filter options when filters change (for cascading filters)
  // Use individual filter values to prevent unnecessary refetches
  // Only reload filter options, NOT the entire page
  const prevFiltersRef = useRef({ college: '', course: '', branch: '', batch: '', year: '', semester: '' });
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    // Skip on initial mount (already handled by loadAllFilters)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    const currentFilters = {
      college: filters.college || '',
      course: filters.course || '',
      branch: filters.branch || '',
      batch: filters.batch || '',
      year: filters.year || '',
      semester: filters.semester || ''
    };

    // Only refetch if filter values actually changed
    const filtersChanged =
      currentFilters.college !== prevFiltersRef.current.college ||
      currentFilters.course !== prevFiltersRef.current.course ||
      currentFilters.branch !== prevFiltersRef.current.branch ||
      currentFilters.batch !== prevFiltersRef.current.batch ||
      currentFilters.year !== prevFiltersRef.current.year ||
      currentFilters.semester !== prevFiltersRef.current.semester;

    if (filtersChanged) {
      prevFiltersRef.current = currentFilters;
      // Update filter options based on new filters (cascading)
      // Don't exclude any field here - this is for background refresh when filters change via other means
      fetchQuickFilterOptions(currentFilters).catch(err => {
        console.warn('Failed to refresh quick filter options:', err);
      });
      fetchDropdownFilterOptions(currentFilters).catch(err => {
        console.warn('Failed to refresh dropdown filter options:', err);
      });
      // Invalidate students query to refetch with new filters immediately
      invalidateStudents();
    }
  }, [filters.college, filters.course, filters.branch, filters.batch, filters.year, filters.semester]);

  // Remove auto-search - only search on button click
  // useEffect removed - search will only trigger on button click

  // Only clear available fields when filters/search actually change (not on every render)
  const prevFiltersSearchRef = useRef({ filters: {}, searchTerm: '' });

  useEffect(() => {
    const filtersString = JSON.stringify(filters);
    const searchChanged = searchTerm !== prevFiltersSearchRef.current.searchTerm;
    const filtersChanged = filtersString !== JSON.stringify(prevFiltersSearchRef.current.filters);

    if (searchChanged || filtersChanged) {
      prevFiltersSearchRef.current = { filters, searchTerm };
      setAvailableFields([]);
    }
  }, [searchTerm, filters]);

  const fetchQuickFilterOptions = async (currentFilters = {}, excludeField = null) => {
    try {
      // Build query params for cascading filters
      // When excludeField is set, exclude that field to show all options for that dropdown
      // Otherwise, include all parent filters for proper cascading
      const params = new URLSearchParams();

      // Always include college if selected (unless college is being changed)
      if (currentFilters.college && excludeField !== 'college') {
        params.append('college', currentFilters.college);
      }

      // Include level if selected (unless level is being changed)
      // Level affects batches and courses, so include it when fetching those options
      if (currentFilters.level && excludeField !== 'level') {
        params.append('level', currentFilters.level);
      }

      // Include course only if:
      // 1. Course is selected AND
      // 2. Course is not being changed
      if (currentFilters.course && excludeField !== 'course') {
        params.append('course', currentFilters.course);
      }

      if (currentFilters.branch && excludeField !== 'branch') {
        params.append('branch', currentFilters.branch);
      }

      // Include batch only if:
      // 1. Batch is selected AND
      // 2. Batch/year/semester are not being changed
      if (currentFilters.batch && excludeField !== 'batch' && excludeField !== 'year' && excludeField !== 'semester') {
        params.append('batch', currentFilters.batch);
      }

      if (currentFilters.year && excludeField !== 'year' && excludeField !== 'semester') {
        params.append('year', currentFilters.year);
      }

      if (currentFilters.semester && excludeField !== 'semester') {
        params.append('semester', currentFilters.semester);
      }

      const queryString = params.toString();
      const url = `/students/quick-filters${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      if (response.data?.success) {
        const data = response.data.data || {};
        setQuickFilterOptions((prev) => ({
          batches: currentFilters.batch ? prev.batches : [...new Set(data.batches || [])],
          colleges: currentFilters.college ? prev.colleges : [...new Set(data.colleges || [])],
          courses: currentFilters.course ? prev.courses : [...new Set(data.courses || [])],
          branches: currentFilters.branch ? prev.branches : (data.branches || []),
          years: currentFilters.year ? prev.years : [...new Set(data.years || [])],
          semesters: currentFilters.semester ? prev.semesters : [...new Set(data.semesters || [])],
          sections: data.sections || []
        }));
      }
      return true;
    } catch (error) {
      console.warn('Failed to fetch quick filter options:', error);
      // Don't show toast on background refresh, only on initial load
      if (filtersLoading) {
        toast.error('Failed to load filter options');
      }
      throw error;
    }
  };

  const fetchDropdownFilterOptions = async (currentFilters = {}, excludeField = null) => {
    try {
      // Build query params for cascading filters
      // Exclude the field being changed so dropdown shows all available options
      const params = new URLSearchParams();
      if (currentFilters.college && excludeField !== 'college') params.append('college', currentFilters.college);
      if (currentFilters.course && excludeField !== 'course') params.append('course', currentFilters.course);
      if (currentFilters.branch && excludeField !== 'branch') params.append('branch', currentFilters.branch);
      if (currentFilters.batch && excludeField !== 'batch') params.append('batch', currentFilters.batch);
      if (currentFilters.year && excludeField !== 'year') params.append('year', currentFilters.year);
      if (currentFilters.semester && excludeField !== 'semester') params.append('semester', currentFilters.semester);

      const queryString = params.toString();
      const url = `/students/filter-options${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      if (response.data?.success) {
        const data = response.data.data || {};
        const mergeOptions = (base = [], fallback = []) => {
          const merged = new Set([...(fallback || []), ...(base || [])]);
          return Array.from(merged);
        };

        setDropdownFilterOptions({
          stud_type: data.stud_type || [],
          student_status: data.student_status || [],
          scholar_status: SCHOLAR_STATUS_OPTIONS,
          category_id: data.category_id || [],
          gender: data.gender || [],
          certificates_status: data.certificates_status || [],
          remarks: data.remarks || [],
          district: data.district || [],
          mandal_name: data.mandal_name || []
        });
      }
      return true;
    } catch (error) {
      console.warn('Failed to fetch dropdown filter options:', error);
      // Don't show toast on background refresh, only on initial load
      if (filtersLoading) {
        toast.error('Failed to load dropdown filter options');
      }
      throw error;
    }
  };

  // Fetch completion percentages when students are loaded (in parallel)
  // Use stable comparison to prevent infinite loops
  const completionPercentagesStudentsRef = useRef('');

  useEffect(() => {
    const studentIds = students.map(s => s.admission_number).sort().join(',');

    // Only fetch if student IDs actually changed
    if (studentIds === completionPercentagesStudentsRef.current) {
      return;
    }

    completionPercentagesStudentsRef.current = studentIds;

    const fetchCompletionPercentages = async () => {
      if (students.length === 0) return;

      const percentages = {};
      const promises = students
        .filter(student => student.admission_number) // Only process students with admission numbers
        .map(async (student) => {
          try {
            const response = await api.get(`/submissions/student/${student.admission_number}/completion-status`);
            return { admissionNumber: student.admission_number, percentage: response.data.data.completionPercentage };
          } catch (error) {
            // Silently return 0 if completion status can't be fetched
            return { admissionNumber: student.admission_number, percentage: 0 };
          }
        });

      const results = await Promise.all(promises);
      results.forEach(result => {
        percentages[result.admissionNumber] = result.percentage;
      });
      setCompletionPercentages(percentages);
    };

    fetchCompletionPercentages();
  }, [students]);

  // Update selected admission numbers when students change - use stable comparison
  const selectedStudentsRef = useRef('');

  useEffect(() => {
    const studentIds = students.map(s => s.admission_number).sort().join(',');

    // Only update if student IDs actually changed
    if (studentIds === selectedStudentsRef.current) {
      return;
    }

    selectedStudentsRef.current = studentIds;

    setSelectedAdmissionNumbers((prev) => {
      const updated = new Set();
      students.forEach((student) => {
        if (prev.has(student.admission_number)) {
          updated.add(student.admission_number);
        }
      });
      return updated;
    });
  }, [students]);

  // Extract available fields from students - use stable comparison to prevent infinite loops
  const availableFieldsStudentsRef = useRef('');

  useEffect(() => {
    if (students.length === 0) {
      return;
    }

    const studentIds = students.map(s => s.admission_number).sort().join(',');

    // Only extract fields if student IDs actually changed
    if (studentIds === availableFieldsStudentsRef.current) {
      return;
    }

    availableFieldsStudentsRef.current = studentIds;

    // Extract available fields and their unique values from current students data
    const fieldsMap = {};

    // Keywords to exclude (text fields that shouldn't be filters)
    const excludeKeywords = ['name', 'phone', 'mobile', 'contact', 'address', 'email', 'number', 'guardian', 'parent', 'information'];

    students.forEach(student => {
      if (!student.student_data || typeof student.student_data !== 'object') {
        return; // Skip students without valid student_data
      }
      Object.entries(student.student_data).forEach(([key, value]) => {
        const keyLower = key.toLowerCase();
        const shouldExclude = excludeKeywords.some(keyword => keyLower.includes(keyword));

        if (!shouldExclude && !fieldsMap[key]) {
          fieldsMap[key] = new Set();
        }
        if (!shouldExclude && value && typeof value === 'string') {
          fieldsMap[key].add(value);
        }
      });
    });

    const fieldsArray = Object.entries(fieldsMap).map(([key, values]) => ({
      name: key,
      values: Array.from(values).sort()
    }));

    setAvailableFields(prevFields => {
      const combinedMap = new Map();

      prevFields.forEach(field => {
        combinedMap.set(field.name, new Set(field.values));
      });

      fieldsArray.forEach(field => {
        if (!combinedMap.has(field.name)) {
          combinedMap.set(field.name, new Set(field.values));
        } else {
          const existingValues = combinedMap.get(field.name);
          field.values.forEach(value => existingValues.add(value));
        }
      });

      return Array.from(combinedMap.entries())
        .map(([name, values]) => ({
          name,
          values: Array.from(values).sort()
        }))
        .filter(field => field.values.length >= 2 && field.values.length <= 10);
    });
  }, [students]);

  // Error handling for React Query
  useEffect(() => {
    if (isError && error) {
      toast.error(error.response?.data?.message || 'Failed to fetch students');
    }
  }, [isError, error]);

  const fetchForms = async () => {
    if (loadingForms) {
      return;
    }
    setLoadingForms(true);
    try {
      const formPromise = api.get('/forms');
      const certPromise = api.get('/settings/certificates');
      const coursesPromise = api.get('/courses/options');
      const [formResponse, certResponse, coursesResponse] = await Promise.all([
        formPromise,
        certPromise,
        coursesPromise
      ]);

      if (formResponse.data?.success) {
        setForms(formResponse.data.data || []);
      }

      if (coursesResponse.data?.success) {
        setCoursesWithLevels(coursesResponse.data.data || []);
      }

      if (certResponse.data?.success && certResponse.data.data) {
        // Normalize cert options from old string format to new {value, type} format
        const rawConfig = certResponse.data.data;
        const normalized = {};
        for (const [courseType, certs] of Object.entries(rawConfig)) {
          normalized[courseType] = certs.map(cert => ({
            ...cert,
            options: (cert.options || []).map(opt =>
              typeof opt === 'string' ? { value: opt, type: 'permanent' } : opt
            )
          }));
        }
        setCertificateConfig(normalized);
      }
    } catch (error) {
      console.error('Failed to load form/certificate settings', error);
    } finally {
      setLoadingForms(false);
    }
  };

  const fetchFrozenBatches = async () => {
    try {
      setFrozenBatchesLoading(true);
      const response = await api.get('/settings/frozen-batches');
      if (response.data?.success) {
        setFrozenBatches(response.data.data || {});
      }
    } catch (error) {
      console.error('Failed to load frozen batches:', error);
    } finally {
      setFrozenBatchesLoading(false);
    }
  };

  // Fetch frozen batches on mount
  useEffect(() => {
    fetchFrozenBatches();
  }, []);

  // Apply server-side filtering
  const applyFilters = () => {
    setCurrentPage(1);
  };

  // Legacy function for backward compatibility - now uses server-side filtering
  const handleLocalSearch = () => {
    setDebouncedSearch(searchTerm); // Force immediate search update
    setCurrentPage(1);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => {
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
        // If college changes (or is cleared), clear level, course and branch to avoid invalid selections
        delete newFilters.level;
        delete newFilters.course;
        delete newFilters.branch;
        delete newFilters.section;
      } else if (field === 'level') {
        // If level changes (or is cleared), clear batch, course and branch to avoid invalid selections
        delete newFilters.batch;
        delete newFilters.course;
        delete newFilters.branch;
        delete newFilters.section;
      } else if (field === 'course') {
        // If course changes (or is cleared), clear branch to avoid invalid selections
        delete newFilters.branch;
        delete newFilters.section;
      } else if (field === 'branch') {
        delete newFilters.section;
      } else if (field === 'batch' || field === 'year' || field === 'semester') {
        delete newFilters.section;
      }

      // Auto-expand filters when a filter is applied
      if (value && !filtersExpanded) {
        setFiltersExpanded(true);
      }

      // Update ref immediately
      filtersRef.current = newFilters;

      // Always update filter options with cascading when a filter changes
      // This ensures child filters show only relevant options based on parent selections
      fetchQuickFilterOptions(newFilters).catch(err => {
        console.warn('Failed to update filter options:', err);
      });
      fetchDropdownFilterOptions(newFilters).catch(err => {
        console.warn('Failed to update dropdown filter options:', err);
      });

      // Automatically apply filter when changed - React Query will refetch automatically
      setCurrentPage(1);
      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
    setAvailableFields([]);
    setCurrentPage(1);
    skipFilterFetchRef.current = true;
  };

  const handlePageChange = (newPage) => {
    if (newPage === currentPage || newPage < 1 || newPage > totalPages) {
      return;
    }

    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (event) => {
    const newSize = parseInt(event.target.value, 10);

    if (filtersLoading || isLoading || isFetching) {
      return;
    }

    if (Number.isNaN(newSize) || newSize <= 0 || newSize === pageSize) {
      return;
    }

    setPageSize(newSize);
    setCurrentPage(1);
  };

  const refreshStudents = () => {
    invalidateStudents();
  };

  // Inline editing handlers
  const handleCellClick = (student, field, currentValue, fieldType = 'text') => {
    const studentId = student.id || student.admission_number || student.admissionNumber;
    const admissionNumber =
      student.admission_number ||
      student.admissionNumber ||
      student.admissionNo ||
      student.admission_number;

    setEditingCell({
      studentId,
      admissionNumber,
      field,
      fieldType,
      originalValue: currentValue || ''
    });
    setCellEditValue(currentValue || '');
  };

  const handleCellBlur = async (student, overrideValue = null) => {
    if (!editingCell) return;

    const { field } = editingCell;
    const admissionNumber =
      editingCell.admissionNumber ||
      student.admission_number ||
      student.admissionNumber ||
      student.admissionNo ||
      student.id;

    const newValueRaw = overrideValue !== null ? overrideValue : cellEditValue;
    const newValue = (newValueRaw ?? '').toString().trim();
    const originalValue =
      editingCell.originalValue !== undefined
        ? (editingCell.originalValue ?? '').toString().trim()
        : (student[field] || '').toString().trim();

    // If value hasn't changed, just clear editing
    if (newValue === originalValue) {
      setEditingCell(null);
      setCellEditValue('');
      return;
    }

    // Scholarship status is managed only via the Scholarship tab
    if (field === 'scholar_status') {
      setEditingCell(null);
      setCellEditValue('');
      toast.error('Update scholarship status from the Scholarship tab');
      return;
    }

    // Special handling for student_status -> 'Rejoined' (requires batch selection)
    if (field === 'student_status' && newValue === 'Rejoined') {
      // Open rejoin modal
      setRejoinStudent(student);
      setShowRejoinModal(true);
      setEditingCell(null);
      setCellEditValue('');
      return;
    }

    // Special handling for fee_status -> 'permitted' (requires permit details)
    if (field === 'fee_status' && newValue === 'permitted') {
      // Store which student is being permitted so we can save after modal confirmation
      setPendingFeeStatusChange(newValue);
      setPendingPermitAdmissionNumber(admissionNumber);
      setShowPermitModal(true);
      setEditingCell(null);
      setCellEditValue('');
      return;
    }

    // Save the change immediately
    try {
      if (field === 'fee_status') {
        await api.put(`/students/${admissionNumber}/fee-status`, {
          fee_status: newValue
        });
      } else if (field === 'registration_status') {
        await api.put(`/students/${admissionNumber}/registration-status`, {
          registration_status: newValue
        });
      } else {
        // Update via general update endpoint
        const updateData = { [field]: newValue };
        await updateStudentMutation.mutateAsync({
          admissionNumber: admissionNumber,
          data: { studentData: updateData }
        });
      }

      toast.success(`${field} updated successfully`);
      invalidateStudents();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to update ${field}`);
    }

    setEditingCell(null);
    setCellEditValue('');
  };

  const handleCellKeyDown = (e, student) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur(student);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setCellEditValue('');
    }
  };

  // Render editable cell
  const renderEditableCell = (student, field, fieldType = 'text', options = []) => {
    const studentKey = student.id || student.admission_number || student.admissionNumber;

    // Check if user is cashier and restrict editing to only fee_status
    const isEditsAllowedForField = isCashier ? field === 'fee_status' : true;

    // Allow editing if:
    // 1. General edit permission is true AND field-level edit permission is true AND field allows edits
    // 2. OR User is cashier AND field is fee_status (override general permission if needed)
    // 3. AND student's batch is NOT frozen
    const studentBatch = student.batch || student.student_data?.batch;
    const isBatchFrozen = (frozenBatches[studentBatch]?.includes("ALL") || frozenBatches[studentBatch]?.includes(field));
    const hasPermissionToEdit = ((canEditStudents && canEditField(field)) || (isCashier && field === 'fee_status')) && !isBatchFrozen;

    const isEditing = hasPermissionToEdit && isEditsAllowedForField && editingCell?.studentId === studentKey && editingCell?.field === field;
    // Unlinked caste: never fall back to legacy students.caste text for display/options
    const currentValue =
      field === 'caste' && !resolveStudentCaste(student).linked
        ? ''
        : (student[field] || '');

    if (isEditing) {
      if (fieldType === 'select') {
        // While editing, cellEditValue is source of truth (allow empty — don't fall back to old DB value)
        const displayValue = cellEditValue ?? '';
        const allOptions = [...new Set([...options, displayValue, currentValue].filter(Boolean))];

        return (
          <select
            value={displayValue}
            onChange={(e) => {
              const newValue = e.target.value;
              if (newValue === 'permitted' && field === 'fee_status') {
                // Inline edit flow for permitting fees – open modal and remember student
                const admissionNumber =
                  student.admission_number || student.admissionNumber || student.admissionNo;
                setPendingFeeStatusChange(newValue);
                setPendingPermitAdmissionNumber(admissionNumber || null);
                setShowPermitModal(true);
                setEditingCell(null);
                setCellEditValue('');
              } else {
                setCellEditValue(newValue);
                handleCellBlur({ ...student, [field]: newValue }, newValue);
              }
            }}
            onBlur={() => handleCellBlur(student)}
            onKeyDown={(e) => handleCellKeyDown(e, student)}
            autoFocus
            className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Select...</option>
            {allOptions.map((opt) => (
              <option key={opt} value={opt.id || opt}>{opt.name || opt}</option>
            ))}
          </select>
        );
      } else {
        return (
          <input
            type={fieldType}
            value={cellEditValue}
            onChange={(e) => setCellEditValue(e.target.value)}
            onBlur={() => handleCellBlur(student)}
            onKeyDown={(e) => handleCellKeyDown(e, student)}
            autoFocus
            className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );
      }
    }

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleCellClick(student, field, currentValue, fieldType);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleCellClick(student, field, currentValue, fieldType);
        }}
        className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded transition-colors"
        title="Click or double-click to edit"
      >
        {currentValue || '-'}
      </div>
    );
  };

  const handleResetPassword = async () => {
    if (!selectedStudent) return;

    if (!window.confirm('Reset this student\'s password? A new login password will be generated, saved, and sent to the student\'s registered mobile via SMS.')) {
      return;
    }

    setResettingPassword(true);
    try {
      const response = await api.post(`/students/${selectedStudent.admission_number}/reset-password`);
      if (response.data.success) {
        setStudentPassword(response.data.data);
        setViewingPassword(true);
        toast.success('Password reset successfully! SMS sent to student.');
      } else {
        toast.error(response.data.message || 'Failed to reset password');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleViewDetails = (student, initialTab = 'details') => {
    setEditMode(false);
    setEditingRollNumber(false);
    setTempRollNumber(student.pin_no || '');
    setViewingPassword(false);
    setStudentPassword(null);
    let targetTab = initialTab;
    if (targetTab === 'scholarship' && !canViewScholarship) targetTab = 'details';
    if (targetTab === 'merit_status' && !canViewMeritStatus) targetTab = 'details';
    if (targetTab === 'sms_tracking' && !canViewSms) targetTab = 'details';
    setActiveStudentTab(targetTab);

    // Prepare all possible fields including hidden ones
    const allFields = {
      // From student_data (form submission) - use original field names
      ...student.student_data,
      // Map ALL individual database columns to ensure they're available
      // These override student_data if they exist in individual columns
      ...(student.student_name && { student_name: student.student_name, 'Student Name': student.student_name }),
      ...(student.father_name && { father_name: student.father_name, 'Father Name': student.father_name }),
      ...(student.gender && { gender: student.gender, 'M/F': student.gender }),
      ...(student.dob && { dob: student.dob, 'DOB (Date of Birth - DD-MM-YYYY)': student.dob }),
      ...(student.student_mobile && { student_mobile: student.student_mobile, 'Student Mobile Number': student.student_mobile }),
      ...(student.parent_mobile1 && { parent_mobile1: student.parent_mobile1, 'Parent Mobile Number 1': student.parent_mobile1 }),
      ...(student.parent_mobile2 && { parent_mobile2: student.parent_mobile2, 'Parent Mobile Number 2': student.parent_mobile2 }),
      ...(student.adhar_no && { adhar_no: student.adhar_no, 'ADHAR No': student.adhar_no }),
      ...(student.caste && { caste: student.caste, 'Caste': student.caste }),
      ...(student.batch && { batch: student.batch, 'Batch': student.batch }),
      ...(student.college && { college: student.college, 'College': student.college }),
      // CRITICAL: Ensure course and branch are overridden across all possible JSON keys
      ...(student.course && {
        course: student.course,
        'Course': student.course,
        'Course Name': student.course,
        'Program': student.course,
        'Program Name': student.course
      }),
      ...(student.branch && {
        branch: student.branch,
        'Branch': student.branch,
        'Branch Name': student.branch
      }),
      section: student.section || '',
      Section: student.section || '',
      ...(student.stud_type && { stud_type: student.stud_type, 'StudType': student.stud_type }),
      ...(student.student_status && { student_status: student.student_status, 'Student Status': student.student_status }),
      ...(student.student_address && { student_address: student.student_address }),
      ...(student.city_village && { city_village: student.city_village }),
      ...(student.mandal_name && { mandal_name: student.mandal_name }),
      ...(student.district && { district: student.district, 'District': student.district }),
      ...(student.pin_no && { pin_no: student.pin_no }),
      ...(student.previous_college && { previous_college: student.previous_college }),
      // Always include certificates_status even if null, so it can be edited
      certificates_status: student.certificates_status || null,
      ...(student.student_photo && { student_photo: student.student_photo }),
      ...(student.remarks && { remarks: student.remarks, 'Remarks': student.remarks }),
      ...(student.admission_date && { admission_date: student.admission_date, 'Admission Date': student.admission_date }),
      // APAAR ID - can be in student_data or direct column
      ...(student.apaar_id && { apaar_id: student.apaar_id }),
      ...(student.student_data?.apaar_id && !student.apaar_id && { apaar_id: student.student_data.apaar_id })
    };

    const cleanedAllFields = stripReadonlyStudentPayloadFields(allFields);

    console.log('Student data:', student);
    console.log('All fields being set:', allFields);

    const stageSyncedFieldsRaw = syncStageFields(
      cleanedAllFields,
      student.current_year,
      student.current_semester
    );
    // Keep students.caste (category value) in the form; nested caste is optional
    const stageSyncedFields = { ...stageSyncedFieldsRaw };

    const stageSyncedStudent = {
      ...student,
      current_year: stageSyncedFields.current_year || student.current_year,
      current_semester: stageSyncedFields.current_semester || student.current_semester,
      student_data: stageSyncedFields
    };

    // Calculate profile completion BEFORE opening modal (instant calculation)
    const parsedStudentData = typeof stageSyncedFields === 'string'
      ? JSON.parse(stageSyncedFields || '{}')
      : stageSyncedFields;

    const completion = calculateProfileCompletion(stageSyncedStudent, parsedStudentData);
    setProfileCompletion(completion);
    console.log('Profile completion calculated:', completion);

    // Fetch relevant courses/branches for THIS student's college to populate modal dropdowns
    if (student.college) {
      fetchQuickFilterOptions({ college: student.college }).catch(err => {
        console.warn('Failed to load filter options for student modal:', err);
      });
    }

    setSelectedStudent(stageSyncedStudent);
    const openDisplay = resolveStudentCaste(student);
    setEditData({
      ...stageSyncedFields,
      caste_id: student.caste_id ?? null,
      category_id: student.category_id ?? null,
      nested_caste: openDisplay.linked ? (openDisplay.casteName || '') : '',
      // Preserve IDs so edits correctly update the ID columns on the backend
      college_id: student.college_id != null ? String(student.college_id) : null,
      course_id: student.course_id != null ? String(student.course_id) : null,
      branch_id: student.branch_id != null ? String(student.branch_id) : null,
    });
    setEditBaseline(cloneStudentFormSnapshot({
      ...stageSyncedFields,
      caste_id: student.caste_id ?? null,
      category_id: student.category_id ?? null,
      nested_caste: openDisplay.linked ? (openDisplay.casteName || '') : '',
      college_id: student.college_id != null ? String(student.college_id) : null,
      course_id: student.course_id != null ? String(student.course_id) : null,
      branch_id: student.branch_id != null ? String(student.branch_id) : null,
    }));
    setEditRegistrationStatus(student.registration_status || 'pending');
    setEditFeeStatus(student.fee_status || 'pending');
    setPermitEndingDate(formatDateToLocalISO(student.permit_ending_date) || '');
    setPermitRemarks(student.permit_remarks || '');
    setShowModal(true);
  };

  const handleViewHistory = (student) => {
    setSelectedStudent(student);
    setShowRemarksHistoryModal(true);
  };

  const handleEdit = () => {
    // No need to check permission here since button is only shown if user has edit permission
    const linked = resolveStudentCaste(selectedStudent);
    const byCategoryId = getByCategoryId(selectedStudent?.category_id);
    const categoryFromStudent = casteCategories.find(
      (cat) =>
        String(cat.name || '').trim().toLowerCase() ===
        String(selectedStudent?.caste || linked.categoryName || '').trim().toLowerCase()
    );
    const byId = getByCasteId(selectedStudent?.caste_id);
    setDialogCasteCategoryId(
      byCategoryId
        ? String(byCategoryId.id)
        : byId?.category
          ? String(byId.category.id)
          : (categoryFromStudent ? String(categoryFromStudent.id) : '')
    );
    // students.caste is the CATEGORY value (BC-A, OC…) — keep it; nested caste is optional via caste_id
    setEditData((prev) => ({
      ...prev,
      caste: selectedStudent?.caste || linked.categoryName || '',
      Caste: selectedStudent?.caste || linked.categoryName || '',
      category_id: selectedStudent?.category_id ?? byCategoryId?.id ?? null,
      nested_caste: linked.linked ? (linked.casteName || '') : ''
    }));
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (savingEdit) return; // Prevent double submission

    // Validate mandatory fields
    const mandatoryFields = [
      { key: 'student_name', label: 'Student Name', altKey: 'Student Name' },
      { key: 'student_mobile', label: 'Mobile Number', altKey: 'Student Mobile Number' },
      { key: 'college', label: 'College', altKey: 'College' },
      { key: 'batch', label: 'Batch', altKey: 'Batch' },
      { key: 'course', label: 'Program (Course)', altKey: 'Program' },
      { key: 'branch', label: 'Branch', altKey: 'Branch' },
      { key: 'parent_mobile1', label: 'Parent Mobile Number 1', altKey: 'Parent Mobile Number 1' }
    ];

    for (const field of mandatoryFields) {
      const value = editData[field.key] ?? editData[field.altKey] ?? '';
      if (typeof value === 'string' && value.trim() === '') {
        toast.error(`${field.label} is required`);
        return;
      }
      if (value === null || value === undefined) {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    // Check if student status is being changed to "Rejoined"
    if (editData.student_status === 'Rejoined' && selectedStudent.student_status !== 'Rejoined') {
      // Open rejoin modal instead of saving directly
      setRejoinStudent(selectedStudent);
      setShowRejoinModal(true);
      return;
    }

    setSavingEdit(true);
    try {
      console.log('Saving edit data:', editData);
      console.log('Selected student:', selectedStudent);

      const synchronizedData = syncStageFields(
        editData,
        editData.current_year ?? editData['Current Academic Year'],
        editData.current_semester ?? editData['Current Semester']
      );

      // Ensure statuses are included within studentData (backend maps these via FIELD_MAPPING)
      if (editRegistrationStatus) {
        synchronizedData.registration_status = editRegistrationStatus;
      }
      if (editFeeStatus) {
        synchronizedData.fee_status = editFeeStatus;
      }

      // Category stays in students.caste; category_id + optional nested caste → caste_id
      const nestedName = String(synchronizedData.nested_caste || '').trim();
      delete synchronizedData.nested_caste;
      if (dialogCasteCategoryId) {
        const parent = casteCategories.find(
          (c) => String(c.id) === String(dialogCasteCategoryId)
        );
        if (parent?.name) {
          synchronizedData.caste = parent.name;
          synchronizedData.Caste = parent.name;
          synchronizedData.category_id = parent.id;
        }
      } else {
        synchronizedData.category_id = null;
      }
      if (nestedName) {
        const parent =
          (dialogCasteCategoryId
            ? casteCategories.find((c) => String(c.id) === String(dialogCasteCategoryId))
            : null) || getCategoryForCaste(nestedName);
        const nestedRow = (parent?.castes || []).find(
          (c) => String(c.name).trim() === nestedName
        );
        synchronizedData.caste_id = nestedRow?.id ?? null;
      } else {
        synchronizedData.caste_id = null;
      }

      // Only hit the fee-status endpoint when fee status is newly set to permitted,
      // or when permit fields themselves change. Skip for other edits (e.g. mobile)
      // while the student is already permitted — otherwise empty permit fields block save.
      const originalFeeStatus = String(selectedStudent?.fee_status || '').toLowerCase();
      const isEditingPermitted = editFeeStatus === 'permitted';
      const feeStatusChangedToPermitted =
        isEditingPermitted && originalFeeStatus !== 'permitted';
      const originalPermitDate = formatDateToLocalISO(selectedStudent?.permit_ending_date) || '';
      const currentPermitDate = formatDateToLocalISO(permitEndingDate) || String(permitEndingDate || '');
      const permitDataChanged =
        isEditingPermitted &&
        originalFeeStatus === 'permitted' &&
        (
          currentPermitDate !== originalPermitDate ||
          String(permitRemarks || '').trim() !== String(selectedStudent?.permit_remarks || '').trim()
        );
      const shouldUpdateFeeStatus = feeStatusChangedToPermitted || permitDataChanged;

      if (shouldUpdateFeeStatus) {
        if (!permitEndingDate) {
          toast.error('Permit ending date is required when fee status is "permitted"');
          return;
        }
        if (!permitRemarks || !permitRemarks.trim()) {
          toast.error('Permit remarks is required when fee status is "permitted"');
          return;
        }
        try {
          await api.put(`/students/${selectedStudent.admission_number}/fee-status`, {
            fee_status: editFeeStatus,
            permit_ending_date: permitEndingDate,
            permit_remarks: permitRemarks
          });
          toast.success('Fee status updated successfully');
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to update fee status');
          throw error;
        }
      }

      const partialStudentData = buildPartialStudentUpdatePayload(
        editBaseline || {},
        synchronizedData,
        {
          registrationStatus: editRegistrationStatus,
          feeStatus: editFeeStatus,
          originalStudent: selectedStudent
        }
      );

      if (Object.keys(partialStudentData).length === 0 && !shouldUpdateFeeStatus) {
        toast.success('No changes to save');
        setSavingEdit(false);
        return;
      }

      await updateStudentMutation.mutateAsync({
        admissionNumber: selectedStudent.admission_number,
        data: {
          studentData: partialStudentData
        }
      });

      setEditBaseline(cloneStudentFormSnapshot(synchronizedData));

      // Invalidate students query to ensure fresh data
      invalidateStudents();
      await fetchScholarshipForStudent(selectedStudent.admission_number);

      setEditMode(false);
      setEditData(synchronizedData);
      const linkedCasteName = synchronizedData.caste || synchronizedData.Caste || '';
      setSelectedStudent((prev) =>
        prev
          ? {
            ...prev,
            ...synchronizedData,
            current_year:
              synchronizedData.current_year ?? prev.current_year,
            current_semester:
              synchronizedData.current_semester ?? prev.current_semester,
            student_data: synchronizedData,
            caste: linkedCasteName || prev.caste,
            // ids resolved on client/server; keep latest from save payload
            caste_id: synchronizedData.caste_id ?? prev.caste_id ?? null,
            category_id: synchronizedData.category_id ?? prev.category_id ?? null
          }
          : prev
      );

      // Recalculate profile completion after save (instant, no API call needed)
      const updatedStudent = {
        ...selectedStudent,
        current_year: synchronizedData.current_year || selectedStudent.current_year,
        current_semester: synchronizedData.current_semester || selectedStudent.current_semester,
        student_data: synchronizedData
      };
      const parsedStudentData = typeof synchronizedData === 'string'
        ? JSON.parse(synchronizedData || '{}')
        : synchronizedData;
      const updatedCompletion = calculateProfileCompletion(updatedStudent, parsedStudentData);
      setProfileCompletion(updatedCompletion);
      console.log('Profile completion updated after save:', updatedCompletion);

    } catch (error) {
      console.error('Save failed:', error);
      // Error toast is handled by the mutation
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveRollNumber = async () => {
    if (!canUpdatePin) {
      toast.error('You do not have permission to update PIN numbers.');
      return;
    }
    if (savingPinNumber) return; // Prevent double submission

    console.log('[PIN UPDATE] Starting update for:', selectedStudent?.admission_number, 'New PIN:', tempRollNumber);

    setSavingPinNumber(true);
    try {
      const url = `/students/${selectedStudent.admission_number}/pin-number`;
      console.log('[PIN UPDATE] Making API call to:', url);

      // Make the API call - axios throws on non-2xx responses
      const response = await api.put(url, {
        pinNumber: tempRollNumber,
      });

      console.log('[PIN UPDATE] API Response:', response.data);

      // If we reach here, the request was successful (no exception thrown)
      setEditingRollNumber(false);

      // Update selectedStudent state
      setSelectedStudent(prev => ({ ...prev, pin_no: tempRollNumber }));

      // Update editData state as well
      setEditData(prev => ({ ...prev, pin_no: tempRollNumber }));

      // Invalidate the React Query cache to refresh the student list
      invalidateStudents();

      toast.success('PIN number updated successfully');
    } catch (error) {
      console.error('[PIN UPDATE] Error:', error);
      console.error('[PIN UPDATE] Error response:', error.response?.data);
      toast.error(error.response?.data?.message || 'Failed to update PIN number');
    } finally {
      setSavingPinNumber(false);
    }
  };

  const handleDelete = async (admissionNumber) => {
    if (!canDeleteStudents) {
      toast.error('You do not have permission to delete students.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this student?')) {
      return;
    }
    try {
      await deleteStudentMutation.mutateAsync(admissionNumber);

      // Remove from completion percentages
      setCompletionPercentages(prev => {
        const updated = { ...prev };
        delete updated[admissionNumber];
        return updated;
      });

      setSelectedAdmissionNumbers((prev) => {
        const updated = new Set(prev);
        updated.delete(admissionNumber);
        return updated;
      });

      // Cache invalidation is handled by the mutation

    } catch (error) {
      // Error toast is handled by the mutation
    }
  };

  const handleBulkDelete = async () => {
    if (!canDeleteStudents) {
      toast.error('You do not have permission to delete students.');
      return;
    }
    if (selectedCount === 0 || bulkDeleteMutation.isPending) {
      return;
    }

    if (!window.confirm(`Delete ${selectedCount} selected student${selectedCount === 1 ? '' : 's'}? This action cannot be undone.`)) {
      return;
    }

    const admissionNumbers = Array.from(selectedAdmissionNumbers);

    try {
      await bulkDeleteMutation.mutateAsync(admissionNumbers);

      // Remove from completion percentages
      setCompletionPercentages((prev) => {
        const updated = { ...prev };
        admissionNumbers.forEach((number) => {
          delete updated[number];
        });
        return updated;
      });
      setSelectedAdmissionNumbers(new Set());

      // Cache invalidation is handled by the mutation
    } catch (error) {
      // Error toast is handled by the mutation
    }
  };

  const handleBulkResendPasswords = async () => {
    if (!canUpdatePin) {
      toast.error('You do not have permission to update credentials.');
      return;
    }
    if (selectedCount === 0) return;

    if (!window.confirm(`Send password reset SMS to ${selectedCount} selected student${selectedCount === 1 ? '' : 's'}?`)) {
      return;
    }

    setBulkPasswordState(prev => ({ ...prev, isOpen: true, processing: true, results: null }));

    try {
      const admissionNumbers = Array.from(selectedAdmissionNumbers);
      const response = await api.post('/students/bulk-resend-passwords', {
        students: admissionNumbers
      });

      if (response.data.success) {
        setBulkPasswordState(prev => ({
          ...prev,
          processing: false,
          results: response.data.data,
          summary: response.data.summary
        }));
        toast.success('Bulk password operation completed');
      } else {
        toast.error(response.data.message || 'Failed to process request');
        setBulkPasswordState(prev => ({ ...prev, isOpen: false, processing: false }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Server error');
      setBulkPasswordState(prev => ({ ...prev, isOpen: false, processing: false }));
    }
  };

  const downloadBulkPasswordReport = () => {
    const { results } = bulkPasswordState;
    if (!results || results.length === 0) return;

    const headers = ['Admission Number', 'Status', 'Error', 'Mobile (Username)'];
    const csvContent = [
      headers.join(','),
      ...results.map(r => [
        r.admission_number,
        r.status,
        r.error ? `"${r.error.replace(/"/g, '""')}"` : '',
        r.mobile || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password_resend_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (totalStudents === 0 && students.length === 0) {
      toast.error('No data to export');
      return;
    }
    setShowExportModal(true);
  };

  const updateEditField = (key, value) => {
    setEditData(prev => {
      const newData = { ...prev, [key]: value };

      if (key === 'section') {
        newData.Section = value;
      }
      if (key === 'batch') {
        newData.Batch = value;
      }

      // If college changes, resolve college_id from colleges list and clear course/branch
      if (key === 'college') {
        const collegeObj = colleges.find(c => c.name === value);
        if (collegeObj) {
          // Send college_id as a numeric string — backend maps it to college_id column
          newData.college_id = String(collegeObj.id);
        } else {
          newData.college_id = null;
        }
        // Clear dependent fields when college changes
        newData.course = '';
        newData.Course = '';
        newData['Course Name'] = '';
        newData.Program = '';
        newData['Program Name'] = '';
        newData.course_id = null;
        newData.branch = '';
        newData.Branch = '';
        newData['Branch Name'] = '';
        newData.branch_id = null;
        fetchQuickFilterOptions({ college: value }).catch(console.warn);
      }

      // If course/program changes, resolve course_id from coursesWithLevels and clear branch
      if (key === 'course' || key === 'Program') {
        newData.course = value;
        newData.Course = value;
        newData['Course Name'] = value;
        newData.Program = value;
        newData['Program Name'] = value;

        const courseObj = coursesWithLevels.find(c => c.name === value);
        if (courseObj) {
          // Send course_id as a numeric string — backend maps it to course_id column
          newData.course_id = String(courseObj.id);
        } else {
          newData.course_id = null;
        }

        // Clear branch when program changes
        newData.branch = '';
        newData.Branch = '';
        newData['Branch Name'] = '';
        newData.branch_id = null;
        fetchQuickFilterOptions({ college: newData.college, course: value }).catch(console.warn);
      }

      if (key === 'branch' || key === 'Branch') {
        newData.branch = value;
        newData.Branch = value;
        newData['Branch Name'] = value;

        // Resolve branch_id from coursesWithLevels
        const courseName = newData.course || prev.course;
        const courseObj = coursesWithLevels.find(c => c.name === courseName);
        const branchObj = (courseObj?.branches || []).find(b => b.name === value);
        if (branchObj) {
          // Send branch_id as a numeric string — backend maps it to branch_id column
          newData.branch_id = String(branchObj.id);
        } else {
          newData.branch_id = null;
        }
      }

      return newData;
    });
  };

  // Helper functions imported from certificateConfig

  // Helper function to check if certificate is present
  const isCertificatePresent = (certKey) => {
    // Check in editData first, then selectedStudent.student_data
    const studentData = editData || selectedStudent?.student_data || {};
    const parsedData = typeof studentData === 'string' ? JSON.parse(studentData || '{}') : studentData;
    const value = parsedData[certKey];
    if (value === true || value === 'Yes' || value === 'yes') return true;
    // Also consider any non-empty string as present if it's from a dropdown
    if (typeof value === 'string' && value.trim() !== '' && value.toLowerCase() !== 'no' && value.toLowerCase() !== 'pending') return true;
    // If no individual cert value stored but overall status is Verified/Temporary, treat all as present
    const overallStatus = editData?.certificates_status || selectedStudent?.certificates_status || '';
    if (!value && (overallStatus === 'Verified' || overallStatus === 'Temporary')) return true;
    return false;
  };

  // Helper function to get certificate status display
  // overallStatus is passed from the render context (editData.certificates_status)
  const getCertificateStatusDisplay = (certKey, overallStatus) => {
    const studentData = editData || selectedStudent?.student_data || {};
    const parsedData = typeof studentData === 'string' ? JSON.parse(studentData || '{}') : studentData;
    const value = parsedData[certKey];

    if (!value || value === false || value === 'No' || value === 'no') {
      // If no individual cert value is stored but the overall status is Verified/Temporary,
      // show "Yes" so verified students don't incorrectly appear as missing certificates
      const resolvedOverall = overallStatus || editData?.certificates_status || selectedStudent?.certificates_status || '';
      if (resolvedOverall === 'Verified' || resolvedOverall === 'Temporary') return 'Yes';
      return 'No';
    }
    if (value === true || value === 'Yes' || value === 'yes') return 'Yes';
    return value; // Return the specific dropdown value like "Original"
  };

  // Update certificate status
  const updateCertificateStatus = (certKey, value) => {
    const newEditData = { ...editData };
    newEditData[certKey] = value;

    // Auto-update certificates_status based on all certificates
    const courseType = getCourseType(editData.course || selectedStudent?.course || '');

    if (courseType) {
      const certificates = getCertificatesForCourse(courseType);
      const type = courseType.toLowerCase();

      let allFilled = true;
      let hasTemporary = false;

      certificates.forEach(cert => {
        const certValue = cert.key === certKey ? value : newEditData[cert.key];
        const isPresent = certValue === true || certValue === 'Yes' || certValue === 'yes' ||
          (typeof certValue === 'string' && certValue.trim() !== '' && certValue.toLowerCase() !== 'no' && certValue.toLowerCase() !== 'pending');

        if (!isPresent) {
          allFilled = false;
        } else if (typeof certValue === 'string' && certValue.trim() !== '' && certValue !== 'Yes' && certValue !== 'yes') {
          // Look up the option type from certificate config
          const configCert = certificateConfig[type]?.find(c => c.id === cert.key);
          if (configCert && configCert.options && configCert.options.length > 0) {
            const matchedOption = configCert.options.find(opt => {
              const optVal = typeof opt === 'object' ? opt.value : opt;
              return optVal === certValue;
            });
            if (matchedOption && typeof matchedOption === 'object' && matchedOption.type === 'temporary') {
              hasTemporary = true;
            }
          }
        }
      });

      if (allFilled && certificates.length > 0) {
        if (hasTemporary) {
          newEditData.certificates_status = 'Temporary';
          newEditData.registration_status = 'Temporary';
        } else {
          newEditData.certificates_status = 'Verified';
        }
      } else {
        newEditData.certificates_status = 'Unverified';
      }
    }

    setEditData(newEditData);
  };

  // Calculate overall statistics
  const [stats, setStats] = useState({ total: 0, completed: 0, averageCompletion: 0 });

  const calculateOverallStats = useCallback(async () => {
    if (students.length === 0) {
      setStats({ total: 0, completed: 0, averageCompletion: 0 });
      return;
    }

    // Filter to only count Regular students
    const regularStudents = students.filter(student => {
      const status = student.student_status || student.student_data?.student_status || student.student_data?.['Student Status'];
      return status === 'Regular';
    });

    const totalStudents = regularStudents.length;
    let completedStudents = 0;
    let totalCompletion = 0;

    // Fetch completion percentages for all regular students in parallel
    const promises = regularStudents
      .filter(student => student.admission_number) // Only process students with admission numbers
      .map(async (student) => {
        const percentage = await getStudentCompletionPercentage(student.admission_number);
        return { percentage, admissionNumber: student.admission_number };
      });

    const results = await Promise.all(promises);

    results.forEach(result => {
      totalCompletion += result.percentage;
      if (result.percentage >= 80) {
        completedStudents++;
      }
    });

    const averageCompletion = totalStudents > 0 ? Math.round(totalCompletion / totalStudents) : 0;

    setStats({
      total: totalStudents,
      completed: completedStudents,
      averageCompletion
    });
  }, [students]);

  // Never show full-page loader - always show page structure
  // Only the table area will show loading state

  // If user somehow reaches this page without view permission, show a clean access message
  if (!canViewStudents) {
    return (
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Access to Student Database</h2>
          <p className="text-sm text-gray-600">
            You have view or edit access disabled for the Student Management module. Please contact an administrator if you need access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-2 sm:space-y-3 lg:space-y-2">
      <div className="flex flex-col gap-2">
        {/* Search Bar with Action Buttons Inline */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLocalSearch()}
              className="w-full pl-10 pr-4 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-xs touch-manipulation min-h-[36px]"
              placeholder="Search by name, admission no, PIN, or roll number..."
            />
          </div>
          <button
            onClick={handleLocalSearch}
            className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation min-h-[36px] text-xs font-medium whitespace-nowrap"
          >
            Search
          </button>
          {/* Action Buttons Inline - respect RBAC permissions */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {canAddStudent && (
              <Link
                to="/students/add"
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-blue-600 to-blue-700 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] whitespace-nowrap flex-shrink-0"
              >
                <Plus size={16} />
                <span>Add Student</span>
              </Link>
            )}

            {canBulkUploadStudents && (
              <button
                onClick={async () => {
                  await fetchForms();
                  setShowBulkStudentUpload(true);
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                disabled={loadingForms}
              >
                <Upload size={16} />
                <span>{loadingForms ? '...' : 'Bulk Upload'}</span>
              </button>
            )}

            {canUpdatePin && (
              <button
                onClick={() => setShowManualRollNumber(true)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-blue-600 to-blue-700 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] whitespace-nowrap flex-shrink-0"
              >
                <UserCog size={16} />
                <span>Update PIN</span>
              </button>
            )}

            {canDeleteStudents && (
              <button
                onClick={handleBulkDelete}
                disabled={selectedCount === 0 || bulkDeleteMutation.isPending}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-red-600 to-red-700 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
              >
                <Trash2 size={16} />
                <span>{bulkDeleteMutation.isPending ? '...' : `Delete (${selectedCount})`}</span>
              </button>
            )}

            {canUpdatePin && !isCashier && (
              <button
                onClick={handleBulkResendPasswords}
                disabled={selectedCount === 0 || bulkPasswordState.processing}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-teal-600 to-teal-700 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
              >
                <Key size={16} />
                <span>{bulkPasswordState.processing ? '...' : `Resend Pass`}</span>
              </button>
            )}

            {canExportStudents && (
              <button
                onClick={handleExportCSV}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 border border-transparent shadow-sm hover:shadow active:scale-95 transition-all duration-300 touch-manipulation min-h-[34px] whitespace-nowrap flex-shrink-0"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {students.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wider">Total Students</p>
                <p className="text-base font-bold text-blue-600 leading-tight">{totalStudents.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {filters.student_status === 'Regular' ? 'Regular' : 'Filtered'}
                </p>
              </div>
              <div className="bg-blue-50 p-1.5 rounded-lg">
                <Users className="text-blue-500" size={14} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wider">Profiles Done</p>
                <p className="text-base font-bold text-blue-600 leading-tight">{stats.completed}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% completion
                </p>
              </div>
              <div className="bg-blue-50 p-1.5 rounded-lg">
                <CheckCircle className="text-blue-500" size={14} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wider">Avg Completion</p>
                <p className="text-base font-bold text-blue-600 leading-tight">{stats.averageCompletion}%</p>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${stats.averageCompletion}%` }}
                  ></div>
                </div>
              </div>
              <div className="bg-blue-50 p-1.5 rounded-lg">
                <TrendingUp className="text-blue-500" size={14} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Section - Always Visible and Expandable */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="flex items-center gap-2 text-[11px] font-bold text-gray-700 uppercase tracking-wider hover:text-gray-900 transition-colors"
            >
              <Filter size={14} />
              <span>Filters</span>
              {filtersExpanded ? (
                <ChevronUp size={14} className="text-gray-500" />
              ) : (
                <ChevronDown size={14} className="text-gray-500" />
              )}
            </button>
            <div className="flex items-center gap-3">
              {!filtersExpanded && Object.keys(filters).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Active:</span>
                  {Object.entries(filters).map(([key, value]) => {
                    if (!value) return null;
                    const displayKey = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, l => l.toUpperCase());
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded"
                      >
                        {displayKey}: {value}
                      </span>
                    );
                  })}
                </div>
              )}
              {(Object.keys(filters).length > 0 || searchTerm) && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>
        {filtersExpanded && (
          <div className="px-2.5 py-2 border-t border-gray-200">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">College</label>
                <select
                  value={filters.college || ''}
                  onChange={(e) => handleFilterChange('college', e.target.value)}
                  disabled={collegesLoading}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">All</option>
                  {colleges.filter(c => c.isActive !== false).map((college) => (
                    <option key={college.id} value={college.name}>{college.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Level</label>
                <select
                  value={filters.level || ''}
                  onChange={(e) => handleFilterChange('level', e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="diploma">Diploma</option>
                  <option value="ug">UG</option>
                  <option value="pg">PG</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Batch</label>
                <select
                  value={filters.batch || ''}
                  onChange={(e) => handleFilterChange('batch', e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(quickFilterOptions.batches || []).map((batch) => (
                    <option key={batch} value={batch.id || batch}>{batch.name || batch}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Program</label>
                <select
                  value={filters.course || ''}
                  onChange={(e) => handleFilterChange('course', e.target.value)}
                  onFocus={(e) => {
                    // When user focuses on course dropdown, fetch all courses for selected college
                    // Pass excludeField='course' so it excludes course filter but keeps college filter
                    // This ensures all courses are available when changing from one course to another
                    const filtersForFetch = { ...filters };
                    // Temporarily remove course to get all courses for the college
                    if (filtersForFetch.course) {
                      delete filtersForFetch.course;
                    }
                    fetchQuickFilterOptions(filtersForFetch, 'course').catch(err => {
                      console.warn('Failed to refresh course options:', err);
                    });
                  }}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(quickFilterOptions.courses || [])
                    .filter(course => {
                      // Filter by level if level is selected
                      if (filters.level) {
                        const courseInfo = coursesWithLevels.find(c => c.name === course);
                        return courseInfo?.level === filters.level;
                      }
                      return true;
                    })
                    .map((course) => (
                      <option key={course.id || course} value={course.id || course}>{course.name || course}</option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Branch</label>
                <select
                  value={filters.branch || ''}
                  onChange={(e) => handleFilterChange('branch', e.target.value)}
                  onFocus={(e) => {
                    // When user focuses on branch dropdown, fetch all branches for selected course
                    // Pass excludeField='branch' so it excludes branch filter but keeps course/college filters
                    // This ensures all branches are available when changing from one branch to another
                    const filtersForFetch = { ...filters };
                    // Temporarily remove branch to get all branches for the course
                    if (filtersForFetch.branch) {
                      delete filtersForFetch.branch;
                    }
                    fetchQuickFilterOptions(filtersForFetch, 'branch').catch(err => {
                      console.warn('Failed to refresh branch options:', err);
                    });
                  }}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(quickFilterOptions.branches || []).map((branch) => (
                    <option key={branch} value={branch.id || branch}>{branch.name || branch}</option>
                  ))}
                </select>
              </div>
              {filters.course && filters.branch && filterBranchHasSections && (
                <div className="flex flex-col">
                  <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Section</label>
                  <select
                    value={filters.section || ''}
                    onChange={(e) => handleFilterChange('section', e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All</option>
                    {(quickFilterOptions.sections || []).map((section) => (
                      <option key={section} value={section.id || section}>{section.name || section}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Quota</label>
                <select
                  value={filters.stud_type || ''}
                  onChange={(e) => handleFilterChange('stud_type', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.stud_type || []).map((type) => (
                    <option key={type} value={type.id || type}>{type.name || type}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Status</label>
                <select
                  value={filters.student_status || ''}
                  onChange={(e) => handleFilterChange('student_status', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.student_status || []).map((status) => (
                    <option key={status} value={status.id || status}>{status.name || status}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Scholar Status</label>
                <select
                  value={filters.scholar_status || ''}
                  onChange={(e) => handleFilterChange('scholar_status', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {SCHOLARSHIP_STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {showMeritColumn && (
                <div className="flex flex-col">
                  <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Merit Status</label>
                  <select
                    value={filters.merit_status || ''}
                    onChange={(e) => handleFilterChange('merit_status', e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All</option>
                    {MERIT_STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Category</label>
                <select
                  value={filters.category_id || ''}
                  onChange={(e) => handleFilterChange('category_id', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.category_id || []).map((catId) => {
                    const cat = casteCategories.find(c => String(c.id) === String(catId));
                    return (
                      <option key={catId} value={catId}>{cat ? cat.name : catId}</option>
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Gender</label>
                <select
                  value={filters.gender || ''}
                  onChange={(e) => handleFilterChange('gender', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.gender || []).map((gender) => (
                    <option key={gender} value={gender.id || gender}>{gender.name || gender}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Fee Status</label>
                <select
                  value={filters.fee_status || ''}
                  onChange={(e) => handleFilterChange('fee_status', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Registration Status</label>
                <select
                  value={filters.registration_status || ''}
                  onChange={(e) => handleFilterChange('registration_status', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="temporary">Temporary</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Year</label>
                <select
                  value={filters.year || ''}
                  onChange={(e) => handleFilterChange('year', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(quickFilterOptions.years || []).map((year) => (
                    <option key={year} value={year.id || year}>{year.name || year}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Semester</label>
                <select
                  value={filters.semester || ''}
                  onChange={(e) => handleFilterChange('semester', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(quickFilterOptions.semesters || []).map((sem) => (
                    <option key={sem} value={sem.id || sem}>{sem.name || sem}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Remarks</label>
                <select
                  value={filters.remarks || ''}
                  onChange={(e) => handleFilterChange('remarks', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.remarks || []).map((remark) => (
                    <option key={remark} value={remark.id || remark}>{remark.name || remark}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">District</label>
                <select
                  value={filters.district || ''}
                  onChange={(e) => handleFilterChange('district', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.district || []).map((district) => (
                    <option key={district} value={district.id || district}>{district.name || district}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Mandal</label>
                <select
                  value={filters.mandal_name || ''}
                  onChange={(e) => handleFilterChange('mandal_name', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {(dropdownFilterOptions.mandal_name || []).map((mandal) => (
                    <option key={mandal} value={mandal.id || mandal}>{mandal.name || mandal}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {tableLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <SkeletonStudentsTable rows={pageSize || 10} />
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-gray-400" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No students found</h3>
            <p className="text-gray-600">
              {Object.keys(filters).length > 0 || searchTerm
                ? 'No students match the current filters. Try adjusting your search criteria.'
                : 'There are no student records in the database yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative flex flex-col">
          {/* Table Container */}
          <div className="flex-1 overflow-auto no-scrollbar">
            {/* Sleek non-blocking top progress bar when table is fetching */}
            {tableFetching && (
              <div className="absolute top-0 inset-x-0 h-1 bg-indigo-100/70 overflow-hidden z-30 pointer-events-none">
                <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 shimmer-progress-bar w-1/2 rounded-full shadow-sm" />
              </div>
            )}
            {/* Desktop Table View - Responsive Container */}
            <div className="hidden lg:block responsive-table-container">
              <table className="w-full responsive-table" style={{ tableLayout: 'auto' }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-1 px-1.5 text-xs font-semibold text-gray-700 text-center w-10 sticky left-0 bg-gray-50 z-20 border-r border-gray-200">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                        disabled={students.length === 0 || bulkDeleteMutation.isPending}
                        checked={isAllSelected}
                        onChange={(e) => toggleSelectAllStudents(e.target.checked)}
                      />
                    </th>
                    {canViewField('student_photo') && (
                      <th className="py-2 px-1.5 text-[10px] font-semibold text-gray-700 text-left min-w-[40px] sticky left-10 bg-gray-50 z-20 border-r border-gray-200">
                        <div className="font-semibold">Photo</div>
                      </th>
                    )}
                    {canViewField('student_name') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[80px]">
                        <div className="font-semibold truncate">Student Name</div>
                      </th>
                    )}
                    {canViewField('pin_no') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[40px]">
                        <button
                          onClick={() => handleSort('pinNumber')}
                          className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                        >
                          <div className="font-semibold truncate">PIN</div>
                        </button>
                      </th>
                    )}
                    {canViewField('admission_number') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[50px]">
                        <div className="font-semibold truncate">Adm No</div>
                      </th>
                    )}
                    {canViewField('batch') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left">
                        <div className="font-semibold">Batch</div>
                      </th>
                    )}
                    {canViewField('college') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[80px]">
                        <div className="font-semibold truncate">College</div>
                      </th>
                    )}
                    {canViewField('course') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left">
                        <div className="font-semibold">Program</div>
                      </th>
                    )}
                    {canViewField('branch') && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[60px]">
                        <div className="font-semibold truncate">Branch</div>
                      </th>
                    )}
                    {showSectionColumn && (
                      <th className="py-2 px-1 text-[10px] font-semibold text-gray-700 text-left max-w-[48px]">
                        <div className="font-semibold truncate">Section</div>
                      </th>
                    )}
                    {!isCashier && (
                      <>
                        {canViewField('stud_type') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                            <div className="font-semibold">Quota</div>
                          </th>
                        )}
                        {canViewField('caste') && (
                          <>
                            <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                              <div className="font-semibold">Category</div>
                            </th>
                            <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                              <div className="font-semibold">Caste</div>
                            </th>
                          </>
                        )}
                        {canViewField('gender') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                            <div className="font-semibold">Gen</div>
                          </th>
                        )}
                        {canViewField('student_status') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left max-w-[120px]">
                            <div className="font-semibold">Status</div>
                          </th>
                        )}
                        {canViewField('certificates_status') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left max-w-[120px]">
                            <div className="font-semibold">Certs</div>
                          </th>
                        )}
                      </>
                    )}
                    {canViewField('fee_status') && (
                      <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                        <div className="font-semibold">Fees</div>
                      </th>
                    )}
                    {canViewField('current_year') && (
                      <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                        <div className="font-semibold">Yr</div>
                      </th>
                    )}
                    {canViewField('current_semester') && (
                      <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                        <div className="font-semibold">Sem</div>
                      </th>
                    )}
                    {!isCashier && (
                      <>
                        {canViewField('scholar_status') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left max-w-[120px]">
                            <div className="font-semibold">Scholar</div>
                          </th>
                        )}
                        {showMeritColumn && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left max-w-[120px]">
                            <div className="font-semibold">Merit</div>
                          </th>
                        )}
                        {canViewField('registration_status') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                            <div className="font-semibold">Reg</div>
                          </th>
                        )}
                        {canViewField('remarks') && (
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left max-w-[120px]">
                            <div className="font-semibold">Remarks</div>
                          </th>
                        )}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((student, index) => {
                    return (
                      <tr
                        key={student.admission_number}
                        style={{ animationDelay: `${Math.min(index, 25) * 22}ms` }}
                        className="border-b border-gray-100 hover:bg-indigo-50/40 transition-colors cursor-pointer row-cascade"
                        onClick={(e) => {
                          // Don't trigger view modal if interacting with inputs/selects/inline editors
                          if (
                            e.target.type === 'checkbox' ||
                            e.target.closest('input[type="checkbox"]') ||
                            e.target.closest('select') ||
                            e.target.closest('input') ||
                            e.target.closest('textarea')
                          ) {
                            return;
                          }
                          if (!isCashier) {
                            handleViewDetails(student);
                          } else if (canAddRemarks || canManageRemarks) {
                            // Cashiers with remarks permission can open the modal on the History tab
                            setSelectedStudent(student);
                            setActiveStudentTab('history');
                            setHistorySubTab('remarks');
                            setShowModal(true);
                          }
                        }}
                      >
                        <td className="py-1 px-1.5 text-center sticky left-0 bg-white z-10 border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                            disabled={bulkDeleteMutation.isPending}
                            checked={selectedAdmissionNumbers.has(student.admission_number)}
                            onChange={() => toggleSelectStudent(student.admission_number)}
                          />
                        </td>
                        {canViewField('student_photo') && (
                          <td className="py-1 px-1.5 sticky left-10 bg-white z-10 border-r border-gray-200">
                            <div className="flex items-center justify-center mx-auto">
                              <StudentAvatar
                                admissionNumber={student.admission_number}
                                studentName={student.student_name}
                                className="w-7 h-7"
                              />
                            </div>
                          </td>
                        )}
                        {canViewField('student_name') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-900 leading-tight max-w-[80px]">
                            <div className="truncate font-medium" title={student.student_name}>
                              {student.student_name || '-'}
                            </div>
                          </td>
                        )}
                        {canViewField('pin_no') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-600">
                            {student.pin_no ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200/80 shadow-[0_1px_2px_rgba(16,185,129,0.06)]">
                                {student.pin_no}
                              </span>
                            ) : (
                              <span className="text-gray-300 font-medium">-</span>
                            )}
                          </td>
                        )}
                        {canViewField('admission_number') && (
                          <td className="py-1.5 px-1 text-[10px] font-bold text-gray-900 font-mono tracking-tight">{student.admission_number || '-'}</td>
                        )}
                        {canViewField('batch') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700 font-medium">{student.batch || '-'}</td>
                        )}
                        {canViewField('college') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700 max-w-[80px]">
                            <div className="truncate" title={student.college}>
                              {student.college || '-'}
                            </div>
                          </td>
                        )}
                        {canViewField('course') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700">{student.course || '-'}</td>
                        )}
                        {canViewField('branch') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700 max-w-[60px]">
                            <div className="truncate" title={student.branch}>
                              {student.branch || '-'}
                            </div>
                          </td>
                        )}
                        {showSectionColumn && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700 font-semibold">
                            {student.section || '-'}
                          </td>
                        )}
                        {!isCashier && (
                          <>
                            {canViewField('stud_type') && (
                              <td className="py-1.5 px-1 text-[10px] text-gray-700">
                                {student.stud_type ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100/90 text-slate-700 text-[9px] font-bold uppercase tracking-wider">
                                    {student.stud_type}
                                  </span>
                                ) : '-'}
                              </td>
                            )}
                            {canViewField('caste') && (
                              <>
                                <td className="py-1.5 px-1 text-[10px] text-gray-700 max-w-[70px]">
                                  <div className="truncate font-medium" title={resolveStudentCaste(student).categoryName || ''}>
                                    {resolveStudentCaste(student).categoryName || '-'}
                                  </div>
                                </td>
                                <td className="py-1.5 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                  <div className="max-w-[80px]">
                                    {(() => {
                                      const display = resolveStudentCaste(student);
                                      const studentKey = student.id || student.admission_number || student.admissionNumber;
                                      const isEditing =
                                        canEditStudents &&
                                        canEditField('caste') &&
                                        !isFieldFrozen(student, 'caste') &&
                                        editingCell?.studentId === studentKey &&
                                        editingCell?.field === 'caste';

                                      if (isEditing) {
                                        return renderEditableCell(
                                          student,
                                          'caste',
                                          'select',
                                          buildCasteSelectOptions(
                                            dynamicCasteOptions,
                                            display.linked ? display.casteName : ''
                                          )
                                        );
                                      }

                                      return (
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (canEditStudents && canEditField('caste') && !isFieldFrozen(student, 'caste')) {
                                              const startValue = display.linked
                                                ? (display.casteName || '')
                                                : '';
                                              handleCellClick(student, 'caste', startValue, 'select');
                                            }
                                          }}
                                          className={`${canEditStudents && canEditField('caste') && !isFieldFrozen(student, 'caste') ? 'cursor-pointer hover:bg-blue-50' : ''} px-1 py-0.5 rounded truncate`}
                                          title={
                                            display.linked
                                              ? (display.casteName || '')
                                              : 'Pick a caste under the category (optional)'
                                          }
                                        >
                                          {display.linked ? (display.casteName || '-') : '-'}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </>
                            )}
                            {canViewField('gender') && (
                              <td className="py-1.5 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                {renderEditableCell(student, 'gender', 'select', ['M', 'F', 'Other'])}
                              </td>
                            )}
                            {canViewField('student_status') && (
                              <td className="py-1.5 px-1 text-[10px] text-gray-700 max-w-[100px] truncate" onClick={(e) => e.stopPropagation()}>
                                {renderEditableCell(student, 'student_status', 'select', STUDENT_STATUS_OPTIONS)}
                              </td>
                            )}
                            {canViewField('certificates_status') && (
                              <td className="py-1.5 px-1 text-[10px] text-gray-700 max-w-[100px] truncate">
                                {student.certificates_status || 'Pending'}
                              </td>
                            )}
                          </>
                        )}
                        {canViewField('fee_status') && (
                          <td className="py-1.5 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                            {renderEditableCell(student, 'fee_status', 'select', FEE_STATUS_OPTIONS)}
                          </td>
                        )}
                        {canViewField('current_year') && (
                          <td className="py-1.5 px-1 text-[10px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                              Y{student.current_year || 1}
                            </span>
                          </td>
                        )}
                        {canViewField('current_semester') && (
                          <td className="py-1.5 px-1 text-[10px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                              S{student.current_semester || 1}
                            </span>
                          </td>
                        )}
                        {(!isCashier || canAddRemarks || canManageRemarks) && (
                          <>
                            {canViewField('scholar_status') && !isCashier && (
                              <td
                                className="py-1 px-1 text-[10px] text-gray-700 max-w-[100px] truncate capitalize"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewDetails(student, 'scholarship');
                                }}
                              >
                                <div
                                  className="px-2 py-1 rounded hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer capitalize"
                                  title="Open scholarship details"
                                >
                                  {formatScholarshipStatusDisplay(student.scholar_status)}
                                </div>
                              </td>
                            )}
                            {showMeritColumn && (
                              <td
                                className="py-1 px-1 text-[10px] text-gray-700 max-w-[120px] truncate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canViewMeritStatus) {
                                    handleViewDetails(student, 'merit_status');
                                  }
                                }}
                              >
                                <div
                                  className={`px-2 py-1 rounded transition-colors ${
                                    canViewMeritStatus ? 'cursor-pointer' : ''
                                  } ${
                                    student.merit_status === 'yes'
                                      ? 'text-green-700 hover:bg-green-50'
                                      : student.merit_status === 'no'
                                        ? 'text-red-700 hover:bg-red-50'
                                        : 'text-gray-500 hover:bg-amber-50 hover:text-amber-700'
                                  }`}
                                  title={canViewMeritStatus ? 'Open merit status' : 'Merit status'}
                                >
                                  {formatMeritStatusDisplay(student.merit_status)}
                                </div>
                              </td>
                            )}
                            {canViewField('registration_status') && !isCashier && (
                              <td className="py-1 px-1 text-[10px]">
                                <span className={`inline-flex px-1.5 py-0.5 rounded ${getRegistrationStatusBadgeClass(student.registration_status)}`}>
                                  {formatRegistrationStatusLabel(student.registration_status)}
                                </span>
                              </td>
                            )}
                            {canViewField('remarks') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700 max-w-[120px] truncate" onClick={(e) => {
                                e.stopPropagation();
                                handleViewHistory(student);
                              }}>
                                <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors cursor-pointer border border-transparent hover:border-blue-100 min-h-[28px]">
                                  <MessageSquare size={12} className="text-blue-500 shrink-0" />
                                  <span className="truncate max-w-[80px]" title={student.remarks || 'View Remarks'}>
                                    {student.remarks || <span className="text-gray-400 italic">No remarks</span>}
                                  </span>
                                </div>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3 p-3 sm:p-4">
              {sortedStudents.map((student, index) => {
                return (
                  <div
                    key={student.admission_number}
                    style={{ animationDelay: `${Math.min(index, 25) * 25}ms` }}
                    className="bg-white border border-gray-200/90 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:border-indigo-200 row-cascade"
                  >
                    <div className="p-4 space-y-3">
                      {/* Header with Photo and Checkbox */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded mt-1"
                            disabled={bulkDeleteMutation.isPending}
                            checked={selectedAdmissionNumbers.has(student.admission_number)}
                            onChange={() => toggleSelectStudent(student.admission_number)}
                          />
                        </div>
                        {canViewField('student_photo') && (
                          <div className="flex-shrink-0">
                            <StudentAvatar
                              admissionNumber={student.admission_number}
                              studentName={student.student_name}
                              className="w-16 h-16"
                              iconSize={32}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0" onClick={() => !isCashier && handleViewDetails(student)}>
                          {canViewField('student_name') && (
                            <h3 className="font-semibold text-gray-900 text-base truncate">{student.student_name || '-'}</h3>
                          )}
                          {canViewField('admission_number') && (
                            <p className="text-sm text-gray-600 mt-1">{student.admission_number || '-'}</p>
                          )}
                          {canViewField('pin_no') && student.pin_no && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium mt-1">
                              PIN: {student.pin_no}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Key Information Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                        {canViewField('batch') && (
                          <div>
                            <p className="text-xs text-gray-500">Batch</p>
                            <p className="text-sm font-medium text-gray-900">{student.batch || '-'}</p>
                          </div>
                        )}
                        {canViewField('college') && (
                          <div>
                            <p className="text-xs text-gray-500">College</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={student.college || ''}>{student.college || '-'}</p>
                          </div>
                        )}
                        {canViewField('course') && (
                          <div>
                            <p className="text-xs text-gray-500">Program</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={student.course || ''}>{student.course || '-'}</p>
                          </div>
                        )}
                        {canViewField('branch') && (
                          <div>
                            <p className="text-xs text-gray-500">Branch</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={student.branch || ''}>{student.branch || '-'}</p>
                          </div>
                        )}
                        {showSectionColumn && (
                          <div>
                            <p className="text-xs text-gray-500">Section</p>
                            <p className="text-sm font-medium text-gray-900">{student.section || '-'}</p>
                          </div>
                        )}
                        {!isCashier && (
                          <>
                            {canViewField('caste') && (
                              <div>
                                <p className="text-xs text-gray-500">Category / Caste</p>
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {(() => {
                                    const display = resolveStudentCaste(student);
                                    if (display.categoryName && display.casteName) {
                                      return `${display.categoryName} / ${display.casteName}`;
                                    }
                                    return display.categoryName || display.legacyCaste || '-';
                                  })()}
                                </p>
                              </div>
                            )}
                            {canViewField('gender') && (
                              <div>
                                <p className="text-xs text-gray-500">Gender</p>
                                <p className="text-sm font-medium text-gray-900 truncate" title={student.gender || ''}>{student.gender || '-'}</p>
                              </div>
                            )}
                            {canViewField('student_status') && (
                              <div>
                                <p className="text-xs text-gray-500">Status</p>
                                <p className="text-sm font-medium text-gray-900 truncate" title={student.student_status || ''}>{student.student_status || '-'}</p>
                              </div>
                            )}
                          </>
                        )}

                        {canViewField('fee_status') && (
                          <div>
                            <p className="text-xs text-gray-500">Fee Status</p>
                            <p className="text-sm font-medium text-gray-900">{student.fee_status || 'pending'}</p>
                          </div>
                        )}
                        {(canViewField('current_year') || canViewField('current_semester')) && (
                          <div>
                            <p className="text-xs text-gray-500">Year/Sem</p>
                            <p className="text-sm font-medium text-gray-900">
                              {canViewField('current_year') ? (student.current_year || '-') : '?'}
                              /
                              {canViewField('current_semester') ? (student.current_semester || '-') : '?'}
                            </p>
                          </div>
                        )}

                        {!isCashier && (
                          <>
                            {canViewField('scholar_status') && (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewDetails(student, 'scholarship');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleViewDetails(student, 'scholarship');
                                  }
                                }}
                                className="rounded-lg p-1 -m-1 hover:bg-purple-50 cursor-pointer"
                                title="Open scholarship details"
                              >
                                <p className="text-xs text-gray-500">Scholar Status</p>
                                <p className="text-sm font-medium text-gray-900 truncate" title={formatScholarshipStatusDisplay(student.scholar_status)}>
                                  {formatScholarshipStatusDisplay(student.scholar_status)}
                                </p>
                              </div>
                            )}
                            {showMeritColumn && (
                              <div
                                role={canViewMeritStatus ? 'button' : undefined}
                                tabIndex={canViewMeritStatus ? 0 : undefined}
                                onClick={(e) => {
                                  if (!canViewMeritStatus) return;
                                  e.stopPropagation();
                                  handleViewDetails(student, 'merit_status');
                                }}
                                onKeyDown={(e) => {
                                  if (!canViewMeritStatus) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleViewDetails(student, 'merit_status');
                                  }
                                }}
                                className={`rounded-lg p-1 -m-1 ${canViewMeritStatus ? 'hover:bg-amber-50 cursor-pointer' : ''}`}
                                title={canViewMeritStatus ? 'Open merit status' : 'Merit status'}
                              >
                                <p className="text-xs text-gray-500">Merit Status</p>
                                <p className={`text-sm font-medium truncate ${
                                  student.merit_status === 'yes'
                                    ? 'text-green-700'
                                    : student.merit_status === 'no'
                                      ? 'text-red-700'
                                      : 'text-gray-900'
                                }`}>
                                  {formatMeritStatusDisplay(student.merit_status)}
                                </p>
                              </div>
                            )}
                            {canViewField('registration_status') && (
                              <div>
                                <p className="text-xs text-gray-500">Registration Status</p>
                                <p className={`text-sm font-medium inline-flex px-2 py-0.5 rounded ${getRegistrationStatusBadgeClass(student.registration_status)}`}>
                                  {formatRegistrationStatusLabel(student.registration_status)}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Action Button */}
                      {!isCashier && (
                        <button
                          onClick={() => handleViewDetails(student)}
                          className="w-full mt-2 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation font-medium text-sm"
                        >
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 border-t border-gray-100">
            <div className="text-[11px] text-gray-600">
              {totalStudents === 0
                ? 'No students to display'
                : `Showing ${showingFrom.toLocaleString()}-${showingTo.toLocaleString()} of ${totalStudents.toLocaleString()}`}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <label className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-600">
                <span className="hidden sm:inline">Rows per page</span>
                <span className="sm:hidden">Per page</span>
                <select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="px-1.5 py-0.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-[11px] touch-manipulation min-h-[28px] sm:min-h-[32px]"
                  disabled={filtersLoading}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option.id || option}>{option.name || option}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={isFirstPage || totalStudents === 0}
                  className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[32px] font-semibold"
                >
                  Previous
                </button>
                <span className="text-[10px] sm:text-[11px] text-gray-600 px-1 text-center whitespace-nowrap font-medium">
                  Page {Math.min(currentPage, totalPages).toLocaleString()} of {totalPages.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={isLastPage || totalStudents === 0}
                  className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[32px] font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && selectedStudent && createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[999999] p-2 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            // Close modal when clicking on backdrop
            if (e.target === e.currentTarget) {
              setShowModal(false);
              setActiveStudentTab('details');
            }
          }}
          onWheel={(e) => {
            // Prevent scrolling on backdrop
            e.stopPropagation();
          }}
        >
          <div
            className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-[min(94vw,1240px)] max-h-[96vh] flex flex-col overflow-hidden border border-white/40 animate-scale-in font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Banner Section */}
            <div className="bg-white border-b border-gray-100 p-4 sm:p-5 flex flex-col gap-3 shrink-0 relative shadow-2xs">
              {/* Top Row: Breadcrumb & Right Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                  <span>Students</span>
                  <span>&rsaquo;</span>
                  <span className="text-gray-900 font-extrabold">Student Profile</span>
                </div>

                <div className="flex items-center gap-2.5">
                  {!editMode && canEditStudents && !isCashier && (!frozenBatches[selectedStudent?.batch]?.includes("ALL") && !frozenBatches[selectedStudent?.student_data?.batch]?.includes("ALL")) && (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-200 active:scale-95"
                    >
                      <Edit size={14} />
                      <span>Edit Profile</span>
                    </button>
                  )}
                  {editMode && (
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-200 active:scale-95"
                    >
                      <Check size={14} />
                      <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  )}

                  {/* ... More Actions Dropdown */}
                  {!editMode && (
                    <div className="relative">
                      <button
                        onClick={() => setShowMoreActions(!showMoreActions)}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                      >
                        <MoreHorizontal size={14} />
                        <span>More Actions</span>
                        <ChevronDown size={12} />
                      </button>

                      {showMoreActions && (
                        <div
                          className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[100] animate-fade-in text-xs font-semibold text-gray-700"
                          onClick={() => setShowMoreActions(false)}
                        >
                          {!isCashier && (
                            <button
                              onClick={handleResetPassword}
                              className="w-full text-left px-4 py-2.5 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2 transition-colors"
                            >
                              <RefreshCw size={14} className={resettingPassword ? 'animate-spin text-orange-500' : ''} />
                              <span>Reset Password</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const svgEl = document.querySelector(`#student-qr-${selectedStudent.admission_number} svg`);
                              if (svgEl) {
                                const serializer = new XMLSerializer();
                                const svgStr = serializer.serializeToString(svgEl);
                                const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `QR_${selectedStudent.admission_number}.svg`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } else {
                                toast.error('QR code generator initialized');
                              }
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                          >
                            <Download size={14} />
                            <span>Download QR Code</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveStudentTab('id_card');
                              setShowIdCardPreview(true);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-purple-50 hover:text-purple-600 flex items-center gap-2 transition-colors"
                          >
                            <CreditCard size={14} />
                            <span>View Digital ID Card</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (editMode) {
                        setEditMode(false);
                      } else {
                        setShowModal(false);
                        setActiveStudentTab('details');
                      }
                    }}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-all active:scale-95"
                    title="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Bottom Row: Student Profile Overview Banner */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 sm:gap-5">
                  {/* Photo Container - CIRCULAR PHOTO */}
                  <div
                    onClick={() => {
                      setShowPhotoViewer(true);
                    }}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-100 border-2 border-indigo-200 overflow-hidden shrink-0 relative group shadow-md flex items-center justify-center cursor-pointer hover:border-blue-500 transition-all"
                  >
                    {editData.student_photo && editData.student_photo !== '{}' && editData.student_photo !== null && editData.student_photo !== '' ? (
                      <img
                        src={getStaticFileUrlDirect(editData.student_photo)}
                        alt="Profile"
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <User size={32} />
                      </div>
                    )}
                    {(editMode || canEditField('student_photo')) && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white rounded-full">
                        <Camera size={18} />
                      </div>
                    )}
                  </div>

                  {/* Main Details Info Header (Merged Subtitle & College) */}
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                      {editData.student_name || selectedStudent?.student_name || 'Student Name'}
                    </h2>

                    <p className="text-xs sm:text-sm font-bold text-gray-600 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded-md text-xs font-black">{editData.pin_no || selectedStudent?.pin_no || selectedStudent?.roll_number || selectedStudent?.admission_number}</span>
                      <span className="text-gray-300 font-bold">|</span>
                      <span>{editData.course || selectedStudent?.course || 'Program'} - {editData.branch || selectedStudent?.branch || 'Branch'}</span>
                      <span className="text-gray-300 font-bold">|</span>
                      <span>Year {editData.current_year || selectedStudent?.current_year || 1} &bull; Semester {editData.current_semester || selectedStudent?.current_semester || 1}</span>
                      <span className="text-gray-300 font-bold">|</span>
                      <span className="text-indigo-700 font-extrabold">{editData.college || selectedStudent?.college || 'Pydah College of Engineering'}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100/90 text-emerald-800 border border-emerald-300 shadow-2xs">
                        <CheckCircle size={14} strokeWidth={2.5} className="text-emerald-700" /> Regular
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-purple-100/90 text-purple-800 border border-purple-300 shadow-2xs">
                        <Award size={14} strokeWidth={2.5} className="text-purple-700" /> {editData.stud_type || selectedStudent?.stud_type || 'Quota'}
                      </span>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black">
                        <span>Profile {profileCompletion.percentage}% Complete</span>
                        <div className="w-16 bg-emerald-200 rounded-full h-2 overflow-hidden shadow-inner">
                          <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${profileCompletion.percentage}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Completion Alert Banner */}
            {profileCompletion.percentage < 100 && (
              <div className="mx-6 mt-3 p-3 bg-orange-50/90 border border-orange-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-extrabold text-gray-900">Profile completion is {profileCompletion.percentage}%</span>
                    <span className="text-gray-300 font-bold">|</span>
                    <span className="font-semibold text-gray-600">{profileCompletion.missingFields?.length || 0} fields are missing</span>
                    <div className="flex flex-wrap gap-1.5 ml-2">
                      {profileCompletion.missingFields?.slice(0, 4).map((f) => (
                        <span key={f} className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-orange-800 border border-orange-200 shadow-2xs">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {!editMode && canEditStudents && !isCashier && (
                  <button
                    onClick={handleEdit}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition-all shadow-md shadow-orange-200 flex items-center gap-1 shrink-0 active:scale-95"
                  >
                    <span>Complete Profile</span>
                    <span>&rarr;</span>
                  </button>
                )}
              </div>
            )}

            {/* Tabs Navigation Bar */}
            <div className="bg-white border-b border-gray-200/80 px-6 shrink-0 shadow-2xs mt-2">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                <button
                  onClick={() => setActiveStudentTab('details')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeStudentTab === 'details'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <User size={15} />
                  <span>Overview</span>
                </button>

                {canViewField('registration_status') && (
                  <button
                    onClick={() => setActiveStudentTab('registration')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      activeStudentTab === 'registration'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <GraduationCap size={15} />
                    <span>Registration</span>
                  </button>
                )}

                {canViewAttendance && (
                  <button
                    onClick={() => setActiveStudentTab('attendance')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      activeStudentTab === 'attendance'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Calendar size={15} />
                    <span>Attendance</span>
                  </button>
                )}

                {canViewScholarship && (
                  <button
                    onClick={() => setActiveStudentTab('scholarship')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      activeStudentTab === 'scholarship'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <CreditCard size={15} />
                    <span>Fees & Scholarship</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveStudentTab('transport_hostel')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeStudentTab === 'transport_hostel'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Bus size={15} />
                  <span>Transport/Hostel</span>
                </button>

                {canViewSms && (
                  <button
                    onClick={() => setActiveStudentTab('sms_tracking')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      activeStudentTab === 'sms_tracking'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <MessageSquare size={15} />
                    <span>Communication</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveStudentTab('id_card')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeStudentTab === 'id_card'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <CreditCard size={15} />
                  <span>ID Card</span>
                </button>

                <button
                  onClick={() => setActiveStudentTab('history')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeStudentTab === 'history'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <History size={15} />
                  <span>History</span>
                </button>

                <button
                  onClick={() => setActiveStudentTab('parent_activity')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeStudentTab === 'parent_activity'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Eye size={15} />
                  <span>Parent Activity</span>
                </button>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Overview Tab (4 Cards per row Grid Layout) */}
              {activeStudentTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Student Identity */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <User size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Student Identity</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Admission No</span>
                            <span className="font-extrabold text-gray-900 font-mono">{selectedStudent?.admission_number || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Roll Number</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.pin_no || ''}
                                onChange={(e) => updateEditField('pin_no', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-extrabold text-gray-900 font-mono">{editData.pin_no || selectedStudent?.pin_no || '-'}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Date of Birth</span>
                            {editMode ? (
                              <input
                                type="date"
                                value={editData.dob ? editData.dob.split('T')[0] : ''}
                                onChange={(e) => updateEditField('dob', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right"
                              />
                            ) : (
                              <span className="font-bold text-gray-900">{formatDate(editData.dob || selectedStudent?.dob)}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Mobile Number</span>
                            {editMode ? (
                              <input
                                type="tel"
                                value={editData.student_mobile || ''}
                                onChange={(e) => updateEditField('student_mobile', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <div className="flex items-center gap-1 font-mono font-bold text-gray-900">
                                <span>
                                  {revealedMobiles['student_mobile']
                                    ? (editData.student_mobile || selectedStudent?.student_mobile || '-')
                                    : maskMobileNumber(editData.student_mobile || selectedStudent?.student_mobile || '-')}
                                </span>
                                {(editData.student_mobile || selectedStudent?.student_mobile) && (
                                  <button onClick={() => toggleRevealMobile('student_mobile')} className="text-blue-600 p-0.5 hover:bg-blue-50 rounded">
                                    {revealedMobiles['student_mobile'] ? <EyeOff size={11} /> : <Eye size={11} />}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Aadhaar No</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.adhar_no || ''}
                                onChange={(e) => updateEditField('adhar_no', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-extrabold text-gray-900 font-mono">{editData.adhar_no || selectedStudent?.adhar_no || '-'}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">APAAR ID</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.apaar_id || ''}
                                onChange={(e) => updateEditField('apaar_id', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-extrabold text-indigo-600 font-mono">{editData.apaar_id || selectedStudent?.apaar_id || selectedStudent?.student_data?.apaar_id || '-'}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Gender</span>
                            {editMode ? (
                              <select
                                value={editData.gender || ''}
                                onChange={(e) => updateEditField('gender', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold"
                              >
                                <option value="">Select</option>
                                <option value="M">Male</option>
                                <option value="F">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            ) : (
                              <span className="font-bold text-gray-900">{editData.gender === 'M' ? 'Male' : editData.gender === 'F' ? 'Female' : editData.gender || selectedStudent?.gender || '-'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Academic Information */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <GraduationCap size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Academic Info</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">College</span>
                            <span className="font-bold text-gray-900 truncate max-w-[120px]" title={editData.college || selectedStudent?.college}>{editData.college || selectedStudent?.college || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Program</span>
                            <span className="font-bold text-gray-900">{editData.course || selectedStudent?.course || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Branch</span>
                            <span className="font-bold text-gray-900">{editData.branch || selectedStudent?.branch || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Year / Sem</span>
                            <span className="font-bold text-gray-900">{editData.current_year || selectedStudent?.current_year || 1} / {editData.current_semester || selectedStudent?.current_semester || 1}</span>
                          </div>
                          {(studentBranchHasSections || getStudentSection(editData, selectedStudent)) && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500 font-semibold">Section</span>
                              {editMode ? (
                                studentSectionOptions && studentSectionOptions.length > 0 ? (
                                  <select
                                    value={getStudentSection(editData, selectedStudent) || ''}
                                    onChange={(e) => updateEditField('section', e.target.value)}
                                    className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right"
                                  >
                                    <option value="">Select Section</option>
                                    {studentSectionOptions.map((sec) => (
                                      <option key={sec} value={sec}>{sec}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={editData.section !== undefined ? editData.section : (editData.Section !== undefined ? editData.Section : (selectedStudent?.section || ''))}
                                    onChange={(e) => updateEditField('section', e.target.value)}
                                    placeholder="e.g. A"
                                    className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-24"
                                  />
                                )
                              ) : (
                                <span className="font-bold text-gray-900">{getStudentSection(editData, selectedStudent) || '-'}</span>
                              )}
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Quota</span>
                            <span className="font-bold text-gray-900">{editData.stud_type || selectedStudent?.stud_type || 'Regular'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Status</span>
                            <span className="font-bold text-emerald-600 capitalize">{editData.student_status || selectedStudent?.student_status || 'Regular'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Quick Status */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <Activity size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Quick Status</h3>
                          </div>
                        </div>

                        <div className="space-y-2.5 text-[11px]">
                          <div>
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-gray-500 font-semibold">Attendance</span>
                              <span className="font-bold text-emerald-600">87%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '87%' }}></div>
                            </div>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Fee Status</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {selectedStudent?.fee_status || 'No Due'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Scholarship</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active ({selectedStudent?.stud_type || 'LSPOT'})
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Merit Status</span>
                            <span className="text-gray-400 font-bold">{formatMeritStatusDisplay(selectedStudent?.merit_status)}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">ID Card</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Issued
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Parent / Guardian Information */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <Phone size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Parent / Guardian</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-orange-600 hover:text-orange-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Father Name</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.father_name || ''}
                                onChange={(e) => updateEditField('father_name', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-bold text-gray-900 truncate max-w-[120px]">{editData.father_name || selectedStudent?.father_name || '-'}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Father Mobile</span>
                            {editMode ? (
                              <input
                                type="tel"
                                value={editData.parent_mobile1 || ''}
                                onChange={(e) => updateEditField('parent_mobile1', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <div className="flex items-center gap-1 font-mono font-bold text-gray-900">
                                <span>
                                  {revealedMobiles['parent_mobile1']
                                    ? (editData.parent_mobile1 || selectedStudent?.parent_mobile1 || '-')
                                    : maskMobileNumber(editData.parent_mobile1 || selectedStudent?.parent_mobile1 || '-')}
                                </span>
                                {(editData.parent_mobile1 || selectedStudent?.parent_mobile1) && (
                                  <button onClick={() => toggleRevealMobile('parent_mobile1')} className="text-orange-600 p-0.5 hover:bg-orange-50 rounded">
                                    {revealedMobiles['parent_mobile1'] ? <EyeOff size={11} /> : <Eye size={11} />}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Mother Name</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.mother_name !== undefined ? editData.mother_name : (selectedStudent?.student_data?.mother_name || selectedStudent?.mother_name || '')}
                                onChange={(e) => updateEditField('mother_name', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-bold text-gray-900 truncate max-w-[120px]">{editData.mother_name || selectedStudent?.student_data?.mother_name || selectedStudent?.mother_name || '-'}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Mother Mobile</span>
                            {editMode ? (
                              <input
                                type="tel"
                                value={editData.parent_mobile2 || ''}
                                onChange={(e) => updateEditField('parent_mobile2', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <div className="flex items-center gap-1 font-mono font-bold text-gray-900">
                                <span>
                                  {revealedMobiles['parent_mobile2']
                                    ? (editData.parent_mobile2 || selectedStudent?.parent_mobile2 || '-')
                                    : maskMobileNumber(editData.parent_mobile2 || selectedStudent?.parent_mobile2 || '-')}
                                </span>
                                {(editData.parent_mobile2 || selectedStudent?.parent_mobile2) && (
                                  <button onClick={() => toggleRevealMobile('parent_mobile2')} className="text-orange-600 p-0.5 hover:bg-orange-50 rounded">
                                    {revealedMobiles['parent_mobile2'] ? <EyeOff size={11} /> : <Eye size={11} />}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Preferred Mobile</span>
                            {editMode ? (
                              <select
                                value={editData.preferred_parent_mobile || (selectedStudent?.preferred_parent_mobile || selectedStudent?.student_data?.preferred_parent_mobile || 'father')}
                                onChange={(e) => updateEditField('preferred_parent_mobile', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="father">Father Number</option>
                                <option value="mother">Mother Number</option>
                              </select>
                            ) : (
                              <div className="flex items-center gap-1 font-mono font-bold text-gray-900">
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-sans font-semibold border border-amber-200">
                                  {(editData.preferred_parent_mobile || selectedStudent?.preferred_parent_mobile || selectedStudent?.student_data?.preferred_parent_mobile) === 'mother' ? 'Mother Number' : 'Father Number'}
                                </span>
                                <span>
                                  {(() => {
                                    const pref = editData.preferred_parent_mobile || selectedStudent?.preferred_parent_mobile || selectedStudent?.student_data?.preferred_parent_mobile || 'father';
                                    const key = pref === 'mother' ? 'parent_mobile2' : 'parent_mobile1';
                                    const val = editData[key] !== undefined ? editData[key] : (selectedStudent?.[key] || selectedStudent?.student_data?.[key] || '-');
                                    return val !== '-' ? (revealedMobiles[key] ? val : maskMobileNumber(val)) : '-';
                                  })()}
                                </span>
                                {(() => {
                                  const pref = editData.preferred_parent_mobile || selectedStudent?.preferred_parent_mobile || selectedStudent?.student_data?.preferred_parent_mobile || 'father';
                                  const key = pref === 'mother' ? 'parent_mobile2' : 'parent_mobile1';
                                  const val = editData[key] !== undefined ? editData[key] : (selectedStudent?.[key] || selectedStudent?.student_data?.[key] || '');
                                  return val ? (
                                    <button onClick={() => toggleRevealMobile(key)} className="text-amber-600 p-0.5 hover:bg-amber-50 rounded">
                                      {revealedMobiles[key] ? <EyeOff size={11} /> : <Eye size={11} />}
                                    </button>
                                  ) : null;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Second Row of Cards (Address & Demographics + Recent Activity) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {/* Card 5: Address & Demographics */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <MapPin size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Address & Demographics</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-gray-500 font-semibold shrink-0">Address</span>
                            {editMode ? (
                              <textarea
                                value={editData.student_address || ''}
                                onChange={(e) => updateEditField('student_address', e.target.value)}
                                className="w-full px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right"
                                rows={2}
                              />
                            ) : (
                              <span className="font-bold text-gray-900 text-right truncate max-w-[130px]" title={editData.student_address || selectedStudent?.student_address}>
                                {editData.student_address || selectedStudent?.student_address || '-'}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">City / Village</span>
                            <span className="font-bold text-gray-900">{editData.city_village || selectedStudent?.city_village || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">District</span>
                            <span className="font-bold text-gray-900">{editData.district || selectedStudent?.district || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">State</span>
                            <span className="font-bold text-gray-900">{editData.mandal_name || selectedStudent?.mandal_name || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Category / Caste</span>
                            <span className="font-bold text-gray-900">
                              {resolveStudentCaste(selectedStudent).categoryName || resolveStudentCaste(selectedStudent).legacyCaste || '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 6: Recent Activity */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <History size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Recent Activity</h3>
                          </div>
                          <button
                            onClick={() => setActiveStudentTab('history')}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <span>View All</span>
                            <span>&rarr;</span>
                          </button>
                        </div>

                        <div className="space-y-2.5 text-[11px]">
                          <div className="flex items-start gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0"></div>
                            <div>
                              <p className="font-extrabold text-gray-900">Profile updated</p>
                              <p className="text-[10px] font-semibold text-gray-400">Recent record synced</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0"></div>
                            <div>
                              <p className="font-extrabold text-gray-900">Admission verified</p>
                              <p className="text-[10px] font-semibold text-gray-400">Core parameters confirmed</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-purple-500 mt-1 shrink-0"></div>
                            <div>
                              <p className="font-extrabold text-gray-900">Account active</p>
                              <p className="text-[10px] font-semibold text-gray-400">Credentials created</p>
                            </div>
                          </div>

                          {/* Hidden QR container */}
                          {selectedStudent?.admission_number && (
                            <div id={`student-qr-${selectedStudent.admission_number}`} className="hidden">
                              <QRCodeSVG
                                value={`${window.location.origin}/qr/${activeQrToken || selectedStudent.qr_token || selectedStudent.admission_number}`}
                                size={120}
                                level="M"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card 7: Admission & Summary */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <Award size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Admission & Summary</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Overall Status</span>
                            {editMode ? (
                              <select
                                value={editData.certificates_status || selectedStudent?.certificates_status || 'Pending'}
                                onChange={(e) => updateEditField('certificates_status', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold bg-white focus:ring-1 focus:ring-teal-500 outline-none"
                              >
                                <option value="Verified">Verified</option>
                                <option value="Unverified">Unverified</option>
                                <option value="Temporary">Temporary</option>
                                <option value="Pending">Pending</option>
                                <option value="Partial">Partial</option>
                                <option value="Originals Returned">Originals Returned</option>
                                <option value="Not Required">Not Required</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${getCertificateBadgeClass(editData.certificates_status || selectedStudent?.certificates_status)}`}>
                                {editData.certificates_status || selectedStudent?.certificates_status || 'Pending'}
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Scholarship</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.scholar_status || ''}
                                onChange={(e) => updateEditField('scholar_status', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right w-28"
                              />
                            ) : (
                              <span className="font-bold text-gray-900 capitalize">
                                {editData.scholar_status || selectedStudent?.scholar_status || 'Regular'}
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-semibold">Admission Date</span>
                            {editMode ? (
                              <input
                                type="date"
                                value={editData.admission_date ? editData.admission_date.split('T')[0] : ''}
                                onChange={(e) => updateEditField('admission_date', e.target.value)}
                                className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold bg-white"
                              />
                            ) : (
                              <span className="font-bold text-gray-900 font-mono">
                                {formatDate(editData.admission_date || selectedStudent?.admission_date)}
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-start gap-2">
                            <span className="text-gray-500 font-semibold shrink-0">Previous College</span>
                            {editMode ? (
                              <input
                                type="text"
                                value={editData.previous_college || ''}
                                onChange={(e) => updateEditField('previous_college', e.target.value)}
                                className="w-full px-1.5 py-0.5 border border-gray-300 rounded text-[11px] font-bold text-right"
                              />
                            ) : (
                              <span className="font-bold text-gray-900 text-right truncate max-w-[130px]" title={editData.previous_college || selectedStudent?.previous_college}>
                                {editData.previous_college || selectedStudent?.previous_college || '-'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 8: Program Certificates Checklist */}
                    <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-sm transition-all p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                              <CheckCircle size={15} />
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900">Certificates Checklist</h3>
                          </div>
                          {!editMode && canEditStudents && !isCashier && (
                            <button onClick={handleEdit} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                              <Edit size={11} /> Edit
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 text-[11px]">
                          {(() => {
                            const courseLvl = getCourseType(selectedStudent?.course || selectedStudent?.student_data?.course) || 'UG';
                            const certList = getCertificatesForCourse(courseLvl);

                            if (!certList || certList.length === 0) {
                              return (
                                <div className="text-gray-400 italic text-center py-2">
                                  No certificates configured.
                                </div>
                              );
                            }

                            return certList.map((cert) => {
                              const rawVal = getCertificateValue(editMode ? editData : selectedStudent, cert);
                              const isSubmitted = isCertificatePresent(rawVal);

                              let selectedCertVal = editData[cert.key] !== undefined ? editData[cert.key] : rawVal;

                              // Normalize value to standard options
                              let currentCertVal = 'No';
                              if (selectedCertVal === true || selectedCertVal === 'true' || selectedCertVal === 'yes' || selectedCertVal === 'Yes' || selectedCertVal === 'Submitted' || selectedCertVal === 'Verified') {
                                currentCertVal = 'Yes';
                              } else if (typeof selectedCertVal === 'string' && selectedCertVal.toLowerCase() === 'original') {
                                currentCertVal = 'Original';
                              } else if (typeof selectedCertVal === 'string' && selectedCertVal.toLowerCase() === 'temporary') {
                                currentCertVal = 'Temporary';
                              } else if (selectedCertVal === false || selectedCertVal === 'false' || selectedCertVal === 'no' || selectedCertVal === 'No' || selectedCertVal === 'Pending') {
                                currentCertVal = 'No';
                              } else if (selectedCertVal) {
                                currentCertVal = String(selectedCertVal);
                              } else if (isSubmitted) {
                                currentCertVal = 'Yes';
                              }

                              const standardOptions = ['Yes', 'No', 'Original', 'Temporary'];
                              const showExtraOption = !standardOptions.includes(currentCertVal);

                              return (
                                <div
                                  key={cert.key}
                                  className="flex items-center justify-between gap-1 py-1 border-b border-gray-100 last:border-0"
                                >
                                  <span className="font-semibold text-gray-700 truncate max-w-[120px]" title={cert.label}>
                                    {cert.label}
                                  </span>

                                  {editMode ? (
                                    <select
                                      value={currentCertVal}
                                      onChange={(e) => updateEditField(cert.key, e.target.value)}
                                      className="text-[10px] font-bold border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:ring-1 focus:ring-emerald-500 outline-none shrink-0"
                                    >
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                      <option value="Original">Original</option>
                                      <option value="Temporary">Temporary</option>
                                      {showExtraOption && (
                                        <option value={currentCertVal}>{currentCertVal}</option>
                                      )}
                                    </select>
                                  ) : (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 border ${getCertificateBadgeClass(currentCertVal)}`}
                                    >
                                      {currentCertVal}
                                    </span>
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Informational Banner (Image 2 style) */}
                  <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <Info size={18} />
                      </div>
                      <div>
                        <p className="font-extrabold">Additional Information</p>
                        <p className="text-gray-600 font-medium">View student's documents, examination records, fee history and more in respective tabs.</p>
                      </div>
                    </div>
                    <span className="text-gray-500 font-medium text-[11px] shrink-0">
                      For any data corrections, please use Edit Profile or contact the Academic Office.
                    </span>
                  </div>
                </div>
              )}

              {/* Other Tabs Rendering (Keep exact functionality) */}
              {activeStudentTab === 'registration' && canViewField('registration_status') && (() => {
                const studentData = selectedStudent.student_data || {};
                const currentYear = selectedStudent.current_year || studentData.current_year;
                const currentSem = selectedStudent.current_semester || studentData.current_semester;

                const isStudentVerified = isStudentMobileVerifiedForCycle(studentData, currentYear, currentSem);
                const isParentVerified = isParentMobileVerifiedForCycle(studentData, currentYear, currentSem);
                const isVerificationComplete = isVerificationCompleteForCycle(studentData, currentYear, currentSem);

                const certStatus = (selectedStudent.certificates_status || studentData.certificates_status || '').toLowerCase();
                const isCertComplete = isCertificatesStatusComplete(certStatus);

                const feeStatus = (selectedStudent.fee_status || studentData.fee_status || '').toLowerCase();
                const isFeeComplete = ['no due', 'no_due', 'permitted', 'completed', 'nodue'].some(s => feeStatus.includes(s));

                const isPromotionComplete = isPromotionCompleteForCycle(studentData, currentYear, currentSem);

                const optSet = new Set(Array.isArray(regOptionalStages) ? regOptionalStages : []);
                const programYear = resolveRegistrationBranchYear(
                  selectedStudent.branch || studentData.branch,
                  selectedStudent.current_year || studentData.current_year
                );
                const isScholarshipOptional = optSet.has('scholarship');

                const scholarStatus = getRegistrationScholarshipStatus(scholarshipData, { ...selectedStudent, ...studentData }, regOptionalStages, registrationStageConfig);
                const scholarshipCtx = resolveRegistrationScholarshipDisplay(scholarshipData, { ...selectedStudent, ...studentData }, regOptionalStages, registrationStageConfig);
                const isScholarshipComplete = scholarshipCtx.satisfied;

                const registrationStages = computeRegistrationStageDisplays({ ...selectedStudent, ...studentData }, scholarshipData, regOptionalStages, registrationStageConfig);
                const resolvedOverallStatus = resolveRegistrationOverallStatus(registrationStages.overallStatus, selectedStudent.registration_status);
                const isRegistrationComplete = resolvedOverallStatus === 'completed';
                const isRegistrationTemporary = resolvedOverallStatus === 'Temporary';

                const studentMobile = selectedStudent.student_mobile || studentData.student_mobile;
                const parentMobile = selectedStudent.parent_mobile1 || studentData.parent_mobile1;
                const canVerifyMobile = canViewField('registration_status');

                const StatusBadge = ({ completed, optional = false, text }) => {
                  const display = completed ? 'Completed' : (text ? formatScholarshipStatusDisplay(text) : '—');
                  return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      completed ? 'bg-green-100 text-green-800' : optional ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {display}
                      {optional && !completed && <span className="text-[10px] opacity-75">(optional)</span>}
                    </span>
                  );
                };

                return (
                  <div className="space-y-6">
                    <div className={`rounded-2xl p-6 border ${
                      isRegistrationComplete ? 'bg-green-50 border-green-200' : isRegistrationTemporary ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 shadow-sm'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">Registration Status</h3>
                          <p className="text-sm text-gray-500 mt-1">Overall registration completion based on all stages</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl font-bold text-base flex items-center gap-2 ${
                          isRegistrationComplete ? 'bg-green-200 text-green-800' : isRegistrationTemporary ? 'bg-amber-200 text-amber-800' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {isRegistrationComplete ? <><CheckCircle size={20} /> Completed</> : isRegistrationTemporary ? <><AlertTriangle size={20} /> Temporary</> : 'Pending'}
                        </div>
                      </div>
                    </div>

                    {/* Registration Stages Stepper Indicator (5 Stages) */}
                    <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs overflow-x-auto">
                      <div className="flex items-center justify-between min-w-[580px] max-w-4xl mx-auto relative">
                        {/* Step 1 Indicator */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                            isVerificationComplete ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-900 text-white ring-4 ring-slate-100'
                          }`}>
                            {isVerificationComplete ? <CheckCircle size={18} strokeWidth={2.5} /> : <span>1</span>}
                          </div>
                          <span className="text-[11px] font-extrabold text-gray-900">Stage 1</span>
                          <span className="text-[9px] font-bold text-gray-500">Mobile Verification</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isVerificationComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isVerificationComplete ? 'Completed' : 'Pending'}
                          </span>
                        </div>

                        {/* Connector 1 -> 2 */}
                        <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-gray-200">
                          <div className={`h-full transition-all duration-500 ${isVerificationComplete ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                        </div>

                        {/* Step 2 Indicator */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                            isCertComplete ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-900 text-white ring-4 ring-slate-100'
                          }`}>
                            {isCertComplete ? <CheckCircle size={18} strokeWidth={2.5} /> : <span>2</span>}
                          </div>
                          <span className="text-[11px] font-extrabold text-gray-900">Stage 2</span>
                          <span className="text-[9px] font-bold text-gray-500">Certificate Status</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isCertComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isCertComplete ? 'Completed' : (certStatus || 'Pending')}
                          </span>
                        </div>

                        {/* Connector 2 -> 3 */}
                        <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-gray-200">
                          <div className={`h-full transition-all duration-500 ${isCertComplete && isFeeComplete ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                        </div>

                        {/* Step 3 Indicator */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                            isFeeComplete ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-900 text-white ring-4 ring-slate-100'
                          }`}>
                            {isFeeComplete ? <CheckCircle size={18} strokeWidth={2.5} /> : <span>3</span>}
                          </div>
                          <span className="text-[11px] font-extrabold text-gray-900">Stage 3</span>
                          <span className="text-[9px] font-bold text-gray-500">Fee Payment</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isFeeComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isFeeComplete ? 'Completed' : (feeStatus || 'Pending')}
                          </span>
                        </div>

                        {/* Connector 3 -> 4 */}
                        <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-gray-200">
                          <div className={`h-full transition-all duration-500 ${isFeeComplete && isScholarshipComplete ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                        </div>

                        {/* Step 4 Indicator */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                            isScholarshipComplete ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-900 text-white ring-4 ring-slate-100'
                          }`}>
                            {isScholarshipComplete ? <CheckCircle size={18} strokeWidth={2.5} /> : <span>4</span>}
                          </div>
                          <span className="text-[11px] font-extrabold text-gray-900">Stage 4</span>
                          <span className="text-[9px] font-bold text-gray-500">Scholarship Status</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isScholarshipComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isScholarshipComplete ? 'Completed' : (scholarStatus || 'Pending')}
                          </span>
                        </div>

                        {/* Connector 4 -> 5 */}
                        <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-gray-200">
                          <div className={`h-full transition-all duration-500 ${isScholarshipComplete && isPromotionComplete ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                        </div>

                        {/* Step 5 Indicator */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                            isPromotionComplete ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-slate-900 text-white ring-4 ring-slate-100'
                          }`}>
                            {isPromotionComplete ? <CheckCircle size={18} strokeWidth={2.5} /> : <span>5</span>}
                          </div>
                          <span className="text-[11px] font-extrabold text-gray-900">Stage 5</span>
                          <span className="text-[9px] font-bold text-gray-500">Academic Promotion</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isPromotionComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isPromotionComplete ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">Registration Stage Details</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {/* Stage 1: Mobile Verification */}
                      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl shrink-0 bg-blue-600 text-white shadow-xs">
                                <MessageSquare size={18} />
                              </div>
                              <div>
                                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Stage 1</span>
                                <h5 className="font-extrabold text-sm text-gray-900 mt-0.5">Mobile Verification</h5>
                              </div>
                            </div>
                            <StatusBadge completed={isVerificationComplete} optional={optSet.has('verification')} />
                          </div>

                          <p className="text-xs text-gray-500">Send OTP to student or parent mobile for this semester</p>

                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Student Mobile:</span>
                              <span className={`font-bold flex items-center gap-1 ${isStudentVerified ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {isStudentVerified ? <CheckCircle size={13} /> : <X size={13} />}
                                {studentMobile || 'No number'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Parent Mobile:</span>
                              <span className={`font-bold flex items-center gap-1 ${isParentVerified ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {isParentVerified ? <CheckCircle size={13} /> : <X size={13} />}
                                {parentMobile || 'No number'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {canVerifyMobile && (
                          <button
                            type="button"
                            onClick={() => setShowVerificationModal(true)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-xs active:scale-95"
                          >
                            <Shield size={14} />
                            {isVerificationComplete ? 'View / Re-verify' : 'Verify with OTP'}
                          </button>
                        )}
                      </div>

                      {/* Stage 2: Certificate Status */}
                      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl shrink-0 bg-purple-600 text-white shadow-xs">
                                <FileText size={18} />
                              </div>
                              <div>
                                <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Stage 2</span>
                                <h5 className="font-extrabold text-sm text-gray-900 mt-0.5">Certificate Status</h5>
                              </div>
                            </div>
                            <StatusBadge completed={isCertComplete} optional={optSet.has('certificates')} text={certStatus} />
                          </div>

                          <p className="text-xs text-gray-500">Verification of student certificates & credentials</p>

                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Current Status:</span>
                              <span className="font-extrabold text-gray-900 capitalize">{certStatus || 'Pending'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Requirement:</span>
                              <span className="font-semibold text-gray-600">{optSet.has('certificates') ? 'Optional' : 'Mandatory'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stage 3: Fee Payment */}
                      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl shrink-0 bg-amber-600 text-white shadow-xs">
                                <CreditCard size={18} />
                              </div>
                              <div>
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Stage 3</span>
                                <h5 className="font-extrabold text-sm text-gray-900 mt-0.5">Fee Payment</h5>
                              </div>
                            </div>
                            <StatusBadge completed={isFeeComplete} optional={optSet.has('fee')} text={feeStatus} />
                          </div>

                          <p className="text-xs text-gray-500">Tuition & fee payment status verification</p>

                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Fee Clearance:</span>
                              <span className="font-extrabold text-gray-900 capitalize">{feeStatus || 'Pending'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Requirement:</span>
                              <span className="font-semibold text-gray-600">{optSet.has('fee') ? 'Optional' : 'Mandatory'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stage 4: Scholarship Status */}
                      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl shrink-0 bg-teal-600 text-white shadow-xs">
                                <Award size={18} />
                              </div>
                              <div>
                                <span className="bg-teal-100 text-teal-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Stage 4</span>
                                <h5 className="font-extrabold text-sm text-gray-900 mt-0.5">Scholarship Status</h5>
                              </div>
                            </div>
                            <StatusBadge completed={isScholarshipComplete} optional={isScholarshipOptional} text={scholarStatus} />
                          </div>

                          <p className="text-xs text-gray-500">Scholarship registration and entitlement verification</p>

                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Scholarship Status:</span>
                              <span className="font-extrabold text-gray-900 capitalize">{scholarStatus || 'Pending'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Requirement:</span>
                              <span className="font-semibold text-gray-600">{isScholarshipOptional ? 'Optional' : 'Mandatory'}</span>
                            </div>
                          </div>
                        </div>

                        {canViewScholarship && (
                          <button
                            type="button"
                            onClick={() => setActiveStudentTab('scholarship')}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-xs active:scale-95"
                          >
                            <Award size={14} />
                            Manage Scholarship
                          </button>
                        )}
                      </div>

                      {/* Stage 5: Academic Promotion */}
                      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl shrink-0 bg-indigo-600 text-white shadow-xs">
                                <GraduationCap size={18} />
                              </div>
                              <div>
                                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Stage 5</span>
                                <h5 className="font-extrabold text-sm text-gray-900 mt-0.5">Academic Promotion</h5>
                              </div>
                            </div>
                            <StatusBadge completed={isPromotionComplete} optional={optSet.has('promotion')} />
                          </div>

                          <p className="text-xs text-gray-500">Yearly academic promotion & semester transition status</p>

                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Current Year / Sem:</span>
                              <span className="font-extrabold text-gray-900">{currentYear} Year / {currentSem} Sem</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 font-semibold">Promotion Status:</span>
                              <span className="font-semibold text-gray-600">{isPromotionComplete ? 'Promoted' : 'Pending'}</span>
                            </div>
                          </div>
                        </div>

                        {canViewMeritStatus && (
                          <button
                            type="button"
                            onClick={() => setActiveStudentTab('merit_status')}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-xs active:scale-95"
                          >
                            <GraduationCap size={14} />
                            View Merit & Promotion
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {activeStudentTab === 'attendance' && (
                <StudentAttendanceTab student={selectedStudent} />
              )}

              {activeStudentTab === 'sms_tracking' && (
                <StudentSmsTab student={selectedStudent} />
              )}

              {activeStudentTab === 'scholarship' && canViewScholarship && (
                <StudentScholarshipHistoryTab
                  student={selectedStudent}
                  readOnly={isCashier || !canEditScholarship}
                  registrationOptionalStages={regOptionalStages}
                  onUpdated={(data) => {
                    setScholarshipData(data);
                    const status = getCurrentScholarshipStatus(data, data?.student || selectedStudent);
                    setSelectedStudent((prev) => (prev ? {
                      ...prev,
                      scholar_status: status,
                      ...(data?.student?.caste ? { caste: data.student.caste } : {})
                    } : prev));
                  }}
                />
              )}

              {activeStudentTab === 'transport_hostel' && (
                <StudentTransportHostelTab student={selectedStudent} />
              )}

              {activeStudentTab === 'merit_status' && canViewMeritStatus && (
                <StudentMeritStatusTab
                  student={selectedStudent}
                  readOnly={isCashier || !canEditMeritStatus}
                  onUpdated={(data) => {
                    const currentYear = Math.max(1, Number(data?.currentYear || selectedStudent?.current_year) || 1);
                    const currentMerit = data?.years?.find(entry => Number(entry.student_year) === currentYear)?.merit_status || '';
                    setSelectedStudent((prev) => (prev ? { ...prev, merit_status: currentMerit } : prev));
                    invalidateStudents();
                  }}
                />
              )}

              {activeStudentTab === 'history' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col flex-1 min-h-[400px] overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-gray-50/50">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHistorySubTab('remarks')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          historySubTab === 'remarks' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-gray-500 hover:bg-white hover:text-blue-600'
                        }`}
                      >
                        <MessageSquare size={14} /> Remarks
                      </button>
                      <button
                        onClick={() => setHistorySubTab('audit')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          historySubTab === 'audit' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-gray-500 hover:bg-white hover:text-blue-600'
                        }`}
                      >
                        <History size={14} /> Edit History
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden p-4">
                    {historySubTab === 'remarks' ? (
                      <StudentRemarksContent student={selectedStudent} canAddRemarks={canAddRemarks} canManageRemarks={canManageRemarks} />
                    ) : (
                      <StudentHistoryLogs student={selectedStudent} />
                    )}
                  </div>
                </div>
              )}

              {activeStudentTab === 'id_card' && (() => {
                const getStudentDataForCard = (key) => {
                  if (!selectedStudent?.student_data) return '';
                  const dk = Object.keys(selectedStudent.student_data).find(k => k.toLowerCase() === key.toLowerCase());
                  const v = dk ? selectedStudent.student_data[dk] : undefined;
                  return v !== undefined && v !== null && v !== '' ? v : '';
                };

                const handleGeneratePrint = () => {
                  const runPrint = () => {
                    try {
                      printDigitalIdCard('.id-card-print-root');
                    } catch (err) {
                      console.error(err);
                      toast.error(err.message || 'Preview the ID card first, then print');
                    }
                  };
                  if (showIdCardPreview) {
                    runPrint();
                    return;
                  }
                  setShowIdCardPreview(true);
                  setTimeout(runPrint, 350);
                };

                return (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center gap-5">
                    <div className="flex items-center justify-between w-full max-w-md">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 font-bold">
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-900">Digital ID Card</h3>
                          <p className="text-xs text-gray-400">Print CR80 format</p>
                        </div>
                      </div>
                    </div>

                    {!showIdCardPreview ? (
                      <div className="w-full max-w-sm cursor-pointer group" onClick={() => setShowIdCardPreview(true)}>
                        <div className="rounded-2xl p-8 bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col items-center gap-4 text-center shadow-lg group-hover:scale-[1.02] transition-transform">
                          <CreditCard size={40} className="text-blue-400" />
                          <div>
                            <h4 className="font-extrabold text-base">{selectedStudent?.student_name}</h4>
                            <p className="text-xs text-gray-300 font-mono mt-1">{selectedStudent?.admission_number}</p>
                          </div>
                          <span className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md">Click to Preview Card</span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full flex justify-center">
                        <DigitalStudentCard student={selectedStudent} getStudentData={getStudentDataForCard} />
                        <button onClick={() => setShowIdCardPreview(false)} className="absolute top-2 right-2 p-2 bg-black/40 text-white rounded-full hover:bg-black/60">
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-3 w-full max-w-sm">
                      {!showIdCardPreview && (
                        <button onClick={() => setShowIdCardPreview(true)} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">
                          Preview Card
                        </button>
                      )}
                      <button onClick={handleGeneratePrint} className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800">
                        Generate Print
                      </button>
                    </div>
                  </div>
                );
              })()}

              {activeStudentTab === 'parent_activity' && selectedStudent?.id && (
                <ParentEngagementPanel studentId={selectedStudent.id} variant="tab" />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <StudentExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        filters={memoizedFilters}
        search={debouncedSearch}
        forms={forms}
        canViewField={(fieldKey) => (
          fieldKey === 'merit_status' ? showMeritColumn : canViewField(fieldKey)
        )}
        totalCount={totalStudents}
      />

      <BulkUploadModal
        isOpen={showBulkStudentUpload}
        onClose={() => setShowBulkStudentUpload(false)}
        forms={forms}
        isLoadingForms={loadingForms}
        onUploadComplete={() => {
          refreshStudents(1);
        }}
      />

      {/* Permit Modal */}
      {
        showPermitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Permit Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Permit Ending Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={permitEndingDate}
                    onChange={(e) => setPermitEndingDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    value={permitRemarks}
                    onChange={(e) => setPermitRemarks(e.target.value)}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    placeholder="Enter remarks for the permit"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowPermitModal(false);
                    setPendingFeeStatusChange(null);
                    setPendingPermitAdmissionNumber(null);
                    setPermitEndingDate('');
                    setPermitRemarks('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!permitEndingDate) {
                      toast.error('Please enter permit ending date');
                      return;
                    }
                    if (!permitRemarks || !permitRemarks.trim()) {
                      toast.error('Please enter permit remarks');
                      return;
                    }

                    // If this is from inline editing, save directly using the stored admission number
                    if (pendingFeeStatusChange === 'permitted' && pendingPermitAdmissionNumber) {
                      try {
                        await api.put(`/students/${pendingPermitAdmissionNumber}/fee-status`, {
                          fee_status: 'permitted',
                          permit_ending_date: permitEndingDate,
                          permit_remarks: permitRemarks
                        });
                        toast.success('Fee status updated successfully');
                        invalidateStudents();
                      } catch (error) {
                        toast.error(error.response?.data?.message || 'Failed to update fee status');
                      }
                      setEditingCell(null);
                      setCellEditValue('');
                    } else {
                      // Otherwise, this is from full student edit modal – just set status,
                      // handleSaveEdit will call the fee-status endpoint with permit data.
                      setEditFeeStatus('permitted');
                    }

                    setShowPermitModal(false);
                    setPendingFeeStatusChange(null);
                    setPendingPermitAdmissionNumber(null);
                  }}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )
      }

      <ManualRollNumberModal
        isOpen={showManualRollNumber}
        onClose={() => setShowManualRollNumber(false)}
        onUpdateComplete={() => refreshStudents()}
        initialFilters={{
          college: filters.college || '',
          course: filters.course || '',
          branch: filters.branch || '',
        }}
        colleges={colleges}
        coursesWithLevels={coursesWithLevels}
      />

      {/* Rejoin Modal */}
      <RejoinModal
        isOpen={showRejoinModal}
        onClose={() => {
          setShowRejoinModal(false);
          setRejoinStudent(null);
          // Reset the student status in editData back to original
          if (selectedStudent) {
            setEditData(prev => ({
              ...prev,
              student_status: selectedStudent.student_status
            }));
          }
        }}
        student={rejoinStudent}
        onRejoinComplete={(updatedStudent) => {
          // Refresh the student list
          invalidateStudents();
          // Close the modal
          setShowRejoinModal(false);
          setRejoinStudent(null);
          // Close the student details modal if it's open
          setShowModal(false);
          setEditMode(false);
          setSelectedStudent(null);
        }}
      />

      {/* Bulk Password Results Modal */}
      {
        bulkPasswordState.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Key size={24} className="text-teal-600" />
                Bulk Password Operations
              </h3>

              {bulkPasswordState.processing ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Processing password resets and sending SMS...</p>
                  <p className="text-xs text-gray-400 mt-2">Please do not close this window.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{bulkPasswordState.summary?.total}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{bulkPasswordState.summary?.success}</div>
                      <div className="text-xs text-green-600">Success</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{bulkPasswordState.summary?.failed}</div>
                      <div className="text-xs text-red-600">Failed</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-6">
                    <button
                      onClick={downloadBulkPasswordReport}
                      className="flex items-center justify-center gap-2 w-full py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                    >
                      <FileSpreadsheet size={18} />
                      Download Detailed Report
                    </button>
                    <button
                      onClick={() => setBulkPasswordState(prev => ({ ...prev, isOpen: false }))}
                      className="w-full py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      <StudentRemarksModal
        isOpen={showRemarksHistoryModal}
        onClose={() => setShowRemarksHistoryModal(false)}
        student={selectedStudent}
        canAddRemarks={canAddRemarks}
        canManageRemarks={canManageRemarks}
      />

      <MobileVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        student={selectedStudent}
        onVerificationComplete={handleVerificationComplete}
      />

      {/* Student Photo Full Viewer Modal */}
      {showPhotoViewer && createPortal(
        <div
          className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowPhotoViewer(false)}
        >
          <div
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
                  <Eye size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Student Photo</h3>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                    {editData.student_name || selectedStudent?.student_name || 'Student'}
                    {(editData.admission_number || selectedStudent?.admission_number || selectedStudent?.pin_no) && ` • ${editData.admission_number || selectedStudent?.admission_number || selectedStudent?.pin_no}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoViewer(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Photo Display */}
            <div className="p-6 flex flex-col items-center justify-center bg-slate-950/5">
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl overflow-hidden shadow-xl border-4 border-white bg-slate-900 flex items-center justify-center">
                {editData.student_photo && editData.student_photo !== '{}' && editData.student_photo !== null && editData.student_photo !== '' ? (
                  <img
                    src={getStaticFileUrlDirect(editData.student_photo)}
                    alt={editData.student_name || 'Student Photo'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                    <User size={64} />
                    <span className="text-xs font-semibold text-slate-400">No Photo Uploaded</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-4 border-t border-gray-100 bg-slate-50/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowPhotoViewer(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Close
              </button>

              {(editMode || canEditField('student_photo')) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoViewer(false);
                    setPhotoUploadTab('file');
                    setShowPhotoUploadModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95"
                >
                  <Camera size={14} />
                  Change Photo
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <StudentPhotoUploadModal
        isOpen={showPhotoUploadModal}
        onClose={() => setShowPhotoUploadModal(false)}
        student={selectedStudent}
        initialTab={photoUploadTab}
        onSuccess={(photoUrl) => {
          updateEditField('student_photo', photoUrl);
          setSelectedStudent((prev) => (prev ? { ...prev, student_photo: photoUrl } : prev));
          invalidateStudents();
        }}
      />
    </div >
  );
};

export default Students;
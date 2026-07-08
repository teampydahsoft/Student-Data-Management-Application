import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  GraduationCap
} from 'lucide-react';
import StudentAvatar from '../components/StudentAvatar';
import DigitalStudentCard from '../components/DigitalStudentCard';
import { Link, useLocation } from 'react-router-dom';
import api, { getStaticFileUrlDirect } from '../config/api';
import StudentAttendanceTab from '../components/Students/StudentAttendanceTab';
import ParentEngagementPanel from '../components/Students/ParentEngagementPanel';
import StudentSmsTab from '../components/Students/StudentSmsTab';
import toast from 'react-hot-toast';
import MobileVerificationModal from '../components/Students/MobileVerificationModal';
import StudentRemarksModal from '../components/Students/StudentRemarksModal';
import StudentRemarksContent from '../components/Students/StudentRemarksContent';
import StudentHistoryLogs from '../components/Students/StudentHistoryLogs';
import StudentScholarshipHistoryTab from '../components/Students/StudentScholarshipHistoryTab';
import StudentExportModal from '../components/Students/StudentExportModal';
import BulkRollNumberModal from '../components/BulkRollNumberModal';
import BulkUploadModal from '../components/BulkUploadModal';
import ManualRollNumberModal from '../components/ManualRollNumberModal';
import RejoinModal from '../components/RejoinModal';
import LoadingAnimation from '../components/LoadingAnimation';
import { SkeletonTable, SkeletonStudentsTable } from '../components/SkeletonLoader';
import { formatDate } from '../utils/dateUtils';
import {
  buildPartialStudentUpdatePayload,
  cloneStudentFormSnapshot,
  stripReadonlyStudentPayloadFields
} from '../utils/studentUpdatePayload';
import { QRCodeSVG } from 'qrcode.react';
import { useStudents, useUpdateStudent, useDeleteStudent, useBulkDeleteStudents, useInvalidateStudents } from '../hooks/useStudents';
import useStudentQuotas from '../hooks/useStudentQuotas';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission as hasModulePermission, USER_ROLES, hasModuleAccess, FRONTEND_MODULES } from '../constants/rbac';
import { certificateConfig as sharedCertificateConfig, getCourseType, getCertificatesForCourse } from '../config/certificateConfig';
import {
  SCHOLARSHIP_ELIGIBLE_OPTIONS,
  SCHOLARSHIP_STATUS_FILTER_OPTIONS,
  getCurrentScholarshipStatus,
  formatScholarshipStatusDisplay,
  isScholarshipRegistrationComplete
} from '../config/scholarshipConfig';
import {
  isVerificationCompleteForCycle,
  isStudentMobileVerifiedForCycle,
  isParentMobileVerifiedForCycle,
  isPromotionCompleteForCycle,
  REGISTRATION_EMPTY_DISPLAY
} from '../config/registrationCycle';
import { CASTE_OPTIONS } from '../config/casteConfig';

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
            <option key={opt} value={opt}>{opt}</option>
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
  const canDeleteStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'delete_student');
  const canUpdatePin = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'update_pin');
  const canExportStudents = hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'export');
  // SMS tab should be visible for super admin, admin, or users with view_sms permission
  const canViewSms = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view_sms');
  // Check if user has access to Attendance module
  const canViewAttendance = hasModuleAccess(userPermissions, FRONTEND_MODULES.ATTENDANCE);
  const canAddRemarks = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'add_remarks');
  const canManageRemarks = user?.role === 'super_admin' || user?.role === 'admin' || hasModulePermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'manage_remarks');

  const isCashier = user?.role === USER_ROLES.CASHIER;

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
  const [scholarshipData, setScholarshipData] = useState(null);
  const [scholarshipLoading, setScholarshipLoading] = useState(false);
  const [regOptionalStages, setRegOptionalStages] = useState([]); // optional stages for selected student's branch+year
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
    caste: [],
    gender: [],
    certificates_status: [],
    remarks: [],
    district: [],
    mandal_name: []
  });
  const [showBulkRollNumber, setShowBulkRollNumber] = useState(false);
  const [showManualRollNumber, setShowManualRollNumber] = useState(false);
  const [showBulkStudentUpload, setShowBulkStudentUpload] = useState(false);
  const [editingRollNumber, setEditingRollNumber] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
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

    // All student database fields
    const studentFields = [
      'admission_number', 'pin_no', 'stud_type', 'student_name', 'student_status',
      'scholar_status', 'student_mobile', 'parent_mobile1', 'parent_mobile2',
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
    const totalYears = Number(branchObj?.totalYears || courseObj.totalYears) || 4;

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
  }, [selectedStudent?.admission_number]);

  const fetchScholarshipForStudent = useCallback(async (admissionNumber) => {
    if (!admissionNumber) {
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
  }, []);

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
                  setRegOptionalStages(yearData[String(currentYear)]?.optionalStages || []);
                } else {
                  setRegOptionalStages([]);
                }
              } catch {
                setRegOptionalStages([]);
              }
            } else {
              setRegOptionalStages([]);
            }
          }
        } catch (error) {
          console.error("Failed to fetch full student details:", error);
        }
      }
    };

    fetchFullDetails();
    fetchScholarshipForStudent(selectedStudent?.admission_number);
  }, [showModal, selectedStudent?.admission_number, fetchScholarshipForStudent]);

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
      { key: 'student_name', altKeys: ['Student Name', 'studentname'] },
      { key: 'pin_no', altKeys: ['Pin Number', 'PIN Number', 'roll_no', 'roll_number'] },
      { key: 'dob', altKeys: ['DOB (Date of Birth - DD-MM-YYYY)', 'DOB (Date-Month-Year) Ex: 09-Sep-2003)', 'date_of_birth'] },
      { key: 'adhar_no', altKeys: ['ADHAR No', 'aadhar_no', 'aadhaar_no'] },
      { key: 'father_name', altKeys: ['Father Name', 'fathername'] },
      { key: 'gender', altKeys: ['M/F', 'Gender'] },
      { key: 'caste', altKeys: ['Caste'] },

      // Academic Fields
      { key: 'admission_number', altKeys: ['Admission Number', 'Admission No', 'admission_no'] },
      { key: 'course', altKeys: ['Program', 'Program Name'] },
      { key: 'branch', altKeys: ['Branch', 'Branch Name'] },
      { key: 'batch', altKeys: ['Batch'] },
      { key: 'college', altKeys: ['College', 'College Name'] },
      { key: 'stud_type', altKeys: ['StudType', 'Student Type', 'student_type'] },
      { key: 'current_year', altKeys: ['Current Academic Year', 'Current Year', 'Year'] },
      { key: 'current_semester', altKeys: ['Current Semester', 'Semester', 'Semister'] },
      { key: 'admission_date', altKeys: ['Admission Date', 'admission_date'] },

      // Parent Information
      { key: 'parent_mobile1', altKeys: ['Parent Mobile Number 1', 'Parent Mobile 1', 'parent_mobile_1'] },
      { key: 'parent_mobile2', altKeys: ['Parent Mobile Number 2', 'Parent Mobile 2', 'parent_mobile_2'] },

      // Address Fields
      { key: 'student_address', altKeys: ['Student Address (D.No, Str name, Village, Mandal, Dist)', 'Student Address', 'address'] },
      { key: 'city_village', altKeys: ['City/Village', 'City/Village Name', 'city_village_name'] },
      { key: 'mandal_name', altKeys: ['Mandal Name', 'Mandal', 'mandal'] },
      { key: 'district', altKeys: ['District', 'District Name'] },

      // Administrative Fields
      { key: 'student_status', altKeys: ['Student Status', 'studentstatus'] },
      { key: 'scholar_status', altKeys: ['Scholar Status', 'scholarstatus'] },
      { key: 'certificates_status', altKeys: ['Certificates Status', 'Certificate Status', 'certificatesstatus'] },
      { key: 'previous_college', altKeys: ['Previous College Name', 'Previous College', 'previouscollege'] },
      { key: 'remarks', altKeys: ['Remarks', 'remark'] },

      // Photo
      { key: 'student_photo', altKeys: ['Student Photo', 'photo', 'studentphoto'] }
    ];

    let filledCount = 0;
    const totalCount = profileFields.length;

    // Count filled fields
    profileFields.forEach(field => {
      const value = getFieldValue(field.key, field.altKeys);
      if (isValidValue(value)) {
        filledCount++;
      }
    });

    // Calculate percentage
    const percentage = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

    return {
      percentage,
      filledCount,
      totalCount
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
        setQuickFilterOptions({
          batches: [...new Set(data.batches || [])],
          colleges: [...new Set(data.colleges || [])],
          courses: [...new Set(data.courses || [])],
          branches: [...new Set(data.branches || [])],
          years: [...new Set(data.years || [])],
          semesters: [...new Set(data.semesters || [])],
          sections: [...new Set(data.sections || [])]
        });
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
          caste: data.caste || [],
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
    if (isLoading || isFetching) {
      return;
    }

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
    const currentValue = student[field] || '';

    if (isEditing) {
      if (fieldType === 'select') {
        // Ensure current value is in options, add it if not present
        const allOptions = [...new Set([...options, currentValue].filter(Boolean))];
        const displayValue = cellEditValue !== '' ? cellEditValue : (currentValue || '');

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
            {!displayValue && <option value="">Select...</option>}
            {allOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
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
    setActiveStudentTab(initialTab);

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

    const stageSyncedFields = syncStageFields(
      cleanedAllFields,
      student.current_year,
      student.current_semester
    );

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
    setEditData(stageSyncedFields);
    setEditBaseline(cloneStudentFormSnapshot(stageSyncedFields));
    setEditRegistrationStatus(student.registration_status || 'pending');
    setEditFeeStatus(student.fee_status || 'pending');
    setPermitEndingDate(student.permit_ending_date || '');
    setPermitRemarks(student.permit_remarks || '');
    setShowModal(true);
  };

  const handleViewHistory = (student) => {
    setSelectedStudent(student);
    setShowRemarksHistoryModal(true);
  };

  const handleEdit = () => {
    // No need to check permission here since button is only shown if user has edit permission
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

      // If fee status is 'permitted', validate and update via fee-status endpoint to include permit data
      if (editFeeStatus === 'permitted') {
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

      if (Object.keys(partialStudentData).length === 0 && editFeeStatus !== 'permitted') {
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
      setSelectedStudent((prev) =>
        prev
          ? {
            ...prev,
            current_year:
              synchronizedData.current_year ?? prev.current_year,
            current_semester:
              synchronizedData.current_semester ?? prev.current_semester,
            student_data: synchronizedData
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

      // If college changes, refresh course and branch options for the modal
      if (key === 'college') {
        fetchQuickFilterOptions({ college: value }).catch(console.warn);
      }

      // If course/program changes, refresh branch options
      if (key === 'course' || key === 'Program') {
        newData.branch = ''; // Clear branch when program changes
        fetchQuickFilterOptions({ college: newData.college, course: value }).catch(console.warn);
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
                    <option key={batch} value={batch}>{batch}</option>
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
                      <option key={course} value={course}>
                        {course}
                      </option>
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
                    <option key={branch} value={branch}>{branch}</option>
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
                      <option key={section} value={section}>{section}</option>
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
                    <option key={type} value={type}>{type}</option>
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
                    <option key={status} value={status}>{status}</option>
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
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 mb-0.5 ml-0.5 uppercase tracking-wide">Caste</label>
                <select
                  value={filters.caste || ''}
                  onChange={(e) => handleFilterChange('caste', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All</option>
                  {CASTE_OPTIONS.map((caste) => (
                    <option key={caste} value={caste}>{caste}</option>
                  ))}
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
                    <option key={gender} value={gender}>{gender}</option>
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
                    <option key={year} value={year}>{year}</option>
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
                    <option key={sem} value={sem}>{sem}</option>
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
                    <option key={remark} value={remark}>{remark}</option>
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
                    <option key={district} value={district}>{district}</option>
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
                    <option key={mandal} value={mandal}>{mandal}</option>
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
            {/* Show loading overlay only when table is fetching (not on initial page load) */}
            {tableFetching && (
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50 rounded-xl">
                <div className="text-center space-y-2">
                  <LoadingAnimation
                    width={24}
                    height={24}
                    message=""
                    showMessage={false}
                  />
                  <p className="text-sm text-gray-600">Updating table...</p>
                </div>
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
                          <th className="py-2 px-1.5 text-xs font-semibold text-gray-700 text-left">
                            <div className="font-semibold">Caste</div>
                          </th>
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
                  {sortedStudents.map((student) => {
                    return (
                      <tr
                        key={student.admission_number}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
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
                          <td className="py-1 px-1 text-[10px] text-gray-900 leading-tight max-w-[80px]">
                            <div className="truncate" title={student.student_name}>
                              {student.student_name || '-'}
                            </div>
                          </td>
                        )}
                        {canViewField('pin_no') && (
                          <td className="py-1 px-1 text-[10px] text-gray-600">
                            {student.pin_no ? (
                              <span className="inline-flex items-center px-1 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium border border-green-100">
                                {student.pin_no}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        )}
                        {canViewField('admission_number') && (
                          <td className="py-1 px-1 text-[10px] font-medium text-gray-900">{student.admission_number || '-'}</td>
                        )}
                        {canViewField('batch') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700">{student.batch || '-'}</td>
                        )}
                        {canViewField('college') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700 max-w-[80px]">
                            <div className="truncate" title={student.college}>
                              {student.college || '-'}
                            </div>
                          </td>
                        )}
                        {canViewField('course') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700">{student.course || '-'}</td>
                        )}
                        {canViewField('branch') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700 max-w-[60px]">
                            <div className="truncate" title={student.branch}>
                              {student.branch || '-'}
                            </div>
                          </td>
                        )}
                        {showSectionColumn && (
                          <td className="py-1 px-1 text-[10px] text-gray-700">
                            {student.section || '-'}
                          </td>
                        )}
                        {!isCashier && (
                          <>
                            {canViewField('stud_type') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700">{student.stud_type || '-'}</td>
                            )}
                            {canViewField('caste') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                <div className="max-w-[80px]">{renderEditableCell(student, 'caste', 'select', CASTE_OPTIONS)}</div>
                              </td>
                            )}
                            {canViewField('gender') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                                {renderEditableCell(student, 'gender', 'select', ['M', 'F', 'Other'])}
                              </td>
                            )}
                            {canViewField('student_status') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700 max-w-[100px] truncate" onClick={(e) => e.stopPropagation()}>
                                {renderEditableCell(student, 'student_status', 'select', STUDENT_STATUS_OPTIONS)}
                              </td>
                            )}
                            {canViewField('certificates_status') && (
                              <td className="py-1 px-1 text-[10px] text-gray-700 max-w-[100px] truncate">
                                {student.certificates_status || 'Pending'}
                              </td>
                            )}
                          </>
                        )}
                        {canViewField('fee_status') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700" onClick={(e) => e.stopPropagation()}>
                            {renderEditableCell(student, 'fee_status', 'select', FEE_STATUS_OPTIONS)}
                          </td>
                        )}
                        {canViewField('current_year') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700">{student.current_year || '-'}</td>
                        )}
                        {canViewField('current_semester') && (
                          <td className="py-1 px-1 text-[10px] text-gray-700">{student.current_semester || '-'}</td>
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
                            {canViewField('registration_status') && !isCashier && (
                              <td className="py-1 px-1 text-[10px] text-gray-700">{student.registration_status || '-'}</td>
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
              {sortedStudents.map((student) => {
                return (
                  <div
                    key={student.admission_number}
                    className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
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
                                <p className="text-xs text-gray-500">Caste</p>
                                <p className="text-sm font-medium text-gray-900 truncate" title={student.caste || ''}>{student.caste || '-'}</p>
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
                            {canViewField('registration_status') && (
                              <div>
                                <p className="text-xs text-gray-500">Registration Status</p>
                                <p className="text-sm font-medium text-gray-900">{student.registration_status || 'pending'}</p>
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
                  disabled={isLoading || isFetching}
                >
                  {pageSizeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={isFirstPage || isLoading || isFetching || totalStudents === 0}
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
                  disabled={isLastPage || isLoading || isFetching || totalStudents === 0}
                  className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[32px] font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && selectedStudent && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-2 sm:p-4 overflow-y-auto"
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
            className="bg-gray-50/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl w-full max-w-[min(86vw,1380px)] max-h-[92vh] flex flex-col overflow-hidden border border-white/20 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Student Profile</h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">
                    {editMode ? 'Editing Mode' : 'Identification & Records'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!editMode && canEditStudents && !isCashier && (!frozenBatches[selectedStudent?.batch]?.includes("ALL") && !frozenBatches[selectedStudent?.student_data?.batch]?.includes("ALL")) && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    <Edit size={16} />
                    <span className="hidden sm:inline">Edit Profile</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowModal(false);
                    setActiveStudentTab('details');
                  }}
                  className="p-2.5 hover:bg-red-50 rounded-2xl text-gray-400 hover:text-red-500 transition-all active:scale-95"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Password Display Modal - (Keep as is, it's already a centered modal) */}
            {viewingPassword && studentPassword && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in">
                <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                        <Key size={20} />
                      </div>
                      <h3 className="text-lg font-black text-gray-900 tracking-tight">Credentials</h3>
                    </div>
                    <button
                      onClick={() => {
                        setViewingPassword(false);
                        setStudentPassword(null);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Username</label>
                      <p className="font-mono text-lg font-bold text-gray-900 break-all">{studentPassword.username}</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Password</label>
                      <p className="font-mono text-lg font-bold text-indigo-600 break-all">{studentPassword.password}</p>
                    </div>
                    <div className="flex items-start gap-2 text-[10px] text-gray-500 font-bold bg-amber-50/80 p-3 rounded-xl border border-amber-100">
                      <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                      <p>
                        Use the username and password exactly as shown here. The password is case-sensitive and was also sent to the student&apos;s registered mobile via SMS.
                      </p>
                    </div>
                  </div>
                  <div className="mt-8">
                    <button
                      onClick={() => {
                        setViewingPassword(false);
                        setStudentPassword(null);
                      }}
                      className="w-full py-3 bg-gray-900 text-white rounded-2xl font-black text-xs hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-gray-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content Layout */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
              {/* Left Sidebar - Key Identity */}
              <div className="w-full lg:w-[320px] bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-4 lg:p-6 flex-shrink-0 flex flex-col lg:overflow-y-auto">
                <div className="space-y-4 lg:space-y-6">
                  {/* Photo & Basic Info */}
                  <div className="flex flex-row lg:flex-col items-center gap-4 lg:gap-6">
                    {canViewField('student_photo') && (
                      <div className="relative shrink-0">
                        <div className={`w-20 h-20 sm:w-24 sm:h-24 lg:w-36 lg:h-36 rounded-2xl lg:rounded-[2.5rem] bg-gray-50 border-2 border-gray-100 overflow-hidden flex items-center justify-center shadow-inner relative ${editMode && !photoUploading ? 'cursor-pointer hover:border-indigo-400 p-1' : ''}`}>
                          {editData.student_photo && editData.student_photo !== '{}' && editData.student_photo !== null && editData.student_photo !== '' ? (
                            <img
                              src={getStaticFileUrlDirect(editData.student_photo)}
                              alt="Profile"
                              className="w-full h-full object-cover rounded-xl lg:rounded-[2.2rem]"
                            />
                          ) : (
                            <div className="flex flex-col items-center text-gray-300">
                              <User size={32} className="lg:w-12 lg:h-12" strokeWidth={1.5} />
                              <span className="text-[8px] lg:text-[10px] font-black uppercase mt-0.5 lg:mt-1">No Photo</span>
                            </div>
                          )}

                          {editMode && (
                            <div className="absolute inset-x-0 bottom-0 bg-indigo-600/90 py-1 lg:py-2 text-center text-[8px] lg:text-[10px] font-black text-white uppercase tracking-widest backdrop-blur-sm">
                              Change
                            </div>
                          )}

                          {photoUploading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                              <Loader2 className="animate-spin text-indigo-600 w-6 h-6 lg:w-8 lg:h-8" />
                            </div>
                          )}
                        </div>
                        {editMode && (
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files[0];
                              if (file) {
                                if (file.size > 5 * 1024 * 1024) return toast.error('Max 5MB allowed');
                                setPhotoUploading(true);
                                try {
                                  const formData = new FormData();
                                  formData.append('photo', file);
                                  formData.append('admissionNumber', selectedStudent.admission_number);
                                  const res = await api.post('/students/upload-photo', formData);
                                  if (res.data.success) {
                                    updateEditField('student_photo', res.data.data.photo_url);
                                    toast.success('Uploaded');
                                  }
                                } catch (err) { toast.error('Failed'); }
                                finally { setPhotoUploading(false); }
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        )}
                      </div>
                    )}

                    <div className="flex-1 lg:text-center min-w-0">
                      <p className="text-[9px] lg:text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-0.5 lg:mb-1">Student PIN</p>
                      {editMode ? (
                        <input
                          type="text"
                          value={editData.pin_no || ''}
                          onChange={(e) => updateEditField('pin_no', e.target.value)}
                          placeholder="Enter PIN"
                          className="w-full text-center text-base lg:text-lg font-black text-gray-900 border-b-2 border-indigo-200 focus:border-indigo-500 outline-none bg-transparent placeholder-gray-300"
                        />
                      ) : (
                        <h4 className="text-base lg:text-lg font-black text-gray-900 leading-tight truncate">
                          {editData.pin_no || selectedStudent?.pin_no || 'NOT ASSIGNED'}
                        </h4>
                      )}
                      <div className="mt-1 lg:mt-2 flex lg:justify-center">
                        {editMode && !isFieldFrozen(selectedStudent, 'stud_type') ? (
                          <select
                            value={editData.stud_type || selectedStudent?.stud_type || ''}
                            onChange={(e) => updateEditField('stud_type', e.target.value)}
                            className="bg-gray-900 text-white px-2 lg:px-3 py-0.5 lg:py-1 rounded-full text-[8px] lg:text-[10px] font-black uppercase tracking-widest border-none outline-none cursor-pointer"
                          >
                            <option value="">Select Quota</option>
                            {studentQuotas.map((quota) => (
                              <option key={quota.id} value={quota.code}>{quota.name}</option>
                            ))}
                            {editData.stud_type && !studentQuotas.some((quota) => quota.code === (editData.stud_type || selectedStudent?.stud_type)) && (
                              <option value={editData.stud_type || selectedStudent?.stud_type}>
                                {editData.stud_type || selectedStudent?.stud_type}
                              </option>
                            )}
                          </select>
                        ) : (
                          <span className="bg-gray-900 text-white px-2 lg:px-3 py-0.5 lg:py-1 rounded-full text-[8px] lg:text-[10px] font-black uppercase tracking-widest">
                            {editData.stud_type || selectedStudent?.stud_type || 'Regular'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-full space-y-2">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wide">
                        <GitBranch size={12} />
                        {editData.branch || selectedStudent?.branch || 'No Branch'}
                      </span>
                      {studentBranchHasSections && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold uppercase tracking-wide">
                          Sec {getStudentSection(editData, selectedStudent) || '—'}
                        </span>
                      )}
                      {!editMode && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                          <Calendar size={12} />
                          {editData.batch || selectedStudent?.batch || 'No Batch'}
                        </span>
                      )}
                    </div>

                    {editMode && (
                      <div className={`grid grid-cols-1 ${studentBranchHasSections ? 'sm:grid-cols-2' : ''} gap-2`}>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Batch</label>
                          <select
                            value={editData.batch || selectedStudent?.batch || ''}
                            onChange={(e) => updateEditField('batch', e.target.value)}
                            disabled={isFieldFrozen(selectedStudent, 'batch')}
                            className="w-full bg-white border-2 border-indigo-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all disabled:bg-gray-100 disabled:text-gray-500"
                          >
                            <option value="">Select Batch</option>
                            {batchOptions.map((batch) => (
                              <option key={batch} value={batch}>{batch}</option>
                            ))}
                            {(editData.batch || selectedStudent?.batch) &&
                              !batchOptions.includes(editData.batch || selectedStudent?.batch) && (
                                <option value={editData.batch || selectedStudent?.batch}>
                                  {editData.batch || selectedStudent?.batch}
                                </option>
                              )}
                          </select>
                        </div>
                        {studentBranchHasSections && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Section</label>
                            <select
                              value={getStudentSection(editData, selectedStudent)}
                              onChange={(e) => updateEditField('section', e.target.value)}
                              className="w-full bg-white border-2 border-indigo-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all"
                            >
                              <option value="">Select Section</option>
                              {studentSectionOptions.map((section) => (
                                <option key={section} value={section}>{section}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sidebar Details Group */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4 bg-gray-50/50 rounded-2xl lg:rounded-[2rem] p-4 lg:p-5 border border-gray-100">
                    <SidebarDetailItem
                      label="Full Name"
                      value={editData.student_name || selectedStudent?.student_name}
                      icon={<User size={14} />}
                      editable={editMode}
                      disabled={isFieldFrozen(selectedStudent, 'student_name')}
                      onChange={(val) => updateEditField('student_name', val)}
                    />
                    <SidebarDetailItem
                      label="College"
                      value={editData.college || selectedStudent?.college}
                      icon={<Book size={14} />}
                      editable={editMode}
                      disabled={isFieldFrozen(selectedStudent, 'college')}
                      onChange={(val) => updateEditField('college', val)}
                    />
                    <SidebarDetailItem
                      label="Program"
                      value={editData.course || selectedStudent?.course}
                      icon={<Book size={14} />}
                      editable={editMode}
                      disabled={isFieldFrozen(selectedStudent, 'course')}
                      type="select"
                      options={quickFilterOptions.courses}
                      onChange={(val) => updateEditField('course', val)}
                    />
                    <SidebarDetailItem
                      label="Branch"
                      value={editData.branch || selectedStudent?.branch}
                      icon={<GitBranch size={14} />}
                      editable={editMode}
                      disabled={isFieldFrozen(selectedStudent, 'branch')}
                      type="select"
                      options={quickFilterOptions.branches}
                      onChange={(val) => updateEditField('branch', val)}
                      onFocus={() => {
                        // Refresh branches for selected course when dropdown is focused
                        if (editData.course || selectedStudent?.course) {
                          fetchQuickFilterOptions({
                            college: editData.college || selectedStudent?.college,
                            course: editData.course || selectedStudent?.course
                          }, 'branch').catch(console.warn);
                        }
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <SidebarDetailItem
                        label="Year"
                        value={String(editData.current_year || selectedStudent?.current_year || '')}
                        icon={<Calendar size={14} />}
                        editable={editMode}
                        disabled={isFieldFrozen(selectedStudent, 'current_year')}
                        type="select"
                        options={studentEditYearOptions}
                        onChange={(val) => updateEditField('current_year', val)}
                      />
                      <SidebarDetailItem
                        label="Semester"
                        value={String(editData.current_semester || selectedStudent?.current_semester || '')}
                        icon={<Calendar size={14} />}
                        editable={editMode}
                        disabled={isFieldFrozen(selectedStudent, 'current_semester')}
                        type="select"
                        options={studentEditSemesterOptions}
                        onChange={(val) => updateEditField('current_semester', val)}
                      />
                    </div>
                  </div>

                  {/* QR Code Widget - visible in view mode only */}
                  {!editMode && selectedStudent?.admission_number && (
                    <div className="bg-gray-50/50 rounded-2xl lg:rounded-[2rem] p-4 lg:p-5 border border-gray-100 flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2 self-start">
                        <div className="w-5 h-5 text-teal-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="5" height="5" x="3" y="3" rx="1" />
                            <rect width="5" height="5" x="16" y="3" rx="1" />
                            <rect width="5" height="5" x="3" y="16" rx="1" />
                            <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                            <path d="M21 21v.01" />
                            <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                            <path d="M3 12h.01" />
                            <path d="M12 3h.01" />
                            <path d="M12 16v.01" />
                            <path d="M16 12h1" />
                            <path d="M21 12v.01" />
                            <path d="M12 21v-1" />
                          </svg>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Student QR Code</p>
                      </div>
                      <div id={`student-qr-${selectedStudent.admission_number}`} className="bg-white p-2 rounded-xl border border-gray-200">
                        <QRCodeSVG
                          value={`${window.location.origin}/qr/${activeQrToken || selectedStudent.qr_token || selectedStudent.admission_number}`}
                          size={130}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <p className="text-[9px] text-gray-400 text-center font-medium leading-tight">
                        {activeQrToken || selectedStudent.qr_token ? 'Secure ID Active' : selectedStudent.admission_number}
                      </p>
                      <button
                        onClick={() => {
                          // Download QR as SVG
                          const svgEl = document.querySelector(`#student-qr-${selectedStudent.admission_number} svg`);
                          if (!svgEl) return;
                          const serializer = new XMLSerializer();
                          const svgStr = serializer.serializeToString(svgEl);
                          const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `QR_${selectedStudent.admission_number}.svg`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-teal-700 bg-teal-50 border border-teal-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-100 transition-all"
                      >
                        <Download size={12} /> Download QR
                      </button>
                    </div>
                  )}

                  {!editMode && !isCashier && (!frozenBatches[selectedStudent?.batch]?.includes("ALL") && !frozenBatches[selectedStudent?.student_data?.batch]?.includes("ALL")) && (
                    <button
                      onClick={handleResetPassword}
                      className="w-full flex items-center justify-center gap-2 bg-white border-2 border-orange-100 text-orange-600 py-2.5 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-all active:scale-95"
                    >
                      <RefreshCw size={14} className={resettingPassword ? 'animate-spin' : ''} />
                      {resettingPassword ? 'Processing...' : 'Reset Password'}
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side - All Student Data */}
              <div className={`flex-1 min-w-0 flex flex-col relative ${
                activeStudentTab === 'history'
                  ? 'lg:overflow-hidden'
                  : 'overflow-y-auto min-h-0'
              }`}>
                {/* Sticky Tabs Container */}
                <div className="sticky top-0 z-[60] bg-white/95 backdrop-blur-md border-b border-gray-100 px-3 py-3 sm:px-4 lg:px-6 lg:py-4 shrink-0 shadow-sm">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mb-1">
                    <button
                      onClick={() => setActiveStudentTab('details')}
                      className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'details' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                    >
                      <Book size={16} /> <span className="whitespace-nowrap">Details</span>
                    </button>
                    {canViewField('registration_status') && (
                      <button
                        onClick={() => setActiveStudentTab('registration')}
                        className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'registration' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                      >
                        <CheckCircle size={16} /> <span className="whitespace-nowrap">Registration</span>
                      </button>
                    )}
                    {canViewAttendance && (
                      <button
                        onClick={() => setActiveStudentTab('attendance')}
                        className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'attendance' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                      >
                        <Calendar size={16} /> <span className="whitespace-nowrap">Attendance</span>
                      </button>
                    )}
                    {canViewSms && (
                      <button
                        onClick={() => setActiveStudentTab('sms_tracking')}
                        className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'sms_tracking' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                      >
                        <MessageSquare size={16} /> <span className="whitespace-nowrap">SMS</span>
                      </button>
                    )}
                    <button
                      onClick={() => setActiveStudentTab('scholarship')}
                      className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'scholarship' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                    >
                      <GraduationCap size={16} /> <span className="whitespace-nowrap">Scholarship</span>
                    </button>
                    <button
                      onClick={() => setActiveStudentTab('history')}
                      className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'history' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                    >
                      <History size={16} /> <span className="whitespace-nowrap">History</span>
                    </button>
                    <button
                      onClick={() => setActiveStudentTab('id_card')}
                      className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'id_card' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                    >
                      <CreditCard size={16} /> <span className="whitespace-nowrap">ID Card</span>
                    </button>
                    <button
                      onClick={() => setActiveStudentTab('parent_activity')}
                      className={`shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${activeStudentTab === 'parent_activity' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                    >
                      <Eye size={16} /> <span className="whitespace-nowrap">Parent Activity</span>
                    </button>
                  </div>
                </div>

                <div className={`p-3 sm:p-4 lg:p-6 ${
                  activeStudentTab === 'history'
                    ? 'flex-1 overflow-hidden flex flex-col'
                    : activeStudentTab === 'scholarship'
                      ? 'flex-1 min-h-0 overflow-y-auto'
                      : ''
                }`}>

                  {activeStudentTab === 'registration' && canViewField('registration_status') && (() => {
                    const studentData = selectedStudent.student_data || {};

                    const currentYear = selectedStudent.current_year || studentData.current_year;
                    const currentSem = selectedStudent.current_semester || studentData.current_semester;

                    const isStudentVerified = isStudentMobileVerifiedForCycle(
                      studentData,
                      currentYear,
                      currentSem
                    );
                    const isParentVerified = isParentMobileVerifiedForCycle(
                      studentData,
                      currentYear,
                      currentSem
                    );
                    const isVerificationComplete = isVerificationCompleteForCycle(
                      studentData,
                      currentYear,
                      currentSem
                    );

                    const certStatus = (selectedStudent.certificates_status || studentData.certificates_status || '').toLowerCase();
                    const isCertComplete = certStatus.includes('verified') || certStatus === 'completed';

                    const feeStatus = (selectedStudent.fee_status || studentData.fee_status || '').toLowerCase();
                    const isFeeComplete = ['no due', 'no_due', 'permitted', 'completed', 'nodue'].some(s => feeStatus.includes(s));

                    const isPromotionComplete = isPromotionCompleteForCycle(
                      studentData,
                      currentYear,
                      currentSem
                    );

                    const scholarStatus = getCurrentScholarshipStatus(scholarshipData, {
                      ...selectedStudent,
                      ...studentData
                    });
                    const isScholarshipComplete = isScholarshipRegistrationComplete(scholarshipData, {
                      ...selectedStudent,
                      ...studentData
                    });

                    const studentMobile = selectedStudent.student_mobile || studentData.student_mobile;
                    const parentMobile = selectedStudent.parent_mobile1 || studentData.parent_mobile1;
                    const canVerifyMobile = canViewField('registration_status');

                    // Build optional set for this student's branch+year
                    const optSet = new Set(Array.isArray(regOptionalStages) ? regOptionalStages : []);

                    // A stage is "satisfied" if actually complete OR marked optional
                    const isRegistrationComplete =
                      (isVerificationComplete || optSet.has('verification')) &&
                      (isCertComplete        || optSet.has('certificates')) &&
                      (isFeeComplete         || optSet.has('fee')) &&
                      (isPromotionComplete   || optSet.has('promotion')) &&
                      (isScholarshipComplete || optSet.has('scholarship'));

                    // StatusBadge: green when complete, blue-tinted when optional+pending, gray otherwise
                    const StatusBadge = ({ completed, optional = false, text }) => {
                      const display = completed ? 'Completed' : (text ? formatScholarshipStatusDisplay(text) : '—');
                      return (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          completed
                            ? 'bg-green-100 text-green-800'
                            : optional
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {display}
                          {optional && !completed && (
                            <span className="text-[10px] opacity-75">(optional)</span>
                          )}
                        </span>
                      );
                    };

                    return (
                      <div className="space-y-6">
                        <div className={`rounded-xl p-6 border ${isRegistrationComplete ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Registration Status</h3>
                              <p className="text-sm text-gray-500 mt-1">
                                Overall registration completion based on all stages
                              </p>
                            </div>
                            <div className={`px-4 py-2 rounded-lg font-bold text-lg flex items-center gap-2 ${isRegistrationComplete ? 'bg-green-200 text-green-800' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                              {isRegistrationComplete ? (
                                <><CheckCircle size={24} /> Completed</>
                              ) : (
                                <><LoadingAnimation width={20} height={20} showMessage={false} variant="inline" /> Pending</>
                              )}
                            </div>
                          </div>
                        </div>

                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide px-1">
                          Registration Stages
                        </h4>

                        <div className="grid grid-cols-1 gap-4">
                          <div className={`rounded-xl border p-4 shadow-sm flex flex-col gap-4 ${isVerificationComplete ? 'bg-white border-gray-200' : optSet.has('verification') ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className={`mt-1 p-2 rounded-full ${isVerificationComplete ? 'bg-green-100 text-green-600' : optSet.has('verification') ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                                  <MessageSquare size={20} />
                                </div>
                                <div>
                                  <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                    1. Mobile Verification
                                    {optSet.has('verification') && !isVerificationComplete && (
                                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Optional</span>
                                    )}
                                  </h5>
                                  <p className="text-xs text-gray-500 mt-0.5">Send OTP to student or parent mobile for this semester</p>
                                  <div className="flex flex-col gap-1.5 mt-2">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <span className={isStudentVerified ? 'text-green-600' : 'text-red-500'}>
                                        {isStudentVerified ? <CheckCircle size={14} className="inline mr-1" /> : <X size={14} className="inline mr-1" />}
                                        Student: {studentMobile || 'No number'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <span className={isParentVerified ? 'text-green-600' : 'text-red-500'}>
                                        {isParentVerified ? <CheckCircle size={14} className="inline mr-1" /> : <X size={14} className="inline mr-1" />}
                                        Parent: {parentMobile || 'No number'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                                <StatusBadge completed={isVerificationComplete} optional={optSet.has('verification')} />
                                {canVerifyMobile && (
                                  <button
                                    type="button"
                                    onClick={() => setShowVerificationModal(true)}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                  >
                                    <Shield size={16} />
                                    {isVerificationComplete ? 'View / Re-verify' : 'Verify with OTP'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isCertComplete ? 'bg-white border-gray-200' : optSet.has('certificates') ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 p-2 rounded-full ${isCertComplete ? 'bg-green-100 text-green-600' : optSet.has('certificates') ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                                <FileText size={20} />
                              </div>
                              <div>
                                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                  2. Certificate Status
                                  {optSet.has('certificates') && !isCertComplete && (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Optional</span>
                                  )}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  Current Status: <span className="font-medium text-gray-900 capitalize">{certStatus || 'Pending'}</span>
                                </p>
                              </div>
                            </div>
                            <StatusBadge completed={isCertComplete} optional={optSet.has('certificates')} text={certStatus} />
                          </div>

                          <div className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isFeeComplete ? 'bg-white border-gray-200' : optSet.has('fee') ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 p-2 rounded-full ${isFeeComplete ? 'bg-green-100 text-green-600' : optSet.has('fee') ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                                <span className="font-bold text-lg px-1">₹</span>
                              </div>
                              <div>
                                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                  3. Fee Payment
                                  {optSet.has('fee') && !isFeeComplete && (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Optional</span>
                                  )}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  Current Status: <span className="font-medium text-gray-900 capitalize">{feeStatus || 'Pending'}</span>
                                </p>
                              </div>
                            </div>
                            <StatusBadge completed={isFeeComplete} optional={optSet.has('fee')} text={feeStatus} />
                          </div>

                          <div className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isPromotionComplete ? 'bg-white border-gray-200' : optSet.has('promotion') ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 p-2 rounded-full ${isPromotionComplete ? 'bg-blue-100 text-blue-600' : optSet.has('promotion') ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                                <TrendingUp size={20} />
                              </div>
                              <div>
                                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                  4. Promotion Status
                                  {optSet.has('promotion') && !isPromotionComplete && (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Optional</span>
                                  )}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  Acknowledged for current semester
                                </p>
                              </div>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                Year {currentYear || '-'} • Sem {currentSem || '-'}
                              </span>
                              <StatusBadge
                                completed={isPromotionComplete}
                                optional={optSet.has('promotion')}
                                text={isPromotionComplete ? 'Completed' : REGISTRATION_EMPTY_DISPLAY}
                              />
                            </div>
                          </div>

                          <div className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isScholarshipComplete ? 'bg-white border-gray-200' : optSet.has('scholarship') ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 p-2 rounded-full ${isScholarshipComplete ? 'bg-purple-100 text-purple-600' : optSet.has('scholarship') ? 'bg-blue-100 text-blue-500' : 'bg-purple-100 text-purple-600'}`}>
                                <Book size={20} />
                              </div>
                              <div>
                                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                                  5. Scholarship Status
                                  {optSet.has('scholarship') && !isScholarshipComplete && (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Optional</span>
                                  )}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  Year {selectedStudent.current_year || studentData.current_year || 1} status from scholarship records
                                </p>
                              </div>
                            </div>
                            <div className="ml-auto flex items-center">
                              <StatusBadge completed={isScholarshipComplete} optional={optSet.has('scholarship')} text={scholarStatus} />
                            </div>
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

                  {activeStudentTab === 'scholarship' && (
                    <StudentScholarshipHistoryTab
                      student={selectedStudent}
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

                  {activeStudentTab === 'history' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                      {/* Sub-tabs for History */}
                      <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-gray-50/50">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setHistorySubTab('remarks')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${historySubTab === 'remarks'
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                              : 'text-gray-500 hover:bg-white hover:text-blue-600'
                              }`}
                          >
                            <MessageSquare size={14} />
                            Remarks
                          </button>
                          <button
                            onClick={() => setHistorySubTab('audit')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${historySubTab === 'audit'
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                              : 'text-gray-500 hover:bg-white hover:text-blue-600'
                              }`}
                          >
                            <History size={14} />
                            Edit History
                          </button>
                        </div>
                        <div className="hidden sm:block text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3">
                          Student Logs
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 overflow-hidden">
                        {historySubTab === 'remarks' ? (
                          <StudentRemarksContent
                            student={selectedStudent}
                            canAddRemarks={canAddRemarks}
                            canManageRemarks={canManageRemarks}
                          />
                        ) : (
                          <StudentHistoryLogs student={selectedStudent} />
                        )}
                      </div>
                    </div>
                  )}

                  {activeStudentTab === 'id_card' && (() => {
                    // Helper values for PDF
                    const s = selectedStudent || {};
                    const sd = s.student_data || {};
                    const getVal = (key) => s[key] || sd[key] || '';
                    const studentName = getVal('student_name') || '—';
                    const pinNumber = getVal('pin_no') || getVal('admission_number') || '—';
                    const college = getVal('college') || '—';
                    const program = getVal('course') || '—';
                    const branch = getVal('branch') || '';
                    const year = getVal('current_year') || '—';
                    const semester = getVal('current_semester') || '—';
                    const batch = getVal('batch') || '—';
                    const studentMobile = getVal('student_mobile') || '—';
                    const parentMobile = getVal('parent_mobile1') || '—';
                    const address = [getVal('student_address'), getVal('city_village'), getVal('district')].filter(Boolean).join(', ') || '—';
                    const photoSrc = s.student_photo && (s.student_photo.startsWith('data:') || s.student_photo.startsWith('http')) ? s.student_photo : '';

                    const handleDownloadPDF = async () => {
                      const { jsPDF } = await import('jspdf');
                      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [90, 140] });
                      const W = 90, H = 140;

                      // White background
                      doc.setFillColor(248, 249, 250);
                      doc.rect(0, 0, W, H, 'F');

                      // Red top polygon (approximate with rectangles/triangles via lines)
                      doc.setFillColor(185, 28, 28); // #b91c1c
                      doc.triangle(0, 0, W, 0, W, 12, 'F');
                      doc.triangle(0, 0, W, 12, 45, 30, 'F');
                      doc.triangle(0, 0, 45, 30, 0, 10, 'F');

                      // Logo area (white pill)
                      doc.setFillColor(255, 255, 255);
                      doc.roundedRect(W / 2 - 18, 6, 36, 20, 3, 3, 'F');
                      try {
                        // Load logo as image
                        const logoResp = await fetch('/logo.png');
                        const logoBlob = await logoResp.blob();
                        const logoDataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(logoBlob); });
                        doc.addImage(logoDataUrl, 'PNG', W / 2 - 16, 7, 32, 18, undefined, 'FAST');
                      } catch (_) { }

                      // Photo box
                      const photoX = 7, photoY = 34, photoW = 28, photoH = 36;
                      doc.setDrawColor(220, 220, 220);
                      doc.setFillColor(240, 240, 240);
                      doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, 'FD');
                      if (photoSrc) {
                        try {
                          doc.addImage(photoSrc, 'JPEG', photoX, photoY, photoW, photoH, undefined, 'FAST');
                        } catch (_) {
                          try { doc.addImage(photoSrc, 'PNG', photoX, photoY, photoW, photoH, undefined, 'FAST'); } catch (__) { }
                        }
                      }

                      // Right column info
                      const infoX = photoX + photoW + 5;
                      const infoW = W - infoX - 5;
                      let iy = 36;
                      doc.setFontSize(5.5);
                      const rows = [
                        ['NAME', studentName.toUpperCase()],
                        ['PROGRAM', program],
                        branch ? ['BRANCH', branch] : null,
                        ['PIN', pinNumber],
                        ['BATCH', batch],
                        ['STUDENT', studentMobile],
                        ['PARENT', parentMobile],
                      ].filter(Boolean);
                      rows.forEach(([label, value]) => {
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(150, 150, 150);
                        doc.text(label, infoX, iy);
                        doc.setTextColor(30, 41, 59);
                        const lines = doc.splitTextToSize(value || '—', infoW - 16);
                        doc.text(lines[0] || '—', infoX + 16, iy);
                        iy += 5.5;
                      });

                      // Divider
                      const divY = Math.max(photoY + photoH + 3, iy + 2);
                      doc.setDrawColor(200, 200, 200);
                      doc.setLineDashPattern([1, 1], 0);
                      doc.line(7, divY, W - 7, divY);
                      doc.setLineDashPattern([], 0);

                      // Address
                      doc.setFontSize(5);
                      doc.setTextColor(100, 100, 100);
                      doc.setFont('helvetica', 'bold');
                      doc.text('ADDRESS', 9, divY + 4);
                      doc.setFont('helvetica', 'normal');
                      doc.setTextColor(60, 60, 60);
                      const addrLines = doc.splitTextToSize(address, 48);
                      addrLines.slice(0, 3).forEach((line, i) => doc.text(line, 9, divY + 8 + i * 4));

                      // QR Code (as SVG string → canvas approach not available in jsPDF directly, use placeholder)
                      const qrX = W - 28, qrY = divY + 2, qrSize = 22;
                      doc.setFillColor(255, 255, 255);
                      doc.setDrawColor(220, 220, 220);
                      doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'FD');
                      // Draw QR via canvas (use hidden QR SVG in DOM)
                      try {
                        const qrEl = document.querySelector(`#student-qr-${s.admission_number} svg`);
                        if (qrEl) {
                          const svgData = new XMLSerializer().serializeToString(qrEl);
                          const canvas = document.createElement('canvas');
                          canvas.width = 100; canvas.height = 100;
                          const ctx = canvas.getContext('2d');
                          const img = new Image();
                          await new Promise((resolve) => {
                            img.onload = () => { ctx.drawImage(img, 0, 0, 100, 100); resolve(); };
                            img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
                          });
                          doc.addImage(canvas.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);
                        }
                      } catch (_) { }

                      // Red footer bar
                      doc.setFillColor(185, 28, 28);
                      doc.roundedRect(0, H - 10, W, 12, 3, 3, 'F');
                      doc.setFillColor(185, 28, 28);
                      doc.rect(0, H - 10, W, 6, 'F'); // cover top radius of footer
                      doc.setFontSize(5.5);
                      doc.setTextColor(255, 255, 255);
                      doc.setFont('helvetica', 'bold');
                      const collegeTrunc = college.length > 48 ? college.substring(0, 45) + '...' : college;
                      doc.text(collegeTrunc.toUpperCase(), W / 2, H - 4, { align: 'center' });

                      doc.save(`ID_Card_${s.admission_number || studentName}.pdf`);
                    };

                    return (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
                        <div className="max-w-sm mx-auto flex flex-col items-center gap-5">

                          {/* Header */}
                          <div className="flex items-center gap-3 self-start w-full">
                            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                              <CreditCard size={20} className="text-red-700" />
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-gray-900">Digital ID Card</h3>
                              <p className="text-xs text-gray-400">Student identification document</p>
                            </div>
                          </div>

                          {/* Preview Gate / Card */}
                          {!showIdCardPreview ? (
                            <div
                              className="relative w-full cursor-pointer group"
                              style={{ maxWidth: '380px' }}
                              onClick={() => setShowIdCardPreview(true)}
                            >
                              {/* Blurred placeholder card */}
                              <div className="rounded-[2rem] overflow-hidden shadow-xl select-none pointer-events-none" style={{ filter: 'blur(6px)', opacity: 0.5 }}>
                                <DigitalStudentCard
                                  student={selectedStudent}
                                  getStudentData={(key) => {
                                    if (!selectedStudent?.student_data) return '';
                                    const dk = Object.keys(selectedStudent.student_data).find(k => k.toLowerCase() === key.toLowerCase());
                                    const v = dk ? selectedStudent.student_data[dk] : undefined;
                                    return v !== undefined && v !== null && v !== '' ? v : '';
                                  }}
                                />
                              </div>
                              {/* Overlay */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[2rem] bg-white/40 backdrop-blur-[2px] group-hover:bg-white/50 transition-all">
                                <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center">
                                  <Eye size={22} className="text-red-700" />
                                </div>
                                <span className="bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow">Preview ID Card</span>
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full" style={{ maxWidth: '380px' }}>
                              <div className="transform sm:scale-100 scale-95 origin-top">
                                <DigitalStudentCard
                                  student={selectedStudent}
                                  getStudentData={(key) => {
                                    if (!selectedStudent?.student_data) return '';
                                    const dk = Object.keys(selectedStudent.student_data).find(k => k.toLowerCase() === key.toLowerCase());
                                    const v = dk ? selectedStudent.student_data[dk] : undefined;
                                    return v !== undefined && v !== null && v !== '' ? v : '';
                                  }}
                                />
                              </div>
                              <button
                                onClick={() => setShowIdCardPreview(false)}
                                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-all"
                                title="Hide card"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-3 w-full">
                            {!showIdCardPreview && (
                              <button
                                onClick={() => setShowIdCardPreview(true)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-700 text-white rounded-xl text-sm font-bold hover:bg-red-800 transition-all active:scale-95"
                              >
                                <Eye size={16} /> Preview Card
                              </button>
                            )}
                            <button
                              onClick={handleDownloadPDF}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all active:scale-95"
                            >
                              <Download size={16} /> Download PDF
                            </button>
                          </div>

                          <p className="text-[10px] text-gray-400 text-center">
                            The PDF matches the digital card exactly — logo, photo, fields, and QR code.
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {activeStudentTab === 'parent_activity' && selectedStudent?.id && (
                    <ParentEngagementPanel studentId={selectedStudent.id} variant="tab" />
                  )}

                  <div className={`space-y-4 sm:space-y-6 ${activeStudentTab !== 'details' ? 'hidden' : ''}`}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

                      {/* Column 1 */}
                      <div className="space-y-4">
                        {/* Admission Number */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users size={16} className="text-blue-600" />
                            Admission Details
                          </h4>
                          {canViewField('admission_number') && (
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Admission Number
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-bold text-gray-900">{selectedStudent.admission_number}</p>
                                {selectedStudent.roll_number && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-bold">
                                    Roll No: {selectedStudent.roll_number}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="mt-3">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Completion Progress
                            </label>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-base font-bold ${profileCompletion.percentage >= 80 ? 'text-green-600' :
                                  profileCompletion.percentage >= 50 ? 'text-blue-600' :
                                    'text-gray-600'
                                  }`}>
                                  {profileCompletion.percentage}%
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({profileCompletion.filledCount}/{profileCompletion.totalCount} fields)
                                </span>
                                {editMode && (
                                  <button
                                    onClick={() => {
                                      // Recalculate on demand
                                      const parsedStudentData = typeof editData === 'string'
                                        ? JSON.parse(editData || '{}')
                                        : editData;
                                      const completion = calculateProfileCompletion(selectedStudent, parsedStudentData);
                                      setProfileCompletion(completion);
                                      toast.success('Completion progress refreshed');
                                    }}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Refresh completion progress"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {/* Progress Bar */}
                              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${profileCompletion.percentage >= 80 ? 'bg-green-500' :
                                    profileCompletion.percentage >= 50 ? 'bg-blue-500' :
                                      'bg-gray-400'
                                    }`}
                                  style={{ width: `${profileCompletion.percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Parent Information */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users size={16} className="text-orange-600" />
                            Parent Information
                          </h4>
                          <div className="space-y-3">
                            {canViewField('parent_mobile1') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Parent Mobile 1
                                </label>
                                {editMode ? (
                                  <input
                                    type="tel"
                                    value={editData.parent_mobile1 ?? editData['Parent Mobile Number 1'] ?? ''}
                                    onChange={(e) => updateEditField('parent_mobile1', e.target.value)}
                                    placeholder="Enter parent mobile 1"
                                    maxLength={10}
                                    disabled={isFieldFrozen(selectedStudent, 'parent_mobile1')}
                                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {maskMobileNumber(editData.parent_mobile1 || editData['Parent Mobile Number 1'] || selectedStudent?.parent_mobile1 || '-')}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('parent_mobile2') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Parent Mobile 2
                                </label>
                                {editMode ? (
                                  <input
                                    type="tel"
                                    value={editData.parent_mobile2 ?? editData['Parent Mobile Number 2'] ?? ''}
                                    onChange={(e) => updateEditField('parent_mobile2', e.target.value)}
                                    placeholder="Enter parent mobile 2"
                                    maxLength={10}
                                    disabled={isFieldFrozen(selectedStudent, 'parent_mobile2')}
                                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {maskMobileNumber(editData.parent_mobile2 || editData['Parent Mobile Number 2'] || selectedStudent?.parent_mobile2 || '-')}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Address Details */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users size={16} className="text-green-600" />
                            Address Details
                          </h4>
                          <div className="space-y-3">
                            {canViewField('student_address') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Full Address
                                </label>
                                {editMode ? (
                                  <textarea
                                    value={editData.student_address ?? editData['Student Address (D.No, Str name, Village, Mandal, Dist)'] ?? ''}
                                    onChange={(e) => updateEditField('student_address', e.target.value)}
                                    placeholder="Enter student address"
                                    rows="3"
                                    disabled={isFieldFrozen(selectedStudent, 'student_address')}
                                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.student_address || editData['Student Address (D.No, Str name, Village, Mandal, Dist)'] || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                              {canViewField('city_village') && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    City/Village
                                  </label>
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={editData.city_village ?? editData['City/Village'] ?? ''}
                                      onChange={(e) => updateEditField('city_village', e.target.value)}
                                      placeholder="Enter city/village"
                                      disabled={isFieldFrozen(selectedStudent, 'city_village')}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    />
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {editData.city_village || editData['City/Village'] || '-'}
                                    </p>
                                  )}
                                </div>
                              )}
                              {canViewField('mandal_name') && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Mandal
                                  </label>
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={editData.mandal_name ?? editData['Mandal Name'] ?? ''}
                                      onChange={(e) => updateEditField('mandal_name', e.target.value)}
                                      placeholder="Enter mandal name"
                                      disabled={isFieldFrozen(selectedStudent, 'mandal_name')}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    />
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {editData.mandal_name || editData['Mandal Name'] || '-'}
                                    </p>
                                  )}
                                </div>
                              )}
                              {canViewField('district') && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    District
                                  </label>
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={editData.district ?? editData.District ?? ''}
                                      onChange={(e) => updateEditField('district', e.target.value)}
                                      placeholder="Enter district"
                                      disabled={isFieldFrozen(selectedStudent, 'district')}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    />
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {editData.district || editData.District || selectedStudent?.district || '-'}
                                    </p>
                                  )}
                                </div>
                              )}
                              {canViewField('caste') && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Caste
                                  </label>
                                  {editMode ? (
                                    <select
                                      value={editData.caste ?? editData.Caste ?? ''}
                                      onChange={(e) => updateEditField('caste', e.target.value)}
                                      disabled={isFieldFrozen(selectedStudent, 'caste')}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    >
                                      <option value="">Select caste</option>
                                      {CASTE_OPTIONS.map((caste) => (
                                        <option key={caste} value={caste}>{caste}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {editData.caste || editData.Caste || selectedStudent?.caste || '-'}
                                    </p>
                                  )}
                                </div>
                              )}
                              {canViewField('gender') && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Gender
                                  </label>
                                  {editMode ? (
                                    <select
                                      value={editData.gender ?? editData['M/F'] ?? ''}
                                      onChange={(e) => updateEditField('gender', e.target.value)}
                                      disabled={isFieldFrozen(selectedStudent, 'gender')}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    >
                                      <option value="">Select Gender</option>
                                      <option value="M">Male</option>
                                      <option value="F">Female</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {editData.gender || editData['M/F'] || selectedStudent?.gender || '-'}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 2 */}
                      <div className="space-y-4">
                        {/* Student Information */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users size={16} className="text-blue-600" />
                            Student Information
                          </h4>
                          <div className="space-y-3">
                            {canViewField('student_mobile') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Mobile Number
                                </label>
                                {editMode ? (
                                  <input
                                    type="tel"
                                    value={editData.student_mobile ?? editData['Student Mobile Number'] ?? ''}
                                    onChange={(e) => updateEditField('student_mobile', e.target.value)}
                                    placeholder="Enter mobile number"
                                    maxLength={10}
                                    disabled={isFieldFrozen(selectedStudent, 'student_mobile')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {maskMobileNumber(editData.student_mobile || editData['Student Mobile Number'] || selectedStudent?.student_mobile || '-')}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('father_name') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Father Name
                                </label>
                                {editMode ? (
                                  <input
                                    type="text"
                                    value={editData.father_name ?? editData['Father Name'] ?? ''}
                                    onChange={(e) => updateEditField('father_name', e.target.value)}
                                    placeholder="Enter father name"
                                    disabled={isFieldFrozen(selectedStudent, 'father_name')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.father_name || editData['Father Name'] || selectedStudent?.father_name || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('dob') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Date of Birth
                                </label>
                                {editMode ? (
                                  <input
                                    type="date"
                                    value={(editData.dob ?? editData['DOB (Date of Birth - DD-MM-YYYY)']) ?
                                      (editData.dob ?? editData['DOB (Date of Birth - DD-MM-YYYY)']).split('T')[0] : ''}
                                    onChange={(e) => updateEditField('dob', e.target.value)}
                                    disabled={isFieldFrozen(selectedStudent, 'dob')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {formatDate(editData.dob || editData['DOB (Date of Birth - DD-MM-YYYY)'] || selectedStudent?.dob)}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('adhar_no') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Aadhar Number
                                </label>
                                {editMode ? (
                                  <input
                                    type="text"
                                    value={editData.adhar_no ?? editData['ADHAR No'] ?? ''}
                                    onChange={(e) => updateEditField('adhar_no', e.target.value)}
                                    placeholder="Enter Aadhar number"
                                    disabled={isFieldFrozen(selectedStudent, 'adhar_no')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.adhar_no || editData['ADHAR No'] || selectedStudent?.adhar_no || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {/* APAAR ID */}
                            {canViewField('apaar_id') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  APAAR ID
                                </label>
                                {editMode ? (
                                  <input
                                    type="text"
                                    value={editData.apaar_id ?? editData['APAAR ID'] ?? editData['apaar id'] ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                                      updateEditField('apaar_id', val);
                                    }}
                                    placeholder="Enter 12-digit APAAR ID"
                                    maxLength={12}
                                    inputMode="numeric"
                                    disabled={isFieldFrozen(selectedStudent, 'apaar_id')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.apaar_id || editData['APAAR ID'] || editData['apaar id'] || selectedStudent?.apaar_id || selectedStudent?.student_data?.apaar_id || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('admission_date') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Admission Date
                                </label>
                                {editMode ? (
                                  <input
                                    type="date"
                                    value={(editData.admission_date ?? editData['Admission Date']) ?
                                      (editData.admission_date ?? editData['Admission Date']).split('T')[0] : ''}
                                    onChange={(e) => updateEditField('admission_date', e.target.value)}
                                    disabled={isFieldFrozen(selectedStudent, 'admission_date')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {formatDate(editData.admission_date || editData['Admission Date'])}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Administrative Information */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <UserCog size={16} className="text-purple-600" />
                            Administrative Information
                          </h4>
                          <div className="space-y-3">

                            {canViewField('student_status') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Student Status
                                </label>
                                {editMode ? (
                                  <select
                                    value={editData.student_status ?? editData['Student Status'] ?? selectedStudent?.student_status ?? ''}
                                    onChange={(e) => updateEditField('student_status', e.target.value)}
                                    disabled={isFieldFrozen(selectedStudent, 'student_status')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  >
                                    {!editData.student_status && !editData['Student Status'] && !selectedStudent?.student_status && (
                                      <option value="">Select Status</option>
                                    )}
                                    {STUDENT_STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.student_status || editData['Student Status'] || selectedStudent?.student_status || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('scholar_status') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Scholarship Status
                                </label>
                                <p className="text-sm text-gray-900 font-medium capitalize">
                                  {scholarshipLoading
                                    ? 'Loading...'
                                    : formatScholarshipStatusDisplay(
                                      getCurrentScholarshipStatus(scholarshipData, { ...selectedStudent, ...editData })
                                    )}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setActiveStudentTab('scholarship')}
                                  className="mt-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                                >
                                  Update in Scholarship tab →
                                </button>
                              </div>
                            )}
                            {canViewField('fee_status') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Fee Status
                                </label>
                                {editMode ? (
                                  <select
                                    value={editFeeStatus || editData.fee_status || editData['Fee Status'] || selectedStudent?.fee_status || ''}
                                    onChange={(e) => {
                                      const newStatus = e.target.value;
                                      setEditFeeStatus(newStatus);
                                      // Clear permit fields if not permitted
                                      if (newStatus !== 'permitted') {
                                        setPermitEndingDate('');
                                        setPermitRemarks('');
                                      }
                                    }}
                                    disabled={isFieldFrozen(selectedStudent, 'fee_status')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  >
                                    {!editFeeStatus && !editData.fee_status && !editData['Fee Status'] && !selectedStudent?.fee_status && (
                                      <option value="">Select Fee Status</option>
                                    )}
                                    {FEE_STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editFeeStatus || editData.fee_status || editData['Fee Status'] || selectedStudent?.fee_status || '-'}
                                  </p>
                                )}
                                {/* Permit Fields - Show when fee status is 'permitted' */}
                                {(editFeeStatus === 'permitted' || editData.fee_status === 'permitted' || selectedStudent?.fee_status === 'permitted') && editMode && (
                                  <div className="mt-4 space-y-3 pt-3 border-t border-gray-200">
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                        Permit Ending Date <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="date"
                                        value={permitEndingDate}
                                        onChange={(e) => setPermitEndingDate(e.target.value)}
                                        className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px]"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                        Permit Remarks <span className="text-red-500">*</span>
                                      </label>
                                      <textarea
                                        value={permitRemarks}
                                        onChange={(e) => setPermitRemarks(e.target.value)}
                                        rows="3"
                                        className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm"
                                        placeholder="Enter remarks for the permit"
                                        required
                                      />
                                    </div>
                                  </div>
                                )}
                                {/* Show permit info in view mode */}
                                {(editData.fee_status === 'permitted' || selectedStudent?.fee_status === 'permitted') && !editMode && (
                                  <div className="mt-4 space-y-2 pt-3 border-t border-gray-200">
                                    {permitEndingDate && (
                                      <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                          Permit Ending Date
                                        </label>
                                        <p className="text-sm text-gray-900 font-medium">
                                          {permitEndingDate || selectedStudent?.permit_ending_date || '-'}
                                        </p>
                                      </div>
                                    )}
                                    {permitRemarks && (
                                      <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                          Permit Remarks
                                        </label>
                                        <p className="text-sm text-gray-900 font-medium">
                                          {permitRemarks || selectedStudent?.permit_remarks || '-'}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {canViewField('registration_status') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Registration Status
                                </label>
                                {editMode ? (
                                  <select
                                    value={editRegistrationStatus || editData.registration_status || editData['Registration Status'] || selectedStudent?.registration_status || ''}
                                    onChange={(e) => setEditRegistrationStatus(e.target.value)}
                                    disabled={isFieldFrozen(selectedStudent, 'registration_status')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  >
                                    {!editRegistrationStatus && !editData.registration_status && !editData['Registration Status'] && !selectedStudent?.registration_status && (
                                      <option value="">Select Registration Status</option>
                                    )}
                                    {REGISTRATION_STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editRegistrationStatus || editData.registration_status || editData['Registration Status'] || selectedStudent?.registration_status || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('previous_college') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Previous College
                                </label>
                                {editMode ? (
                                  <input
                                    type="text"
                                    value={editData.previous_college ?? ''}
                                    onChange={(e) => updateEditField('previous_college', e.target.value)}
                                    placeholder="Enter previous college"
                                    disabled={isFieldFrozen(selectedStudent, 'previous_college')}
                                    className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 font-medium">
                                    {editData.previous_college || selectedStudent?.previous_college || '-'}
                                  </p>
                                )}
                              </div>
                            )}
                            {canViewField('certificates_status') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Certificate Status
                                </label>
                                <p className="text-sm text-gray-900 font-medium">
                                  {editData.certificates_status || selectedStudent?.certificates_status || 'Pending'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 italic">
                                  (Auto-updated based on certificate information)
                                </p>
                              </div>
                            )}
                            {canViewField('remarks') && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Latest Remark
                                </label>
                                <div className="flex items-start gap-2">
                                  <p className="text-sm text-gray-900 font-medium flex-1">
                                    {editData.remarks || editData.Remarks || selectedStudent?.remarks || '-'}
                                  </p>
                                  <button
                                    onClick={() => setShowRemarksHistoryModal(true)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 shrink-0"
                                  >
                                    <History size={14} />
                                    View History
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Certificate Information Section */}
                    {canViewField('certificates_status') && (() => {
                      // Determine course type from student data
                      const selectedCourseName = editData.course || selectedStudent?.course || '';
                      const selectedCourseObj = coursesWithLevels.find(c => c.name === selectedCourseName);
                      const courseType = getCourseType(selectedCourseObj || selectedCourseName);

                      if (!courseType) return null;

                      const certificates = getCertificatesForCourse(courseType);
                      const overallStatus = editData.certificates_status || selectedStudent?.certificates_status || null;

                      return (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mt-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                            Certificate Information
                          </h4>
                          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                            <h5 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                              <FileText size={14} className="text-gray-600" />
                              {editMode ? 'Edit Certificate Status' : 'Certificate Status'}
                            </h5>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {certificates.map((cert) => {
                                const isPresent = isCertificatePresent(cert.key);
                                const displayStatus = getCertificateStatusDisplay(cert.key, overallStatus);
                                const isYes = displayStatus === 'Yes';

                                return (
                                  <div
                                    key={cert.key}
                                    className={`flex items-center justify-between p-2.5 bg-white rounded border ${isYes ? 'border-green-200 bg-green-50' : 'border-gray-200'
                                      } transition-colors`}
                                  >
                                    <span className="text-xs text-gray-700 flex-1 pr-2">{cert.label}</span>

                                    {editMode ? (
                                      <select
                                        value={getCertificateStatusDisplay(cert.key) === 'No' ? '' : getCertificateStatusDisplay(cert.key)}
                                        onChange={(e) => updateCertificateStatus(cert.key, e.target.value)}
                                        disabled={isFieldFrozen(selectedStudent, 'certificates_status')}
                                        className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                      >
                                        <option value="">No</option>
                                        {(() => {
                                          const type = courseType.toLowerCase();
                                          const configCert = certificateConfig[type]?.find(c => c.id === cert.key);
                                          const options = configCert?.options || [];
                                          if (options.length > 0) {
                                            return options.map((opt, idx) => {
                                              const optValue = typeof opt === 'object' ? opt.value : opt;
                                              return (
                                                <option key={idx} value={optValue}>{optValue}</option>
                                              );
                                            });
                                          }
                                          return <option value="Yes">Yes</option>;
                                        })()}
                                      </select>
                                    ) : (
                                      <span className={`text-xs font-medium px-2 py-1 rounded ${isPresent
                                        ? 'text-green-700 bg-green-100'
                                        : 'text-red-700 bg-red-100'
                                        }`}>
                                        {displayStatus}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dynamic Additional Registration Fields - auto-synced from Settings registration form */}
                    {(() => {
                      // Keys already rendered as hardcoded fields - skip these
                      const HARDCODED_KEYS = new Set([
                        'batch', 'college', 'course', 'branch', 'current_year', 'current_semester',
                        'student_name', 'father_name', 'gender', 'dob', 'student_mobile',
                        'parent_mobile1', 'parent_mobile2', 'parent_mobile_1', 'parent_mobile_2',
                        'adhar_no', 'aadhar_no', 'aadhaar_no', 'caste', 'stud_type', 'studtype',
                        'student_address', 'city_village', 'mandal_name', 'district',
                        'previous_college', 'certificates_status', 'remarks', 'pin_no',
                        'admission_date', 'student_status', 'scholar_status', 'fee_status',
                        'registration_status', 'student_photo', 'apaar_id',
                        'admission_number', 'created_at', 'updated_at', 'id',
                        // verification flags stored internally
                        'is_student_mobile_verified', 'is_parent_mobile_verified'
                      ]);

                      // Collect all enabled form fields from active forms, excluding hardcoded ones
                      const extraFields = [];
                      const seenKeys = new Set();

                      forms.forEach(form => {
                        if (!form.is_active) return;
                        const formFields = Array.isArray(form.form_fields) ? form.form_fields : [];
                        formFields.forEach(field => {
                          if (field.isEnabled === false) return;
                          const key = (field.key || '').toLowerCase().trim();
                          if (!key || HARDCODED_KEYS.has(key) || seenKeys.has(key)) return;
                          // Also skip keys that start with 'field_' (auto-generated temp keys)
                          if (key.startsWith('field_') && !editData[field.key] && !editData[field.label]) return;
                          seenKeys.add(key);
                          extraFields.push(field);
                        });
                      });

                      if (extraFields.length === 0) return null;

                      return (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                            Additional Registration Fields
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {extraFields.map((field) => {
                              const fieldKey = field.key || field.label;
                              const labelKey = field.label;
                              const value = editData[fieldKey] ?? editData[labelKey] ?? '';
                              const isSelectType = field.type === 'select' || field.type === 'radio';
                              const options = Array.isArray(field.options) ? field.options : [];

                              return (
                                <div key={fieldKey}>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                  </label>
                                  {editMode ? (
                                    isSelectType ? (
                                      <select
                                        value={value}
                                        onChange={(e) => updateEditField(fieldKey, e.target.value)}
                                        className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px] bg-white"
                                      >
                                        <option value="">Select {field.label}</option>
                                        {options.map((opt, i) => (
                                          <option key={i} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    ) : field.type === 'textarea' ? (
                                      <textarea
                                        value={value}
                                        onChange={(e) => updateEditField(fieldKey, e.target.value)}
                                        placeholder={field.placeholder || `Enter ${field.label}`}
                                        rows={3}
                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                                      />
                                    ) : (
                                      <input
                                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                        value={value}
                                        onChange={(e) => updateEditField(fieldKey, e.target.value)}
                                        placeholder={field.placeholder || `Enter ${field.label}`}
                                        className="w-full px-3 py-2.5 sm:py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-base sm:text-sm touch-manipulation min-h-[44px]"
                                      />
                                    )
                                  ) : (
                                    <p className="text-sm text-gray-900 font-medium">
                                      {value || '-'}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            < div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex-shrink-0" >
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingEdit || !(() => {
                        const mandatoryKeys = [
                          { k: 'student_name', alt: 'Student Name' },
                          { k: 'student_mobile', alt: 'Student Mobile Number' },
                          { k: 'college', alt: 'College' },
                          { k: 'batch', alt: 'Batch' },
                          { k: 'course', alt: 'Program' },
                          { k: 'branch', alt: 'Branch' },
                          { k: 'parent_mobile1', alt: 'Parent Mobile Number 1' }
                        ];
                        return mandatoryKeys.every(field => {
                          const val = editData[field.k] ?? editData[field.alt] ?? '';
                          return typeof val === 'string' ? val.trim() !== '' : (val !== null && val !== undefined);
                        });
                      })()}
                      className="w-full sm:flex-1 bg-green-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
                    >
                      {savingEdit ? (
                        <>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      disabled={savingEdit}
                      className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {canUpdatePin && (
                      <button
                        onClick={handleResetPassword}
                        disabled={resettingPassword}
                        className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 active:bg-indigo-200 transition-colors font-medium touch-manipulation min-h-[44px] mr-2 flex items-center justify-center gap-2"
                        title="Resend password via SMS"
                      >
                        <Key size={18} />
                        {resettingPassword ? 'Sending...' : 'Resend Password'}
                      </button>
                    )}
                    <button onClick={() => setShowModal(false)} className="w-full sm:w-auto sm:ml-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium touch-manipulation min-h-[44px]">
                      Close
                    </button>
                  </>
                )}
              </div>
            </div >
          </div >
        </div >
      )
      }

      <StudentExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        filters={memoizedFilters}
        search={debouncedSearch}
        forms={forms}
        canViewField={canViewField}
        totalCount={totalStudents}
      />

      <BulkRollNumberModal
        isOpen={showBulkRollNumber}
        onClose={() => setShowBulkRollNumber(false)}
        onUpdateComplete={() => refreshStudents()}
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
    </div >
  );
};

export default Students;
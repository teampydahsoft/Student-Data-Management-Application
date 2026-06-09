import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Layers,
  RefreshCcw,
  ToggleLeft,
  ToggleRight,
  Settings2,
  Landmark,
  BookOpen,
  Pencil,
  Trash2,
  CalendarDays,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  GraduationCap,
  FileText,
  Calendar,
  Bell,
  TrendingUp,
  Layout,
  QrCode,
  CheckSquare,
  Square,
  Save,
  Lock,
  Unlock,
  Users,
  Tags,
  Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import LoadingAnimation from '../components/LoadingAnimation';
import { SkeletonBox, SkeletonList, SkeletonCard } from '../components/SkeletonLoader';
import useAuthStore from '../store/authStore';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import AcademicCalendar from '../components/AcademicCalendar';
import NotificationSettings from '../components/NotificationSettings';
import CollegeTransfer from './CollegeTransfer';
import StudentPortalLayoutSettings from '../components/StudentPortalLayoutSettings';
import { isFullAccessRole } from '../constants/rbac';
import { hasModuleAccess, FRONTEND_MODULES } from '../constants/rbac';
import { formatDateToLocalISO } from '../utils/dateUtils';
import TargetSelector from '../components/TargetSelector';
import { emptyHolidayTargets, formatHolidayScope } from '../utils/holidayTargeting';

// Field categorization function (same as PublicForm.jsx)
const BASIC_FIELDS = [
  'student_name', 'student name', 'name', 'studentname',
  'father_name', 'father name', 'father', 'fathername',
  'gender', 'm/f', 'sex', 'mf',
  'dob', 'date of birth', 'birth date', 'birthday', 'date-month-year', 'date month year',
  'adhar_no', 'adhar number', 'aadhar', 'aadhar no', 'aadhar number', 'adhar', 'aadhar_no', 'aadhar no',
  'pin_no', 'pin number', 'pin', 'pinno',
  'apaar', 'apaar id', 'apaar_id', 'apaar number', 'apaar no', 'apaarid',
  'mother_name', 'mother name', 'mother', 'mothername',
  'admission_no', 'admission number', 'admission', 'admissionno'
];
const ACADEMIC_FIELDS = [
  'college', 'college name', 'collegename',
  'batch', 'academic year', 'batch year', 'admission year', 'admission year (ex:', 'admission year ex', 'admission year (ex: 09-sep-2003)',
  'course', 'course name', 'coursename',
  'branch', 'branch name', 'specialization', 'branchname',
  'current_year', 'current academic year', 'current year', 'year', 'currentyear',
  'current_semester', 'current semester', 'semester', 'currentsemester',
  'stud_type', 'student type', 'student_type', 'type', 'studtype',
  'student_status', 'student status', 'status', 'studentstatus',
  'scholar_status', 'scholar status', 'scholarship status', 'scholarstatus',
  'previous_college', 'previous college', 'previous college name', 'previous_college_name', 'previouscollege'
];
const CONTACT_FIELDS = [
  'student_mobile', 'student mobile', 'student mobile number', 'student phone', 'mobile', 'studentmobile',
  'parent_mobile1', 'parent mobile1', 'parent mobile 1', 'parent mobile number 1', 'parent phone 1', 'parentmobile1',
  'parent_mobile2', 'parent mobile2', 'parent mobile 2', 'parent mobile number 2', 'parent phone 2', 'parentmobile2',
  'phone', 'contact', 'telephone', 'mobile number', 'mobilenumber'
];
const ADDRESS_FIELDS = [
  'student_address', 'student address', 'address', 'full address', 'permanent address', 'studentaddress',
  'city_village', 'city village', 'city/village', 'city village name', 'city or village', 'cityvillage', 'city/village name', 'cityvillage name',
  'mandal_name', 'mandal name', 'mandal', 'mandalname',
  'district', 'district name', 'districtname',
  'state', 'state name', 'statename',
  'pincode', 'pin code', 'postal code', 'zip code', 'pincode'
];
const ADDITIONAL_FIELDS = [
  'caste', 'category',
  'certificates_status', 'certificate status', 'certificates status', 'cert status', 'certificatesstatus',
  'remarks', 'remark', 'notes', 'note', 'comments', 'comment',
  'student_photo', 'student photo', 'photo', 'image', 'picture', 'profile picture', 'studentphoto',
  'certificate', 'document'
];

const categorizeField = (field) => {
  const key = field.key?.toLowerCase() || '';
  const label = field.label?.toLowerCase() || '';

  const normalize = (str) => {
    return str
      .replace(/[()]/g, ' ')
      .replace(/\([^)]*\)/g, '')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const normalizedKey = normalize(key);
  const normalizedLabel = normalize(label);

  const matches = (pattern) => {
    const normalizedPattern = normalize(pattern);
    return normalizedKey.includes(normalizedPattern) ||
      normalizedLabel.includes(normalizedPattern) ||
      normalizedKey.startsWith(normalizedPattern) ||
      normalizedLabel.startsWith(normalizedPattern) ||
      normalizedKey === normalizedPattern ||
      normalizedLabel === normalizedPattern;
  };

  if (ACADEMIC_FIELDS.some(matches)) return 'academic';
  if (ADDRESS_FIELDS.some(matches)) return 'address';
  if (BASIC_FIELDS.some(matches)) return 'basic';
  if (CONTACT_FIELDS.some(matches)) return 'contact';
  if (ADDITIONAL_FIELDS.some(matches)) return 'additional';

  return 'other';
};

const formatDateInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    const today = new Date();
    return formatDateToLocalISO(today);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// Calendar helper functions
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_META = {
  submitted: { label: 'Submitted', badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  not_marked: { label: 'Not marked', badgeClass: 'bg-rose-100 text-rose-700 border border-rose-200' },
  pending: { label: 'Pending', badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200' },
  upcoming: { label: 'Upcoming', badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200' }
};

const parseMonthKey = (monthKey) => {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return { year, month };
};

const buildCalendarMatrix = (monthKey) => {
  const parts = parseMonthKey(monthKey);
  if (!parts) return [];
  const { year, month } = parts;
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = firstDay.getUTCDay();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells = [];
  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const isCurrentMonth = dayOffset >= 1 && dayOffset <= daysInMonth;
    const isoDate = `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cellDate.getUTCDate()).padStart(2, '0')}`;
    cells.push({ index, isCurrentMonth, isoDate, day: cellDate.getUTCDate(), weekday: cellDate.getUTCDay() });
  }
  return cells;
};

const formatIsoDate = (isoDate, formatOptions = {}) => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, formatOptions);
};

const defaultCourseForm = {
  name: '',
  code: '',
  level: 'ug', // diploma, ug, pg
  totalYears: 4,
  semestersPerYear: 2,
  usePerYearConfig: false, // Toggle for per-year configuration
  yearSemesterConfig: [], // Array of {year: number, semesters: number}
  isActive: true
};

const courseUsesPerYearConfig = (course) =>
  Array.isArray(course?.yearSemesterConfig) && course.yearSemesterConfig.length > 0;

const formatCourseStructureSummary = (course) => {
  const years = course?.totalYears ?? 0;
  if (courseUsesPerYearConfig(course)) {
    const perYear = course.yearSemesterConfig
      .map((y) => `Y${y.year}: ${y.semesters} sem`)
      .join(' · ');
    return `${years}yr · ${perYear}`;
  }
  return `${years}yr · ${course?.semestersPerYear ?? 2} sem/year`;
};

const buildYearSemesterConfigForYears = (totalYears, defaultSemesters, existingConfig = []) => {
  return Array.from({ length: totalYears }, (_, index) => {
    const year = index + 1;
    const existing =
      existingConfig.find((c) => Number(c.year) === year) || existingConfig[index];
    return {
      year,
      semesters:
        existing && Number(existing.semesters) > 0
          ? Number(existing.semesters)
          : defaultSemesters
    };
  });
};

const buildCourseDraftFromCourse = (course) => {
  const totalYears = Number(course.totalYears) || 4;
  const semestersPerYear = Number(course.semestersPerYear) || 2;
  const usePerYearConfig = courseUsesPerYearConfig(course);
  return {
    name: course.name,
    code: course.code || '',
    level: course.level || 'ug',
    collegeId: course.collegeId,
    totalYears,
    semestersPerYear,
    usePerYearConfig,
    yearSemesterConfig: usePerYearConfig
      ? course.yearSemesterConfig.map((y) => ({
        year: Number(y.year),
        semesters: Number(y.semesters)
      }))
      : buildYearSemesterConfigForYears(totalYears, semestersPerYear),
    feeQrImageUrl: course.feeQrImageUrl || null,
    feeQrFile: null,
    feeQrPreview: null
  };
};

const getApiAssetUrl = (relativePath) => {
  if (!relativePath) return null;
  const baseURL = (api.defaults.baseURL || '/api').replace(/\/api$/, '');
  return `${baseURL}${relativePath}`;
};

const buildCourseAcademicUpdates = (draft) => {
  const totalYears = Number(draft.totalYears);
  if (!totalYears || totalYears <= 0) {
    return { error: 'Total years must be greater than zero' };
  }

  const usePerYear = Boolean(draft.usePerYearConfig);
  if (!usePerYear) {
    const semestersPerYear = Number(draft.semestersPerYear);
    if (!semestersPerYear || semestersPerYear <= 0) {
      return { error: 'Semesters per year must be greater than zero' };
    }
    return {
      updates: {
        totalYears,
        semestersPerYear,
        yearSemesterConfig: null
      }
    };
  }

  const config = draft.yearSemesterConfig;
  if (!Array.isArray(config) || config.length !== totalYears) {
    return { error: `Please configure semesters for all ${totalYears} years` };
  }

  const validConfig = config.filter(
    (entry) =>
      entry &&
      Number.isFinite(Number(entry.year)) &&
      Number.isFinite(Number(entry.semesters)) &&
      Number(entry.semesters) > 0
  );
  if (validConfig.length !== totalYears) {
    return { error: 'Invalid year semester configuration. Please check all years are configured.' };
  }

  const semestersPerYear = Number(draft.semestersPerYear) || 2;
  return {
    updates: {
      totalYears,
      semestersPerYear,
      yearSemesterConfig: validConfig.map((entry) => ({
        year: Number(entry.year),
        semesters: Number(entry.semesters)
      }))
    }
  };
};

const CourseAcademicStructureFields = ({ value, onChange, idPrefix = 'course' }) => {
  const totalYears = value.totalYears ?? 4;
  const semestersPerYear = value.semestersPerYear ?? 2;
  const usePerYearConfig = Boolean(value.usePerYearConfig);
  const yearSemesterConfig = value.yearSemesterConfig || [];
  const checkboxId = `${idPrefix}-usePerYearConfig`;

  const handleTotalYearsChange = (rawYears) => {
    const years = parseInt(rawYears, 10) || 1;
    const defaultSemesters = parseInt(semestersPerYear, 10) || 2;
    onChange({
      totalYears: years,
      yearSemesterConfig: usePerYearConfig
        ? buildYearSemesterConfigForYears(years, defaultSemesters, yearSemesterConfig)
        : []
    });
  };

  const handlePerYearToggle = (checked) => {
    if (checked) {
      const years = parseInt(totalYears, 10) || 4;
      const defaultSemesters = parseInt(semestersPerYear, 10) || 2;
      onChange({
        usePerYearConfig: true,
        yearSemesterConfig: buildYearSemesterConfigForYears(
          years,
          defaultSemesters,
          yearSemesterConfig
        )
      });
      return;
    }
    onChange({ usePerYearConfig: false });
  };

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Total Years <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min={1}
          max={10}
          value={totalYears}
          onChange={(e) => handleTotalYearsChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          required
        />
      </div>

      {!usePerYearConfig && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Semesters Per Year <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={4}
            value={semestersPerYear}
            onChange={(e) => onChange({ semestersPerYear: e.target.value })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Same number of semesters for all years. Promotion advances by semester, then year.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id={checkboxId}
          checked={usePerYearConfig}
          onChange={(e) => handlePerYearToggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <label htmlFor={checkboxId} className="text-sm text-gray-700 cursor-pointer">
          Configure semesters per year (e.g. Year 1: 1 sem → promotes directly to Year 2)
        </label>
      </div>

      {usePerYearConfig && yearSemesterConfig.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 text-sm font-medium text-gray-700">Semesters per year</div>
          <div className="space-y-3">
            {yearSemesterConfig.map((yearConfig, index) => (
              <div
                key={`year-${yearConfig.year}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
              >
                <span className="w-20 text-sm font-medium text-gray-700">
                  Year {yearConfig.year}:
                </span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={yearConfig.semesters ?? 2}
                  onChange={(e) => {
                    const semesters = parseInt(e.target.value, 10) || 1;
                    const config = [...yearSemesterConfig];
                    if (config[index]) {
                      config[index] = { ...config[index], semesters };
                    }
                    onChange({ yearSemesterConfig: config });
                  }}
                  className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
                <span className="text-sm text-gray-600">semester(s)</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            When a year has only 1 semester, promotion moves the student to the next year (not another semester in the same year).
          </p>
        </div>
      )}
    </>
  );
};
const FREEZABLE_FIELDS = [
  {
    group: 'Personal Information', fields: [
      { key: 'student_name', label: 'Student Name' },
      { key: 'father_name', label: 'Father Name' },
      { key: 'mother_name', label: 'Mother Name' },
      { key: 'gender', label: 'Gender' },
      { key: 'dob', label: 'Date of Birth' },
      { key: 'adhar_no', label: 'Aadhar Number' },
      { key: 'apaar_id', label: 'APAAR ID' },
      { key: 'caste', label: 'Caste' },
      { key: 'stud_type', label: 'Student Type' }
    ]
  },
  {
    group: 'Academic Details', fields: [
      { key: 'pin_no', label: 'Student PIN' },
      { key: 'batch', label: 'Batch' },
      { key: 'college', label: 'College' },
      { key: 'course', label: 'Course / Program' },
      { key: 'branch', label: 'Branch / Specialization' },
      { key: 'current_year', label: 'Current Year' },
      { key: 'current_semester', label: 'Current Semester' },
      { key: 'student_status', label: 'Student Status' },
      { key: 'admission_no', label: 'Admission Number' },
      { key: 'admission_date', label: 'Admission Date' },
      { key: 'previous_college', label: 'Previous College' }
    ]
  },
  {
    group: 'Contact & Address Information', fields: [
      { key: 'student_mobile', label: 'Student Mobile' },
      { key: 'parent_mobile1', label: 'Parent Mobile 1' },
      { key: 'parent_mobile2', label: 'Parent Mobile 2' },
      { key: 'student_address', label: 'Full Address' },
      { key: 'city_village', label: 'City/Village' },
      { key: 'mandal_name', label: 'Mandal' },
      { key: 'district', label: 'District' }
    ]
  },
  {
    group: 'Administrative Information', fields: [
      { key: 'scholar_status', label: 'Scholar Status' },
      { key: 'fee_status', label: 'Fee Status' },
      { key: 'registration_status', label: 'Registration Status' },
      { key: 'certificates_status', label: 'Certificate Status' }
    ]
  }
];

const Settings = () => {
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState(null);
  const [editingCollegeId, setEditingCollegeId] = useState(null);
  const [savingCollegeId, setSavingCollegeId] = useState(null);
  const [creatingCollege, setCreatingCollege] = useState(false);
  const [newCollege, setNewCollege] = useState({ name: '', code: '', address: '', isActive: true });
  const [isAddCollegeModalOpen, setIsAddCollegeModalOpen] = useState(false);
  const [collegeDrafts, setCollegeDrafts] = useState({});

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourse, setNewCourse] = useState(defaultCourseForm);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [courseDrafts, setCourseDrafts] = useState({});
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [savingCourseId, setSavingCourseId] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [courseBranches, setCourseBranches] = useState({});
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchForms, setBranchForms] = useState({});
  const [branchDrafts, setBranchDrafts] = useState({});
  const [editingBranch, setEditingBranch] = useState(null);
  const [savingBranchId, setSavingBranchId] = useState(null);
  const [branchBatchFilter, setBranchBatchFilter] = useState(''); // Filter branches by batch
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [branchModalCourseId, setBranchModalCourseId] = useState(null);
  const [newBranch, setNewBranch] = useState({ name: '', code: '' });

  // Academic Years state
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearsLoading, setAcademicYearsLoading] = useState(false);
  const [creatingAcademicYear, setCreatingAcademicYear] = useState(false);
  const [newAcademicYear, setNewAcademicYear] = useState({ yearLabel: '', startDate: '', endDate: '' });
  const [editingAcademicYearId, setEditingAcademicYearId] = useState(null);
  const [academicYearDrafts, setAcademicYearDrafts] = useState({});
  const [savingAcademicYearId, setSavingAcademicYearId] = useState(null);

  // Student Quotas state
  const [studentQuotas, setStudentQuotas] = useState([]);
  const [quotasLoading, setQuotasLoading] = useState(false);
  const [creatingQuota, setCreatingQuota] = useState(false);
  const [newQuota, setNewQuota] = useState({ name: '', code: '' });
  const [editingQuotaId, setEditingQuotaId] = useState(null);
  const [quotaDrafts, setQuotaDrafts] = useState({});
  const [savingQuotaId, setSavingQuotaId] = useState(null);

  // Registration Forms state
  const [registrationForms, setRegistrationForms] = useState([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [savingFormId, setSavingFormId] = useState(null);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [isEditingForm, setIsEditingForm] = useState(false);
  const [formEditData, setFormEditData] = useState({
    formName: '',
    formDescription: '',
    formFields: []
  });

  // Field types for form builder
  const FIELD_TYPES = [
    { key: 'text', label: 'Text', icon: '📝' },
    { key: 'email', label: 'Email', icon: '📧' },
    { key: 'tel', label: 'Phone', icon: '📱' },
    { key: 'number', label: 'Number', icon: '🔢' },
    { key: 'date', label: 'Date', icon: '📅' },
    { key: 'textarea', label: 'Text Area', icon: '📄' },
    { key: 'select', label: 'Dropdown', icon: '📋' },
    { key: 'radio', label: 'Radio', icon: '🔘' },
    { key: 'checkbox', label: 'Checkbox', icon: '☑️' },
    { key: 'file', label: 'File Upload', icon: '📎' }
  ];

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    type: null, // 'college', 'course', 'branch', or 'academicYear'
    item: null,
    onConfirm: null,
    affectedStudents: [],
    totalStudentCount: 0,
    hasMoreStudents: false,
    isLoadingStudents: false
  });
  const [activeSection, setActiveSection] = useState('courses'); // 'courses', 'calendar', 'academic-calendar', 'forms', 'notifications', 'qr-config'

  // QR Config state
  const [qrRoleConfigs, setQrRoleConfigs] = useState({}); // { roleKey: ['field1', 'field2'] }
  const [qrPublicFields, setQrPublicFields] = useState([]); // fields shown WITHOUT login
  const [qrAvailableFields, setQrAvailableFields] = useState([]);
  const [qrConfigLoading, setQrConfigLoading] = useState(false);
  const [qrConfigSaving, setQrConfigSaving] = useState(false);
  const [qrActiveRole, setQrActiveRole] = useState(null); // which role panel is expanded

  // Known RBAC roles for QR config display
  const QR_CONFIGURABLE_ROLES = [
    { key: 'super_admin', label: 'Super Admin', color: 'purple' },
    { key: 'college_principal', label: 'College Principal', color: 'blue' },
    { key: 'college_ao', label: 'College AO', color: 'indigo' },
    { key: 'college_attender', label: 'College Attender', color: 'cyan' },
    { key: 'branch_hod', label: 'Branch HOD', color: 'green' },
    { key: 'office_assistant', label: 'Office Assistant', color: 'orange' },
    { key: 'cashier', label: 'Cashier', color: 'amber' },
  ];

  const fetchQrConfig = async () => {
    try {
      setQrConfigLoading(true);
      const response = await api.get('/settings/qr-config');
      if (response.data.success) {
        setQrRoleConfigs(response.data.data.roleConfigs || {});
        setQrPublicFields(response.data.data.publicFields || []);
        setQrAvailableFields(response.data.data.availableFields || []);
      }
    } catch (error) {
      console.error('Failed to fetch QR config', error);
      toast.error('Failed to load QR configuration');
    } finally {
      setQrConfigLoading(false);
    }
  };

  const saveQrConfig = async () => {
    try {
      setQrConfigSaving(true);
      await api.post('/settings/qr-config', { roleConfigs: qrRoleConfigs, publicFields: qrPublicFields });
      toast.success('QR configuration saved successfully');
    } catch (error) {
      console.error('Failed to save QR config', error);
      toast.error('Failed to save QR configuration');
    } finally {
      setQrConfigSaving(false);
    }
  };

  const toggleQrField = (roleKey, fieldKey) => {
    setQrRoleConfigs(prev => {
      const current = prev[roleKey] || [];
      const isSelected = current.includes(fieldKey);
      return {
        ...prev,
        [roleKey]: isSelected
          ? current.filter(f => f !== fieldKey)
          : [...current, fieldKey]
      };
    });
  };

  const toggleAllQrFields = (roleKey) => {
    setQrRoleConfigs(prev => {
      const current = prev[roleKey] || [];
      const allSelected = current.length === qrAvailableFields.length;
      return {
        ...prev,
        [roleKey]: allSelected ? [] : qrAvailableFields.map(f => f.key)
      };
    });
  };

  const toggleQrPublicField = (fieldKey) => {
    setQrPublicFields(prev =>
      prev.includes(fieldKey) ? prev.filter(f => f !== fieldKey) : [...prev, fieldKey]
    );
  };

  const toggleAllQrPublicFields = () => {
    setQrPublicFields(prev =>
      prev.length === qrAvailableFields.length ? [] : qrAvailableFields.map(f => f.key)
    );
  };

  // Helper: render a field checkbox grid for QR config
  const renderQrFieldGrid = (selectedFields, onToggle) => (
    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {qrAvailableFields.map(field => {
        const isSelected = selectedFields.includes(field.key);
        return (
          <label
            key={field.key}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${isSelected
              ? 'bg-teal-50 border-teal-300 text-teal-800'
              : 'bg-white border-gray-200 text-gray-700 hover:border-teal-200 hover:bg-teal-50/50'
              }`}
          >
            <input type="checkbox" checked={isSelected} onChange={() => onToggle(field.key)} className="sr-only" />
            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-teal-500' : 'border-2 border-gray-300'
              }`}>
              {isSelected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-xs font-medium leading-tight">{field.label}</span>
          </label>
        );
      })}
      {qrAvailableFields.length === 0 && (
        <p className="col-span-4 text-sm text-gray-400 py-4 text-center">Loading fields...</p>
      )}
    </div>
  );

  // Certificate Configuration State
  const [certificateConfig, setCertificateConfig] = useState({
    diploma: [
      { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
      { id: '10th_study', name: '10th Study Certificate', required: true }
    ],
    ug: [
      { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
      { id: '10th_study', name: '10th Study Certificate', required: true },
      { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
      { id: 'inter_diploma_study', name: 'Inter/Diploma Study Certificate', required: true }
    ],
    pg: [
      { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
      { id: '10th_study', name: '10th Study Certificate', required: true },
      { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
      { id: 'inter_diploma_study', name: 'Inter/Diploma Study Certificate', required: true },
      { id: 'ug_study', name: 'UG Study Certificate', required: true },
      { id: 'ug_tc', name: 'UG TC (Transfer Certificate)', required: true },
      { id: 'ug_pc', name: 'UG PC (Provisional Certificate)', required: true },
      { id: 'ug_cmm', name: 'UG CMM (Consolidated Marks Memo)', required: true },
      { id: 'ug_od', name: 'UG OD (Original Degree)', required: true }
    ]
  });

  const addCertificate = (type) => {
    const newCert = {
      id: `custom_${Date.now()}`,
      name: '',
      required: false,
      options: []
    };
    setCertificateConfig(prev => ({
      ...prev,
      [type]: [...prev[type], newCert]
    }));
  };

  const removeCertificate = (type, id) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].filter(cert => cert.id !== id)
    }));
  };

  const updateCertificateName = (type, id, name) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert =>
        cert.id === id ? { ...cert, name } : cert
      )
    }));
  };

  const updateCertificateRequired = (type, id, required) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert =>
        cert.id === id ? { ...cert, required } : cert
      )
    }));
  };

  const addCertificateOption = (type, certId) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert =>
        cert.id === certId ? { ...cert, options: [...(cert.options || []), { value: '', type: 'permanent' }] } : cert
      )
    }));
  };

  const updateCertificateOption = (type, certId, optionIndex, value) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert => {
        if (cert.id === certId) {
          const newOptions = [...(cert.options || [])];
          // Handle both old string format and new object format
          if (typeof newOptions[optionIndex] === 'object') {
            newOptions[optionIndex] = { ...newOptions[optionIndex], value };
          } else {
            newOptions[optionIndex] = { value, type: 'permanent' };
          }
          return { ...cert, options: newOptions };
        }
        return cert;
      })
    }));
  };

  const updateCertificateOptionType = (type, certId, optionIndex, optType) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert => {
        if (cert.id === certId) {
          const newOptions = [...(cert.options || [])];
          if (typeof newOptions[optionIndex] === 'object') {
            newOptions[optionIndex] = { ...newOptions[optionIndex], type: optType };
          } else {
            newOptions[optionIndex] = { value: newOptions[optionIndex], type: optType };
          }
          return { ...cert, options: newOptions };
        }
        return cert;
      })
    }));
  };

  const removeCertificateOption = (type, certId, optionIndex) => {
    setCertificateConfig(prev => ({
      ...prev,
      [type]: prev[type].map(cert => {
        if (cert.id === certId) {
          return { ...cert, options: (cert.options || []).filter((_, i) => i !== optionIndex) };
        }
        return cert;
      })
    }));
  };


  // Helper to normalize cert options from old string format to new {value, type} format
  const normalizeCertOptions = (config) => {
    const normalized = {};
    for (const [courseType, certs] of Object.entries(config)) {
      normalized[courseType] = certs.map(cert => ({
        ...cert,
        options: (cert.options || []).map(opt =>
          typeof opt === 'string' ? { value: opt, type: 'permanent' } : opt
        )
      }));
    }
    return normalized;
  };

  const fetchCertificateSettings = async () => {
    try {
      const response = await api.get('/settings/certificates');
      if (response.data.success && response.data.data) {
        setCertificateConfig(normalizeCertOptions(response.data.data));
      }
    } catch (error) {
      console.error('Failed to fetch certificate settings', error);
    }
  };

  const [savingCertificates, setSavingCertificates] = useState(false);

  const saveCertificateSettings = async () => {
    try {
      setSavingCertificates(true);
      await api.put('/settings/certificates', { config: certificateConfig });
      toast.success('Certificate settings saved successfully');
    } catch (error) {
      console.error('Failed to save certificate settings', error);
      toast.error('Failed to save certificate settings');
    } finally {
      setSavingCertificates(false);
    }
  };

  // Frozen Batches State
  const [frozenBatches, setFrozenBatches] = useState({});
  const [allBatches, setAllBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [frozenBatchesLoading, setFrozenBatchesLoading] = useState(false);
  const [savingFrozenBatch, setSavingFrozenBatch] = useState(null);

  // Field-Level Freeze Modal state
  const [freezeConfigModal, setFreezeConfigModal] = useState({
    isOpen: false,
    batch: null,
    selectedFields: []
  });

  // View Students modal state for Freeze Database tab
  const [viewBatchStudentsModal, setViewBatchStudentsModal] = useState({
    isOpen: false,
    batch: null,
    students: [],
    loading: false
  });

  const fetchAllBatches = async () => {
    try {
      setBatchesLoading(true);
      const response = await api.get('/students/batches');
      if (response.data.success) {
        setAllBatches(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch available batches', error);
    } finally {
      setBatchesLoading(false);
    }
  };

  const fetchFrozenBatches = async () => {
    try {
      setFrozenBatchesLoading(true);
      const response = await api.get('/settings/frozen-batches');
      if (response.data.success) {
        setFrozenBatches(response.data.data || {});
      }
    } catch (error) {
      console.error('Failed to fetch frozen batches', error);
    } finally {
      setFrozenBatchesLoading(false);
    }
  };

  const openFreezeConfigModal = (batchStr) => {
    // Treat old array entries as ["ALL"] in case they slip through, but normally it's an object mapping to array
    const existing = frozenBatches[batchStr] || [];
    setFreezeConfigModal({
      isOpen: true,
      batch: batchStr,
      selectedFields: [...existing]
    });
  };

  const saveFreezeConfig = async () => {
    const { batch: batchStr, selectedFields } = freezeConfigModal;

    try {
      setSavingFrozenBatch(batchStr);
      let updatedBatches = { ...frozenBatches };

      if (selectedFields.length === 0) {
        delete updatedBatches[batchStr];
      } else {
        updatedBatches[batchStr] = selectedFields;
      }

      await api.put('/settings/frozen-batches', { batches: updatedBatches });
      setFrozenBatches(updatedBatches);
      toast.success(`Freeze configuration for batch ${batchStr} updated successfully`);
      setFreezeConfigModal({ isOpen: false, batch: null, selectedFields: [] });
    } catch (error) {
      console.error('Failed to update frozen batches', error);
      toast.error('Failed to update frozen batches');
    } finally {
      setSavingFrozenBatch(null);
    }
  };

  const loadBatchStudents = async (batchStr) => {
    setViewBatchStudentsModal({ isOpen: true, batch: batchStr, students: [], loading: true });
    try {
      // Using the existing students endpoint with filter
      const response = await api.get('/students', {
        params: { batch: batchStr, limit: 1000 }
      });
      if (response.data.success) {
        setViewBatchStudentsModal(prev => ({ ...prev, students: response.data.data.students || [], loading: false }));
      } else {
        toast.error('Failed to load students for batch');
        setViewBatchStudentsModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Failed to load batch students', error);
      toast.error('Failed to load students for batch');
      setViewBatchStudentsModal(prev => ({ ...prev, loading: false }));
    }
  };


  // Calendar state
  const [calendarViewMonthKey, setCalendarViewMonthKey] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [calendarViewData, setCalendarViewData] = useState(null);
  const [calendarViewLoading, setCalendarViewLoading] = useState(false);
  const [calendarViewError, setCalendarViewError] = useState(null);
  const [calendarMutationLoading, setCalendarMutationLoading] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [localHolidayTitle, setLocalHolidayTitle] = useState('');
  const [localHolidayDescription, setLocalHolidayDescription] = useState('');
  const [holidayTargetForm, setHolidayTargetForm] = useState(emptyHolidayTargets());
  const calendarCacheRef = useRef(new Map());

  const user = useAuthStore((state) => state.user);
  const isAdmin = isFullAccessRole(user?.role);

  // Fetch colleges from API
  const fetchColleges = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const response = await api.get('/colleges?includeInactive=true');
      const collegeData = response.data.data || [];
      setColleges(collegeData);
      return collegeData;
    } catch (error) {
      console.error('Failed to fetch colleges', error);
      toast.error(error.response?.data?.message || 'Failed to fetch colleges');
      return [];
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Fetch academic years from API
  const fetchAcademicYears = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setAcademicYearsLoading(true);
      }
      const response = await api.get('/academic-years?includeInactive=true');
      const yearData = response.data.data || [];
      setAcademicYears(yearData);
      return yearData;
    } catch (error) {
      console.error('Failed to fetch academic years', error);
      // Don't show error toast - might not have the table yet
      return [];
    } finally {
      if (!silent) {
        setAcademicYearsLoading(false);
      }
    }
  };

  // Academic Year management functions
  const handleCreateAcademicYear = async (event) => {
    event.preventDefault();
    if (!newAcademicYear.yearLabel.trim()) {
      toast.error('Year label is required');
      return;
    }

    try {
      setCreatingAcademicYear(true);
      await api.post('/academic-years', {
        yearLabel: newAcademicYear.yearLabel.trim(),
        startDate: newAcademicYear.startDate || null,
        endDate: newAcademicYear.endDate || null,
        isActive: true
      });

      toast.success('Academic year created successfully');
      setNewAcademicYear({ yearLabel: '', startDate: '', endDate: '' });
      await fetchAcademicYears({ silent: true });
    } catch (error) {
      console.error('Failed to create academic year', error);
      toast.error(error.response?.data?.message || 'Failed to create academic year');
    } finally {
      setCreatingAcademicYear(false);
    }
  };

  const toggleAcademicYearActive = async (year) => {
    try {
      setSavingAcademicYearId(year.id);
      await api.put(`/academic-years/${year.id}`, {
        isActive: !year.isActive
      });
      toast.success(`Academic year ${!year.isActive ? 'activated' : 'deactivated'}`);
      await fetchAcademicYears({ silent: true });
    } catch (error) {
      console.error('Failed to toggle academic year status', error);
      toast.error(error.response?.data?.message || 'Failed to update academic year status');
    } finally {
      setSavingAcademicYearId(null);
    }
  };

  const handleDeleteAcademicYear = (year) => {
    setDeleteModal({
      isOpen: true,
      type: 'academicYear',
      item: year,
      onConfirm: async () => {
        try {
          setSavingAcademicYearId(year.id);
          await api.delete(`/academic-years/${year.id}`);
          toast.success('Academic year deleted successfully');
          await fetchAcademicYears({ silent: true });
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null });
        } catch (error) {
          console.error('Failed to delete academic year', error);
          toast.error(error.response?.data?.message || 'Failed to delete academic year');
        } finally {
          setSavingAcademicYearId(null);
        }
      }
    });
  };

  const fetchStudentQuotas = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setQuotasLoading(true);
      }
      const response = await api.get('/quotas?includeInactive=true');
      setStudentQuotas(response.data.data || []);
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to fetch student quotas', error);
      if (!silent) {
        toast.error(error.response?.data?.message || 'Failed to fetch quotas');
      }
      return [];
    } finally {
      if (!silent) {
        setQuotasLoading(false);
      }
    }
  };

  const handleCreateQuota = async (event) => {
    event.preventDefault();
    const trimmedName = newQuota.name.trim();
    const trimmedCode = newQuota.code.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) {
      toast.error('Quota name and code are required');
      return;
    }

    try {
      setCreatingQuota(true);
      await api.post('/quotas', {
        name: trimmedName,
        code: trimmedCode,
        isActive: true
      });
      toast.success('Quota created successfully');
      setNewQuota({ name: '', code: '' });
      await fetchStudentQuotas({ silent: true });
    } catch (error) {
      console.error('Failed to create quota', error);
      toast.error(error.response?.data?.message || 'Failed to create quota');
    } finally {
      setCreatingQuota(false);
    }
  };

  const startEditingQuota = (quota) => {
    setEditingQuotaId(quota.id);
    setQuotaDrafts((prev) => ({
      ...prev,
      [quota.id]: {
        name: quota.name,
        code: quota.code
      }
    }));
  };

  const cancelEditingQuota = () => {
    setEditingQuotaId(null);
    setQuotaDrafts({});
  };

  const saveQuotaEdits = async (quotaId) => {
    const draft = quotaDrafts[quotaId];
    if (!draft?.name?.trim() || !draft?.code?.trim()) {
      toast.error('Quota name and code are required');
      return;
    }

    try {
      setSavingQuotaId(quotaId);
      await api.put(`/quotas/${quotaId}`, {
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase()
      });
      toast.success('Quota updated successfully');
      setEditingQuotaId(null);
      setQuotaDrafts({});
      await fetchStudentQuotas({ silent: true });
    } catch (error) {
      console.error('Failed to update quota', error);
      toast.error(error.response?.data?.message || 'Failed to update quota');
    } finally {
      setSavingQuotaId(null);
    }
  };

  const toggleQuotaActive = async (quota) => {
    try {
      setSavingQuotaId(quota.id);
      await api.put(`/quotas/${quota.id}`, {
        isActive: !quota.isActive
      });
      toast.success(`Quota ${!quota.isActive ? 'activated' : 'deactivated'}`);
      await fetchStudentQuotas({ silent: true });
    } catch (error) {
      console.error('Failed to toggle quota status', error);
      toast.error(error.response?.data?.message || 'Failed to update quota status');
    } finally {
      setSavingQuotaId(null);
    }
  };

  const handleDeleteQuota = (quota) => {
    setDeleteModal({
      isOpen: true,
      type: 'quota',
      item: quota,
      onConfirm: async () => {
        try {
          setSavingQuotaId(quota.id);
          await api.delete(`/quotas/${quota.id}`);
          toast.success('Quota deleted successfully');
          await fetchStudentQuotas({ silent: true });
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null });
        } catch (error) {
          console.error('Failed to delete quota', error);
          toast.error(error.response?.data?.message || 'Failed to delete quota');
        } finally {
          setSavingQuotaId(null);
        }
      }
    });
  };

  // Fetch registration forms
  const fetchRegistrationForms = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setFormsLoading(true);
      }
      const response = await api.get('/forms');
      setRegistrationForms(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch registration forms', error);
      if (!silent) {
        toast.error('Failed to fetch registration forms');
      }
    } finally {
      if (!silent) {
        setFormsLoading(false);
      }
    }
  };

  // Toggle form active status
  const toggleFormActive = async (form) => {
    try {
      setSavingFormId(form.form_id);
      await api.put(`/forms/${form.form_id}`, { isActive: !form.is_active });
      toast.success(`Form ${!form.is_active ? 'activated' : 'deactivated'}`);
      await fetchRegistrationForms({ silent: true });
    } catch (error) {
      console.error('Failed to toggle form status', error);
      toast.error('Failed to update form status');
    } finally {
      setSavingFormId(null);
    }
  };

  // Delete form
  const handleDeleteForm = (form) => {
    setDeleteModal({
      isOpen: true,
      type: 'form',
      item: form,
      onConfirm: async () => {
        try {
          setSavingFormId(form.form_id);
          await api.delete(`/forms/${form.form_id}`);
          toast.success('Form deleted successfully');
          await fetchRegistrationForms({ silent: true });
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null });
        } catch (error) {
          console.error('Failed to delete form', error);
          toast.error('Failed to delete form');
        } finally {
          setSavingFormId(null);
        }
      }
    });
  };

  // Start editing a form
  const startEditingForm = (form) => {
    let formFields = form.form_fields || [];

    // CRITICAL: Ensure required system fields exist in the form builder
    // These fields are needed for document upload and proper form functionality
    const requiredSystemFields = [
      {
        id: 'system_batch',
        key: 'batch',
        label: 'Batch',
        type: 'select',
        required: true,
        placeholder: 'Select Batch',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_college',
        key: 'college',
        label: 'College',
        type: 'select',
        required: true,
        placeholder: 'Select College',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_course',
        key: 'course',
        label: 'Program',
        type: 'select',
        required: true,
        placeholder: 'Select Program',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_branch',
        key: 'branch',
        label: 'Branch',
        type: 'select',
        required: true,
        placeholder: 'Select Branch',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_current_year',
        key: 'current_year',
        label: 'Current Academic Year',
        type: 'select',
        required: true,
        placeholder: 'Select Year',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_current_semester',
        key: 'current_semester',
        label: 'Current Semester',
        type: 'select',
        required: true,
        placeholder: 'Select Semester',
        options: [],
        isEnabled: true,
        isSystemField: true
      },
      {
        id: 'system_apaar_id',
        key: 'apaar_id',
        label: 'APAAR ID',
        type: 'text',
        required: false,
        placeholder: 'Enter 12-digit APAAR ID',
        options: [],
        isEnabled: true,
        isSystemField: true
      }
    ];

    // Add system fields if they don't exist, or update existing ones to ensure they have isSystemField flag
    requiredSystemFields.forEach(systemField => {
      const existingFieldIndex = formFields.findIndex(f => {
        const fieldKey = (f.key || '').toLowerCase();
        const fieldLabel = (f.label || '').toLowerCase();
        const systemKey = systemField.key.toLowerCase();
        const systemLabel = systemField.label.toLowerCase();

        return fieldKey === systemKey ||
          fieldLabel === systemLabel ||
          fieldKey.includes(systemKey) ||
          fieldLabel.includes(systemLabel);
      });

      if (existingFieldIndex === -1) {
        // Field doesn't exist, add it
        formFields.push(systemField);
        console.log(`➕ Added system field to form builder: ${systemField.label}`);
      } else {
        // Field exists, ensure it has isSystemField flag and preserve its current required status
        const existingField = formFields[existingFieldIndex];
        formFields[existingFieldIndex] = {
          ...existingField,
          isSystemField: true,
          // Preserve existing required status if set, otherwise use system field default
          required: existingField.required !== undefined ? existingField.required : systemField.required
        };
      }
    });

    setFormEditData({
      formName: form.form_name,
      formDescription: form.form_description || '',
      formFields: formFields
    });
    setSelectedFormId(form.form_id);
    setIsEditingForm(true);
  };

  // Cancel editing
  const cancelEditingForm = () => {
    setIsEditingForm(false);
    setFormEditData({ formName: '', formDescription: '', formFields: [] });
  };

  // Update form field
  const updateFormField = (index, field, value) => {
    const updatedFields = [...formEditData.formFields];
    updatedFields[index] = { ...updatedFields[index], [field]: value };
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Toggle field enabled
  const toggleFieldEnabled = (index) => {
    const updatedFields = [...formEditData.formFields];
    updatedFields[index].isEnabled = !updatedFields[index].isEnabled;
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Add field option
  const addFieldOption = (fieldIndex) => {
    const updatedFields = [...formEditData.formFields];
    updatedFields[fieldIndex].options = [...(updatedFields[fieldIndex].options || []), `Option ${(updatedFields[fieldIndex].options?.length || 0) + 1}`];
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Update field option
  const updateFieldOption = (fieldIndex, optionIndex, value) => {
    const updatedFields = [...formEditData.formFields];
    updatedFields[fieldIndex].options[optionIndex] = value;
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Remove field option
  const removeFieldOption = (fieldIndex, optionIndex) => {
    const updatedFields = [...formEditData.formFields];
    updatedFields[fieldIndex].options = updatedFields[fieldIndex].options.filter((_, i) => i !== optionIndex);
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Add new field
  const addFormField = (fieldType) => {
    const newField = {
      id: Date.now().toString(),
      key: `field_${Date.now()}`,
      label: '',
      type: fieldType,
      required: false,
      placeholder: '',
      options: fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox' ? ['Option 1', 'Option 2'] : [],
      isEnabled: true
    };
    setFormEditData({
      ...formEditData,
      formFields: [...formEditData.formFields, newField]
    });
  };

  // Remove field
  const removeFormField = (index) => {
    const updatedFields = formEditData.formFields.filter((_, i) => i !== index);
    setFormEditData({ ...formEditData, formFields: updatedFields });
  };

  // Save form
  const saveFormChanges = async () => {
    if (!formEditData.formName.trim()) {
      toast.error('Form name is required');
      return;
    }

    for (let i = 0; i < formEditData.formFields.length; i++) {
      const field = formEditData.formFields[i];
      if (!field.label.trim()) {
        toast.error(`Field ${i + 1} label is required`);
        return;
      }
    }

    try {
      setSavingFormId(selectedFormId);
      await api.put(`/forms/${selectedFormId}`, {
        formName: formEditData.formName,
        formDescription: formEditData.formDescription,
        formFields: formEditData.formFields
      });
      toast.success('Form updated successfully');
      setIsEditingForm(false);
      await fetchRegistrationForms({ silent: true });
    } catch (error) {
      console.error('Failed to save form', error);
      toast.error('Failed to save form');
    } finally {
      setSavingFormId(null);
    }
  };

  // Get courses for selected college (filtered by collegeId)
  const coursesForSelectedCollege = useMemo(() => {
    if (!selectedCollegeId) return [];
    return courses.filter(course => course.collegeId === selectedCollegeId);
  }, [courses, selectedCollegeId]);

  // College management functions
  const resetNewCollege = () => {
    setNewCollege({ name: '', code: '', address: '', isActive: true });
    setIsAddCollegeModalOpen(false);
  };

  const handleCreateCollege = async (event) => {
    event.preventDefault();
    if (!newCollege.name.trim()) {
      toast.error('College name is required');
      return;
    }

    if (!newCollege.code?.trim()) {
      toast.error('College code is required');
      return;
    }

    try {
      setCreatingCollege(true);
      const response = await api.post('/colleges', {
        name: newCollege.name.trim(),
        code: newCollege.code.trim(),
        address: newCollege.address?.trim() || null,
        isActive: newCollege.isActive !== undefined ? newCollege.isActive : true
      });

      const createdCollege = response.data.data;
      toast.success('College created successfully');
      resetNewCollege();
      await fetchColleges({ silent: true });
      setSelectedCollegeId(createdCollege.id);
    } catch (error) {
      console.error('Failed to create college', error);
      const errorMessage = error.response?.data?.message || 'Failed to create college';
      if (errorMessage.includes('already exists')) {
        toast.error('College with this name or code already exists');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setCreatingCollege(false);
    }
  };


  const cancelEditCollege = (collegeId) => {
    setEditingCollegeId(null);
    setCollegeDrafts(prev => {
      const updated = { ...prev };
      delete updated[collegeId];
      return updated;
    });
  };

  const saveCollegeEdits = async (collegeId) => {
    const draft = collegeDrafts[collegeId];
    if (!draft || !draft.name?.trim()) {
      toast.error('College name is required');
      return;
    }

    try {
      setSavingCollegeId(collegeId);
      const updates = {};
      if (draft.name !== undefined) updates.name = draft.name.trim();
      if (draft.code !== undefined) {
        if (!draft.code || !draft.code.trim()) {
          toast.error('College code is required');
          return;
        }
        updates.code = draft.code.trim();
      }
      if (draft.address !== undefined) {
        updates.address = draft.address?.trim() || null;
      }

      await api.put(`/colleges/${collegeId}`, updates);
      toast.success('College updated successfully');
      await fetchColleges({ silent: true });
      cancelEditCollege(collegeId);
    } catch (error) {
      console.error('Failed to update college', error);
      const errorMessage = error.response?.data?.message || 'Failed to update college';
      if (errorMessage.includes('already exists')) {
        toast.error('College with this name or code already exists');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setSavingCollegeId(null);
    }
  };

  const toggleCollegeActive = async (college) => {
    try {
      setSavingCollegeId(college.id);
      await api.put(`/colleges/${college.id}`, {
        isActive: !college.isActive
      });
      toast.success(`College ${!college.isActive ? 'activated' : 'deactivated'}`);
      await fetchColleges({ silent: true });
    } catch (error) {
      console.error('Failed to toggle college status', error);
      toast.error(error.response?.data?.message || 'Failed to update college status');
    } finally {
      setSavingCollegeId(null);
    }
  };

  const handleDeleteCollege = async (college) => {
    // Show modal with loading state first
    setDeleteModal({
      isOpen: true,
      type: 'college',
      item: college,
      affectedStudents: [],
      totalStudentCount: 0,
      hasMoreStudents: false,
      isLoadingStudents: true,
      onConfirm: async () => {
        try {
          setSavingCollegeId(college.id);
          const response = await api.delete(`/colleges/${college.id}?cascade=true`);
          const deletedCount = response.data.deletedStudents || 0;
          toast.success(`College deleted successfully${deletedCount > 0 ? ` along with ${deletedCount} student record(s)` : ''}`);
          await fetchColleges({ silent: true });
          if (selectedCollegeId === college.id) {
            setSelectedCollegeId(null);
            setSelectedCourseId(null);
          }
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null, affectedStudents: [], totalStudentCount: 0, hasMoreStudents: false, isLoadingStudents: false });
        } catch (error) {
          console.error('Failed to delete college', error);
          toast.error(error.response?.data?.message || 'Failed to delete college');
        } finally {
          setSavingCollegeId(null);
        }
      }
    });

    // Fetch affected students
    try {
      const response = await api.get(`/colleges/${college.id}/affected-students`);
      const { students, totalCount, hasMore } = response.data.data || {};
      setDeleteModal(prev => ({
        ...prev,
        affectedStudents: students || [],
        totalStudentCount: totalCount || 0,
        hasMoreStudents: hasMore || false,
        isLoadingStudents: false
      }));
    } catch (error) {
      console.error('Failed to fetch affected students', error);
      setDeleteModal(prev => ({
        ...prev,
        isLoadingStudents: false
      }));
    }
  };

  const updateCollegeDraft = (collegeId, field, value) => {
    setCollegeDrafts(prev => ({
      ...prev,
      [collegeId]: {
        ...(prev[collegeId] || {}),
        [field]: value
      }
    }));
  };

  const handleEditCollege = (college) => {
    setEditingCollegeId(college.id);
    setCollegeDrafts(prev => ({
      ...prev,
      [college.id]: {
        name: college.name,
        code: college.code || '',
        address: college.address || ''
      }
    }));
  };

  const fetchCourses = async ({ silent = false, collegeId = null } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const params = { includeInactive: true };
      if (collegeId) {
        params.collegeId = collegeId;
      }
      const response = await api.get('/courses', { params });
      const courseData = response.data.data || [];
      setCourses(courseData);
      return courseData;
    } catch (error) {
      console.error('Failed to fetch programs', error);
      toast.error(error.response?.data?.message || 'Failed to fetch program configuration');
      return [];
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadBranches = async (courseId) => {
    if (!courseId) {
      return [];
    }

    try {
      setBranchesLoading(true);
      const response = await api.get(`/courses/${courseId}/branches?includeInactive=true`);
      const branchData = response.data.data || [];
      setCourseBranches((prev) => ({
        ...prev,
        [courseId]: branchData
      }));
      return branchData;
    } catch (error) {
      console.error('Failed to fetch branches', error);
      toast.error(error.response?.data?.message || 'Failed to fetch branches');
      return [];
    } finally {
      setBranchesLoading(false);
    }
  };

  // Calendar functions
  const fetchCalendarMonth = async (monthKey, options = {}) => {
    if (!monthKey) return null;
    const { force = false, applyToModal = false } = options;

    if (!force && calendarCacheRef.current.has(monthKey)) {
      const cached = calendarCacheRef.current.get(monthKey);
      if (applyToModal) {
        setCalendarViewData(cached);
      }
      return cached;
    }

    const loadingSetter = applyToModal ? setCalendarViewLoading : null;
    const errorSetter = applyToModal ? setCalendarViewError : null;

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
        publicHolidays: Array.isArray(payload.publicHolidays) ? payload.publicHolidays : [],
        customHolidays: Array.isArray(payload.customHolidays) ? payload.customHolidays : [],
        attendanceStatus:
          payload.attendanceStatus && typeof payload.attendanceStatus === 'object'
            ? payload.attendanceStatus
            : {},
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        fromCache: Boolean(payload.fromCache)
      };

      calendarCacheRef.current.set(normalized.month, normalized);
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
    setCalendarViewData((prev) => (prev?.month === monthKey ? fallback : prev));
    return fallback;
  };

  const handleCalendarMonthChange = (newMonthKey) => {
    if (!newMonthKey) return;
    setCalendarViewError(null);
    setCalendarViewMonthKey(newMonthKey);
  };

  const handleCalendarDateSelect = (date) => {
    if (!date) return;
    setSelectedCalendarDate(date);
    setLocalHolidayTitle('');
    setLocalHolidayDescription('');
    setHolidayTargetForm(emptyHolidayTargets());
  };

  const handleCreateInstituteHoliday = async ({
    date,
    title,
    description,
    target_college,
    target_batch,
    target_course,
    target_branch,
    target_year,
    target_semester
  }) => {
    if (!date) return;
    setCalendarMutationLoading(true);
    try {
      const response = await api.post('/calendar/custom-holidays', {
        date,
        title,
        description,
        target_college,
        target_batch,
        target_course,
        target_branch,
        target_year,
        target_semester
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save holiday');
      }

      const savedHoliday = response.data.data;
      const holidayMonthKey = getMonthKeyFromDate(savedHoliday?.date || date);

      await fetchCalendarMonth(holidayMonthKey, {
        applyToModal: activeSection === 'calendar' && holidayMonthKey === calendarViewMonthKey,
        force: true
      });

      toast.success('Institute holiday saved');
      setLocalHolidayTitle('');
      setLocalHolidayDescription('');
      setHolidayTargetForm(emptyHolidayTargets());
    } catch (error) {
      console.error('Failed to save custom holiday:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to save holiday');
    } finally {
      setCalendarMutationLoading(false);
    }
  };

  const handleRemoveInstituteHoliday = async (holidayId) => {
    if (!holidayId) return;
    setCalendarMutationLoading(true);
    try {
      const response = await api.delete(`/calendar/custom-holidays/${holidayId}`);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to remove holiday');
      }

      const monthKey = calendarViewMonthKey || getMonthKeyFromDate(selectedCalendarDate);

      await fetchCalendarMonth(monthKey, {
        applyToModal: activeSection === 'calendar' && monthKey === calendarViewMonthKey,
        force: true
      });

      toast.success('Institute holiday removed');
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

  useEffect(() => {
    const initializeData = async () => {
      await fetchColleges();
      await fetchCourses();
      await fetchAcademicYears();
      await fetchStudentQuotas();
      await fetchRegistrationForms();
      await fetchCertificateSettings();
      await fetchAllBatches();
      await fetchFrozenBatches();
    };
    initializeData();
  }, []);

  useEffect(() => {
    // Auto-select first college if none selected
    if (colleges.length > 0 && !selectedCollegeId) {
      setSelectedCollegeId(colleges[0].id);
    }
  }, [colleges, selectedCollegeId]);

  useEffect(() => {
    // Fetch ALL courses so Academic Calendar has programs for any college.
    // Colleges section filters client-side via coursesForSelectedCollege.
    fetchCourses();
  }, [selectedCollegeId]);

  useEffect(() => {
    if (coursesForSelectedCollege.length === 0) {
      setSelectedCourseId(null);
      return;
    }

    const hasSelected = coursesForSelectedCollege.some((course) => course.id === selectedCourseId);
    if (!hasSelected) {
      const firstCourseId = coursesForSelectedCollege[0]?.id;
      if (firstCourseId) {
        setSelectedCourseId(firstCourseId);
        loadBranches(firstCourseId);
      }
    }
  }, [coursesForSelectedCollege, selectedCourseId]);

  const selectedCourse = useMemo(
    () => coursesForSelectedCollege.find((course) => course.id === selectedCourseId) || null,
    [coursesForSelectedCollege, selectedCourseId]
  );

  const selectedCollege = useMemo(
    () => colleges.find((college) => college.id === selectedCollegeId) || null,
    [colleges, selectedCollegeId]
  );

  useEffect(() => {
    if (!selectedCourse) {
      setEditingCourseId(null);
      setEditingBranch(null);
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (activeSection !== 'calendar') return;
    if (!calendarViewMonthKey) return;
    fetchCalendarMonth(calendarViewMonthKey, { applyToModal: true }).catch(() => {
      ensureCalendarFallback(calendarViewMonthKey);
    });
  }, [activeSection, calendarViewMonthKey]);

  // Handle body scroll when modal is open/closed
  useEffect(() => {
    if (isAddCourseModalOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable body scroll when modal closes
      document.body.style.overflow = '';
    }

    return () => {
      // Cleanup: re-enable body scroll
      document.body.style.overflow = '';
    };
  }, [isAddCourseModalOpen]);

  const resetNewCourse = () => {
    setNewCourse(defaultCourseForm);
    setIsAddCourseModalOpen(false);
  };

  const handleCreateCourse = async (event) => {
    event.preventDefault();

    const collegeIdToUse = selectedCollegeId || (selectedCollege?.id);

    if (!collegeIdToUse) {
      toast.error('Please select a college first');
      setIsAddCourseModalOpen(false);
      return;
    }

    if (!newCourse.name.trim()) {
      toast.error('Program name is required');
      return;
    }

    if (!newCourse.code?.trim()) {
      toast.error('Program code is required');
      return;
    }

    const academicResult = buildCourseAcademicUpdates(newCourse);
    if (academicResult.error) {
      toast.error(academicResult.error);
      return;
    }

    const { semestersPerYear } = academicResult.updates;
    if (!semestersPerYear || semestersPerYear <= 0 || semestersPerYear > 4) {
      toast.error('Semesters per year must be between 1 and 4');
      return;
    }

    try {
      setCreatingCourse(true);

      const payload = {
        name: newCourse.name.trim(),
        code: newCourse.code.trim(),
        level: newCourse.level || 'ug',
        collegeId: collegeIdToUse,
        isActive: newCourse.isActive,
        ...academicResult.updates
      };

      const response = await api.post('/courses', payload);
      toast.success('Program created successfully');
      const createdCourse = response.data?.data;
      resetNewCourse();
      const updatedCourses = await fetchCourses({ silent: true, collegeId: collegeIdToUse });
      const nextSelectedId = createdCourse?.id || updatedCourses[0]?.id || null;
      if (nextSelectedId) {
        setSelectedCourseId(nextSelectedId);
        await loadBranches(nextSelectedId);
      }
    } catch (error) {
      console.error('Failed to create program', error);
      const errorMessage = error.response?.data?.message || 'Failed to create program';
      if (errorMessage.includes('College not found')) {
        toast.error('Selected college not found. Please refresh and try again.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setCreatingCourse(false);
    }
  };

  const handleSelectCourse = async (courseId) => {
    if (!courseId) {
      return;
    }

    if (courseId === selectedCourseId) {
      await loadBranches(courseId);
      return;
    }

    setSelectedCourseId(courseId);
    setEditingCourseId(null);
    setEditingBranch(null);
    await loadBranches(courseId);
  };

  const handleRefresh = async () => {
    await fetchColleges({ silent: true });
    await fetchAcademicYears({ silent: true });
    await fetchStudentQuotas({ silent: true });
    await fetchRegistrationForms({ silent: true });
    const updatedCourses = await fetchCourses({ silent: true, collegeId: selectedCollegeId });
    if (selectedCourseId && updatedCourses.some((course) => course.id === selectedCourseId)) {
      await loadBranches(selectedCourseId);
    }
  };

  const toggleCourseActive = async (course) => {
    try {
      setSavingCourseId(course.id);
      await api.put(`/courses/${course.id}`, {
        isActive: !course.isActive
      });
      toast.success(`Program ${!course.isActive ? 'activated' : 'deactivated'}`);
      await fetchCourses({ silent: true });
      if (selectedCourseId === course.id) {
        await loadBranches(course.id);
      }
    } catch (error) {
      console.error('Failed to toggle program status', error);
      toast.error(error.response?.data?.message || 'Failed to update program status');
    } finally {
      setSavingCourseId(null);
    }
  };

  const handleDeleteCourse = async (course) => {
    // Show modal with loading state first
    setDeleteModal({
      isOpen: true,
      type: 'course',
      item: course,
      affectedStudents: [],
      totalStudentCount: 0,
      hasMoreStudents: false,
      isLoadingStudents: true,
      onConfirm: async () => {
        try {
          setSavingCourseId(course.id);
          const response = await api.delete(`/courses/${course.id}?cascade=true`);
          const deletedCount = response.data.deletedStudents || 0;
          toast.success(`Program deleted successfully${deletedCount > 0 ? ` along with ${deletedCount} student record(s)` : ''}`);

          // Clear selection if deleted course was selected
          if (selectedCourseId === course.id) {
            setSelectedCourseId(null);
            setEditingCourseId(null);
          }

          await fetchCourses({ silent: true });
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null, affectedStudents: [], totalStudentCount: 0, hasMoreStudents: false, isLoadingStudents: false });
        } catch (error) {
          console.error('Failed to delete program', error);
          const errorMessage = error.response?.data?.message || 'Failed to delete program';
          toast.error(errorMessage);
        } finally {
          setSavingCourseId(null);
        }
      }
    });

    // Fetch affected students
    try {
      const response = await api.get(`/courses/${course.id}/affected-students`);
      const { students, totalCount, hasMore } = response.data.data || {};
      setDeleteModal(prev => ({
        ...prev,
        affectedStudents: students || [],
        totalStudentCount: totalCount || 0,
        hasMoreStudents: hasMore || false,
        isLoadingStudents: false
      }));
    } catch (error) {
      console.error('Failed to fetch affected students', error);
      setDeleteModal(prev => ({
        ...prev,
        isLoadingStudents: false
      }));
    }
  };

  const updateCourseDraft = (courseId, field, value) => {
    setCourseDrafts((prev) => ({
      ...prev,
      [courseId]: {
        ...(prev[courseId] || {}),
        [field]: value
      }
    }));
  };

  const handleSelectCollege = async (collegeId) => {
    setSelectedCollegeId(collegeId);
    setSelectedCourseId(null);
    setEditingCourseId(null);
    setEditingBranch(null);
    // Fetch courses for the selected college
    await fetchCourses({ silent: true, collegeId });
  };

  const handleEditCourse = (course) => {
    setEditingCourseId(course.id);
    setCourseDrafts((prev) => ({
      ...prev,
      [course.id]: buildCourseDraftFromCourse(course)
    }));
  };

  const cancelEditCourse = (courseId) => {
    setEditingCourseId(null);
    setCourseDrafts((prev) => {
      const updated = { ...prev };
      delete updated[courseId];
      return updated;
    });
  };

  const saveCourseEdits = async (courseId) => {
    const draft = courseDrafts[courseId];
    if (!draft) {
      toast.error('No changes to save');
      return;
    }

    if (!draft.name || !draft.name.trim()) {
      toast.error('Program name is required');
      return;
    }

    if (!draft.code || !draft.code.trim()) {
      toast.error('Program code is required');
      return;
    }

    const academicResult = buildCourseAcademicUpdates(draft);
    if (academicResult.error) {
      toast.error(academicResult.error);
      return;
    }

    try {
      setSavingCourseId(courseId);
      const updates = {
        name: draft.name.trim(),
        code: draft.code.trim(),
        level: draft.level || 'ug',
        ...academicResult.updates
      };

      // Include collegeId if it was changed
      if (draft.collegeId !== undefined) {
        updates.collegeId = draft.collegeId;
      }

      if (draft.feeQrFile) {
        const formData = new FormData();
        formData.append('feeQr', draft.feeQrFile);
        await api.post(`/courses/${courseId}/upload-fee-qr`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      await api.put(`/courses/${courseId}`, updates);
      toast.success('Program updated successfully');
      await fetchCourses({ silent: true, collegeId: selectedCollegeId });
      await loadBranches(courseId);
      cancelEditCourse(courseId);
    } catch (error) {
      console.error('Failed to update program', error);
      const errorMessage = error.response?.data?.message || 'Failed to update program';
      if (errorMessage.includes('College not found')) {
        toast.error('Selected college not found. Please refresh and try again.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setSavingCourseId(null);
    }
  };

  const updateBranchForm = (courseId, field, value) => {
    setBranchForms((prev) => ({
      ...prev,
      [courseId]: {
        ...(prev[courseId] || {}),
        [field]: value
      }
    }));
  };

  const resetNewBranch = () => {
    setNewBranch({ name: '', code: '' });
    setIsAddBranchModalOpen(false);
    setBranchModalCourseId(null);
  };

  const handleAddBranch = async (course) => {
    // If course is null, we're calling from the modal, so use newBranch state
    // Otherwise, use branchForms for backward compatibility
    const payload = course === null ? { ...newBranch } : (branchForms[course?.id] || {});

    if (!payload.name || !payload.name.trim()) {
      toast.error('Branch name is required');
      return;
    }

    if (!payload.code || !payload.code.trim()) {
      toast.error('Branch code is required');
      return;
    }

    // If course is null, find the course from branchModalCourseId
    // Otherwise, use the provided course
    const courseToUse = course || coursesForSelectedCollege.find(c => c.id === branchModalCourseId);
    if (!courseToUse) {
      toast.error('Program not found');
      return;
    }

    try {
      setSavingBranchId(`new-${courseToUse.id}`);
      await api.post(`/courses/${courseToUse.id}/branches`, {
        name: payload.name.trim(),
        code: payload.code.trim(),
        totalYears: Number(payload.totalYears || courseToUse.totalYears),
        semestersPerYear: Number(payload.semestersPerYear || courseToUse.semestersPerYear),
        academicYearIds: [],
        isActive: true
      });
      toast.success('Branch added successfully. You can add batches later if needed.');
      resetNewBranch();
      setBranchForms((prev) => {
        const updated = { ...prev };
        delete updated[courseToUse.id];
        return updated;
      });
      await loadBranches(courseToUse.id);
      await fetchCourses({ silent: true });
    } catch (error) {
      console.error('Failed to add branch', error);
      toast.error(error.response?.data?.message || 'Failed to add branch');
    } finally {
      setSavingBranchId(null);
    }
  };

  const startEditBranch = (courseId, branch, courseDefaults) => {
    setEditingBranch({ courseId, branchId: branch.id });
    setBranchDrafts((prev) => ({
      ...prev,
      [branch.id]: {
        name: branch.name || '',
        code: branch.code || '',
        totalYears: branch.totalYears ?? courseDefaults.totalYears,
        semestersPerYear: branch.semestersPerYear ?? courseDefaults.semestersPerYear
      }
    }));
  };

  const cancelEditBranch = () => {
    setEditingBranch(null);
  };

  const updateBranchDraft = (branchId, field, value) => {
    setBranchDrafts((prev) => ({
      ...prev,
      [branchId]: {
        ...(prev[branchId] || {}),
        [field]: value
      }
    }));
  };

  const saveBranchEdit = async (courseId, branch) => {
    const draft = branchDrafts[branch.id];

    if (!draft || !draft.name?.trim()) {
      toast.error('Branch name is required');
      return;
    }

    if (!draft.code || !draft.code.trim()) {
      toast.error('Branch code is required');
      return;
    }

    try {
      setSavingBranchId(branch.id);
      await api.put(`/courses/${courseId}/branches/${branch.id}`, {
        name: draft.name.trim(),
        code: draft.code.trim(),
        totalYears: draft.totalYears ? Number(draft.totalYears) : undefined,
        semestersPerYear: draft.semestersPerYear ? Number(draft.semestersPerYear) : undefined
      });

      toast.success('Branch updated successfully');
      cancelEditBranch();
      await loadBranches(courseId);
      await fetchCourses({ silent: true });
    } catch (error) {
      console.error('Failed to update branch', error);
      toast.error(error.response?.data?.message || 'Failed to update branch');
    } finally {
      setSavingBranchId(null);
    }
  };

  const toggleBranchActive = async (courseId, branch) => {
    try {
      setSavingBranchId(branch.id);
      await api.put(`/courses/${courseId}/branches/${branch.id}`, {
        isActive: !branch.isActive
      });
      toast.success(`Branch ${!branch.isActive ? 'activated' : 'deactivated'}`);
      await loadBranches(courseId);
      await fetchCourses({ silent: true });
    } catch (error) {
      console.error('Failed to toggle branch status', error);
      toast.error(error.response?.data?.message || 'Failed to update branch status');
    } finally {
      setSavingBranchId(null);
    }
  };

  const handleDeleteBranch = async (courseId, branch) => {
    // Determine scope: if filtering by batch, delete specific branch ('single').
    // If showing all batches (grouped view), delete all branch versions ('all').
    const scope = branchBatchFilter ? 'single' : 'all';

    // Show modal with loading state first
    setDeleteModal({
      isOpen: true,
      type: 'branch',
      item: { ...branch, deletionScope: scope },
      affectedStudents: [],
      totalStudentCount: 0,
      hasMoreStudents: false,
      isLoadingStudents: true,
      onConfirm: async () => {
        try {
          setSavingBranchId(branch.id);
          const response = await api.delete(`/courses/${courseId}/branches/${branch.id}?cascade=true&scope=${scope}`);
          const deletedCount = response.data.deletedStudents || 0;
          toast.success(`Branch deleted successfully${deletedCount > 0 ? ` along with ${deletedCount} student record(s)` : ''}`);
          cancelEditBranch();
          await loadBranches(courseId);
          await fetchCourses({ silent: true });
          setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null, affectedStudents: [], totalStudentCount: 0, hasMoreStudents: false, isLoadingStudents: false });
        } catch (error) {
          console.error('Failed to delete branch', error);
          toast.error(error.response?.data?.message || 'Failed to delete branch');
        } finally {
          setSavingBranchId(null);
        }
      }
    });

    // Fetch affected students
    try {
      const response = await api.get(`/courses/${courseId}/branches/${branch.id}/affected-students?scope=${scope}`);
      const { students, totalCount, hasMore } = response.data.data || {};
      setDeleteModal(prev => ({
        ...prev,
        affectedStudents: students || [],
        totalStudentCount: totalCount || 0,
        hasMoreStudents: hasMore || false,
        isLoadingStudents: false
      }));
    } catch (error) {
      console.error('Failed to fetch affected students', error);
      setDeleteModal(prev => ({
        ...prev,
        isLoadingStudents: false
      }));
    }
  };

  // Group branches by code to show unique branches only
  const branchesForSelectedCourse = useMemo(() => {
    if (!selectedCourse) return [];
    const allBranches = courseBranches[selectedCourse.id] || [];

    // If filtering by batch, return specific branches for that batch (no grouping)
    if (branchBatchFilter) {
      const filterYearId = parseInt(branchBatchFilter, 10);
      return allBranches.filter(branch => branch.academicYearId === filterYearId);
    }

    // Group branches by code (same code = same branch, just different batches)
    const branchMap = new Map();

    allBranches.forEach(branch => {
      const code = branch.code || branch.name;
      if (!branchMap.has(code)) {
        // Find all branches with the same code
        const allBranchesWithSameCode = allBranches.filter(b => (b.code || b.name) === code);
        const academicYearLabels = allBranchesWithSameCode
          .map(b => b.academicYearLabel)
          .filter(Boolean)
          .sort();

        // Use the first active branch, or first branch if none are active
        const representativeBranch = allBranchesWithSameCode.find(b => b.isActive) || allBranchesWithSameCode[0];

        branchMap.set(code, {
          ...representativeBranch,
          // Store all academic year IDs and labels for this branch code
          allAcademicYearIds: allBranchesWithSameCode.map(b => b.academicYearId).filter(Boolean),
          allAcademicYearLabels: academicYearLabels,
          // Count of how many batches this branch exists in
          batchCount: allBranchesWithSameCode.length
        });
      }
    });

    // Get unique branches grouped by code
    return Array.from(branchMap.values());
  }, [selectedCourse, courseBranches, branchBatchFilter]);

  // Get unique branch count for display (unique by code)
  const uniqueBranchCount = useMemo(() => {
    if (!selectedCourse) return 0;
    const allBranches = courseBranches[selectedCourse.id] || [];
    // Count unique branch codes
    const uniqueCodes = new Set(allBranches.map(branch => branch.code || branch.name));
    return uniqueCodes.size;
  }, [selectedCourse, courseBranches]);

  // Reset batch filter when course changes
  useEffect(() => {
    setBranchBatchFilter('');
  }, [selectedCourseId]);

  const courseOptionsSummary = useMemo(() => {
    const courseCount = coursesForSelectedCollege.filter((course) => course.isActive).length;

    // Count unique branch names per course (using course.branches directly, not courseBranches state)
    const branchCount = coursesForSelectedCollege.reduce((acc, course) => {
      // Use course.branches directly (from API response) instead of courseBranches state
      const branches = course.branches || [];
      const activeBranches = branches.filter((branch) => branch.isActive);
      // Get unique branch names (not counting duplicates across batches)
      const uniqueBranchNames = new Set(activeBranches.map((branch) => branch.name));
      return acc + uniqueBranchNames.size;
    }, 0);

    return {
      courseCount,
      branchCount,
      defaultYears: 4,
      defaultSemesters: 2
    };
  }, [coursesForSelectedCollege]);

  if (loading) {
    return (
      <div className="space-y-4 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SkeletonBox height="h-7" width="w-32" />
            <SkeletonBox height="h-4" width="w-64" className="mt-2" />
          </div>
          <SkeletonBox height="h-10" width="w-24" className="rounded-md" />
        </div>

        {/* Navigation Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Settings</h1>
            <p className="text-xs sm:text-sm text-gray-600">
              Manage colleges, programs, branches, and attendance calendar.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 sm:py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 touch-manipulation min-h-[44px]"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <button
            onClick={() => setActiveSection('courses')}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition-all touch-manipulation min-h-[80px] ${activeSection === 'courses'
              ? 'border-blue-500 bg-blue-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-blue-300 active:border-blue-400 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'courses' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <BookOpen size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Colleges & Programs</h2>
                <p className="text-xs text-gray-500">Manage colleges, programs & branches</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('calendar')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'calendar'
              ? 'border-blue-500 bg-blue-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'calendar' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <CalendarDays size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Attendance Calendar</h2>
                <p className="text-xs text-gray-500">Holidays & attendance calendar</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('academic-calendar')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'academic-calendar'
              ? 'border-green-500 bg-green-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'academic-calendar' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <Calendar size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Academic Calendar</h2>
                <p className="text-xs text-gray-500">Manage semester dates</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('forms')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'forms'
              ? 'border-purple-500 bg-purple-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'forms' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <FileText size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Registration Form</h2>
                <p className="text-xs text-gray-500">Student registration form fields</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('quotas')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'quotas'
              ? 'border-violet-500 bg-violet-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-violet-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'quotas' ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <Tags size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Student Quotas</h2>
                <p className="text-xs text-gray-500">Quota names & codes</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('notifications')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'notifications'
              ? 'border-indigo-500 bg-indigo-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'notifications' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <Bell size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
                <p className="text-xs text-gray-500">SMS & Email templates</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('college-transfer')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'college-transfer'
              ? 'border-orange-500 bg-orange-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'college-transfer' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <TrendingUp size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">College Transfer</h2>
                <p className="text-xs text-gray-500">Manual student transfers</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('student-layout')}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'student-layout'
              ? 'border-blue-500 bg-blue-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'student-layout' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <Layout size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Student Portal Layout</h2>
                <p className="text-xs text-gray-500">Enable/Disable sidebar items</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => { setActiveSection('qr-config'); fetchQrConfig(); }}
            className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'qr-config'
              ? 'border-teal-500 bg-teal-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-teal-300 hover:shadow-sm'
              }`}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${activeSection === 'qr-config' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-600'
                }`}>
                <QrCode size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">QR Code Config</h2>
                <p className="text-xs text-gray-500">Per-role student field visibility</p>
              </div>
            </div>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveSection('freeze-database')}
              className={`rounded-lg border-2 p-3 text-left transition-all ${activeSection === 'freeze-database'
                ? 'border-red-500 bg-red-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-red-300 hover:shadow-sm'
                }`}
            >
              <div className="flex items-center gap-2">
                <div className={`rounded-full p-2 ${activeSection === 'freeze-database' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                  <Lock size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Freeze Database</h2>
                  <p className="text-xs text-gray-500">Lock records by batch</p>
                </div>
              </div>
            </button>
          )}

        </div>

        {/* Content Section */}
        {activeSection === 'courses' && (
          <>
            {/* Quick Stats Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 bg-white p-2 rounded-lg border border-gray-200">
              <div className="flex items-center gap-1.5">
                <Landmark size={14} className="text-blue-600" />
                <span className="text-xs text-gray-500">Colleges:</span>
                <span className="font-semibold text-gray-900 text-sm">{colleges.length}</span>
              </div>
              <div className="h-3 w-px bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <GraduationCap size={14} className="text-green-600" />
                <span className="text-xs text-gray-500">Batches:</span>
                <span className="font-semibold text-gray-900 text-sm">{academicYears.filter(y => y.isActive).length}</span>
              </div>
              <div className="h-3 w-px bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <BookOpen size={14} className="text-purple-600" />
                <span className="text-xs text-gray-500">Programs:</span>
                <span className="font-semibold text-gray-900 text-sm">{courseOptionsSummary.courseCount}</span>
              </div>
              <div className="h-3 w-px bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-orange-600" />
                <span className="text-xs text-gray-500">Branches:</span>
                <span className="font-semibold text-gray-900 text-sm">{courseOptionsSummary.branchCount}</span>
              </div>
            </div>

            {/* Two Column Layout: Left - Colleges & Batches, Right - Programs & Branches */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[360px,1fr] xl:grid-cols-[400px,1fr] 2xl:grid-cols-[420px,1fr] min-w-0">
              {/* Left Column */}
              <div className="space-y-4 min-w-0">
                {/* Colleges Card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-gray-100 px-3 py-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 font-bold text-gray-900 text-xs uppercase tracking-wider">
                        <Landmark size={14} className="text-blue-600" />
                        Colleges
                      </h3>
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                        {colleges.length}
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    {/* Add College Button */}
                    <button
                      onClick={() => setIsAddCollegeModalOpen(true)}
                      className="mb-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <Plus size={14} />
                      Add College
                    </button>

                    {/* College List */}
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {colleges.length === 0 && !loading ? (
                        <p className="py-3 text-center text-[11px] text-gray-400">No colleges</p>
                      ) : colleges.length === 0 ? (
                        <SkeletonList count={3} />
                      ) : (
                        colleges.map((college) => (
                          <div
                            key={college.id}
                            onClick={() => handleSelectCollege(college.id)}
                            className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-all border ${selectedCollegeId === college.id
                              ? 'bg-blue-50 border-blue-200'
                              : 'hover:bg-gray-50 border-transparent'
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${college.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <span className={`text-[13px] truncate ${selectedCollegeId === college.id ? 'font-bold text-blue-900' : 'text-gray-700'}`}>
                                {college.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditCollege(college); }}
                                className="p-1 text-gray-400 hover:text-blue-500"
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCollegeActive(college); }}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title={college.isActive ? 'Deactivate' : 'Activate'}
                              >
                                {college.isActive ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteCollege(college); }}
                                className="p-1 text-gray-400 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Academic Years Card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-gray-100 px-3 py-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 font-bold text-gray-900 text-xs uppercase tracking-wider">
                        <GraduationCap size={14} className="text-green-600" />
                        Batches
                      </h3>
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                        {academicYears.filter(y => y.isActive).length}
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    {/* Add Year Form */}
                    <form onSubmit={handleCreateAcademicYear} className="mb-2 flex gap-1.5">
                      <input
                        type="text"
                        value={newAcademicYear.yearLabel}
                        onChange={(e) => setNewAcademicYear((prev) => ({ ...prev, yearLabel: e.target.value }))}
                        placeholder="e.g. 2027"
                        className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs focus:border-green-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <button
                        type="submit"
                        disabled={creatingAcademicYear || !newAcademicYear.yearLabel.trim()}
                        className="rounded-md bg-green-600 px-2.5 py-1.5 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </form>

                    {/* Year Tags */}
                    <div className="flex flex-wrap gap-2">
                      {academicYears.length === 0 && !loading ? (
                        <p className="py-2 text-sm text-gray-400">No batches yet</p>
                      ) : academicYears.length === 0 ? (
                        <div className="flex flex-wrap gap-2 w-full">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <SkeletonBox key={i} height="h-8" width="w-20" className="rounded-full" />
                          ))}
                        </div>
                      ) : (
                        academicYears.map((year) => (
                          <div
                            key={year.id}
                            className={`group inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-semibold transition-all ${year.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-500'
                              }`}
                          >
                            <span>{year.yearLabel}</span>
                            <button
                              onClick={() => toggleAcademicYearActive(year)}
                              disabled={savingAcademicYearId === year.id}
                              className="p-0.5 rounded hover:bg-white/50 transition-colors"
                            >
                              {year.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            </button>
                            <button
                              onClick={() => handleDeleteAcademicYear(year)}
                              disabled={savingAcademicYearId === year.id}
                              className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-white/50 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Programs & Branches */}
              <div className="space-y-4 min-w-0 overflow-hidden">
                {!selectedCollege ? (
                  <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8">
                    <div className="text-center">
                      <Landmark size={32} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-500">Select a college to manage its programs</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Program List & Branches */}
                    <div className="grid gap-3 lg:grid-cols-[320px,1fr] xl:grid-cols-[340px,1fr] 2xl:grid-cols-[360px,1fr] min-w-0 overflow-hidden">
                      {/* Program List */}
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 min-w-0 overflow-hidden flex flex-col">
                        <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex-shrink-0">Select Program</div>
                        <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0 min-w-0">
                          {coursesForSelectedCollege.length === 0 && !loading ? (
                            <p className="py-4 text-center text-sm text-gray-400">No programs yet</p>
                          ) : coursesForSelectedCollege.length === 0 ? (
                            <SkeletonList count={3} />
                          ) : (
                            coursesForSelectedCollege.map((course) => (
                              <div
                                key={course.id}
                                onClick={() => handleSelectCourse(course.id)}
                                className={`group flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition-all flex-shrink-0 ${selectedCourseId === course.id
                                  ? 'bg-purple-100 border border-purple-300'
                                  : 'bg-white hover:bg-purple-50 border border-gray-200'
                                  }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${course.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                  <div className="min-w-0 flex-1">
                                    <span className={`block text-sm truncate ${selectedCourseId === course.id ? 'font-medium text-purple-900' : 'text-gray-700'}`}>
                                      {course.name}
                                    </span>
                                    <span className="text-xs text-gray-500 truncate block">
                                      {course.level ? course.level.toUpperCase() : 'UG'} · {formatCourseStructureSummary(course)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleEditCourse(course); }}
                                    className="p-1 text-gray-400 hover:text-blue-500"
                                    title="Edit"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleCourseActive(course); }}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                    title={course.isActive ? 'Deactivate' : 'Activate'}
                                  >
                                    {course.isActive ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCourse(course); }}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        {/* Add Course Button Below List */}
                        {selectedCollege ? (
                          <div className="mt-2 pt-2 border-t border-gray-200 flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsAddCourseModalOpen(true);
                              }}
                              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer"
                              style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                            >
                              <Plus size={16} />
                              Add New Program
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center flex-shrink-0">
                            Select a college to add programs
                          </div>
                        )}
                      </div>

                      {/* Branches Panel */}
                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm min-w-0 overflow-hidden flex flex-col">
                        {selectedCourse ? (
                          <>
                            <div className="border-b border-gray-100 px-3 py-2 bg-slate-50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-bold text-gray-900 text-[13px]">{selectedCourse.name} - Branches</h4>
                                  <p className="text-[10px] text-gray-500">{formatCourseStructureSummary(selectedCourse)}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={branchBatchFilter}
                                    onChange={(e) => setBranchBatchFilter(e.target.value)}
                                    className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                  >
                                    <option value="">All Batches</option>
                                    {academicYears.filter(y => y.isActive).map((year) => (
                                      <option key={year.id} value={year.id}>{year.yearLabel}</option>
                                    ))}
                                  </select>
                                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                                    {branchBatchFilter ? branchesForSelectedCourse.length : uniqueBranchCount}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Add Branch Button */}
                            <div className="border-b border-gray-100 p-4">
                              <button
                                onClick={() => {
                                  setBranchModalCourseId(selectedCourse.id);
                                  setIsAddBranchModalOpen(true);
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                              >
                                <Plus size={16} />
                                Add New Branch
                              </button>
                            </div>

                            {/* Branch List */}
                            <div className="p-4 flex-1 overflow-y-auto min-h-0">
                              {branchesLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <LoadingAnimation width={24} height={24} showMessage={false} />
                                </div>
                              ) : branchesForSelectedCourse.length === 0 ? (
                                <p className="py-8 text-center text-sm text-gray-400">No branches yet</p>
                              ) : (
                                <div className="space-y-2">
                                  {branchesForSelectedCourse.map((branch) => (
                                    <div
                                      key={branch.code || branch.id}
                                      className="group flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${branch.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        <span className="text-sm font-medium text-gray-800 truncate">{branch.name}</span>
                                        {branch.code && branch.code !== branch.name && (
                                          <span className="text-xs text-gray-500">({branch.code})</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => startEditBranch(selectedCourse.id, branch, selectedCourse)}
                                          disabled={savingBranchId === branch.id}
                                          className="p-1 text-gray-400 hover:text-blue-500"
                                          title="Edit"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          onClick={() => toggleBranchActive(selectedCourse.id, branch)}
                                          disabled={savingBranchId === branch.id}
                                          className="p-1 text-gray-400 hover:text-gray-600"
                                          title={branch.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                          {branch.isActive ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} />}
                                        </button>
                                        <button
                                          onClick={() => handleDeleteBranch(selectedCourse.id, branch)}
                                          disabled={savingBranchId === branch.id}
                                          className="p-1 text-gray-400 hover:text-red-500"
                                          title="Delete"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center p-8">
                            <div className="text-center">
                              <Layers size={32} className="mx-auto mb-3 text-gray-300" />
                              <p className="text-sm text-gray-500">Select a program to view branches</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {activeSection === 'calendar' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col h-[calc(100vh-280px)] min-h-[600px] max-h-[calc(100vh-200px)] 2xl:max-h-[calc(100vh-180px)]">
            <div className="border-b border-gray-200 px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2.5 text-blue-600">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Attendance Calendar</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Review public holidays, institute breaks, and mark custom holidays.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
              {/* Calendar Grid */}
              <div className="flex-1 border-b border-gray-200 lg:border-b-0 lg:border-r p-4 overflow-y-auto min-h-0">
                {calendarViewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <LoadingAnimation width={32} height={32} message="Loading..." />
                  </div>
                ) : calendarViewError ? (
                  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                    <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-600" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-800 mb-1">
                        Calendar data unavailable
                      </div>
                      <div className="text-sm text-red-700 mb-2">{calendarViewError}</div>
                      <button
                        type="button"
                        onClick={handleCalendarModalRetry}
                        className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const parts = parseMonthKey(calendarViewMonthKey);
                          if (!parts) return;
                          const prev = new Date(Date.UTC(parts.year, parts.month - 2, 1));
                          handleCalendarMonthChange(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`);
                        }}
                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:border-gray-400"
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="text-center">
                        <div className="text-base font-semibold text-gray-900">
                          {(() => {
                            const parts = parseMonthKey(calendarViewMonthKey);
                            return parts ? `${MONTH_NAMES[parts.month - 1]} ${parts.year}` : '';
                          })()}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Tap a date to view details</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const parts = parseMonthKey(calendarViewMonthKey);
                          if (!parts) return;
                          const next = new Date(Date.UTC(parts.year, parts.month, 1));
                          handleCalendarMonthChange(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
                        }}
                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:border-gray-400"
                        aria-label="Next month"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-semibold uppercase text-gray-600 flex-shrink-0">
                      {WEEKDAY_NAMES.map((name) => (
                        <div key={name} className="py-2">{name}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1.5 flex-1 auto-rows-fr min-h-0">
                      {(() => {
                        const data = calendarViewData || {
                          sundays: [],
                          publicHolidays: [],
                          customHolidays: [],
                          attendanceStatus: {}
                        };
                        const calendarCells = buildCalendarMatrix(calendarViewMonthKey);
                        const publicHolidayMap = new Map();
                        (data.publicHolidays || []).forEach((holiday) => {
                          const normalizedDate = holiday.date ? holiday.date.split('T')[0] : holiday.date;
                          if (normalizedDate) publicHolidayMap.set(normalizedDate, holiday);
                        });
                        const customHolidayMap = new Map();
                        (data.customHolidays || []).forEach((holiday) => {
                          const normalizedDate = holiday.date ? holiday.date.split('T')[0] : holiday.date;
                          if (normalizedDate) customHolidayMap.set(normalizedDate, holiday);
                        });
                        const sundaySet = new Set((data.sundays || []).map(d => d.split('T')[0]));
                        const attendanceStatusMap = new Map();
                        Object.entries(data.attendanceStatus || {}).forEach(([date, status]) => {
                          attendanceStatusMap.set(date.split('T')[0], status);
                        });

                        return calendarCells.map((cell) => {
                          const status = attendanceStatusMap.get(cell.isoDate) || null;
                          const isSelected = selectedCalendarDate === cell.isoDate;
                          const isSunday = sundaySet.has(cell.isoDate);
                          const publicHoliday = publicHolidayMap.get(cell.isoDate);
                          const customHoliday = customHolidayMap.get(cell.isoDate);
                          const isHoliday = Boolean(publicHoliday || customHoliday || isSunday);
                          const statusInfo = status && STATUS_META[status];

                          let cellBgColor = 'bg-white';
                          if (isHoliday) {
                            cellBgColor = 'bg-amber-50/50';
                          } else {
                            cellBgColor = 'bg-blue-50/30';
                          }

                          const badgeColor = isHoliday
                            ? publicHoliday
                              ? 'bg-amber-100 text-amber-700 border border-amber-300'
                              : customHoliday
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : 'bg-amber-100 text-amber-700 border border-amber-300'
                            : statusInfo
                              ? statusInfo.badgeClass
                              : 'bg-gray-100 text-gray-500 border border-gray-200';

                          const baseClasses = cell.isCurrentMonth
                            ? 'cursor-pointer hover:border-blue-500 hover:text-blue-600'
                            : 'cursor-not-allowed text-gray-300';

                          return (
                            <button
                              key={cell.index}
                              type="button"
                              onClick={() => handleCalendarDateSelect(cell.isoDate)}
                              disabled={!cell.isCurrentMonth}
                              className={`flex h-full min-h-[70px] flex-col justify-start items-center rounded-md border-2 py-2 px-1.5 text-xs transition-all ${isSelected
                                ? 'border-blue-500 bg-blue-100 text-blue-800 shadow-md ring-2 ring-blue-300 ring-offset-1'
                                : `${cellBgColor} border-gray-200 text-gray-700 ${baseClasses}`
                                } ${!cell.isCurrentMonth ? 'opacity-40' : ''}`}
                            >
                              <span className={`font-semibold text-sm mb-1 ${!cell.isCurrentMonth ? 'text-gray-400' : ''}`}>
                                {cell.day}
                              </span>
                              {isHoliday && (
                                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${badgeColor}`}>
                                  {publicHoliday ? 'Public' : customHoliday ? 'Inst' : 'Sun'}
                                </span>
                              )}
                              {!isHoliday && statusInfo && (
                                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${statusInfo.badgeClass}`}>
                                  {statusInfo.label}
                                </span>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <aside className="w-full lg:w-[360px] xl:w-[380px] 2xl:w-[400px] p-4 space-y-4 overflow-y-auto flex-shrink-0 border-l border-gray-200">
                {/* Selected Date Section */}
                <div className="border-b border-gray-200 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Selected Date</h3>
                    {selectedCalendarDate && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {formatIsoDate(selectedCalendarDate, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    )}
                  </div>

                  {!selectedCalendarDate ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                      Choose a date on the calendar to view holiday details or mark an institute break.
                    </div>
                  ) : (() => {
                    const data = calendarViewData || { sundays: [], publicHolidays: [], customHolidays: [] };
                    const publicHoliday = (data.publicHolidays || []).find(h => h.date?.split('T')[0] === selectedCalendarDate);
                    const customHoliday = (data.customHolidays || []).find(h => h.date?.split('T')[0] === selectedCalendarDate);
                    const isSunday = (data.sundays || []).some(d => d.split('T')[0] === selectedCalendarDate);

                    return (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <div className="text-sm font-semibold text-blue-900 mb-1">
                          {publicHoliday
                            ? publicHoliday.localName || publicHoliday.name
                            : customHoliday
                              ? customHoliday.title || 'Institute Holiday'
                              : isSunday
                                ? 'Sunday'
                                : 'Instructional Day'}
                        </div>
                        <div className="text-xs text-blue-700">
                          {publicHoliday
                            ? publicHoliday.name
                            : customHoliday?.description
                              ? customHoliday.description
                              : isSunday
                                ? 'Weekly holiday'
                                : 'Classes are expected to be held on this date.'}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Holiday Management (Admin Only) */}
                {isAdmin && selectedCalendarDate && (() => {
                  const data = calendarViewData || { customHolidays: [] };
                  const holidaysForDate = (data.customHolidays || []).filter(
                    (holiday) => holiday.date?.split('T')[0] === selectedCalendarDate
                  );

                  return (
                    <div className="border-b border-gray-200 pb-4 space-y-3">
                      {holidaysForDate.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-gray-700">Holidays on this date</div>
                          {holidaysForDate.map((holiday) => (
                            <div key={holiday.id || `${holiday.date}-${holiday.title}`} className="rounded-md border border-purple-100 bg-purple-50 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-purple-900">{holiday.title || 'Institute Holiday'}</div>
                                  {holiday.description && (
                                    <div className="mt-1 text-xs text-purple-700">{holiday.description}</div>
                                  )}
                                  <div className="mt-1 text-[11px] text-purple-600">{formatHolidayScope(holiday)}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInstituteHoliday(holiday.id)}
                                  disabled={calendarMutationLoading || !holiday.id}
                                  className="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                          Holiday Title
                        </label>
                        <input
                          type="text"
                          value={localHolidayTitle}
                          onChange={(e) => setLocalHolidayTitle(e.target.value)}
                          placeholder="e.g. Founders' Day"
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                          disabled={calendarMutationLoading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                          Notes (visible to staff)
                        </label>
                        <textarea
                          value={localHolidayDescription}
                          onChange={(e) => setLocalHolidayDescription(e.target.value)}
                          placeholder="Optional: add a note for this holiday"
                          rows={3}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors resize-none"
                          disabled={calendarMutationLoading}
                        />
                      </div>

                      <TargetSelector formData={holidayTargetForm} setFormData={setHolidayTargetForm} />

                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedCalendarDate) return;
                          await handleCreateInstituteHoliday({
                            date: selectedCalendarDate,
                            title: localHolidayTitle || 'Holiday',
                            description: localHolidayDescription,
                            ...holidayTargetForm
                          });
                        }}
                        disabled={calendarMutationLoading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                      >
                        {calendarMutationLoading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving…
                          </>
                        ) : (
                          'Save Institute Holiday'
                        )}
                      </button>
                    </div>
                  );
                })()}

                {/* Legend */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Calendar Legend
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-md bg-orange-100 border-2 border-orange-300 flex-shrink-0" />
                      <span className="text-gray-700">Public Holiday</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-md bg-purple-100 border-2 border-purple-300 flex-shrink-0" />
                      <span className="text-gray-700">Institute Holiday</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-md bg-amber-100 border-2 border-amber-300 flex-shrink-0" />
                      <span className="text-gray-700">Sunday</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-md bg-blue-100 border-2 border-blue-300 flex-shrink-0" />
                      <span className="text-gray-700">Working Day</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* Academic Calendar Section */}
        {activeSection === 'academic-calendar' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
            <AcademicCalendar
              colleges={colleges}
              courses={courses}
              academicYears={academicYears}
            />
          </div>
        )}

        {/* Registration Forms Section */}
        {activeSection === 'forms' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {formsLoading ? (
              <div className="flex items-center justify-center py-16">
                <LoadingAnimation width={32} height={32} message="Loading form..." />
              </div>
            ) : registrationForms.length === 0 ? (
              <div className="text-center py-16">
                <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="text-purple-600" size={32} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Registration Form</h3>
                <p className="text-gray-600">Contact administrator to set up the registration form.</p>
              </div>
            ) : (() => {
              const form = registrationForms[0]; // Only show the first/single form

              return isEditingForm ? (
                // Inline Form Editor
                <div className="p-4">
                  {/* Editor Header */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 p-2 rounded-lg">
                        <Pencil size={20} className="text-purple-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Edit Registration Form</h2>
                        <p className="text-sm text-gray-500">Customize form fields and settings</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={cancelEditingForm}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveFormChanges}
                        disabled={savingFormId}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                      >
                        {savingFormId ? <LoadingAnimation width={16} height={16} showMessage={false} /> : <Settings2 size={16} />}
                        Save Changes
                      </button>
                    </div>
                  </div>

                  {/* Form Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Form Name *</label>
                      <input
                        type="text"
                        value={formEditData.formName}
                        onChange={(e) => setFormEditData({ ...formEditData, formName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={formEditData.formDescription}
                        onChange={(e) => setFormEditData({ ...formEditData, formDescription: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Add Field Types */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add New Field</label>
                    <div className="flex flex-wrap gap-2">
                      {FIELD_TYPES.map((type) => (
                        <button
                          key={type.key}
                          onClick={() => addFormField(type.key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
                        >
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Form Fields Editor - Grouped by Content Headers */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Form Fields ({formEditData.formFields.length})</h4>
                    {(() => {
                      // Categorize fields
                      // Personal Information: Date of Birth and Aadhar Number only
                      const personalFields = formEditData.formFields.filter(f => {
                        const key = f.key?.toLowerCase() || '';
                        const label = f.label?.toLowerCase() || '';
                        return (key.includes('dob') || key.includes('date of birth') ||
                          label.includes('dob') || label.includes('date of birth') ||
                          key.includes('adhar') || key.includes('aadhar') ||
                          label.includes('adhar') || label.includes('aadhar'));
                      });

                      // Basic fields exclude Personal Information fields (DOB, Aadhar) and include Caste
                      const basicFields = formEditData.formFields.filter(f => {
                        const cat = categorizeField(f);
                        if (cat !== 'basic') {
                          // Include Caste from additional fields in Basic Information
                          const key = f.key?.toLowerCase() || '';
                          const label = f.label?.toLowerCase() || '';
                          if (key.includes('caste') || label.includes('caste')) {
                            return true;
                          }
                          return false;
                        }
                        const key = f.key?.toLowerCase() || '';
                        const label = f.label?.toLowerCase() || '';
                        // Exclude DOB and Aadhar from basic (they go to Personal Information)
                        if (key.includes('dob') || key.includes('date of birth') ||
                          label.includes('dob') || label.includes('date of birth') ||
                          key.includes('adhar') || key.includes('aadhar') ||
                          label.includes('adhar') || label.includes('aadhar')) {
                          return false;
                        }
                        return true;
                      });

                      const academicFields = formEditData.formFields.filter(f => categorizeField(f) === 'academic');
                      const contactFields = formEditData.formFields.filter(f => categorizeField(f) === 'contact');
                      const addressFields = formEditData.formFields.filter(f => categorizeField(f) === 'address');
                      // Additional fields exclude Caste (moved to Basic) and Personal Information fields
                      const additionalFields = formEditData.formFields.filter(f => {
                        if (f.isEnabled === false) return false;
                        const cat = categorizeField(f);
                        if (cat !== 'additional') return false;
                        const key = f.key?.toLowerCase() || '';
                        const label = f.label?.toLowerCase() || '';
                        // Exclude Caste, DOB, and Aadhar from additional
                        if (key.includes('caste') || label.includes('caste') ||
                          key.includes('dob') || key.includes('date of birth') ||
                          label.includes('dob') || label.includes('date of birth') ||
                          key.includes('adhar') || key.includes('aadhar') ||
                          label.includes('adhar') || label.includes('aadhar')) {
                          return false;
                        }
                        return true;
                      });
                      const otherFields = formEditData.formFields.filter(f => categorizeField(f) === 'other');

                      const sections = [
                        { title: 'Basic Information', fields: basicFields, color: 'blue-500' },
                        { title: 'Academic Information', fields: academicFields, color: 'green-500' },
                        { title: 'Contact Information', fields: contactFields, color: 'orange-500' },
                        { title: 'Personal Information', fields: personalFields, color: 'purple-500' },
                        { title: 'Address Information', fields: addressFields, color: 'gray-500' },
                        { title: 'Additional Information', fields: additionalFields, color: 'red-500' },
                        { title: 'Other Fields', fields: otherFields, color: 'indigo-500' }
                      ].filter(section => section.fields.length > 0);

                      return (
                        <div className="space-y-6 max-h-[600px] overflow-y-auto">
                          {sections.map((section, sectionIndex) => (
                            <div key={sectionIndex} className="border-b border-gray-200 pb-4 last:border-b-0">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <div className={`w-3 h-3 bg-${section.color} rounded-full`}></div>
                                {section.title}
                              </h5>
                              <div className="space-y-3">
                                {section.fields.map((field, index) => {
                                  const fieldIndex = formEditData.formFields.findIndex(f => f.id === field.id || (f.key === field.key && f.label === field.label));
                                  if (fieldIndex === -1) return null;

                                  const isSystemField = field.isSystemField ||
                                    ['batch', 'college', 'course', 'branch', 'current_year', 'current_semester', 'apaar_id'].includes(
                                      (field.key || '').toLowerCase()
                                    );

                                  return (
                                    <div
                                      key={field.id != null ? field.id : `section-${sectionIndex}-field-${fieldIndex}`}
                                      className={`rounded-lg border-2 p-3 transition-all ${field.isEnabled !== false
                                        ? isSystemField
                                          ? 'border-blue-200 bg-blue-50'
                                          : 'border-gray-200 bg-white'
                                        : 'border-gray-100 bg-gray-50'
                                        }`}
                                    >
                                      {isSystemField && (
                                        <div className="mb-2 flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                                          <Settings2 size={12} />
                                          System Field (Required for form functionality)
                                        </div>
                                      )}
                                      <div className="flex items-start gap-3">
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Label *</label>
                                            <input
                                              type="text"
                                              value={field.label}
                                              onChange={(e) => updateFormField(fieldIndex, 'label', e.target.value)}
                                              placeholder="Field label"
                                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none"
                                              disabled={isSystemField}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Type</label>
                                            <select
                                              value={field.type}
                                              onChange={(e) => updateFormField(fieldIndex, 'type', e.target.value)}
                                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none"
                                              disabled={isSystemField}
                                            >
                                              {FIELD_TYPES.map((t) => (
                                                <option key={t.key} value={t.key}>{t.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Placeholder</label>
                                            <input
                                              type="text"
                                              value={field.placeholder || ''}
                                              onChange={(e) => updateFormField(fieldIndex, 'placeholder', e.target.value)}
                                              placeholder="Placeholder text"
                                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none"
                                            />
                                          </div>
                                          <div className="flex items-end gap-2">
                                            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={field.required}
                                                onChange={(e) => updateFormField(fieldIndex, 'required', e.target.checked)}
                                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                              />
                                              Required
                                            </label>
                                            <button
                                              onClick={() => toggleFieldEnabled(fieldIndex)}
                                              className={`p-1.5 rounded transition-colors ${field.isEnabled !== false
                                                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                }`}
                                              title={field.isEnabled !== false ? 'Enabled' : 'Disabled'}
                                              disabled={isSystemField}
                                            >
                                              {field.isEnabled !== false ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                            </button>
                                            <button
                                              onClick={() => {
                                                if (isSystemField) {
                                                  toast.error('System fields cannot be removed. They are required for form functionality.');
                                                  return;
                                                }
                                                removeFormField(fieldIndex);
                                              }}
                                              className={`p-1.5 rounded transition-colors ${isSystemField
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : 'bg-red-100 text-red-600 hover:bg-red-200'
                                                }`}
                                              title={isSystemField ? 'System field - cannot be removed' : 'Remove field'}
                                              disabled={isSystemField}
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Options for select/radio/checkbox */}
                                      {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                                        <div className="mt-3 pl-3 border-l-2 border-purple-200">
                                          <label className="block text-xs text-gray-500 mb-1">Options</label>
                                          <div className="flex flex-wrap gap-2">
                                            {(field.options || []).map((option, optIndex) => (
                                              <div key={`field-${fieldIndex}-opt-${optIndex}`} className="flex items-center gap-1">
                                                <input
                                                  type="text"
                                                  value={option}
                                                  onChange={(e) => updateFieldOption(fieldIndex, optIndex, e.target.value)}
                                                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none w-24"
                                                />
                                                <button
                                                  onClick={() => removeFieldOption(fieldIndex, optIndex)}
                                                  className="p-0.5 text-red-500 hover:bg-red-100 rounded"
                                                >
                                                  <X size={14} />
                                                </button>
                                              </div>
                                            ))}
                                            <button
                                              onClick={() => addFieldOption(fieldIndex)}
                                              className="px-2 py-1 text-xs border border-dashed border-gray-300 rounded hover:border-purple-400 hover:bg-purple-50 transition-colors"
                                            >
                                              + Add
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Certificate Information Section - Configurable */}
                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                      Certificate Information
                    </h2>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-gray-600" />
                        Default Certification Fields
                      </h3>

                      {/* For Diploma Courses */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-700">For Diploma Courses</h4>
                          <button
                            onClick={() => addCertificate('diploma')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                          >
                            <Plus size={14} />
                            Add Certificate
                          </button>
                        </div>
                        <div className="space-y-2">
                          {certificateConfig.diploma.map((cert) => (
                            <div key={cert.id} className="space-y-2 p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={cert.name}
                                  onChange={(e) => updateCertificateName('diploma', cert.id, e.target.value)}
                                  placeholder="Certificate name"
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 outline-none font-medium"
                                />
                                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={cert.required}
                                    onChange={(e) => updateCertificateRequired('diploma', cert.id, e.target.checked)}
                                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <span className="text-xs text-gray-600">Required</span>
                                </label>
                                <button
                                  onClick={() => removeCertificate('diploma', cert.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove certificate"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {/* Options management */}
                              <div className="pl-4 border-l-2 border-teal-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-gray-500 uppercase">Dropdown Options</span>
                                  <button
                                    onClick={() => addCertificateOption('diploma', cert.id)}
                                    className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors border border-teal-200 flex items-center gap-1"
                                  >
                                    <Plus size={10} /> Add Option
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(cert.options || []).map((opt, optIdx) => {
                                    const optValue = typeof opt === 'object' ? opt.value : opt;
                                    const optType = typeof opt === 'object' ? opt.type : 'permanent';
                                    return (
                                      <div key={optIdx} className="flex items-center gap-1 group">
                                        <input
                                          type="text"
                                          value={optValue}
                                          onChange={(e) => updateCertificateOption('diploma', cert.id, optIdx, e.target.value)}
                                          placeholder="e.g. Original"
                                          className="w-24 px-2 py-0.5 text-[11px] border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                        />
                                        <select
                                          value={optType}
                                          onChange={(e) => updateCertificateOptionType('diploma', cert.id, optIdx, e.target.value)}
                                          className={`text-[10px] px-1 py-0.5 border rounded outline-none ${optType === 'temporary' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}
                                        >
                                          <option value="permanent">Permanent</option>
                                          <option value="temporary">Temporary</option>
                                        </select>
                                        <button
                                          onClick={() => removeCertificateOption('diploma', cert.id, optIdx)}
                                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {(cert.options || []).length === 0 && (
                                    <span className="text-[10px] text-gray-400 italic">No options (will use Yes/No)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* For UG Courses */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-700">For UG Courses</h4>
                          <button
                            onClick={() => addCertificate('ug')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                          >
                            <Plus size={14} />
                            Add Certificate
                          </button>
                        </div>
                        <div className="space-y-2">
                          {certificateConfig.ug.map((cert) => (
                            <div key={cert.id} className="space-y-2 p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={cert.name}
                                  onChange={(e) => updateCertificateName('ug', cert.id, e.target.value)}
                                  placeholder="Certificate name"
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 outline-none font-medium"
                                />
                                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={cert.required}
                                    onChange={(e) => updateCertificateRequired('ug', cert.id, e.target.checked)}
                                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <span className="text-xs text-gray-600">Required</span>
                                </label>
                                <button
                                  onClick={() => removeCertificate('ug', cert.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove certificate"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {/* Options management */}
                              <div className="pl-4 border-l-2 border-teal-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-gray-500 uppercase">Dropdown Options</span>
                                  <button
                                    onClick={() => addCertificateOption('ug', cert.id)}
                                    className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors border border-teal-200 flex items-center gap-1"
                                  >
                                    <Plus size={10} /> Add Option
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(cert.options || []).map((opt, optIdx) => {
                                    const optValue = typeof opt === 'object' ? opt.value : opt;
                                    const optType = typeof opt === 'object' ? opt.type : 'permanent';
                                    return (
                                      <div key={optIdx} className="flex items-center gap-1 group">
                                        <input
                                          type="text"
                                          value={optValue}
                                          onChange={(e) => updateCertificateOption('ug', cert.id, optIdx, e.target.value)}
                                          placeholder="e.g. Original"
                                          className="w-24 px-2 py-0.5 text-[11px] border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                        />
                                        <select
                                          value={optType}
                                          onChange={(e) => updateCertificateOptionType('ug', cert.id, optIdx, e.target.value)}
                                          className={`text-[10px] px-1 py-0.5 border rounded outline-none ${optType === 'temporary' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}
                                        >
                                          <option value="permanent">Permanent</option>
                                          <option value="temporary">Temporary</option>
                                        </select>
                                        <button
                                          onClick={() => removeCertificateOption('ug', cert.id, optIdx)}
                                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {(cert.options || []).length === 0 && (
                                    <span className="text-[10px] text-gray-400 italic">No options (will use Yes/No)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* For PG Courses */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-700">For PG Courses</h4>
                          <button
                            onClick={() => addCertificate('pg')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                          >
                            <Plus size={14} />
                            Add Certificate
                          </button>
                        </div>
                        <div className="space-y-2">
                          {certificateConfig.pg.map((cert) => (
                            <div key={cert.id} className="space-y-2 p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={cert.name}
                                  onChange={(e) => updateCertificateName('pg', cert.id, e.target.value)}
                                  placeholder="Certificate name"
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500 outline-none font-medium"
                                />
                                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={cert.required}
                                    onChange={(e) => updateCertificateRequired('pg', cert.id, e.target.checked)}
                                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <span className="text-xs text-gray-600">Required</span>
                                </label>
                                <button
                                  onClick={() => removeCertificate('pg', cert.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove certificate"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {/* Options management */}
                              <div className="pl-4 border-l-2 border-teal-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-gray-500 uppercase">Dropdown Options</span>
                                  <button
                                    onClick={() => addCertificateOption('pg', cert.id)}
                                    className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors border border-teal-200 flex items-center gap-1"
                                  >
                                    <Plus size={10} /> Add Option
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(cert.options || []).map((opt, optIdx) => {
                                    const optValue = typeof opt === 'object' ? opt.value : opt;
                                    const optType = typeof opt === 'object' ? opt.type : 'permanent';
                                    return (
                                      <div key={optIdx} className="flex items-center gap-1 group">
                                        <input
                                          type="text"
                                          value={optValue}
                                          onChange={(e) => updateCertificateOption('pg', cert.id, optIdx, e.target.value)}
                                          placeholder="e.g. Original"
                                          className="w-24 px-2 py-0.5 text-[11px] border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                        />
                                        <select
                                          value={optType}
                                          onChange={(e) => updateCertificateOptionType('pg', cert.id, optIdx, e.target.value)}
                                          className={`text-[10px] px-1 py-0.5 border rounded outline-none ${optType === 'temporary' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}
                                        >
                                          <option value="permanent">Permanent</option>
                                          <option value="temporary">Temporary</option>
                                        </select>
                                        <button
                                          onClick={() => removeCertificateOption('pg', cert.id, optIdx)}
                                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {(cert.options || []).length === 0 && (
                                    <span className="text-[10px] text-gray-400 italic">No options (will use Yes/No)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={saveCertificateSettings}
                        disabled={savingCertificates}
                        className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all font-semibold shadow-sm disabled:opacity-50"
                      >
                        {savingCertificates ? (
                          <>
                            <RefreshCcw size={16} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Settings2 size={16} />
                            Save Certificate Settings
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                // Form View Mode
                <div className="p-4">
                  {/* Form Header */}
                  <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="bg-purple-100 p-2 rounded-lg">
                        <FileText size={20} className="text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-base font-bold text-gray-900">{form.form_name}</h2>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${form.is_active
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}>
                            {form.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {form.form_description || 'Student registration form'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditingForm(form)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        <Pencil size={16} />
                        Edit Form
                      </button>
                      <button
                        onClick={() => toggleFormActive(form)}
                        disabled={savingFormId === form.form_id}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${form.is_active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                      >
                        {form.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {form.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
                      <p className="text-lg font-bold text-gray-900">{form.form_fields?.length || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Total Fields</p>
                    </div>
                    <div className="rounded-lg border border-purple-100 bg-purple-50 p-2 text-center">
                      <p className="text-lg font-bold text-purple-600">{form.form_fields?.filter(f => f.isEnabled !== false).length || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Active</p>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-center">
                      <p className="text-lg font-bold text-amber-600">{form.pending_count || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Pending</p>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-center">
                      <p className="text-lg font-bold text-emerald-600">{form.approved_count || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Approved</p>
                    </div>
                  </div>

                  {/* Form Fields - Grouped by Content Headers */}
                  {form.form_fields && form.form_fields.length > 0 ? (() => {
                    // Personal Information: Date of Birth and Aadhar Number only
                    const personalFields = form.form_fields.filter(f => {
                      if (f.isEnabled === false) return false;
                      const key = f.key?.toLowerCase() || '';
                      const label = f.label?.toLowerCase() || '';
                      return (key.includes('dob') || key.includes('date of birth') ||
                        label.includes('dob') || label.includes('date of birth') ||
                        key.includes('adhar') || key.includes('aadhar') ||
                        label.includes('adhar') || label.includes('aadhar'));
                    });

                    // Basic fields exclude Personal Information fields (DOB, Aadhar) and include Caste
                    const basicFields = form.form_fields.filter(f => {
                      if (f.isEnabled === false) return false;
                      const cat = categorizeField(f);
                      if (cat !== 'basic') {
                        // Include Caste from additional fields in Basic Information
                        const key = f.key?.toLowerCase() || '';
                        const label = f.label?.toLowerCase() || '';
                        if (key.includes('caste') || label.includes('caste')) {
                          return true;
                        }
                        return false;
                      }
                      const key = f.key?.toLowerCase() || '';
                      const label = f.label?.toLowerCase() || '';
                      // Exclude DOB and Aadhar from basic (they go to Personal Information)
                      if (key.includes('dob') || key.includes('date of birth') ||
                        label.includes('dob') || label.includes('date of birth') ||
                        key.includes('adhar') || key.includes('aadhar') ||
                        label.includes('adhar') || label.includes('aadhar')) {
                        return false;
                      }
                      return true;
                    });

                    const academicFields = form.form_fields.filter(f => categorizeField(f) === 'academic' && f.isEnabled !== false);
                    const contactFields = form.form_fields.filter(f => categorizeField(f) === 'contact' && f.isEnabled !== false);
                    const addressFields = form.form_fields.filter(f => categorizeField(f) === 'address' && f.isEnabled !== false);
                    // Additional fields exclude Caste (moved to Basic) and Personal Information fields
                    const additionalFields = form.form_fields.filter(f => {
                      if (f.isEnabled === false) return false;
                      const cat = categorizeField(f);
                      if (cat !== 'additional') return false;
                      const key = f.key?.toLowerCase() || '';
                      const label = f.label?.toLowerCase() || '';
                      // Exclude Caste, DOB, and Aadhar from additional
                      if (key.includes('caste') || label.includes('caste') ||
                        key.includes('dob') || label.includes('date of birth') ||
                        key.includes('adhar') || label.includes('aadhar')) {
                        return false;
                      }
                      return true;
                    });
                    const otherFields = form.form_fields.filter(f => categorizeField(f) === 'other' && f.isEnabled !== false);

                    const sections = [
                      { title: 'Basic Information', fields: basicFields, color: 'blue-500' },
                      { title: 'Academic Information', fields: academicFields, color: 'green-500' },
                      { title: 'Contact Information', fields: contactFields, color: 'orange-500' },
                      { title: 'Personal Information', fields: personalFields, color: 'purple-500' },
                      { title: 'Address Information', fields: addressFields, color: 'gray-500' },
                      { title: 'Additional Information', fields: additionalFields, color: 'red-500' },
                      { title: 'Other Fields', fields: otherFields, color: 'indigo-500' }
                    ].filter(section => section.fields.length > 0);

                    return (
                      <div className="space-y-4">
                        {sections.map((section, sectionIndex) => (
                          <div key={sectionIndex} className="border-b border-gray-100 pb-3 last:border-b-0">
                            <h2 className="text-[13px] font-bold text-gray-900 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                              <div className={`w-2 h-2 bg-${section.color} rounded-full`}></div>
                              {section.title}
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1.5">
                              {section.fields.map((field, index) => (
                                <div
                                  key={field.id != null ? field.id : `preview-section-${sectionIndex}-field-${index}`}
                                  className="flex items-center gap-1.5 text-[11px]"
                                >
                                  <span className="font-semibold text-gray-700">{field.label}</span>
                                  {field.required && <span className="text-red-500 font-bold">*</span>}
                                  <span className="text-[10px] text-gray-400 capitalize">({field.type})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : (
                    <p className="text-sm text-gray-500 text-center py-4">No fields configured</p>
                  )}

                  {/* Certificate Information Section */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h2 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                      Certificates
                    </h2>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['diploma', 'ug', 'pg'].map(type => (
                          <div key={type} className="min-w-0">
                            <h4 className="text-[11px] font-bold text-gray-400 uppercase border-b border-gray-200 pb-1 mb-1.5">
                              {type === 'ug' ? 'UG' : type === 'pg' ? 'PG' : 'Diploma'}
                            </h4>
                            <ul className="space-y-0.5">
                              {certificateConfig[type]?.map(cert => (
                                <li key={cert.id} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                                  <div className={`mt-1 h-1 w-1 rounded-full flex-shrink-0 ${cert.required ? 'bg-teal-500' : 'bg-gray-300'}`}></div>
                                  <span className={`truncate ${cert.required ? 'font-semibold text-gray-700' : ''}`}>
                                    {cert.name}
                                    {cert.required && <span className="text-red-500 ml-0.5">*</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>


                </div>
              );
            })()}
          </div>
        )}

        {/* Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
            <NotificationSettings />
          </div>
        )}

        {/* Student Quotas Section */}
        {activeSection === 'quotas' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Tags size={18} className="text-violet-600" />
                    Student Quotas
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage quota names and codes used in student forms and the students table.
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                  {studentQuotas.length} total
                </span>
              </div>
            </div>

            <div className="p-4 border-b border-gray-100">
              <form onSubmit={handleCreateQuota} className="grid gap-2 sm:grid-cols-[1fr,140px,auto]">
                <input
                  type="text"
                  value={newQuota.name}
                  onChange={(e) => setNewQuota((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Quota name (e.g. Management Quota)"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input
                  type="text"
                  value={newQuota.code}
                  onChange={(e) => setNewQuota((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Code (e.g. MANG)"
                  maxLength={50}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm uppercase focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="submit"
                  disabled={creatingQuota || !newQuota.name.trim() || !newQuota.code.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} />
                  Add Quota
                </button>
              </form>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Quota Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quotasLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8">
                        <SkeletonList count={4} />
                      </td>
                    </tr>
                  ) : studentQuotas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                        No quotas configured yet
                      </td>
                    </tr>
                  ) : (
                    studentQuotas.map((quota) => {
                      const isEditing = editingQuotaId === quota.id;
                      const draft = quotaDrafts[quota.id] || { name: quota.name, code: quota.code };

                      return (
                        <tr key={quota.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(e) => setQuotaDrafts((prev) => ({
                                  ...prev,
                                  [quota.id]: { ...draft, name: e.target.value }
                                }))}
                                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            ) : (
                              <span className="font-medium text-gray-900">{quota.name}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={draft.code}
                                onChange={(e) => setQuotaDrafts((prev) => ({
                                  ...prev,
                                  [quota.id]: { ...draft, code: e.target.value.toUpperCase() }
                                }))}
                                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm uppercase focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            ) : (
                              <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                                {quota.code}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${quota.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${quota.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {quota.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveQuotaEdits(quota.id)}
                                    disabled={savingQuotaId === quota.id}
                                    className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditingQuota}
                                    className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditingQuota(quota)}
                                    className="p-1.5 text-gray-400 hover:text-violet-600"
                                    title="Edit quota"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    onClick={() => toggleQuotaActive(quota)}
                                    disabled={savingQuotaId === quota.id}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                    title={quota.isActive ? 'Deactivate quota' : 'Activate quota'}
                                  >
                                    {quota.isActive ? <ToggleRight size={15} className="text-green-500" /> : <ToggleLeft size={15} />}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuota(quota)}
                                    disabled={savingQuotaId === quota.id}
                                    className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
                                    title="Delete quota"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* College Transfer Section */}
        {activeSection === 'college-transfer' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 min-h-[500px]">
            <CollegeTransfer />
          </div>
        )}

        {activeSection === 'student-layout' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 min-h-[500px]">
            <StudentPortalLayoutSettings />
          </div>
        )}

        {/* QR Code Config Section */}
        {activeSection === 'qr-config' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 min-h-[500px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <QrCode size={20} className="text-teal-600" />
                  QR Code Configuration
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Define <strong>Public Fields</strong> (visible to anyone who scans) and <strong>Private Fields</strong> per role (requires staff login).
                </p>
              </div>
              <button
                onClick={saveQrConfig}
                disabled={qrConfigSaving || qrConfigLoading}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-medium"
              >
                <Save size={16} />
                {qrConfigSaving ? 'Saving...' : 'Save Config'}
              </button>
            </div>

            {qrConfigLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              </div>
            ) : (
              <div className="space-y-4">

                {/* ── PUBLIC FIELDS PANEL ── */}
                <div className="border-2 border-teal-200 rounded-xl overflow-hidden bg-teal-50/30">
                  <div className="flex items-center justify-between px-4 py-3 bg-teal-50 border-b border-teal-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-teal-900">Public View Fields</h3>
                        <p className="text-[11px] text-teal-600">Shown to <strong>anyone</strong> who scans, without login</p>
                      </div>
                      <span className="text-xs text-teal-700 bg-teal-200 px-2 py-0.5 rounded-full font-semibold">
                        {qrPublicFields.length} selected
                      </span>
                    </div>
                    <button
                      onClick={toggleAllQrPublicFields}
                      className="text-xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
                    >
                      {qrPublicFields.length === qrAvailableFields.length && qrAvailableFields.length > 0
                        ? <><CheckSquare size={14} /> Deselect All</>
                        : <><Square size={14} /> Select All</>}
                    </button>
                  </div>
                  {renderQrFieldGrid(qrPublicFields, toggleQrPublicField)}
                </div>

                {/* ── DIVIDER ── */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide px-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Private Fields — Staff Login Required
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                </div>

                {/* ── PER-ROLE PRIVATE FIELDS ── */}
                {QR_CONFIGURABLE_ROLES.map(role => {
                  const selectedFields = qrRoleConfigs[role.key] || [];
                  const allSelected = qrAvailableFields.length > 0 && selectedFields.length === qrAvailableFields.length;
                  const isExpanded = qrActiveRole === role.key;
                  return (
                    <div key={role.key} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setQrActiveRole(isExpanded ? null : role.key)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                          <h3 className="text-sm font-semibold text-gray-900">{role.label}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selectedFields.length > 0
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-gray-100 text-gray-400'
                            }`}>
                            {selectedFields.length} private fields
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleAllQrFields(role.key); }}
                              className="text-xs text-slate-600 hover:text-slate-800 font-medium flex items-center gap-1"
                            >
                              {allSelected ? <><CheckSquare size={14} /> Deselect All</> : <><Square size={14} /> Select All</>}
                            </button>
                          )}
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && renderQrFieldGrid(selectedFields, (fieldKey) => toggleQrField(role.key, fieldKey))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Freeze Database Section */}
        {activeSection === 'freeze-database' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 min-h-[500px]">
            {/* Header */}
            <div className="flex md:flex-row flex-col items-start md:items-center justify-between mb-6 gap-4 border-b border-gray-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Lock size={20} className="text-red-600" />
                  Freeze Database by Batch
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Locking a batch prevents any further edits to the student profiles of that specific batch.
                </p>
              </div>

              <button
                onClick={() => {
                  fetchAllBatches();
                  fetchFrozenBatches();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                disabled={batchesLoading || frozenBatchesLoading}
              >
                <RefreshCcw size={14} className={batchesLoading || frozenBatchesLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {batchesLoading || frozenBatchesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              </div>
            ) : allBatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <GraduationCap size={48} className="mb-4 text-gray-300" />
                <h3 className="text-base font-semibold text-gray-900">No Batches Found</h3>
                <p className="text-sm">There are no batches configured in the database yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {allBatches.map(batchStr => {
                  const batchValue = typeof batchStr === 'object' ? (batchStr.value || batchStr.yearLabel || batchStr.name || JSON.stringify(batchStr)) : batchStr;
                  const isFrozen = !!frozenBatches[batchValue];
                  const isFullyFrozen = isFrozen && frozenBatches[batchValue]?.includes("ALL");
                  const freezeText = isFullyFrozen ? 'Fully Frozen' : isFrozen ? 'Partially Frozen' : 'Active';
                  const isSaving = savingFrozenBatch === batchValue;
                  return (
                    <div key={batchValue} className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${isFrozen ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="font-bold text-lg text-gray-900">{batchValue} Batch</div>
                        <div className={`text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 ${isFrozen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {isFrozen ? <Lock size={12} /> : <Unlock size={12} />}
                          {freezeText}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-2 pt-4 border-t border-gray-100/50">
                        <button
                          onClick={() => openFreezeConfigModal(batchValue)}
                          disabled={isSaving}
                          className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 ${isFrozen
                            ? 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                        >
                          {isSaving ? (
                            <RefreshCcw size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Settings2 size={14} />
                              Configure Freeze
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Freeze Batch Configuration Modal */}
            {freezeConfigModal.isOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Lock size={20} className="text-red-600" />
                        Configure Freeze Settings for {freezeConfigModal.batch} Batch
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Select specific fields to freeze, or freeze the entire batch to disable all edits.
                      </p>
                    </div>
                    <button
                      onClick={() => setFreezeConfigModal({ isOpen: false, batch: null, selectedFields: [] })}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Freeze All Option */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={freezeConfigModal.selectedFields.includes("ALL")}
                          onChange={(e) => {
                            if (e.target.checked) setFreezeConfigModal(prev => ({ ...prev, selectedFields: ["ALL"] }));
                            else setFreezeConfigModal(prev => ({ ...prev, selectedFields: [] }));
                          }}
                          className="mt-1 w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500"
                        />
                        <div>
                          <span className="block font-bold text-red-900">Freeze Entire Batch</span>
                          <span className="block text-sm text-red-700">Checking this will lock all fields for all students in this batch, completely disabling editing.</span>
                        </div>
                      </label>
                    </div>

                    {/* Field Checkboxes */}
                    {!freezeConfigModal.selectedFields.includes("ALL") && (
                      <div className="space-y-6">
                        {FREEZABLE_FIELDS.map((section, idx) => (
                          <div key={idx}>
                            <h4 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2 uppercase tracking-wide">
                              {section.group}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {section.fields.map(field => {
                                const isSelected = freezeConfigModal.selectedFields.includes(field.key);
                                return (
                                  <label
                                    key={field.key}
                                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setFreezeConfigModal(prev => {
                                          const prevFields = prev.selectedFields;
                                          if (prevFields.includes(field.key)) {
                                            return { ...prev, selectedFields: prevFields.filter(k => k !== field.key) };
                                          } else {
                                            return { ...prev, selectedFields: [...prevFields, field.key] };
                                          }
                                        });
                                      }}
                                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className={`text-sm ${isSelected ? 'font-medium text-blue-900' : 'text-gray-700'}`}>
                                      {field.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <button
                      onClick={() => setFreezeConfigModal({ isOpen: false, batch: null, selectedFields: [] })}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveFreezeConfig}
                      disabled={savingFrozenBatch === freezeConfigModal.batch}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingFrozenBatch === freezeConfigModal.batch ? (
                        <>
                          <RefreshCcw size={16} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          Save Configuration
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit College Modal */}
        {editingCollegeId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Pencil size={18} className="text-blue-600" />
                  Edit College
                </h3>
                <button
                  onClick={() => cancelEditCollege(editingCollegeId)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">College Name *</label>
                  <input
                    type="text"
                    value={collegeDrafts[editingCollegeId]?.name || ''}
                    onChange={(e) => updateCollegeDraft(editingCollegeId, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Enter college name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    College Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={collegeDrafts[editingCollegeId]?.code || ''}
                    onChange={(e) => updateCollegeDraft(editingCollegeId, 'code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none uppercase"
                    placeholder="Enter college code (e.g., PCE)"
                    required
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={collegeDrafts[editingCollegeId]?.address || ''}
                    onChange={(e) => updateCollegeDraft(editingCollegeId, 'address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    placeholder="College address (used on certificates and reports)"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => cancelEditCollege(editingCollegeId)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveCollegeEdits(editingCollegeId)}
                  disabled={savingCollegeId === editingCollegeId}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCollegeId === editingCollegeId ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Course Modal */}
        {editingCourseId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Pencil size={18} className="text-purple-600" />
                  Edit Program
                </h3>
                <button
                  onClick={() => setEditingCourseId(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Program Name *</label>
                  <input
                    type="text"
                    value={courseDrafts[editingCourseId]?.name || ''}
                    onChange={(e) => setCourseDrafts(prev => ({ ...prev, [editingCourseId]: { ...prev[editingCourseId], name: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    placeholder="Enter program name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Program Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={courseDrafts[editingCourseId]?.code || ''}
                    onChange={(e) => setCourseDrafts(prev => ({ ...prev, [editingCourseId]: { ...prev[editingCourseId], code: e.target.value.toUpperCase() } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none uppercase"
                    placeholder="Enter program code (e.g., BTECH)"
                    required
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Program Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={courseDrafts[editingCourseId]?.level || 'ug'}
                    onChange={(e) => setCourseDrafts(prev => ({ ...prev, [editingCourseId]: { ...prev[editingCourseId], level: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    required
                  >
                    <option value="diploma">Diploma</option>
                    <option value="ug">UG (Undergraduate)</option>
                    <option value="pg">PG (Postgraduate)</option>
                  </select>
                </div>
                <CourseAcademicStructureFields
                  idPrefix="edit-course"
                  value={courseDrafts[editingCourseId] || {}}
                  onChange={(patch) =>
                    setCourseDrafts((prev) => ({
                      ...prev,
                      [editingCourseId]: { ...prev[editingCourseId], ...patch }
                    }))
                  }
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fee Payment QR
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Upload a QR code image for fee payments for this program.
                  </p>
                  {(courseDrafts[editingCourseId]?.feeQrPreview || courseDrafts[editingCourseId]?.feeQrImageUrl) && (
                    <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <img
                        src={
                          courseDrafts[editingCourseId]?.feeQrPreview
                            || getApiAssetUrl(courseDrafts[editingCourseId]?.feeQrImageUrl)
                        }
                        alt="Fee payment QR preview"
                        className="h-24 w-24 rounded-md border border-gray-200 bg-white object-contain"
                      />
                      <div className="text-xs text-gray-500">
                        {courseDrafts[editingCourseId]?.feeQrFile
                          ? 'New QR selected. Save to upload.'
                          : 'Current saved QR for this program.'}
                      </div>
                    </div>
                  )}
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 transition-colors hover:border-purple-400 hover:bg-purple-50">
                    <Upload size={16} className="text-purple-600" />
                    <span>{courseDrafts[editingCourseId]?.feeQrImageUrl || courseDrafts[editingCourseId]?.feeQrFile ? 'Replace QR Image' : 'Upload QR Image'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                          toast.error('Please upload an image file');
                          return;
                        }
                        setCourseDrafts((prev) => ({
                          ...prev,
                          [editingCourseId]: {
                            ...prev[editingCourseId],
                            feeQrFile: file,
                            feeQrPreview: URL.createObjectURL(file)
                          }
                        }));
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => setEditingCourseId(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveCourseEdits(editingCourseId)}
                  disabled={savingCourseId === editingCourseId}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingCourseId === editingCourseId ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Batch Students Modal */}
        {viewBatchStudentsModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
              <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users size={24} className="text-blue-600" />
                    Students in Batch {viewBatchStudentsModal.batch}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Total {viewBatchStudentsModal.students.length} student(s) mapped to this batch.
                  </p>
                </div>
                <button
                  onClick={() => setViewBatchStudentsModal({ isOpen: false, batch: null, students: [], loading: false })}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-0 bg-gray-50/50">
                {viewBatchStudentsModal.loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : viewBatchStudentsModal.students.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Users size={48} className="mb-4 text-gray-300" />
                    <p className="text-base font-medium text-gray-900">No students found</p>
                    <p className="text-sm">No students are currently mapped to this batch.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-100 text-gray-600 font-semibold text-xs uppercase sticky top-0 shadow-sm z-10 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 font-semibold tracking-wider">Admission No</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Name</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Program / Branch</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Current Year/Sem</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {viewBatchStudentsModal.students.map((student, idx) => {
                          const studName = student.student_name || student.student_data?.student_name || student.student_data?.['Student Name'] || '-';
                          const studCourse = student.course || student.student_data?.course || student.student_data?.['Program Name'] || student.student_data?.['Course'] || '-';
                          const studBranch = student.branch || student.student_data?.branch || student.student_data?.['Branch Name'] || student.student_data?.['Branch'] || '-';
                          const studYr = student.current_year || student.student_data?.current_year || student.student_data?.['Current Academic Year'] || '-';
                          const studSem = student.current_semester || student.student_data?.current_semester || student.student_data?.['Current Semester'] || '-';
                          const studStatus = student.student_status || student.student_data?.student_status || student.student_data?.['Student Status'] || 'Regular';

                          return (
                            <tr key={student.admission_number || idx} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-6 py-3.5 font-medium text-gray-900">{student.admission_number}</td>
                              <td className="px-6 py-3.5">{studName}</td>
                              <td className="px-6 py-3.5">
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-900">{studCourse}</span>
                                  <span className="text-xs text-gray-500">{studBranch}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">Y{studYr} / S{studSem}</td>
                              <td className="px-6 py-3.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${studStatus === 'Regular' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {studStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <p className="text-sm text-gray-500">
                  {!!frozenBatches[viewBatchStudentsModal.batch] ? (
                    <span className="flex items-center gap-1.5 text-red-600 font-medium whitespace-nowrap">
                      <Lock size={16} />
                      This batch is currently frozen.
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-green-600 font-medium whitespace-nowrap">
                      <Unlock size={16} />
                      This batch is currently active.
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setViewBatchStudentsModal({ isOpen: false, batch: null, students: [], loading: false })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Branch Modal */}
        {editingBranch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Pencil size={18} className="text-orange-600" />
                  Edit Branch
                </h3>
                <button
                  onClick={cancelEditBranch}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
                  <input
                    type="text"
                    value={branchDrafts[editingBranch.branchId]?.name || ''}
                    onChange={(e) => updateBranchDraft(editingBranch.branchId, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="Enter branch name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Branch Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={branchDrafts[editingBranch.branchId]?.code || ''}
                    onChange={(e) => updateBranchDraft(editingBranch.branchId, 'code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none uppercase"
                    placeholder="Enter branch code (e.g., CSE)"
                    required
                    maxLength={10}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Years</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={branchDrafts[editingBranch.branchId]?.totalYears || ''}
                      onChange={(e) => updateBranchDraft(editingBranch.branchId, 'totalYears', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Semesters/Year</label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={branchDrafts[editingBranch.branchId]?.semestersPerYear || ''}
                      onChange={(e) => updateBranchDraft(editingBranch.branchId, 'semestersPerYear', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={cancelEditBranch}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const branch = courseBranches[editingBranch.courseId]?.find(b => b.id === editingBranch.branchId);
                    if (branch) saveBranchEdit(editingBranch.courseId, branch);
                  }}
                  disabled={savingBranchId === editingBranch.branchId}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {savingBranchId === editingBranch.branchId ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Batch Students Modal */}
        {viewBatchStudentsModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users size={24} className="text-blue-600" />
                    Students in Batch {viewBatchStudentsModal.batch}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Total {viewBatchStudentsModal.students.length} student(s) mapped to this batch.
                  </p>
                </div>
                <button
                  onClick={() => setViewBatchStudentsModal({ isOpen: false, batch: null, students: [], loading: false })}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-0 bg-gray-50/50">
                {viewBatchStudentsModal.loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : viewBatchStudentsModal.students.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Users size={48} className="mb-4 text-gray-300" />
                    <p className="text-base font-medium text-gray-900">No students found</p>
                    <p className="text-sm">No students are currently mapped to this batch.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-100 text-gray-600 font-semibold text-xs uppercase sticky top-0 shadow-sm z-10 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 font-semibold tracking-wider">Admission No</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Name</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Program / Branch</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Current Year/Sem</th>
                          <th className="px-6 py-3 font-semibold tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {viewBatchStudentsModal.students.map((student, idx) => {
                          const studName = student.student_name || student.student_data?.student_name || student.student_data?.['Student Name'] || '-';
                          const studCourse = student.course || student.student_data?.course || student.student_data?.['Program Name'] || student.student_data?.['Course'] || '-';
                          const studBranch = student.branch || student.student_data?.branch || student.student_data?.['Branch Name'] || student.student_data?.['Branch'] || '-';
                          const studYr = student.current_year || student.student_data?.current_year || student.student_data?.['Current Academic Year'] || '-';
                          const studSem = student.current_semester || student.student_data?.current_semester || student.student_data?.['Current Semester'] || '-';
                          const studStatus = student.student_status || student.student_data?.student_status || student.student_data?.['Student Status'] || 'Regular';

                          return (
                            <tr key={student.admission_number || idx} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-6 py-3.5 font-medium text-gray-900">{student.admission_number}</td>
                              <td className="px-6 py-3.5">{studName}</td>
                              <td className="px-6 py-3.5">
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-900">{studCourse}</span>
                                  <span className="text-xs text-gray-500">{studBranch}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">Y{studYr} / S{studSem}</td>
                              <td className="px-6 py-3.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${studStatus === 'Regular' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {studStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <p className="text-sm text-gray-500">
                  {!!frozenBatches[viewBatchStudentsModal.batch] ? (
                    <span className="flex items-center gap-1.5 text-red-600 font-medium whitespace-nowrap">
                      <Lock size={16} />
                      This batch is currently frozen.
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-green-600 font-medium whitespace-nowrap">
                      <Unlock size={16} />
                      This batch is currently active.
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setViewBatchStudentsModal({ isOpen: false, batch: null, students: [], loading: false })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, type: null, item: null, onConfirm: null, affectedStudents: [], totalStudentCount: 0, hasMoreStudents: false, isLoadingStudents: false })}
          onConfirm={deleteModal.onConfirm || (() => { })}
          title={`Delete ${deleteModal.type === 'college' ? 'College' : deleteModal.type === 'course' ? 'Program' : deleteModal.type === 'academicYear' ? 'Academic Year' : deleteModal.type === 'quota' ? 'Quota' : deleteModal.type === 'form' ? 'Form' : 'Branch'}`}
          itemName={deleteModal.item?.name || deleteModal.item?.yearLabel || deleteModal.item?.form_name}
          itemType={deleteModal.type}
          affectedStudents={deleteModal.affectedStudents || []}
          totalStudentCount={deleteModal.totalStudentCount || 0}
          hasMoreStudents={deleteModal.hasMoreStudents || false}
          isLoadingStudents={deleteModal.isLoadingStudents || false}
        />
      </div>

      {/* Add College Modal - Using createPortal to render to document.body */}
      {isAddCollegeModalOpen && typeof document !== 'undefined' && document.body && createPortal(
        <div
          data-modal="add-college"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddCollegeModalOpen(false);
              resetNewCollege();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-2xl max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex: 10000 }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add New College</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Create a new college to organize programs
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddCollegeModalOpen(false);
                  resetNewCollege();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCollege} className="p-6 space-y-4">
              {/* College Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  College Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCollege.name}
                  onChange={(e) => setNewCollege((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="College name (e.g., Pydah College of Engineering)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              {/* College Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  College Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCollege.code}
                  onChange={(e) => setNewCollege((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="College code (e.g., PCE)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 uppercase"
                  required
                  maxLength={10}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Unique code for the college (e.g., PCE, PDC)
                </p>
              </div>

              {/* College Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Address
                </label>
                <textarea
                  value={newCollege.address}
                  onChange={(e) => setNewCollege((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="College address (used on certificates and reports)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCollegeModalOpen(false);
                    resetNewCollege();
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    creatingCollege ||
                    !newCollege.name.trim() ||
                    !newCollege.code?.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingCollege ? (
                    <>
                      <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create College
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add Branch Modal - Using createPortal to render to document.body */}
      {isAddBranchModalOpen && typeof document !== 'undefined' && document.body && createPortal(
        <div
          data-modal="add-branch"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddBranchModalOpen(false);
              resetNewBranch();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-2xl max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex: 10000 }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add New Branch</h3>
                {selectedCourse && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    for <span className="font-medium text-orange-600">{selectedCourse.name}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsAddBranchModalOpen(false);
                  resetNewBranch();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddBranch(null);
              }}
              className="p-6 space-y-4"
            >
              {/* Branch Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Branch name (e.g., CSE, ECE)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>

              {/* Branch Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Branch Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newBranch.code}
                  onChange={(e) => setNewBranch((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Branch code (e.g., CSE)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 uppercase"
                  required
                  maxLength={10}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Unique code for the branch (e.g., CSE, ECE)
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddBranchModalOpen(false);
                    resetNewBranch();
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    savingBranchId === `new-${branchModalCourseId}` ||
                    !newBranch.name.trim() ||
                    !newBranch.code.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingBranchId === `new-${branchModalCourseId}` ? (
                    <>
                      <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Branch
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add Course Modal - Using createPortal to render to document.body */}
      {isAddCourseModalOpen && typeof document !== 'undefined' && document.body && createPortal(
        <div
          data-modal="add-course"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddCourseModalOpen(false);
              resetNewCourse();
            }
          }}
        >
          <div
            className="w-full max-w-2xl rounded-lg bg-white shadow-2xl max-h-[90vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex: 10000 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add New Program</h3>
                {selectedCollege && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    for <span className="font-medium text-purple-600">{selectedCollege.name}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsAddCourseModalOpen(false);
                  resetNewCourse();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Program Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Program Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Course name (e.g., B.Tech, Diploma)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Program Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Program Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourse.code}
                  onChange={(e) => setNewCourse((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Program code (e.g., BTECH, DIP)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 uppercase"
                  required
                  maxLength={20}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Unique code for the program (e.g., BTECH, DIP)
                </p>
              </div>

              {/* Program Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Program Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={newCourse.level || 'ug'}
                  onChange={(e) => setNewCourse((prev) => ({ ...prev, level: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                >
                  <option value="diploma">Diploma</option>
                  <option value="ug">UG (Undergraduate)</option>
                  <option value="pg">PG (Postgraduate)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Select the academic level of this program
                </p>
              </div>

              <CourseAcademicStructureFields
                idPrefix="add-course"
                value={newCourse}
                onChange={(patch) => setNewCourse((prev) => ({ ...prev, ...patch }))}
              />
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCourseModalOpen(false);
                    resetNewCourse();
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    creatingCourse ||
                    !newCourse.name.trim() ||
                    !newCourse.code?.trim() ||
                    !newCourse.totalYears ||
                    Number(newCourse.totalYears) <= 0 ||
                    (!newCourse.usePerYearConfig && (!newCourse.semestersPerYear || Number(newCourse.semestersPerYear) <= 0)) ||
                    (newCourse.usePerYearConfig && (!newCourse.yearSemesterConfig || newCourse.yearSemesterConfig.length !== Number(newCourse.totalYears)))
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingCourse ? (
                    <>
                      <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Program
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const TextField = ({ label, value, onChange, placeholder = '', required = false, className = '' }) => (
  <label className={`flex flex-col gap-1.5 ${className}`}>
    <span className="text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
    />
  </label>
);

const NumberField = ({ label, value, onChange, min, max, className = '' }) => (
  <label className={`flex flex-col gap-1.5 ${className}`}>
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
    />
  </label>
);

const StatCard = ({ icon: Icon, title, value }) => (
  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
      <Icon size={20} />
    </div>
    <div>
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);

const StatusBadge = ({ isActive }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
      }`}
  >
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

const CollegeCard = ({
  college,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onToggleActive,
  isEditing,
  isSaving,
  draft,
  onUpdateDraft,
  onSave,
  onCancel,
  coursesCount
}) => {
  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 transition-all ${isSelected
        ? 'border-blue-500 bg-blue-50 shadow-sm'
        : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }`}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={draft?.name || college.name}
            onChange={(e) => onUpdateDraft('name', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            placeholder="College name"
          />
          <input
            type="text"
            value={draft?.code || college.code || ''}
            onChange={(e) => onUpdateDraft('code', e.target.value.toUpperCase())}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors uppercase"
            placeholder="College code (e.g., PCE)"
            required
            maxLength={10}
          />
          <textarea
            value={draft?.address ?? college.address ?? ''}
            onChange={(e) => onUpdateDraft('address', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors resize-none"
            placeholder="College address"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={onSelect}
              className="flex-1 text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{college.name}</span>
                <StatusBadge isActive={college.isActive} />
              </div>
            </button>
          </div>
          {college.address && (
            <p className="mb-1 text-xs text-gray-500 line-clamp-2">{college.address}</p>
          )}
          <p className="mb-3 text-xs text-gray-500">{coursesCount || 0} courses</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSelect}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <BookOpen size={14} />
              View Courses
            </button>
            <button
              onClick={onEdit}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={onToggleActive}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {college.isActive ? (
                <>
                  <ToggleRight size={14} className="text-green-600" />
                  Active
                </>
              ) : (
                <>
                  <ToggleLeft size={14} className="text-gray-500" />
                  Activate
                </>
              )}
            </button>
            <button
              onClick={onDelete}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const CourseCard = ({ course, isSelected, onSelect }) => {
  // Count unique branch names (not total across batches)
  const activeBranches = new Set(
    (course.branches || []).filter((branch) => branch.isActive).map((branch) => branch.name)
  ).size;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-all ${isSelected
        ? 'border-blue-500 bg-blue-50 shadow-sm'
        : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{course.name}</span>
        <StatusBadge isActive={course.isActive} />
      </div>
      <p className="mt-1.5 text-sm text-gray-600">{formatCourseStructureSummary(course)}</p>
      <p className="mt-1.5 text-xs text-gray-500">{activeBranches} active branches</p>
    </button>
  );
};

const EmptyState = () => (
  <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <Settings2 size={24} className="text-gray-500" />
    </div>
    <h3 className="text-base font-semibold text-gray-900 mb-2">No courses yet</h3>
    <p className="text-sm text-gray-600">
      Add your first course above to configure its branches and academic stages.
    </p>
  </div>
);

export default Settings;


import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  UserPlus,
  Users as UsersIcon,
  RefreshCw,
  Edit,
  Power,
  X,
  Building2,
  GraduationCap,
  BookOpen,
  Search,
  User,
  Settings,
  Layers,
  CheckCircle2,
  XCircle,
  Check,
  Mail,
  Phone,
  AtSign,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Edit3,
  Send,
  AlertCircle,
  KeyRound,
  Trash2,
  AlertTriangle,
  Save,
  ToggleRight,
  ToggleLeft,
  Shield
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { ROLE_LABELS, ROLE_COLORS, isFullAccessRole, hasModuleAccess, hasWriteAccess, FRONTEND_MODULES, BACKEND_MODULES, MODULE_PERMISSIONS, MODULE_LABELS, createDefaultPermissions } from '../constants/rbac';

const ROLE_AVATAR_COLORS = {
  college_principal: 'from-indigo-400 to-indigo-600',
  college_ao: 'from-sky-400 to-sky-600',
  college_attender: 'from-slate-400 to-slate-600',
  branch_hod: 'from-amber-400 to-amber-600',
  office_assistant: 'from-purple-400 to-purple-600',
  cashier: 'from-green-400 to-green-600',
  faculty: 'from-teal-400 to-teal-600',
  super_admin: 'from-rose-400 to-rose-600'
};

const ROLE_DESCRIPTIONS = {
  college_principal: 'Manages overall college operations and has oversight of all programs and branches',
  college_ao: 'Administrative officer responsible for college-level operations and record management',
  college_attender: 'Basic access for attendance tracking and daily record management',
  branch_hod: 'Head of Department with control over specific branches and their operations',
  office_assistant: 'Assists with office operations, document management, and administrative tasks',
  cashier: 'Handles fee collection, payment processing, and financial transactions',
  faculty: 'Teaching staff with access to student records, attendance, and course-related modules'
};

// Helper: prefer API roleLabel so role always shows (backend is source of truth)
const getRoleDisplay = (user) => (user?.roleLabel ?? ROLE_LABELS[user?.role] ?? user?.role ?? '—');

// Fixed roles list (includes Faculty for Create/Edit)
const FIXED_ROLES = [
  { value: 'college_principal', label: 'College Principal' },
  { value: 'college_ao', label: 'College AO' },
  { value: 'college_attender', label: 'College Attender' },
  { value: 'branch_hod', label: 'Branch HOD' },
  { value: 'office_assistant', label: 'Office Assistant' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'faculty', label: 'Faculty' }
];

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  username: '',
  password: '',
  role: '',
  collegeIds: [],
  courseIds: [],
  branchIds: [],
  allCourses: false,
  allBranches: false,
  permissions: {},
  hrms_id: ''
};

// Selection Modal Component
const SelectionModal = ({
  isOpen,
  onClose,
  title,
  icon: Icon,
  options,
  selectedIds,
  onChange,
  loading,
  searchPlaceholder = "Search...",
  colorScheme = "blue",
  displayKey = "name",
  allOption = null,
  allSelected = false,
  onAllChange = null,
  emptyMessage = "No options available"
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const colors = {
    blue: {
      bg: 'bg-blue-600',
      light: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200',
      gradient: 'from-blue-600 to-indigo-600'
    },
    green: {
      bg: 'bg-emerald-600',
      light: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-200',
      gradient: 'from-emerald-600 to-teal-600'
    },
    orange: {
      bg: 'bg-orange-600',
      light: 'bg-orange-50',
      text: 'text-orange-600',
      border: 'border-orange-200',
      gradient: 'from-orange-600 to-amber-600'
    }
  };
  const c = colors[colorScheme] || colors.blue;

  const filteredOptions = options.filter(opt =>
    (opt[displayKey] || opt.name).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = (e) => {
    e.preventDefault();
    onChange(options.map(o => o.id));
  };

  const clearAll = (e) => {
    e.preventDefault();
    onChange([]);
  };

  const handleAllOptionChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAllChange) {
      onAllChange(!allSelected);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-lg sm:rounded-2xl shadow-2xl overflow-hidden my-auto">
        <div className={`bg-gradient-to-r ${c.gradient} px-4 sm:px-6 py-3 sm:py-4`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-white truncate">{title}</h3>
                <p className="text-xs sm:text-sm text-white/80">
                  {selectedIds.length} of {options.length} selected
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 active:bg-white/40 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-lg sm:rounded-xl border border-slate-200 bg-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all touch-manipulation min-h-[44px]"
              />
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={selectAll}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-sm font-semibold ${c.light} ${c.text} hover:opacity-80 active:opacity-90 transition-all touch-manipulation min-h-[44px]`}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition-all touch-manipulation min-h-[44px]"
              >
                Clear
              </button>
            </div>
          </div>

          {allOption && onAllChange && (
            <div
              onClick={handleAllOptionChange}
              className={`flex items-center gap-3 mt-3 p-4 rounded-xl cursor-pointer transition-all border-2 ${allSelected
                ? `${c.light} ${c.border} ${c.text}`
                : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${allSelected ? `${c.bg} border-transparent` : 'border-slate-300'
                }`}>
                {allSelected && <Check size={14} className="text-white" />}
              </div>
              <div className="flex-1">
                <span className="font-semibold">{allOption}</span>
                <p className="text-xs text-slate-500 mt-0.5">Grant access to all items automatically</p>
              </div>
              <Sparkles size={18} className={allSelected ? c.text : 'text-slate-400'} />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 lg:p-6 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw size={32} className={`${c.text} animate-spin mb-3`} />
              <p className="text-slate-500">Loading options...</p>
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className={`w-16 h-16 ${c.light} rounded-2xl flex items-center justify-center mb-4`}>
                <Icon size={28} className={c.text} />
              </div>
              <p className="text-slate-500 font-medium">{emptyMessage}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredOptions.map(option => {
                const isSelected = selectedIds.includes(option.id);
                return (
                  <div
                    key={option.id}
                    onClick={(e) => !allSelected && handleToggle(option.id, e)}
                    className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all border-2 ${isSelected
                      ? `${c.light} ${c.border}`
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      } ${allSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? `${c.bg} border-transparent` : 'border-slate-300'
                      }`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium block truncate ${isSelected ? c.text : 'text-slate-700'}`}>
                        {option[displayKey] || option.name}
                      </span>
                      {option.code && (
                        <span className="text-xs text-slate-500">{option.code}</span>
                      )}
                    </div>
                    {isSelected && <Check size={16} className={c.text} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-sm text-slate-500 text-center sm:text-left">
            <span className="font-semibold">{selectedIds.length}</span> items selected
          </p>
          <button
            type="button"
            onClick={onClose}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-white ${c.bg} hover:opacity-90 active:opacity-80 transition-all shadow-sm touch-manipulation min-h-[44px]`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Icon mapping for field categories
const ICON_MAP = {
  User,
  Phone,
  GraduationCap,
  Users: UsersIcon,
  FileText: BookOpen,
  BookOpen,
  Shield
};

const UserManagement = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [users, setUsers] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);
  const [loadingColleges, setLoadingColleges] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('create');
  const [showPassword, setShowPassword] = useState(false);

  // HRMS Search States
  const [hrmsSearchQuery, setHrmsSearchQuery] = useState('');
  const [hrmsSearchResults, setHrmsSearchResults] = useState([]);
  const [searchingHrms, setSearchingHrms] = useState(false);
  const [showHrmsSearch, setShowHrmsSearch] = useState(false);

  // Selection modal states
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);

  // Reset password modal states
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Check if user has management permissions
  const canManageUsers = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasWriteAccess(user.permissions, FRONTEND_MODULES.USERS);
  }, [user]);

  // Redirect to users tab if user doesn't have create permission
  useEffect(() => {
    if (!canManageUsers && activeTab === 'create') {
      setActiveTab('users');
    }
  }, [canManageUsers, activeTab]);

  useEffect(() => {
    if (activeTab === 'roles' || activeTab === 'users') loadRoleConfigs();
  }, [activeTab]);

  const loadAvailableRolesForCreate = async () => {
    try {
      const res = await api.get('/rbac/users/roles/available');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setAvailableRolesForCreate(res.data.data);
      }
    } catch (_) {
      setAvailableRolesForCreate([]);
    }
  };

  useEffect(() => {
    if (activeTab === 'create' || activeTab === 'users') loadAvailableRolesForCreate();
  }, [activeTab]);

  const [userRoleFilter, setUserRoleFilter] = useState('');

  // Delete user modal states
  const [deleteUserModal, setDeleteUserModal] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Edit scope modal states
  const [showEditCollegeModal, setShowEditCollegeModal] = useState(false);
  const [showEditCourseModal, setShowEditCourseModal] = useState(false);
  const [showEditBranchModal, setShowEditBranchModal] = useState(false);
  const [editCourses, setEditCourses] = useState([]);
  const [editBranches, setEditBranches] = useState([]);
  const [loadingEditCourses, setLoadingEditCourses] = useState(false);
  const [loadingEditBranches, setLoadingEditBranches] = useState(false);

  // Module access modal state
  const [showModuleAccessModal, setShowModuleAccessModal] = useState(false);
  const [moduleAccessUser, setModuleAccessUser] = useState(null);
  const [selectedModuleKey, setSelectedModuleKey] = useState(null);

  // Field-level permissions modal state
  const [showFieldPermissionsModal, setShowFieldPermissionsModal] = useState(false);
  const [fieldCategories, setFieldCategories] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [activeFieldCategory, setActiveFieldCategory] = useState('');
  const [fieldPermissions, setFieldPermissions] = useState({});

  // Role configuration tab state
  const [roleConfigs, setRoleConfigs] = useState([]);
  const [loadingRoleConfigs, setLoadingRoleConfigs] = useState(false);
  const [showRoleConfigModal, setShowRoleConfigModal] = useState(false);
  const [roleConfigModalRole, setRoleConfigModalRole] = useState(null);
  const [roleConfigModalPermissions, setRoleConfigModalPermissions] = useState({});
  const [roleConfigSelectedModule, setRoleConfigSelectedModule] = useState(null);
  const [savingRoleConfig, setSavingRoleConfig] = useState(false);
  const [fieldPermissionsContext, setFieldPermissionsContext] = useState('user');
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [deleteRoleModal, setDeleteRoleModal] = useState(null);
  const [deletingRole, setDeletingRole] = useState(false);
  const [availableRolesForCreate, setAvailableRolesForCreate] = useState([]);

  const hasUserManagementAccess = useMemo(() => {
    if (isFullAccessRole(user?.role)) return true;
    if (user?.permissions) {
      const perm = user.permissions[BACKEND_MODULES.USER_MANAGEMENT];
      return perm && (perm.view || perm.control);
    }
    return false;
  }, [user]);

  const initializePermissions = useCallback(() => {
    return createDefaultPermissions();
  }, []);

  const loadModules = async () => {
    setLoadingModules(true);
    try {
      const response = await api.get('/rbac/users/modules');
      if (response.data?.success) setModules(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load modules');
    } finally {
      setLoadingModules(false);
    }
  };

  const loadColleges = async () => {
    setLoadingColleges(true);
    try {
      const response = await api.get('/colleges?includeInactive=false');
      if (response.data?.success) setColleges(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load colleges');
    } finally {
      setLoadingColleges(false);
    }
  };

  const loadCourses = async (collegeIds) => {
    if (!collegeIds || collegeIds.length === 0) {
      setCourses([]);
      return;
    }
    setLoadingCourses(true);
    try {
      const coursePromises = collegeIds.map(id => api.get(`/colleges/${id}/courses?includeInactive=false`));
      const responses = await Promise.all(coursePromises);
      const allCourses = responses.flatMap((response) => (response.data?.data || []));
      const uniqueCourses = allCourses.reduce((acc, course) => {
        if (!acc.find(c => c.id === course.id)) {
          // Include level in the name for display
          acc.push({
            ...course,
            name: course.name + (course.level ? ` (${course.level.toUpperCase()})` : '')
          });
        }
        return acc;
      }, []);
      setCourses(uniqueCourses);
    } catch (error) {
      toast.error('Failed to load courses');
    } finally {
      setLoadingCourses(false);
    }
  };

  const loadBranches = async (courseIds, coursesList = courses) => {
    if (!courseIds || courseIds.length === 0) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    try {
      const branchPromises = courseIds.map(id => api.get(`/courses/${id}/branches?includeInactive=false`));
      const responses = await Promise.all(branchPromises);

      const courseMap = {};
      coursesList.forEach(c => { courseMap[c.id] = c.name; });

      const allBranches = responses.flatMap((response, idx) =>
        (response.data?.data || []).map(branch => ({
          ...branch,
          courseId: courseIds[idx],
          courseName: courseMap[courseIds[idx]] || '',
          displayName: `${branch.name} (${courseMap[courseIds[idx]] || 'Course'})`
        }))
      );

      // Deduplicate branches by name and course
      const uniqueBranchesMap = new Map();
      allBranches.forEach(branch => {
        const key = `${branch.name}-${branch.courseId}`;
        if (!uniqueBranchesMap.has(key)) {
          uniqueBranchesMap.set(key, branch);
        }
      });

      const uniqueBranches = Array.from(uniqueBranchesMap.values());
      setBranches(uniqueBranches);
    } catch (error) {
      toast.error('Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get('/rbac/users');
      if (response.data?.success) setUsers(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRoleConfigs = async () => {
    setLoadingRoleConfigs(true);
    try {
      const response = await api.get('/rbac/role-config');
      if (response.data?.success) setRoleConfigs(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load role configurations');
    } finally {
      setLoadingRoleConfigs(false);
    }
  };

  const loadStudentFields = async (source = 'user') => {
    setLoadingFields(true);
    try {
      const response = await api.get('/rbac/users/student-fields');
      if (response.data?.success) {
        const categories = response.data.data.categories || [];
        const categoriesWithIcons = categories.map(cat => ({
          ...cat,
          icon: ICON_MAP[cat.icon] || Shield
        }));

        setFieldCategories(categoriesWithIcons);
        if (categoriesWithIcons.length > 0 && !activeFieldCategory) {
          setActiveFieldCategory(categoriesWithIcons[0].id);
        }

        if (source === 'roleConfig') {
          const stored = roleConfigModalPermissions?.student_management?.field_permissions;
          if (stored && typeof stored === 'object') {
            setFieldPermissions(stored);
          } else {
            const allPerms = {};
            categoriesWithIcons.forEach(category => {
              category.fields.forEach(field => {
                allPerms[field.key] = { view: true, edit: false };
              });
            });
            setFieldPermissions(allPerms);
          }
        } else if (moduleAccessUser?.permissions?.student_management?.field_permissions) {
          setFieldPermissions(moduleAccessUser.permissions.student_management.field_permissions);
        } else {
          const allPerms = {};
          categoriesWithIcons.forEach(category => {
            category.fields.forEach(field => {
              allPerms[field.key] = { view: true, edit: false };
            });
          });
          setFieldPermissions(allPerms);
        }
      }
    } catch (error) {
      console.error('Error loading student fields:', error);
      toast.error('Failed to load student fields');
    } finally {
      setLoadingFields(false);
    }
  };

  // Field permission toggle functions
  const toggleFieldPermission = (fieldKey, permissionType) => {
    setFieldPermissions(prev => {
      const current = prev[fieldKey] || { view: false, edit: false };
      const updated = {
        ...current,
        [permissionType]: !current[permissionType]
      };

      // If edit is enabled, automatically enable view
      if (permissionType === 'edit' && updated.edit) {
        updated.view = true;
      }

      // If view is disabled, automatically disable edit
      if (permissionType === 'view' && !updated.view) {
        updated.edit = false;
      }

      return {
        ...prev,
        [fieldKey]: updated
      };
    });
  };

  const grantAllViewPermissions = () => {
    const allPerms = {};
    fieldCategories.forEach(category => {
      category.fields.forEach(field => {
        allPerms[field.key] = { view: true, edit: false };
      });
    });
    setFieldPermissions(allPerms);
    toast.success('View permission granted to all fields!');
  };

  const saveFieldPermissions = async () => {
    if (fieldPermissionsContext === 'roleConfig') {
      setRoleConfigModalPermissions(prev => ({
        ...prev,
        student_management: {
          ...(prev.student_management || {}),
          field_permissions: fieldPermissions
        }
      }));
      setShowFieldPermissionsModal(false);
      setFieldPermissionsContext('user');
      toast.success('Field permissions updated for this role. Click "Save & apply to existing users" to apply.');
      return;
    }

    if (!moduleAccessUser) {
      console.error("No user selected for module access");
      return;
    }

    try {
      const updatedPermissions = {
        ...(moduleAccessUser.permissions || {}),
        student_management: {
          ...(moduleAccessUser.permissions?.student_management || {}),
          field_permissions: fieldPermissions
        }
      };

      setModuleAccessUser(prev => ({
        ...prev,
        permissions: updatedPermissions
      }));

      setUsers(prevUsers => prevUsers.map(u =>
        u.id === moduleAccessUser.id
          ? { ...u, permissions: updatedPermissions }
          : u
      ));

      // Update the editForm state if likely open/active
      setEditForm(prev =>
        prev && prev.id === moduleAccessUser.id
          ? { ...prev, permissions: updatedPermissions }
          : prev
      );

      toast.success('Field permissions configured! Click "Save Module Access" to apply changes.');
      setShowFieldPermissionsModal(false);
    } catch (error) {
      console.error('Error configuring field permissions:', error);
      toast.error('Failed to configure field permissions');
    }
  };

  // Load courses for edit modal
  const loadEditCourses = async (collegeIds) => {
    if (!collegeIds || collegeIds.length === 0) {
      setEditCourses([]);
      return;
    }
    setLoadingEditCourses(true);
    try {
      const coursePromises = collegeIds.map(id => api.get(`/colleges/${id}/courses?includeInactive=false`));
      const responses = await Promise.all(coursePromises);
      const allCourses = responses.flatMap((response) => (response.data?.data || []));
      const uniqueCourses = allCourses.reduce((acc, course) => {
        if (!acc.find(c => c.id === course.id)) {
          // Include level in the name for display
          acc.push({
            ...course,
            name: course.name + (course.level ? ` (${course.level.toUpperCase()})` : '')
          });
        }
        return acc;
      }, []);
      setEditCourses(uniqueCourses);
    } catch (error) {
      toast.error('Failed to load courses');
    } finally {
      setLoadingEditCourses(false);
    }
  };

  // Load branches for edit modal
  const loadEditBranches = async (courseIds, coursesList = editCourses) => {
    if (!courseIds || courseIds.length === 0) {
      setEditBranches([]);
      return;
    }
    setLoadingEditBranches(true);
    try {
      const branchPromises = courseIds.map(id => api.get(`/courses/${id}/branches?includeInactive=false`));
      const responses = await Promise.all(branchPromises);

      const courseMap = {};
      coursesList.forEach(c => { courseMap[c.id] = c.name; });

      const allBranches = responses.flatMap((response, idx) =>
        (response.data?.data || []).map(branch => ({
          ...branch,
          courseId: courseIds[idx],
          courseName: courseMap[courseIds[idx]] || '',
          displayName: `${branch.name} (${courseMap[courseIds[idx]] || 'Course'})`
        }))
      );

      const uniqueBranchesMap = new Map();
      allBranches.forEach(branch => {
        const key = `${branch.name}-${branch.courseId}`;
        if (!uniqueBranchesMap.has(key)) {
          uniqueBranchesMap.set(key, branch);
        }
      });

      const uniqueBranches = Array.from(uniqueBranchesMap.values());
      setEditBranches(uniqueBranches);
    } catch (error) {
      toast.error('Failed to load branches');
    } finally {
      setLoadingEditBranches(false);
    }
  };

  useEffect(() => {
    if (hasUserManagementAccess) {
      loadModules();
      loadColleges();
      loadUsers();
    }
  }, [hasUserManagementAccess]);

  useEffect(() => {
    const perms = initializePermissions();
    setForm(prev => ({ ...prev, permissions: perms }));
  }, [initializePermissions]);

  useEffect(() => {
    if (form.collegeIds.length > 0) {
      loadCourses(form.collegeIds);
    } else {
      setCourses([]);
      setBranches([]);
    }
    setForm(prev => ({ ...prev, courseIds: [], branchIds: [], allCourses: false, allBranches: false }));
  }, [form.collegeIds]);

  useEffect(() => {
    if (form.courseIds.length > 0 && !form.allCourses) {
      loadBranches(form.courseIds, courses);
    } else {
      setBranches([]);
    }
    setForm(prev => ({ ...prev, branchIds: [], allBranches: false }));
  }, [form.courseIds, form.allCourses]);

  if (!hasUserManagementAccess) {
    return (
      <div className="w-full h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-blue-200 text-blue-700 rounded-xl p-8 shadow-sm max-w-md text-center">
          <XCircle size={48} className="mx-auto mb-4 text-blue-400" />
          <h1 className="text-xl font-bold mb-2 text-slate-800">Access Restricted</h1>
          <p className="text-sm text-slate-600">You do not have permission to manage users.</p>
        </div>
      </div>
    );
  }

  const resetForm = () => {
    const perms = initializePermissions();
    setForm({ ...initialFormState, permissions: perms });
    setCourses([]);
    setBranches([]);
    setShowPassword(false);
  };

  const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleEditPermission = (moduleKey, permissionKey) => {
    setEditForm(prev => {
      const currentModulePerms = prev.permissions[moduleKey] || {};
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleKey]: {
            ...currentModulePerms,
            [permissionKey]: !currentModulePerms[permissionKey]
          }
        }
      };
    });
  };

  // Toggle all permissions for a module
  const toggleModuleAllPermissions = (moduleKey, grant) => {
    const modulePerms = MODULE_PERMISSIONS[moduleKey];
    if (!modulePerms) return;

    setEditForm(prev => {
      const newPerms = {};
      modulePerms.permissions.forEach(perm => {
        newPerms[perm] = grant;
      });
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleKey]: newPerms
        }
      };
    });
  };

  // Check if module has any permission enabled
  const hasAnyModulePermission = (moduleKey) => {
    const perms = editForm?.permissions?.[moduleKey];
    if (!perms) return false;
    return Object.values(perms).some(val => val === true);
  };

  // Count enabled permissions for a module
  const countModulePermissions = (moduleKey) => {
    const perms = editForm?.permissions?.[moduleKey];
    if (!perms) return { enabled: 0, total: 0 };
    const modulePerms = MODULE_PERMISSIONS[moduleKey];
    const total = modulePerms?.permissions?.length || 0;
    const enabled = Object.values(perms).filter(val => val === true).length;
    return { enabled, total };
  };

  // Grant all permissions
  const grantAllPermissions = () => {
    const allPerms = {};
    Object.keys(BACKEND_MODULES).forEach(key => {
      const moduleKey = BACKEND_MODULES[key];
      const modulePerms = MODULE_PERMISSIONS[moduleKey];
      if (modulePerms) {
        allPerms[moduleKey] = {};
        modulePerms.permissions.forEach(perm => {
          allPerms[moduleKey][perm] = true;
        });
      }
    });
    setEditForm(prev => ({ ...prev, permissions: allPerms }));
  };

  // Revoke all permissions
  const revokeAllPermissions = () => {
    setEditForm(prev => ({ ...prev, permissions: createDefaultPermissions() }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.username || !form.role || (!form.password && !form.hrms_id)) {
      toast.error('Please fill all required fields');
      return;
    }
    if (!form.hrms_id && form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (form.collegeIds.length === 0) {
      toast.error('Please select at least one college');
      return;
    }

    setCreatingUser(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || null,
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        collegeIds: form.collegeIds,
        courseIds: form.allCourses ? [] : form.courseIds,
        branchIds: form.allBranches ? [] : form.branchIds,
        allCourses: form.allCourses,
        allBranches: form.allBranches,
        permissions: initializePermissions(),
        hrms_id: form.hrms_id || null, // Include hrms_id
        sendCredentials: !form.hrms_id // Only send credentials for local accounts
      };

      const response = await api.post('/rbac/users', payload);
      if (response.data?.success) {
        if (response.data?.emailSent) {
          toast.success('User created and credentials sent to email!');
        } else {
          // User created but email failed
          const emailError = response.data?.emailError || 'Unknown error';
          toast.warning(`User created successfully, but email notification failed: ${emailError}`, {
            duration: 5000
          });
        }
        resetForm();
        await loadUsers();
        setActiveTab('users');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const openEditModal = async (userData) => {
    setEditingUser(userData);
    setEditForm({
      id: userData.id,
      name: userData.name,
      username: userData.username || '',
      email: userData.email,
      phone: userData.phone || '',
      role: userData.role,
      collegeIds: userData.collegeIds || (userData.collegeId ? [userData.collegeId] : []),
      courseIds: userData.courseIds || (userData.courseId ? [userData.courseId] : []),
      branchIds: userData.branchIds || (userData.branchId ? [userData.branchId] : []),
      allCourses: userData.allCourses || false,
      allBranches: userData.allBranches || false,
      permissions: userData.permissions || {},
      isActive: userData.isActive,
      hrms_id: userData.hrms_id || ''
    });

    const collegeIds = userData.collegeIds || (userData.collegeId ? [userData.collegeId] : []);
    const courseIds = userData.courseIds || (userData.courseId ? [userData.courseId] : []);

    // Load courses and branches for edit modal
    if (collegeIds.length > 0) {
      await loadEditCourses(collegeIds);
    }
    if (courseIds.length > 0 && !userData.allCourses) {
      // Wait a bit for courses to load then load branches
      setTimeout(async () => {
        await loadEditBranches(courseIds);
      }, 100);
    }
  };

  // Handle edit form college change
  const handleEditCollegeChange = async (newCollegeIds) => {
    setEditForm(prev => ({
      ...prev,
      collegeIds: newCollegeIds,
      courseIds: [],
      branchIds: [],
      allCourses: false,
      allBranches: false
    }));
    setEditCourses([]);
    setEditBranches([]);
    if (newCollegeIds.length > 0) {
      await loadEditCourses(newCollegeIds);
    }
  };

  // Handle edit form course change
  const handleEditCourseChange = async (newCourseIds) => {
    setEditForm(prev => ({
      ...prev,
      courseIds: newCourseIds,
      branchIds: [],
      allBranches: false
    }));
    setEditBranches([]);
    if (newCourseIds.length > 0) {
      await loadEditBranches(newCourseIds, editCourses);
    }
  };

  // Handle edit form all courses toggle
  const handleEditAllCoursesChange = (checked) => {
    setEditForm(prev => ({
      ...prev,
      allCourses: checked,
      courseIds: checked ? [] : prev.courseIds,
      allBranches: checked ? true : prev.allBranches,
      branchIds: checked ? [] : prev.branchIds
    }));
    if (checked) {
      setEditBranches([]);
    }
  };

  // Handle edit form all branches toggle
  const handleEditAllBranchesChange = (checked) => {
    setEditForm(prev => ({
      ...prev,
      allBranches: checked,
      branchIds: checked ? [] : prev.branchIds
    }));
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm(null);
    setEditCourses([]);
    setEditBranches([]);
    setShowEditCollegeModal(false);
    setShowEditCourseModal(false);
    setShowEditBranchModal(false);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editForm) return;

    setUpdatingUser(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone?.trim() || null,
        role: editForm.role,
        collegeIds: editForm.collegeIds,
        courseIds: editForm.allCourses ? [] : editForm.courseIds,
        branchIds: editForm.allBranches ? [] : editForm.branchIds,
        allCourses: editForm.allCourses,
        allBranches: editForm.allBranches,
        permissions: editForm.permissions,
        isActive: editForm.isActive,
        hrms_id: editForm.hrms_id || null
      };

      const response = await api.put(`/rbac/users/${editForm.id}`, payload);
      if (response.data?.success) {
        toast.success('User updated successfully!');
        closeEditModal();
        await loadUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update user');
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleDeactivateUser = async (userId) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      const response = await api.delete(`/rbac/users/${userId}`);
      if (response.data?.success) {
        toast.success('User deactivated');
        await loadUsers();
      }
    } catch (error) {
      toast.error('Failed to deactivate user');
    }
  };

  const handleActivateUser = async (userId) => {
    if (!window.confirm('Activate this user?')) return;
    try {
      const response = await api.put(`/rbac/users/${userId}`, { isActive: true });
      if (response.data?.success) {
        toast.success('User activated');
        await loadUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to activate user');
    }
  };

  // Delete User Functions
  const openDeleteModal = (userData) => {
    setDeleteUserModal(userData);
  };

  const closeDeleteModal = () => {
    setDeleteUserModal(null);
  };

  const handlePermanentDelete = async () => {
    if (!deleteUserModal) return;

    setDeletingUser(true);
    try {
      const response = await api.delete(`/rbac/users/${deleteUserModal.id}/permanent`);
      if (response.data?.success) {
        toast.success('User permanently deleted');
        closeDeleteModal();
        await loadUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  // Reset Password Functions
  const openResetPasswordModal = (userData) => {
    setResetPasswordUser(userData);
    setNewPassword('');
    setShowNewPassword(false);
  };

  const closeResetPasswordModal = () => {
    setResetPasswordUser(null);
    setNewPassword('');
    setShowNewPassword(false);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setResettingPassword(true);
    try {
      const response = await api.post(`/rbac/users/${resetPasswordUser.id}/reset-password`, {
        newPassword
      });
      if (response.data?.success) {
        toast.success(response.data.message || 'Password reset successfully!');
        closeResetPasswordModal();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const activeUsersCount = useMemo(() => users.filter(u => u.isActive).length, [users]);

  const usersExcludingSuperAdmin = useMemo(() => users.filter(u => u.role !== 'super_admin'), [users]);

  const roleCounts = useMemo(() => {
    const counts = {};
    usersExcludingSuperAdmin.forEach(u => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return counts;
  }, [usersExcludingSuperAdmin]);

  const roleListForFilter = useMemo(() => {
    const fromConfig = roleConfigs.length ? roleConfigs : FIXED_ROLES.map(r => ({ role_key: r.value, label: r.label }));
    const fromUsers = [...new Set(usersExcludingSuperAdmin.map(u => u.role))];
    const keys = [...new Set([...fromConfig.map(r => r.role_key ?? r.value), ...fromUsers])];
    return keys.map(roleKey => {
      const config = fromConfig.find(r => (r.role_key ?? r.value) === roleKey);
      return {
        value: roleKey,
        label: config?.label ?? ROLE_LABELS[roleKey] ?? roleKey,
        count: roleCounts[roleKey] ?? 0
      };
    }).filter(r => r.label);
  }, [roleConfigs, usersExcludingSuperAdmin, roleCounts]);

  const filteredUsers = useMemo(() => {
    let filtered = usersExcludingSuperAdmin;
    if (userSearchTerm) {
      const term = userSearchTerm.toLowerCase();
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.username?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
      );
    }
    if (userRoleFilter) {
      filtered = filtered.filter(u => u.role === userRoleFilter);
    }
    return filtered;
  }, [usersExcludingSuperAdmin, userSearchTerm, userRoleFilter]);

  // Check if user has any permissions configured
  const hasPermissions = (userData) => {
    if (!userData.permissions) return false;
    return Object.values(userData.permissions).some(modulePerms => {
      if (!modulePerms || typeof modulePerms !== 'object') return false;
      return Object.values(modulePerms).some(val => val === true);
    });
  };

  // Count granted permissions (modules with any permission enabled)
  const countPermissions = (userData) => {
    const totalModules = Object.keys(BACKEND_MODULES).length;
    if (!userData.permissions) return { granted: 0, total: totalModules };
    let granted = 0;
    Object.values(userData.permissions).forEach(modulePerms => {
      if (modulePerms && typeof modulePerms === 'object') {
        if (Object.values(modulePerms).some(val => val === true)) {
          granted++;
        }
      }
    });
    return { granted, total: totalModules };
  };

  const getSelectedNames = (items, ids, key = 'name') => {
    return items.filter(item => ids.includes(item.id)).map(item => item[key] || item.name);
  };

  const needsBranchSelection = form.role === 'branch_hod';

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-blue-50/30">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
              <ShieldCheck size={20} className="sm:hidden text-white" />
              <ShieldCheck size={22} className="hidden sm:block text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold text-slate-800">User Management</h1>
              <p className="text-[10px] sm:text-xs text-slate-500">Create and manage users with role-based access</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-center px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg sm:rounded-xl border border-blue-100">
              <div className="text-sm sm:text-base font-bold text-blue-600">{filteredUsers.length}</div>
              <div className="text-[10px] font-medium text-blue-500 uppercase tracking-wide">Total</div>
            </div>
            <div className="text-center px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg sm:rounded-xl border border-emerald-100">
              <div className="text-sm sm:text-base font-bold text-emerald-600">{filteredUsers.filter(u => u.isActive).length}</div>
              <div className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide">Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 py-2 sm:py-3">
        <div className="flex gap-2">
          {canManageUsers && (
            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold text-xs transition-all touch-manipulation min-h-[40px] flex-1 sm:flex-none ${activeTab === 'create'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                }`}
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Create User</span>
              <span className="sm:hidden">Create</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold text-xs transition-all touch-manipulation min-h-[40px] flex-1 sm:flex-none ${activeTab === 'users'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
              }`}
          >
            <UsersIcon size={16} />
            <span className="hidden sm:inline">All Users ({filteredUsers.length})</span>
            <span className="sm:hidden">Users ({filteredUsers.length})</span>
          </button>
          {canManageUsers && (
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold text-xs transition-all touch-manipulation min-h-[40px] flex-1 sm:flex-none ${activeTab === 'roles'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                }`}
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Role Configuration</span>
              <span className="sm:hidden">Roles</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-2 sm:p-3 lg:p-4 flex flex-col">
        {/* Create User Form */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateUser} className="h-full flex flex-col">
            {/* Step Headers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3 flex-shrink-0">
              <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-slate-200 shadow-sm">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                  1
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">User Information</h3>
                  <p className="text-[10px] text-slate-500">Details & credentials</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-slate-200 shadow-sm">
                <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                  2
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Role Selection</h3>
                  <p className="text-[10px] text-slate-500">Choose role</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-slate-200 shadow-sm">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                  3
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Access Scope</h3>
                  <p className="text-[10px] text-slate-500">Set permissions</p>
                </div>
              </div>
            </div>

            {/* All 3 Sections Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3 flex-1 min-h-0">
              {/* Section 1: User Information */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 flex-shrink-0 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-white" />
                    <h2 className="text-sm font-bold text-white">User Information</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHrmsSearch(!showHrmsSearch)}
                    className="flex items-center gap-1.5 px-2 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-xs transition-colors border border-white/20"
                  >
                    <Search size={12} />
                    Import form HRMS
                  </button>
                </div>
                <div className="p-3 space-y-2.5 flex-1 overflow-y-auto">
                  {showHrmsSearch && (
                    <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-inner">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Search HRMS Employee</label>
                      <div className="flex gap-2 relative">
                        <input
                          type="text"
                          value={hrmsSearchQuery}
                          onChange={(e) => setHrmsSearchQuery(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (!hrmsSearchQuery || hrmsSearchQuery.length < 3) {
                                toast.error('Enter at least 3 characters');
                                return;
                              }
                              setSearchingHrms(true);
                              try {
                                const res = await api.get(`/rbac/users/search-hrms-employee?query=${hrmsSearchQuery}`);
                                if (res.data?.success) {
                                  setHrmsSearchResults(res.data.data);
                                  if (res.data.data.length === 0) toast.error('No employee found');
                                }
                              } catch (err) {
                                toast.error('Failed to search HRMS');
                              } finally {
                                setSearchingHrms(false);
                              }
                            }
                          }}
                          placeholder="Search by Emp No, Name or Email..."
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!hrmsSearchQuery || hrmsSearchQuery.length < 3) {
                              toast.error('Enter at least 3 characters');
                              return;
                            }
                            setSearchingHrms(true);
                            try {
                              const res = await api.get(`/rbac/users/search-hrms-employee?query=${hrmsSearchQuery}`);
                              if (res.data?.success) {
                                setHrmsSearchResults(res.data.data);
                                if (res.data.data.length === 0) toast.error('No employee found');
                              }
                            } catch (err) {
                              toast.error('Failed to search HRMS');
                            } finally {
                              setSearchingHrms(false);
                            }
                          }}
                          disabled={searchingHrms}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                        >
                          {searchingHrms ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                        </button>
                      </div>

                      {hrmsSearchResults.length > 0 && (
                        <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                          {hrmsSearchResults.map(emp => (
                            <div
                              key={emp._id}
                              className="p-2 bg-white hover:bg-blue-50 cursor-pointer flex justify-between items-center group"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  name: emp.name,
                                  email: emp.email,
                                  phone: emp.phone,
                                  username: emp.emp_no || emp.email.split('@')[0],
                                  hrms_id: emp._id,
                                  password: '' // Password not required
                                }));
                                setHrmsSearchResults([]);
                                setHrmsSearchQuery('');
                                setShowHrmsSearch(false);
                                toast.success(`Imported ${emp.name}`);
                              }}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-bold text-slate-800">{emp.name}</div>
                                  <span className={`text-[8px] font-bold uppercase px-1 rounded ${emp.type === 'Employee' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                    {emp.type}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500">{emp.emp_no} • {emp.email}</div>
                              </div>
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Check size={12} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {form.hrms_id && (
                    <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                      <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-emerald-800">Linked to HRMS</p>
                        <p className="text-[10px] text-emerald-600 leading-tight">This mapped user will use their HRMS password to login.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, hrms_id: '' }))}
                        className="p-1 hover:bg-emerald-200 rounded text-emerald-700"
                        title="Unlink"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
                      <User size={12} className="text-blue-500" />
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      readOnly={!!form.hrms_id}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      className={`w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all touch-manipulation min-h-[36px] ${form.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
                      <Mail size={12} className="text-blue-500" />
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      readOnly={!!form.hrms_id}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      className={`w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[36px] ${form.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
                        <AtSign size={12} className="text-blue-500" />
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.username}
                        readOnly={!!form.hrms_id}
                        onChange={(e) => handleFormChange('username', e.target.value)}
                        className={`w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[36px] ${form.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                        placeholder="username"
                        required
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
                        <Phone size={12} className="text-blue-500" />
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        readOnly={!!form.hrms_id}
                        onChange={(e) => handleFormChange('phone', e.target.value)}
                        className={`w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[36px] ${form.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                        placeholder="+91..."
                      />
                    </div>
                  </div>
                  {!form.hrms_id && (
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
                        <Lock size={12} className="text-blue-500" />
                        Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => handleFormChange('password', e.target.value)}
                          className="w-full px-2.5 py-2 pr-8 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[36px]"
                          placeholder="Enter password (min 6 chars)"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 active:text-slate-700 touch-manipulation p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Role Selection */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-white" />
                    <h2 className="text-sm font-bold text-white">Role Selection</h2>
                  </div>
                </div>
                <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                  {(availableRolesForCreate.length ? availableRolesForCreate : FIXED_ROLES.map(r => ({ value: r.value, label: r.label }))).map(role => {
                    const roleValue = role.value ?? role.role_key;
                    const roleLabel = role.label ?? ROLE_LABELS[roleValue];
                    const isSelected = form.role === roleValue;
                    return (
                      <div
                        key={roleValue}
                        onClick={async () => {
                          handleFormChange('role', roleValue);
                          try {
                            const res = await api.get(`/rbac/role-config/${roleValue}`);
                            if (res.data?.success && res.data?.data?.permissions) {
                              setForm(prev => ({ ...prev, role: roleValue, permissions: res.data.data.permissions }));
                            }
                          } catch (_) {
                            setForm(prev => ({ ...prev, role: roleValue, permissions: createDefaultPermissions() }));
                          }
                        }}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border-2 ${isSelected
                          ? `${ROLE_COLORS[roleValue] || 'bg-slate-100 text-slate-700 border-slate-200'} border-current`
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ROLE_AVATAR_COLORS[roleValue] || 'from-slate-400 to-slate-600'} flex items-center justify-center shadow-sm flex-shrink-0`}>
                          <ShieldCheck size={14} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-slate-800">{roleLabel}</h4>
                          <p className="text-[10px] text-slate-500 line-clamp-1">
                            {role.description ?? ROLE_DESCRIPTIONS[roleValue] ?? ''}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 bg-current rounded-full flex items-center justify-center flex-shrink-0">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-slate-500 mt-2 border-t border-slate-100 pt-2">
                    Module access for this role is set in <button type="button" onClick={() => setActiveTab('roles')} className="text-violet-600 font-medium hover:underline">Role Configuration</button>. New users get that access automatically.
                  </p>
                </div>
              </div>

              {/* Section 3: Access Scope */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-white" />
                    <h2 className="text-sm font-bold text-white">Access Scope</h2>
                  </div>
                </div>
                <div className="p-3 space-y-2.5 flex-1 overflow-y-auto">
                  {/* Colleges Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <Building2 size={12} className="text-blue-500" />
                        Colleges <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {form.collegeIds.length} selected
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCollegeModal(true)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all group text-left"
                    >
                      <div className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 flex-shrink-0">
                        <Building2 size={14} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {form.collegeIds.length > 0 ? (
                          <p className="font-medium text-slate-700 text-xs truncate">
                            {getSelectedNames(colleges, form.collegeIds).join(', ')}
                          </p>
                        ) : (
                          <p className="text-slate-400 text-xs">Click to select colleges</p>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Courses Selection */}
                  {form.collegeIds.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                          <GraduationCap size={12} className="text-emerald-500" />
                          Courses
                        </label>
                        <label className="flex items-center gap-1.5 text-[9px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.allCourses}
                            onChange={(e) => {
                              handleFormChange('allCourses', e.target.checked);
                              if (e.target.checked) {
                                handleFormChange('courseIds', []);
                                handleFormChange('allBranches', true);
                                handleFormChange('branchIds', []);
                              }
                            }}
                            className="w-3 h-3 rounded text-emerald-500"
                          />
                          <span className="font-medium text-emerald-600">All</span>
                        </label>
                      </div>
                      {!form.allCourses ? (
                        <button
                          type="button"
                          onClick={() => setShowCourseModal(true)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group text-left"
                        >
                          <div className="w-6 h-6 bg-emerald-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-100 flex-shrink-0">
                            <GraduationCap size={14} className="text-emerald-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {form.courseIds.length > 0 ? (
                              <p className="font-medium text-slate-700 text-xs truncate">
                                {getSelectedNames(courses, form.courseIds).join(', ')}
                              </p>
                            ) : (
                              <p className="text-slate-400 text-xs">Click to select courses</p>
                            )}
                          </div>
                        </button>
                      ) : (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-700">All courses selected</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Branches Selection */}
                  {(form.courseIds.length > 0 && !form.allCourses) && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                          <BookOpen size={12} className="text-orange-500" />
                          Branches {needsBranchSelection && <span className="text-red-500">*</span>}
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.allBranches}
                            onChange={(e) => {
                              handleFormChange('allBranches', e.target.checked);
                              if (e.target.checked) handleFormChange('branchIds', []);
                            }}
                            className="w-3 h-3 rounded text-orange-500"
                          />
                          <span className="font-medium text-orange-600">All</span>
                        </label>
                      </div>
                      {!form.allBranches ? (
                        <button
                          type="button"
                          onClick={() => setShowBranchModal(true)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/50 transition-all group text-left"
                        >
                          <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 flex-shrink-0">
                            <BookOpen size={14} className="text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {form.branchIds.length > 0 ? (
                              <p className="font-medium text-slate-700 text-xs truncate">
                                {getSelectedNames(branches, form.branchIds, 'displayName').join(', ')}
                              </p>
                            ) : (
                              <p className="text-slate-400 text-xs">Click to select branches</p>
                            )}
                          </div>
                        </button>
                      ) : (
                        <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-orange-500" />
                          <span className="text-xs font-medium text-orange-700">All branches selected</span>
                        </div>
                      )}
                    </div>
                  )}

                  {form.collegeIds.length === 0 && (
                    <div className="text-center py-3">
                      <Layers size={20} className="text-slate-300 mx-auto mb-1.5" />
                      <p className="text-[10px] text-slate-400">Select a college to configure access</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 mt-3 sm:mt-4 flex-shrink-0">
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition-all touch-manipulation min-h-[44px] flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                Reset
              </button>
              <button
                type="submit"
                disabled={creatingUser || !form.name || !form.email || !form.username || !form.role || (!form.password && !form.hrms_id) || form.collegeIds.length === 0}
                className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all touch-manipulation min-h-[44px] ${creatingUser || !form.name || !form.email || !form.username || !form.role || (!form.password && !form.hrms_id) || form.collegeIds.length === 0
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/25 active:from-blue-700 active:to-indigo-700'
                  }`}
              >
                {creatingUser ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Create User
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Role Configuration */}
        {activeTab === 'roles' && (
          <div className="w-full bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Settings size={18} />
                  Role Configuration
                </h2>
                <p className="text-xs text-white/90 mt-1">
                  Set default module access per role. Edit names and add custom roles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewRoleLabel('');
                  setNewRoleKey('');
                  setNewRoleDescription('');
                  setShowAddRoleModal(true);
                }}
                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold flex items-center gap-2 flex-shrink-0"
              >
                <UserPlus size={16} />
                Add new role
              </button>
            </div>
            <div className="p-3 sm:p-4 lg:p-6">
              {loadingRoleConfigs ? (
                <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                  <RefreshCw className="animate-spin" size={32} />
                  <p className="text-sm font-medium">Loading role configurations...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {(roleConfigs.length ? roleConfigs : FIXED_ROLES.map(r => ({ role_key: r.value, label: r.label, description: ROLE_DESCRIPTIONS[r.value] || '', permissions: {} }))).map((config) => {
                    const roleKey = config.role_key || config.value;
                    const label = config.label || ROLE_LABELS[roleKey];
                    const description = config.description || ROLE_DESCRIPTIONS[roleKey] || '';
                    const permCount = config.permissions ? Object.values(config.permissions).reduce((acc, m) => acc + (m && typeof m === 'object' ? Object.values(m).filter(v => v === true).length : 0), 0) : 0;
                    return (
                      <div
                        key={roleKey}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all overflow-hidden"
                      >
                        <div className={`p-3 sm:p-4 bg-gradient-to-br ${ROLE_AVATAR_COLORS[roleKey] || 'from-slate-400 to-slate-600'} bg-opacity-10`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ROLE_AVATAR_COLORS[roleKey] || 'from-slate-400 to-slate-600'} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                <ShieldCheck size={16} className="text-white" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-slate-800 text-sm truncate">{label}</h3>
                                <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{description}</p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-500">{permCount} permission(s) configured</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const config = roleConfigs.find(c => (c.role_key || c.value) === roleKey) || {};
                                  setRoleConfigModalRole({
                                    role_key: roleKey,
                                    label: config.label ?? label,
                                    description: config.description ?? description,
                                    is_custom: config.is_custom || false
                                  });
                                  const stored = config.permissions;
                                  const base = createDefaultPermissions();
                                  const perms = {};
                                  Object.keys(base).forEach(mod => {
                                    perms[mod] = { ...(base[mod] || {}), ...(stored?.[mod] || {}) };
                                  });
                                  setRoleConfigModalPermissions(perms);
                                  setRoleConfigSelectedModule(Object.values(BACKEND_MODULES)[0] || null);
                                  setShowRoleConfigModal(true);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
                              >
                                Edit name & configure
                              </button>
                              {config.is_custom && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteRoleModal({ role_key: roleKey, label })}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                                  title="Delete role"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users List */}
        {activeTab === 'users' && (
          <div className="w-full bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <UsersIcon size={18} />
                All Users
              </h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="min-w-[140px] sm:w-44 pl-3 pr-8 py-2.5 rounded-lg sm:rounded-xl bg-white/20 text-white text-sm focus:outline-none focus:bg-white/30 border border-white/20 touch-manipulation min-h-[44px] [&>option]:text-slate-800"
                >
                  <option value="">All roles ({usersExcludingSuperAdmin.length})</option>
                  {roleListForFilter.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} ({r.count})
                    </option>
                  ))}
                </select>
                <div className="relative flex-1 sm:flex-none sm:w-56">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full sm:w-56 pl-10 pr-4 py-2.5 rounded-lg sm:rounded-xl bg-white/20 text-white placeholder-white/60 text-sm focus:outline-none focus:bg-white/30 transition-all touch-manipulation min-h-[44px]"
                  />
                </div>
                <button onClick={loadUsers} className="p-2.5 rounded-lg sm:rounded-xl bg-white/20 text-white hover:bg-white/30 active:bg-white/40 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0">
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>

            {loadingUsers ? (
              <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <RefreshCw className="animate-spin" size={32} />
                <p className="text-sm font-medium">Loading users...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <UsersIcon size={48} className="opacity-30" />
                <p className="text-sm font-medium">No users found</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto border rounded-xl border-slate-200 max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar pb-20">
                  <table className="w-full min-w-[1000px]">
                    <thead className="sticky top-0 z-10 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                      <tr className="bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 border-b-2 border-slate-200">
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest border-r border-slate-200/80 first:rounded-tl-xl">
                          User
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest border-r border-slate-200/80">
                          <div className="flex flex-col gap-1.5">
                            <span>Role</span>
                            <select
                              value={userRoleFilter}
                              onChange={(e) => setUserRoleFilter(e.target.value)}
                              className="w-full min-w-[130px] max-w-[160px] px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-400 transition-shadow"
                            >
                              <option value="">All roles ({usersExcludingSuperAdmin.length})</option>
                              {roleListForFilter.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label} ({r.count})
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest border-r border-slate-200/80">
                          Scope
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest border-r border-slate-200/80">
                          Module Access
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest border-r border-slate-200/80">
                          Status
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-widest rounded-tr-xl">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((userData) => {
                        const permStatus = countPermissions(userData);
                        const hasModuleAccess = hasPermissions(userData);
                        return (
                          <tr key={userData.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex-shrink-0 bg-gradient-to-br ${ROLE_AVATAR_COLORS[userData.role] || 'from-slate-400 to-slate-600'} flex items-center justify-center text-white font-bold text-[13px] shadow-sm`}>
                                  {userData.name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <div className="font-semibold text-slate-800 text-xs truncate max-w-[150px]">{userData.name}</div>
                                    {userData.hrms_id ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-tighter" title="Linked to HRMS">
                                        Linked
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-50 text-slate-400 border border-slate-100 uppercase tracking-tighter" title="Not linked to HRMS">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{userData.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${ROLE_COLORS[userData.role] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                <ShieldCheck size={10} />
                                {ROLE_LABELS[userData.role] || userData.role}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="space-y-0.5 text-[10px]">
                                {userData.collegeNames?.length > 0 && (
                                  <div className="flex items-center gap-1 text-slate-600">
                                    <Building2 size={11} className="text-blue-500 flex-shrink-0" />
                                    <span className="truncate max-w-[120px]">
                                      {userData.collegeNames.map(c => c.name).join(', ')}
                                    </span>
                                  </div>
                                )}
                                {userData.allCourses ? (
                                  <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[9px] font-medium">
                                    All Courses
                                  </span>
                                ) : userData.courseNames?.length > 0 && (
                                  <div className="flex items-center gap-1 text-slate-600">
                                    <GraduationCap size={11} className="text-emerald-500 flex-shrink-0" />
                                    <span className="truncate max-w-[120px]">
                                      {userData.courseNames.map(c => c.name).join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              {canManageUsers ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModuleAccessUser(userData);
                                    setSelectedModuleKey(null);
                                    setShowModuleAccessModal(true);
                                  }}
                                  className={`w-full max-w-[150px] inline-flex items-center justify-between gap-1.5 px-2 py-1 rounded-md border text-[10px] font-semibold transition-all ${hasModuleAccess
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    }`}
                                >
                                  <span className="flex items-center gap-1">
                                    {hasModuleAccess ? (
                                      <CheckCircle2 size={11} />
                                    ) : (
                                      <AlertCircle size={11} />
                                    )}
                                    <span>{hasModuleAccess ? 'Configured' : 'Configure'}</span>
                                  </span>
                                  <span className="text-[9px] bg-white/70 px-1 py-0.5 rounded text-slate-500">
                                    {permStatus.granted}/{permStatus.total}
                                  </span>
                                </button>
                              ) : (
                                <div className={`w-full max-w-[150px] inline-flex items-center justify-between gap-1.5 px-2 py-1 rounded-md border text-[10px] font-semibold ${hasModuleAccess
                                  ? 'bg-emerald-50/50 text-emerald-700/70 border-emerald-100'
                                  : 'bg-slate-50 text-slate-400 border-slate-100'
                                  }`}>
                                  <span className="flex items-center gap-1">
                                    {hasModuleAccess ? (
                                      <CheckCircle2 size={11} />
                                    ) : (
                                      <Shield size={11} />
                                    )}
                                    <span>{hasModuleAccess ? 'Configured' : 'Read Only'}</span>
                                  </span>
                                  <span className="text-[9px] bg-white/50 px-1 py-0.5 rounded text-slate-400">
                                    {permStatus.granted}/{permStatus.total}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {userData.isActive ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-semibold">
                                  <CheckCircle2 size={11} />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-semibold">
                                  <XCircle size={11} />
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                {canManageUsers && (
                                  <>
                                    <button
                                      onClick={() => openEditModal(userData)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                                      title="Edit User"
                                    >
                                      <Edit size={11} />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => openResetPasswordModal(userData)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 transition-colors"
                                      title="Reset Password"
                                    >
                                      <KeyRound size={11} />
                                      Reset
                                    </button>
                                    {userData.isActive ? (
                                      <button
                                        onClick={() => handleDeactivateUser(userData.id)}
                                        className="p-1.5 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                                        title="Deactivate User"
                                      >
                                        <ToggleRight size={14} className="text-emerald-500" />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleActivateUser(userData.id)}
                                        className="p-1.5 rounded-md bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200 transition-colors"
                                        title="Activate User"
                                      >
                                        <ToggleLeft size={14} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => openDeleteModal(userData)}
                                      className="p-1.5 rounded-md bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 border border-red-100 transition-colors"
                                      title="Delete User"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-3">
                  {filteredUsers.map((userData) => {
                    const permStatus = countPermissions(userData);
                    const hasModuleAccess = hasPermissions(userData);
                    return (
                      <div key={userData.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="p-4 space-y-3">
                          {/* User Info Header */}
                          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ROLE_AVATAR_COLORS[userData.role] || 'from-slate-400 to-slate-600'} flex items-center justify-center text-white font-bold text-base shadow-sm flex-shrink-0`}>
                              {userData.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-semibold text-slate-800 text-base">{userData.name}</div>
                                {userData.hrms_id ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-tighter">
                                    Linked
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-50 text-slate-400 border border-slate-100 uppercase tracking-tighter">
                                    Pending
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate">{userData.email}</div>
                              <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${ROLE_COLORS[userData.role] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                <ShieldCheck size={12} />
                                {getRoleDisplay(userData)}
                              </span>
                            </div>
                          </div>

                          {/* Scope */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Scope</h4>
                            <div className="space-y-1.5 text-xs">
                              {userData.collegeNames?.length > 0 && (
                                <div className="flex items-start gap-1.5 text-slate-600">
                                  <Building2 size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                  <span className="flex-1">{userData.collegeNames.map(c => c.name).join(', ')}</span>
                                </div>
                              )}
                              {userData.allCourses ? (
                                <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-medium">
                                  All Courses
                                </span>
                              ) : userData.courseNames?.length > 0 && (
                                <div className="flex items-start gap-1.5 text-slate-600">
                                  <GraduationCap size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <span className="flex-1">{userData.courseNames.map(c => c.name).join(', ')}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Module Access & Status */}
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Module Access</h4>
                              {canManageUsers ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModuleAccessUser(userData);
                                    setSelectedModuleKey(null);
                                    setShowModuleAccessModal(true);
                                  }}
                                  className={`w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${hasModuleAccess
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {hasModuleAccess ? (
                                      <CheckCircle2 size={12} />
                                    ) : (
                                      <AlertCircle size={12} />
                                    )}
                                    <span>{hasModuleAccess ? 'Configured' : 'Configure'}</span>
                                  </span>
                                  <span className="text-[10px] bg-white/70 px-1.5 py-0.5 rounded-md text-slate-500">
                                    {permStatus.granted}/{permStatus.total}
                                  </span>
                                </button>
                              ) : (
                                <div className={`w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${hasModuleAccess
                                  ? 'bg-emerald-50/50 text-emerald-700/70 border-emerald-100'
                                  : 'bg-slate-50 text-slate-400 border-slate-100'
                                  }`}>
                                  <span className="flex items-center gap-1.5">
                                    {hasModuleAccess ? (
                                      <CheckCircle2 size={12} />
                                    ) : (
                                      <Shield size={12} />
                                    )}
                                    <span>{hasModuleAccess ? 'Configured' : 'Read Only'}</span>
                                  </span>
                                  <span className="text-[10px] bg-white/50 px-1.5 py-0.5 rounded-md text-slate-400">
                                    {permStatus.granted}/{permStatus.total}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</h4>
                              {userData.isActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold">
                                  <CheckCircle2 size={12} />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-semibold">
                                  <XCircle size={12} />
                                  Inactive
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                            {canManageUsers && (
                              <>
                                <button
                                  onClick={() => openEditModal(userData)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 border border-blue-200 transition-colors touch-manipulation min-h-[44px]"
                                  title="Edit User"
                                >
                                  <Edit size={13} />
                                  Edit
                                </button>
                                <button
                                  onClick={() => openResetPasswordModal(userData)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 transition-colors touch-manipulation min-h-[44px]"
                                  title="Reset Password"
                                >
                                  <KeyRound size={13} />
                                  Reset
                                </button>
                                {userData.isActive ? (
                                  <button
                                    onClick={() => handleDeactivateUser(userData.id)}
                                    className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    title="Deactivate User"
                                  >
                                    <ToggleRight size={18} className="text-emerald-500" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleActivateUser(userData.id)}
                                    className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    title="Activate User"
                                  >
                                    <ToggleLeft size={18} />
                                  </button>
                                )}
                                <button
                                  onClick={() => openDeleteModal(userData)}
                                  className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                                  title="Delete User Permanently"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
            }
          </div >
        )}
      </div >

      {/* Selection Modals */}
      < SelectionModal
        isOpen={showCollegeModal}
        onClose={() => setShowCollegeModal(false)}
        title="Select Colleges"
        icon={Building2}
        options={colleges}
        selectedIds={form.collegeIds}
        onChange={(ids) => handleFormChange('collegeIds', ids)}
        loading={loadingColleges}
        searchPlaceholder="Search colleges..."
        colorScheme="blue"
        emptyMessage="No colleges available"
      />

      <SelectionModal
        isOpen={showCourseModal}
        onClose={() => setShowCourseModal(false)}
        title="Select Courses"
        icon={GraduationCap}
        options={courses}
        selectedIds={form.courseIds}
        onChange={(ids) => handleFormChange('courseIds', ids)}
        loading={loadingCourses}
        searchPlaceholder="Search courses..."
        colorScheme="green"
        allOption="All Courses"
        allSelected={form.allCourses}
        onAllChange={(val) => {
          handleFormChange('allCourses', val);
          if (val) {
            handleFormChange('courseIds', []);
            handleFormChange('allBranches', true);
            handleFormChange('branchIds', []);
          }
        }}
        emptyMessage="No courses available for selected colleges"
      />

      <SelectionModal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        title="Select Branches"
        icon={BookOpen}
        options={branches}
        selectedIds={form.branchIds}
        onChange={(ids) => handleFormChange('branchIds', ids)}
        loading={loadingBranches}
        searchPlaceholder="Search branches..."
        colorScheme="orange"
        displayKey="displayName"
        allOption="All Branches"
        allSelected={form.allBranches}
        onAllChange={(val) => {
          handleFormChange('allBranches', val);
          if (val) handleFormChange('branchIds', []);
        }}
        emptyMessage="No branches available for selected courses"
      />

      {/* Add new role modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus size={20} />
                Add new role
              </h2>
              <button type="button" onClick={() => setShowAddRoleModal(false)} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Role name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newRoleLabel}
                  onChange={(e) => {
                    const oldSlug = newRoleLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    const newSlug = e.target.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    setNewRoleLabel(e.target.value);
                    if (!newRoleKey || newRoleKey === oldSlug) setNewRoleKey(newSlug);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  placeholder="e.g. Department Manager"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Role key (optional)</label>
                <input
                  type="text"
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 font-mono text-xs"
                  placeholder="e.g. department_manager"
                />
                <p className="text-[10px] text-slate-500 mt-1">Used internally; auto-filled from name if empty.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  placeholder="Brief description of this role"
                />
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddRoleModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingRole || !newRoleLabel.trim()}
                onClick={async () => {
                  const key = (newRoleKey && newRoleKey.length >= 2) ? newRoleKey : newRoleLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  if (!key || key.length < 2) {
                    toast.error('Enter a role name or role key (at least 2 characters)');
                    return;
                  }
                  setCreatingRole(true);
                  try {
                    const res = await api.post('/rbac/role-config', {
                      role_key: key,
                      label: newRoleLabel.trim(),
                      description: newRoleDescription.trim() || undefined
                    });
                    if (res.data?.success) {
                      toast.success('Role created. Configure its module access below.');
                      setShowAddRoleModal(false);
                      setNewRoleLabel('');
                      setNewRoleKey('');
                      setNewRoleDescription('');
                      loadRoleConfigs();
                    } else {
                      toast.error(res.data?.message || 'Failed to create role');
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to create role');
                  } finally {
                    setCreatingRole(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
              >
                {creatingRole ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Create role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete role confirm modal */}
      {deleteRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
              <h3 className="text-base font-bold text-red-800">Delete role</h3>
            </div>
            <div className="p-4 text-sm text-slate-600">
              <p>Delete the role <strong>"{deleteRoleModal.label}"</strong>? This cannot be undone.</p>
              <p className="mt-2 text-slate-500 text-xs">No users must have this role. If any do, reassign them first.</p>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRoleModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingRole}
                onClick={async () => {
                  setDeletingRole(true);
                  try {
                    const res = await api.delete(`/rbac/role-config/${deleteRoleModal.role_key}`);
                    if (res.data?.success) {
                      toast.success('Role deleted');
                      setDeleteRoleModal(null);
                      loadRoleConfigs();
                    } else {
                      toast.error(res.data?.message || 'Failed to delete role');
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to delete role');
                  } finally {
                    setDeletingRole(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deletingRole ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Configuration Modal */}
      {showRoleConfigModal && roleConfigModalRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl rounded-lg sm:rounded-2xl shadow-2xl my-auto overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Settings size={20} className="text-white flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate">Configure role</h2>
                  <p className="text-xs text-white/80">Edit role name, description, and module access. Changes apply to new users and (optionally) existing users.</p>
                </div>
              </div>
              <button type="button" onClick={() => { setShowRoleConfigModal(false); setRoleConfigModalRole(null); setFieldPermissionsContext('user'); }} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <X size={20} />
              </button>
            </div>
            {/* Editable role name and description */}
            <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Role name</label>
                <input
                  type="text"
                  value={roleConfigModalRole.label || ''}
                  onChange={(e) => setRoleConfigModalRole(prev => prev ? { ...prev, label: e.target.value } : null)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  placeholder="e.g. College Principal"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={roleConfigModalRole.description ?? ''}
                  onChange={(e) => setRoleConfigModalRole(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  placeholder="Brief description of this role"
                />
              </div>
              {roleConfigModalRole.is_custom && (
                <p className="text-[10px] text-slate-500">Role key: <code className="bg-slate-200 px-1 rounded">{roleConfigModalRole.role_key}</code> (cannot be changed)</p>
              )}
            </div>
            <div className="flex-1 flex flex-col sm:flex-row min-h-[360px] max-h-[70vh] overflow-hidden">
              <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50/80 overflow-y-auto">
                <div className="px-3 py-2 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Modules</p>
                </div>
                <div className="p-2 space-y-1">
                  {Object.keys(BACKEND_MODULES).map((key) => {
                    const moduleKey = BACKEND_MODULES[key];
                    const modulePerms = MODULE_PERMISSIONS[moduleKey];
                    const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
                    if (!modulePerms) return null;
                    const permsForRole = roleConfigModalPermissions[moduleKey] || {};
                    const enabledCount = Object.values(permsForRole).filter(v => v === true).length;
                    const totalCount = modulePerms.permissions.length;
                    const isActive = roleConfigSelectedModule === moduleKey;
                    return (
                      <button
                        key={moduleKey}
                        type="button"
                        onClick={() => setRoleConfigSelectedModule(moduleKey)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left transition-all ${isActive ? 'bg-white text-violet-700 border border-violet-200 shadow-sm' : 'bg-transparent text-slate-700 hover:bg-white'}`}
                      >
                        <span className="truncate font-medium">{moduleLabel}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{enabledCount}/{totalCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 bg-white overflow-y-auto p-4">
                {(() => {
                  const effectiveModuleKey = roleConfigSelectedModule || Object.values(BACKEND_MODULES)[0];
                  const modulePerms = MODULE_PERMISSIONS[effectiveModuleKey];
                  const moduleLabel = MODULE_LABELS[effectiveModuleKey] || effectiveModuleKey;
                  if (!modulePerms) return <p className="text-sm text-slate-500">Select a module</p>;
                  const permsForRole = roleConfigModalPermissions[effectiveModuleKey] || {};
                  const toggleOne = (permKey) => {
                    setRoleConfigModalPermissions(prev => ({
                      ...prev,
                      [effectiveModuleKey]: {
                        ...(prev[effectiveModuleKey] || {}),
                        [permKey]: !permsForRole[permKey]
                      }
                    }));
                  };
                  const toggleAll = (grant) => {
                    const next = {};
                    modulePerms.permissions.forEach(p => { next[p] = grant; });
                    setRoleConfigModalPermissions(prev => ({ ...prev, [effectiveModuleKey]: next }));
                  };
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-800">{moduleLabel}</h3>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => toggleAll(true)} className="px-3 py-1.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200">Grant All</button>
                          <button type="button" onClick={() => toggleAll(false)} className="px-3 py-1.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200">Revoke All</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {modulePerms.permissions.map((permKey) => {
                          const enabled = permsForRole[permKey] === true;
                          const label = modulePerms.labels?.[permKey] || permKey;
                          const isStudentMgmtView = effectiveModuleKey === BACKEND_MODULES.STUDENT_MANAGEMENT && permKey === 'view';
                          return (
                            <div key={permKey} className={isStudentMgmtView ? 'sm:col-span-2 flex gap-2 items-center' : ''}>
                              <button
                                type="button"
                                onClick={() => toggleOne(permKey)}
                                className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                              >
                                <span className="font-medium">{label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{enabled ? 'Allowed' : 'Disabled'}</span>
                              </button>
                              {isStudentMgmtView && enabled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFieldPermissionsContext('roleConfig');
                                    setShowFieldPermissionsModal(true);
                                    loadStudentFields('roleConfig');
                                  }}
                                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                                >
                                  <Settings size={14} />
                                  Configure Fields
                                </button>
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
            <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={() => { setShowRoleConfigModal(false); setRoleConfigModalRole(null); setFieldPermissionsContext('user'); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                disabled={savingRoleConfig}
                onClick={async () => {
                  if (!roleConfigModalRole?.role_key) return;
                  setSavingRoleConfig(true);
                  try {
                    const res = await api.put(`/rbac/role-config/${roleConfigModalRole.role_key}`, {
                      label: roleConfigModalRole.label?.trim() || roleConfigModalRole.role_key,
                      description: roleConfigModalRole.description?.trim() ?? '',
                      permissions: roleConfigModalPermissions,
                      propagateToExistingUsers: true
                    });
                    if (res.data?.success) {
                      toast.success(res.data?.message || 'Role configuration saved and applied to existing users.');
                      setShowRoleConfigModal(false);
                      setRoleConfigModalRole(null);
                      loadRoleConfigs();
                    } else {
                      toast.error(res.data?.message || 'Failed to save');
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to save role configuration');
                  } finally {
                    setSavingRoleConfig(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
              >
                {savingRoleConfig ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Save & apply to existing users
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Module Access Modal - Left: modules list, Right: access details */}
      {
        showModuleAccessModal && moduleAccessUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-5xl rounded-lg sm:rounded-2xl shadow-2xl my-auto overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Settings size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">
                      Module Access - {moduleAccessUser.name}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 truncate">
                      {moduleAccessUser.email} • {getRoleDisplay(moduleAccessUser)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModuleAccessModal(false);
                    setModuleAccessUser(null);
                    setSelectedModuleKey(null);
                  }}
                  className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 active:bg-white/40 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body: Left sidebar (modules), Right content (permissions) */}
              <div className="flex-1 flex flex-col sm:flex-row min-h-[360px] max-h-[70vh]">
                {/* Left: Module list */}
                <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50/80 overflow-y-auto">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Pages / Modules
                    </p>
                  </div>
                  <div className="p-2 space-y-1">
                    {Object.keys(BACKEND_MODULES).map((key) => {
                      const moduleKey = BACKEND_MODULES[key];
                      const modulePerms = MODULE_PERMISSIONS[moduleKey];
                      const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;
                      if (!modulePerms) return null;

                      const permsForUser = moduleAccessUser.permissions?.[moduleKey] || {};
                      const enabledCount = Object.values(permsForUser).filter((v) => v === true).length;
                      const totalCount = modulePerms.permissions.length;
                      const isActive = selectedModuleKey === moduleKey;

                      return (
                        <button
                          key={moduleKey}
                          type="button"
                          onClick={() => setSelectedModuleKey(moduleKey)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm text-left transition-all ${isActive
                            ? 'bg-white text-blue-700 border border-blue-200 shadow-sm'
                            : 'bg-transparent text-slate-700 hover:bg-white'
                            }`}
                        >
                          <span className="truncate font-medium">{moduleLabel}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {enabledCount}/{totalCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Permissions for selected module */}
                <div className="flex-1 bg-white overflow-y-auto">
                  {(() => {
                    const effectiveModuleKey =
                      selectedModuleKey || Object.values(BACKEND_MODULES)[0];
                    const modulePerms = MODULE_PERMISSIONS[effectiveModuleKey];
                    const moduleLabel = MODULE_LABELS[effectiveModuleKey] || effectiveModuleKey;
                    if (!modulePerms) {
                      return (
                        <div className="h-full flex items-center justify-center p-6">
                          <p className="text-sm text-slate-500">
                            Select a module from the left to configure access.
                          </p>
                        </div>
                      );
                    }

                    const permsForUser =
                      moduleAccessUser.permissions?.[effectiveModuleKey] || {};
                    const allEnabled = modulePerms.permissions.every(
                      (p) => permsForUser[p] === true
                    );

                    const toggleSinglePermission = (permKey) => {
                      setModuleAccessUser((prev) => {
                        if (!prev) return prev;
                        const currentPerms = prev.permissions || {};
                        const moduleEntry = currentPerms[effectiveModuleKey] || {};
                        const updatedModuleEntry = {
                          ...moduleEntry,
                          [permKey]: !moduleEntry[permKey],
                        };
                        const updatedPermissions = {
                          ...currentPerms,
                          [effectiveModuleKey]: updatedModuleEntry,
                        };
                        return { ...prev, permissions: updatedPermissions };
                      });
                      setUsers((prevUsers) =>
                        prevUsers.map((u) =>
                          u.id === moduleAccessUser.id
                            ? {
                              ...u,
                              permissions: {
                                ...u.permissions,
                                [effectiveModuleKey]: {
                                  ...(u.permissions?.[effectiveModuleKey] || {}),
                                  [permKey]:
                                    !(
                                      u.permissions?.[effectiveModuleKey]?.[permKey]
                                    ),
                                },
                              },
                            }
                            : u
                        )
                      );
                      setEditForm((prev) =>
                        prev && prev.id === moduleAccessUser.id
                          ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              [effectiveModuleKey]: {
                                ...(prev.permissions?.[effectiveModuleKey] || {}),
                                [permKey]:
                                  !(
                                    prev.permissions?.[effectiveModuleKey]?.[permKey]
                                  ),
                              },
                            },
                          }
                          : prev
                      );
                    };

                    const toggleAllForModule = (grant) => {
                      setModuleAccessUser((prev) => {
                        if (!prev) return prev;
                        const currentPerms = prev.permissions || {};
                        const updatedModuleEntry = {};
                        modulePerms.permissions.forEach((p) => {
                          updatedModuleEntry[p] = grant;
                        });
                        const updatedPermissions = {
                          ...currentPerms,
                          [effectiveModuleKey]: updatedModuleEntry,
                        };
                        return { ...prev, permissions: updatedPermissions };
                      });
                      setUsers((prevUsers) =>
                        prevUsers.map((u) =>
                          u.id === moduleAccessUser.id
                            ? {
                              ...u,
                              permissions: {
                                ...u.permissions,
                                [effectiveModuleKey]: modulePerms.permissions.reduce(
                                  (acc, p) => ({ ...acc, [p]: grant }),
                                  {}
                                ),
                              },
                            }
                            : u
                        )
                      );
                      setEditForm((prev) =>
                        prev && prev.id === moduleAccessUser.id
                          ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              [effectiveModuleKey]: modulePerms.permissions.reduce(
                                (acc, p) => ({ ...acc, [p]: grant }),
                                {}
                              ),
                            },
                          }
                          : prev
                      );
                    };

                    return (
                      <div className="h-full flex flex-col">
                        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Access Controls
                            </p>
                            <h3 className="text-sm sm:text-base font-bold text-slate-800">
                              {moduleLabel}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAllForModule(true)}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            >
                              Grant All
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAllForModule(false)}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 transition-colors"
                            >
                              Revoke All
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 p-4 sm:p-5 space-y-3 overflow-y-auto">
                          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            <p>
                              Turn individual permissions on or off for this page. Granting all
                              permissions will give full control for{' '}
                              <span className="font-semibold">{moduleLabel}</span>.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {modulePerms.permissions.map((permKey) => {
                              const enabled = permsForUser[permKey] === true;
                              const label = modulePerms.labels[permKey] || permKey;
                              const isStudentMgmtView = effectiveModuleKey === BACKEND_MODULES.STUDENT_MANAGEMENT && permKey === 'view';

                              return (
                                <div key={permKey} className={isStudentMgmtView ? "sm:col-span-2" : ""}>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleSinglePermission(permKey)}
                                      className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${enabled
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span
                                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${enabled
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'bg-slate-50 border-slate-300 text-slate-400'
                                            }`}
                                        >
                                          {enabled ? (
                                            <Check size={13} />
                                          ) : (
                                            <X size={13} />
                                          )}
                                        </span>
                                        <span className="font-medium truncate">{label}</span>
                                      </span>
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${enabled
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-slate-100 text-slate-500'
                                          }`}
                                      >
                                        {enabled ? 'Allowed' : 'Disabled'}
                                      </span>
                                    </button>

                                    {/* Add Configure Fields button for Student Management View permission */}
                                    {isStudentMgmtView && enabled && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFieldPermissionsContext('user');
                                          setShowFieldPermissionsModal(true);
                                          loadStudentFields('user');
                                        }}
                                        className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                                      >
                                        <Settings size={14} />
                                        Configure Fields
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {allEnabled && (
                            <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                              <Sparkles size={14} />
                              <span>
                                All permissions are granted for this module. The user has full
                                control over <span className="font-semibold">{moduleLabel}</span>.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer with Save Logic */}
              <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModuleAccessModal(false);
                    setModuleAccessUser(null);
                    setSelectedModuleKey(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                  disabled={loadingUsers}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!moduleAccessUser) return;
                    try {
                      setLoadingUsers(true);
                      // Update user endpoint
                      const response = await api.put(`/rbac/users/${moduleAccessUser.id}`, {
                        name: moduleAccessUser.name,
                        email: moduleAccessUser.email,
                        role: moduleAccessUser.role,
                        isActive: moduleAccessUser.isActive,
                        permissions: moduleAccessUser.permissions,
                        collegeIds: moduleAccessUser.collegeIds || [],
                        courseIds: moduleAccessUser.courseIds || [],
                        branchIds: moduleAccessUser.branchIds || []
                      });

                      if (response.data?.success) {
                        toast.success('Permissions updated successfully!');
                        setShowModuleAccessModal(false);
                        setModuleAccessUser(null);
                        setSelectedModuleKey(null);
                        await loadUsers();
                      } else {
                        toast.error('Failed to update permissions');
                      }
                    } catch (error) {
                      console.error('Permission update error:', error);
                      toast.error(error.response?.data?.message || 'Failed to update permissions');
                    } finally {
                      setLoadingUsers(false);
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  disabled={loadingUsers}
                >
                  {loadingUsers ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Modal with Improved Permissions UI */}
      {
        editingUser && editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-7xl rounded-lg sm:rounded-2xl shadow-2xl max-h-[95vh] my-auto overflow-hidden flex flex-col">
              <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 min-w-0 flex-1">
                  <Edit size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="truncate">Edit User - {editForm.name}</span>
                </h2>
                <button onClick={closeEditModal} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 active:bg-white/40 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0 ml-2">
                  <X size={20} />
                </button>
              </div>

              <form className="flex-1 overflow-y-auto p-4 sm:p-6" onSubmit={handleUpdateUser}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                  {/* User Info */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <User size={16} className="text-blue-500" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">User Details</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowHrmsSearch(!showHrmsSearch)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                      >
                        <Search size={12} />
                        Link HRMS Profile
                      </button>
                    </div>

                    {showHrmsSearch && (
                      <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-inner">
                        <label className="text-xs font-bold text-slate-700 block mb-1">Search HRMS Employee</label>
                        <div className="flex gap-2 relative">
                          <input
                            type="text"
                            value={hrmsSearchQuery}
                            onChange={(e) => setHrmsSearchQuery(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!hrmsSearchQuery || hrmsSearchQuery.length < 3) {
                                  toast.error('Enter at least 3 characters');
                                  return;
                                }
                                setSearchingHrms(true);
                                try {
                                  const res = await api.get(`/rbac/users/search-hrms-employee?query=${hrmsSearchQuery}`);
                                  if (res.data?.success) {
                                    setHrmsSearchResults(res.data.data);
                                    if (res.data.data.length === 0) toast.error('No employee found');
                                  }
                                } catch (err) {
                                  toast.error('Failed to search HRMS');
                                } finally {
                                  setSearchingHrms(false);
                                }
                              }
                            }}
                            placeholder="Search by Emp No, Name or Email..."
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!hrmsSearchQuery || hrmsSearchQuery.length < 3) {
                                toast.error('Enter at least 3 characters');
                                return;
                              }
                              setSearchingHrms(true);
                              try {
                                const res = await api.get(`/rbac/users/search-hrms-employee?query=${hrmsSearchQuery}`);
                                if (res.data?.success) {
                                  setHrmsSearchResults(res.data.data);
                                  if (res.data.data.length === 0) toast.error('No employee found');
                                }
                              } catch (err) {
                                toast.error('Failed to search HRMS');
                              } finally {
                                setSearchingHrms(false);
                              }
                            }}
                            disabled={searchingHrms}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                          >
                            {searchingHrms ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                          </button>
                        </div>

                        {hrmsSearchResults.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                            {hrmsSearchResults.map(emp => (
                              <div
                                key={emp._id}
                                className="p-2 bg-white hover:bg-blue-50 cursor-pointer flex justify-between items-center group"
                                onClick={() => {
                                  setEditForm(prev => ({
                                    ...prev,
                                    name: emp.name,
                                    email: emp.email,
                                    username: emp.emp_no || emp.email.split('@')[0],
                                    phone: emp.phone || prev.phone,
                                    hrms_id: emp._id
                                  }));
                                  setHrmsSearchResults([]);
                                  setHrmsSearchQuery('');
                                  setShowHrmsSearch(false);
                                  toast.success(`Successfully mapped ${emp.name} to this account`);
                                }}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-bold text-slate-800">{emp.name}</div>
                                    <span className={`text-[8px] font-bold uppercase px-1 rounded ${emp.type === 'Employee' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                      {emp.type}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">{emp.emp_no} • {emp.email}</div>
                                </div>
                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Check size={12} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editForm.hrms_id && (
                      <div className="mb-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                        <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-emerald-800">Linked to HRMS</p>
                          <p className="text-xs text-emerald-600 leading-tight mt-1">
                            This user is mapped to HRMS profile ID: <strong>{editForm.hrms_id.substring(0, 8)}...</strong>
                          </p>
                          <p className="text-xs text-emerald-600 leading-tight mt-1">They can login with their local credentials AND their HRMS credentials.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, hrms_id: '' }))}
                          className="p-1.5 hover:bg-emerald-200 rounded-lg text-emerald-700 transition-colors"
                          title="Unlink"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        readOnly={!!editForm.hrms_id}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all ${editForm.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Username</label>
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
                        <AtSign size={14} className="text-slate-400" />
                        <span>{editForm.username || 'N/A'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        readOnly={!!editForm.hrms_id}
                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all ${editForm.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Phone</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        readOnly={!!editForm.hrms_id}
                        onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all ${editForm.hrms_id ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Role</label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {FIXED_ROLES.map(role => {
                          const isSelected = editForm.role === role.value;
                          return (
                            <div
                              key={role.value}
                              onClick={() => setEditForm(prev => ({ ...prev, role: role.value }))}
                              className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all border-2 ${isSelected
                                ? `${ROLE_COLORS[role.value]} border-current`
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ROLE_AVATAR_COLORS[role.value]} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                <ShieldCheck size={14} className="text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-xs text-slate-800">{role.label}</h4>
                                <p className="text-[10px] text-slate-500 line-clamp-1">
                                  {ROLE_DESCRIPTIONS[role.value]}
                                </p>
                              </div>
                              {isSelected && (
                                <div className="w-4 h-4 bg-current rounded-full flex items-center justify-center flex-shrink-0">
                                  <Check size={10} className="text-white" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.checked }))}
                        className="w-5 h-5 rounded text-blue-600"
                      />
                      <span className="font-medium text-slate-700">Active User</span>
                    </label>
                  </div>

                  {/* Access Scope Edit */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Layers size={16} className="text-emerald-500" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">Access Scope</h3>
                    </div>

                    {/* Colleges Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <Building2 size={14} className="text-blue-500" />
                          Colleges <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {editForm.collegeIds.length} selected
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditCollegeModal(true)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all group text-left"
                      >
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100">
                          <Building2 size={16} className="text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {editForm.collegeIds.length > 0 ? (
                            <p className="font-medium text-slate-700 text-sm truncate">
                              {getSelectedNames(colleges, editForm.collegeIds).join(', ')}
                            </p>
                          ) : (
                            <p className="text-slate-400 text-sm">Click to select colleges</p>
                          )}
                        </div>
                        <Edit size={14} className="text-slate-400 group-hover:text-blue-500" />
                      </button>
                    </div>

                    {/* Courses Selection */}
                    {editForm.collegeIds.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                            <GraduationCap size={12} className="text-emerald-500" />
                            Courses
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.allCourses}
                              onChange={(e) => handleEditAllCoursesChange(e.target.checked)}
                              className="w-3 h-3 rounded text-emerald-500"
                            />
                            <span className="font-medium text-emerald-600">All</span>
                          </label>
                        </div>
                        {!editForm.allCourses ? (
                          <button
                            type="button"
                            onClick={() => setShowEditCourseModal(true)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group text-left"
                          >
                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-100">
                              <GraduationCap size={16} className="text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {editForm.courseIds.length > 0 ? (
                                <p className="font-medium text-slate-700 text-sm truncate">
                                  {getSelectedNames(editCourses, editForm.courseIds).join(', ')}
                                </p>
                              ) : (
                                <p className="text-slate-400 text-sm">Click to select courses</p>
                              )}
                            </div>
                            <Edit size={14} className="text-slate-400 group-hover:text-emerald-500" />
                          </button>
                        ) : (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            <span className="text-sm font-medium text-emerald-700">All courses selected</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Branches Selection */}
                    {(editForm.courseIds.length > 0 && !editForm.allCourses) && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                            <BookOpen size={14} className="text-orange-500" />
                            Branches
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.allBranches}
                              onChange={(e) => handleEditAllBranchesChange(e.target.checked)}
                              className="w-3 h-3 rounded text-orange-500"
                            />
                            <span className="font-medium text-orange-600">All</span>
                          </label>
                        </div>
                        {!editForm.allBranches ? (
                          <button
                            type="button"
                            onClick={() => setShowEditBranchModal(true)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/50 transition-all group text-left"
                          >
                            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100">
                              <BookOpen size={16} className="text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {editForm.branchIds.length > 0 ? (
                                <p className="font-medium text-slate-700 text-sm truncate">
                                  {getSelectedNames(editBranches, editForm.branchIds, 'displayName').join(', ')}
                                </p>
                              ) : (
                                <p className="text-slate-400 text-sm">Click to select branches</p>
                              )}
                            </div>
                            <Edit size={14} className="text-slate-400 group-hover:text-orange-500" />
                          </button>
                        ) : (
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-orange-500" />
                            <span className="text-sm font-medium text-orange-700">All branches selected</span>
                          </div>
                        )}
                      </div>
                    )}

                    {editForm.collegeIds.length === 0 && (
                      <div className="text-center py-6">
                        <Layers size={32} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Select a college to configure access</p>
                      </div>
                    )}
                  </div>

                  {/* Improved Permissions UI */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                          <Settings size={16} className="text-amber-500" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">Module Permissions</h3>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={grantAllPermissions}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Grant All
                        </button>
                        <button
                          type="button"
                          onClick={revokeAllPermissions}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Revoke All
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {Object.keys(BACKEND_MODULES).map(key => {
                        const moduleKey = BACKEND_MODULES[key];
                        const modulePerms = MODULE_PERMISSIONS[moduleKey];
                        const moduleLabel = MODULE_LABELS[moduleKey];
                        if (!modulePerms) return null;

                        const hasAny = hasAnyModulePermission(moduleKey);
                        const { enabled, total } = countModulePermissions(moduleKey);

                        return (
                          <div
                            key={moduleKey}
                            className={`rounded-xl border-2 transition-all overflow-hidden ${hasAny
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : 'bg-white border-slate-200'
                              }`}
                          >
                            {/* Module Header */}
                            <div className="flex items-center justify-between p-3 bg-slate-50/50">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${hasAny ? 'bg-emerald-100' : 'bg-slate-200'
                                  }`}>
                                  {hasAny ? (
                                    <CheckCircle2 size={14} className="text-emerald-600" />
                                  ) : (
                                    <XCircle size={14} className="text-slate-400" />
                                  )}
                                </div>
                                <span className={`text-sm font-bold ${hasAny ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {moduleLabel}
                                </span>
                                <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                  {enabled}/{total}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleModuleAllPermissions(moduleKey, true)}
                                  className="px-2 py-1 text-[10px] font-semibold bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200 transition-colors"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleModuleAllPermissions(moduleKey, false)}
                                  className="px-2 py-1 text-[10px] font-semibold bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors"
                                >
                                  None
                                </button>
                              </div>
                            </div>

                            {/* Permissions Grid */}
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {modulePerms.permissions.map(permKey => {
                                const isEnabled = editForm?.permissions?.[moduleKey]?.[permKey] || false;
                                const permLabel = modulePerms.labels[permKey] || permKey;

                                return (
                                  <label
                                    key={permKey}
                                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-xs ${isEnabled
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                      }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isEnabled}
                                      onChange={() => toggleEditPermission(moduleKey, permKey)}
                                      className="w-3.5 h-3.5 rounded text-emerald-500"
                                    />
                                    <span className="font-medium truncate">{permLabel}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-3">
                  <button type="button" onClick={closeEditModal} className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors touch-manipulation min-h-[44px]">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatingUser || editForm.collegeIds.length === 0}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 touch-manipulation min-h-[44px] ${updatingUser || editForm.collegeIds.length === 0 ? 'bg-blue-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/25 active:from-blue-700 active:to-indigo-700'
                      }`}
                  >
                    {updatingUser ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {updatingUser ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Edit Scope Selection Modals */}
      <SelectionModal
        isOpen={showEditCollegeModal}
        onClose={() => setShowEditCollegeModal(false)}
        title="Edit Colleges"
        icon={Building2}
        options={colleges}
        selectedIds={editForm?.collegeIds || []}
        onChange={handleEditCollegeChange}
        loading={loadingColleges}
        searchPlaceholder="Search colleges..."
        colorScheme="blue"
        emptyMessage="No colleges available"
      />

      <SelectionModal
        isOpen={showEditCourseModal}
        onClose={() => setShowEditCourseModal(false)}
        title="Edit Courses"
        icon={GraduationCap}
        options={editCourses}
        selectedIds={editForm?.courseIds || []}
        onChange={handleEditCourseChange}
        loading={loadingEditCourses}
        searchPlaceholder="Search courses..."
        colorScheme="green"
        allOption="All Courses"
        allSelected={editForm?.allCourses || false}
        onAllChange={handleEditAllCoursesChange}
        emptyMessage="No courses available for selected colleges"
      />

      <SelectionModal
        isOpen={showEditBranchModal}
        onClose={() => setShowEditBranchModal(false)}
        title="Edit Branches"
        icon={BookOpen}
        options={editBranches}
        selectedIds={editForm?.branchIds || []}
        onChange={(ids) => setEditForm(prev => ({ ...prev, branchIds: ids }))}
        loading={loadingEditBranches}
        searchPlaceholder="Search branches..."
        colorScheme="orange"
        displayKey="displayName"
        allOption="All Branches"
        allSelected={editForm?.allBranches || false}
        onAllChange={handleEditAllBranchesChange}
        emptyMessage="No branches available for selected courses"
      />

      {/* Reset Password Modal */}
      {
        resetPasswordUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-md rounded-lg sm:rounded-2xl shadow-2xl overflow-hidden my-auto">
              <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <KeyRound size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Reset Password</h2>
                    <p className="text-sm text-white/80">{resetPasswordUser.name}</p>
                  </div>
                </div>
                <button onClick={closeResetPasswordModal} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Password Reset Notice</p>
                      <p className="text-xs text-amber-700 mt-1">
                        A new password will be set for <strong>{resetPasswordUser.username}</strong> and sent to their email: <strong>{resetPasswordUser.email}</strong>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                      <Lock size={16} className="text-amber-500" />
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                        placeholder="Enter new password (min 6 chars)"
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">Password must be at least 6 characters</p>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                    <Send size={18} className="text-blue-500" />
                    <p className="text-sm text-blue-700">
                      New credentials will be sent to user's email automatically
                    </p>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeResetPasswordModal}
                    className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors touch-manipulation min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword || !newPassword || newPassword.length < 6}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 touch-manipulation min-h-[44px] ${resettingPassword || !newPassword || newPassword.length < 6
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-lg hover:shadow-amber-500/25 active:from-amber-600 active:to-orange-700'
                      }`}
                  >
                    {resettingPassword ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <KeyRound size={16} />
                        <span className="hidden sm:inline">Reset & Send Email</span>
                        <span className="sm:hidden">Reset Password</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Delete User Confirmation Modal */}
      {
        deleteUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-md rounded-lg sm:rounded-2xl shadow-2xl overflow-hidden my-auto">
              <div className="bg-gradient-to-r from-rose-500 to-red-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <AlertTriangle size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Delete User</h2>
                    <p className="text-sm text-white/80">Permanent action</p>
                  </div>
                </div>
                <button onClick={closeDeleteModal} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 active:bg-white/40 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-rose-800">Warning: This action cannot be undone!</p>
                      <p className="text-xs text-rose-700 mt-1">
                        You are about to permanently delete the user account for:
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ROLE_AVATAR_COLORS[deleteUserModal.role] || 'from-slate-400 to-slate-600'} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                      {deleteUserModal.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{deleteUserModal.name}</div>
                      <div className="text-sm text-slate-500">@{deleteUserModal.username}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Mail size={12} className="text-slate-400" />
                      {deleteUserModal.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-slate-400" />
                      {getRoleDisplay(deleteUserModal)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors touch-manipulation min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePermanentDelete}
                    disabled={deletingUser}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-lg sm:rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 touch-manipulation min-h-[44px] ${deletingUser
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-rose-500 to-red-600 hover:shadow-lg hover:shadow-rose-500/25 active:from-rose-600 active:to-red-700'
                      }`}
                  >
                    {deletingUser ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete Permanently
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Field Permissions Modal */}
      {
        showFieldPermissionsModal && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Shield className="text-blue-600" size={20} />
                    Configure Field-Level Access
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Set view/edit permissions for individual student data fields
                  </p>
                </div>
                <button
                  onClick={() => { setShowFieldPermissionsModal(false); setFieldPermissionsContext('user'); }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              {/* Quick Actions */}
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
                <div className="flex items-center gap-2">
                  <button
                    onClick={grantAllViewPermissions}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                  >
                    <Eye size={14} />
                    Grant All View
                  </button>
                  <button
                    onClick={() => {
                      setFieldPermissions({});
                      toast.success('All permissions revoked!');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <X size={14} />
                    Revoke All
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex">
                {/* Categories Sidebar */}
                <div className="w-64 border-r border-slate-200 overflow-y-auto bg-slate-50">
                  <div className="p-3">
                    {loadingFields ? (
                      <div className="text-center py-8">
                        <RefreshCw className="animate-spin mx-auto text-slate-400" size={24} />
                        <p className="text-sm text-slate-500 mt-2">Loading fields...</p>
                      </div>
                    ) : (
                      fieldCategories.map(category => {
                        const Icon = category.icon;
                        const isActive = activeFieldCategory === category.id;

                        // Count permissions for this category
                        let viewCount = 0;
                        let editCount = 0;
                        category.fields.forEach(field => {
                          const perms = fieldPermissions[field.key] || { view: false, edit: false };
                          if (perms.view) viewCount++;
                          if (perms.edit) editCount++;
                        });

                        return (
                          <button
                            key={category.id}
                            onClick={() => setActiveFieldCategory(category.id)}
                            className={`w-full flex items-center justify-between gap-2 p-3 rounded-lg text-left transition-all mb-2 ${isActive
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 hover:bg-white/80'
                              }`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Icon size={16} />
                              <span className="text-sm font-medium truncate">{category.label}</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] opacity-75">
                                {viewCount}/{category.fields.length} view
                              </span>
                              <span className="text-[10px] opacity-75">
                                {editCount}/{category.fields.length} edit
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Fields List */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6">
                    {fieldCategories.find(c => c.id === activeFieldCategory)?.fields.map(field => {
                      const perms = fieldPermissions[field.key] || { view: false, edit: false };

                      return (
                        <div
                          key={field.key}
                          className="flex items-center justify-between gap-4 p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors mb-3"
                        >
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-slate-800 truncate">
                              {field.label}
                            </h4>
                            <p className="text-xs text-slate-500">
                              Field: <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{field.key}</code>
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* View Toggle */}
                            <button
                              onClick={() => toggleFieldPermission(field.key, 'view')}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${perms.view
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                              {perms.view ? <Eye size={14} /> : <EyeOff size={14} />}
                              View
                            </button>

                            {/* Edit Toggle */}
                            <button
                              onClick={() => toggleFieldPermission(field.key, 'edit')}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${perms.edit
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                              disabled={!perms.view}
                            >
                              {perms.edit ? <Edit3 size={14} /> : <Lock size={14} />}
                              Edit
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                <p className="text-sm text-slate-600">
                  Configure field permissions, then click Save to apply
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowFieldPermissionsModal(false); setFieldPermissionsContext('user'); }}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveFieldPermissions}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Save size={16} />
                    Save Field Permissions
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default UserManagement;

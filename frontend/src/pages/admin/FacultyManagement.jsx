/**
 * Admin – Faculty Management (Pydah v2.0)
 * Tabs: Employees, Assign HODs / Branches.
 */

import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { Users, Building2, UserCog, GraduationCap, X, UserPlus, ExternalLink, BookOpen, Plus, Trash2, Pencil, Calendar, Save, Trash, Clock, Settings2, FileText, PieChart } from 'lucide-react';
import toast from 'react-hot-toast';
import TimetableTable from '../../components/Admin/TimetableTable';

const yearOrdinalSuffix = (year) => {
  const v = year % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (year % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

const formatHodYearLabel = (year) => `${year}${yearOrdinalSuffix(year)} Year`;

const FacultyManagement = () => {
  const [tab, setTab] = useState('employees');
  const [employeeFilter, setEmployeeFilter] = useState('all'); // all | principals | aos | hods | faculty
  const [employees, setEmployees] = useState({ principals: [], hods: [], faculty: [], all: [] });
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [branchesWithHods, setBranchesWithHods] = useState([]);
  const [selectedBranchForSubjects, setSelectedBranchForSubjects] = useState(null);
  const [sidePanelSubjectsData, setSidePanelSubjectsData] = useState(null);
  const [loadingSidePanelSubjects, setLoadingSidePanelSubjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [employeeDetail, setEmployeeDetail] = useState(null);
  const [assignHodBranch, setAssignHodBranch] = useState(null);
  const [editingHod, setEditingHod] = useState(null); // { branch, hod } when editing years
  const [availableYearsForBranch, setAvailableYearsForBranch] = useState([]);
  const [loadingAvailableYears, setLoadingAvailableYears] = useState(false);
  const [rbacUsers, setRbacUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigningHod, setAssigningHod] = useState(false);
  const [unassigningHod, setUnassigningHod] = useState(false);
  const [selectedHodUserId, setSelectedHodUserId] = useState('');
  const [selectedHodYears, setSelectedHodYears] = useState([1, 2, 3, 4]);
  const [assignHodMode, setAssignHodMode] = useState('select'); // 'select' | 'create'
  const [newHodName, setNewHodName] = useState('');
  const [newHodEmail, setNewHodEmail] = useState('');
  const [newHodUsername, setNewHodUsername] = useState('');
  const [newHodPassword, setNewHodPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [branchYearSemDetail, setBranchYearSemDetail] = useState(null);
  const [yearSemData, setYearSemData] = useState({ yearSemList: [], assignmentsByKey: {}, subjects: [] });
  const [loadingYearSem, setLoadingYearSem] = useState(false);
  const [addingSubjectKey, setAddingSubjectKey] = useState('');
  const [newSubjectSelect, setNewSubjectSelect] = useState({});
  const [createSubjectForSem, setCreateSubjectForSem] = useState(null); // { year, semester, label } when open
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [subjectType, setSubjectType] = useState('theory'); // 'theory' or 'lab'
  const [units, setUnits] = useState('');
  const [experimentsCount, setExperimentsCount] = useState('');
  const [credits, setCredits] = useState('');
  const [editingSubject, setEditingSubject] = useState(null); // { id, ... }
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [selectedYearForSubjects, setSelectedYearForSubjects] = useState('');
  const [selectedYearForStaff, setSelectedYearForStaff] = useState('');
  const [selectedSemesterForStaff, setSelectedSemesterForStaff] = useState('');
  const [selectedBranchForStaff, setSelectedBranchForStaff] = useState(null);
  const [staffTabData, setStaffTabData] = useState({ branches: [], yearsAvailable: [] });
  const [loadingStaffTab, setLoadingStaffTab] = useState(false);
  const [selectedYearForTimetable, setSelectedYearForTimetable] = useState('');
  const [selectedSemesterForTimetable, setSelectedSemesterForTimetable] = useState('');
  const [selectedBranchForTimetable, setSelectedBranchForTimetable] = useState(null);
  const [timetableData, setTimetableData] = useState([]);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [periodSlots, setPeriodSlots] = useState([]);
  const [staffAssignSelect, setStaffAssignSelect] = useState({}); // { subjectId: rbacUserId }
  const [assigningStaff, setAssigningStaff] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null); // { day, slotId }
  const [slotFormData, setSlotFormData] = useState({ subject_id: '', type: 'subject', custom_label: '', span: 1 });
  const [showManageSlotsModal, setShowManageSlotsModal] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [newPeriodSlot, setNewPeriodSlot] = useState({ name: '', start_time: '', end_time: '', sort_order: 0 });
  const [savingPeriodSlot, setSavingPeriodSlot] = useState(false);
  const [showAllocationAbstract, setShowAllocationAbstract] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const empRes = await api.get('/faculty/employees');
        if (empRes.data.success) setEmployees(empRes.data.data || { principals: [], hods: [], faculty: [], all: [] });
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const res = await api.get('/colleges');
        if (res.data.success) {
          const list = res.data.data || [];
          setColleges(list);
          if (list.length === 1 && !selectedCollegeId) {
            setSelectedCollegeId(list[0].id);
          }
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load colleges');
      }
    };
    if (tab === 'assign-hods' || tab === 'assign-staff' || tab === 'assign-subjects' || tab === 'time-table') fetchColleges();
  }, [tab, selectedCollegeId]);

  useEffect(() => {
    if (!selectedCollegeId || (tab !== 'assign-hods' && tab !== 'assign-staff' && tab !== 'assign-subjects' && tab !== 'time-table')) {
      setBranchesWithHods([]);
      return;
    }
    const fetchBranchesWithHods = async () => {
      try {
        setLoadingBranches(true);
        const res = await api.get(`/colleges/${selectedCollegeId}/branches-with-hods`);
        if (res.data.success) setBranchesWithHods(res.data.data || []);
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load branches');
        setBranchesWithHods([]);
      } finally {
        setLoadingBranches(false);
      }
    };
    fetchBranchesWithHods();
  }, [selectedCollegeId, tab]);

  useEffect(() => {
    if (!selectedCollegeId || !selectedProgramId || (tab !== 'assign-staff' && tab !== 'time-table')) {
      setStaffTabData({ branches: [], yearsAvailable: [] });
      setSelectedBranchForStaff(null);
      return;
    }
    const fetch = async () => {
      try {
        setLoadingStaffTab(true);
        const params = { collegeId: selectedCollegeId, courseId: selectedProgramId };
        const year = tab === 'time-table' ? selectedYearForTimetable : selectedYearForStaff;
        if (year) params.year = year;
        const res = await api.get('/faculty/program-subjects', { params });
        if (res.data.success && res.data.data) {
          const years = res.data.data.yearsAvailable || [];
          setStaffTabData((prev) => ({
            branches: res.data.data.branches || [],
            yearsAvailable: years.length > 0 ? years : (prev.yearsAvailable || [1, 2, 3, 4, 5, 6])
          }));
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load subjects');
        setStaffTabData({ branches: [], yearsAvailable: [] });
      } finally {
        setLoadingStaffTab(false);
      }
    };
    fetch();
  }, [selectedCollegeId, selectedProgramId, selectedYearForStaff, selectedYearForTimetable, tab]);

  useEffect(() => {
    if (!selectedCollegeId || tab !== 'time-table') return;
    const fetchSlots = async () => {
      try {
        const res = await api.get('/period-slots', { params: { college_id: selectedCollegeId } });
        if (res.data.success) {
          setPeriodSlots(res.data.data || []);
        }
      } catch (e) {
        toast.error('Failed to load period slots');
      }
    };
    fetchSlots();
  }, [selectedCollegeId, tab]);

  const handleSavePeriodSlot = async (e) => {
    e.preventDefault();
    if (!selectedCollegeId) return;
    try {
      setSavingPeriodSlot(true);
      const payload = { ...newPeriodSlot, college_id: selectedCollegeId };
      if (editingSlotId) {
        await api.put(`/period-slots/${editingSlotId}`, payload);
        toast.success('Slot updated');
      } else {
        await api.post('/period-slots', payload);
        toast.success('Slot added');
      }
      setNewPeriodSlot({ name: '', start_time: '', end_time: '', sort_order: 0 });
      setEditingSlotId(null);
      // Refresh slots
      const res = await api.get('/period-slots', { params: { college_id: selectedCollegeId } });
      if (res.data.success) setPeriodSlots(res.data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save slot');
    } finally {
      setSavingPeriodSlot(false);
    }
  };

  const handleDeletePeriodSlot = async (id) => {
    if (!window.confirm('Are you sure? This may affect existing timetable entries.')) return;
    try {
      await api.delete(`/period-slots/${id}`);
      toast.success('Slot removed');
      const res = await api.get('/period-slots', { params: { college_id: selectedCollegeId } });
      if (res.data.success) setPeriodSlots(res.data.data || []);
    } catch (e) {
      toast.error('Failed to remove slot');
    }
  };

  useEffect(() => {
    if (!selectedBranchForTimetable || !selectedYearForTimetable || !selectedSemesterForTimetable || tab !== 'time-table') {
      setTimetableData([]);
      return;
    }
    const fetchTimetable = async () => {
      try {
        setLoadingTimetable(true);
        const res = await api.get('/timetable', {
          params: {
            branch_id: selectedBranchForTimetable.id,
            year: selectedYearForTimetable,
            semester: selectedSemesterForTimetable
          }
        });
        if (res.data.success) setTimetableData(res.data.data || []);
      } catch (e) {
        toast.error('Failed to load timetable');
      } finally {
        setLoadingTimetable(false);
      }
    };
    fetchTimetable();
  }, [selectedBranchForTimetable, selectedYearForTimetable, selectedSemesterForTimetable, tab]);

  useEffect(() => {
    setSelectedProgramId('');
    setSelectedBranchForTimetable(null);
  }, [selectedCollegeId]);

  useEffect(() => {
    if (!selectedBranchForSubjects || selectedBranchForSubjects.id === branchYearSemDetail?.id) {
      setSidePanelSubjectsData(null);
      return;
    }
    const fetchSubjects = async () => {
      try {
        setLoadingSidePanelSubjects(true);
        const res = await api.get(`/faculty/branches/${selectedBranchForSubjects.id}/year-sem-subjects`);
        if (res.data.success && res.data.data) {
          setSidePanelSubjectsData({
            yearSemList: res.data.data.yearSemList || [],
            assignmentsByKey: res.data.data.assignmentsByKey || {}
          });
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load subjects');
        setSidePanelSubjectsData(null);
      } finally {
        setLoadingSidePanelSubjects(false);
      }
    };
    fetchSubjects();
  }, [selectedBranchForSubjects, branchYearSemDetail?.id]);

  const handleEditTimetableSlot = (day, slotId, entry) => {
    setEditingSlot({ day, slotId });
    setSlotFormData({
      subject_id: entry?.subject_id || '',
      type: entry?.type || 'subject',
      custom_label: entry?.custom_label || '',
      span: entry?.span || 1
    });
  };

  useEffect(() => {
    if (!assignHodBranch) return;
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const res = await api.get('/rbac/users');
        const data = res.data.data;
        setRbacUsers(Array.isArray(data) ? data : (data?.users || []));
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load users');
        setRbacUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [assignHodBranch]);

  useEffect(() => {
    if (!assignHodBranch?.id) {
      setAvailableYearsForBranch([]);
      return;
    }
    const fetchYears = async () => {
      try {
        setLoadingAvailableYears(true);
        const res = await api.get(`/faculty/branches/${assignHodBranch.id}/available-years`);
        const years = (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0)
          ? res.data.data
          : [1, 2, 3, 4, 5, 6];
        setAvailableYearsForBranch(years);
        if (!editingHod) {
          setSelectedHodYears([...years]);
        }
      } catch (e) {
        const fallback = [1, 2, 3, 4, 5, 6];
        setAvailableYearsForBranch(fallback);
        if (!editingHod) setSelectedHodYears([...fallback]);
      } finally {
        setLoadingAvailableYears(false);
      }
    };
    fetchYears();
  }, [assignHodBranch?.id, editingHod]);

  useEffect(() => {
    if (!branchYearSemDetail) {
      setYearSemData({ yearSemList: [], assignmentsByKey: {}, subjects: [], branch: null });
      return;
    }
    const fetchYearSemSubjects = async () => {
      try {
        setLoadingYearSem(true);
        const res = await api.get(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`);
        if (res.data.success && res.data.data) {
          setYearSemData({
            yearSemList: res.data.data.yearSemList || [],
            assignmentsByKey: res.data.data.assignmentsByKey || {},
            subjects: res.data.data.subjects || [],
            branch: res.data.data.branch
          });
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load year/sem subjects');
        setYearSemData({ yearSemList: [], assignmentsByKey: {}, subjects: [], branch: null });
      } finally {
        setLoadingYearSem(false);
      }
    };
    fetchYearSemSubjects();
  }, [branchYearSemDetail]);

  const getScopeDisplay = (e) => {
    const colleges = (e.collegeNames && e.collegeNames.length) ? e.collegeNames.map(c => c.name).join(', ') : (e.collegeName || '–');
    const courses = e.allCourses ? 'All' : ((e.courseNames && e.courseNames.length) ? e.courseNames.map(c => c.name).join(', ') : (e.courseName || '–'));
    const branches = e.allBranches ? 'All' : ((e.branchNames && e.branchNames.length) ? e.branchNames.map(b => b.name).join(', ') : (e.branchName || '–'));
    return { colleges, courses, branches };
  };

  const closeAssignHodModal = () => {
    setAssignHodBranch(null);
    setEditingHod(null);
    setAvailableYearsForBranch([]);
    setSelectedHodUserId('');
    setSelectedHodYears([1, 2, 3, 4]);
    setAssignHodMode('select');
    setNewHodName('');
    setNewHodEmail('');
    setNewHodUsername('');
    setNewHodPassword('');
  };

  const programs = React.useMemo(() => {
    const seen = new Map();
    (branchesWithHods || []).forEach((b) => {
      if (b.course_id && b.course_name && !seen.has(b.course_id)) {
        seen.set(b.course_id, { id: b.course_id, name: b.course_name });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [branchesWithHods]);

  const filteredBranches = React.useMemo(() => {
    if (!selectedProgramId) return branchesWithHods;
    return branchesWithHods.filter((b) => String(b.course_id) === String(selectedProgramId));
  }, [branchesWithHods, selectedProgramId]);

  const handleAssignHodSubmit = async () => {
    if (!assignHodBranch || !selectedHodUserId) {
      toast.error('Please select a user');
      return;
    }
    if (!selectedHodYears || selectedHodYears.length === 0) {
      toast.error('Select at least one year');
      return;
    }
    const isEdit = !!editingHod;
    try {
      setAssigningHod(true);
      await api.post('/faculty/assign-hod', {
        branchId: assignHodBranch.id,
        userId: selectedHodUserId,
        years: selectedHodYears
      });
      toast.success(isEdit
        ? `Years updated for ${assignHodBranch.name}: Year${selectedHodYears.length > 1 ? 's ' : ' '}${selectedHodYears.join(', ')}`
        : `HOD assigned to ${assignHodBranch.name} for Year${selectedHodYears.length > 1 ? 's ' : ' '}${selectedHodYears.join(', ')}`);
      closeAssignHodModal();
      const res = await api.get(`/colleges/${selectedCollegeId}/branches-with-hods`);
      if (res.data.success) setBranchesWithHods(res.data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || (isEdit ? 'Failed to update years' : 'Failed to assign HOD'));
    } finally {
      setAssigningHod(false);
    }
  };

  const handleAddSubjectToSem = async (year, semester, subjectId) => {
    if (!branchYearSemDetail || !subjectId) return;
    const key = `${year}-${semester}`;
    setAddingSubjectKey(key);
    try {
      await api.post(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`, { year, semester, subjectId });
      toast.success('Subject added');
      setNewSubjectSelect(prev => { const p = { ...prev }; delete p[key]; return p; });
      const res = await api.get(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`);
      if (res.data.success && res.data.data) {
        setYearSemData({
          yearSemList: res.data.data.yearSemList || [],
          assignmentsByKey: res.data.data.assignmentsByKey || {},
          subjects: res.data.data.subjects || [],
          branch: res.data.data.branch || yearSemData.branch
        });
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to add subject');
    } finally {
      setAddingSubjectKey('');
    }
  };

  const handleCreateSubjectForSem = async () => {
    const branch = yearSemData.branch;
    if (!branch || !branch.collegeId || !branch.courseId || !createSubjectForSem) return;
    const name = (newSubjectName || '').trim();
    if (!name) {
      toast.error('Subject name is required');
      return;
    }
    const { year, semester } = createSubjectForSem;
    const code = (newSubjectCode || '').trim();
    const creds = (credits || '').trim();

    if (!code) {
      toast.error('Subject code is required');
      return;
    }
    if (!creds) {
      toast.error('Credits are required');
      return;
    }

    setCreatingSubject(true);
    try {
      let subjectId;
      if (editingSubject) {
        // Update existing subject
        await api.put(`/subjects/${editingSubject.id}`, {
          name,
          code,
          subject_type: subjectType,
          units: subjectType === 'theory' ? Number(units) : null,
          experiments_count: subjectType === 'lab' ? Number(experimentsCount) : null,
          credits: Number(creds)
        });
        subjectId = editingSubject.id;
        toast.success('Subject updated');
      } else {
        // Create new subject
        const createRes = await api.post('/subjects', {
          college_id: branch.collegeId,
          course_id: branch.courseId,
          branch_id: branch.id,
          name,
          code,
          subject_type: subjectType,
          units: subjectType === 'theory' ? Number(units) : null,
          experiments_count: subjectType === 'lab' ? Number(experimentsCount) : null,
          credits: Number(creds)
        });
        subjectId = createRes.data?.data?.id;
        if (subjectId) {
          await api.post(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`, { year, semester, subjectId });
          toast.success(`Subject created and assigned to ${createSubjectForSem.label}`);
        } else {
          toast.success('Subject created');
        }
      }

      setCreateSubjectForSem(null);
      setEditingSubject(null);
      setNewSubjectName('');
      setNewSubjectCode('');
      setUnits('');
      setExperimentsCount('');
      setCredits('');
      setSubjectType('theory');
      const res = await api.get(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`);
      if (res.data.success && res.data.data) {
        setYearSemData({
          yearSemList: res.data.data.yearSemList || [],
          assignmentsByKey: res.data.data.assignmentsByKey || {},
          subjects: res.data.data.subjects || [],
          branch: res.data.data.branch
        });
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create subject');
    } finally {
      setCreatingSubject(false);
    }
  };

  const handleEditSubject = async (year, semester, label, subjectId) => {
    try {
      setLoadingYearSem(true);
      const res = await api.get(`/subjects`);
      const subject = res.data.data.find(s => s.id === subjectId);

      if (subject) {
        setEditingSubject(subject);
        setCreateSubjectForSem({ year, semester, label });
        setNewSubjectName(subject.name);
        setNewSubjectCode(subject.code || '');
        setSubjectType(subject.subject_type || 'theory');
        setUnits(subject.units || '');
        setExperimentsCount(subject.experiments_count || '');
        setCredits(subject.credits || '');
      }
    } catch (e) {
      toast.error('Failed to load subject details');
    } finally {
      setLoadingYearSem(false);
    }
  };

  const handleRemoveSubjectFromSem = async (year, semester, subjectId) => {
    if (!branchYearSemDetail) return;
    try {
      await api.delete(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`, {
        params: { year, semester, subjectId }
      });
      toast.success('Subject removed');
      const res = await api.get(`/faculty/branches/${branchYearSemDetail.id}/year-sem-subjects`);
      if (res.data.success && res.data.data) {
        setYearSemData({
          yearSemList: res.data.data.yearSemList || [],
          assignmentsByKey: res.data.data.assignmentsByKey || {},
          subjects: res.data.data.subjects || [],
          branch: res.data.data.branch || yearSemData.branch
        });
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to remove subject');
    }
  };

  const handleCreateHodSubmit = async () => {
    if (!assignHodBranch || !selectedCollegeId) return;
    const name = (newHodName || '').trim();
    const email = (newHodEmail || '').trim().toLowerCase();
    const username = (newHodUsername || '').trim();
    const password = newHodPassword;
    if (!name || !email || !username || !password) {
      toast.error('Name, email, username and password are required');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (!selectedHodYears || selectedHodYears.length === 0) {
      toast.error('Select at least one year');
      return;
    }
    try {
      setCreatingUser(true);
      const createRes = await api.post('/rbac/users', {
        name,
        email,
        username,
        password,
        role: 'branch_hod',
        collegeIds: [Number(selectedCollegeId)],
        courseIds: [assignHodBranch.course_id].filter(Boolean),
        branchIds: [assignHodBranch.id],
        hodYears: selectedHodYears,
        allHodYears: yearsToShow.length > 0 && yearsToShow.every((y) => selectedHodYears.includes(y))
      });
      const newUserId = createRes.data?.data?.id;
      if (newUserId) {
        await api.post('/faculty/assign-hod', {
          branchId: assignHodBranch.id,
          userId: newUserId,
          years: selectedHodYears
        });
      }
      toast.success(`HOD "${name}" created and assigned to ${assignHodBranch.name} for Year${selectedHodYears.length > 1 ? 's ' : ' '}${selectedHodYears.join(', ')}.`);
      closeAssignHodModal();
      const res = await api.get(`/colleges/${selectedCollegeId}/branches-with-hods`);
      if (res.data.success) setBranchesWithHods(res.data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create HOD user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUnassignHod = async (branch, hod) => {
    try {
      setUnassigningHod(true);
      await api.post('/faculty/unassign-hod', { branchId: branch.id, userId: hod.id });
      toast.success(`${hod.name} unassigned from ${branch.name}`);
      const res = await api.get(`/colleges/${selectedCollegeId}/branches-with-hods`);
      if (res.data.success) setBranchesWithHods(res.data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to unassign HOD');
    } finally {
      setUnassigningHod(false);
    }
  };

  const openEditHodModal = (branch, hod) => {
    setAssignHodBranch(branch);
    setEditingHod({ branch, hod });
    setSelectedHodUserId(String(hod.id));
    setSelectedHodYears(Array.isArray(hod.years) && hod.years.length > 0 ? [...hod.years] : [1]);
  };

  const refetchStaffTabData = React.useCallback(() => {
    if (!selectedCollegeId || !selectedProgramId || !selectedYearForStaff || tab !== 'assign-staff') return;
    api.get('/faculty/program-subjects', {
      params: { collegeId: selectedCollegeId, courseId: selectedProgramId, year: selectedYearForStaff }
    }).then((res) => {
      if (res.data.success && res.data.data) {
        setStaffTabData({
          branches: res.data.data.branches || [],
          yearsAvailable: res.data.data.yearsAvailable || []
        });
      }
    });
  }, [selectedCollegeId, selectedProgramId, selectedYearForStaff, tab]);

  const handleAssignStaffToSubject = async (subjectId, rbacUserId) => {
    try {
      setAssigningStaff(true);
      await api.post('/faculty/assign-staff-to-subject', { subjectId, rbacUserId });
      toast.success('Staff assigned');
      refetchStaffTabData();
      setStaffAssignSelect((prev) => { const p = { ...prev }; delete p[subjectId]; return p; });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to assign staff');
    } finally {
      setAssigningStaff(false);
    }
  };

  const handleUnassignStaffFromSubject = async (subjectId, rbacUserId) => {
    try {
      await api.post('/faculty/unassign-staff-from-subject', { subjectId, rbacUserId });
      toast.success('Staff unassigned');
      refetchStaffTabData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to unassign staff');
    }
  };

  const yearsToShow = availableYearsForBranch.length > 0
    ? (editingHod?.hod?.years?.length
      ? [...new Set([...availableYearsForBranch, ...editingHod.hod.years])].sort((a, b) => a - b)
      : availableYearsForBranch)
    : [1, 2, 3, 4, 5, 6];

  const allHodYearsSelected = yearsToShow.length > 0 && yearsToShow.every((y) => selectedHodYears.includes(y));
  const selectAllHodYears = () => setSelectedHodYears([...yearsToShow]);
  const toggleHodYear = (y) => {
    setSelectedHodYears((prev) => {
      const allSelected = yearsToShow.length > 0 && yearsToShow.every((year) => prev.includes(year));
      if (allSelected) return [y];
      const next = prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort((a, b) => a - b);
      return next.length > 0 ? next : prev;
    });
  };

  const renderHodYearPicker = () => (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">Year access</label>
      {loadingAvailableYears ? (
        <p className="text-sm text-slate-500">Loading years…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAllHodYears}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${allHodYearsSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            All years
          </button>
          {yearsToShow.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => toggleHodYear(y)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${!allHodYearsSelected && selectedHodYears.includes(y) ? 'bg-indigo-600 text-white' : allHodYearsSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {formatHodYearLabel(y)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-1">
        Years are based on the selected course/branch duration. Choose all years or a particular year (1st Year, 2nd Year, …).
      </p>
    </div>
  );

  // Filtered list for Employees tab (by sub-tab)
  const getFilteredEmployeeList = () => {
    const all = employees.all || [];
    if (employeeFilter === 'all') return all;
    if (employeeFilter === 'principals') return (employees.principals || []).filter(p => (p.role || '').toLowerCase() === 'college_principal');
    if (employeeFilter === 'aos') return (employees.principals || []).filter(p => (p.role || '').toLowerCase() === 'college_ao');
    if (employeeFilter === 'hods') return employees.hods || [];
    if (employeeFilter === 'faculty') return employees.faculty || [];
    return all;
  };
  const filteredEmployees = getFilteredEmployeeList();

  const tabs = [
    { id: 'employees', label: 'Employees', icon: UserCog },
    { id: 'assign-hods', label: 'Assign HODs', icon: Building2 },
    { id: 'assign-subjects', label: 'Assign Subjects', icon: BookOpen },
    { id: 'assign-staff', label: 'Assign Staff', icon: UserPlus },
    { id: 'time-table', label: 'Time Table', icon: Calendar }
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Page header */}
        <header className="mb-6 lg:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Faculty Management</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Principals, HODs & faculty · Assign branches · Create users in User Management
              </p>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 lg:mb-8">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${tab === id
                ? 'bg-slate-800 text-white shadow-lg shadow-slate-800/25 scale-[1.02]'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300'
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 font-medium">Loading faculty data…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Employees tab – with sub-tabs: All, Principals, AOs, HODs, Faculty */}
            {tab === 'employees' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Filter by role</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'all', label: 'All', count: (employees.all || []).length },
                        { id: 'principals', label: 'Principals', count: (employees.principals || []).filter(p => (p.role || '').toLowerCase() === 'college_principal').length },
                        { id: 'aos', label: 'AOs', count: (employees.principals || []).filter(p => (p.role || '').toLowerCase() === 'college_ao').length },
                        { id: 'hods', label: 'HODs', count: (employees.hods || []).length },
                        { id: 'faculty', label: 'Faculty', count: (employees.faculty || []).length }
                      ].map(({ id, label, count }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEmployeeFilter(id)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${employeeFilter === id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                          {label}
                          <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${employeeFilter === id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    {filteredEmployees.length === 0 ? (
                      <p className="py-12 text-center text-slate-500 text-sm">No employees in this category.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredEmployees.map((e) => {
                          const { colleges, courses, branches } = getScopeDisplay(e);
                          const branchList = e.allBranches ? ['All'] : (e.branchNames?.length ? e.branchNames.map(b => b.name) : (e.branchName ? [e.branchName] : ['–']));
                          const collegeList = e.collegeNames?.length ? e.collegeNames.map(c => c.name) : (e.collegeName ? [e.collegeName] : (colleges ? [colleges] : ['–']));
                          const courseList = e.allCourses ? ['All'] : (e.courseNames?.length ? e.courseNames.map(c => c.name) : (e.courseName ? [e.courseName] : (courses ? [courses] : ['–'])));
                          return (
                            <div
                              key={e.id}
                              onDoubleClick={() => setEmployeeDetail(e)}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700">
                                  {e.roleLabel}
                                </span>
                              </div>
                              <h4 className="font-semibold text-slate-800 text-sm mb-0.5">{e.name}</h4>
                              <p className="text-xs text-slate-500 mb-3 break-all">{e.email}</p>
                              <div className="space-y-2 text-xs">
                                <div>
                                  <span className="text-slate-400 font-medium">Colleges</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {collegeList.slice(0, 2).map((c, i) => (
                                      <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{c}</span>
                                    ))}
                                    {collegeList.length > 2 && <span className="text-slate-400">+{collegeList.length - 2}</span>}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-medium">Courses</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {courseList.slice(0, 2).map((c, i) => (
                                      <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{c}</span>
                                    ))}
                                    {courseList.length > 2 && <span className="text-slate-400">+{courseList.length - 2}</span>}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-medium">Branches</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {branchList.slice(0, 3).map((b, i) => (
                                      <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{b}</span>
                                    ))}
                                    {branchList.length > 3 && <span className="text-slate-400">+{branchList.length - 3}</span>}
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">Double-click to view details</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Assign HODs tab – branches with HOD assigned or Pending */}
            {tab === 'assign-hods' && (
              <div className="flex gap-4 flex-col lg:flex-row">
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Select college</label>
                        <select
                          value={selectedCollegeId}
                          onChange={(e) => setSelectedCollegeId(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        >
                          <option value="">— Select college —</option>
                          {colleges.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Select program (course)</label>
                        <select
                          value={selectedProgramId}
                          onChange={(e) => setSelectedProgramId(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        >
                          <option value="">— All programs —</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {!selectedCollegeId ? (
                    <div className="p-12 text-center text-slate-500 text-sm">Select a college to see branches and HOD assignment.</div>
                  ) : loadingBranches ? (
                    <div className="p-12 flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 text-sm">Loading branches…</p>
                    </div>
                  ) : (
                    <div className="p-4 sm:p-6">
                      {filteredBranches.length === 0 ? (
                        <p className="py-12 text-center text-slate-500 text-sm">
                          {selectedProgramId ? 'No branches in this program.' : 'No branches in this college.'}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredBranches.map((b) => (
                            <div
                              key={b.id}
                              onClick={(e) => { if (!e.target.closest('button')) setSelectedBranchForSubjects(prev => prev?.id === b.id ? null : b); }}
                              onDoubleClick={(e) => { if (!e.target.closest('button')) { setTab('assign-subjects'); setBranchYearSemDetail(b); } }}
                              className={`rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedBranchForSubjects?.id === b.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <h4 className="font-semibold text-slate-800">{b.name}</h4>
                                <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                                  {b.course_name || '–'}
                                </span>
                              </div>
                              <div className="pt-2 border-t border-slate-100">
                                {(b.hods && b.hods.length > 0) || b.hod ? (
                                  <div className="space-y-2">
                                    {((b.hods && b.hods.length) ? b.hods : (b.hod ? [b.hod] : [])).map((h) => (
                                      <div key={h.id} className="flex items-start justify-between gap-1 rounded-lg bg-slate-50 p-2">
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium text-slate-800 text-sm">{h.name}</p>
                                          {h.email && <p className="text-xs text-slate-500 break-all">{h.email}</p>}
                                          <p className="text-[10px] text-indigo-600 mt-0.5">
                                            Year{h.years?.length > 1 ? 's' : ''} {Array.isArray(h.years) ? h.years.join(', ') : '1–6'}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); openEditHodModal(b, h); }}
                                            className="p-1 rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                            title="Edit years"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleUnassignHod(b, h); }}
                                            disabled={unassigningHod}
                                            className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            title="Unassign HOD"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setAssignHodBranch(b); setSelectedHodUserId(''); setSelectedHodYears([1, 2, 3, 4]); }}
                                      className="w-full inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-dashed border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50"
                                    >
                                      <Plus className="w-3 h-3" /> Add another HOD
                                    </button>
                                    <p className="text-[10px] text-slate-400">Double-click to manage subjects by sem</p>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setAssignHodBranch(b); setSelectedHodUserId(''); setSelectedHodYears([1, 2, 3, 4]); }}
                                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-800 text-sm font-semibold hover:bg-amber-200 transition-colors"
                                  >
                                    Pending – Assign HOD
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Side panel – subjects for selected branch */}
                {selectedBranchForSubjects && (
                  <div className="w-full lg:w-96 flex-shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-indigo-50/50 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                        Subjects – {selectedBranchForSubjects.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedBranchForSubjects(null)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                      {loadingSidePanelSubjects ? (
                        <div className="py-8 flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-slate-500 text-xs">Loading subjects…</p>
                        </div>
                      ) : sidePanelSubjectsData?.yearSemList?.length === 0 ? (
                        <p className="py-6 text-center text-slate-500 text-sm">No year/sem data. Double-click the branch card to manage subjects.</p>
                      ) : (
                        <div className="space-y-3">
                          {sidePanelSubjectsData?.yearSemList?.map(({ year, semester, label }) => {
                            const key = `${year}-${semester}`;
                            const assigned = sidePanelSubjectsData.assignmentsByKey[key] || [];
                            return (
                              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                                <h4 className="text-xs font-semibold text-slate-600 mb-2">{label}</h4>
                                {assigned.length === 0 ? (
                                  <p className="text-xs text-slate-400">No subjects assigned</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {assigned.map((a) => (
                                      <li key={a.subjectId} className="text-sm text-slate-700">{a.subjectName}{a.subjectCode ? ` (${a.subjectCode})` : ''}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-3">Double-click branch card to manage subjects</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assign Subjects tab */}
            {tab === 'assign-subjects' && (
              <div className="flex gap-4 flex-col lg:flex-row">
                <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Select college</label>
                        <select
                          value={selectedCollegeId}
                          onChange={(e) => { setSelectedCollegeId(e.target.value); setBranchYearSemDetail(null); }}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        >
                          <option value="">— Select college —</option>
                          {colleges.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Select program (course)</label>
                        <select
                          value={selectedProgramId}
                          onChange={(e) => { setSelectedProgramId(e.target.value); setBranchYearSemDetail(null); }}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        >
                          <option value="">— All programs —</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Select year</label>
                        <select
                          value={selectedYearForSubjects}
                          onChange={(e) => setSelectedYearForSubjects(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 transition-shadow"
                        >
                          <option value="">— All years —</option>
                          {[1, 2, 3, 4, 5, 6].map((y) => (
                            <option key={y} value={y}>Year {y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {!selectedCollegeId ? (
                    <div className="p-12 text-center text-slate-500 text-sm">Select a college to see branches.</div>
                  ) : loadingBranches ? (
                    <div className="p-12 flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 text-sm">Loading branches…</p>
                    </div>
                  ) : (
                    <div className="flex h-[calc(100vh-24rem)]">
                      {/* Branch List */}
                      <div className="w-1/3 border-r border-slate-100 overflow-y-auto p-4 space-y-2">
                        {filteredBranches.length === 0 ? (
                          <p className="text-center text-slate-500 text-sm py-4">No branches found.</p>
                        ) : (
                          filteredBranches.map((b) => (
                            <div
                              key={b.id}
                              onClick={() => setBranchYearSemDetail(b)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all ${branchYearSemDetail?.id === b.id
                                ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                                : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                                }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className={`font-semibold ${branchYearSemDetail?.id === b.id ? 'text-indigo-900' : 'text-slate-800'}`}>{b.name}</h4>
                                {((b.hods && b.hods.length > 0) || b.hod) ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">HOD Assigned</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">HOD Pending</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">{b.course_name}</p>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Subject Management Area */}
                      <div className="w-2/3 overflow-y-auto p-6 bg-slate-50/30">
                        {!branchYearSemDetail ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <BookOpen className="w-12 h-12 mb-3 opacity-20" />
                            <p>Select a branch to manage subjects</p>
                          </div>
                        ) : (
                          <div>
                            <div className="mb-6">
                              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <BookOpen className="w-6 h-6 text-indigo-600" />
                                {branchYearSemDetail.name}
                              </h3>
                              <p className="text-slate-500 text-sm">Manage subjects for each semester</p>
                            </div>

                            {loadingYearSem ? (
                              <div className="py-12 flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-slate-500 text-sm">Loading semesters…</p>
                              </div>
                            ) : yearSemData.yearSemList.length === 0 ? (
                              <p className="py-8 text-center text-slate-500 text-sm">
                                No academic years found. Ensure students are enrolled in this branch.
                              </p>
                            ) : (
                              <div className="space-y-6">
                                {yearSemData.yearSemList
                                  .filter(({ year }) => !selectedYearForSubjects || Number(year) === Number(selectedYearForSubjects))
                                  .map(({ year, semester, label }) => {
                                    const key = `${year}-${semester}`;
                                    const assignedDetails = yearSemData.assignmentsByKey[key] || [];

                                    // HOD Verification Logic
                                    const hodsForBranch = branchYearSemDetail.hods || (branchYearSemDetail.hod ? [branchYearSemDetail.hod] : []) || [];
                                    const isHodAssignedForYear = hodsForBranch.some(h =>
                                      Array.isArray(h.years) && h.years.includes(year)
                                    );

                                    const availableSubjects = (yearSemData.subjects || []).filter(
                                      s => !assignedDetails.some(a => a.subjectId === s.id)
                                    );
                                    const selectedId = newSubjectSelect[key] || '';

                                    return (
                                      <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                          <h4 className="font-semibold text-slate-800">{label}</h4>
                                          {!isHodAssignedForYear && (
                                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 flex items-center gap-1">
                                              ⚠️ No HOD for Year {year}
                                            </span>
                                          )}
                                        </div>

                                        <div className="p-4 space-y-3">
                                          {/* Assigned Subjects List */}
                                          {assignedDetails.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              {assignedDetails.map((a) => (
                                                <div key={a.subjectId} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group">
                                                  <div>
                                                    <p className="font-medium text-slate-700 text-sm">{a.subjectName}</p>
                                                    {a.subjectCode && <p className="text-xs text-slate-400">{a.subjectCode}</p>}
                                                  </div>
                                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                      onClick={() => handleEditSubject(year, semester, label, a.subjectId)}
                                                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                      title="Edit subject"
                                                    >
                                                      <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                      onClick={() => handleRemoveSubjectFromSem(year, semester, a.subjectId)}
                                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                      title="Remove subject"
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-sm text-slate-400 italic py-2">No subjects assigned yet.</p>
                                          )}

                                          {/* Add Subject Controls */}
                                          <div className="mt-4 pt-4 border-t border-slate-100">
                                            {isHodAssignedForYear ? (
                                              <div className="flex gap-2 items-center">
                                                <select
                                                  value={selectedId}
                                                  onChange={(e) => setNewSubjectSelect(prev => ({ ...prev, [key]: e.target.value }))}
                                                  className="flex-1 text-sm border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                >
                                                  <option value="">Select subject...</option>
                                                  {availableSubjects.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name} ({s.code || 'No code'})</option>
                                                  ))}
                                                </select>
                                                <button
                                                  onClick={() => handleAddSubjectToSem(year, semester, selectedId)}
                                                  disabled={!selectedId || addingSubjectKey === key}
                                                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                                >
                                                  <Plus className="w-4 h-4" />
                                                </button>
                                                <div className="w-px h-8 bg-slate-200 mx-2"></div>
                                                <button
                                                  onClick={() => { setCreateSubjectForSem({ year, semester, label }); setNewSubjectName(''); setNewSubjectCode(''); }}
                                                  className="px-3 py-2 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50"
                                                >
                                                  Create New
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                                                <p className="text-sm text-amber-800">Assign an HOD to Year {year} to manage subjects.</p>
                                                <button
                                                  onClick={() => setTab('assign-hods')}
                                                  className="text-xs font-bold text-amber-700 underline hover:text-amber-900"
                                                >
                                                  Go to Assign HODs
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Assign Staff tab */}
            {tab === 'assign-staff' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Select college</label>
                      <select
                        value={selectedCollegeId}
                        onChange={(e) => { setSelectedCollegeId(e.target.value); setSelectedYearForStaff(''); setSelectedBranchForStaff(null); }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                      >
                        <option value="">— Select college —</option>
                        {colleges.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Select program (course)</label>
                      <select
                        value={selectedProgramId}
                        onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedYearForStaff(''); setSelectedBranchForStaff(null); }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                      >
                        <option value="">— Select program —</option>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Select year</label>
                      <select
                        value={selectedYearForStaff}
                        onChange={(e) => { setSelectedYearForStaff(e.target.value); setSelectedBranchForStaff(null); }}
                        disabled={!selectedCollegeId || !selectedProgramId}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">— Select year —</option>
                        {(staffTabData.yearsAvailable?.length > 0 ? staffTabData.yearsAvailable : [1, 2, 3, 4, 5, 6]).map((y) => (
                          <option key={y} value={y}>Year {y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Select semester</label>
                      <select
                        value={selectedSemesterForStaff}
                        onChange={(e) => setSelectedSemesterForStaff(e.target.value)}
                        disabled={!selectedYearForStaff}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed uppercase text-xs tracking-wider"
                      >
                        <option value="">— All Semesters —</option>
                        {(() => {
                          const branchForSems = selectedBranchForStaff || (staffTabData.branches?.[0]);
                          if (branchForSems?.yearSemList && branchForSems.yearSemList.length > 0) {
                            return branchForSems.yearSemList.map(ys => (
                              <option key={ys.semester} value={ys.semester}>{ys.label}</option>
                            ));
                          }
                          return selectedYearForStaff && [1, 2].map(s => {
                            const semNum = (Number(selectedYearForStaff) - 1) * 2 + s;
                            return <option key={semNum} value={semNum}>Sem {semNum}</option>;
                          });
                        })()}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {!selectedCollegeId || !selectedProgramId ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Select college and program to see subjects.</div>
                  ) : !selectedYearForStaff ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Select a year to see subjects and assign staff.</div>
                  ) : loadingStaffTab ? (
                    <div className="py-12 flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 text-sm">Loading subjects…</p>
                    </div>
                  ) : !staffTabData.branches || staffTabData.branches.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">No branches or subjects in this program for Year {selectedYearForStaff}. Create subjects first (Assign HODs → double-click branch → manage subjects).</div>
                  ) : (
                    <div className="flex gap-6 flex-col lg:flex-row min-h-[500px]">
                      {/* Left – branches list */}
                      <div className="w-full lg:w-72 flex-shrink-0">
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden sticky top-6">
                          <div className="px-5 py-4 border-b border-slate-200 bg-slate-100/50">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branches</h4>
                          </div>
                          <div className="p-3 max-h-[calc(100vh-24rem)] overflow-y-auto space-y-2">
                            {staffTabData.branches.map((branch) => (
                              <button
                                key={branch.id}
                                type="button"
                                onClick={() => setSelectedBranchForStaff(prev => prev?.id === branch.id ? null : branch)}
                                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 border ${selectedBranchForStaff?.id === branch.id
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 scale-[1.02]'
                                  : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-indigo-300'
                                  }`}
                              >
                                {branch.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right – subjects for selected branch */}
                      <div className="flex-1 min-w-0">
                        {selectedBranchForStaff ? (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 bg-indigo-50/30 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                  <BookOpen className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-800">Subjects – {selectedBranchForStaff.name}</h4>
                                  <p className="text-xs text-indigo-600 font-semibold">Academic Year {selectedYearForStaff}</p>
                                </div>
                              </div>
                            </div>
                            <div className="p-6 max-h-[calc(100vh-24rem)] overflow-y-auto space-y-8">
                              {(!selectedBranchForStaff.yearSemList || selectedBranchForStaff.yearSemList.length === 0) ? (
                                <div className="py-12 text-center">
                                  <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                  <p className="text-sm text-slate-500">No semesters for Year {selectedYearForStaff} in this branch.</p>
                                </div>
                              ) : (
                                selectedBranchForStaff.yearSemList
                                  .filter(({ semester }) => !selectedSemesterForStaff || Number(semester) === Number(selectedSemesterForStaff))
                                  .map(({ year, semester, label }) => {
                                    const key = `${year}-${semester}`;
                                    const assigned = selectedBranchForStaff.assignmentsByKey[key] || [];
                                    return (
                                      <div key={key} className="space-y-4">
                                        <div className="flex items-center gap-4">
                                          <div className="h-px flex-1 bg-slate-100"></div>
                                          <h5 className="text-sm font-bold text-slate-400 uppercase tracking-widest">{label}</h5>
                                          <div className="h-px flex-1 bg-slate-100"></div>
                                        </div>

                                        {assigned.length === 0 ? (
                                          <div className="text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                            <p className="text-sm text-slate-400">No subjects assigned to this semester</p>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {assigned.map((a) => (
                                              <div key={a.subjectId} className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-slate-100">
                                                <div className="flex items-start justify-between gap-4 mb-4">
                                                  <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wide ${a.subjectType === 'lab'
                                                        ? 'bg-purple-100 text-purple-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                        {a.subjectType || 'Theory'}
                                                      </span>
                                                      {a.subjectCode && <span className="text-[10px] font-mono text-slate-400">{a.subjectCode}</span>}
                                                    </div>
                                                    <h6 className="font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors uppercase">{a.subjectName}</h6>
                                                    <div className="flex items-center gap-2 mt-2">
                                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {a.credits} Credits
                                                      </span>
                                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {a.subjectType === 'lab' ? `${a.experimentsCount} Experiments` : `${a.units} Units`}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="space-y-3">
                                                  <div className="flex flex-wrap gap-2">
                                                    {(a.faculty || []).length > 0 ? (
                                                      (a.faculty || []).map((f) => (
                                                        <div key={f.id} className="flex items-center justify-between gap-2 w-full py-2.5 pl-3 pr-3 rounded-xl bg-slate-50 border border-indigo-100 group/faculty transition-all hover:bg-white hover:shadow-sm">
                                                          <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-sm shadow-indigo-200">
                                                              {f.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                              <p className="text-xs font-bold text-slate-800 leading-none mb-0.5">{f.name}</p>
                                                              <p className="text-[10px] text-indigo-600 font-semibold italic">Assigned Faculty</p>
                                                            </div>
                                                          </div>
                                                          <button
                                                            type="button"
                                                            onClick={() => handleUnassignStaffFromSubject(a.subjectId, f.id)}
                                                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover/faculty:opacity-100"
                                                            title="Unassign Faculty"
                                                          >
                                                            <Trash2 className="w-4 h-4" />
                                                          </button>
                                                        </div>
                                                      ))
                                                    ) : (
                                                      <div className="w-full py-3 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/30 text-center">
                                                        <p className="text-[11px] text-slate-400 font-medium italic">Pending faculty assignment</p>
                                                      </div>
                                                    )}
                                                  </div>

                                                  {/* Only show assignment controls if NO faculty is assigned */}
                                                  {(!a.faculty || a.faculty.length === 0) && (
                                                    <div className="pt-3 border-t border-slate-50 flex gap-2">
                                                      <select
                                                        value={staffAssignSelect[a.subjectId] || ''}
                                                        onChange={(e) => setStaffAssignSelect(prev => ({ ...prev, [a.subjectId]: e.target.value }))}
                                                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                                                      >
                                                        <option value="">— Select Faculty —</option>
                                                        {[...(employees.all || [])]
                                                          .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
                                                          .map((u) => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                          ))}
                                                      </select>
                                                      <button
                                                        type="button"
                                                        disabled={!staffAssignSelect[a.subjectId] || assigningStaff}
                                                        onClick={() => handleAssignStaffToSubject(a.subjectId, staffAssignSelect[a.subjectId])}
                                                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-extrabold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-100 active:scale-95"
                                                      >
                                                        Assign
                                                      </button>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-[500px] border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/30">
                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4 text-slate-300">
                              <UserPlus className="w-8 h-8" />
                            </div>
                            <h5 className="font-bold text-slate-800 mb-1">No Branch Selected</h5>
                            <p className="text-sm text-slate-500 max-w-[240px] text-center">Select a branch from the list to manage faculty assignments for its subjects.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'time-table' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Advanced Selection Bar */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 mb-8 shadow-sm">
                  <div className="flex flex-col lg:flex-row items-end gap-6">
                    <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">College</label>
                        <select
                          value={selectedCollegeId}
                          onChange={(e) => setSelectedCollegeId(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm hover:border-indigo-300"
                        >
                          <option value="">Select College</option>
                          {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Program</label>
                        <select
                          value={selectedProgramId}
                          onChange={(e) => setSelectedProgramId(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm hover:border-indigo-300"
                        >
                          <option value="">Select Program</option>
                          {programs.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Year</label>
                        <select
                          value={selectedYearForTimetable}
                          onChange={(e) => {
                            setSelectedYearForTimetable(e.target.value);
                            setSelectedSemesterForTimetable('');
                          }}
                          disabled={!selectedCollegeId || !selectedProgramId}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm hover:border-indigo-300 disabled:opacity-50"
                        >
                          <option value="">Select Year</option>
                          {(staffTabData.yearsAvailable?.length > 0 ? staffTabData.yearsAvailable : [1, 2, 3, 4, 5, 6]).map((y) => (
                            <option key={y} value={y}>Year {y}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Semester</label>
                        <select
                          value={selectedSemesterForTimetable}
                          onChange={(e) => setSelectedSemesterForTimetable(e.target.value)}
                          disabled={!selectedYearForTimetable}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm hover:border-indigo-300 disabled:opacity-50"
                        >
                          <option value="">Select Semester</option>
                          {(() => {
                            const branchForSems = selectedBranchForTimetable || staffTabData.branches?.[0];
                            if (branchForSems?.yearSemList && branchForSems.yearSemList.length > 0) {
                              return branchForSems.yearSemList.map(ys => (
                                <option key={ys.semester} value={ys.semester}>{ys.label}</option>
                              ));
                            }
                            return selectedYearForTimetable && [1, 2].map(s => {
                              return <option key={s} value={s}>Sem {s}</option>;
                            });
                          })()}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-6 flex-col lg:flex-row min-h-[500px]">
                  {/* Left – branches list */}
                  <div className="w-full lg:w-72 flex-shrink-0">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden sticky top-6 shadow-sm">
                      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Branch</h4>
                      </div>
                      <div className="p-4 max-h-[calc(100vh-24rem)] overflow-y-auto space-y-2">
                        {staffTabData.branches.map((branch) => (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => setSelectedBranchForTimetable(prev => prev?.id === branch.id ? null : branch)}
                            className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 border ${selectedBranchForTimetable?.id === branch.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                              : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-indigo-300'
                              }`}
                          >
                            {branch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right – Timetable Grid */}
                  <div className="flex-1 min-w-0">
                    {!selectedBranchForTimetable || !selectedYearForTimetable || !selectedSemesterForTimetable ? (
                      <div className="flex flex-col items-center justify-center min-h-[500px] border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/30 p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4 text-slate-300">
                          <Clock className="w-8 h-8" />
                        </div>
                        <h5 className="font-bold text-slate-800 mb-1">Configuration Required</h5>
                        <p className="text-sm text-slate-500 max-w-[320px]">Select a branch, year, and semester to view or manage the academic timetable.</p>
                      </div>
                    ) : loadingTimetable ? (
                      <div className="flex flex-col items-center justify-center min-h-[500px]">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">Building Schedule...</p>
                      </div>
                    ) : periodSlots.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[500px] bg-white rounded-[2rem] border border-slate-200 p-12 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 text-amber-500">
                          <Clock className="w-8 h-8" />
                        </div>
                        <h5 className="font-bold text-slate-800 mb-1">No Period Slots Defined</h5>
                        <p className="text-sm text-slate-500 max-w-[320px] mb-6">Definitions for class timings (Period Slots) must be created to build the timetable grid.</p>
                        <button
                          onClick={() => setShowManageSlotsModal(true)}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100"
                        >
                          <Settings2 className="w-4 h-4" />
                          Configure Timings
                        </button>
                      </div>
                    ) : (
                      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase tracking-wider">Class Timetable</span>
                              <span className="text-[10px] font-bold text-slate-400">•</span>
                              <span className="text-[10px] font-bold text-slate-500">{selectedBranchForTimetable.name}</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Year {selectedYearForTimetable} • Semester {selectedSemesterForTimetable}</h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setShowAllocationAbstract(true)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-indigo-600 text-xs font-bold hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                            >
                              <FileText className="w-4 h-4" />
                              View Abstract
                            </button>
                            <button
                              onClick={() => setShowManageSlotsModal(true)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
                            >
                              <Clock className="w-4 h-4" />
                              Manage Timings
                            </button>
                            <button className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95">
                              <Save className="w-4 h-4" />
                              Save Draft
                            </button>
                          </div>
                        </div>

                        <div className="p-8">
                          <TimetableTable
                            periodSlots={periodSlots}
                            timetableData={timetableData}
                            onEditSlot={handleEditTimetableSlot}
                            loading={loadingTimetable}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit Slot Sidebar */}
                {editingSlot && (
                  <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300" onClick={() => setEditingSlot(null)} />
                    <div className="relative w-full max-w-sm bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col border-l border-white/20">
                      <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <button onClick={() => setEditingSlot(null)} className="p-2 rounded-xl hover:bg-white text-slate-400 transition-colors shadow-sm">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Edit Class Slot</h3>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                          <span className="text-indigo-600">{editingSlot.day}</span> • Slot {periodSlots.find(s => s.id === editingSlot.slotId)?.name}
                        </p>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-8">
                        <div className="space-y-4">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block px-1">Type of Entry</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['subject', 'lab', 'break', 'other'].map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setSlotFormData(prev => ({ ...prev, type }))}
                                className={`py-4 px-4 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest ${slotFormData.type === type
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-200'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                                  }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        {['subject', 'lab'].includes(slotFormData.type) ? (
                          <div className="space-y-4">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block px-1">Assign Subject</label>
                            <select
                              value={slotFormData.subject_id}
                              onChange={(e) => setSlotFormData(prev => ({ ...prev, subject_id: e.target.value }))}
                              className="w-full h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all appearance-none"
                            >
                              <option value="">— Select from Course —</option>
                              {staffTabData.branches
                                .find(b => b.id === selectedBranchForTimetable.id)
                                ?.assignmentsByKey[`${selectedYearForTimetable}-${selectedSemesterForTimetable}`]
                                ?.map(sub => (
                                  <option key={sub.subjectId} value={sub.subjectId}>
                                    {sub.subjectCode ? sub.subjectCode : 'ID:' + sub.subjectId} - {sub.subjectName}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block px-1">Label (e.g. Lunch Break)</label>
                            <input
                              type="text"
                              placeholder="Enter label (e.g. Lunch)..."
                              value={slotFormData.custom_label}
                              onChange={(e) => setSlotFormData(prev => ({ ...prev, custom_label: e.target.value }))}
                              className="w-full h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all"
                            />
                          </div>
                        )}

                        <div className="space-y-4">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block px-1">Duration (Slots)</label>
                          <input
                            type="number"
                            min="1"
                            max="4"
                            value={slotFormData.span}
                            onChange={(e) => setSlotFormData(prev => ({ ...prev, span: parseInt(e.target.value) || 1 }))}
                            className="w-full h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all"
                          />
                          <p className="text-[10px] text-slate-400 font-bold italic px-1">Set to 2 or more for Lab sessions or multi-period events.</p>
                        </div>
                      </div>

                      <div className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50/30">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const existing = timetableData.find(e => e.day_of_week === editingSlot.day && e.period_slot_id === editingSlot.slotId);
                              if (existing) {
                                await api.delete(`/timetable/${existing.id}`);
                              }
                              setEditingSlot(null);
                              // Refetch
                              const res = await api.get('/timetable', {
                                params: {
                                  branch_id: selectedBranchForTimetable.id,
                                  year: selectedYearForTimetable,
                                  semester: selectedSemesterForTimetable
                                }
                              });
                              if (res.data.success) setTimetableData(res.data.data || []);
                              toast.success('Slot cleared');
                            } catch (e) {
                              toast.error('Failed to clear slot');
                            }
                          }}
                          className="flex-1 py-4 rounded-2xl border-2 border-slate-200 bg-white text-slate-500 text-[10px] font-black hover:bg-slate-50 transition-all uppercase tracking-widest shadow-sm"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!slotFormData.type) return;
                            try {
                              await api.post('/timetable', {
                                branch_id: selectedBranchForTimetable.id,
                                year: selectedYearForTimetable,
                                semester: selectedSemesterForTimetable,
                                day_of_week: editingSlot.day,
                                period_slot_id: editingSlot.slotId,
                                ...slotFormData
                              });
                              setEditingSlot(null);
                              // Refetch
                              const res = await api.get('/timetable', {
                                params: {
                                  branch_id: selectedBranchForTimetable.id,
                                  year: selectedYearForTimetable,
                                  semester: selectedSemesterForTimetable
                                }
                              });
                              if (res.data.success) setTimetableData(res.data.data || []);
                              toast.success('Timetable saved');
                            } catch (e) {
                              toast.error('Failed to save assignment');
                            }
                          }}
                          className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 uppercase tracking-widest active:scale-95"
                        >
                          Save Slot
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
            }

            {/* Allocation Abstract Modal */}
            {showAllocationAbstract && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500">
                  <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Allocation Abstract</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {selectedBranchForTimetable.name} • Year {selectedYearForTimetable} • Sem {selectedSemesterForTimetable}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAllocationAbstract(false)}
                      className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-8 overflow-y-auto max-h-[70vh]">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100/50">
                          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Theory Slots</div>
                          <div className="text-2xl font-black text-indigo-700 leading-none">
                            {timetableData.filter(e => e.type === 'subject').reduce((sum, e) => sum + (e.span || 1), 0)}
                          </div>
                        </div>
                        <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100/50">
                          <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Total Lab Slots</div>
                          <div className="text-2xl font-black text-purple-700 leading-none">
                            {timetableData.filter(e => e.type === 'lab').reduce((sum, e) => sum + (e.span || 1), 0)}
                          </div>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subject</th>
                              <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Theory</th>
                              <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Lab</th>
                              <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(() => {
                              const branchData = staffTabData.branches.find(b => b.id === selectedBranchForTimetable.id);
                              const subjects = branchData?.assignmentsByKey[`${selectedYearForTimetable}-${selectedSemesterForTimetable}`] || [];

                              if (subjects.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan="4" className="px-5 py-12 text-center text-slate-400 font-bold italic text-sm">
                                      No subjects assigned to this semester.
                                    </td>
                                  </tr>
                                );
                              }

                              return subjects.map(sub => {
                                const theoryTotal = timetableData
                                  .filter(e => String(e.subject_id) === String(sub.subjectId) && e.type === 'subject')
                                  .reduce((sum, e) => sum + (e.span || 1), 0);
                                const labTotal = timetableData
                                  .filter(e => String(e.subject_id) === String(sub.subjectId) && e.type === 'lab')
                                  .reduce((sum, e) => sum + (e.span || 1), 0);

                                return (
                                  <tr key={sub.subjectId} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-4">
                                      <div className="text-[13px] font-black text-slate-800 leading-tight uppercase">{sub.subjectCode || 'N/A'}</div>
                                      <div className="text-[11px] font-bold text-slate-400 mt-0.5 truncate max-w-[240px]">{sub.subjectName}</div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                      <span className={`text-[13px] font-bold ${theoryTotal > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                                        {theoryTotal}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                      <span className={`text-[13px] font-bold ${labTotal > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                                        {labTotal}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-[13px] font-black text-slate-700">
                                        {theoryTotal + labTotal}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                    <button
                      onClick={() => setShowAllocationAbstract(false)}
                      className="px-6 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                    >
                      Close Abstract
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Employee detail modal – open on double-click */}
            {employeeDetail && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEmployeeDetail(null)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Employee details</h3>
                    <button type="button" onClick={() => setEmployeeDetail(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {(() => {
                    const { colleges, courses, branches } = getScopeDisplay(employeeDetail);
                    return (
                      <div className="space-y-4 text-sm">
                        <p><span className="font-semibold text-slate-600">Name</span> {employeeDetail.name}</p>
                        <p><span className="font-semibold text-slate-600">Email</span> {employeeDetail.email}</p>
                        <p><span className="font-semibold text-slate-600">Role</span> {employeeDetail.roleLabel}</p>
                        <p><span className="font-semibold text-slate-600">College(s)</span> {colleges}</p>
                        <p><span className="font-semibold text-slate-600">Course(s)</span> {courses}</p>
                        <p><span className="font-semibold text-slate-600">Branch(es)</span> {branches}</p>
                        <a href="/admin/user-management" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 text-indigo-600 font-semibold hover:underline">
                          <ExternalLink className="w-4 h-4" /> Open in User Management
                        </a>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}



            {/* Create Subject Modal */}
            {createSubjectForSem && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCreateSubjectForSem(null)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scaleIn" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 tracking-tight">{editingSubject ? 'Edit Subject' : 'Create New Subject'}</h3>
                      <p className="text-sm text-slate-500 mt-1">{editingSubject ? `Updating ${editingSubject.name}` : `Assigning to ${createSubjectForSem.label}`}</p>
                    </div>
                    <button type="button" onClick={() => { setCreateSubjectForSem(null); setEditingSubject(null); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject Name *</label>
                        <input
                          type="text"
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="e.g. Data Structures"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject Code *</label>
                        <input
                          type="text"
                          value={newSubjectCode}
                          onChange={(e) => setNewSubjectCode(e.target.value)}
                          placeholder="e.g. CS101"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="p-1 bg-slate-100 rounded-xl flex">
                      <button
                        type="button"
                        onClick={() => setSubjectType('theory')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${subjectType === 'theory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        📚 Theory
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubjectType('lab')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${subjectType === 'lab' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        🧪 Lab
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {subjectType === 'theory' ? (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">No. of Units *</label>
                          <input
                            type="number"
                            value={units}
                            onChange={(e) => setUnits(e.target.value)}
                            placeholder="e.g. 5"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">No. of Experiments *</label>
                          <input
                            type="number"
                            value={experimentsCount}
                            onChange={(e) => setExperimentsCount(e.target.value)}
                            placeholder="e.g. 12"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Credits *</label>
                        <input
                          type="number"
                          step="0.1"
                          value={credits}
                          onChange={(e) => setCredits(e.target.value)}
                          placeholder="e.g. 3.0"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => { setCreateSubjectForSem(null); setEditingSubject(null); }}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={creatingSubject || !newSubjectName || !newSubjectCode || !credits || (subjectType === 'theory' ? !units : !experimentsCount)}
                        onClick={handleCreateSubjectForSem}
                        className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all active:scale-95"
                      >
                        {creatingSubject ? 'Saving...' : (editingSubject ? 'Update Subject' : 'Create Subject')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* Assign HOD dialog – select existing user, create new HOD, or edit years */}
            {assignHodBranch && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeAssignHodModal}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">
                      {editingHod ? `Edit years – ${editingHod.hod.name}` : `Assign HOD – ${assignHodBranch.name}`}
                    </h3>
                    <button type="button" onClick={closeAssignHodModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {editingHod ? (
                    <div className="space-y-4">
                      <p className="text-slate-600 text-sm">Branch: <strong>{assignHodBranch.name}</strong></p>
                      {renderHodYearPicker()}
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={closeAssignHodModal}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={selectedHodYears.length === 0 || assigningHod || loadingAvailableYears}
                          onClick={handleAssignHodSubmit}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {assigningHod ? 'Updating…' : 'Update years'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setAssignHodMode('select')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${assignHodMode === 'select' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                          Select existing user
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignHodMode('create')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${assignHodMode === 'create' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                          Create new HOD
                        </button>
                      </div>

                      {assignHodMode === 'select' ? (
                        <div className="space-y-4">
                          <label className="block text-sm font-semibold text-slate-700">Select existing user</label>
                          {loadingUsers ? (
                            <div className="flex items-center gap-2 text-slate-500 text-sm">
                              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              Loading users…
                            </div>
                          ) : (
                            <select
                              value={selectedHodUserId}
                              onChange={(e) => setSelectedHodUserId(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">— Select user —</option>
                              {rbacUsers.map((u) => (
                                <option key={u.id} value={u.id}>{u.name} ({u.email || u.username})</option>
                              ))}
                            </select>
                          )}
                          {renderHodYearPicker()}
                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={closeAssignHodModal}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!selectedHodUserId || assigningHod || loadingAvailableYears}
                              onClick={handleAssignHodSubmit}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {assigningHod ? 'Assigning…' : 'Assign HOD'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-slate-600 text-sm">Create a new user with HOD role for branch <strong>{assignHodBranch.name}</strong>. They will appear in User Management.</p>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Name *</label>
                            <input
                              type="text"
                              value={newHodName}
                              onChange={(e) => setNewHodName(e.target.value)}
                              placeholder="Full name"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Email *</label>
                            <input
                              type="email"
                              value={newHodEmail}
                              onChange={(e) => setNewHodEmail(e.target.value)}
                              placeholder="email@example.com"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Username *</label>
                            <input
                              type="text"
                              value={newHodUsername}
                              onChange={(e) => setNewHodUsername(e.target.value)}
                              placeholder="Login username"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Password * (min 6 characters)</label>
                            <input
                              type="password"
                              value={newHodPassword}
                              onChange={(e) => setNewHodPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          {renderHodYearPicker()}
                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={closeAssignHodModal}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={creatingUser || loadingAvailableYears}
                              onClick={handleCreateHodSubmit}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {creatingUser ? 'Creating…' : 'Create & assign HOD'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {/* Manage Slots Modal */}
        {showManageSlotsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Manage Period Slots</h3>
                  <p className="text-sm text-slate-500">Define class timings and duration for the timetable</p>
                </div>
                <button
                  onClick={() => {
                    setShowManageSlotsModal(false);
                    setEditingSlotId(null);
                    setNewPeriodSlot({ name: '', start_time: '', end_time: '', sort_order: 0 });
                  }}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-8 flex flex-col lg:flex-row gap-8 h-full">
                  {/* Add/Edit Form */}
                  <div className="lg:w-80 space-y-6">
                    <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                      <h4 className="text-sm font-bold text-indigo-900 mb-4">{editingSlotId ? 'Edit Slot' : 'Add New Slot'}</h4>
                      <form onSubmit={handleSavePeriodSlot} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Slot Name</label>
                          <input
                            type="text"
                            required
                            value={newPeriodSlot.name}
                            onChange={e => setNewPeriodSlot({ ...newPeriodSlot, name: e.target.value })}
                            placeholder="e.g. Period 1, Lunch Break"
                            className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Start</label>
                            <input
                              type="time"
                              required
                              value={newPeriodSlot.start_time}
                              onChange={e => setNewPeriodSlot({ ...newPeriodSlot, start_time: e.target.value })}
                              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">End</label>
                            <input
                              type="time"
                              required
                              value={newPeriodSlot.end_time}
                              onChange={e => setNewPeriodSlot({ ...newPeriodSlot, end_time: e.target.value })}
                              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Sort & Position</label>
                          <input
                            type="number"
                            value={newPeriodSlot.sort_order}
                            onChange={e => setNewPeriodSlot({ ...newPeriodSlot, sort_order: Number(e.target.value) })}
                            className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={savingPeriodSlot}
                          className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                        >
                          {savingPeriodSlot ? 'Saving...' : editingSlotId ? 'Update Slot' : 'Add Slot'}
                        </button>
                        {editingSlotId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSlotId(null);
                              setNewPeriodSlot({ name: '', start_time: '', end_time: '', sort_order: 0 });
                            }}
                            className="w-full h-12 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
                          >
                            Cancel Edit
                          </button>
                        )}
                      </form>
                    </div>
                  </div>

                  {/* Slots List */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-slate-800">Available Slots</h4>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{periodSlots.length} Slots defined</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {periodSlots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-3xl">
                          <p className="text-sm text-slate-400 font-medium">No slots defined yet</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {periodSlots.map((slot, idx) => (
                            <React.Fragment key={slot.id}>
                              {idx === 0 && (
                                <div className="flex justify-center group/add relative z-10 -my-1">
                                  <button
                                    onClick={() => {
                                      setEditingSlotId(null);
                                      setNewPeriodSlot({ name: '', start_time: '', end_time: '', sort_order: (slot.sort_order || 1) - 1 });
                                      document.getElementById('period-slot-name')?.focus();
                                    }}
                                    className="w-6 h-6 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover/add:opacity-100 shadow-md scale-95 hover:scale-110"
                                    title="Add slot at beginning"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl group/item hover:border-indigo-200 transition-all shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-indigo-100/50">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 group-hover/item:bg-indigo-50 group-hover/item:text-indigo-600 transition-all font-black text-xs ring-1 ring-slate-100">
                                    {slot.sort_order}
                                  </div>
                                  <div>
                                    <div className="text-[13px] font-bold text-slate-800 uppercase tracking-tight leading-none mb-1">{slot.name}</div>
                                    <div className="text-[11px] font-bold text-indigo-500 font-mono italic">
                                      {slot.start_time.substring(0, 5)} — {slot.end_time.substring(0, 5)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingSlotId(slot.id);
                                      setNewPeriodSlot({
                                        name: slot.name,
                                        start_time: slot.start_time.substring(0, 5),
                                        end_time: slot.end_time.substring(0, 5),
                                        sort_order: slot.sort_order || 0
                                      });
                                      document.getElementById('period-slot-name')?.focus();
                                    }}
                                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePeriodSlot(slot.id)}
                                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex justify-center group/add relative z-10 -my-1">
                                <button
                                  onClick={() => {
                                    const nextSlot = periodSlots[idx + 1];
                                    // Suggest a value in between, or just slot+1 if it's the end
                                    const nextOrder = nextSlot ? Math.floor(slot.sort_order + 1) : Math.floor(slot.sort_order || 0) + 1;
                                    setEditingSlotId(null);
                                    setNewPeriodSlot({ name: '', start_time: '', end_time: '', sort_order: nextOrder });
                                    document.getElementById('period-slot-name')?.focus();
                                  }}
                                  className="w-6 h-6 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover/add:opacity-100 shadow-md scale-95 hover:scale-110"
                                  title="Insert slot here"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyManagement;

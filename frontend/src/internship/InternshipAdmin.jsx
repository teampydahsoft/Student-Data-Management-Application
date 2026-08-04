import React, { useState, useEffect, useMemo } from 'react';
import api from '../config/api';
import { toast } from 'react-hot-toast';
import { MapPin, Calendar, Clock, Loader2, Plus, Target, UserCheck, AlertTriangle, Search, X, Navigation, List, Filter, Users, Pen, Trash2, Check, Eye, Download, FileText, Lock, BarChart2, Edit3, ShieldAlert, ChevronDown, ChevronUp, Building2, Box, ArrowRight, ChevronLeft, AlertCircle, RefreshCw } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, LayersControl, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issue
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Search Result Marker Icon (Red)
const SearchResultIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Saved Location Marker Icon (Green)
const SavedLocationIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Component to handle map clicks
const MapClickHandler = ({ onLocationSelect }) => {
    useMapEvents({
        click(e) {
            if (typeof onLocationSelect === 'function') {
                onLocationSelect(e.latlng);
            }
        },
    });
    return null;
};

// Component to fly to location
const MapFlyTo = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords) {
            map.flyTo(coords, 16);
        }
    }, [coords, map]);
    return null;
};

const InternshipAdmin = () => {
    const { user } = useAuthStore();

    // Permission check
    const hasAccess = useMemo(() => {
        if (!user) return false;
        if (isFullAccessRole(user.role)) return true;
        return hasPermission(user.permissions, BACKEND_MODULES.ATTENDANCE, 'view_internship');
    }, [user]);

    if (!hasAccess && user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <Lock className="text-red-500" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                <p className="text-gray-600 max-w-sm">
                    You do not have permission to view Internship Attendance.
                </p>
            </div>
        );
    }
    const [activeTab, setActiveTab] = useState('create');
    const [formData, setFormData] = useState({
        companyName: '',
        address: '',
        latitude: 17.6868, // Default 
        longitude: 83.2185,
        radius: 200,
        allowedStartTime: '09:00',
        allowedEndTime: '18:00'
    });
    const [loading, setLoading] = useState(false);

    // Report Data & Filters
    const [reportData, setReportData] = useState([]);
    const [loadingReport, setLoadingReport] = useState(false);
    const [filters, setFilters] = useState({
        location: '',
        batch: '',
        college: '',
        course: '',
        branch: '',
        year: '',
        semester: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });
    const [filterOptions, setFilterOptions] = useState({
        locations: [],
        batches: [],
        courses: [],
        branches: [],
        years: [],
        semesters: [],
        colleges: []
    });

    // Existing Locations State
    const [locations, setLocations] = useState([]);

    // Map Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mapCenter, setMapCenter] = useState([17.6868, 83.2185]);

    // Assignment State
    const [assignmentData, setAssignmentData] = useState({
        internshipId: '',
        startDate: '',
        endDate: '',
        allowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    });

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Student Selection State
    const [availableStudents, setAvailableStudents] = useState([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // View Assigned Students Modal State
    const [viewStudentsModal, setViewStudentsModal] = useState(false);
    const [viewStudentsList, setViewStudentsList] = useState([]);
    const [viewStudentsLoading, setViewStudentsLoading] = useState(false);
    const [currentInternshipName, setCurrentInternshipName] = useState('');
    const [currentViewInternshipId, setCurrentViewInternshipId] = useState(null);

    // Edit Assignment Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingAssignmentId, setEditingAssignmentId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // Edit Location Modal State
    const [showEditLocationModal, setShowEditLocationModal] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [editLocationForm, setEditLocationForm] = useState({
        companyName: '',
        address: '',
        latitude: 0,
        longitude: 0,
        radius: 200,
        allowedStartTime: '',
        allowedEndTime: '',
        isActive: true
    });




    // Day End Report State
    const [dayEndReportOpen, setDayEndReportOpen] = useState(false);
    const [dayEndReportLoading, setDayEndReportLoading] = useState(false);
    const [dayEndReportData, setDayEndReportData] = useState(null);

    const [viewAttendanceModal, setViewAttendanceModal] = useState(false);
    const [selectedAttendance, setSelectedAttendance] = useState(null);
    const [viewAddresses, setViewAddresses] = useState({ checkIn: null, checkOut: null });

    // Conflict Modal State
    const [conflictModalOpen, setConflictModalOpen] = useState(false);
    const [conflictData, setConflictData] = useState([]);

    // ── Period Report State ──────────────────────────────────────────────────
    const [periodReport, setPeriodReport] = useState([]);
    const [periodReportLoading, setPeriodReportLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [markingCell, setMarkingCell] = useState(null); // { assignmentId, date } while saving
    const [periodFilters, setPeriodFilters] = useState({ location: '', batch: '', college: '', course: '', branch: '', year: '', semester: '' });
    const [periodFilterOptions, setPeriodFilterOptions] = useState({ locations: [], batches: [], courses: [], branches: [], years: [], semesters: [], colleges: [] });
    const [periodViewMode, setPeriodViewMode] = useState('detailed'); // 'detailed', 'abstract', 'grid'

    // ── Backdate Marking State (new workflow) ─────────────────────────────────
    const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'Super Admin' || user?.role === 'superadmin';
    // Step 1: Select internship + batch + date range
    const [bdInternship, setBdInternship] = useState('');     // internship_id
    const [bdBatch, setBdBatch]           = useState('');
    const [bdBranch, setBdBranch]         = useState('');
    const [bdFromDate, setBdFromDate]     = useState('');
    const [bdToDate, setBdToDate]         = useState('');
    const [bdWorkingDates, setBdWorkingDates] = useState([]); // computed list of working dates
    const [bdActiveDate, setBdActiveDate]   = useState('');   // selected date in the calendar
    const [bdStudents, setBdStudents]       = useState([]);   // students for bdActiveDate
    const [bdStudentsLoading, setBdStudentsLoading] = useState(false);
    const [bdChanges, setBdChanges]         = useState({});   // studentId → 'Present' | 'Absent'
    const [bdReason, setBdReason]           = useState('');
    const [bdSaving, setBdSaving]           = useState(false);
    const [bdPhase, setBdPhase]             = useState(1);    // 1=setup, 2=calendar grid
    const [auditLog, setAuditLog]           = useState([]);
    const [auditLoading, setAuditLoading]   = useState(false);
    const [showAuditLog, setShowAuditLog]   = useState(false);
    
    // Active/Running groups dashboard
    const [activeGroups, setActiveGroups]   = useState([]);
    const [activeGroupsLoading, setActiveGroupsLoading] = useState(false);
    const [activeRights, setActiveRights]   = useState([]); // DB persistent rights
    const [viewAuditDetail, setViewAuditDetail] = useState(null);

    // Right to edit: { date, location, batch }
    const [unlockedForEdit, setUnlockedForEdit] = useState(null);

    // Persistence Effect: Load state on mount (tab specific)
    useEffect(() => {
        const saved = sessionStorage.getItem('bd_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                if (state.internship) setBdInternship(state.internship);
                if (state.batch)      setBdBatch(state.batch);
                if (state.phase)      setBdPhase(state.phase);
                if (state.fromDate)   setBdFromDate(state.fromDate);
                if (state.toDate)     setBdToDate(state.toDate);
                
                // If we were in phase 2, we should probably try to load the calendar
                if (state.phase === 2 && state.internship) {
                    // We'll delay it slightly to ensure periodFilterOptions might be loaded
                    setTimeout(() => {
                        bdLoadCalendar(state.internship, state.batch, state.fromDate, state.toDate);
                    }, 500);
                }
            } catch (e) { console.error("Persistence load error", e); }
        }
    }, []);

    // Save state whenever it changes
    useEffect(() => {
        const state = {
            internship: bdInternship,
            batch: bdBatch,
            phase: bdPhase,
            fromDate: bdFromDate,
            toDate: bdToDate
        };
        sessionStorage.setItem('bd_state', JSON.stringify(state));
    }, [bdInternship, bdBatch, bdPhase, bdFromDate, bdToDate]);

    useEffect(() => {
        if (selectedAttendance) {
            setViewAddresses({ checkIn: null, checkOut: null }); // Reset

            const fetchAddr = async (loc, type) => {
                try {
                    if (!loc || !loc.latitude || !loc.longitude) return;
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`);
                    const data = await res.json();
                    if (data && data.display_name) {
                        setViewAddresses(prev => ({ ...prev, [type]: data.display_name }));
                    }
                } catch (e) { console.error("Addr fetch error", e); }
            };

            if (selectedAttendance.checkInLocation) {
                let loc = selectedAttendance.checkInLocation;
                if (typeof loc === 'string') loc = JSON.parse(loc);
                fetchAddr(loc, 'checkIn');
            }
            if (selectedAttendance.checkOutLocation) {
                let loc = selectedAttendance.checkOutLocation;
                if (typeof loc === 'string') loc = JSON.parse(loc);
                fetchAddr(loc, 'checkOut');
            }
        }
    }, [selectedAttendance]);

    // Fetch existing locations on mount
    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const res = await api.get('/internship/list');
            if (res.data.success) {
                setLocations(res.data.data);
            }
        } catch (error) {
            console.error("Failed to fetch locations", error);
        }
    };

    useEffect(() => {
        if (activeTab === 'report' || activeTab === 'assign') {
            fetchFilterOptions();
        }
        if (activeTab === 'backdate') {
            fetchActiveGroups();
            fetchAuditLog();
            fetchActiveRights();
        }
        if (activeTab === 'period-report') {
            fetchActiveRights();
        }
    }, [activeTab, filters.location, filters.college, filters.course, filters.batch]);

    const fetchActiveRights = async () => {
        try {
            const res = await api.get('/internship/active-backdate-rights');
            if (res.data.success) {
                setActiveRights(res.data.data);
            }
        } catch (e) { console.error("Failed to fetch active rights", e); }
    };

    const fetchActiveGroups = async () => {
        try {
            setActiveGroupsLoading(true);
            const res = await api.get('/internship/active-groups');
            if (res.data.success) {
                setActiveGroups(res.data.data);
            }
        } catch (error) {
            console.error("Failed to fetch active groups", error);
        } finally {
            setActiveGroupsLoading(false);
        }
    };

    const fetchFilterOptions = async () => {
        try {
            // Logic Change for Step Id: 541
            // Convert 'activeTab' check to use the new endpoints
            let endpoint = '/attendance/filters'; // Default to generic filters (All Students)
            if (activeTab === 'report') {
                endpoint = '/internship/filters'; // Specific filters for assigned students
            }

            const res = await api.get(endpoint, { params: { ...filters } });
            if (res.data.success) {
                setFilterOptions(prev => ({
                    ...prev,
                    ...res.data.data
                }));
            }
        } catch (error) {
            console.error("Failed to fetch filters", error);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters({
            location: '',
            batch: '',
            college: '',
            course: '',
            branch: '',
            year: '',
            semester: ''
        });
        // Remove fetchReport() call here to avoid auto-fetching report on clear if not in report tab
        if (activeTab === 'report') {
            // Let the useEffect handle it or call explicitly if needed, but usually redundant
            // fetchReport(); 
        }
    };


    // Handle Location Selection from Map (Click)
    const handleLocationSelect = async (latlng) => {
        setFormData(prev => ({
            ...prev,
            latitude: latlng.lat,
            longitude: latlng.lng
        }));

        try {
            // Reverse Geocode to get address for clicked location
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1`);
            const data = await response.json();
            if (data && data.display_name) {
                const placeName = data.display_name.split(',')[0];
                setFormData(prev => ({
                    ...prev,
                    address: data.display_name,
                    companyName: placeName // Auto-fill Company Name
                }));
            }
        } catch (error) {
            console.error("Reverse geocoding failed", error);
        }
    };

    const handleRevalidateAttendance = async (locationId = null) => {
        const confirmMsg = locationId 
            ? "This will re-check all past attendance records for students assigned to THIS location against the current coordinates. Proceed?"
            : "This will re-check attendance records matching your current FILTERS against their assigned coordinates. Proceed?";
        
        if (!window.confirm(confirmMsg)) return;

        const toastId = toast.loading('Re-validating attendance records...');
        try {
            const payload = locationId ? { locationId } : { ...filters };
            // Ensure dates are present for filter-based re-validation
            if (!payload.startDate) payload.startDate = '2024-01-01'; // Default start of academic year or similar
            if (!payload.endDate) payload.endDate = new Date().toISOString().split('T')[0];

            const res = await api.post('/internship/re-validate-attendance', payload);
            if (res.data.success) {
                toast.success(res.data.message, { id: toastId });
                if (activeTab === 'report') fetchReport();
                if (activeTab === 'period-report') fetchPeriodReport();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Re-validation failed', { id: toastId });
        }
    };

    const fetchStudentsForAssignment = async () => {
        try {
            setLoadingStudents(true);
            // Changed to use the new eligible-students endpoint
            const res = await api.get('/internship/eligible-students', { params: { ...filters } });
            if (res.data.success) {
                const students = res.data.data.map(r => ({
                    id: r.id,
                    name: r.student_name,
                    batch: r.batch,
                    branch: r.branch,
                    year: r.current_year,
                    semester: r.current_semester,
                    currentCompany: r.current_company,
                    currentStartDate: r.current_start_date,
                    currentEndDate: r.current_end_date
                }));
                setAvailableStudents(students);
                setSelectedStudentIds([]); // Reset selection

                const assignedCount = students.filter(s => s.currentCompany).length;
                if (assignedCount > 0) {
                    toast(`${assignedCount} students are currently assigned to an internship.`, {
                        icon: '⚠️',
                        duration: 5000,
                    });
                }

                if (students.length === 0) toast('No students found with these filters');
            }
        } catch (error) {
            toast.error('Failed to fetch students');
        } finally {
            setLoadingStudents(false);
        }
    };

    // Handle Address Search with Debounce
    useEffect(() => {
        const delaySearch = setTimeout(async () => {
            if (searchQuery.length > 2) {
                try {
                    // Enhanced search: prioritize AP with bounds but allowing external results if better match
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&extratags=1&namedetails=1&limit=10&countrycodes=in&viewbox=76.76,12.62,84.77,19.92`);
                    const data = await response.json();
                    setSuggestions(data);
                    setShowSuggestions(true);
                } catch (error) {
                    console.error("Search failed", error);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 500);

        return () => clearTimeout(delaySearch);
    }, [searchQuery]);

    const handleSelectLocation = (place) => {
        const { lat, lon, display_name } = place;
        const newLat = parseFloat(lat);
        const newLon = parseFloat(lon);

        const placeName = display_name.split(',')[0];

        setFormData(prev => ({
            ...prev,
            latitude: newLat,
            longitude: newLon,
            address: display_name,
            companyName: placeName // Auto-fill Company Name
        }));
        setMapCenter([newLat, newLon]);
        setSearchQuery(placeName);
        setShowSuggestions(false);
        const placeType = place.type ? place.type.replace('_', ' ') : 'Location';
        toast.success(`Selected: ${placeType}`);
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
    }

    // Fetch Report with Filters
    useEffect(() => {
        if (activeTab === 'report') {
            fetchReport();
        }
    }, [activeTab, filters]); // Fetch initially, and when active tab or filters change

    // periodically refresh report while tab is open
    useEffect(() => {
        if (activeTab !== 'report') return;
        const interval = setInterval(() => {
            fetchReport();
        }, 60 * 1000); // every minute
        return () => clearInterval(interval);
    }, [activeTab, filters]);

    const fetchReport = async () => {
        try {
            setLoadingReport(true);
            const res = await api.get('/internship/report', { params: { ...filters } });
            if (res.data.success) {
                const nowDate = new Date();
                const nowTime = nowDate.getHours().toString().padStart(2, '0') + ':' + nowDate.getMinutes().toString().padStart(2, '0');
                const today = new Date().toISOString().split('T')[0];
                const updated = res.data.data.map(r => {
                    if (r.status === 'Not Marked' && r.date && r.date.split('T')[0] === today) {
                        const allowed = r.internshipId?.allowedEndTime;
                        if (allowed && nowTime > allowed) {
                            return { ...r, status: 'Absent' };
                        }
                    }
                    return r;
                });
                setReportData(updated);
            }
        } catch (error) {
            toast.error('Failed to fetch report');
        } finally {
            setLoadingReport(false);
        }
    };
    
    const getAbstractPeriodData = (data) => {
        if (!data || data.length === 0) return [];
        const groups = {};
        data.forEach(student => {
            const key = `${student.college}|${student.batch}|${student.course}|${student.branch}|${student.year}|${student.semester}`;
            if (!groups[key]) {
                groups[key] = {
                    college: student.college,
                    batch: student.batch,
                    course: student.course,
                    branch: student.branch,
                    year: student.year,
                    semester: student.semester,
                    studentCount: 0,
                    totalDays: 0,
                    presentDays: 0,
                    absentDays: 0,
                    notMarked: 0
                };
            }
            groups[key].studentCount++;
            groups[key].totalDays += student.totalDays || 0;
            groups[key].presentDays += student.presentDays || 0;
            groups[key].absentDays += student.absentDays || 0;
            groups[key].notMarked += student.notMarked || 0;
        });

        return Object.values(groups).map(g => ({
            ...g,
            avgWorkingDays: parseFloat((g.totalDays / g.studentCount).toFixed(1)),
            attendancePercentage: g.totalDays > 0 ? parseFloat(((g.presentDays / g.totalDays) * 100).toFixed(2)) : 0
        }));
    };

    const getPeriodDates = (data) => {
        if (!data || data.length === 0) return [];
        // Extract all unique dates from all students' dayBreakdowns
        const allDates = new Set();
        data.forEach(s => {
            s.dayBreakdown?.forEach(d => allDates.add(d.date));
        });
        return Array.from(allDates).sort();
    };

    // ── Period Report handlers ────────────────────────────────────────────────
    const fetchPeriodReport = async () => {
        try {
            setPeriodReportLoading(true);
            const res = await api.get('/internship/period-report', { params: { ...periodFilters } });
            if (res.data.success) setPeriodReport(res.data.data);
        } catch (error) {
            toast.error('Failed to fetch period report');
        } finally {
            setPeriodReportLoading(false);
        }
    };

    const fetchPeriodFilterOptions = async () => {
        try {
            const res = await api.get('/internship/filters');
            if (res.data.success) setPeriodFilterOptions(prev => ({ ...prev, ...res.data.data }));
        } catch (e) { /* ignore */ }
    };

    useEffect(() => {
        if (activeTab === 'period-report') {
            fetchPeriodFilterOptions();
            fetchPeriodReport();
        }
    }, [activeTab, periodFilters]);

    const toggleRow = (id) => setExpandedRows(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // Inline date-cell attendance marking from Period Report calendar
    const handleCellMark = async (row, day, currentStatus) => {
        // Validation: Verify if marking rights exist in DB for this date/location/batch
        const isUnlocked = activeRights.some(r => 
            r.date === day.date && 
            String(r.internship_id) === String(row.internshipId) &&
            String(r.batch) === String(row.batch)
        );

        if (!isUnlocked) {
            toast.error(`Editing is locked for ${day.date}. Please 'Grant Rights' via the Backdate Marking tab first.`);
            return;
        }

        const statusToSave = currentStatus === 'Present' ? 'Absent' : 'Present';
        const cellKey = `${row.assignmentId}-${day.date}`;
        setMarkingCell(cellKey);
        try {
            await api.post('/internship/manual-attendance', {
                student_id: row.studentId,
                attendance_date: day.date,
                status: statusToSave,
                reason: 'Marked via Period Report by admin'
            });
            // Update local state
            setPeriodReport(prev => prev.map(r => {
                if (r.assignmentId !== row.assignmentId) return r;
                const newBreakdown = r.dayBreakdown.map(d =>
                    d.date === day.date
                        ? { ...d, status: statusToSave, source: 'internship', isManual: true, markedByName: user?.name || 'Admin' }
                        : d
                );
                const totalDays   = newBreakdown.filter(d => d.status !== 'Holiday').length;
                const presentDays = newBreakdown.filter(d => d.status === 'Present').length;
                const absentDays  = newBreakdown.filter(d => d.status === 'Absent').length;
                const notMarked   = newBreakdown.filter(d => d.status === 'Not Marked').length;
                const pct = totalDays > 0 ? parseFloat(((presentDays / totalDays) * 100).toFixed(2)) : 0;
                return { ...r, dayBreakdown: newBreakdown, totalDays, presentDays, absentDays, notMarked, attendancePercentage: pct };
            }));
            toast.success(`Marked ${statusToSave}`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to mark attendance');
        } finally {
            setMarkingCell(null);
        }
    };

    const handleDownloadPeriodReport = async () => {
        try {
            const XLSX = (await import('xlsx')).default;
            const wb = XLSX.utils.book_new();
            const rows = [
                ['Student Name', 'Admission No', 'Company', 'Start Date', 'End Date', 'Total Days', 'Present', 'Absent', 'Not Marked', '%'],
                ...periodReport.map(r => [r.studentName, r.admissionNumber, r.companyName, r.startDate, r.endDate, r.totalDays, r.presentDays, r.absentDays, r.notMarked, r.attendancePercentage])
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Period Report');
            XLSX.writeFile(wb, `internship_period_report.xlsx`);
            toast.success('Downloaded');
        } catch (e) {
            toast.error('Download failed');
        }
    };

    // ── Backdate Marking handlers (new workflow) ──────────────────────────────
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const bdLoadCalendar = (explicitLocation, explicitBatch, explicitFrom, explicitTo) => {
        const locId = explicitLocation || bdInternship;
        const batch = explicitBatch !== undefined ? explicitBatch : bdBatch;
        let from  = explicitFrom || bdFromDate;
        let to    = explicitTo   || bdToDate;

        if (!locId) { toast.error('Select an internship'); return; }
        
        const intObj = periodFilterOptions.locations?.find(l => String(l.id) === String(locId));
        
        if (!from || !to) {
             if (intObj?.startDate && intObj?.endDate) {
                 from = intObj.startDate;
                 to = intObj.endDate;
                 setBdFromDate(from);
                 setBdToDate(to);
             } else {
                 toast.error('Select a date range'); 
                 return;
             }
        }

        if (from > to) { toast.error('From date must be before To date'); return; }

        // Find the internship's allowedDays
        let allowedDayNums = new Set([1, 2, 3, 4, 5, 6]); // default Mon-Sat
        if (intObj?.allowed_days) {
            try {
                const days = typeof intObj.allowed_days === 'string' ? JSON.parse(intObj.allowed_days) : intObj.allowed_days;
                const nm = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
                if (Array.isArray(days) && days.length > 0) allowedDayNums = new Set(days.map(d => nm[d]).filter(n => n !== undefined));
            } catch (_) {}
        }

        // Enumerate dates in range
        const dates = [];
        const cur = new Date(from + 'T00:00:00');
        const end = new Date(to   + 'T00:00:00');
        const today = new Date(); today.setHours(23, 59, 59, 999);
        while (cur <= end) {
            const dateStr = cur.toISOString().split('T')[0];
            dates.push({
                date: dateStr,
                dayNum: cur.getDay(),
                dayName: DAY_NAMES[cur.getDay()],
                isWorkingDay: allowedDayNums.has(cur.getDay()),
                isPast: cur <= today
            });
            cur.setDate(cur.getDate() + 1);
        }
        setBdWorkingDates(dates);
        setBdActiveDate('');
        setBdPhase(2);
    };

    const handleActiveGroupSelect = (group) => {
        setBdInternship(group.location_id);
        setBdBatch(group.batch);
        setBdFromDate(group.start_date.split('T')[0]);
        setBdToDate(group.end_date.split('T')[0]);
        
        // Trigger calendar load with the values immediately
        bdLoadCalendar(group.location_id, group.batch, group.start_date.split('T')[0], group.end_date.split('T')[0]);
    };

    const handleGrantRights = async () => {
        if (!bdActiveDate) { toast.error("Select a date from the grid first"); return; }
        
        try {
            setBdSaving(true);
            const res = await api.post('/internship/grant-backdate-rights', {
                internship_id: bdInternship,
                batch: bdBatch,
                date: bdActiveDate
            });

            if (res.data.success) {
                toast.success("Marking rights granted and stored in database.");
                await fetchActiveRights();
                
                // Pre-fill period filters
                const newFilters = {
                    ...periodFilters,
                    location: bdInternship,
                    batch: bdBatch
                };
                setPeriodFilters(newFilters);
                
                setActiveTab('period-report');
            }
        } catch (error) {
            console.error("Grant rights error", error);
            toast.error(error.response?.data?.message || "Failed to grant marking rights");
        } finally {
            setBdSaving(false);
        }
    };

    const bdSelectDate = async (date) => {
        if (bdActiveDate === date) { setBdActiveDate(''); setBdStudents([]); return; }
        setBdActiveDate(date);
        setBdChanges({});
        setBdReason('');
        try {
            setBdStudentsLoading(true);
            const res = await api.get('/internship/students-for-date', {
                params: { date, location: bdInternship, batch: bdBatch, branch: bdBranch }
            });
            if (res.data.success) setBdStudents(res.data.data);
        } catch (e) {
            toast.error('Failed to load students');
        } finally {
            setBdStudentsLoading(false);
        }
    };

    const bdSetStatus = (studentId, status) => setBdChanges(prev => ({ ...prev, [studentId]: status }));

    const bdBulkMark = (status) => {
        const changes = {};
        bdStudents.forEach(s => { changes[s.studentId] = status; });
        setBdChanges(changes);
    };

    const bdSubmit = async () => {
        if (!bdReason.trim() || bdReason.trim().length < 5) { toast.error('Enter a reason (min 5 chars)'); return; }
        const entries = Object.entries(bdChanges);
        if (entries.length === 0) { toast.error('No changes to submit'); return; }
        try {
            setBdSaving(true);
            let ok = 0, fail = 0;
            for (const [student_id, status] of entries) {
                try {
                    await api.post('/internship/manual-attendance', {
                        student_id: Number(student_id),
                        attendance_date: bdActiveDate,
                        status,
                        reason: bdReason.trim()
                    });
                    ok++;
                } catch (e) { fail++; }
            }
            toast.success(`Saved ${ok} record(s)${fail > 0 ? `, ${fail} failed` : ''}`);
            setBdChanges({});
            setBdReason('');
            bdSelectDate(bdActiveDate); // Refresh students for this date
            if (showAuditLog) fetchAuditLog();
        } catch (e) {
            toast.error('Failed to save');
        } finally {
            setBdSaving(false);
        }
    };


    const fetchAuditLog = async () => {
        try {
            setAuditLoading(true);
            const res = await api.get('/internship/audit-log', { params: { limit: 50 } });
            if (res.data.success) setAuditLog(res.data.data);
        } catch (e) {
            toast.error('Failed to load audit log');
        } finally {
            setAuditLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'period-report') {
            fetchPeriodFilterOptions();
            fetchPeriodReport();
        }
        if (activeTab === 'backdate' && isSuperAdmin) {
            fetchPeriodFilterOptions(); // reuse
        }
    }, [activeTab]);

    useEffect(() => {
        if (showAuditLog) fetchAuditLog();
    }, [showAuditLog]);

    const handleDayEndReport = async () => {
        if (dayEndReportOpen) return;
        setDayEndReportLoading(true);
        try {
            const params = {
                date: new Date().toISOString().split('T')[0], // Default to today
                ...filters
            };
            // Remove empty filters
            Object.keys(params).forEach(key => {
                if (params[key] === '' || params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            const res = await api.get('/internship/day-end-report', { params });
            if (res.data.success) {
                setDayEndReportData(res.data.data);
                setDayEndReportOpen(true);
            }
        } catch (error) {
            toast.error('Failed to fetch day end report');
        } finally {
            setDayEndReportLoading(false);
        }
    };

    const handleDayEndDownload = async (format = 'xlsx') => {
        try {
            const params = new URLSearchParams({
                date: dayEndReportData?.date || new Date().toISOString().split('T')[0],
                format,
                ...filters
            });
            // Remove empty filters from URLSearchParams
            Object.keys(filters).forEach(key => {
                if (!filters[key]) params.delete(key);
            });

            const response = await api.get(`/internship/day-end-download?${params.toString()}`, {
                responseType: 'blob'
            });

            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `internship_day_end_${params.get('date')}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);
            toast.success(`Downloaded ${format.toUpperCase()} report`);
        } catch (error) {
            console.error('Download report error:', error);
            toast.error('Unable to download report');
        }
    };


    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const res = await api.post('/internship/create', formData);
            if (res.data.success) {
                toast.success('Internship location created!');
                setFormData({
                    companyName: '',
                    address: '',
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    radius: 200,
                    allowedStartTime: '09:00',
                    allowedEndTime: '18:00'
                });
                fetchLocations(); // Refresh map
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create');
        } finally {
            setLoading(false);
        }
    };

    const toggleDay = (day) => {
        setAssignmentData(prev => {
            const days = prev.allowedDays.includes(day)
                ? prev.allowedDays.filter(d => d !== day)
                : [...prev.allowedDays, day];
            return { ...prev, allowedDays: days };
        });
    };

    const handleAssign = async (e, overwrite = false) => {
        if (e) e.preventDefault();
        try {
            if (!assignmentData.internshipId) {
                toast.error('Please select an internship location');
                return;
            }
            // If users fetched students, enforce selection
            if (availableStudents.length > 0 && selectedStudentIds.length === 0) {
                toast.error('Please select at least one student from the list, or clear the list to use bulk filters.');
                return;
            }
            // Prevent submitting if nothing is selected and no filters are applied
            const filtersApplied = filters && Object.values(filters).some(v => v !== '' && v !== null && v !== undefined);
            if (availableStudents.length === 0 && selectedStudentIds.length === 0 && !filtersApplied) {
                toast.error('No students selected and no filters provided.');
                return;
            }

            setLoading(true);
            const payload = {
                ...assignmentData,
                filters: filters,
                studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : null,
                overwrite: overwrite
            };
            const res = await api.post('/internship/assign', payload);
            if (res.data.success) {
                toast.success(res.data.message);
                setAvailableStudents([]); // Clear list after success
                setSelectedStudentIds([]);
                setConflictModalOpen(false); // Close modal if open
            }
        } catch (error) {
            // backend now returns 400 when no students match the provided filters/ids
            if (error.response?.status === 409 && error.response?.data?.conflicts) {
                setConflictData(error.response.data.conflicts);
                setConflictModalOpen(true);
                toast.error('Assignment conflicts detected');
            } else if (error.response?.status === 400) {
                toast.error(error.response?.data?.message || 'No students available for assignment');
            } else {
                toast.error(error.response?.data?.message || 'Assignment failed');
            }
        } finally {
            setLoading(false);
        }
    };

    // Duplicates removed

    const handleViewStudents = async (id, name) => {
        setCurrentInternshipName(name);
        setCurrentViewInternshipId(id);
        setViewStudentsModal(true);
        setViewStudentsLoading(true);
        setViewStudentsList([]); // Clear previous
        try {
            const res = await api.get(`/internship/${id}/students`);
            if (res.data.success) {
                setViewStudentsList(res.data.data);
            }
        } catch (error) {
            toast.error('Failed to fetch assigned students');
        } finally {
            setViewStudentsLoading(false);
        }
    };

    const handleEditClick = (student) => {
        setEditingAssignmentId(student.assignment_id);
        const days = typeof student.allowed_days === 'string' ? JSON.parse(student.allowed_days) : student.allowed_days;
        setEditFormData({
            assignmentId: student.assignment_id,
            internshipId: currentViewInternshipId,
            startDate: student.start_date.split('T')[0],
            endDate: student.end_date.split('T')[0],
            allowedDays: Array.isArray(days) ? days : []
        });
        setShowEditModal(true);
    };

    const handleUpdateAssignment = async (e) => {
        e.preventDefault();
        try {
            await api.put('/internship/assignment', editFormData);
            toast.success('Assignment updated successfully');
            setShowEditModal(false);
            setEditingAssignmentId(null);
            // Refresh list
            if (currentViewInternshipId) {
                const res = await api.get(`/internship/${currentViewInternshipId}/students`);
                if (res.data.success) setViewStudentsList(res.data.data);
            }
        } catch (error) {
            toast.error('Failed to update assignment');
        }
    };

    const handleDeleteAssignment = async (assignmentId) => {
        if (!window.confirm('Are you sure you want to remove this assignment? This cannot be undone.')) return;
        try {
            await api.delete(`/internship/assignment/${assignmentId}`);
            toast.success('Assignment removed successfully');
            // Refresh
            if (currentViewInternshipId) {
                const res = await api.get(`/internship/${currentViewInternshipId}/students`);
                if (res.data.success) setViewStudentsList(res.data.data);
            }
        } catch (error) {
            toast.error('Failed to remove assignment');
        }
    }

    const handleEditLocationClick = (location) => {
        setEditingLocation(location);
        setEditLocationForm({
            companyName: location.companyName,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
            radius: location.radius,
            allowedStartTime: location.allowedStartTime,
            allowedEndTime: location.allowedEndTime,
            isActive: location.isActive
        });
        setShowEditLocationModal(true);
    };

    const handleViewAttendance = async (record) => {
        const ref = record._id || record.id;
        // if this is a temporary row (no attendance yet), just inform user
        if (typeof ref === 'string' && ref.startsWith('temp-')) {
            const tempRec = { ...record, status: 'Not Marked' };
            setSelectedAttendance(tempRec);
            setViewAttendanceModal(true);
            // react-hot-toast doesn't provide toast.info, use default toast
            toast('Attendance has not been recorded for this student yet.');
            return;
        }
        setSelectedAttendance(record); // Show basic info first
        setViewAttendanceModal(true);
        try {
            const res = await api.get(`/internship/attendance-details/${ref}`);
            if (res.data.success) {
                setSelectedAttendance(res.data.data); // Update with full details (images)
            }
        } catch (error) {
            console.error("Failed to fetch details", error);
            toast.error("Failed to load full details");
        }
    };

    const handleUpdateLocation = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/internship/location/${editingLocation._id}`, editLocationForm);
            toast.success('Location updated successfully');
            setShowEditLocationModal(false);
            setEditingLocation(null);
            fetchLocations(); // Refresh list
        } catch (error) {
            toast.error('Failed to update location');
        }
    };

    const handleDeleteLocation = async (location) => {
        if (!window.confirm(`Are you sure you want to delete ${location.companyName}?`)) return;

        try {
            await api.delete(`/internship/location/${location._id}`);
            toast.success('Location deleted successfully');
            fetchLocations();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete location');
        }
    };


    const toggleEditDay = (day) => {
        setEditFormData(prev => {
            const days = prev.allowedDays.includes(day)
                ? prev.allowedDays.filter(d => d !== day)
                : [...prev.allowedDays, day];
            return { ...prev, allowedDays: days };
        });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedStudentIds(availableStudents.map(s => s.id));
        } else {
            setSelectedStudentIds([]);
        }
    };

    const handleSelectStudent = (id) => {
        setSelectedStudentIds(prev => {
            if (prev.includes(id)) return prev.filter(sid => sid !== id);
            return [...prev, id];
        });
    };

    const getUserLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setFormData(prev => ({ ...prev, latitude, longitude }));
                setMapCenter([latitude, longitude]);
                toast.success('Located you!');
            },
            () => toast.error('Unable to retrieve location')
        );
    };

    return (
        <div className="w-full px-4 md:px-6 lg:px-8 py-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Internship Management</h1>
                <p className="text-gray-600">Configure internship locations, view details, and monitor attendance.</p>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Create Location
                </button>
                <button
                    onClick={() => setActiveTab('assign')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'assign' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Assign Internship
                </button>
                <button
                    onClick={() => setActiveTab('locations')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'locations' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Saved Locations
                </button>
                <button
                    onClick={() => setActiveTab('report')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'report' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Daily Report
                </button>
                <button
                    onClick={() => setActiveTab('period-report')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'period-report' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <BarChart2 className="w-3.5 h-3.5" /> Period Report
                </button>
                {isSuperAdmin && (
                    <button
                        onClick={() => setActiveTab('backdate')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'backdate' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Backdate Marking
                    </button>
                )}
            </div>

            {activeTab === 'create' && (
                <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)] min-h-[600px]">
                    {/* Form Section */}
                    <div className="w-full lg:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-y-auto order-2 lg:order-1">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Details
                        </h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input type="text" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} placeholder="e.g. Google" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <textarea required className="w-full px-4 py-2 border rounded-lg outline-none" rows="2" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Radius (meters)</label>
                                <input type="number" required className="w-full px-4 py-2 border rounded-lg outline-none" value={formData.radius} onChange={e => setFormData({ ...formData, radius: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time (IST)</label>
                                    <input type="time" required className="w-full px-4 py-2 border rounded-lg outline-none" value={formData.allowedStartTime} onChange={e => setFormData({ ...formData, allowedStartTime: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time (IST)</label>
                                    <input type="time" required className="w-full px-4 py-2 border rounded-lg outline-none" value={formData.allowedEndTime} onChange={e => setFormData({ ...formData, allowedEndTime: e.target.value })} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Check-in: from 15 minutes before until 15 minutes after the check-in time. Check-out: from the check-out time until 15 minutes after (all IST).</p>

                            <button type="submit" disabled={loading} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg">{loading ? 'Creating...' : 'Create Location'}</button>
                        </form>
                    </div>

                    {/* Map Section */}
                    <div className="w-full lg:w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative z-0 order-1 lg:order-2">
                        {/* Search Bar Overlay */}
                        <div className="absolute top-4 left-4 right-14 md:left-4 md:w-96 z-[1000]">
                            <div className="relative shadow-xl rounded-lg bg-white">
                                <div className="flex items-center px-4 py-3">
                                    <Search className="w-5 h-5 text-gray-400 mr-3" />
                                    <input
                                        type="text"
                                        className="w-full bg-transparent border-none outline-none text-gray-900 placeholder-gray-500 font-medium"
                                        placeholder="Search 'Medicover Kakinada' or address"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                    />
                                    {searchQuery && (
                                        <button onClick={clearSearch} className="p-1 hover:bg-gray-100 rounded-full">
                                            <X className="w-5 h-5 text-gray-500" />
                                        </button>
                                    )}
                                    <div className="w-px h-6 bg-gray-300 mx-3"></div>
                                    <button onClick={getUserLocation} className="p-1 hover:bg-gray-100 rounded-full text-blue-600" title="My Location">
                                        <Navigation className="w-5 h-5 fill-current" />
                                    </button>
                                </div>
                            </div>

                            {/* Suggestions List */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="mt-2 bg-white rounded-lg shadow-xl border border-gray-100 max-h-[60vh] overflow-y-auto"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {suggestions.map((place, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors flex items-start gap-3 group"
                                            onClick={() => handleSelectLocation(place)}
                                        >
                                            <div className="mt-1 min-w-[20px] flex justify-center">
                                                <MapPin className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                                            </div>
                                            <div className="overflow-hidden">
                                                <span className="block font-medium text-gray-900 text-sm truncate">{place.display_name.split(',')[0]}</span>
                                                <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mt-0.5">
                                                    <span className="font-semibold text-orange-600 uppercase tracking-wider text-[10px]">{place.type?.replace(/_/g, ' ')}</span>
                                                    <span>•</span>
                                                    <span className="truncate">{place.display_name.split(',').slice(1).join(', ')}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
                            <LayersControl position="topright">
                                <LayersControl.BaseLayer checked name="Satellite (Google Hybrid)">
                                    <TileLayer
                                        url="http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                                        maxZoom={20}
                                        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Street (OpenStreetMap)">
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    />
                                </LayersControl.BaseLayer>
                            </LayersControl>

                            <MapClickHandler onLocationSelect={handleLocationSelect} />
                            <MapFlyTo coords={mapCenter} />

                            {/* Saved Locations Markers (Green) */}
                            {locations.map((loc, idx) => (
                                <Marker
                                    key={`saved-${idx}`}
                                    position={[loc.latitude, loc.longitude]}
                                    icon={SavedLocationIcon}
                                >
                                    <Popup>
                                        <strong>{loc.companyName}</strong> <br />
                                        <span className="text-xs">{loc.address}</span>
                                    </Popup>
                                </Marker>
                            ))}

                            {/* Search Result Markers (Red) */}
                            {suggestions.map((place, idx) => (
                                <Marker
                                    key={`suggestion-${idx}`}
                                    position={[parseFloat(place.lat), parseFloat(place.lon)]}
                                    icon={SearchResultIcon}
                                    eventHandlers={{
                                        click: () => handleSelectLocation(place),
                                    }}
                                >
                                    <Popup>
                                        <strong>{place.display_name.split(',')[0]}</strong> <br />
                                        <span className="capitalize text-xs">{place.type?.replace('_', ' ')}</span>
                                    </Popup>
                                </Marker>
                            ))}

                            {/* Selected Location Marker (Current Selection) */}
                            <Marker position={[formData.latitude, formData.longitude]}>
                                <Popup>
                                    <div className="text-center">
                                        <strong className="block text-indigo-600 mb-1">Selected Location</strong>
                                        {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                                    </div>
                                </Popup>
                            </Marker>
                        </MapContainer>
                    </div>
                </div>
            )}

            {activeTab === 'assign' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-indigo-600" /> Assign Internship to Students
                    </h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <Filter className="w-4 h-4" /> 1. Select Students (Filters)
                            </h3>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.batch} onChange={e => handleFilterChange('batch', e.target.value)}>
                                        <option value="">All Batches</option>
                                        {[...new Set(filterOptions.batches || [])].map((b) => <option key={`assign-batch-${b}`} value={b.id || b}>{b.name || b}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.college} onChange={e => handleFilterChange('college', e.target.value)}>
                                        <option value="">All Colleges</option>
                                        {[...new Map((filterOptions.colleges || []).map(c => [c.id || c, c])).values()].map(c => <option key={`assign-col-${c.id || c}`} value={c.name || c}>{c.name || c}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.course} onChange={e => handleFilterChange('course', e.target.value)}>
                                        <option value="">All Courses</option>
                                        {[...new Set(filterOptions.courses || [])].map((c) => <option key={`assign-course-${c}`} value={c.id || c}>{c.name || c}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.branch} onChange={e => handleFilterChange('branch', e.target.value)}>
                                        <option value="">All Branches</option>
                                        {[...new Set(filterOptions.branches || [])].map((b) => <option key={`assign-branch-${b}`} value={b.id || b}>{b.name || b}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.year} onChange={e => handleFilterChange('year', e.target.value)}>
                                        <option value="">All Years</option>
                                        {[...new Set(filterOptions.years || [])].map((y) => <option key={`assign-year-${y}`} value={y.id || y}>{y.name || y}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.semester} onChange={e => handleFilterChange('semester', e.target.value)}>
                                        <option value="">All Semesters</option>
                                        {[...new Set(filterOptions.semesters || [])].map((s) => <option key={`assign-sem-${s}`} value={s.id || s}>{s.name || s}</option>)}
                                    </select>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500">
                                    <span>Select criteria to target specific students.</span>
                                    <button onClick={clearFilters} className="text-indigo-600 hover:underline">Clear Filters</button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <button
                                    onClick={fetchStudentsForAssignment}
                                    disabled={loadingStudents}
                                    className="w-full py-2 bg-white border border-indigo-600 text-indigo-600 font-medium rounded-lg hover:bg-indigo-50 flex justify-center items-center gap-2"
                                >
                                    {loadingStudents ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
                                    Load Students for Selection
                                </button>
                            </div>

                            {/* Student List Table */}
                            {availableStudents.length > 0 && (
                                <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="p-3 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                                        <span className="text-xs font-semibold text-gray-700">{selectedStudentIds.length} Selected</span>
                                        <button onClick={() => setAvailableStudents([])} className="text-xs text-red-600 hover:underline">Clear List</button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-100 text-gray-600 font-medium sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-2 w-10">
                                                        <input
                                                            type="checkbox"
                                                            onChange={handleSelectAll}
                                                            checked={availableStudents.length > 0 && selectedStudentIds.length === availableStudents.length}
                                                        />
                                                    </th>
                                                    <th className="px-4 py-2">Name / Admission No.</th>
                                                    <th className="px-4 py-2">Branch / Batch</th>
                                                    <th className="px-4 py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 bg-white">
                                                {availableStudents.map(student => (
                                                    <tr key={student.id} className={`hover:bg-gray-50 ${student.currentCompany ? 'bg-yellow-50' : ''}`}>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedStudentIds.includes(student.id)}
                                                                onChange={() => handleSelectStudent(student.id)}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <div className="font-medium text-gray-900">{student.name}</div>
                                                            <div className="text-xs text-gray-500">{student.admission_number || student.id}</div>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs text-gray-600">
                                                            <div>{student.batch} - {student.branch}</div>
                                                            <div>{student.year}-{student.semester}</div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            {student.currentCompany ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                    At {student.currentCompany}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                                    Available
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <Target className="w-4 h-4" /> 2. Assignment Details
                            </h3>
                            <form onSubmit={handleAssign} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Internship Location</label>
                                    <select
                                        required
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={assignmentData.internshipId}
                                        onChange={e => setAssignmentData({ ...assignmentData, internshipId: e.target.value })}
                                    >
                                        <option value="">-- Select Location --</option>
                                        {locations.map(loc => (
                                            <option key={loc._id} value={loc._id}>
                                                {loc.companyName} ({loc.address})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full px-4 py-2 border rounded-lg outline-none"
                                            value={assignmentData.startDate}
                                            onChange={e => setAssignmentData({ ...assignmentData, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full px-4 py-2 border rounded-lg outline-none"
                                            value={assignmentData.endDate}
                                            onChange={e => setAssignmentData({ ...assignmentData, endDate: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Days</label>
                                    <div className="flex flex-wrap gap-2">
                                        {WEEKDAYS.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleDay(day)}
                                                className={`px-3 py-1 text-sm rounded-full border transition-all ${assignmentData.allowedDays.includes(day)
                                                    ? 'bg-indigo-100 border-indigo-200 text-indigo-700 font-medium'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {day}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm flex justify-center items-center gap-2"
                                    >
                                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {loading ? 'Assigning...' : 'Assign Internship'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'locations' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <List className="w-5 h-5 text-indigo-600" /> Saved Locations
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium">
                                <tr>
                                    <th className="px-6 py-3">Company Name</th>
                                    <th className="px-6 py-3">Address</th>
                                    <th className="px-6 py-3">Coordinates</th>
                                    <th className="px-6 py-3">Radius</th>
                                    <th className="px-6 py-3">Allowed Time</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {locations.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-gray-500">No saved locations found</td></tr>
                                ) : (
                                    locations.map((loc) => (
                                        <tr key={loc._id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">{loc.companyName}</td>
                                            <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={loc.address}>{loc.address}</td>
                                            <td className="px-6 py-4 text-gray-500">{loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</td>
                                            <td className="px-6 py-4 text-gray-500">{loc.radius}m</td>
                                            <td className="px-6 py-4 text-gray-600">{loc.allowedStartTime} - {loc.allowedEndTime}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${loc.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {loc.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 flex gap-2">
                                                <button
                                                    onClick={() => handleViewStudents(loc._id, loc.companyName)}
                                                    className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 text-xs font-medium bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-200"
                                                >
                                                    <Users className="w-3.5 h-3.5" /> View Students
                                                </button>
                                                <button
                                                    onClick={() => handleEditLocationClick(loc)}
                                                    className="text-blue-600 hover:text-blue-900 flex items-center gap-1 text-xs font-medium bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200"
                                                >
                                                    <Pen className="w-3.5 h-3.5" /> Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLocation(loc)}
                                                    className="text-red-600 hover:text-red-900 flex items-center gap-1 text-xs font-medium bg-red-50 px-3 py-1.5 rounded-md border border-red-200"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                                </button>
                                                <button
                                                    onClick={() => handleRevalidateAttendance(loc._id)}
                                                    className="text-amber-600 hover:text-amber-900 flex items-center gap-1 text-xs font-medium bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200"
                                                    title="Re-validate all past records for this location"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" /> Re-validate
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'report' && (
                <div className="space-y-6">
                    {/* Filters Section */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Filter className="w-4 h-4" /> Filter Attendance
                        </h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-500">Date:</label>
                                <input 
                                    type="date" 
                                    className="border rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={filters.startDate}
                                    onChange={e => {
                                        const newDate = e.target.value;
                                        setFilters(prev => ({ ...prev, startDate: newDate, endDate: newDate }));
                                    }}
                                />
                            </div>
                            
                            <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>

                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.location} onChange={e => handleFilterChange('location', e.target.value)}>
                                <option value="">All Locations</option>
                                {filterOptions.locations?.map(loc => <option key={`report-loc-${loc.id}`} value={loc.id}>{loc.companyName}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.batch} onChange={e => handleFilterChange('batch', e.target.value)}>
                                <option value="">All Batches</option>
                                {[...new Set(filterOptions.batches || [])].map((b) => <option key={`report-batch-${b}`} value={b.id || b}>{b.name || b}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.college} onChange={e => handleFilterChange('college', e.target.value)}>
                                <option value="">All Colleges</option>
                                {/* Usually college options might need ID vs Name handling. Assuming Name based on common pattern */}
                                {[...new Map((filterOptions.colleges || []).map(c => [c.id || c, c])).values()].map(c => <option key={`report-col-${c.id || c}`} value={c.name || c}>{c.name || c}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.course} onChange={e => handleFilterChange('course', e.target.value)}>
                                <option value="">All Courses</option>
                                {[...new Set(filterOptions.courses || [])].map((c) => <option key={`report-course-${c}`} value={c.id || c}>{c.name || c}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.branch} onChange={e => handleFilterChange('branch', e.target.value)}>
                                <option value="">All Branches</option>
                                {[...new Set(filterOptions.branches || [])].map((b) => <option key={`report-branch-${b}`} value={b.id || b}>{b.name || b}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.year} onChange={e => handleFilterChange('year', e.target.value)}>
                                <option value="">All Years</option>
                                {[...new Set(filterOptions.years || [])].map((y) => <option key={`report-year-${y}`} value={y.id || y}>{y.name || y}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.semester} onChange={e => handleFilterChange('semester', e.target.value)}>
                                <option value="">All Semesters</option>
                                {[...new Set(filterOptions.semesters || [])].map((s) => <option key={`report-sem-${s}`} value={s.id || s}>{s.name || s}</option>)}
                            </select>

                            <button
                                onClick={handleDayEndReport}
                                disabled={dayEndReportLoading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-indigo-700 shadow-sm whitespace-nowrap ml-auto sm:ml-0 transition-all font-bold"
                            >
                                {dayEndReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                Day End Report
                            </button>
                            <button
                                onClick={() => handleRevalidateAttendance()}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-100 shadow-sm whitespace-nowrap transition-all font-bold"
                                title="Re-check records in this report against assigned location coordinates"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Re-validate Listed
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Target className="w-5 h-5 text-indigo-600" /> Recent Attendance
                            </h2>
                            <button onClick={fetchReport} className="text-sm text-indigo-600 hover:underline">Refresh</button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Student</th>
                                        <th className="px-4 py-3">Class Info</th>
                                        <th className="px-4 py-3">Location</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Check In</th>
                                        <th className="px-4 py-3">Check Out</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Risk</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loadingReport ? (
                                        <tr><td colSpan="8" className="text-center py-8 text-gray-500">Loading...</td></tr>
                                    ) : reportData.length === 0 ? (
                                        <tr><td colSpan="8" className="text-center py-8 text-gray-500">No records found</td></tr>
                                    ) : (
                                        reportData.map((record) => (
                                            <tr key={record._id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{record.studentDetails?.name || record.studentId}</div>
                                                    <div className="text-xs text-gray-500">{record.studentId}</div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-600">
                                                    <div>{record.studentDetails?.course} - {record.studentDetails?.branch}</div>
                                                    <div>{record.studentDetails?.batch} • Year {record.studentDetails?.year}</div>
                                                </td>
                                                <td className="px-4 py-3">{record.internshipId?.companyName || 'Unknown'}</td>
                                                <td className="px-4 py-3 text-gray-500">
                                                    {new Date(record.date).toLocaleDateString()}
                                                </td>
                                                <td className="px-4 py-3 text-green-700">
                                                    {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-blue-700">
                                                    {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                                ${record.status === 'Present' ? 'bg-green-100 text-green-700' :
                                                            record.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                                'bg-yellow-100 text-yellow-700'}`}>
                                                        {record.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {record.isSuspicious && (
                                                        <span title={record.suspiciousReason} className="flex items-center gap-1 text-red-600">
                                                            <AlertTriangle className="w-4 h-4" /> Risk
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => handleViewAttendance(record)}
                                                        className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 p-2 rounded-full transition-colors"
                                                        title="View Details"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Period Report Tab ──────────────────────────────────────────────────── */}
            {activeTab === 'period-report' && (
                <div className="space-y-6">
                    {/* Filters */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex flex-wrap gap-3 items-end">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                                <select className="px-3 py-1.5 border rounded-lg text-sm outline-none" value={periodFilters.location} onChange={e => setPeriodFilters(f => ({ ...f, location: e.target.value }))}>
                                    <option value="">All Companies</option>
                                    {periodFilterOptions.locations?.map(l => <option key={l.id} value={l.id}>{l.companyName}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Batch</label>
                                <select className="px-3 py-1.5 border rounded-lg text-sm outline-none" value={periodFilters.batch} onChange={e => setPeriodFilters(f => ({ ...f, batch: e.target.value }))}>
                                    <option value="">All</option>
                                    {periodFilterOptions.batches?.map((b) => <option key={b} value={b.id || b}>{b.name || b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">College</label>
                                <select className="px-3 py-1.5 border rounded-lg text-sm outline-none" value={periodFilters.college} onChange={e => setPeriodFilters(f => ({ ...f, college: e.target.value }))}>
                                    <option value="">All</option>
                                    {periodFilterOptions.colleges?.map((c) => <option key={c} value={c.id || c}>{c.name || c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Course</label>
                                <select className="px-3 py-1.5 border rounded-lg text-sm outline-none" value={periodFilters.course} onChange={e => setPeriodFilters(f => ({ ...f, course: e.target.value }))}>
                                    <option value="">All</option>
                                    {periodFilterOptions.courses?.map((c) => <option key={c} value={c.id || c}>{c.name || c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                                <select className="px-3 py-1.5 border rounded-lg text-sm outline-none" value={periodFilters.branch} onChange={e => setPeriodFilters(f => ({ ...f, branch: e.target.value }))}>
                                    <option value="">All</option>
                                    {periodFilterOptions.branches?.map((b) => <option key={b} value={b.id || b}>{b.name || b}</option>)}
                                </select>
                            </div>
                            <button onClick={fetchPeriodReport} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5">
                                {periodReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} Apply
                            </button>
                            <button onClick={() => { setPeriodFilters({ location:'',batch:'',college:'',course:'',branch:'',year:'',semester:'' }); }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Clear</button>
                            {periodReport.length > 0 && (
                                <button onClick={handleDownloadPeriodReport} className="ml-auto px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5">
                                    <Download className="w-4 h-4" /> Download Excel
                                </button>
                            )}
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                        <button 
                            onClick={() => setPeriodViewMode('detailed')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodViewMode === 'detailed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Detailed List
                        </button>
                        <button 
                            onClick={() => setPeriodViewMode('abstract')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodViewMode === 'abstract' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Abstract Summary
                        </button>
                        <button 
                            onClick={() => setPeriodViewMode('grid')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Attendance Grid
                        </button>
                    </div>


                    {/* Report Table */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {periodReportLoading ? (
                            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
                        ) : periodReport.length === 0 ? (
                            <div className="py-16 text-center text-gray-400">
                                <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>No data found. Apply filters and click Apply.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                {periodViewMode === 'detailed' && (
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Start Date</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">End Date</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Days</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">Present</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-red-500 uppercase">Absent</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Not Marked</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">%</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {periodReport.map(row => {
                                                const isExpanded = expandedRows.has(row.assignmentId);
                                                return (
                                                <React.Fragment key={row.assignmentId}>
                                                    <tr className="hover:bg-indigo-50 transition-colors cursor-pointer"
                                                        onClick={() => toggleRow(row.assignmentId)}>
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900 flex items-center gap-1">
                                                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
                                                                {row.studentName}
                                                            </div>
                                                            <div className="text-xs text-gray-400 ml-5">{row.admissionNumber} • {row.branch}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-gray-700 text-sm">{row.companyName}</div>
                                                            <div className="text-xs text-gray-400">{row.allowedDays?.join(', ')}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-600 text-sm">{row.startDate}</td>
                                                        <td className="px-4 py-3 text-gray-600 text-sm">{row.endDate}</td>
                                                        <td className="px-4 py-3 text-center text-sm font-medium">{row.totalDays}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">{row.presentDays}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-semibold">{row.absentDays}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">{row.notMarked}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${row.attendancePercentage >= 75 ? 'bg-green-100 text-green-700' : row.attendancePercentage >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                                {row.attendancePercentage}%
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-gray-400 text-xs">
                                                            {isExpanded ? '▲' : '▼'}
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr key={`${row.assignmentId}-expanded`}>
                                                            <td colSpan={10} className="bg-gray-50 border-b border-gray-200 p-0">
                                                                <div className="px-6 py-5">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="text-sm font-semibold text-gray-700">Attendance Calendar — {row.studentName}</div>
                                                                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-400 rounded-sm inline-block" /> Present</span>
                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-400 rounded-sm inline-block" /> Absent</span>
                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gray-200 rounded-sm inline-block" /> Not Marked</span>
                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-200 rounded-sm inline-block" /> Holiday</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid gap-1.5" style={{gridTemplateColumns:'repeat(auto-fill,minmax(60px,1fr))'}}>
                                                                        {row.dayBreakdown.map(day => {
                                                                            const dt = new Date(day.date + 'T00:00:00');
                                                                            const dayName = dt.toLocaleDateString('en-US',{weekday:'short'});
                                                                            const isPresent  = day.status === 'Present';
                                                                            const isAbsent   = day.status === 'Absent';
                                                                            const isHoliday  = day.status === 'Holiday';
                                                                            const cellBase = isPresent ? 'bg-green-100 border-green-300 text-green-800' : isAbsent  ? 'bg-red-100 border-red-300 text-red-700' : isHoliday ? 'bg-blue-50 border-blue-200 text-blue-500' : 'bg-white border-gray-200 text-gray-400';
                                                                            return (
                                                                                <div key={day.date} onClick={(e) => { e.stopPropagation(); handleCellMark(row, day, day.status); }} className={`relative flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${cellBase} cursor-pointer hover:shadow-md`}>
                                                                                    <div className="text-[9px] font-medium opacity-60">{dayName}</div>
                                                                                    <div className="text-[11px] font-bold">{day.date.slice(5).replace('-','/')}</div>
                                                                                    <div className="text-[8px] mt-0.5 font-medium">{isPresent ? '✓' : isAbsent ? '✗' : isHoliday ? 'H' : '—'}</div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}

                                {periodViewMode === 'abstract' && (
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">College / Program</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Branch</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Year / Sem</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Students</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Avg Work Days</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">Present %</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">Overall %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {getAbstractPeriodData(periodReport).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-4">
                                                        <div className="font-bold text-gray-900">{row.college}</div>
                                                        <div className="text-xs text-indigo-600 font-medium uppercase tracking-wider">{row.course} • {row.batch}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-gray-700 font-medium">{row.branch}</td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="text-sm font-bold text-gray-700">Y{row.year} • S{row.semester}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 font-bold text-gray-700">{row.studentCount}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center text-gray-600 font-medium">{row.avgWorkingDays}</td>
                                                    <td className="px-4 py-4 text-center font-bold text-green-600">{row.attendancePercentage}%</td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[100px] mx-auto">
                                                            <div className={`h-full rounded-full transition-all duration-500 ${row.attendancePercentage >= 75 ? 'bg-green-500' : row.attendancePercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${row.attendancePercentage}%` }} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {periodViewMode === 'grid' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                                                <tr>
                                                    <th className="p-3 text-left border-r bg-gray-50 sticky left-0 z-20 min-w-[200px]">Student Details</th>
                                                    {getPeriodDates(periodReport).map(date => {
                                                        const dt = new Date(date + 'T00:00:00');
                                                        return (
                                                            <th key={date} className="p-2 border-r text-center whitespace-nowrap min-w-[45px]">
                                                                <div className="text-[8px] font-black text-gray-400 uppercase leading-none">{dt.toLocaleDateString('en-US',{weekday:'short'})}</div>
                                                                <div className="text-[10px] font-black">{date.slice(5).replace('-','/')}</div>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {periodReport.map(student => (
                                                    <tr key={student.assignmentId} className="hover:bg-gray-50 border-b">
                                                        <td className="px-3 py-2 border-r bg-white sticky left-0 z-10">
                                                            <div className="font-black text-gray-900 uppercase truncate max-w-[180px]">{student.studentName}</div>
                                                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{student.admissionNumber} • {student.branch}</div>
                                                        </td>
                                                        {getPeriodDates(periodReport).map(date => {
                                                            const day = student.dayBreakdown.find(d => d.date === date);
                                                            const isPresent = day?.status === 'Present';
                                                            const isAbsent = day?.status === 'Absent';
                                                            const isHoliday = day?.status === 'Holiday';
                                                            let color = 'bg-gray-50 text-gray-200';
                                                            if (isPresent) color = 'bg-green-500 text-white font-black';
                                                            if (isAbsent) color = 'bg-red-500 text-white font-black';
                                                            if (isHoliday) color = 'bg-blue-300 text-white font-black';
                                                            return (
                                                                <td key={date} className={`p-2 border-r text-center ${color}`}>
                                                                    {isPresent ? 'P' : isAbsent ? 'A' : isHoliday ? 'H' : '—'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Backdate Marking Tab (Super Admin only) ───────────────────────────── */}
            {activeTab === 'backdate' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* ── LEFT SIDE: Marking Operations (66%) ───────────────────────────── */}
                    <div className="lg:col-span-8 space-y-6">
                        {!isSuperAdmin ? (
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                                    <ShieldAlert className="text-amber-500 w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-800 mb-2">Super Admin Only</h3>
                                <p className="text-gray-500 max-w-xs">Backdate attendance marking is restricted to Super Administrators only.</p>
                            </div>
                        ) : (
                            <>
                                {/* PHASE 1: Running Internships Dashboard */}
                                {bdPhase === 1 && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                                <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-100 italic text-white uppercase text-[10px] tracking-widest font-black">Active</div>
                                                Running Internships
                                            </h3>
                                            <div className="text-xs text-gray-400 font-medium">Select a batch to start marking</div>
                                        </div>

                                        {activeGroupsLoading ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {[1,2,3,4].map(i => <div key={i} className="h-40 bg-gray-50 border border-gray-100 rounded-2xl animate-pulse" />)}
                                            </div>
                                        ) : activeGroups.length === 0 ? (
                                            <div className="bg-white rounded-2xl border-2 border-dashed border-gray-100 py-20 text-center">
                                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                    <Box className="w-6 h-6 text-gray-300" />
                                                </div>
                                                <div className="text-sm font-bold text-gray-400">No Running Internships Found</div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                                                {activeGroups.map((group, idx) => (
                                                    <div key={idx} 
                                                        onClick={() => handleActiveGroupSelect(group)}
                                                        className="group relative bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-600 hover:ring-4 hover:ring-indigo-50 transition-all cursor-pointer shadow-sm hover:shadow-xl overflow-hidden active:scale-95">
                                                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="bg-indigo-600 text-white p-1.5 rounded-full shadow-lg">
                                                                <Navigation className="w-3.5 h-3.5" />
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-start gap-4 mb-4">
                                                            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                                <Building2 className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <h4 className="font-black text-gray-900 leading-tight mb-1 group-hover:text-indigo-600 transition-colors uppercase italic">{group.company_name}</h4>
                                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                                                                    Batch: {group.batch}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 mt-auto">
                                                            <div className="bg-gray-50 rounded-xl p-2.5 group-hover:bg-indigo-50 transition-colors">
                                                                <div className="text-[9px] uppercase font-black text-gray-400 group-hover:text-indigo-400">Students</div>
                                                                <div className="flex items-center gap-1.5 font-bold text-gray-800">
                                                                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                                                                    {group.student_count}
                                                                </div>
                                                            </div>
                                                            <div className="bg-gray-50 rounded-xl p-2.5 group-hover:bg-indigo-50 transition-colors">
                                                                <div className="text-[9px] uppercase font-black text-gray-400 group-hover:text-indigo-400">Duration</div>
                                                                <div className="flex items-center gap-1.5 font-bold text-gray-800 overflow-hidden text-ellipsis whitespace-nowrap">
                                                                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                                                    {new Date(group.start_date).getMonth() + 1}/{new Date(group.start_date).getFullYear().toString().slice(2)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* PHASE 2: Date Grid + Grant Rights */}
                                {bdPhase === 2 && (
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setBdPhase(1)} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
                                                    <ChevronLeft className="w-5 h-5" />
                                                </button>
                                                <div>
                                                    <h3 className="font-black text-gray-900 uppercase italic tracking-tighter leading-none">
                                                        {periodFilterOptions.locations?.find(l => String(l.id) === String(bdInternship))?.companyName}
                                                    </h3>
                                                    <p className="text-[10px] font-bold text-indigo-600 uppercase mt-1 tracking-widest">{bdBatch} • Batch Marking</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] uppercase font-black text-gray-400">Assignment Range</div>
                                                <div className="text-xs font-bold text-gray-700">{bdFromDate} ↔ {bdToDate}</div>
                                            </div>
                                        </div>

                                        <div className="p-6 space-y-8">
                                            {/* Date selection grid */}
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase italic">
                                                    <span>1. Select Date to Unlock</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="flex items-center gap-1 opacity-60"><span className="w-2 h-2 bg-gray-100 border rounded-sm" /> Holiday</span>
                                                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-white border border-indigo-200 rounded-sm" /> Working</span>
                                                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-600 rounded-sm" /> Selected</span>
                                                    </div>
                                                </div>
                                                <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(60px,1fr))'}}>
                                                    {bdWorkingDates.map((d) => (
                                                        <button key={d.date} disabled={!d.isPast}
                                                            onClick={() => bdSelectDate(d.date)}
                                                            className={`h-14 flex flex-col items-center justify-center rounded-xl border-2 text-center transition-all relative group
                                                                ${d.date === bdActiveDate ? 'bg-indigo-600 text-white border-indigo-800 shadow-xl shadow-indigo-100 scale-105 z-10' :
                                                                  !d.isWorkingDay ? 'bg-gray-50 text-gray-300 border-gray-100 opacity-50' :
                                                                  d.isPast ? 'bg-white text-gray-700 border-gray-100 hover:border-indigo-400 hover:bg-gray-50 shadow-sm' :
                                                                  'bg-white text-gray-200 border-gray-50 cursor-not-allowed'}`}>
                                                            <span className="text-[9px] uppercase font-black opacity-60 leading-none mb-1">{d.dayName}</span>
                                                            <span className="text-sm font-black leading-none">{d.date.slice(8)}</span>
                                                            {d.date === bdActiveDate && (
                                                                <div className="absolute -top-1 -right-1">
                                                                    <div className="w-3 h-3 bg-green-400 rounded-full border-2 border-indigo-600" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Grant button panel */}
                                            {bdActiveDate && (
                                                <div className="bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-top-4 duration-500">
                                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                                                        <Pen className="text-indigo-600 w-5 h-5" />
                                                    </div>
                                                    <h4 className="text-lg font-black text-indigo-900 uppercase italic mb-1">Grant Marking Rights</h4>
                                                    <p className="text-xs text-indigo-600 font-bold mb-6">
                                                        Enable manual editing for <span className="underline decoration-2 underline-offset-4">{bdActiveDate}</span> in the Period Report.
                                                    </p>
                                                    <button onClick={handleGrantRights}
                                                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                                                        Open Report & Unlock Range
                                                        <Navigation className="w-4 h-4 group-hover:translate-x-1" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── RIGHT SIDE: Vertical Audit Log (33%) ────────────────────────────── */}
                    <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[calc(100vh-280px)] overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-black text-gray-900 uppercase italic text-sm flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-indigo-500" />
                                    Audit Activity
                                </h3>
                                <div className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">Live</div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                {auditLoading ? (
                                    <div className="space-y-3">
                                        {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}
                                    </div>
                                ) : auditLog.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                                        <Box className="w-8 h-8 mb-2" />
                                        <div className="text-xs font-bold uppercase">No records</div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {auditLog.map((entry) => (
                                            <div key={entry.id} 
                                                onClick={() => setViewAuditDetail(entry)}
                                                className="p-3 bg-white border border-gray-100 rounded-xl hover:border-indigo-200 transition-all group shadow-sm cursor-pointer hover:shadow-md">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <div className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-[9px] font-black text-indigo-600 uppercase italic">
                                                        {entry.changed_by_name}
                                                    </div>
                                                    <div className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter ml-auto">
                                                        {new Date(entry.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="text-[10px] font-black text-gray-900 truncate max-w-[120px] uppercase italic">{entry.student_name}</div>
                                                        <div className="text-[9px] font-bold text-gray-400">{entry.admission_number}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="flex items-center gap-1 justify-end">
                                                            <span className="text-[9px] px-1 bg-gray-100 rounded line-through text-gray-400">{entry.old_status?.slice(0,1) || '-'}</span>
                                                            <ArrowRight className="w-2 h-2 text-gray-300" />
                                                            <span className={`text-[10px] px-1.5 font-bold rounded ${entry.new_status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                                {entry.new_status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Detail Modal (Audit) */}
            {viewAuditDetail && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-black text-gray-900 uppercase italic flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                Change Details
                            </h3>
                            <button onClick={() => setViewAuditDetail(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black italic text-xl">
                                    {viewAuditDetail.changed_by_name?.slice(0,1)}
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-indigo-600 uppercase italic tracking-widest">Performed By</div>
                                    <div className="text-lg font-black text-gray-900 uppercase italic">{viewAuditDetail.changed_by_name}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-2xl p-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1">Student</div>
                                    <div className="font-black text-gray-900 uppercase italic text-sm">{viewAuditDetail.student_name}</div>
                                    <div className="text-xs font-bold text-gray-500">{viewAuditDetail.admission_number}</div>
                                </div>
                                <div className="bg-gray-50 rounded-2xl p-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1">Date</div>
                                    <div className="font-black text-gray-900 uppercase italic text-sm">{viewAuditDetail.attendance_date}</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-6 py-4 border-y border-dashed border-gray-200">
                                <div className="text-center">
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1">Old Status</div>
                                    <div className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-black italic text-xs uppercase">{viewAuditDetail.old_status || '—'}</div>
                                </div>
                                <ArrowRight className="w-6 h-6 text-indigo-200 mt-4" />
                                <div className="text-center">
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1">New Status</div>
                                    <div className={`px-4 py-1 rounded-lg font-black italic text-xs uppercase ${viewAuditDetail.new_status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                        {viewAuditDetail.new_status}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Timestamp
                                    </div>
                                    <div className="text-xs font-bold text-gray-700">
                                        {new Date(viewAuditDetail.changed_at).toLocaleString('en-US', { 
                                            dateStyle: 'long', 
                                            timeStyle: 'medium' 
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase italic mb-1 flex items-center gap-1">
                                        <Pen className="w-3 h-3" /> Reason
                                    </div>
                                    <div className="text-xs font-bold text-gray-700 italic border-l-2 border-indigo-200 pl-3 py-1 bg-indigo-50/50 rounded-r-lg">
                                        {viewAuditDetail.reason || 'No reason provided'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-100">
                            <button onClick={() => setViewAuditDetail(null)} className="w-full py-3 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all">
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Assigned Students Modal */}
            {viewStudentsModal && (

                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-600" />
                                {currentInternshipName} - Assigned Students
                            </h2>
                            <button onClick={() => setViewStudentsModal(false)} className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {viewStudentsLoading ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center text-gray-500">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-indigo-600" />
                                    Loading students...
                                </div>
                            ) : viewStudentsList.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                    No students assigned to this location yet.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3">Student Name</th>
                                                <th className="px-4 py-3">Batch & Branch</th>
                                                <th className="px-4 py-3">Year / Sem</th>
                                                <th className="px-4 py-3">Duration</th>
                                                <th className="px-4 py-3">Allowed Days</th>
                                                <th className="px-4 py-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {viewStudentsList.map((s) => (
                                                <tr key={s.admission_number || s.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">{s.student_name}</div>
                                                        <div className="text-xs text-gray-500">{s.admission_number}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-gray-900">{s.branch}</div>
                                                        <div className="text-xs text-gray-500">Batch: {s.batch}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">
                                                        {s.current_year}-{s.current_semester}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-600">
                                                        <div>Start: {new Date(s.start_date).toLocaleDateString()}</div>
                                                        <div>End: {new Date(s.end_date).toLocaleDateString()}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(() => {
                                                                try {
                                                                    const days = typeof s.allowed_days === 'string' ? JSON.parse(s.allowed_days) : s.allowed_days;
                                                                    return Array.isArray(days) ? days.map(d => (
                                                                        <span key={d} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                                                                            {d.slice(0, 3)}
                                                                        </span>
                                                                    )) : '-';
                                                                } catch (e) { return '-'; }
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleEditClick(s)}
                                                                className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors group"
                                                                title="Reassign / Edit"
                                                            >
                                                                <Pen className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteAssignment(s.assignment_id)}
                                                                className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors group"
                                                                title="Remove Assignment"
                                                            >
                                                                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-xl">
                            <button onClick={() => setViewStudentsModal(false)} className="px-4 py-2 bg-white border border-gray-300 shadow-sm hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Assignment Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-900">Edit Assignment</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateAssignment} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Internship Location</label>
                                <select
                                    required
                                    className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={editFormData.internshipId}
                                    onChange={e => setEditFormData({ ...editFormData, internshipId: e.target.value })}
                                >
                                    {locations.map(loc => (
                                        <option key={loc._id} value={loc._id}>{loc.companyName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editFormData.startDate}
                                        onChange={e => setEditFormData({ ...editFormData, startDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editFormData.endDate}
                                        onChange={e => setEditFormData({ ...editFormData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Days</label>
                                <div className="flex flex-wrap gap-2">
                                    {WEEKDAYS.map(day => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => toggleEditDay(day)}
                                            className={`px-3 py-1 text-sm rounded-full border transition-all ${editFormData.allowedDays.includes(day)
                                                ? 'bg-indigo-100 border-indigo-200 text-indigo-700 font-medium'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            {day}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium">
                                    Save Changes
                                </button>
                                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Edit Location Modal */}
            {showEditLocationModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Edit Location</h3>
                            <button onClick={() => setShowEditLocationModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateLocation} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editLocationForm.companyName}
                                    onChange={e => setEditLocationForm({ ...editLocationForm, companyName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <textarea
                                    required
                                    className="w-full px-4 py-2 border rounded-lg outline-none"
                                    rows="2"
                                    value={editLocationForm.address}
                                    onChange={e => setEditLocationForm({ ...editLocationForm, address: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                                    <input
                                        type="number" step="any" required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.latitude}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, latitude: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                                    <input
                                        type="number" step="any" required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.longitude}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, longitude: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Radius (meters)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full px-4 py-2 border rounded-lg outline-none"
                                    value={editLocationForm.radius}
                                    onChange={e => setEditLocationForm({ ...editLocationForm, radius: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time (IST)</label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.allowedStartTime}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, allowedStartTime: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time (IST)</label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.allowedEndTime}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, allowedEndTime: e.target.value })}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Check-in: 15 min before/after check-in time. Check-out: at check-out time through 15 min after (IST).</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={editLocationForm.isActive}
                                    onChange={e => setEditLocationForm({ ...editLocationForm, isActive: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active Location</label>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowEditLocationModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm"
                                >
                                    Update Location
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Day End Report Modal */}
            {dayEndReportOpen && dayEndReportData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-indigo-600" />
                                    Internship Day End Report
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Date: {new Date(dayEndReportData.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDayEndDownload('xlsx')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Download Excel
                                </button>
                                <button onClick={() => setDayEndReportOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Total Assigned</div>
                                    <div className="text-2xl font-bold text-indigo-900">{dayEndReportData.totalStudents}</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Present</div>
                                    <div className="text-2xl font-bold text-green-900">{dayEndReportData.presentToday}</div>
                                </div>
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                    <div className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1">Absent</div>
                                    <div className="text-2xl font-bold text-red-900">{dayEndReportData.absentToday}</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Marked</div>
                                    <div className="text-2xl font-bold text-blue-900">{dayEndReportData.markedToday}</div>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Unmarked</div>
                                    <div className="text-2xl font-bold text-gray-900">{dayEndReportData.unmarkedToday}</div>
                                </div>
                            </div>

                            {/* Grouped Data Table */}
                            {dayEndReportData.groupedSummary && dayEndReportData.groupedSummary.length > 0 ? (
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3">College</th>
                                                <th className="px-4 py-3">Batch</th>
                                                <th className="px-4 py-3">Branch</th>
                                                <th className="px-4 py-3">Sem</th>
                                                <th className="px-4 py-3 text-center">Total</th>
                                                <th className="px-4 py-3 text-center text-green-700">Present</th>
                                                <th className="px-4 py-3 text-center text-red-700">Absent</th>
                                                <th className="px-4 py-3 text-center text-blue-700">Marked</th>
                                                <th className="px-4 py-3 text-center text-gray-500">Pending</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {dayEndReportData.groupedSummary.map((group, idx) => (
                                                <tr key={`${group.college}-${group.batch}-${group.branch}-${group.semester}-${idx}`} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{group.college}</td>
                                                    <td className="px-4 py-3">{group.batch}</td>
                                                    <td className="px-4 py-3">{group.course} - {group.branch}</td>
                                                    <td className="px-4 py-3">{group.year}-{group.semester}</td>
                                                    <td className="px-4 py-3 text-center font-semibold">{group.totalStudents}</td>
                                                    <td className="px-4 py-3 text-center text-green-600 font-medium">{group.presentToday}</td>
                                                    <td className="px-4 py-3 text-center text-red-600 font-medium">{group.absentToday}</td>
                                                    <td className="px-4 py-3 text-center text-blue-600 font-medium">{group.markedToday}</td>
                                                    <td className="px-4 py-3 text-center text-gray-500">{group.pendingToday}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50 font-semibold border-t border-gray-200">
                                            <tr>
                                                <td colSpan="4" className="px-4 py-3 text-right">Total</td>
                                                <td className="px-4 py-3 text-center">{dayEndReportData.totalStudents}</td>
                                                <td className="px-4 py-3 text-center text-green-700">{dayEndReportData.presentToday}</td>
                                                <td className="px-4 py-3 text-center text-red-700">{dayEndReportData.absentToday}</td>
                                                <td className="px-4 py-3 text-center text-blue-700">{dayEndReportData.markedToday}</td>
                                                <td className="px-4 py-3 text-center text-gray-500">{dayEndReportData.unmarkedToday}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500">
                                    No data available for this day.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Modal */}
            {conflictModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[200] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden transform transition-all border border-red-100">
                        <div className="p-6 border-b border-red-100 flex justify-between items-center bg-red-50/50">
                            <h3 className="text-xl font-bold text-red-700 flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6" />
                                Assignment Conflicts
                            </h3>
                            <button onClick={() => setConflictModalOpen(false)} className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-100/50 rounded-xl transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm flex gap-4 shadow-sm">
                                <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-base mb-1">Overlapping assignments detected!</p>
                                    <p className="opacity-90 leading-relaxed">The students listed below are already assigned to hospitals during this period. Overwriting will move them to the new location and <strong>automatically re-validate their existing attendance records</strong> against the new location's GPS coordinates.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Conflicting Students</div>
                                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-inner bg-gray-50/30">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100/80 text-gray-600 font-bold border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3">Student</th>
                                                <th className="px-4 py-3">Current Location</th>
                                                <th className="px-4 py-3">Dates</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {conflictData.map((c, i) => (
                                                <tr key={i} className="hover:bg-red-50/30 transition-colors">
                                                    <td className="px-4 py-4">
                                                        <div className="font-bold text-gray-900">{c.studentName}</div>
                                                        <div className="text-xs text-gray-400 font-medium">{c.admissionNumber}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-gray-700 font-semibold">{c.companyName}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-gray-500 text-xs font-medium leading-relaxed">
                                                        {new Date(c.startDate).toLocaleDateString()} — <br />
                                                        {new Date(c.endDate).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex flex-col sm:flex-row gap-4 bg-gray-50/80">
                            <button
                                onClick={() => handleAssign(null, true)}
                                disabled={loading}
                                className="flex-[2] bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-2xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 group active:scale-95 disabled:opacity-70"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                                        <span>Overwrite and Re-validate Attendance</span>
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => setConflictModalOpen(false)}
                                className="flex-1 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-6 rounded-2xl transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* View Attendance Details Modal */}
            {
                viewAttendanceModal && selectedAttendance && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100]">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        <UserCheck className="w-5 h-5 text-indigo-600" />
                                        Attendance Details
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {selectedAttendance.studentDetails?.name} ({selectedAttendance.studentId}) • {new Date(selectedAttendance.date).toLocaleDateString()}
                                    </p>
                                </div>
                                <button onClick={() => setViewAttendanceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                                    {/* Left Column: Details & Images */}
                                    <div className="space-y-6">
                                        {/* Status Section */}
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Current Status</span>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className={`px-3 py-1 rounded-full text-sm font-bold 
                                                        ${selectedAttendance.status === 'Present' ? 'bg-green-100 text-green-700' :
                                                                selectedAttendance.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                            {selectedAttendance.status}
                                                        </span>
                                                        {selectedAttendance.isSuspicious && (
                                                            <span className="flex items-center gap-1 text-red-600 font-medium text-sm bg-red-50 px-2 py-1 rounded border border-red-100">
                                                                <AlertTriangle className="w-4 h-4" /> Risk Detected
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500">Assignment</div>
                                                    <div className="font-medium text-gray-900">{selectedAttendance.internshipId?.companyName || 'Unknown'}</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {selectedAttendance.internshipId?.address && <div title={selectedAttendance.internshipId.address} className="truncate max-w-[200px]">{selectedAttendance.internshipId.address}</div>}

                                                        {selectedAttendance.internshipId?.latitude && (
                                                            <div>Target: {Number(selectedAttendance.internshipId.latitude).toFixed(4)}, {Number(selectedAttendance.internshipId.longitude).toFixed(4)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {selectedAttendance.suspiciousReason && (
                                                <div className="mt-3 text-sm text-red-700 bg-red-50 p-2 rounded border border-red-100">
                                                    <strong>Risk Reason:</strong> {selectedAttendance.suspiciousReason}
                                                </div>
                                            )}
                                        </div>

                                        {/* Timings & Locations */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Check In */}
                                            <div className="border border-gray-200 rounded-lg p-4">
                                                <h4 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                                                    <Clock className="w-4 h-4" /> Check In
                                                </h4>
                                                {selectedAttendance.checkInTime ? (
                                                    <>
                                                        <div className="text-lg font-bold text-gray-900 mb-1">
                                                            {new Date(selectedAttendance.checkInTime).toLocaleTimeString()}
                                                        </div>
                                                        <div className="text-xs text-gray-500 space-y-1">
                                                            {(() => {
                                                                try {
                                                                    let loc = selectedAttendance.checkInLocation;
                                                                    if (typeof loc === 'string') {
                                                                        loc = JSON.parse(loc);
                                                                    }
                                                                    return loc ? (
                                                                        <>
                                                                            <>
                                                                                <div><strong>Coords:</strong> {loc.latitude?.toFixed(5)}, {loc.longitude?.toFixed(5)}</div>
                                                                                <div><strong>Accuracy:</strong> {Math.round(loc.accuracy)}m</div>
                                                                                <div><strong>Dist:</strong> {Math.round(loc.distanceFromSite)}m</div>
                                                                                <div><strong>IP:</strong> {loc.ipAddress}</div>
                                                                            </>
                                                                        </>
                                                                    ) : <div>No location data for Check-in</div>;
                                                                } catch (e) { return <div>Error parsing location</div>; }
                                                            })()}
                                                        </div>
                                                    </>
                                                ) : <div className="text-gray-400 italic">Not Checked In</div>}
                                            </div>

                                            {/* Check Out */}
                                            <div className="border border-gray-200 rounded-lg p-4">
                                                <h4 className="font-semibold text-blue-700 mb-2 flex items-center gap-2">
                                                    <Clock className="w-4 h-4" /> Check Out
                                                </h4>
                                                {selectedAttendance.checkOutTime ? (
                                                    <>
                                                        <div className="text-lg font-bold text-gray-900 mb-1">
                                                            {new Date(selectedAttendance.checkOutTime).toLocaleTimeString()}
                                                        </div>
                                                        <div className="text-xs text-gray-500 space-y-1">
                                                            {(() => {
                                                                try {
                                                                    let loc = selectedAttendance.checkOutLocation;
                                                                    if (typeof loc === 'string') {
                                                                        loc = JSON.parse(loc);
                                                                    }
                                                                    return loc ? (
                                                                        <>
                                                                            <>
                                                                                <div><strong>Coords:</strong> {loc.latitude?.toFixed(5)}, {loc.longitude?.toFixed(5)}</div>
                                                                                <div><strong>Accuracy:</strong> {Math.round(loc.accuracy)}m</div>
                                                                                <div><strong>Dist:</strong> {Math.round(loc.distanceFromSite)}m</div>
                                                                                <div><strong>IP:</strong> {loc.ipAddress}</div>
                                                                            </>
                                                                        </>
                                                                    ) : <div>No location data for Check-out</div>;
                                                                } catch (e) { return <div>Error parsing location</div>; }
                                                            })()}
                                                        </div>
                                                    </>
                                                ) : <div className="text-gray-400 italic">Not Checked Out</div>}
                                            </div>
                                        </div>

                                        {/* Captured Images */}
                                        <div>
                                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                <Target className="w-4 h-4 text-indigo-600" /> Verification Images
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Check In Image */}
                                                {(() => {
                                                    try {
                                                        let loc = selectedAttendance.checkInLocation;
                                                        if (typeof loc === 'string') {
                                                            loc = JSON.parse(loc);
                                                        }
                                                        const hasImage = loc?.image;
                                                        const isVerified = loc?.photoVerified;

                                                        if (hasImage) {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                                                    <div className="bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 border-b border-gray-200">Check In Photo</div>
                                                                    <img src={loc.image} alt="Check In" className="w-full h-48 object-cover hover:scale-105 transition-transform" />
                                                                </div>
                                                            );
                                                        } else if (isVerified) {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg h-32 flex flex-col items-center justify-center bg-green-50 text-green-700 text-sm p-4 text-center">
                                                                    <Check className="w-8 h-8 mb-2" />
                                                                    <span className="font-bold">Photo Verified</span>
                                                                    <span className="text-xs text-green-600 mt-1">(Image not stored)</span>
                                                                </div>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg h-32 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                                                                    No Check-in Photo
                                                                </div>
                                                            );
                                                        }
                                                    } catch (e) { return null; }
                                                })()}


                                                {/* Check Out Image */}
                                                {(() => {
                                                    try {
                                                        let loc = selectedAttendance.checkOutLocation;
                                                        if (typeof loc === 'string') {
                                                            loc = JSON.parse(loc);
                                                        }
                                                        const hasImage = loc?.image;
                                                        const isVerified = loc?.photoVerified;

                                                        if (hasImage) {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                                                    <div className="bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 border-b border-gray-200">Check Out Photo</div>
                                                                    <img src={loc.image} alt="Check Out" className="w-full h-48 object-cover hover:scale-105 transition-transform" />
                                                                </div>
                                                            );
                                                        } else if (isVerified) {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg h-32 flex flex-col items-center justify-center bg-green-50 text-green-700 text-sm p-4 text-center">
                                                                    <Check className="w-8 h-8 mb-2" />
                                                                    <span className="font-bold">Photo Verified</span>
                                                                    <span className="text-xs text-green-600 mt-1">(Image not stored)</span>
                                                                </div>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="border border-gray-200 rounded-lg h-32 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                                                                    No Check-out Photo
                                                                </div>
                                                            );
                                                        }
                                                    } catch (e) { return null; }
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Map */}
                                    <div className="h-full min-h-[400px] rounded-xl overflow-hidden border border-gray-200 relative z-0">
                                        <MapContainer center={[17.6868, 83.2185]} zoom={13} style={{ height: '100%', width: '100%' }}>
                                            <LayersControl position="topright">
                                                <LayersControl.BaseLayer checked name="Street (OpenStreetMap)">
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
                                                </LayersControl.BaseLayer>
                                                <LayersControl.BaseLayer name="Satellite (Google Hybrid)">
                                                    <TileLayer url="http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}" maxZoom={20} subdomains={['mt0', 'mt1', 'mt2', 'mt3']} />
                                                </LayersControl.BaseLayer>
                                            </LayersControl>

                                            {/* Markers logic here would be complex due to dynamic parsing in render. 
                                            Ideally we parse once. For now, let's just try to render if possible. 
                                            Or better, we map markers from parsed data.
                                        */}
                                            {/* We can use a helper component to render markers from the selectedAttendance object */}
                                            <AttendanceMapMarkers record={selectedAttendance} />
                                        </MapContainer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

// Helper to render map markers inside MapContainer
const AttendanceMapMarkers = ({ record }) => {
    const map = useMap();
    const [markers, setMarkers] = useState([]);

    useEffect(() => {
        const newMarkers = [];
        try {
            // Check In
            if (record.checkInLocation) {
                let loc = record.checkInLocation;
                if (typeof loc === 'string') {
                    loc = JSON.parse(loc);
                }
                if (loc && loc.latitude && loc.longitude) {
                    newMarkers.push({ position: [loc.latitude, loc.longitude], label: 'Check In', color: 'green' });
                }
            }
            // Check Out
            if (record.checkOutLocation) {
                let loc = record.checkOutLocation;
                if (typeof loc === 'string') {
                    loc = JSON.parse(loc);
                }
                if (loc && loc.latitude && loc.longitude) {
                    newMarkers.push({ position: [loc.latitude, loc.longitude], label: 'Check Out', color: 'red' });
                }
            }
            // Assigned Location
            if (record.internshipId && record.internshipId.latitude && record.internshipId.longitude) {
                const lat = parseFloat(record.internshipId.latitude);
                const lng = parseFloat(record.internshipId.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    newMarkers.push({ position: [lat, lng], label: 'Assigned Location', color: 'blue', isAssigned: true });
                }
            }

            if (newMarkers.length > 0) {
                const bounds = L.latLngBounds(newMarkers.map(m => m.position));
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch (e) { console.error("Error parsing map markers", e); }
        setMarkers(newMarkers);
    }, [record, map]);

    return (
        <>
            {markers.map((m, idx) => (
                <React.Fragment key={idx}>
                    <Marker position={m.position}>
                        <Popup>{m.label}</Popup>
                    </Marker>
                    {m.isAssigned && (
                        <Circle
                            center={m.position}
                            radius={200} // 200m radius
                            pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                        />
                    )}
                </React.Fragment>
            ))}
        </>
    );
};

export default InternshipAdmin;

import React, { useState, useEffect } from 'react';
import api from '../config/api';
import { toast } from 'react-hot-toast';
import { MapPin, Calendar, Clock, Loader2, Plus, Target, UserCheck, AlertTriangle, Search, X, Navigation, List, Filter, Users, Pen, Trash2, Check, Eye, Download, FileText } from 'lucide-react';
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
        semester: ''
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
    }, [activeTab, filters.location, filters.college, filters.course, filters.batch]);

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

    const fetchReport = async () => {
        try {
            setLoadingReport(true);
            const res = await api.get('/internship/report', { params: { ...filters } });
            if (res.data.success) {
                setReportData(res.data.data);
            }
        } catch (error) {
            toast.error('Failed to fetch report');
        } finally {
            setLoadingReport(false);
        }
    };

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

    const handleAssign = async (e) => {
        e.preventDefault();
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

            setLoading(true);
            const payload = {
                ...assignmentData,
                filters: filters,
                studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : null
            };
            const res = await api.post('/internship/assign', payload);
            if (res.data.success) {
                toast.success(res.data.message);
                setAvailableStudents([]); // Clear list after success
                setSelectedStudentIds([]);
            }
        } catch (error) {
            if (error.response?.status === 409 && error.response?.data?.conflicts) {
                setConflictData(error.response.data.conflicts);
                setConflictModalOpen(true);
                toast.error('Assignment conflicts detected');
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
        setSelectedAttendance(record); // Show basic info first
        setViewAttendanceModal(true);
        try {
            const res = await api.get(`/internship/attendance-details/${record._id || record.id}`);
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
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
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
                    attendance Report
                </button>
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                    <input type="time" required className="w-full px-4 py-2 border rounded-lg outline-none" value={formData.allowedStartTime} onChange={e => setFormData({ ...formData, allowedStartTime: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                    <input type="time" required className="w-full px-4 py-2 border rounded-lg outline-none" value={formData.allowedEndTime} onChange={e => setFormData({ ...formData, allowedEndTime: e.target.value })} />
                                </div>
                            </div>

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
                                        {filterOptions.batches?.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.college} onChange={e => handleFilterChange('college', e.target.value)}>
                                        <option value="">All Colleges</option>
                                        {filterOptions.colleges?.map(c => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.course} onChange={e => handleFilterChange('course', e.target.value)}>
                                        <option value="">All Courses</option>
                                        {filterOptions.courses?.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.branch} onChange={e => handleFilterChange('branch', e.target.value)}>
                                        <option value="">All Branches</option>
                                        {filterOptions.branches?.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.year} onChange={e => handleFilterChange('year', e.target.value)}>
                                        <option value="">All Years</option>
                                        {filterOptions.years?.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <select className="border rounded-md px-3 py-2 text-sm outline-none w-full" value={filters.semester} onChange={e => handleFilterChange('semester', e.target.value)}>
                                        <option value="">All Semesters</option>
                                        {filterOptions.semesters?.map(s => <option key={s} value={s}>{s}</option>)}
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
                                                    <th className="px-4 py-2">Name / ID</th>
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
                                                            <div className="text-xs text-gray-500">{student.id}</div>
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
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.location} onChange={e => handleFilterChange('location', e.target.value)}>
                                <option value="">All Locations</option>
                                {filterOptions.locations?.map(loc => <option key={loc.id} value={loc.id}>{loc.companyName}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.batch} onChange={e => handleFilterChange('batch', e.target.value)}>
                                <option value="">All Batches</option>
                                {filterOptions.batches?.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.college} onChange={e => handleFilterChange('college', e.target.value)}>
                                <option value="">All Colleges</option>
                                {/* Usually college options might need ID vs Name handling. Assuming Name based on common pattern */}
                                {filterOptions.colleges?.map(c => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.course} onChange={e => handleFilterChange('course', e.target.value)}>
                                <option value="">All Courses</option>
                                {filterOptions.courses?.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.branch} onChange={e => handleFilterChange('branch', e.target.value)}>
                                <option value="">All Branches</option>
                                {filterOptions.branches?.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.year} onChange={e => handleFilterChange('year', e.target.value)}>
                                <option value="">All Years</option>
                                {filterOptions.years?.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto flex-1 min-w-[140px]" value={filters.semester} onChange={e => handleFilterChange('semester', e.target.value)}>
                                <option value="">All Semesters</option>
                                {filterOptions.semesters?.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            <button
                                onClick={handleDayEndReport}
                                disabled={dayEndReportLoading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm whitespace-nowrap ml-auto sm:ml-0"
                            >
                                {dayEndReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-indigo-600" />}
                                Day End Report
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
                                            {viewStudentsList.map((s, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.allowedStartTime}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, allowedStartTime: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={editLocationForm.allowedEndTime}
                                        onChange={e => setEditLocationForm({ ...editLocationForm, allowedEndTime: e.target.value })}
                                    />
                                </div>
                            </div>
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
                                                <tr key={idx} className="hover:bg-gray-50">
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[200]">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 flex flex-col max-h-[80vh]">
                        <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6" />
                            Assignment Conflicts
                        </h3>
                        <button onClick={() => setConflictModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                        The following students already have internships overlapping with the selected dates:
                    </p>

                    <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md mb-4">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-semibold sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 border-b">Student</th>
                                    <th className="px-4 py-2 border-b">Existing Internship</th>
                                    <th className="px-4 py-2 border-b">Dates</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {conflictData.map((c, i) => (
                                    <tr key={i} className="hover:bg-red-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{c.studentName}</div>
                                            <div className="text-xs text-gray-500">{c.admissionNumber}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-gray-800 font-medium">{c.companyName}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                                            {new Date(c.startDate).toLocaleDateString()} - <br />{new Date(c.endDate).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setConflictModalOpen(false)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors"
                        >
                            Close and Review
                        </button>
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

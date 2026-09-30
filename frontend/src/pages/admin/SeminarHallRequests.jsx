import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
    Building2,
    CalendarClock,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    XCircle,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../config/api';
import clubService from '../../services/clubService';
import useAuthStore from '../../store/authStore';
import { BACKEND_MODULES, hasPermission } from '../../constants/rbac';

const EMPTY_FORM = {
    requestType: 'club',
    clubIds: [],
    collegeIds: [],
    courseIds: [],
    branchIds: [],
    yearNumbers: [],
    eventName: '',
    organizer: '',
    hallName: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    purpose: '',
    expectedAttendees: ''
};

const EMPTY_HALL_FORM = {
    hallName: '',
    location: '',
    capacity: '',
    description: '',
    openTime: '08:00',
    closeTime: '20:00'
};

const formatDate = value => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Date not set';

const formatTime = value => value
    ? Number.isNaN(new Date(`1970-01-01T${value}`).getTime())
        ? value
        : new Date(`1970-01-01T${value}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

const getDateKey = date => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
].join('-');

const getRequestYears = request => {
    if (Array.isArray(request.year_numbers)) return request.year_numbers;
    if (typeof request.year_numbers === 'string') {
        try {
            const parsed = JSON.parse(request.year_numbers);
            if (Array.isArray(parsed)) return parsed;
        } catch (error) {
            return request.year_number ? [request.year_number] : [];
        }
    }
    return request.year_number ? [request.year_number] : [];
};

const getMinutesSinceMidnight = value => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59) return null;
    if (match[3]) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    } else if (hour > 23) {
        return null;
    }
    return hour * 60 + minute;
};

const formatMinutes = minutes => new Date(1970, 0, 1, Math.floor(minutes / 60), minutes % 60)
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const Dialog = ({ open, onClose, title, description, titleId, children }) => {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section className="my-auto max-h-[95vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
                        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Close ${title}`}>
                        <X size={20} />
                    </button>
                </header>
                <div className="max-h-[calc(95vh-76px)] space-y-6 overflow-y-auto p-5">{children}</div>
            </section>
        </div>
    );
};

const MultiSelectField = ({ label, options, selected, onChange, placeholder, disabled = false }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const selectedLabels = options.filter(option => selected.includes(String(option.value))).map(option => option.label);

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutsideClick = event => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const toggleOption = value => {
        const normalizedValue = String(value);
        onChange(selected.includes(normalizedValue)
            ? selected.filter(item => item !== normalizedValue)
            : [...selected, normalizedValue]);
    };

    return (
        <div ref={containerRef} className="relative min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none hover:border-teal-700 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
                <span className="truncate">{selectedLabels.length ? selectedLabels.join(', ') : placeholder}</span>
                <ChevronDown size={16} className="shrink-0 text-slate-500" />
            </button>
            {open && !disabled && (
                <div role="listbox" aria-multiselectable="true" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    {options.length ? options.map(option => {
                        const value = String(option.value);
                        const checked = selected.includes(value);
                        return (
                            <label key={value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                <input type="checkbox" checked={checked} onChange={() => toggleOption(value)} className="h-4 w-4 accent-teal-800" />
                                <span className="min-w-0 truncate">{option.label}</span>
                            </label>
                        );
                    }) : <p className="px-3 py-3 text-sm text-slate-500">No options available</p>}
                </div>
            )}
            {selectedLabels.length > 0 && (
                <div className="mt-1 text-xs text-slate-500">{selectedLabels.length} selected</div>
            )}
        </div>
    );
};

const SeminarHallRequests = () => {
    const user = useAuthStore(state => state.user);
    const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());
    const hasExplicitSeminarGrant = ['view_seminar_halls', 'create_seminar_hall_request', 'manage_seminar_halls']
        .some(action => hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, action));
    const canManage = hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, 'manage_seminar_halls') || (isAdmin && !hasExplicitSeminarGrant);
    const canCreateRequest = hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, 'create_seminar_hall_request') || (isAdmin && !hasExplicitSeminarGrant);
    const canView = canManage || canCreateRequest || hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, 'view_seminar_halls') || hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, 'view');
    const [showRequestForm, setShowRequestForm] = useState(false);
    const [showHallForm, setShowHallForm] = useState(false);
    const [requests, setRequests] = useState([]);
    const [halls, setHalls] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [colleges, setColleges] = useState([]);
    const [requestCourses, setRequestCourses] = useState([]);
    const [requestBranches, setRequestBranches] = useState([]);
    const [estimatingCount, setEstimatingCount] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [hallFilter, setHallFilter] = useState('all');
    const [dateAlert, setDateAlert] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [hallForm, setHallForm] = useState(EMPTY_HALL_FORM);
    const [editingHallId, setEditingHallId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingHall, setSavingHall] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => getDateKey(new Date()));
    const estimateSequence = useRef(0);
    const calendarRef = useRef(null);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const response = await clubService.getSeminarHallRequests();
            setRequests(response.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load seminar hall requests');
        } finally {
            setLoading(false);
        }
    };

    const loadHalls = async () => {
        try {
            const response = await clubService.getSeminarHalls();
            setHalls(response.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load seminar halls');
        }
    };

    const loadClubs = async () => {
        try {
            const response = await clubService.getClubs();
            setClubs(response.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load clubs');
        }
    };

    const loadColleges = async () => {
        try {
            const response = await api.get('/colleges?includeInactive=false');
            setColleges(response.data?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load colleges');
        }
    };

    const loadRequestCourses = async collegeIds => {
        if (!collegeIds.length) {
            setRequestCourses([]);
            return;
        }
        try {
            const responses = await Promise.all(collegeIds.map(collegeId => api.get(`/colleges/${collegeId}/courses?includeInactive=false`)));
            setRequestCourses(responses.flatMap((response, index) =>
                (response.data?.data || []).map(course => ({ ...course, collegeId: collegeIds[index] }))
            ));
        } catch (error) {
            setRequestCourses([]);
            toast.error(error.response?.data?.message || 'Could not load college courses');
        }
    };

    const loadRequestBranches = async courseIds => {
        if (!courseIds.length) {
            setRequestBranches([]);
            return;
        }
        try {
            const responses = await Promise.all(courseIds.map(courseId => api.get(`/courses/${courseId}/branches?includeInactive=false`)));
            setRequestBranches(responses.flatMap((response, index) =>
                (response.data?.data || []).map(branch => ({ ...branch, courseId: courseIds[index] }))
            ));
        } catch (error) {
            setRequestBranches([]);
            toast.error(error.response?.data?.message || 'Could not load course branches');
        }
    };

    useEffect(() => {
        if (canView) {
            loadRequests();
            loadHalls();
            loadClubs();
            loadColleges();
        }
    }, [canView]);

    useEffect(() => {
        if (!showHallForm && !showRequestForm) return undefined;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = event => {
            if (event.key === 'Escape') {
                setShowHallForm(false);
                setShowRequestForm(false);
            }
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [showHallForm, showRequestForm]);

    if (!canView) return <Navigate to="/" replace />;

    const filteredRequests = requests.filter(request =>
        (statusFilter === 'all' || request.status === statusFilter) &&
        (hallFilter === 'all' || request.hall_name === hallFilter)
    );
    const firstDayOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const calendarOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const calendarDays = Array.from({ length: 42 }, (_, index) =>
        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - calendarOffset + 1)
    );
    const requestsByDate = requests.reduce((bookings, request) => {
        const dateKey = String(request.event_date).slice(0, 10);
        bookings[dateKey] = [...(bookings[dateKey] || []), request];
        return bookings;
    }, {});
    const selectedDateBookings = requestsByDate[selectedCalendarDate] || [];
    const selectedHall = halls.find(hall => hall.hall_name === form.hallName);
    const selectedRequestCourses = requestCourses.filter(course => form.courseIds.includes(String(course.id)));
    const selectedRequestBranches = requestBranches.filter(branch => form.branchIds.includes(String(branch.id)));
    const configuredYearCount = Math.max(0, ...[...selectedRequestBranches, ...selectedRequestCourses]
        .map(item => Number(item.total_years || item.totalYears || item.structure?.totalYears) || 0)) ||
        Math.max(0, ...requestCourses.map(course => Number(course.total_years || course.totalYears || course.structure?.totalYears) || 0)) || 4;
    const availableStudyYears = Array.from({ length: Math.min(10, Math.max(1, configuredYearCount)) }, (_, index) => index + 1);
    const selectedDateRequests = requests.filter(request =>
        String(request.event_date).slice(0, 10) === form.eventDate && request.status !== 'rejected'
    );
    const selectedHallBookings = selectedDateRequests.filter(request => request.hall_name === form.hallName);
    const hallOpeningMinutes = selectedHall ? getMinutesSinceMidnight(selectedHall.open_time) ?? 8 * 60 : null;
    const hallClosingMinutes = selectedHall ? getMinutesSinceMidnight(selectedHall.close_time) ?? 20 * 60 : null;
    const requestedStartMinutes = getMinutesSinceMidnight(form.startTime);
    const requestedEndMinutes = getMinutesSinceMidnight(form.endTime);
    const hasRequestedTimeRange = Boolean(form.startTime && form.endTime);
    const hasInvalidRequestedTimeRange = hasRequestedTimeRange && (
        requestedStartMinutes === null || requestedEndMinutes === null || requestedStartMinutes >= requestedEndMinutes
    );
    const conflictingBookings = hasRequestedTimeRange && requestedStartMinutes !== null && requestedEndMinutes !== null
        ? selectedHallBookings.filter(request => {
            const existingStart = getMinutesSinceMidnight(request.start_time);
            const existingEnd = getMinutesSinceMidnight(request.end_time);
            return existingStart !== null && existingEnd !== null &&
                existingStart < requestedEndMinutes && existingEnd > requestedStartMinutes;
        })
        : [];
    const isOutsideHallHours = Boolean(selectedHall && hasRequestedTimeRange && !hasInvalidRequestedTimeRange && (
        requestedStartMinutes < hallOpeningMinutes || requestedEndMinutes > hallClosingMinutes
    ));
    const hourlyAvailability = selectedHall && hallClosingMinutes > hallOpeningMinutes
        ? Array.from({ length: Math.ceil((hallClosingMinutes - hallOpeningMinutes) / 60) }, (_, index) => {
        const start = hallOpeningMinutes + index * 60;
        const end = Math.min(start + 60, hallClosingMinutes);
        const occupied = selectedHallBookings.some(request => {
            const eventStart = getMinutesSinceMidnight(request.start_time);
            const eventEnd = getMinutesSinceMidnight(request.end_time);
            return eventStart !== null && eventEnd !== null && eventStart < end && eventEnd > start;
        });
        return { start, end, occupied };
    })
        : [];
    const availabilityPeriods = hourlyAvailability.reduce((periods, slot) => {
        const lastPeriod = periods[periods.length - 1];
        if (lastPeriod && lastPeriod.occupied === slot.occupied && lastPeriod.end === slot.start) {
            lastPeriod.end = slot.end;
        } else {
            periods.push({ start: slot.start, end: slot.end, occupied: slot.occupied });
        }
        return periods;
    }, []).map(period => ({
        ...period,
        events: period.occupied
            ? selectedHallBookings.filter(request => {
                const eventStart = getMinutesSinceMidnight(request.start_time);
                const eventEnd = getMinutesSinceMidnight(request.end_time);
                return eventStart !== null && eventEnd !== null && eventStart < period.end && eventEnd > period.start;
            })
            : []
    }));

    const refreshAudienceEstimate = async scope => {
        const sequence = ++estimateSequence.current;
        const hasScope = scope.requestType === 'club' ? scope.clubIds.length > 0 : scope.collegeIds.length > 0;
        if (!hasScope) {
            setEstimatingCount(false);
            setForm(current => ({ ...current, expectedAttendees: '' }));
            return;
        }
        setEstimatingCount(true);
        try {
            const response = await clubService.estimateSeminarHallAudience({
                requestType: scope.requestType,
                clubIds: scope.clubIds,
                collegeIds: scope.collegeIds,
                courseIds: scope.courseIds,
                branchIds: scope.branchIds,
                yearNumbers: scope.yearNumbers
            });
            if (sequence === estimateSequence.current) {
                setForm(current => ({ ...current, expectedAttendees: String(response.estimatedCount ?? 0) }));
            }
        } catch (error) {
            if (sequence === estimateSequence.current) {
                toast.error(error.response?.data?.message || 'Could not estimate audience size');
            }
        } finally {
            if (sequence === estimateSequence.current) setEstimatingCount(false);
        }
    };

    const changeRequestType = requestType => {
        const nextForm = { ...form, requestType, clubIds: [], collegeIds: [], courseIds: [], branchIds: [], yearNumbers: [], expectedAttendees: '' };
        setForm(nextForm);
        setRequestCourses([]);
        setRequestBranches([]);
        estimateSequence.current += 1;
        setEstimatingCount(false);
    };

    const notifyDateAvailability = (date, hallName) => {
        if (!date) {
            setDateAlert('');
            return;
        }
        const dateRequests = requests.filter(request =>
            String(request.event_date).slice(0, 10) === date && request.status !== 'rejected'
        );
        const matchingRequests = hallName
            ? dateRequests.filter(request => request.hall_name === hallName)
            : dateRequests;
        if (matchingRequests.length) {
            const eventSummary = matchingRequests.map(request => `${request.event_title || request.event_name} (${request.hall_name})`).join(', ');
            const message = hallName
                ? `${matchingRequests.length} existing event${matchingRequests.length === 1 ? '' : 's'} at ${hallName}: ${eventSummary}`
                : `${matchingRequests.length} event${matchingRequests.length === 1 ? '' : 's'} already scheduled on this date: ${eventSummary}. Select a hall to check its free hours.`;
            setDateAlert(message);
            toast(message, { duration: 6000 });
        } else {
            const message = hallName
                ? `No existing bookings for ${hallName} on this date.`
                : 'No events are scheduled on this date. Select a hall to view its free hours.';
            setDateAlert(message);
            toast.success(message);
        }
    };

    const showRequestOnCalendar = request => {
        const dateKey = String(request.event_date).slice(0, 10);
        const [year, month] = dateKey.split('-').map(Number);
        if (!year || !month) return;
        setSelectedCalendarDate(dateKey);
        setCalendarMonth(new Date(year, month - 1, 1));
        window.requestAnimationFrame(() => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const submitRequest = async event => {
        event.preventDefault();
        if (!canCreateRequest) {
            toast.error('Create Request permission is required to submit a seminar hall request');
            return;
        }
        if (hasInvalidRequestedTimeRange) {
            toast.error('End time must be later than start time');
            return;
        }
        if (isOutsideHallHours) {
            toast.error('Requested time must be within the seminar hall opening hours');
            return;
        }
        if (conflictingBookings.length > 0) {
            toast.error(`This time overlaps an existing booking for ${form.hallName}`);
            return;
        }
        setSaving(true);
        try {
            await clubService.createSeminarHallRequest({
                ...form,
                expectedAttendees: form.expectedAttendees ? Number(form.expectedAttendees) : null
            });
            toast.success('Seminar hall request created');
            setForm(EMPTY_FORM);
            await loadRequests();
            setShowRequestForm(false);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not create request');
        } finally {
            setSaving(false);
        }
    };

    const submitHall = async event => {
        event.preventDefault();
        setSavingHall(true);
        try {
            const hallData = {
                ...hallForm,
                capacity: Number(hallForm.capacity)
            };
            if (editingHallId) {
                await clubService.updateSeminarHall(editingHallId, hallData);
                toast.success('Seminar hall updated');
            } else {
                await clubService.createSeminarHall(hallData);
                toast.success('Seminar hall created');
            }
            setHallForm(EMPTY_HALL_FORM);
            setEditingHallId(null);
            await loadHalls();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not save seminar hall');
        } finally {
            setSavingHall(false);
        }
    };

    const editHall = hall => {
        setHallForm({
            hallName: hall.hall_name,
            location: hall.location || '',
            capacity: String(hall.capacity),
            description: hall.description || '',
            openTime: hall.open_time?.slice(0, 5) || '08:00',
            closeTime: hall.close_time?.slice(0, 5) || '20:00'
        });
        setEditingHallId(hall.id);
    };

    const cancelHallEdit = () => {
        setHallForm(EMPTY_HALL_FORM);
        setEditingHallId(null);
    };

    const deleteHall = async hall => {
        if (!window.confirm(`Delete ${hall.hall_name}? Existing booking records will be kept.`)) return;
        try {
            await clubService.deleteSeminarHall(hall.id);
            toast.success('Seminar hall deleted');
            if (String(editingHallId) === String(hall.id)) cancelHallEdit();
            await loadHalls();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not delete seminar hall');
        }
    };

    const reviewRequest = async (requestId, status) => {
        setUpdatingId(requestId);
        try {
            await clubService.updateSeminarHallRequestStatus(requestId, status);
            toast.success(`Request ${status}`);
            await loadRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || `Could not ${status} request`);
        } finally {
            setUpdatingId(null);
        }
    };

    const renderRequests = rows => (
        <div className="w-full overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-[#e8f1ee] text-xs uppercase tracking-wide text-[#46655e]">
                    <tr>
                        <th className="px-4 py-3 font-semibold">Event / Organizer</th>
                        <th className="px-4 py-3 font-semibold">Hall</th>
                        <th className="px-4 py-3 font-semibold">Schedule</th>
                        <th className="px-4 py-3 font-semibold">Attendance</th>
                        <th className="px-4 py-3 font-semibold">Purpose</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map(request => {
                        const requestYears = getRequestYears(request);
                        return (
                        <tr
                            key={request.id}
                            tabIndex={0}
                            title="View this request in the calendar"
                            onClick={() => showRequestOnCalendar(request)}
                            onKeyDown={event => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    showRequestOnCalendar(request);
                                }
                            }}
                            className="cursor-pointer align-top transition-colors hover:bg-[#f4f8f6] focus:bg-[#f4f8f6] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700"
                        >
                            <td className="px-4 py-4">
                                <p className="font-semibold text-slate-900">{request.event_name}</p>
                                <p className="mt-1 text-xs text-slate-500">{request.organizer}</p>
                                <p className="mt-1 text-xs font-medium text-teal-800">
                                    {request.request_type === 'college'
                                        ? `College request${requestYears.length ? ` · Year${requestYears.length === 1 ? '' : 's'} ${requestYears.join(', ')}` : ' · All years'}`
                                        : 'Club request'}
                                </p>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{request.hall_name}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-slate-700">
                                <p>{formatDate(request.event_date)}</p>
                                <p className="mt-1 text-xs text-slate-500">{formatTime(request.start_time)} - {formatTime(request.end_time)}</p>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{request.expected_attendees || 'Not specified'}</td>
                            <td className="max-w-xs px-4 py-4 text-slate-600">
                                <p className="line-clamp-3">{request.purpose}</p>
                                {request.admin_remarks && <p className="mt-2 text-xs text-slate-500">Admin: {request.admin_remarks}</p>}
                            </td>
                            <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${request.status === 'approved'
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : request.status === 'rejected'
                                        ? 'bg-rose-50 text-rose-800'
                                        : 'bg-amber-50 text-amber-800'}`}>
                                    {request.status}
                                </span>
                            </td>
                            <td className="px-4 py-4">
                                {canManage && request.status === 'pending' ? (
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={updatingId === request.id}
                                            onClick={event => {
                                                event.stopPropagation();
                                                reviewRequest(request.id, 'approved');
                                            }}
                                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                                        >
                                            <Check size={14} /> Approve
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updatingId === request.id}
                                            onClick={event => {
                                                event.stopPropagation();
                                                reviewRequest(request.id, 'rejected');
                                            }}
                                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                        >
                                            <XCircle size={14} /> Reject
                                        </button>
                                    </div>
                                ) : <span className="text-xs text-slate-400">Reviewed</span>}
                            </td>
                        </tr>
                    ); })}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                                No requests match these filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <main className="body-font min-h-screen w-full space-y-6 bg-[#f3f7f5] px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
            <header className="flex flex-col gap-4 border-b border-[#d8e5e0] pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#17675c] text-white shadow-sm">
                        <Building2 size={21} />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Seminar Hall Requests</h1>
                        <p className="text-sm text-slate-500">Manage halls and review campus bookings</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {canCreateRequest && (
                    <button
                        type="button"
                        onClick={() => {
                            setShowRequestForm(true);
                            setShowHallForm(false);
                        }}
                        aria-expanded={showRequestForm}
                        aria-haspopup="dialog"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900"
                    >
                        <CalendarClock size={15} /> Create Request
                    </button>
                    )}
                    {canManage && (
                    <button
                        type="button"
                        onClick={() => {
                            setShowHallForm(true);
                            setShowRequestForm(false);
                        }}
                        aria-expanded={showHallForm}
                        aria-haspopup="dialog"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-700 bg-white px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50"
                    >
                        <Plus size={15} /> Seminar Halls Management
                    </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { loadRequests(); loadHalls(); }}
                        disabled={loading}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-amber-50 disabled:opacity-50"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </header>

            {showHallForm && (
                <Dialog
                    open={showHallForm}
                    onClose={() => setShowHallForm(false)}
                    title="Seminar Halls Management"
                    description="Add, edit, and remove halls available for booking."
                    titleId="create-hall-title"
                >
                <section className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <form onSubmit={submitHall} className="max-w-2xl space-y-5">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">{editingHallId ? 'Edit Seminar Hall' : 'Add Seminar Hall'}</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                                Hall name <span className="text-rose-600">*</span>
                                <input required value={hallForm.hallName} onChange={event => setHallForm({ ...hallForm, hallName: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700">
                                Seating capacity <span className="text-rose-600">*</span>
                                <input required type="number" min="1" step="1" value={hallForm.capacity} onChange={event => setHallForm({ ...hallForm, capacity: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700">
                                Location
                                <input value={hallForm.location} onChange={event => setHallForm({ ...hallForm, location: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700">
                                Opens at <span className="text-rose-600">*</span>
                                <input required type="time" value={hallForm.openTime} max={hallForm.closeTime || undefined} onChange={event => setHallForm({ ...hallForm, openTime: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700">
                                Closes at <span className="text-rose-600">*</span>
                                <input required type="time" value={hallForm.closeTime} min={hallForm.openTime || undefined} onChange={event => setHallForm({ ...hallForm, closeTime: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                                Description / facilities
                                <textarea rows="3" value={hallForm.description} onChange={event => setHallForm({ ...hallForm, description: event.target.value })} className="w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="submit" disabled={savingHall} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
                                {editingHallId ? <Pencil size={16} /> : <Plus size={16} />}
                                {savingHall ? 'Saving...' : editingHallId ? 'Save Changes' : 'Create Hall'}
                            </button>
                            {editingHallId && (
                                <button type="button" onClick={cancelHallEdit} className="min-h-10 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    Cancel Edit
                                </button>
                            )}
                        </div>
                    </form>
                    <section>
                        <h3 className="mb-3 text-lg font-bold text-slate-900">Existing Halls <span className="text-sm font-medium text-slate-500">{halls.length}</span></h3>
                        <div className="divide-y divide-slate-200 border-y border-slate-200">
                            {halls.map(hall => (
                                <article key={hall.id} className="flex items-start justify-between gap-4 py-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <Building2 size={18} className="mt-0.5 shrink-0 text-teal-800" />
                                        <div className="min-w-0">
                                            <h3 className="font-semibold text-slate-900">{hall.hall_name}</h3>
                                            <p className="mt-1 text-sm text-slate-500">{hall.location || 'Location not specified'}{hall.description ? ` · ${hall.description}` : ''}</p>
                                            <p className="mt-1 text-xs font-medium text-teal-800">Open {formatTime(hall.open_time)} - {formatTime(hall.close_time)}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <span className="mr-2 text-sm text-slate-700">{hall.capacity} seats</span>
                                        <button
                                            type="button"
                                            onClick={() => editHall(hall)}
                                            className="rounded-md p-2 text-slate-500 hover:bg-teal-50 hover:text-teal-800"
                                            aria-label={`Edit ${hall.hall_name}`}
                                            title="Edit hall"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteHall(hall)}
                                            className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                            aria-label={`Delete ${hall.hall_name}`}
                                            title="Delete hall"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </article>
                            ))}
                            {halls.length === 0 && <p className="py-8 text-sm text-slate-500">No seminar halls have been created.</p>}
                        </div>
                    </section>
                </section>
                </Dialog>
            )}

            {canCreateRequest && showRequestForm && (
                <Dialog
                    open={showRequestForm}
                    onClose={() => setShowRequestForm(false)}
                    title="Create Seminar Hall Request"
                    description="Submit a booking request for review."
                    titleId="create-request-title"
                >
                <form onSubmit={submitRequest} className="max-w-4xl space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                            <span className="block text-sm font-medium text-slate-700">Request audience</span>
                            <div className="inline-flex rounded-md border border-slate-300 bg-white p-1" role="group" aria-label="Request audience type">
                                {[
                                    { value: 'club', label: 'Club' },
                                    { value: 'college', label: 'College / Branch' }
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => changeRequestType(option.value)}
                                        aria-pressed={form.requestType === option.value}
                                        className={`rounded px-3 py-2 text-sm font-semibold ${form.requestType === option.value ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {form.requestType === 'club' ? (
                            <div className="sm:col-span-2">
                                <MultiSelectField
                                    label="Student clubs *"
                                    options={clubs.map(club => ({ value: club.id, label: club.name || club.club_name }))}
                                    selected={form.clubIds}
                                    onChange={clubIds => {
                                    const nextForm = { ...form, clubIds };
                                    setForm(nextForm);
                                    refreshAudienceEstimate(nextForm);
                                    }}
                                    placeholder="Select one or more clubs"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                                <MultiSelectField
                                    label="Colleges *"
                                    options={colleges.map(college => ({ value: college.id, label: college.name }))}
                                    selected={form.collegeIds}
                                    onChange={collegeIds => {
                                        const nextForm = { ...form, collegeIds, courseIds: [], branchIds: [], yearNumbers: [] };
                                        setForm(nextForm);
                                        setRequestBranches([]);
                                        loadRequestCourses(collegeIds);
                                        refreshAudienceEstimate(nextForm);
                                    }}
                                    placeholder="Select one or more colleges"
                                />
                                <MultiSelectField
                                    label="Courses"
                                    options={requestCourses.map(course => ({ value: course.id, label: `${course.name}${course.collegeId ? ` · ${colleges.find(college => String(college.id) === String(course.collegeId))?.name || ''}` : ''}` }))}
                                    selected={form.courseIds}
                                    disabled={form.collegeIds.length === 0}
                                    onChange={courseIds => {
                                        const nextForm = { ...form, courseIds, branchIds: [], yearNumbers: [] };
                                        setForm(nextForm);
                                        loadRequestBranches(courseIds);
                                        refreshAudienceEstimate(nextForm);
                                    }}
                                    placeholder="All courses"
                                />
                                <MultiSelectField
                                    label="Branches"
                                    options={requestBranches.map(branch => ({ value: branch.id, label: `${branch.name}${branch.courseId ? ` · ${requestCourses.find(course => String(course.id) === String(branch.courseId))?.name || ''}` : ''}` }))}
                                    selected={form.branchIds}
                                    disabled={form.courseIds.length === 0}
                                    onChange={branchIds => {
                                        const nextForm = { ...form, branchIds, yearNumbers: [] };
                                        setForm(nextForm);
                                        refreshAudienceEstimate(nextForm);
                                    }}
                                    placeholder="All branches"
                                />
                                <MultiSelectField
                                    label="Study years"
                                    options={availableStudyYears.map(year => ({ value: year, label: `Year ${year}` }))}
                                    selected={form.yearNumbers}
                                    disabled={form.collegeIds.length === 0}
                                    onChange={yearNumbers => {
                                        const nextForm = { ...form, yearNumbers };
                                        setForm(nextForm);
                                        refreshAudienceEstimate(nextForm);
                                    }}
                                    placeholder="All years"
                                />
                            </div>
                        )}
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            Event name <span className="text-rose-600">*</span>
                            <input required value={form.eventName} onChange={event => setForm({ ...form, eventName: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            Organizer / department <span className="text-rose-600">*</span>
                            <input required value={form.organizer} onChange={event => setForm({ ...form, organizer: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            Seminar hall <span className="text-rose-600">*</span>
                            <select required value={form.hallName} onChange={event => {
                                const hallName = event.target.value;
                                setForm(current => ({ ...current, hallName }));
                                if (form.eventDate) notifyDateAvailability(form.eventDate, hallName);
                            }} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15">
                                <option value="">Select a seminar hall</option>
                                {halls.map(hall => (
                                    <option key={hall.id} value={hall.hall_name}>
                                        {[hall.hall_name, `${hall.capacity} seats`, hall.location, hall.description, `${formatTime(hall.open_time)}-${formatTime(hall.close_time)}`].filter(Boolean).join(' · ')}
                                    </option>
                                ))}
                            </select>
                            {halls.length === 0 && <span className="block text-xs text-slate-500">Create a seminar hall before submitting a booking request.</span>}
                            {selectedHall && (
                                <span className="block rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                                    <strong className="font-semibold text-slate-800">{selectedHall.capacity} seats</strong>
                                    {selectedHall.location && ` · ${selectedHall.location}`}
                                    {selectedHall.description && ` · ${selectedHall.description}`}
                                    {` · Open ${formatTime(selectedHall.open_time)}-${formatTime(selectedHall.close_time)}`}
                                </span>
                            )}
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            Event date <span className="text-rose-600">*</span>
                            <input required type="date" min={new Date().toISOString().slice(0, 10)} value={form.eventDate} onChange={event => {
                                const eventDate = event.target.value;
                                setForm(current => ({ ...current, eventDate }));
                                notifyDateAvailability(eventDate, form.hallName);
                            }} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            {form.eventDate && (
                                <div role="status" aria-live="polite" className={`space-y-3 rounded-md border p-3 text-xs font-normal ${selectedDateRequests.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                                    <p className="font-medium">{dateAlert || 'Select a hall to check its availability.'}</p>
                                    {form.hallName ? (
                                        <>
                                            <p className="font-semibold">Availability for {selectedHall.hall_name} ({formatTime(selectedHall.open_time)}-{formatTime(selectedHall.close_time)})</p>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <section className="rounded-md border border-emerald-200 bg-white p-3" aria-labelledby="available-periods-heading">
                                                    <h3 id="available-periods-heading" className="mb-2 font-semibold text-emerald-800">Available</h3>
                                                    {availabilityPeriods.filter(period => !period.occupied).length > 0 ? (
                                                        <ul className="space-y-1 text-emerald-800">
                                                            {availabilityPeriods.filter(period => !period.occupied).map(period => (
                                                                <li key={period.start}>{formatMinutes(period.start)}-{formatMinutes(period.end)}</li>
                                                            ))}
                                                        </ul>
                                                    ) : <p className="text-slate-500">No available periods.</p>}
                                                </section>
                                                <section className="rounded-md border border-rose-200 bg-white p-3" aria-labelledby="unavailable-periods-heading">
                                                    <h3 id="unavailable-periods-heading" className="mb-2 font-semibold text-rose-800">Not Available</h3>
                                                    {availabilityPeriods.filter(period => period.occupied).length > 0 ? (
                                                        <ul className="space-y-2 text-rose-800">
                                                            {availabilityPeriods.filter(period => period.occupied).map(period => (
                                                                <li key={period.start}>
                                                                    <p>{formatMinutes(period.start)}-{formatMinutes(period.end)}</p>
                                                                    {period.events.map(request => (
                                                                        <p key={request.id} className="text-xs text-slate-600">
                                                                            {request.event_title || request.event_name} · {request.status}
                                                                        </p>
                                                                    ))}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : <p className="text-slate-500">No busy periods.</p>}
                                                </section>
                                            </div>
                                        </>
                                    ) : (
                                        selectedDateRequests.length > 0 && (
                                            <ul className="space-y-1 border-t border-amber-200 pt-2">
                                                {selectedDateRequests.map(request => (
                                                    <li key={request.id}>
                                                        {request.event_title || request.event_name} · {request.hall_name} · {formatTime(request.start_time)}-{formatTime(request.end_time)}
                                                    </li>
                                                ))}
                                            </ul>
                                        )
                                    )}
                                </div>
                            )}
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            Start time <span className="text-rose-600">*</span>
                            <input required type="time" value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            {form.startTime && <span className="block text-xs font-normal text-slate-500">Selected: {formatTime(form.startTime)}</span>}
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            End time <span className="text-rose-600">*</span>
                            <input required type="time" min={form.startTime || undefined} value={form.endTime} onChange={event => setForm({ ...form, endTime: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                            {form.endTime && <span className="block text-xs font-normal text-slate-500">Selected: {formatTime(form.endTime)}</span>}
                            {hasInvalidRequestedTimeRange && <span role="alert" className="block text-xs font-medium text-rose-700">{`End time (${formatTime(form.endTime)}) must be later than start time (${formatTime(form.startTime)}). Use 24-hour time for afternoon hours, e.g. 3:00 PM is 15:00.`}</span>}
                            {isOutsideHallHours && <span role="alert" className="block text-xs font-medium text-rose-700">Choose a time within this hall's opening hours ({formatTime(selectedHall.open_time)}-{formatTime(selectedHall.close_time)}).</span>}
                            {conflictingBookings.map(request => (
                                <span key={request.id} role="alert" className="block text-xs font-medium text-rose-700">
                                    Conflicts with {request.event_title || request.event_name} ({formatTime(request.start_time)}-{formatTime(request.end_time)}).
                                </span>
                            ))}
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                            Estimated attendee count {estimatingCount && <span className="font-normal text-slate-500">Updating estimate...</span>}
                            <input type="number" min="0" value={form.expectedAttendees} onChange={event => setForm({ ...form, expectedAttendees: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 sm:max-w-xs" />
                            <span className="block text-xs font-normal text-slate-500">Estimated from the selected audience; you can edit this count.</span>
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                            Purpose / event details <span className="text-rose-600">*</span>
                            <textarea required rows="4" value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} className="w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                        </label>
                    </div>
                    <button type="submit" disabled={saving || hasInvalidRequestedTimeRange || isOutsideHallHours || conflictingBookings.length > 0} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">
                        <CalendarClock size={16} /> {saving ? 'Submitting...' : 'Submit Request'}
                    </button>
                </form>
                </Dialog>
            )}

            <section className="space-y-4" aria-labelledby="approvals-heading">
                <div className="flex items-center gap-2">
                    <CheckCircle size={18} className="text-emerald-800" />
                    <h2 id="approvals-heading" className="text-lg font-bold text-slate-900">Approvals &amp; Rejections</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{requests.length}</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="inline-flex w-fit max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white p-0.5 shadow-sm" role="group" aria-label="Filter requests by status">
                        {['all', 'pending', 'approved', 'rejected'].map(status => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setStatusFilter(status)}
                                aria-pressed={statusFilter === status}
                                className={`shrink-0 rounded px-3 py-2 text-sm font-semibold capitalize ${statusFilter === status ? 'bg-[#17675c] text-white shadow-sm' : 'text-slate-600 hover:bg-amber-50'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        Hall
                        <select
                            value={hallFilter}
                            onChange={event => setHallFilter(event.target.value)}
                            className="min-h-10 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        >
                            <option value="all">All halls</option>
                            {halls.map(hall => <option key={hall.id} value={hall.hall_name}>{hall.hall_name}</option>)}
                        </select>
                    </label>
                </div>
                {loading
                    ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" /> Loading requests...</div>
                    : renderRequests(filteredRequests)}
            </section>

            <section ref={calendarRef} className="scroll-mt-6 space-y-4 border-t border-[#d8e5e0] pt-6" aria-labelledby="occupancy-calendar-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="occupancy-calendar-heading" className="text-lg font-bold text-slate-900">Seminar Hall Occupancy</h2>
                        <p className="text-sm text-slate-500">All seminar hall requests are marked by status.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="Previous month"
                            onClick={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50"
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <p className="min-w-32 text-center text-sm font-semibold text-slate-800">
                            {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </p>
                        <button
                            type="button"
                            aria-label="Next month"
                            onClick={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50"
                        >
                            <ChevronRight size={17} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
                    <div>
                        <div className="grid grid-cols-7 border-l border-t border-slate-200">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                <div key={day} className="border-b border-r border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500">{day}</div>
                            ))}
                            {calendarDays.map(day => {
                                const dayKey = getDateKey(day);
                                const dayRequests = requestsByDate[dayKey] || [];
                                const hasBookings = dayRequests.length > 0;
                                const markerColor = dayRequests.some(request => request.status === 'pending')
                                    ? 'bg-amber-600'
                                    : dayRequests.some(request => request.status === 'approved')
                                        ? 'bg-emerald-700'
                                        : 'bg-rose-600';
                                const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                                const isSelected = dayKey === selectedCalendarDate;
                                return (
                                    <button
                                        key={dayKey}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCalendarDate(dayKey);
                                            if (!inCurrentMonth) setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                                        }}
                                        aria-label={`${formatDate(dayKey)}${hasBookings ? `, ${dayRequests.length} seminar hall request${dayRequests.length === 1 ? '' : 's'}` : ''}`}
                                        aria-pressed={isSelected}
                                        className={`flex aspect-square min-h-10 flex-col items-center justify-center gap-1 border-b border-r border-slate-200 text-sm ${isSelected
                                            ? 'bg-[#17675c] font-bold text-white'
                                            : !inCurrentMonth
                                                ? 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                                : hasBookings
                                                    ? 'bg-amber-50 font-semibold text-slate-800 hover:bg-amber-100'
                                                    : 'bg-white text-slate-800 hover:bg-emerald-50'}`}
                                    >
                                        <span>{day.getDate()}</span>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasBookings ? (isSelected ? 'bg-white' : markerColor) : 'bg-transparent'}`} />
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-700" /> Approved</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" /> Pending</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600" /> Rejected</span>
                        </p>
                    </div>

                    <aside className="min-h-48 border-l-2 border-emerald-700 pl-4">
                        <h3 className="font-semibold text-slate-900">{formatDate(selectedCalendarDate)}</h3>
                        <div className="mt-3 space-y-3">
                            {selectedDateBookings.map(request => (
                                <article key={request.id} className="space-y-2 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-4 shadow-sm">
                                    <header className="flex items-start justify-between gap-3">
                                        <h3 className="font-semibold text-slate-900">{request.event_name}</h3>
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${request.status === 'approved'
                                            ? 'bg-emerald-50 text-emerald-800'
                                            : request.status === 'pending'
                                                ? 'bg-amber-50 text-amber-800'
                                                : 'bg-rose-50 text-rose-800'}`}>{request.status}</span>
                                    </header>
                                    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
                                        <dt className="text-slate-500">Audience</dt>
                                        <dd className="text-slate-800">
                                            {request.request_type === 'college' ? 'College / Branch' : 'Club'}
                                            {request.audience_details && ` · ${request.audience_details}`}
                                        </dd>
                                        <dt className="text-slate-500">Organizer</dt>
                                        <dd className="text-slate-800">{request.organizer || 'Not specified'}</dd>
                                        <dt className="text-slate-500">Seminar hall</dt>
                                        <dd className="text-slate-800">{request.hall_name}</dd>
                                        <dt className="text-slate-500">Time</dt>
                                        <dd className="text-slate-800">{formatTime(request.start_time)} - {formatTime(request.end_time)}</dd>
                                        <dt className="text-slate-500">Attendees</dt>
                                        <dd className="text-slate-800">{request.expected_attendees ?? 'Not specified'}</dd>
                                        <dt className="text-slate-500">Requested by</dt>
                                        <dd className="text-slate-800">{request.requested_by_name || 'Unknown'}</dd>
                                        <dt className="text-slate-500">Approved by</dt>
                                        <dd className="text-slate-800">{request.reviewed_by_name || 'Not recorded'}</dd>
                                    </dl>
                                    {request.purpose && <p className="text-sm text-slate-700"><span className="font-medium">Purpose:</span> {request.purpose}</p>}
                                    {request.equipment_needed && <p className="text-sm text-slate-700"><span className="font-medium">Equipment:</span> {request.equipment_needed}</p>}
                                    {request.admin_remarks && <p className="text-sm text-slate-700"><span className="font-medium">Admin remarks:</span> {request.admin_remarks}</p>}
                                </article>
                            ))}
                            {selectedDateBookings.length === 0 && (
                                <p className="text-sm text-slate-500">No seminar hall requests on this date.</p>
                            )}
                        </div>
                    </aside>
                </div>
            </section>
        </main>
    );
};

export default SeminarHallRequests;
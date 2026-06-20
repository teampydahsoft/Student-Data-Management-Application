import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, User, CheckCircle, Smartphone, MapPin, BarChart3, Clock, Vote, FileText, ArrowRight, Calendar, X, Users, AlertCircle, RefreshCw, BadgeCheck, ShieldAlert, Sparkles, LogOut } from 'lucide-react';
import { SkeletonBox, SkeletonCard } from '../../components/SkeletonLoader';
import { VerifyProfileDialog } from '../../components/student/VerifyProfileDialog';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import { serviceService } from '../../services/serviceService';
import clubService from '../../services/clubService';
import { toast } from 'react-hot-toast';
import { getTicketAppUrl } from '../../utils/ticketAppUrl';

const Dashboard = () => {
    const { user, token } = useAuthStore(); // Get token for SSO
    const navigate = useNavigate();
    const [studentData, setStudentData] = useState(null);

    // Helper to check if a component is enabled
    const isEnabled = (key) => {
        if (!layoutSettings) return true; // Default to true if settings haven't loaded
        return layoutSettings[key] !== false;
    };

    const ticketAppUrl = useMemo(() => getTicketAppUrl('/student/my-tickets'), [token]);
    const [loading, setLoading] = useState(true);

    // Additional Data States
    const [attendanceHistory, setAttendanceHistory] = useState(null);
    const [polls, setPolls] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [serviceRequests, setServiceRequests] = useState([]);

    const [events, setEvents] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [layoutSettings, setLayoutSettings] = useState(null);
    const [hourlySummary, setHourlySummary] = useState(null);
    const [academicContent, setAcademicContent] = useState({ tests: 0, notes: 0 });
    const [internalMarksCount, setInternalMarksCount] = useState(0);
    const [todayTimetable, setTodayTimetable] = useState([]);

    // UI States
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
    const hasCheckedAnnouncements = useRef(false);
    const [showEventModal, setShowEventModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [showBirthday, setShowBirthday] = useState(false);
    const [showVerifyProfile, setShowVerifyProfile] = useState(false);

    // Is today the student's birthday? (for theme and welcome styling)
    const isBirthday = useMemo(() => {
        const data = studentData || user;
        if (!data) return false;
        const dobStr = data.dob || data.student_data?.['DOB (Date of Birth - DD-MM-YYYY)'] || data.student_data?.dob;
        if (!dobStr) return false;
        const dob = new Date(dobStr);
        const today = new Date();
        if (isNaN(dob.getTime())) return false;
        return dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth();
    }, [studentData, user]);

    // Check if profile is verified
    const isProfileVerified = useMemo(() => {
        if (!studentData) return true; // Default true while loading to prevent flashes
        let parsedData = {};
        if (studentData.student_data) {
            if (typeof studentData.student_data === 'string') {
                try { parsedData = JSON.parse(studentData.student_data); } catch (e) { }
            } else {
                parsedData = studentData.student_data;
            }
        }
        return !!parsedData.profile_verified;
    }, [studentData]);

    // Initial Data Fetch
    useEffect(() => {
        if (studentData) {
            const checkBirthday = () => {
                const dobStr = studentData.dob || studentData.student_data?.['DOB (Date of Birth - DD-MM-YYYY)'] || studentData.student_data?.dob;
                if (!dobStr) return;

                const dob = new Date(dobStr);
                const today = new Date();

                // Check if date is valid
                if (isNaN(dob.getTime())) return;

                const isBirthday =
                    dob.getDate() === today.getDate() &&
                    dob.getMonth() === today.getMonth();

                if (isBirthday) {
                    const sessionKey = `birthday_shown_${new Date().getFullYear()}`;
                    if (!sessionStorage.getItem(sessionKey)) {
                        setShowBirthday(true);
                        sessionStorage.setItem(sessionKey, 'true');
                        // Trigger confetti effect if available or just clean UI (UI is handled)
                    }
                }
            };
            checkBirthday();

            // Auto popup verify profile
            if (!isProfileVerified) {
                const sessionKey = `verify_profile_shown`;
                if (!sessionStorage.getItem(sessionKey)) {
                    // Small delay to let the page render properly before popping up
                    const timer = setTimeout(() => {
                        setShowVerifyProfile(true);
                        sessionStorage.setItem(sessionKey, 'true');
                    }, 1000);
                    return () => clearTimeout(timer);
                }
            }
        }
    }, [studentData, isProfileVerified]);

    // Initial Data Fetch
    useEffect(() => {
        // Reset the check flag when user changes (new session)
        hasCheckedAnnouncements.current = false;

        const fetchAllData = async () => {
            try {
                if (!user?.admission_number) return;

                const [profileRes, announcementsRes, pollsRes, attendanceRes, servicesRes, eventsRes, clubsRes, hourlyRes, contentRes, marksRes, timetableRes, periodSlotsRes, layoutRes] = await Promise.allSettled([
                    api.get(`/students/${user.admission_number}`),
                    api.get('/announcements/student?limit=5'),
                    api.get('/polls/student'),
                    api.get('/attendance/student', { params: { _t: Date.now() } }),
                    serviceService.getRequests(),
                    api.get('/events/student'),
                    clubService.getClubs(),
                    api.get('/hourly-attendance/student-summary'),
                    api.get('/academic-content'),
                    api.get('/internal-marks/student/me'),
                    api.get('/timetable', { params: { branch_id: user.branch_id, year: user.current_year, semester: user.current_semester || 1 } }),
                    api.get('/period-slots', { params: { college_id: user.college_id } }),
                    api.get('/settings/student-layout')
                ]);

                // Handle Profile
                if (profileRes.status === 'fulfilled' && profileRes.value.data.success) {
                    setStudentData(profileRes.value.data.data);
                }

                // Handle Announcements
                if (announcementsRes.status === 'fulfilled' && announcementsRes.value.data.success) {
                    const allAnnouncements = announcementsRes.value.data.data;

                    // Sort announcements by date descending (latest first)
                    const sortedAnnouncements = [...allAnnouncements].sort((a, b) =>
                        new Date(b.created_at) - new Date(a.created_at)
                    );

                    setAnnouncements(sortedAnnouncements);

                    // Show latest unseen announcement popup (only check once per session)
                    if (!hasCheckedAnnouncements.current && !showAnnouncement && sortedAnnouncements.length > 0) {
                        hasCheckedAnnouncements.current = true;

                        // We only care about the absolute latest announcement
                        const latestAnnouncement = sortedAnnouncements[0];
                        const seenIds = JSON.parse(localStorage.getItem('seen_announcements') || '[]');
                        const seenIdsStr = seenIds.map(id => String(id));

                        // Only show popup if the ABSOLUTE LATEST announcement is unseen
                        if (!seenIdsStr.includes(String(latestAnnouncement.id))) {
                            setCurrentAnnouncement(latestAnnouncement);
                            setShowAnnouncement(true);
                        }
                    }
                }

                // Handle Polls
                if (pollsRes.status === 'fulfilled' && pollsRes.value.data.success) {
                    setPolls(pollsRes.value.data.data);
                }

                // Handle Attendance
                if (attendanceRes.status === 'fulfilled' && attendanceRes.value.data.success) {
                    setAttendanceHistory(attendanceRes.value.data.data);
                } else if (attendanceRes.status === 'rejected') {
                    console.error('Failed to fetch attendance:', attendanceRes.reason);
                }

                // Handle Services
                if (servicesRes.status === 'fulfilled' && servicesRes.value.data) {
                    setServiceRequests(servicesRes.value.data);
                }

                // Handle Events
                if (eventsRes.status === 'fulfilled' && eventsRes.value.data.success) {
                    setEvents(eventsRes.value.data.data);
                }

                // Handle Clubs
                if (clubsRes.status === 'fulfilled' && clubsRes.value.success) {
                    setClubs(clubsRes.value.data || []);
                }
                if (hourlyRes.status === 'fulfilled' && hourlyRes.value.data?.success && hourlyRes.value.data?.data) {
                    setHourlySummary(hourlyRes.value.data.data);
                }
                if (contentRes.status === 'fulfilled' && contentRes.value.data?.success && Array.isArray(contentRes.value.data?.data)) {
                    const list = contentRes.value.data.data;
                    const now = new Date().toISOString().slice(0, 10);
                    setAcademicContent({
                        tests: list.filter((c) => c.type === 'test' && (!c.due_date || c.due_date >= now)).length,
                        notes: list.filter((c) => c.type === 'note').length,
                    });
                }
                if (marksRes.status === 'fulfilled' && marksRes.value.data?.success && Array.isArray(marksRes.value.data?.data)) {
                    setInternalMarksCount(marksRes.value.data.data.length);
                }

                if (timetableRes.status === 'fulfilled' && timetableRes.value.data?.success && periodSlotsRes.status === 'fulfilled' && periodSlotsRes.value.data?.success) {
                    const allTimetable = timetableRes.value.data.data;
                    const allSlots = periodSlotsRes.value.data.data;
                    const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];
                    const currentDay = dayMap[new Date().getDay()];

                    const todayEntries = allTimetable.filter(item => item.day_of_week === currentDay);
                    // Merge entry with slot info
                    const merged = allSlots.map(slot => {
                        const entry = todayEntries.find(e => e.period_slot_id === slot.id);
                        return { ...slot, entry };
                    });
                    setTodayTimetable(merged);
                }

                // Handle Layout Settings
                if (layoutRes && layoutRes.status === 'fulfilled' && layoutRes.value.data?.success) {
                    setLayoutSettings(layoutRes.value.data.data);
                }

            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();

        // Refresh attendance when page becomes visible (user switches back to tab)
        // Throttle to at most once every 2 minutes to avoid hammering the server
        let lastAttendanceRefresh = 0;
        const ATTENDANCE_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

        const handleVisibilityChange = () => {
            if (!document.hidden && user?.admission_number) {
                const now = Date.now();
                if (now - lastAttendanceRefresh < ATTENDANCE_REFRESH_INTERVAL) return;
                lastAttendanceRefresh = now;
                // Refresh attendance data when user comes back to the tab
                api.get('/attendance/student')
                    .then(response => {
                        if (response.data.success) {
                            setAttendanceHistory(response.data.data);
                        }
                    })
                    .catch(error => {
                        console.error('Error refreshing attendance:', error);
                    });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);

    // Derived Attendance Stats
    const attendanceStats = useMemo(() => {
        if (!attendanceHistory?.semester?.series) return null;

        const series = attendanceHistory.semester.series;
        let present = 0;
        let absent = 0;
        let activeDays = 0; // Working days (excluding holidays)

        // Find Today's status from history if available
        // Use local date (not UTC) to avoid timezone shift in IST
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const isTodaySunday = now.getDay() === 0;
        let todayStatus = 'not marked';

        const todayEntry = series.find(d => d.date.startsWith(todayStr));
        if (todayEntry) {
            todayStatus = todayEntry.status === 'present' ? 'present' :
                todayEntry.status === 'absent' ? 'absent' :
                    todayEntry.isHoliday ? 'holiday' : 'not marked';
        }

        // If today is Sunday and not yet marked, treat as holiday (no class)
        if (todayStatus === 'not marked' && isTodaySunday) {
            todayStatus = 'holiday';
        }

        // Process entire semester
        series.forEach(day => {
            if (!day.isHoliday) {
                activeDays++;
                if (day.status === 'present') present++;
                else if (day.status === 'absent') absent++;
            }
        });

        const markedDays = present + absent;
        const percentage = markedDays > 0 ? ((present / markedDays) * 100).toFixed(1) : '0.0';

        return {
            todayStatus,
            present,
            absent,
            percentage
        };
    }, [attendanceHistory]);

    // Quick helper for percentages
    const calcPct = (present, absent) => {
        const marked = (present || 0) + (absent || 0);
        if (!marked) return 0;
        return (present / marked) * 100;
    };

    const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
    const refreshFeed = async () => {
        if (!user?.admission_number || isRefreshingFeed) return;
        setIsRefreshingFeed(true);
        try {
            const [announcementsRes, pollsRes] = await Promise.allSettled([
                api.get('/announcements/student?limit=5'),
                api.get('/polls/student')
            ]);

            if (announcementsRes.status === 'fulfilled' && announcementsRes.value.data.success) {
                const sortedAnnouncements = [...announcementsRes.value.data.data].sort((a, b) =>
                    new Date(b.created_at) - new Date(a.created_at)
                );
                setAnnouncements(sortedAnnouncements);
            }
            if (pollsRes.status === 'fulfilled' && pollsRes.value.data.success) {
                setPolls(pollsRes.value.data.data);
            }
        } catch (error) {
            console.error('Error refreshing feed:', error);
            toast.error('Failed to refresh feed');
        } finally {
            setIsRefreshingFeed(false);
        }
    };


    // Combined Feed (Announcements + Active Polls)
    const feedItems = useMemo(() => {
        const items = [];

        polls.forEach(poll => {
            items.push({
                type: 'poll',
                date: new Date(poll.created_at),
                data: poll
            });
        });

        announcements.forEach(ann => {
            items.push({
                type: 'announcement',
                date: new Date(ann.created_at),
                data: ann
            });
        });

        return items.sort((a, b) => b.date - a.date);
    }, [polls, announcements]);

    // Filter Upcoming Events
    const upcomingEvents = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Include today's events from start of day
        return events
            .filter(e => new Date(e.event_date) >= now)
            .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
    }, [events]);


    // Helpers
    const displayData = studentData || user;
    const get = (path, fallback = 'N/A') => displayData?.[path] || fallback;

    const normalizeFeeStatus = () => {
        const rawSource = displayData?.fee_status
            || (displayData?.student_data ? (displayData.student_data['Fee Status'] || displayData.student_data.fee_status) : '')
            || '';
        const raw = String(rawSource).trim().toLowerCase();
        const normalized = raw.replace(/\s+/g, '_');
        const isCompleted = normalized === 'completed' || normalized === 'no_due' || normalized === 'nodue' || raw.includes('complete') || raw.includes('paid');
        const isPartial = normalized === 'partially_completed' || normalized === 'permitted' || raw.includes('partial');
        if (isCompleted) return 'Completed';
        if (isPartial) return 'Partially Completed';
        return 'Pending';
    };

    const normalizeRegistrationStatus = () => {
        const rawSource = displayData?.registration_status
            || (displayData?.student_data ? (displayData.student_data['Registration Status'] || displayData.student_data.registration_status) : '')
            || '';
        const raw = String(rawSource).trim().toLowerCase();
        return raw === 'completed' ? 'Completed' : 'Pending';
    };

    const registrationLabel = normalizeRegistrationStatus();
    // User Request: If registration is completed, change fee status to 'Completed' (No Due) automatically
    const feeStatusLabel = registrationLabel === 'Completed' ? 'Completed' : normalizeFeeStatus();

    // Registration is considered fully complete if the registration status says so
    const isRegistrationCompleted = registrationLabel === 'Completed';

    // Helper function to truncate content to 1-2 lines
    const truncateContent = (text, maxLength = 150) => {
        if (!text) return '';
        // Remove extra whitespace and newlines
        const cleanText = text.replace(/\s+/g, ' ').trim();
        if (cleanText.length <= maxLength) return cleanText;
        // Find the last space before maxLength to avoid cutting words
        const truncated = cleanText.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    };

    const closeAnnouncement = () => {
        if (currentAnnouncement) {
            const seenIds = JSON.parse(localStorage.getItem('seen_announcements') || '[]');
            // Convert all IDs to strings for consistent comparison
            const seenIdsStr = seenIds.map(id => String(id));
            const currentIdStr = String(currentAnnouncement.id);

            if (!seenIdsStr.includes(currentIdStr)) {
                // Store the original ID format (number or string) as it was
                seenIds.push(currentAnnouncement.id);
                localStorage.setItem('seen_announcements', JSON.stringify(seenIds));
            }
        }
        setShowAnnouncement(false);
        setCurrentAnnouncement(null);
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        // Handle "09:30:00" or "09:30"
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        return `${h}:${minutes} ${ampm}`;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-700';
            case 'ready_to_collect': return 'bg-purple-100 text-purple-700';
            case 'pending': return 'bg-yellow-100 text-yellow-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (loading) {
        return (
            <div className="space-y-4 sm:space-y-5 lg:space-y-5 w-full animate-pulse relative z-0 pb-8">
                <div className="rounded-2xl p-4 sm:p-5 lg:p-6 bg-sky-500/10 border border-sky-500/10 h-28 sm:h-32 lg:h-36">
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                        <SkeletonBox height="h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28" className="rounded-xl lg:rounded-2xl shrink-0" />
                        <div className="flex-1 w-full space-y-3">
                            <SkeletonBox height="h-8 sm:h-10" width="w-3/4 max-w-xs sm:max-w-md mx-auto sm:mx-0" />
                            <SkeletonBox height="h-4" width="w-1/2 max-w-[200px] mx-auto sm:mx-0" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className={`rounded-xl lg:rounded-2xl p-4 lg:p-5 bg-white shadow-md border border-slate-100 flex flex-col justify-center min-h-[100px] lg:min-h-[7.5rem] ${i === 3 ? 'col-span-2 lg:col-span-1' : ''}`}>
                            <SkeletonBox height="h-3" width="w-24" className="mb-4" />
                            <SkeletonBox height="h-10 sm:h-12" width="w-20" />
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                    <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-4 sm:p-5 lg:p-5 min-h-[200px]">
                            <SkeletonBox height="h-4" width="w-40" className="mb-6" />
                            <div className="flex gap-4 overflow-hidden">
                                <SkeletonBox height="h-28 sm:h-32" width="w-[160px] sm:w-[200px]" className="rounded-[1.8rem] shrink-0" />
                                <SkeletonBox height="h-28 sm:h-32" width="w-[160px] sm:w-[200px]" className="rounded-[1.8rem] shrink-0" />
                                <SkeletonBox height="h-28 sm:h-32" width="w-[160px] sm:w-[200px]" className="rounded-[1.8rem] shrink-0 hidden sm:block" />
                            </div>
                        </div>
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-4 sm:p-5 lg:p-5">
                            <SkeletonBox height="h-4" width="w-48" className="mb-6" />
                            <div className="space-y-3">
                                <SkeletonCard />
                                <SkeletonCard />
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6">
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-5 sm:p-6 min-h-[180px]">
                            <SkeletonBox height="h-4" width="w-32" className="mb-4" />
                            <div className="space-y-3">
                                <SkeletonBox height="h-14" width="w-full" className="rounded-xl" />
                                <SkeletonBox height="h-14" width="w-full" className="rounded-xl" />
                            </div>
                        </div>
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-5 sm:p-6 min-h-[160px]">
                            <SkeletonBox height="h-4" width="w-36" className="mb-4" />
                            <SkeletonBox height="h-10" width="w-full" className="rounded-xl" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-5 lg:space-y-5 w-full max-w-none animate-fade-in relative z-0 pb-8 lg:pb-10">
            {/* Announcement Popup */}
            {showAnnouncement && currentAnnouncement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-scale-in flex flex-col md:flex-row">
                        {currentAnnouncement.image_url && (
                            <div className="md:w-7/12 h-48 sm:h-64 md:h-auto relative bg-white shrink-0 flex items-center justify-center">
                                <img
                                    src={currentAnnouncement.image_url}
                                    alt="Announcement"
                                    className="w-full h-full object-contain absolute inset-0"
                                />
                            </div>
                        )}
                        <div className="p-4 sm:p-6 md:p-8 flex flex-col flex-1 bg-white">
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight shrink-0">{currentAnnouncement.title}</h3>
                            <div className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base leading-relaxed" style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {truncateContent(currentAnnouncement.content, 120)}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
                                <button
                                    onClick={() => {
                                        closeAnnouncement();
                                        navigate('/student/announcements');
                                    }}
                                    className="flex-1 py-3 sm:py-3.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 cursor-pointer shadow-lg transform active:scale-[0.98] text-sm sm:text-base flex items-center justify-center gap-2"
                                >
                                    <FileText size={18} />
                                    Read More
                                </button>
                                <button
                                    onClick={closeAnnouncement}
                                    className="flex-1 py-3 sm:py-3.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors cursor-pointer transform active:scale-[0.98] text-sm sm:text-base"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Event Details Modal */}
            {showEventModal && selectedEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in relative">
                        <button
                            onClick={() => setShowEventModal(false)}
                            className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors z-10"
                        >
                            <X size={20} className="text-gray-600" />
                        </button>

                        <div className="bg-sky-500 p-8 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm border border-white/10 uppercase tracking-wide">
                                        {selectedEvent.event_type}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold leading-tight mb-2">{selectedEvent.title}</h3>
                                <div className="flex items-center gap-4 text-white/80 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={16} />
                                        <span>{new Date(selectedEvent.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Start Time</p>
                                        <div className="flex items-center gap-2 text-gray-900 font-medium">
                                            <Clock size={18} className="text-accent-dark" />
                                            {selectedEvent.start_time ? formatTime(selectedEvent.start_time) : 'All Day'}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">End Time</p>
                                        <div className="flex items-center gap-2 text-gray-900 font-medium">
                                            <Clock size={18} className="text-accent-dark" />
                                            {selectedEvent.end_time ? formatTime(selectedEvent.end_time) : 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Description</h4>
                                    <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                                        {selectedEvent.description || 'No description provided.'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setShowEventModal(false)}
                                    className="px-6 py-2.5 bg-sky-500 text-white rounded-xl font-black hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/15 uppercase tracking-widest"
                                >
                                    Close Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Birthday Modal */}
            {showBirthday && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-bounce-in relative text-center pb-8 border-4 border-yellow-300">
                        <button
                            onClick={() => setShowBirthday(false)}
                            className="absolute top-2 right-2 p-2 rounded-full hover:bg-gray-100 transition-colors z-20 text-gray-500"
                        >
                            <X size={20} />
                        </button>

                        {/* Confetti Background/Header */}
                        <div className="bg-gradient-to-b from-yellow-300 to-yellow-100 h-32 w-full relative flex items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#F59E0B 2px, transparent 2px)', backgroundSize: '20px 20px' }}></div>
                            <div className="text-6xl animate-pulse">🎂</div>
                        </div>

                        <div className="px-6 -mt-10 relative z-10">
                            <div className="bg-white rounded-full p-2 w-24 h-24 mx-auto shadow-lg flex items-center justify-center border-4 border-white mb-4">
                                <span className="text-4xl">🥳</span>
                            </div>

                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Happy Birthday!</h2>
                            <p className="text-gray-600 mb-6 font-medium">
                                {displayData?.student_name?.split(' ')[0]}, wishing you a fantastic day filled with joy and success! 🎈
                            </p>

                            <button
                                onClick={() => setShowBirthday(false)}
                                className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-lg"
                            >
                                Thank You!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Verify Profile Dialog */}
            <VerifyProfileDialog
                isOpen={showVerifyProfile}
                onClose={() => setShowVerifyProfile(false)}
                studentData={displayData}
            />

            {/* Premium Welcome Header (Vibrant) */}
            <header className={`relative overflow-hidden rounded-2xl lg:rounded-2xl p-4 sm:p-5 lg:p-6 w-full group shadow-lg border border-sky-400/30 ${isBirthday ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : (isProfileVerified ? 'student-header-banner--verified' : 'student-header-banner')}`}>
                {/* Background Decorations */}
                <div className={`absolute top-0 right-0 w-48 lg:w-64 h-48 lg:h-64 rounded-full -mr-16 lg:-mr-24 -mt-16 lg:-mt-24 blur-3xl pointer-events-none ${isBirthday ? 'bg-white/10' : (isProfileVerified ? 'bg-emerald-500/10' : 'bg-white/10')}`}></div>
                <div className={`absolute bottom-0 left-0 w-32 lg:w-48 h-32 lg:h-48 rounded-full -ml-16 lg:-ml-24 -mb-16 lg:-mb-24 blur-3xl pointer-events-none ${isBirthday ? 'bg-black/5' : (isProfileVerified ? 'bg-emerald-500/5' : 'bg-black/5')}`}></div>

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-5">
                    {/* Profile Photo with Status Badge */}
                    <div className="relative group shrink-0">
                        <div className={`h-16 w-16 sm:h-20 sm:w-20 lg:h-[4.5rem] lg:w-[4.5rem] rounded-xl lg:rounded-2xl p-1 transition-all duration-300 shadow-lg ${isBirthday ? 'bg-white/30' : 'bg-white/20'}`}>
                            <div className="h-full w-full rounded-lg lg:rounded-xl overflow-hidden shadow-inner bg-white">
                                {displayData?.student_photo || user?.student_photo ? (
                                    <img
                                        src={displayData?.student_photo || user?.student_photo}
                                        alt="Profile"
                                        className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-700"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-400">
                                        <User className="w-8 h-8 sm:w-10 sm:h-10" />
                                    </div>
                                )}
                            </div>
                        </div>
                        {isProfileVerified ? (
                            <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 lg:p-1.5 rounded-full shadow-2xl border-2 border-white">
                                <BadgeCheck className="text-white w-5 h-5 lg:w-6 lg:h-6" />
                            </div>
                        ) : (
                            <div className="absolute -bottom-1 -right-1 bg-amber-400 p-1 lg:p-1.5 rounded-xl lg:rounded-2xl shadow-2xl border-2 border-white">
                                <ShieldAlert className="text-white w-4 h-4 lg:w-5 lg:h-5" />
                            </div>
                        )}
                    </div>

                    {/* Text Content */}
                    <div className="flex-1 min-w-0 text-center md:text-left">
                        <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-2 mb-2">
                            <h1 className="text-2xl sm:text-3xl lg:text-[1.75rem] font-black tracking-tight leading-tight text-white">
                                {isBirthday ? 'Happy Birthday, ' : 'Welcome back, '}<span className={isBirthday ? 'text-amber-100' : 'text-white/90'}>{displayData?.student_name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Student'}</span>!
                            </h1>
                            {isBirthday && <Sparkles className="text-amber-200 animate-pulse w-8 h-8" />}
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-1">
                            <span className="text-[10px] lg:text-xs font-black uppercase tracking-[0.15em] px-1 text-white/80">{displayData?.course || user?.course} • {displayData?.branch || user?.branch} • YR {displayData?.current_year || user?.current_year}</span>
                        </div>
                        {isProfileVerified && (
                            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-full">
                                <BadgeCheck size={12} className="text-emerald-400" />
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400">Verified Account</span>
                            </div>
                        )}
                    </div>

                    {/* Right-side action */}
                    <div className="shrink-0 w-full sm:w-auto flex justify-end sm:self-center">
                        {isProfileVerified ? (
                            <div className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border backdrop-blur-md ${isBirthday ? 'bg-white/20 border-white/30 text-white' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'}`}>
                                <BadgeCheck className={`w-4 h-4 ${isBirthday ? 'text-white' : 'text-emerald-500'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isBirthday ? 'text-white' : 'text-emerald-500'}`}>Synced</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowVerifyProfile(true)}
                                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-xs active:scale-[0.98] shadow-lg uppercase tracking-widest whitespace-nowrap transition-colors ${isBirthday ? 'bg-white text-orange-600 hover:bg-orange-50' : 'bg-white text-sky-700 hover:bg-sky-50'}`}
                            >
                                <RefreshCw className="w-4 h-4 shrink-0" />
                                Verify Profile
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Top Stats Row: Attendance + Registration (inline on lg) */}
            <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${
                (isEnabled('attendance') ? 2 : 0) + (isEnabled('semester-registration') ? 1 : 0) >= 3
                    ? 'lg:grid-cols-3'
                    : 'lg:grid-cols-2'
            }`}>
                {/* Today's Status */}
                {isEnabled('attendance') && (
                    <div className={(() => {
                        let status = (attendanceStats?.todayStatus || displayData.today_attendance_status || 'not marked').toLowerCase();
                        if (status === 'not marked yet') status = 'not marked';
                        const isSunday = new Date().getDay() === 0;
                        if (isSunday && (status === 'present' || status === 'not marked')) status = 'holiday';

                        let bgClass = 'student-stat-today';
                        if (status === 'present') bgClass = 'student-stat-today--present';
                        else if (status === 'absent') bgClass = 'student-stat-today--absent';
                        else if (status === 'holiday' || status === 'no class work') bgClass = 'student-stat-today--holiday';

                        return `rounded-xl lg:rounded-2xl p-4 sm:p-4 lg:p-5 shadow-md lg:shadow-lg border border-white/20 flex flex-col justify-center min-h-[7.5rem] lg:min-h-[7.5rem] group overflow-hidden relative ${bgClass}`;
                    })()}>
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                        <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em] mb-3 lg:mb-3 relative z-10">Today's Attendance</h3>
                        <div className="flex items-center gap-2.5 sm:gap-3 relative z-10">
                            {(() => {
                                let status = (attendanceStats?.todayStatus || displayData.today_attendance_status || 'not marked').toLowerCase();
                                if (status === 'not marked yet') status = 'not marked';
                                const isSunday = new Date().getDay() === 0;
                                if (isSunday && (status === 'present' || status === 'not marked')) status = 'holiday';

                                let Icon = CheckCircle;
                                let label = 'Present Today';

                                if (status === 'absent') {
                                    Icon = ShieldAlert;
                                    label = 'Absent Today';
                                } else if (status === 'holiday' || status === 'no class work') {
                                    Icon = Calendar;
                                    label = 'Campus Holiday';
                                } else if (status === 'not marked') {
                                    Icon = Clock;
                                    label = 'Active Session';
                                }

                                return (
                                    <>
                                        <div className="p-2 sm:p-2.5 rounded-lg lg:rounded-xl bg-white/20 text-white shrink-0">
                                            <Icon size={18} className="sm:w-5 sm:h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white font-black text-sm sm:text-base lg:text-lg leading-tight tracking-tight truncate">{label}</p>
                                            <p className="text-white/60 text-[9px] sm:text-xs font-bold mt-0.5 sm:mt-1 uppercase tracking-widest italic">
                                                {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
                                            </p>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Attendance Summary */}
                {isEnabled('attendance') && (
                    <div className="student-stat-progress rounded-xl lg:rounded-2xl p-4 sm:p-4 lg:p-5 shadow-md lg:shadow-lg border border-white/20 flex flex-col justify-center min-h-[7.5rem] group overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none"></div>
                        <div className="flex justify-between items-start mb-3 lg:mb-3 relative z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Overall Progress</h3>
                            <Link to="/student/attendance" className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all">
                                <ArrowRight size={18} />
                            </Link>
                        </div>
                        {attendanceHistory?.semester ? (
                            <div className="flex items-end justify-between relative z-10 gap-2">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                                        <span className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tighter truncate">
                                            {attendanceStats?.percentage || '0.0'}
                                        </span>
                                        <span className="text-sm sm:text-lg font-black text-sky-200">%</span>
                                    </div>
                                    <span className="text-[8px] sm:text-[10px] font-black text-white/70 uppercase tracking-[0.2em] mt-0.5 sm:mt-1 truncate">Average</span>
                                </div>
                                <div className="flex flex-col items-end gap-1 font-black uppercase tracking-widest text-[7px] sm:text-[9px] shrink-0">
                                    <div className="flex items-center gap-1 text-white bg-white/10 px-1.5 py-0.5 sm:py-1 rounded-lg border border-white/10 w-full justify-between">
                                        <span className="opacity-70">P:</span>
                                        <span>{attendanceStats?.present || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-white bg-white/10 px-1.5 py-0.5 sm:py-1 rounded-lg border border-white/10 w-full justify-between">
                                        <span className="opacity-70">A:</span>
                                        <span>{attendanceStats?.absent || 0}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-16 text-slate-400 text-sm font-black italic relative z-10">
                                Data not available
                            </div>
                        )}
                    </div>
                )}

                {/* Registration Pending — inline with attendance on lg */}
                {!isRegistrationCompleted && isEnabled('semester-registration') && (
                    <div className="col-span-2 lg:col-span-1 student-stat-registration-pending rounded-xl lg:rounded-2xl p-4 sm:p-4 lg:p-5 shadow-md lg:shadow-lg border border-white/20 flex flex-col justify-center relative overflow-hidden min-h-[7.5rem] group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl pointer-events-none"></div>
                        <div className="flex items-center justify-between mb-3 lg:mb-3 z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-white/80 uppercase tracking-[0.2em]">Sem Registration</h3>
                            <div className="p-2 bg-white/20 text-white rounded-lg">
                                <AlertCircle size={18} />
                            </div>
                        </div>
                        <div className="relative z-10">
                            <p className="text-base sm:text-lg lg:text-lg font-black text-white mb-2 tracking-tight">Registration Pending</p>
                            <Link
                                to="/student/semester-registration"
                                className="inline-flex items-center px-4 py-1.5 lg:py-2 bg-white text-violet-700 text-[10px] font-black rounded-lg shadow-md hover:bg-violet-50 uppercase tracking-widest"
                            >
                                Complete Now
                            </Link>
                        </div>
                    </div>
                )}

                {/* Registration completed */}
                {isRegistrationCompleted && isEnabled('semester-registration') && (
                    <div className="col-span-2 lg:col-span-1 student-stat-registration-done rounded-xl lg:rounded-2xl p-4 sm:p-4 lg:p-5 shadow-md lg:shadow-lg border border-white/20 flex flex-col justify-center relative overflow-hidden min-h-[7.5rem] group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center justify-between mb-2 lg:mb-3 z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-white/80 uppercase tracking-[0.2em]">Registration</h3>
                            <div className="p-2 bg-white/20 text-white rounded-lg">
                                <CheckCircle size={18} />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 z-10">
                            <div className="min-w-0">
                                <p className="text-base sm:text-lg lg:text-lg font-black text-white tracking-tight truncate">Verified</p>
                                <Link to="/student/semester-registration" className="text-[9px] sm:text-[10px] text-white/80 hover:text-white transition-colors uppercase font-black tracking-[0.1em] flex items-center gap-2 mt-1">
                                    View Slip <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Fee status (separate row when registration is inline above) */}
            {
                !isRegistrationCompleted && isEnabled('fees') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 mb-4 lg:mb-5">
                        {isEnabled('fees') && (
                            <div className="student-stat-fees rounded-xl lg:rounded-2xl p-4 sm:p-4 lg:p-5 shadow-md lg:shadow-lg border border-white/20 flex flex-col justify-center relative overflow-hidden min-h-[7.5rem] lg:max-w-md group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl pointer-events-none"></div>
                                <div className="flex items-center justify-between mb-3 lg:mb-3 z-10">
                                    <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Financial Status</h3>
                                    <div className="p-2 sm:p-3 rounded-2xl border border-white/10 bg-white/20 text-white shadow-sm">
                                        <span className="font-black text-lg">$</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 z-10 relative">
                                    <div className="w-full">
                                        <p className="text-base sm:text-lg lg:text-xl font-black text-white truncate tracking-tight">{feeStatusLabel}</p>
                                        <Link to="/student/fees" className="text-[9px] sm:text-[10px] text-white/70 hover:text-white font-black uppercase tracking-[0.1em] flex items-center gap-2 mt-3 transition-colors">
                                            Manage Payments <ArrowRight size={14} />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Academic summary block removed per requirement */}

            {/* Today's Schedule (NEW) */}
            {
                isEnabled('timetable') && (
                    <div className="bg-white rounded-xl lg:rounded-2xl p-4 sm:p-5 lg:p-5 shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 mb-5 lg:mb-6 transition-all duration-300 lg:hover:shadow-lg group overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                        <div className="flex items-center justify-between mb-4 lg:mb-5 relative z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                <div className="p-1.5 sm:p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 shadow-sm">
                                    <Clock size={16} />
                                </div>
                                Daily Timeline
                            </h3>
                            <Link to="/student/timetable" className="text-[10px] sm:text-[11px] font-black text-sky-700 hover:text-sky-700-dark transition-colors flex items-center gap-2 uppercase tracking-widest pl-2 sm:pl-4">
                                Full Schedule <ArrowRight size={14} />
                            </Link>
                        </div>

                        {todayTimetable && todayTimetable.length > 0 ? (
                            <div className="overflow-x-auto pb-4 -mx-2 px-2 custom-scrollbar relative z-10">
                                <div className="flex gap-3 lg:gap-4 min-w-max">
                                    {todayTimetable.map((slot, idx) => (
                                        <div
                                            key={slot.id}
                                            className={`flex-shrink-0 w-[140px] sm:w-[160px] lg:w-[170px] p-3 sm:p-4 rounded-xl lg:rounded-2xl border flex flex-col justify-between transition-shadow duration-200 lg:hover:shadow-md ${slot.entry
                                                ? slot.entry.type === 'subject' ? 'bg-sky-500/5 border-sky-500/20 hover:bg-sky-500/10' :
                                                    slot.entry.type === 'lab' ? 'bg-purple-50/30 border-purple-100/50 hover:bg-purple-50' :
                                                        'bg-amber-50/30 border-amber-100/50 hover:bg-amber-50'
                                                : 'bg-slate-50 border-slate-100 opacity-60'
                                                }`}
                                        >
                                            <div className="mb-3 sm:mb-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{slot.slot_name}</p>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${slot.entry ? 'animate-pulse bg-sky-500' : 'bg-slate-300'}`}></span>
                                                </div>
                                                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 mb-2 sm:mb-3 flex items-center gap-1.5">
                                                    <Clock size={10} className="text-slate-400" />
                                                    {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                                </p>
                                                <h4 className="text-[13px] sm:text-[15px] font-black text-slate-800 line-clamp-2 leading-tight tracking-tight min-h-[2.2rem]">
                                                    {slot.entry ? (slot.entry.type === 'subject' ? slot.entry.subject_name : slot.entry.custom_label) : 'No Session'}
                                                </h4>
                                            </div>

                                            {slot.entry && (
                                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100/50">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${slot.entry.type === 'subject' ? 'bg-sky-500/5 text-sky-700 border-sky-500/20' :
                                                        slot.entry.type === 'lab' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                        }`}>
                                                        {slot.entry.type}
                                                    </span>
                                                    {slot.entry.subject_code && (
                                                        <span className="text-[9px] font-black text-slate-300 tracking-tighter">{slot.entry.subject_code}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 lg:py-8 bg-slate-50/50 rounded-xl lg:rounded-2xl border border-dashed border-slate-200 relative z-10">
                                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-white flex items-center justify-center shadow-md border border-slate-100 mb-3">
                                    <Calendar className="w-6 h-6 text-slate-300" />
                                </div>
                                <p className="text-[15px] font-black text-slate-500 tracking-tight">Open Horizon Today</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black mt-1.5">No academic sessions scheduled</p>
                            </div>
                        )}
                    </div>
                )
            }

            {/* REMOVED STANDALONE CLUB PAYMENT ALERT */}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 w-full">
                {/* Student Clubs Section */}
                <div className="lg:col-span-8 flex flex-col gap-4 lg:gap-5">
                    {/* Club Section */}
                    {/* Club Section */}
                    {isEnabled('clubs') && (() => {
                        const myClubs = clubs.filter(c => c.userStatus === 'approved' || c.userStatus === 'pending');

                        if (myClubs.length > 0) {
                            return (
                                <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-4 sm:p-5 lg:p-5 relative z-10 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 transition-opacity duration-700"></div>
                                    <div className="flex items-center justify-between mb-4 lg:mb-5 relative z-10">
                                        <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                            <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 shadow-sm">
                                                <Users size={16} />
                                            </div>
                                            Your Communities
                                        </h3>
                                        <Link to="/student/clubs" className="text-[10px] sm:text-[11px] font-black text-sky-700 hover:text-sky-700-dark transition-colors uppercase tracking-widest pl-2 sm:pl-4 flex items-center gap-2">
                                            Active Clusters <ArrowRight size={14} />
                                        </Link>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4 relative z-10">
                                        {myClubs.map((club) => {
                                            const isPaymentDue = club.payment_status === 'payment_due';
                                            return (
                                                <div key={club.id} className={`rounded-xl lg:rounded-2xl p-4 border transition-all duration-200 h-full flex flex-col group/card lg:hover:shadow-md ${isPaymentDue ? 'bg-orange-50/30 border-orange-100' : 'bg-slate-50 border-slate-100/50 hover:bg-white'}`}>
                                                    <div className="flex items-start justify-between mb-5">
                                                        <div className="flex items-center gap-3 sm:gap-4">
                                                            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm group-hover/card:scale-110 transition-transform duration-500">
                                                                {club.image_url ? (
                                                                    <img src={club.image_url} alt={club.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><Users size={24} /></div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="text-[15px] sm:text-[17px] font-black text-slate-800 line-clamp-1 tracking-tight">{club.name}</h4>
                                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                    {club.userStatus === 'approved' && (
                                                                        <span className="bg-emerald-50 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded-lg border border-emerald-100 uppercase tracking-widest flex items-center gap-1"><CheckCircle size={10} /> Active</span>
                                                                    )}
                                                                    {club.userStatus === 'pending' && (
                                                                        <span className="bg-amber-50 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-lg border border-amber-100 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Pending</span>
                                                                    )}

                                                                    {isPaymentDue && (
                                                                        <span className="text-[9px] text-rose-600 font-black flex items-center gap-1 animate-pulse uppercase tracking-widest"><AlertCircle size={10} /> Action Required</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Activity Feed for this club - abbreviated for grid */}
                                                    <div className="flex-1 mb-5">
                                                        {club.userStatus === 'approved' && club.activities && club.activities.length > 0 ? (
                                                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-slate-100 hover:border-sky-500/30 transition-all cursor-pointer flex gap-3 shadow-sm" onClick={() => navigate('/student/clubs')}>
                                                                {club.activities[0].image_url && (
                                                                    <div className="h-10 w-10 rounded-xl overflow-hidden relative flex-shrink-0">
                                                                        <img src={club.activities[0].image_url} alt="" className="w-full h-full object-cover" />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <h5 className="font-black text-slate-800 line-clamp-1 text-[11px] mb-0.5">{club.activities[0].title}</h5>
                                                                    <p className="text-[10px] text-slate-400 font-bold line-clamp-1 italic">{club.activities[0].description}</p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="h-16 flex items-center justify-center border border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                                                No Recent Pulse
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-auto">
                                                        {isPaymentDue ? (
                                                            <button
                                                                onClick={() => navigate('/student/clubs')}
                                                                className="w-full py-2 lg:py-2.5 bg-rose-600 text-white rounded-lg text-[10px] font-black hover:bg-rose-700 transition-colors shadow-md uppercase tracking-widest"
                                                            >
                                                                Settle Dues
                                                            </button>
                                                        ) : (
                                                            <Link
                                                                to="/student/clubs"
                                                                className="w-full block text-center py-2 lg:py-2.5 bg-white border border-slate-100 text-slate-500 rounded-lg text-[10px] font-black hover:bg-sky-500/5 hover:text-sky-700 hover:border-sky-500/20 transition-colors uppercase tracking-widest"
                                                            >
                                                                Open Portal
                                                            </Link>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        } else {
                            // SHOW EXPLORE CLUBS LIST
                            return (
                                <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-4 sm:p-5 lg:p-5 relative z-10 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-accent-light/40 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                                    <div className="flex items-center justify-between mb-4 lg:mb-5 relative z-10">
                                        <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                            <div className="p-1.5 sm:p-2 bg-sky-500/5 text-sky-700 rounded-xl border border-sky-500/20 shadow-sm">
                                                <Users size={16} />
                                            </div>
                                            Explore Clubs
                                        </h3>
                                        <Link to="/student/clubs" className="text-[10px] sm:text-[11px] font-black text-sky-700 hover:text-sky-700-dark transition-colors uppercase tracking-widest">
                                            View All
                                        </Link>
                                    </div>

                                    {clubs.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 relative z-10">
                                            {clubs.slice(0, 3).map(club => (
                                                <div key={club.id} className="bg-slate-50/80 rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group/card flex flex-col h-full hover:-translate-y-1">
                                                    <div className="h-24 sm:h-28 bg-white flex items-center justify-center relative overflow-hidden">
                                                        {club.image_url ? (
                                                            <img src={club.image_url} alt={club.name} className="w-full h-full object-cover transition-transform group-hover/card:scale-105" />
                                                        ) : (
                                                            <Users size={32} className="text-slate-300" />
                                                        )}
                                                        {club.userStatus === 'pending' && (
                                                            <div className="absolute top-2 right-2">
                                                                <span className="bg-amber-50 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-lg border border-amber-100 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Pending</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3 sm:p-4 flex-1 flex flex-col">
                                                        <h4 className="font-black text-slate-800 text-sm mb-2 truncate tracking-tight">{club.name}</h4>
                                                        <div className="mt-auto">
                                                            {club.userStatus === 'pending' ? (
                                                                <div className="text-[10px] text-slate-400 font-black block text-center bg-white py-2.5 rounded-xl border border-slate-100 uppercase tracking-widest cursor-not-allowed">
                                                                    Request Sent
                                                                </div>
                                                            ) : (
                                                                <Link to="/student/clubs" className="text-[10px] text-white bg-sky-500 hover:bg-sky-700 font-black block text-center py-2.5 rounded-xl shadow-lg shadow-sky-500/15 transition-all uppercase tracking-widest">
                                                                    Join Club
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 sm:py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 relative z-10">
                                            <p className="text-slate-500 text-sm font-bold">No clubs available.</p>
                                            <Link to="/student/clubs" className="text-sky-700 text-[10px] font-black mt-2 inline-block uppercase tracking-widest hover:text-sky-700-dark">Explore Clubs</Link>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    })()}

                    {/* Feed Section - COMPACTED */}
                    {isEnabled('announcements') && (
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-4 sm:p-5 lg:p-5 flex flex-col flex-1 relative z-10 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-4 lg:mb-5 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shadow-sm">
                                        <FileText size={16} />
                                    </div>
                                    Channel Updates
                                </h3>
                                <button
                                    onClick={refreshFeed}
                                    disabled={isRefreshingFeed}
                                    className="p-1.5 hover:bg-sky-500/5 text-slate-500 rounded-xl transition-colors flex items-center justify-center shrink-0"
                                    title="Refresh Feed"
                                >
                                    <RefreshCw size={16} className={isRefreshingFeed ? "animate-spin" : ""} />
                                </button>
                            </div>

                            <div className="space-y-3 flex-1">
                                {loading ? (
                                    <div className="text-center py-8 text-gray-500">Loading updates...</div>
                                ) : feedItems.length > 0 ? (
                                    feedItems.slice(0, 4).map((item, index) => { // Limited to 4 items
                                        if (item.type === 'poll') {
                                            const poll = item.data;
                                            return (
                                                <div key={`poll-${poll.id}`} className="p-4 rounded-lg bg-purple-50 border border-purple-100 hover:border-purple-200 transition-colors relative">
                                                    <div className="absolute top-3 right-3 text-purple-200">
                                                        <Vote size={32} className="opacity-20" />
                                                    </div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-700 text-[10px] font-bold uppercase tracking-wide">Active Poll</span>
                                                        <span className="text-[10px] text-gray-500">{new Date(poll.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <h4 className="font-bold text-gray-900 text-sm mb-1">{poll.question}</h4>
                                                    <p className="text-xs text-gray-600 mb-2">{poll.total_votes} students have voted</p>

                                                    {/* Show Vote Status or Action */}
                                                    {poll.has_voted ? (
                                                        <div className="flex items-center gap-1 text-xs text-purple-700 font-medium bg-purple-100 px-2 py-1 rounded inline-flex">
                                                            <CheckCircle size={12} /> Voted
                                                        </div>
                                                    ) : (
                                                        <Link
                                                            to="/student/announcements"
                                                            className="bg-purple-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-purple-700 inline-block"
                                                        >
                                                            Vote Now
                                                        </Link>
                                                    )}
                                                </div>
                                            );
                                        } else {
                                            // Announcement
                                            const ann = item.data;
                                            return (
                                                <div
                                                    key={`ann-${ann.id}`}
                                                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 hover:shadow-md hover:border-sky-500/20 hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
                                                    onClick={() => {
                                                        setCurrentAnnouncement(ann);
                                                        setShowAnnouncement(true);
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-black text-slate-800 text-sm group-hover:text-sky-700 transition-colors line-clamp-1">{ann.title}</h4>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2 font-bold">{new Date(ann.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">{ann.content}</p>
                                                    <span className="text-[10px] text-sky-700 font-black uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                                        Read More <ArrowRight size={10} />
                                                    </span>
                                                </div>
                                            );
                                        }
                                    })
                                ) : (
                                    <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        <div className="inline-flex p-3 bg-sky-500/5 rounded-full text-sky-700 mb-2">
                                            <FileText size={20} />
                                        </div>
                                        <p className="text-slate-500 text-xs font-bold">No recent updates.</p>
                                    </div>
                                )}

                                <div className="text-center pt-2">
                                    <Link to="/student/announcements" className="text-[10px] sm:text-xs font-black text-slate-400 hover:text-sky-700 transition-colors uppercase tracking-widest">
                                        View All Announcements & Polls
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Events & Services (4col) */}
                <div className="lg:col-span-4 flex flex-col gap-4 lg:gap-5">

                    {/* Upcoming Events Section */}
                    {isEnabled('events') && upcomingEvents.length > 0 && (
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-5 sm:p-6 relative z-10 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-fuchsia-50 rounded-full -mr-24 -mt-24 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-fuchsia-50 text-fuchsia-600 rounded-xl border border-fuchsia-100 shadow-sm">
                                        <Calendar size={16} />
                                    </div>
                                    Campus Events
                                </h3>
                                <Link
                                    to="/student/events"
                                    state={{ initialDate: upcomingEvents.length > 0 ? upcomingEvents[0].event_date : new Date() }}
                                    className="text-[10px] lg:text-xs text-sky-700 hover:text-sky-700-dark font-medium whitespace-nowrap"
                                >
                                    View Calendar
                                </Link>
                            </div>

                            <div className="space-y-2 lg:space-y-3 max-h-[250px] lg:max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {upcomingEvents.slice(0, 4).map((event) => (
                                    <div
                                        key={event.id}
                                        onClick={() => {
                                            setSelectedEvent(event);
                                            setShowEventModal(true);
                                        }}
                                        className="flex items-center gap-3 p-2 lg:p-3 rounded-2xl hover:bg-sky-500/5 border border-transparent hover:border-sky-500/20 transition-all cursor-pointer group"
                                    >
                                        <div className="flex-shrink-0 w-10 h-10 lg:w-12 lg:h-12 bg-sky-500/5 text-sky-700 rounded-xl flex flex-col items-center justify-center border border-sky-500/20 group-hover:bg-white group-hover:shadow-sm transition-all">
                                            <span className="text-[8px] lg:text-[10px] font-bold uppercase">{new Date(event.event_date).toLocaleString('default', { month: 'short' })}</span>
                                            <span className="text-sm lg:text-lg font-bold leading-none">{new Date(event.event_date).getDate()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs lg:text-sm font-black text-slate-800 truncate group-hover:text-sky-700">{event.title}</h4>
                                            <p className="text-[10px] lg:text-xs text-slate-500 truncate font-bold">{event.description || 'No details'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ticket Support Widget */}
                    {isEnabled('my-tickets') && (
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-5 sm:p-6 flex flex-col h-fit relative z-10 mb-0 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full -mr-24 -mt-24 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-sky-500/5 text-sky-700 rounded-xl border border-sky-500/20 shadow-sm">
                                        <Users size={16} />
                                    </div>
                                    Help Desk
                                </h3>
                                <a href={ticketAppUrl} className="text-sky-700 hover:bg-sky-500/5 p-1 rounded">
                                    <ArrowRight size={16} />
                                </a>
                            </div>

                            <div className="flex flex-col items-center justify-center py-3 lg:py-2 text-center text-slate-500 mb-2">
                                <p className="text-sm font-bold">Need help?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Raise a ticket for issues or support.</p>
                            </div>

                            <a
                                href={ticketAppUrl}
                                className="w-full py-2 lg:py-2.5 bg-sky-500 text-white text-center font-black rounded-lg hover:bg-sky-700 transition shadow-md text-xs lg:text-sm uppercase tracking-widest"
                            >
                                Go to Support
                            </a>
                        </div>
                    )}

                    {/* Services Widget */}
                    {isEnabled('services') && (
                        <div className="bg-white rounded-xl lg:rounded-2xl shadow-md lg:shadow-lg shadow-sky-500/10 border border-sky-100 p-5 sm:p-6 flex flex-col h-fit relative z-10 transition-all duration-500 lg:hover:shadow-lg group overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full -mr-24 -mt-24 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-sky-500/5 text-sky-700 rounded-xl border border-sky-500/20 shadow-sm">
                                        <FileText size={16} />
                                    </div>
                                    Digital Services
                                </h3>
                                <Link to="/student/services" className="text-sky-700 hover:bg-sky-500/5 p-1 rounded">
                                    <ArrowRight size={16} />
                                </Link>
                            </div>

                            {/* Active Requests List */}
                            {serviceRequests.length > 0 ? (
                                <div className="flex-1 space-y-3 mb-4 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                    {serviceRequests.map(req => (
                                        <div key={req.id} className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-black text-xs text-slate-800 line-clamp-1">{req.service_name}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(req.status)}`}>
                                                    {req.status === 'ready_to_collect' ? 'Ready' : req.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold">{new Date(req.request_date).toLocaleDateString()}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl mb-4">
                                    <p className="text-sm">No active requests</p>
                                </div>
                            )}

                            <p className="text-xs text-slate-500 mb-4 leading-relaxed font-bold">
                                Apply for Study or Custodian Certificates online.
                            </p>
                            <Link
                                to="/student/services"
                                className="w-full py-2 lg:py-2.5 bg-sky-500 text-white text-center font-black rounded-lg hover:bg-sky-700 transition shadow-md text-xs lg:text-sm uppercase tracking-widest"
                            >
                                New Request
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};

export default Dashboard;

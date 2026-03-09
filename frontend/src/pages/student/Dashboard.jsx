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

const Dashboard = () => {
    const { user, token } = useAuthStore(); // Get token for SSO
    const navigate = useNavigate();
    const [studentData, setStudentData] = useState(null);

    // Helper to check if a component is enabled
    const isEnabled = (key) => {
        if (!layoutSettings) return true; // Default to true if settings haven't loaded
        return layoutSettings[key] !== false;
    };

    // Ticket App SSO URL
    const ticketAppUrl = useMemo(() => {
        const baseUrl = import.meta.env.VITE_TICKET_APP_URL || 'https://pydahsdms-tickets.vercel.app';
        if (!token) return `${baseUrl}/student`;
        return `${baseUrl}/auth-callback?token=${token}&role=student&from=portal`;
    }, [token]);
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
        const handleVisibilityChange = () => {
            if (!document.hidden && user?.admission_number) {
                // Refresh attendance data when user comes back to the tab
                api.get('/attendance/student', { params: { _t: Date.now() } })
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
            <div className="space-y-8 animate-pulse relative z-0 pb-12">
                {/* Welcome Header Skeleton */}
                <div className="space-y-2">
                    <SkeletonBox height="h-10" width="w-64" />
                    <SkeletonBox height="h-6" width="w-48" />
                </div>

                {/* Stats Row Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center h-40">
                        <SkeletonBox height="h-4" width="w-32" className="mb-4" />
                        <div className="flex items-center gap-4">
                            <SkeletonBox height="h-12" width="w-12" className="rounded-full" />
                            <div>
                                <SkeletonBox height="h-6" width="w-24" className="mb-2" />
                                <SkeletonBox height="h-3" width="w-32" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center h-40">
                        <SkeletonBox height="h-4" width="w-32" className="mb-4" />
                        <div className="flex items-end gap-2">
                            <div>
                                <SkeletonBox height="h-10" width="w-20" />
                                <SkeletonBox height="h-3" width="w-24" className="mt-1" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center h-40">
                        <SkeletonBox height="h-4" width="w-32" className="mb-4" />
                        <SkeletonBox height="h-10" width="w-full" className="rounded-md" />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Col (Clubs & Feed) */}
                    <div className="lg:col-span-8 flex flex-col gap-6">
                        {/* Club Skeleton */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-64">
                            <div className="flex justify-between mb-6">
                                <div className="flex gap-4">
                                    <SkeletonBox height="h-14" width="w-14" className="rounded-xl" />
                                    <div>
                                        <SkeletonBox height="h-6" width="w-48" className="mb-2" />
                                        <SkeletonBox height="h-4" width="w-32" />
                                    </div>
                                </div>
                                <SkeletonBox height="h-10" width="w-32" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <SkeletonBox height="h-32" className="rounded-xl" />
                                <SkeletonBox height="h-32" className="rounded-xl" />
                            </div>
                        </div>
                        {/* Feed Skeleton */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <SkeletonBox height="h-6" width="w-48" className="mb-6" />
                            <div className="space-y-4">
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </div>
                        </div>
                    </div>

                    {/* Right Col */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <SkeletonBox height="h-6" width="w-40" className="mb-4" />
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <SkeletonBox height="h-12" width="w-12" className="rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <SkeletonBox height="h-4" width="w-full" />
                                        <SkeletonBox height="h-3" width="w-2/3" />
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <SkeletonBox height="h-12" width="w-12" className="rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <SkeletonBox height="h-4" width="w-full" />
                                        <SkeletonBox height="h-3" width="w-2/3" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-64">
                            <SkeletonBox height="h-6" width="w-32" className="mb-4" />
                            <div className="space-y-3">
                                <SkeletonBox height="h-12" width="w-full" />
                                <SkeletonBox height="h-12" width="w-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in relative z-0 pb-12">
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
                                    className="flex-1 py-3 sm:py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors cursor-pointer shadow-lg shadow-blue-100 transform active:scale-[0.98] text-sm sm:text-base flex items-center justify-center gap-2"
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

                        <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm border border-white/10 uppercase tracking-wide">
                                        {selectedEvent.event_type}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold leading-tight mb-2">{selectedEvent.title}</h3>
                                <div className="flex items-center gap-4 text-indigo-100 text-sm">
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
                                            <Clock size={18} className="text-indigo-500" />
                                            {selectedEvent.start_time ? formatTime(selectedEvent.start_time) : 'All Day'}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">End Time</p>
                                        <div className="flex items-center gap-2 text-gray-900 font-medium">
                                            <Clock size={18} className="text-indigo-500" />
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
                                    className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
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
            <header className={`relative overflow-hidden rounded-[2.5rem] p-5 sm:p-6 lg:p-10 transition-all duration-700 max-w-full group shadow-xl border border-white/10 ${isBirthday ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200 text-white' : (isProfileVerified ? 'bg-slate-900 shadow-slate-900/20 text-white' : 'bg-indigo-600 shadow-indigo-200/50 text-white')}`}>
                {/* Background Decorations */}
                <div className={`absolute top-0 right-0 w-64 lg:w-96 h-64 lg:h-96 rounded-full -mr-20 lg:-mr-32 -mt-20 lg:-mt-32 blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-1000 ${isBirthday ? 'bg-white/10' : (isProfileVerified ? 'bg-emerald-500/10' : 'bg-white/10')}`}></div>
                <div className={`absolute bottom-0 left-0 w-48 lg:w-64 h-48 lg:h-64 rounded-full -ml-20 lg:-ml-32 -mb-20 lg:-mb-32 blur-3xl pointer-events-none ${isBirthday ? 'bg-black/5' : (isProfileVerified ? 'bg-emerald-500/5' : 'bg-black/5')}`}></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 lg:gap-10">
                    {/* Profile Photo with Status Badge */}
                    <div className="relative group shrink-0">
                        <div className={`h-20 w-20 lg:h-28 lg:w-28 rounded-[2rem] p-1 lg:p-1.5 transition-all duration-500 group-hover:scale-105 group-hover:rotate-3 shadow-2xl ${isBirthday ? 'bg-white/30' : 'bg-white/20'}`}>
                            <div className="h-full w-full rounded-[1.6rem] overflow-hidden shadow-inner bg-white">
                                {displayData?.student_photo || user?.student_photo ? (
                                    <img
                                        src={displayData?.student_photo || user?.student_photo}
                                        alt="Profile"
                                        className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-700"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-400">
                                        <User className="w-10 h-10 lg:w-12 lg:h-12" />
                                    </div>
                                )}
                            </div>
                        </div>
                        {isProfileVerified ? (
                            <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 lg:p-1.5 rounded-full shadow-2xl border-2 border-white">
                                <BadgeCheck className="text-white w-5 h-5 lg:w-6 lg:h-6" />
                            </div>
                        ) : (
                            <div className="absolute -bottom-1 -right-1 bg-amber-400 p-1 lg:p-1.5 rounded-xl lg:rounded-2xl shadow-2xl border-2 border-white animate-bounce">
                                <ShieldAlert className="text-white w-4 h-4 lg:w-5 lg:h-5" />
                            </div>
                        )}
                    </div>

                    {/* Text Content */}
                    <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-2 mb-2">
                            <h1 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight text-white">
                                {isBirthday ? 'Happy Birthday, ' : 'Welcome back, '}<span className={isBirthday ? 'text-amber-100' : 'text-white/90'}>{displayData?.student_name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Student'}</span>!
                            </h1>
                            {isBirthday && <Sparkles className="text-amber-200 animate-pulse w-8 h-8" />}
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-1 mb-3 lg:mb-4">
                            <span className="text-[10px] lg:text-[13px] font-black uppercase tracking-[0.2em] px-1 text-white/80">{displayData?.course || user?.course} • {displayData?.branch || user?.branch} • YR {displayData?.current_year || user?.current_year}</span>
                        </div>

                        {/* Status / Quick Action Row */}
                        {!isProfileVerified ? (
                            <div className="inline-flex items-center gap-3 p-1.5 sm:p-2 pr-4 sm:pr-5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                                <span className="bg-amber-400 text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 sm:py-1 rounded-xl uppercase tracking-widest shadow-sm">Critical</span>
                                <p className="text-[10px] sm:text-[11px] font-bold tracking-tight text-white">Please verify your profile to fix database errors.</p>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-full animate-in fade-in slide-in-from-left-4 duration-500">
                                <BadgeCheck size={12} className="text-emerald-400" />
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400">Verified Account</span>
                            </div>
                        )}
                    </div>

                    {/* CTA Section - Hidden or small on mobile */}
                    <div className="shrink-0 w-full md:w-auto hidden sm:block">
                        {isProfileVerified ? (
                            <div className={`flex flex-col items-center md:items-end gap-1 p-4 lg:p-5 rounded-[2rem] border backdrop-blur-md transition-all duration-300 ${isBirthday ? 'bg-white/20 border-white/30 text-white' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'}`}>
                                <div className="flex items-center gap-2">
                                    <BadgeCheck className={`w-4 h-4 ${isBirthday ? 'text-white' : 'text-emerald-500'}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isBirthday ? 'text-white' : 'text-emerald-500'}`}>Status</span>
                                </div>
                                <p className={`text-[11px] lg:text-[13px] font-bold ${isBirthday ? 'text-white/80' : 'text-emerald-500/50'}`}>Data Synchronized</p>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowVerifyProfile(true)}
                                className={`w-full md:w-auto flex items-center justify-center gap-3 px-10 py-5 rounded-[1.5rem] font-black text-[13px] transition-all duration-300 transform hover:-translate-y-1 active:scale-95 group shadow-2xl uppercase tracking-widest ${isBirthday ? 'bg-white text-orange-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                            >
                                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                                Verify Profile
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Top Stats Row: Attendance & Registration */}
            <div className={`grid grid-cols-2 md:grid-cols-2 ${isRegistrationCompleted ? 'lg:grid-cols-3' : ''} gap-3 lg:gap-6`}>
                {/* Today's Status */}
                {isEnabled('attendance') && (
                    <div className={(() => {
                        let status = (attendanceStats?.todayStatus || displayData.today_attendance_status || 'not marked').toLowerCase();
                        if (status === 'not marked yet') status = 'not marked';
                        const isSunday = new Date().getDay() === 0;
                        if (isSunday && (status === 'present' || status === 'not marked')) status = 'holiday';

                        let bgClass = 'bg-slate-700 shadow-slate-200/50';
                        if (status === 'present') bgClass = 'bg-emerald-600 shadow-emerald-200/50';
                        else if (status === 'absent') bgClass = 'bg-rose-600 shadow-rose-200/50';
                        else if (status === 'holiday' || status === 'no class work') bgClass = 'bg-amber-500 shadow-amber-200/50';

                        return `rounded-[2rem] p-4 sm:p-5 lg:p-8 shadow-xl border border-white/10 flex flex-col justify-center h-full transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group overflow-hidden relative text-white ${bgClass}`;
                    })()}>
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                        <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em] mb-4 sm:mb-6 relative z-10">Today's Attendance</h3>
                        <div className="flex items-center gap-3 sm:gap-5 relative z-10">
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
                                        <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/20 text-white shrink-0 transition-transform group-hover:scale-110 duration-500">
                                            <Icon size={20} className="sm:w-6 sm:h-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white font-black text-base sm:text-lg lg:text-3xl leading-tight tracking-tight truncate">{label}</p>
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
                    <div className="bg-blue-600 rounded-[2rem] p-4 sm:p-5 lg:p-8 shadow-xl shadow-blue-200/50 border border-white/10 flex flex-col justify-center h-full transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group overflow-hidden relative text-white">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                        <div className="flex justify-between items-start mb-4 sm:mb-6 relative z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Overall Progress</h3>
                            <Link to="/student/attendance" className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all">
                                <ArrowRight size={18} />
                            </Link>
                        </div>
                        {attendanceHistory?.semester ? (
                            <div className="flex items-end justify-between relative z-10 gap-2">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                                        <span className="text-2xl sm:text-3xl lg:text-5xl font-black text-white tracking-tighter truncate">
                                            {attendanceStats?.percentage || '0.0'}
                                        </span>
                                        <span className="text-sm sm:text-lg font-black text-blue-200">%</span>
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

                {/* Registration Status Card (Only if Completed) */}
                {
                    isRegistrationCompleted && isEnabled('semester-registration') && (
                        <div className="col-span-2 lg:col-span-1 bg-emerald-600 rounded-[2rem] p-4 sm:p-5 lg:p-8 shadow-xl shadow-emerald-200/50 border border-white/10 flex flex-col justify-center relative overflow-hidden h-full transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group text-white">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                            <div className="flex items-center justify-between mb-3 sm:mb-6 z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Registration</h3>
                                <div className="p-2 sm:p-3 bg-white/20 text-white rounded-xl sm:rounded-2xl">
                                    <CheckCircle size={20} className="sm:w-6 sm:h-6" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 z-10 mt-1 sm:mt-auto">
                                <div className="min-w-0">
                                    <p className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">Verified Account</p>
                                    <Link to="/student/semester-registration" className="text-[9px] sm:text-[10px] text-white/70 hover:text-white transition-colors uppercase font-black tracking-[0.1em] flex items-center gap-2 mt-1 sm:mt-2">
                                        Registration Slip <ArrowRight size={14} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* Fee & Registration Pending Grid (Only if NOT Completed) */}
            {
                !isRegistrationCompleted && (isEnabled('semester-registration') || isEnabled('fees')) && (
                    <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 lg:gap-6 mb-6">
                        {/* Action Required: Registration */}
                        {isEnabled('semester-registration') && (
                            <div className="bg-orange-600 rounded-[2rem] p-4 sm:p-5 lg:p-8 shadow-xl shadow-orange-200/50 border border-white/10 flex flex-col justify-center relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group text-white">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
                                <div className="flex items-center justify-between mb-4 sm:mb-6 z-10">
                                    <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Action Required</h3>
                                    <div className="p-2 sm:p-3 bg-white/20 text-white rounded-2xl border border-white/10 shadow-sm">
                                        <AlertCircle size={20} />
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <p className="text-xl lg:text-2xl font-black text-white mb-3 tracking-tight">Registration Pending</p>
                                    <Link
                                        to="/student/semester-registration"
                                        className="inline-flex items-center px-4 sm:px-6 py-2 bg-white text-orange-600 text-[10px] sm:text-[11px] font-black rounded-xl shadow-lg hover:bg-orange-50 transition-all transform hover:-translate-y-0.5 uppercase tracking-widest"
                                    >
                                        Complete Now
                                    </Link>
                                </div>
                            </div>
                        )}

                        {/* Fee Status */}
                        {isEnabled('fees') && (
                            <div className="bg-cyan-600 rounded-[2rem] p-4 sm:p-5 lg:p-8 shadow-xl shadow-cyan-200/50 border border-white/10 flex flex-col justify-center relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-2 group text-white">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all duration-300"></div>
                                <div className="flex items-center justify-between mb-4 sm:mb-6 z-10">
                                    <h3 className="text-[10px] sm:text-[11px] font-black text-white/70 uppercase tracking-[0.2em]">Financial Status</h3>
                                    <div className="p-2 sm:p-3 rounded-2xl border border-white/10 bg-white/20 text-white shadow-sm">
                                        <span className="font-black text-lg">$</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 z-10 relative">
                                    <div className="w-full">
                                        <p className="text-xl lg:text-2xl font-black text-white truncate tracking-tight">{feeStatusLabel}</p>
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
                    <div className="bg-white rounded-[2rem] p-5 sm:p-6 lg:p-8 shadow-xl shadow-slate-200/40 border border-slate-100 mb-8 transition-all duration-500 hover:shadow-2xl group overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                        <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
                            <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                <div className="p-1.5 sm:p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 shadow-sm">
                                    <Clock size={16} />
                                </div>
                                Daily Timeline
                            </h3>
                            <Link to="/student/timetable" className="text-[10px] sm:text-[11px] font-black text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-2 uppercase tracking-widest pl-2 sm:pl-4">
                                Full Schedule <ArrowRight size={14} />
                            </Link>
                        </div>

                        {todayTimetable && todayTimetable.length > 0 ? (
                            <div className="overflow-x-auto pb-4 -mx-2 px-2 custom-scrollbar relative z-10">
                                <div className="flex gap-5 min-w-max">
                                    {todayTimetable.map((slot, idx) => (
                                        <div
                                            key={slot.id}
                                            className={`flex-shrink-0 w-[160px] sm:w-[200px] p-4 sm:p-5 rounded-[1.8rem] border flex flex-col justify-between transition-all duration-500 hover:scale-[1.03] hover:shadow-xl ${slot.entry
                                                ? slot.entry.type === 'subject' ? 'bg-indigo-50/30 border-indigo-100/50 hover:bg-indigo-50' :
                                                    slot.entry.type === 'lab' ? 'bg-purple-50/30 border-purple-100/50 hover:bg-purple-50' :
                                                        'bg-amber-50/30 border-amber-100/50 hover:bg-amber-50'
                                                : 'bg-slate-50 border-slate-100 opacity-60'
                                                }`}
                                        >
                                            <div className="mb-3 sm:mb-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{slot.slot_name}</p>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${slot.entry ? 'animate-pulse bg-indigo-500' : 'bg-slate-300'}`}></span>
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
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${slot.entry.type === 'subject' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
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
                            <div className="flex flex-col items-center justify-center py-12 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200 transition-all group-hover:bg-white duration-500 relative z-10">
                                <div className="w-16 h-16 rounded-[1.5rem] bg-white flex items-center justify-center shadow-lg shadow-slate-200/50 border border-slate-100 mb-4 transform transition-transform group-hover:scale-110 group-hover:rotate-3">
                                    <Calendar className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-[15px] font-black text-slate-500 tracking-tight">Open Horizon Today</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black mt-1.5">No academic sessions scheduled</p>
                            </div>
                        )}
                    </div>
                )
            }

            {/* REMOVED STANDALONE CLUB PAYMENT ALERT */}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Student Clubs Section */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Club Section */}
                    {/* Club Section */}
                    {isEnabled('clubs') && (() => {
                        const myClubs = clubs.filter(c => c.userStatus === 'approved' || c.userStatus === 'pending');

                        if (myClubs.length > 0) {
                            return (
                                <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5 sm:p-6 lg:p-8 relative z-10 transition-all duration-500 hover:shadow-2xl group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 transition-opacity duration-700"></div>
                                    <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
                                        <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                            <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 shadow-sm">
                                                <Users size={16} />
                                            </div>
                                            Your Communities
                                        </h3>
                                        <Link to="/student/clubs" className="text-[10px] sm:text-[11px] font-black text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-widest pl-2 sm:pl-4 flex items-center gap-2">
                                            Active Clusters <ArrowRight size={14} />
                                        </Link>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
                                        {myClubs.map((club) => {
                                            const isPaymentDue = club.payment_status === 'payment_due';
                                            return (
                                                <div key={club.id} className={`rounded-[2rem] p-5 border transition-all duration-500 h-full flex flex-col group/card hover:shadow-2xl hover:scale-[1.02] ${isPaymentDue ? 'bg-orange-50/30 border-orange-100' : 'bg-slate-50 border-slate-100/50 hover:bg-white'}`}>
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
                                                            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-slate-100 hover:border-indigo-200 transition-all cursor-pointer flex gap-3 shadow-sm" onClick={() => navigate('/student/clubs')}>
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
                                                                className="w-full py-3 bg-rose-600 text-white rounded-xl text-[11px] font-black hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 uppercase tracking-widest transform hover:-translate-y-0.5"
                                                            >
                                                                Settle Dues
                                                            </button>
                                                        ) : (
                                                            <Link
                                                                to="/student/clubs"
                                                                className="w-full block text-center py-3 bg-white border border-slate-100 text-slate-500 rounded-xl text-[11px] font-black hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all uppercase tracking-widest"
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
                                <div className="bg-gradient-to-br from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 rounded-2xl shadow-sm hover:shadow-lg border border-amber-100 p-6 relative z-10 transition-all duration-300 hover:-translate-y-1.5 group">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                                <Users size={18} />
                                            </div>
                                            Student Clubs
                                        </h3>
                                        <Link to="/student/clubs" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                                            View All
                                        </Link>
                                    </div>

                                    {clubs.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {clubs.slice(0, 3).map(club => (
                                                <div key={club.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-all group flex flex-col h-full">
                                                    <div className="h-24 bg-gray-50 flex items-center justify-center relative overflow-hidden">
                                                        {club.image_url ? (
                                                            <img src={club.image_url} alt={club.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                        ) : (
                                                            <Users size={32} className="text-gray-300" />
                                                        )}
                                                        {club.userStatus === 'pending' && (
                                                            <div className="absolute top-2 right-2">
                                                                <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"><Clock size={10} /> Pending</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3 flex-1 flex flex-col">
                                                        <h4 className="font-bold text-gray-900 text-sm mb-1 truncate">{club.name}</h4>
                                                        <div className="mt-auto pt-2">
                                                            {club.userStatus === 'pending' ? (
                                                                <div className="text-xs text-gray-400 font-medium block text-center bg-gray-50 py-1.5 rounded-md cursor-not-allowed">
                                                                    Request Sent
                                                                </div>
                                                            ) : (
                                                                <Link to="/student/clubs" className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 font-medium block text-center py-1.5 rounded-md shadow-sm transition-colors">
                                                                    Join Club
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                            <p className="text-gray-500 text-sm">No clubs available.</p>
                                            <Link to="/student/clubs" className="text-indigo-600 text-xs font-semibold mt-1 inline-block">Explore Clubs</Link>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    })()}

                    {/* Feed Section - COMPACTED */}
                    {isEnabled('announcements') && (
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5 sm:p-6 lg:p-8 flex flex-col flex-1 relative z-10 transition-all duration-500 hover:shadow-2xl group overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shadow-sm">
                                        <FileText size={16} />
                                    </div>
                                    Channel Updates
                                </h3>
                                <button
                                    onClick={refreshFeed}
                                    disabled={isRefreshingFeed}
                                    className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors flex items-center justify-center shrink-0"
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
                                                    className="p-4 rounded-lg bg-white border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
                                                    onClick={() => {
                                                        setCurrentAnnouncement(ann);
                                                        setShowAnnouncement(true);
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-bold text-gray-900 text-sm group-hover:text-blue-700 transition-colors line-clamp-1">{ann.title}</h4>
                                                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{new Date(ann.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 line-clamp-2 mb-2">{ann.content}</p>
                                                    <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                                        Read More <ArrowRight size={10} />
                                                    </span>
                                                </div>
                                            );
                                        }
                                    })
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                        <div className="inline-flex p-3 bg-gray-100 rounded-full text-gray-400 mb-2">
                                            <FileText size={20} />
                                        </div>
                                        <p className="text-gray-500 text-xs">No recent updates.</p>
                                    </div>
                                )}

                                <div className="text-center pt-2">
                                    <Link to="/student/announcements" className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">
                                        View All Announcements & Polls
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Events & Services (4col) */}
                <div className="lg:col-span-4 flex flex-col gap-6">

                    {/* Upcoming Events Section */}
                    {isEnabled('events') && upcomingEvents.length > 0 && (
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5 sm:p-6 relative z-10 transition-all duration-500 hover:shadow-2xl group overflow-hidden">
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
                                    className="text-[10px] lg:text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
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
                                        className="flex items-center gap-3 p-2 lg:p-3 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all cursor-pointer group"
                                    >
                                        <div className="flex-shrink-0 w-10 h-10 lg:w-12 lg:h-12 bg-indigo-50 text-indigo-600 rounded-lg flex flex-col items-center justify-center border border-indigo-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                                            <span className="text-[8px] lg:text-[10px] font-bold uppercase">{new Date(event.event_date).toLocaleString('default', { month: 'short' })}</span>
                                            <span className="text-sm lg:text-lg font-bold leading-none">{new Date(event.event_date).getDate()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs lg:text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700">{event.title}</h4>
                                            <p className="text-[10px] lg:text-xs text-gray-500 truncate">{event.description || 'No details'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ticket Support Widget */}
                    {isEnabled('my-tickets') && (
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5 sm:p-6 flex flex-col h-fit relative z-10 mb-0 transition-all duration-500 hover:shadow-2xl group overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50 rounded-full -mr-24 -mt-24 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-sm">
                                        <Users size={16} />
                                    </div>
                                    Help Desk
                                </h3>
                                <a href={ticketAppUrl} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded">
                                    <ArrowRight size={16} />
                                </a>
                            </div>

                            <div className="flex flex-col items-center justify-center py-4 text-center text-gray-500 mb-2">
                                <p className="text-sm">Need help?</p>
                                <p className="text-xs text-gray-400 mt-1">Raise a ticket for issues or support.</p>
                            </div>

                            <a
                                href={ticketAppUrl}
                                className="w-full py-2.5 bg-indigo-600 text-white text-center font-medium rounded-lg hover:bg-indigo-700 transition shadow-sm text-sm"
                            >
                                Go to Support
                            </a>
                        </div>
                    )}

                    {/* Services Widget */}
                    {isEnabled('services') && (
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5 sm:p-6 flex flex-col h-fit relative z-10 transition-all duration-500 hover:shadow-2xl group overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-50 rounded-full -mr-24 -mt-24 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700"></div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-sm">
                                        <FileText size={16} />
                                    </div>
                                    Digital Services
                                </h3>
                                <Link to="/student/services" className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                                    <ArrowRight size={16} />
                                </Link>
                            </div>

                            {/* Active Requests List */}
                            {serviceRequests.length > 0 ? (
                                <div className="flex-1 space-y-3 mb-4 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                    {serviceRequests.map(req => (
                                        <div key={req.id} className="p-3 bg-white rounded-lg border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-medium text-xs text-gray-900 line-clamp-1">{req.service_name}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(req.status)}`}>
                                                    {req.status === 'ready_to_collect' ? 'Ready' : req.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-gray-400">{new Date(req.request_date).toLocaleDateString()}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center text-gray-400 border border-dashed border-gray-200 rounded-lg mb-4">
                                    <p className="text-sm">No active requests</p>
                                </div>
                            )}

                            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                Apply for Study or Custodian Certificates online.
                            </p>
                            <Link
                                to="/student/services"
                                className="w-full py-2.5 bg-gray-900 text-white text-center font-medium rounded-lg hover:bg-gray-800 transition shadow-sm text-sm"
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

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, User, CheckCircle, Smartphone, MapPin, BarChart3, Clock, Vote, FileText, ArrowRight, Calendar, X, Users, AlertCircle, RefreshCw, BadgeCheck, ShieldAlert, Sparkles, LogOut, ChevronRight, IndianRupee, Megaphone, Award, Bell } from 'lucide-react';
import { SkeletonBox, SkeletonCard } from '../../components/SkeletonLoader';
import { VerifyProfileDialog } from '../../components/student/VerifyProfileDialog';
import TopHeaderBar from '../../components/student/TopHeaderBar';
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
    const [loading, setLoading] = useState(!user?.admission_number);

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

    // Dynamic time of day greeting (Good Morning, Afternoon, Evening, Night)
    const timeGreeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 4 && hour < 12) {
            return { greeting: 'Good Morning' };
        } else if (hour >= 12 && hour < 17) {
            return { greeting: 'Good Afternoon' };
        } else if (hour >= 17 && hour < 22) {
            return { greeting: 'Good Evening' };
        } else {
            return { greeting: 'Good Night' };
        }
    }, []);

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
            if (!user?.admission_number) return;

            // Tier 1: Fast Critical Data (Profile, Attendance, Layout Settings)
            // Immediately completes the initial screen loading without waiting for secondary widgets
            const fetchTier1 = async () => {
                try {
                    const [profileRes, attendanceRes, layoutRes] = await Promise.allSettled([
                        api.get(`/students/${user.admission_number}`),
                        api.get('/attendance/student', { params: { _t: Date.now() } }),
                        api.get('/settings/student-layout')
                    ]);

                    // Handle Profile
                    if (profileRes.status === 'fulfilled' && profileRes.value.data.success) {
                        setStudentData(profileRes.value.data.data);
                    }

                    // Handle Attendance
                    if (attendanceRes.status === 'fulfilled' && attendanceRes.value.data.success) {
                        setAttendanceHistory(attendanceRes.value.data.data);
                    } else if (attendanceRes.status === 'rejected') {
                        console.error('Failed to fetch attendance:', attendanceRes.reason);
                    }

                    // Handle Layout Settings
                    if (layoutRes && layoutRes.status === 'fulfilled' && layoutRes.value.data?.success) {
                        setLayoutSettings(layoutRes.value.data.data);
                    }
                } catch (error) {
                    console.error('Error fetching critical student data:', error);
                } finally {
                    setLoading(false);
                }
            };

            // Tier 2: Non-blocking Secondary Data (Render each widget independently as soon as it arrives)
            const fetchTier2 = () => {
                // 1. Announcements (renders immediately within ~100ms)
                api.get('/announcements/student?limit=5')
                    .then(res => {
                        if (res.data?.success && Array.isArray(res.data.data)) {
                            const sortedAnnouncements = [...res.data.data].sort((a, b) =>
                                new Date(b.created_at) - new Date(a.created_at)
                            );
                            setAnnouncements(sortedAnnouncements);

                            if (!hasCheckedAnnouncements.current && !showAnnouncement && sortedAnnouncements.length > 0) {
                                hasCheckedAnnouncements.current = true;
                                const latestAnnouncement = sortedAnnouncements[0];
                                const seenIds = JSON.parse(localStorage.getItem('seen_announcements') || '[]');
                                const seenIdsStr = seenIds.map(id => String(id));
                                if (!seenIdsStr.includes(String(latestAnnouncement.id))) {
                                    setCurrentAnnouncement(latestAnnouncement);
                                    setShowAnnouncement(true);
                                }
                            }
                        }
                    })
                    .catch(err => console.error('Failed to load announcements:', err));

                // 2. Clubs (renders immediately without waiting for other widgets)
                clubService.getClubs()
                    .then(res => {
                        if (res?.success) {
                            setClubs(res.data || []);
                        }
                    })
                    .catch(err => console.error('Failed to load clubs:', err));

                // 3. Polls
                api.get('/polls/student')
                    .then(res => {
                        if (res.data?.success) setPolls(res.data.data || []);
                    })
                    .catch(err => console.error('Failed to load polls:', err));

                // 4. Events
                api.get('/events/student')
                    .then(res => {
                        if (res.data?.success) setEvents(res.data.data || []);
                    })
                    .catch(err => console.error('Failed to load events:', err));

                // 5. Service Requests
                serviceService.getRequests()
                    .then(res => {
                        if (res?.data) setServiceRequests(res.data);
                    })
                    .catch(err => console.error('Failed to load service requests:', err));

                // 6. Hourly Summary
                api.get('/hourly-attendance/student-summary')
                    .then(res => {
                        if (res.data?.success && res.data?.data) setHourlySummary(res.data.data);
                    })
                    .catch(err => console.error('Failed to load hourly summary:', err));

                // 7. Academic Content
                api.get('/academic-content')
                    .then(res => {
                        if (res.data?.success && Array.isArray(res.data?.data)) {
                            const list = res.data.data;
                            const now = new Date().toISOString().slice(0, 10);
                            setAcademicContent({
                                tests: list.filter((c) => c.type === 'test' && (!c.due_date || c.due_date >= now)).length,
                                notes: list.filter((c) => c.type === 'note').length,
                            });
                        }
                    })
                    .catch(err => console.error('Failed to load academic content:', err));

                // 8. Internal Marks
                api.get('/internal-marks/student/me')
                    .then(res => {
                        if (res.data?.success && Array.isArray(res.data?.data)) {
                            setInternalMarksCount(res.data.data.length);
                        }
                    })
                    .catch(err => console.error('Failed to load internal marks:', err));

                // 9. Timetable & Period Slots
                Promise.allSettled([
                    api.get('/timetable', { params: { branch_id: user.branch_id, year: user.current_year, semester: user.current_semester || 1 } }),
                    api.get('/period-slots', { params: { college_id: user.college_id } })
                ]).then(([timetableRes, periodSlotsRes]) => {
                    if (timetableRes.status === 'fulfilled' && timetableRes.value.data?.success && periodSlotsRes.status === 'fulfilled' && periodSlotsRes.value.data?.success) {
                        const allTimetable = timetableRes.value.data.data;
                        const allSlots = periodSlotsRes.value.data.data;
                        const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];
                        const currentDay = dayMap[new Date().getDay()];
                        const todayEntries = allTimetable.filter(item => item.day_of_week === currentDay);
                        const merged = allSlots.map(slot => {
                            const entry = todayEntries.find(e => e.period_slot_id === slot.id);
                            return { ...slot, entry };
                        });
                        setTodayTimetable(merged);
                    }
                }).catch(err => console.error('Failed to load timetable:', err));
            };

            // Run Tier 1 and Tier 2 concurrently
            fetchTier1();
            fetchTier2();
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

    const cleanEventDescription = (desc) => {
        if (!desc) return '';
        return String(desc).replace(/\[.*?\]\s*/g, '').trim();
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

    const formatShortDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
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
                <div className="rounded-2xl p-4 sm:p-5 lg:p-6 bg-sky-500/10 border border-sky-500/10 min-h-[5.5rem] sm:h-32 lg:h-36 flex items-center">
                    <div className="flex items-center gap-3.5 sm:gap-5 w-full">
                        <SkeletonBox height="h-16 w-16 sm:h-20 sm:w-20 lg:h-[4.5rem] lg:w-[4.5rem]" className="rounded-xl lg:rounded-2xl shrink-0" />
                        <div className="flex-1 space-y-2">
                            <SkeletonBox height="h-6 sm:h-8" width="w-48 max-w-xs" />
                            <SkeletonBox height="h-3 sm:h-4" width="w-32 max-w-[160px]" />
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
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in relative border border-gray-100 max-h-[85vh] flex flex-col my-auto">
                        <button
                            onClick={() => setShowEventModal(false)}
                            className="absolute top-3 right-3 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors z-20 shadow-md backdrop-blur-md cursor-pointer"
                            title="Close"
                        >
                            <X size={18} />
                        </button>

                        <div className="bg-sky-500 p-4 sm:p-6 text-white relative overflow-hidden shrink-0">
                            <div className="relative z-10 space-y-2 pr-6">
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold backdrop-blur-sm border border-white/10 uppercase tracking-wide">
                                        {selectedEvent.event_type}
                                    </span>
                                </div>
                                <h3 className="text-base sm:text-xl font-bold leading-snug break-words">{selectedEvent.title}</h3>
                                <div className="flex items-center gap-2 text-white/90 text-xs sm:text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={14} />
                                        <span>{new Date(selectedEvent.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">Start Time</p>
                                    <div className="flex items-center gap-1.5 text-gray-900 font-medium text-xs sm:text-sm">
                                        <Clock size={16} className="text-accent-dark" />
                                        {selectedEvent.start_time ? formatTime(selectedEvent.start_time) : 'All Day'}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">End Time</p>
                                    <div className="flex items-center gap-1.5 text-gray-900 font-medium text-xs sm:text-sm">
                                        <Clock size={16} className="text-accent-dark" />
                                        {selectedEvent.end_time ? formatTime(selectedEvent.end_time) : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-bold text-gray-900 mb-1.5 uppercase tracking-wide">Description</h4>
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 max-h-36 overflow-y-auto custom-scrollbar">
                                    <p className="text-gray-600 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                                        {cleanEventDescription(selectedEvent.description) || 'No description provided.'}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setShowEventModal(false)}
                                    className="px-5 py-2 bg-sky-500 text-white rounded-xl font-bold hover:bg-sky-700 transition-colors shadow-md text-xs sm:text-sm uppercase tracking-wider"
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

            {/* Premium Welcome Header (Image 1 Exact Replica) */}
            <header className={`relative overflow-hidden rounded-[20px] p-3.5 sm:p-4 w-full shadow-md border border-blue-400/20 text-white ${isBirthday ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-r from-[#0b63e5] via-[#024ebd] to-[#013fae]'}`}>
                {/* Subtle Background Glow */}
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -mr-12 -mt-12 blur-2xl pointer-events-none"></div>

                <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Profile Photo */}
                        <div className="relative shrink-0">
                            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full p-0.5 bg-white/20 backdrop-blur-md shadow-md border border-white/30">
                                <div className="h-full w-full rounded-full overflow-hidden bg-white">
                                    {displayData?.student_photo || user?.student_photo ? (
                                        <img
                                            src={displayData?.student_photo || user?.student_photo}
                                            alt="Profile"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center bg-blue-50 text-blue-400">
                                            <User className="w-6 h-6" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1 min-w-0 my-0.5">
                                <h1 className="text-base sm:text-xl font-bold text-white truncate tracking-tight">
                                    {displayData?.student_name || user?.name || 'Damerla Sai Saketh'}
                                </h1>
                                {isBirthday && <Sparkles className="text-amber-200 animate-pulse w-4 h-4 shrink-0" />}
                            </div>
                            <p className="text-[11px] font-normal text-white/80 truncate mb-1.5">
                                {displayData?.course || user?.course || 'B.Tech'} • {displayData?.branch || user?.branch || 'CSE'} • Year {displayData?.current_year || user?.current_year || '4'}
                            </p>

                            {/* Image 1 Badges: Light green & light blue pills side-by-side */}
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#dcfce7] text-[#15803d] shrink-0">
                                    <CheckCircle size={11} className="text-[#15803d]" /> Regular
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#dbeafe] text-[#1d4ed8] shrink-0">
                                    <CheckCircle size={11} className="text-[#1d4ed8]" /> Profile {isProfileVerified ? '100%' : '90%'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Arrow Button */}
                    <button
                        onClick={() => navigate('/student/profile')}
                        className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                        title="View Profile"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </header>

            {/* Top Stats Cards Row (Today's Attendance + Overall Progress) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Today's Status */}
                {isEnabled('attendance') && (
                    <div className="rounded-xl p-2 sm:p-2.5 bg-[#edfbf4] border border-[#dcfce7] flex flex-col justify-start gap-0.5 shadow-xs relative overflow-hidden">
                        {(() => {
                            let status = (attendanceStats?.todayStatus || displayData.today_attendance_status || 'not marked').toLowerCase();
                            if (status === 'not marked yet') status = 'not marked';
                            const isSunday = new Date().getDay() === 0;
                            if (isSunday && (status === 'present' || status === 'not marked')) status = 'holiday';

                            let label = 'Present';
                            let labelColor = 'text-[#15803d]';

                            if (status === 'absent') {
                                label = 'Absent';
                                labelColor = 'text-rose-600';
                            } else if (status === 'holiday' || status === 'no class work') {
                                label = 'Holiday';
                                labelColor = 'text-amber-600';
                            } else if (status === 'not marked') {
                                label = 'Active Session';
                                labelColor = 'text-sky-600';
                            }

                            return (
                                <>
                                    <div>
                                        <span className="text-[9px] sm:text-[10px] font-bold text-[#15803d] truncate block">Today's Attendance</span>
                                    </div>
                                    <div className="flex items-end justify-between gap-1 min-w-0">
                                        <div className="min-w-0">
                                            <p className={`text-sm sm:text-base font-extrabold ${labelColor} leading-tight tracking-tight`}>{label}</p>
                                            <p className="text-[8px] sm:text-[9px] font-medium text-[#16a34a]/75 mt-0.5 truncate flex items-center gap-0.5">
                                                <ChevronRight size={8} className="text-[#16a34a]/60 shrink-0" />
                                                {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#dcfce7] flex items-center justify-center text-[#15803d] shrink-0">
                                            <Calendar size={12} />
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Overall Progress */}
                {isEnabled('attendance') && (
                    <div className="rounded-xl p-2 sm:p-2.5 bg-[#f6f5ff] border border-[#ede9fe] flex flex-col justify-start gap-0.5 shadow-xs relative overflow-hidden">
                        <div>
                            <span className="text-[9px] sm:text-[10px] font-bold text-[#6d28d9] truncate block">Overall Progress</span>
                        </div>
                        <div className="flex items-end justify-between gap-1 min-w-0">
                            <div className="min-w-0">
                                <p className="text-sm sm:text-base font-extrabold text-[#6d28d9] leading-tight tracking-tight">
                                    {attendanceStats?.percentage || '46.3'}%
                                </p>
                                <p className="text-[8px] sm:text-[9px] font-medium text-[#7c3aed]/75 mt-0.5 truncate flex items-center gap-0.5">
                                    <ChevronRight size={8} className="text-[#7c3aed]/60 shrink-0" />
                                    Average
                                </p>
                            </div>
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#ede9fe] flex items-center justify-center text-[#6d28d9] shrink-0">
                                <BarChart3 size={12} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Action Buttons Side-by-Side Horizontal Row (All Pages Represented) */}
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 -mx-1 px-1 my-1">
                <Link to="/student/academic-content" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#eeeffe] text-[#5551ff] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <BookOpen size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Academic</span>
                </Link>

                <Link to="/student/fees" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#ffeef2] text-[#ff3366] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <IndianRupee size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Fees</span>
                </Link>

                <Link to="/student/timetable" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#eef8ff] text-[#2563eb] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Calendar size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Timetable</span>
                </Link>

                <Link to="/student/internal-marks" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#eef9ff] text-[#0284c7] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <FileText size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Results</span>
                </Link>

                <Link to="/student/announcements" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#fef3c7] text-[#d97706] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Megaphone size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Updates</span>
                </Link>

                <Link to="/student/events" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#f3e8ff] text-[#9333ea] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Award size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Events</span>
                </Link>

                <a href={ticketAppUrl} target="_blank" rel="noopener noreferrer" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#dcfce7] text-[#16a34a] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Smartphone size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Support</span>
                </a>

                <Link to="/student/services" className="bg-white rounded-[18px] p-2.5 border border-slate-100/90 flex flex-col items-center justify-center shadow-xs hover:shadow-md transition-all group shrink-0 min-w-[78px] sm:min-w-[84px] flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#fce7f3] text-[#db2777] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Clock size={20} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 mt-1.5 text-center leading-tight">Services</span>
                </Link>
            </div>

            {/* Recent Updates Section (Image 1 Style) */}
            {isEnabled('announcements') && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900">Recent Updates</h2>
                        <Link to="/student/announcements" className="text-xs font-bold text-[#2563eb] hover:underline flex items-center gap-1">
                            View All <ArrowRight size={14} />
                        </Link>
                    </div>

                    <div className="space-y-2.5">
                        {feedItems.length > 0 ? (
                            feedItems.slice(0, 3).map((item, index) => {
                                const isPoll = item.type === 'poll';
                                const data = item.data;
                                const title = isPoll ? data.question : data.title;
                                const content = isPoll ? (data.has_voted ? 'Voted' : 'Poll active') : data.content;
                                const dateStr = formatShortDate(data.created_at);

                                const iconBgStyles = [
                                    'bg-[#ffedd5] text-[#ea580c]',
                                    'bg-[#dbeafe] text-[#2563eb]',
                                    'bg-[#dcfce7] text-[#16a34a]'
                                ];
                                const iconStyle = iconBgStyles[index % iconBgStyles.length];
                                const IconComponent = isPoll ? Vote : (index % 2 === 0 ? FileText : Megaphone);

                                return (
                                    <div
                                        key={isPoll ? `poll-${data.id}` : `ann-${data.id}`}
                                        onClick={() => {
                                            if (isPoll) navigate('/student/announcements');
                                            else {
                                                setCurrentAnnouncement(data);
                                                setShowAnnouncement(true);
                                            }
                                        }}
                                        className="p-3.5 rounded-[22px] bg-white border border-slate-100/90 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 rounded-xl ${iconStyle} flex items-center justify-center shrink-0`}>
                                                <IconComponent size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-[#2563eb] transition-colors">
                                                    {title}
                                                </h4>
                                                <p className="text-xs font-normal text-slate-400 truncate mt-0.5">
                                                    {truncateContent(content, 70)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-medium text-slate-400 shrink-0 ml-2">
                                            {dateStr || '24 Sep'}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-4 text-center rounded-[22px] bg-white border border-dashed border-slate-200">
                                <p className="text-xs font-semibold text-slate-400">No recent updates</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Explore Learn Build Banner (Image 1 Style) */}
            <div
                onClick={() => navigate('/student/events')}
                className="rounded-[22px] p-4 sm:p-5 bg-gradient-to-r from-[#031338] via-[#091b48] to-[#0a2368] text-white shadow-lg relative overflow-hidden cursor-pointer group flex items-center justify-between"
            >
                <div className="relative z-10">
                    <h3 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight">
                        Explore<br />Learn<br />Build
                    </h3>
                    <p className="text-xs font-normal text-slate-300 mt-1">
                        Join Clubs, Workshops<br />and Maker Space
                    </p>
                </div>

                {/* Right-side 3D transparent image settled smoothly into dark background */}
                <div className="absolute right-0 top-0 bottom-0 w-7/12 sm:w-1/2 h-full pointer-events-none overflow-hidden flex items-center justify-end pr-1 sm:pr-2">
                    <img
                        src="/images/ChatGPT Image Oct 1, 2026, 02_10_10 PM.png"
                        alt="Explore Learn Build"
                        className="h-full w-auto object-contain object-right opacity-95 group-hover:scale-105 transition-transform duration-500"
                    />
                </div>
            </div>

            {/* SEM Registration Card */}
            {isEnabled('semester-registration') && (
                <div className={`rounded-[22px] p-4 sm:p-5 shadow-md border border-white/20 relative overflow-hidden ${isRegistrationCompleted ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white' : 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">SEM REGISTRATION</span>
                        <div className="p-1.5 rounded-lg bg-white/20 text-white">
                            {isRegistrationCompleted ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                                {isRegistrationCompleted ? 'Registration Verified' : 'Registration Pending'}
                            </h3>
                            <p className="text-xs text-white/80 mt-0.5">
                                {isRegistrationCompleted ? 'Semester registration complete.' : 'Please complete your semester registration.'}
                            </p>
                        </div>
                        <Link
                            to="/student/semester-registration"
                            className="px-4 py-2 bg-white text-purple-700 font-extrabold text-xs rounded-xl shadow-xs hover:bg-purple-50 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0"
                        >
                            {isRegistrationCompleted ? 'View Slip' : 'COMPLETE NOW'}
                        </Link>
                    </div>
                </div>
            )}

            {/* Today's Timetable */}
            {isEnabled('timetable') && (
                <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Clock size={16} className="text-purple-600" />
                            Daily Timeline
                        </h3>
                        <Link to="/student/timetable" className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1">
                            Full Schedule <ArrowRight size={14} />
                        </Link>
                    </div>

                    {todayTimetable && todayTimetable.length > 0 ? (
                        <div className="overflow-x-auto pb-2 custom-scrollbar">
                            <div className="flex gap-3 min-w-max">
                                {todayTimetable.map((slot) => (
                                    <div
                                        key={slot.id}
                                        className={`flex-shrink-0 w-[140px] p-3 rounded-xl border flex flex-col justify-between ${slot.entry
                                            ? slot.entry.type === 'subject' ? 'bg-sky-50 border-sky-100' :
                                                slot.entry.type === 'lab' ? 'bg-purple-50 border-purple-100' :
                                                    'bg-amber-50 border-amber-100'
                                            : 'bg-slate-50 border-slate-100 opacity-60'
                                            }`}
                                    >
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{slot.slot_name}</p>
                                            <p className="text-[11px] font-medium text-slate-500 my-1">
                                                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                            </p>
                                            <h4 className="text-xs font-bold text-slate-800 line-clamp-2">
                                                {slot.entry ? (slot.entry.type === 'subject' ? slot.entry.subject_name : slot.entry.custom_label) : 'No Session'}
                                            </h4>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs font-bold text-slate-500">No academic sessions scheduled for today</p>
                        </div>
                    )}
                </div>
            )}

            {/* Events, Help Desk & Digital Services */}
            {(isEnabled('events') || isEnabled('my-tickets') || isEnabled('services')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
                    {/* Upcoming Events Section */}
                    {isEnabled('events') && upcomingEvents.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Calendar size={16} className="text-fuchsia-600" />
                                    Campus Events
                                </h3>
                                <Link
                                    to="/student/events"
                                    state={{ initialDate: upcomingEvents.length > 0 ? upcomingEvents[0].event_date : new Date() }}
                                    className="text-xs font-bold text-sky-700 hover:text-sky-800"
                                >
                                    Calendar
                                </Link>
                            </div>

                            <div className="space-y-2">
                                {upcomingEvents.slice(0, 3).map((event) => (
                                    <div
                                        key={event.id}
                                        onClick={() => {
                                            setSelectedEvent(event);
                                            setShowEventModal(true);
                                        }}
                                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all cursor-pointer"
                                    >
                                        <div className="w-9 h-9 bg-sky-50 text-sky-700 rounded-xl flex flex-col items-center justify-center border border-sky-100 shrink-0">
                                            <span className="text-[8px] font-bold uppercase">{new Date(event.event_date).toLocaleString('default', { month: 'short' })}</span>
                                            <span className="text-xs font-bold leading-none">{new Date(event.event_date).getDate()}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-xs font-bold text-slate-800 truncate">{event.title}</h4>
                                            <p className="text-[10px] text-slate-400 truncate">{cleanEventDescription(event.description) || event.event_type || 'No details'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Help Desk */}
                    {isEnabled('my-tickets') && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Users size={16} className="text-sky-600" />
                                        Help Desk
                                    </h3>
                                    <a href={ticketAppUrl} className="text-sky-700 hover:bg-sky-50 p-1 rounded-lg">
                                        <ArrowRight size={14} />
                                    </a>
                                </div>
                                <p className="text-xs font-bold text-slate-700">Need Assistance?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Submit a ticket for technical or campus support.</p>
                            </div>
                            <a
                                href={ticketAppUrl}
                                className="w-full mt-3 py-2 bg-sky-500 text-white text-center font-bold rounded-xl hover:bg-sky-600 transition text-xs uppercase tracking-wider"
                            >
                                Open Ticket
                            </a>
                        </div>
                    )}


                </div>
            )}
        </div>
    );
};

export default Dashboard;

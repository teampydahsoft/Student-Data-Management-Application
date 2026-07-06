import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import {
    RiHome4Line,
    RiHome4Fill,
    RiMegaphoneLine,
    RiMegaphoneFill,
    RiGroupLine,
    RiGroupFill,
    RiCalendarEventLine,
    RiCalendarEventFill,
    RiCheckboxCircleLine,
    RiCheckboxCircleFill,
    RiFileList3Line,
    RiFileList3Fill,
    RiServiceLine,
    RiServiceFill,
    RiWallet3Line,
    RiWallet3Fill,
    RiMenuLine,
    RiMenuFill,
    RiCloseLine,
    RiLogoutBoxRLine,
    RiUser3Line,
    RiUser3Fill,
    RiMore2Fill,
    RiNotification3Line,
    RiCustomerService2Line,
    RiCustomerService2Fill,
    RiTicketLine,
    RiTicketFill,
    RiBusLine,
    RiBusFill,
    RiFolderLine,
    RiFolderFill,
    RiQuestionAnswerLine,
    RiQuestionAnswerFill,
    RiCalendar2Line,
    RiCalendar2Fill,
    RiMapPinLine,
    RiMapPinFill,
    RiBookOpenLine,
    RiBookOpenFill,
    RiAwardLine,
    RiAwardFill
} from 'react-icons/ri';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import toast from 'react-hot-toast';
import NotificationPermissionModal from '../NotificationPermissionModal';
import NotificationIcon from '../Notifications/NotificationIcon';
import InstallPrompt from '../PWA/InstallPrompt';
import { getSubscriptionStatus, registerServiceWorker, subscribeUser } from '../../services/pushService';
import RegistrationPendingModal from '../RegistrationPendingModal';
import { getTicketAppUrl } from '../../utils/ticketAppUrl';
import { navigateToCrtApp } from '../../utils/crtAppUrl';
import { computeRegistrationStageDisplays } from '../../config/registrationStages.jsx';

const StudentLayout = ({ children }) => {
    // State
    const [sidebarOpen, setSidebarOpen] = useState(false); // Kept for logic compatibility or specialized tablet views
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [notificationModalOpen, setNotificationModalOpen] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [showRestrictionModal, setShowRestrictionModal] = useState(false);
    const [fetchedStatus, setFetchedStatus] = useState(null);
    const [fetchedScholarshipData, setFetchedScholarshipData] = useState(null);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false); // New: For mobile "More" menu
    const [hasInternship, setHasInternship] = useState(false);
    const [layoutSettings, setLayoutSettings] = useState(null);

    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();

    useEffect(() => {
        const fetchStudentStatus = async () => {
            if (user?.admission_number) {
                try {
                    const [studentRes, scholarshipRes] = await Promise.all([
                        api.get(`/students/${user.admission_number}`),
                        api.get(`/student-scholarship/${encodeURIComponent(user.admission_number)}`)
                    ]);
                    if (studentRes.data.success && studentRes.data.data) {
                        setFetchedStatus(studentRes.data.data);
                    }
                    if (scholarshipRes.data?.success) {
                        setFetchedScholarshipData(scholarshipRes.data.data);
                    } else {
                        setFetchedScholarshipData(null);
                    }
                } catch (error) {
                    console.error('Failed to fetch student status in layout', error);
                }
            }
        };
        fetchStudentStatus();

        // Re-fetch when the browser tab becomes visible again (e.g. student completes
        // registration in another tab or the page had been backgrounded).
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchStudentStatus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user?.admission_number]);

    // Check Internship Status
    useEffect(() => {
        const checkInternship = async () => {
            try {
                const res = await api.get('/internship/my-assignment');
                if (res.data.success && res.data.assignment) {
                    setHasInternship(true);
                } else {
                    setHasInternship(false);
                }
            } catch (error) {
                console.error("Failed to check internship status", error);
            }
        };
        checkInternship();
    }, []);

    // Fetch Layout Settings
    useEffect(() => {
        const fetchLayoutSettings = async () => {
            try {
                const res = await api.get('/settings/student-layout');
                if (res.data.success) {
                    setLayoutSettings(res.data.data);
                }
            } catch (error) {
                console.error('Failed to fetch layout settings in student layout', error);
            }
        };
        fetchLayoutSettings();
    }, []);

    // Birthday check: is today the student's birthday? (for portal birthday theme)
    const isBirthday = (() => {
        const data = fetchedStatus || user;
        if (!data) return false;
        const dobStr = data.dob
            || (data.student_data && (data.student_data['DOB (Date of Birth - DD-MM-YYYY)'] || data.student_data.dob));
        if (!dobStr) return false;
        const dob = new Date(dobStr);
        const today = new Date();
        if (isNaN(dob.getTime())) return false;
        return dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth();
    })();

    // Re-fetch registration status on route change so that after completing
    // registration on /student/semester-registration, navigating elsewhere
    // immediately unlocks access without requiring a full page reload.
    useEffect(() => {
        if (!user?.admission_number) return;
        const refetch = async () => {
            try {
                const [studentRes, scholarshipRes] = await Promise.all([
                    api.get(`/students/${user.admission_number}`),
                    api.get(`/student-scholarship/${encodeURIComponent(user.admission_number)}`)
                ]);
                if (studentRes.data.success && studentRes.data.data) {
                    setFetchedStatus(studentRes.data.data);
                }
                if (scholarshipRes.data?.success) {
                    setFetchedScholarshipData(scholarshipRes.data.data);
                } else {
                    setFetchedScholarshipData(null);
                }
            } catch (error) {
                // silent — main fetch already has error handling
            }
        };
        refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    // Registration Status Check
    // Use live stage evaluation (same logic as SemesterRegistration page) so that
    // a student whose mobile verification or scholarship was reset after the DB was
    // stamped 'Completed' is correctly treated as pending again.
    // Fast-path: if authStore already has 'Completed' AND fetchedStatus also confirms it,
    // skip the stage computation to avoid showing a flash of the restriction modal
    // during the async fetch on first load.
    const isRegistrationPending = () => {
        // If we haven't received the live student data yet, fall back to authStore
        // so the layout doesn't lock the student out during the initial load.
        if (!fetchedStatus) {
            const authReg = (user?.registration_status || '').toLowerCase();
            return authReg !== 'completed';
        }

        // Run the same 5-stage live check used on the SemesterRegistration page.
        const stages = computeRegistrationStageDisplays(fetchedStatus, fetchedScholarshipData);
        const allComplete = (
            stages.verification.completed &&
            stages.certificates.completed &&
            stages.fee.completed &&
            stages.promotion.completed &&
            stages.scholarship.completed
        );
        return !allComplete;
    };

    const isPending = isRegistrationPending();
    const allowedPaths = ['/student/dashboard', '/student/semester-registration'];

    useEffect(() => {
        if (isPending && !allowedPaths.includes(location.pathname)) {
            setShowRestrictionModal(true);
        } else if (!isPending) {
            setShowRestrictionModal(false);
        }
    }, [location.pathname, isPending]);

    const handleNavigation = (e, path) => {
        if (isPending && !allowedPaths.includes(path)) {
            e.preventDefault();
            setShowRestrictionModal(true);
        }
        setMoreMenuOpen(false); // Close mobile drawer on nav
    };

    const handleModalClose = () => {
        setShowRestrictionModal(false);
        if (isPending && !allowedPaths.includes(location.pathname)) {
            navigate('/student/dashboard');
        }
    };

    useEffect(() => {
        checkPushStatus();
    }, []);

    const checkPushStatus = async () => {
        const status = await getSubscriptionStatus();
        if (status === 'granted') {
            setIsSubscribed(true);
        } else if (status === 'default') {
            setIsSubscribed(false);
            setTimeout(() => setNotificationModalOpen(true), 1500);
        } else {
            setIsSubscribed(false);
        }
    };

    const handleAllowNotifications = async () => {
        const registration = await registerServiceWorker();
        if (registration) {
            const success = await subscribeUser(registration);
            if (success) {
                setIsSubscribed(true);
                toast.success('You will now receive notifications!');
                setNotificationModalOpen(false);
            } else {
                toast.error('Failed to subscribe. Please try again.');
            }
        } else {
            toast.error('Push messaging not supported or service worker failed.');
        }
    };

    const handleLogout = () => {
        logout();
        toast.success('Logged out successfully');
        navigate('/student/login');
    };

    const navItems = [
        { icon: RiHome4Line, activeIcon: RiHome4Fill, label: 'Dashboard', path: '/student/dashboard' },
        { icon: RiMegaphoneLine, activeIcon: RiMegaphoneFill, label: 'Announcements', path: '/student/announcements' },
        { icon: RiGroupLine, activeIcon: RiGroupFill, label: 'Clubs', path: '/student/clubs' },
        { icon: RiCalendarEventLine, activeIcon: RiCalendarEventFill, label: 'Event Calendar', path: '/student/events' },
        { icon: RiCheckboxCircleLine, activeIcon: RiCheckboxCircleFill, label: 'Attendance', path: '/student/attendance' },
        { icon: RiBookOpenLine, activeIcon: RiBookOpenFill, label: 'CRT Scores', path: '/student/versant-tests' },
        { icon: RiBookOpenLine, activeIcon: RiBookOpenFill, label: 'CRT Training Portal', path: '/crt-portal', isCrtApp: true },
        { icon: RiMapPinLine, activeIcon: RiMapPinFill, label: 'Internship', path: '/student/internship' },
        { icon: RiCalendar2Line, activeIcon: RiCalendar2Fill, label: 'Time Table', path: '/student/timetable' },
        { icon: RiFileList3Line, activeIcon: RiFileList3Fill, label: 'Sem Registration', path: '/student/semester-registration' },
        { icon: RiServiceLine, activeIcon: RiServiceFill, label: 'Services', path: '/student/services' },
        { icon: RiTicketLine, activeIcon: RiTicketFill, label: 'Maintenance', path: '/student/my-tickets', isExternal: true, isTicketApp: true },
        { icon: RiBusLine, activeIcon: RiBusFill, label: 'Transport', path: '/student/transport' },
        { icon: RiWallet3Line, activeIcon: RiWallet3Fill, label: 'Fee Management', path: '/student/fees' },
        { icon: RiAwardLine, activeIcon: RiAwardFill, label: 'Scholarship', path: '/student/scholarship' },
        { icon: RiQuestionAnswerLine, activeIcon: RiQuestionAnswerFill, label: 'Feed Back', path: '/student/feedback' },
        { icon: RiFolderLine, activeIcon: RiFolderFill, label: 'My Documents', path: '/student/my-documents' }
    ].filter(item => {
        if (item.label === 'Internship' && !hasInternship) return false;

        if (layoutSettings) {
            const key = item.path.replace('/student/', '');
            if (!item.isCrtApp && layoutSettings[key] === false) return false;
        }

        return true;
    });

    // Split items for Mobile Navigation
    // Primary: Dashboard, Attendance, Fees, Services (or Registration if pending)
    const mobilePrimaryPaths = isPending
        ? ['/student/dashboard', '/student/attendance', '/student/fees', '/student/semester-registration']
        : ['/student/dashboard', '/student/attendance', '/student/fees', '/student/services'];

    // Helper to find item by path
    const findItem = (path) => navItems.find(item => item.path === path);

    const mobilePrimaryItems = mobilePrimaryPaths.map(path => findItem(path)).filter(Boolean);
    const mobileSecondaryItems = navItems.filter(item => !mobilePrimaryPaths.includes(item.path));


    return (
        <div className={`flex h-screen overflow-hidden transition-colors duration-500 ${isBirthday ? 'bg-gradient-to-br from-amber-50 via-orange-50/70 to-pink-50' : 'bg-slate-50'}`}>
            {/* Background Pattern - birthday: festive dots; default: gray dots */}
            <div
                className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-500"
                style={isBirthday ? {
                    opacity: 0.5,
                    backgroundImage: `
                        radial-gradient(#F59E0B 1.2px, transparent 1.2px),
                        radial-gradient(#EC4899 1px, transparent 1px),
                        radial-gradient(#F97316 1px, transparent 1px)
                    `,
                    backgroundSize: '28px 28px, 20px 20px, 24px 24px',
                    backgroundPosition: '0 0, 4px 4px, 12px 12px'
                } : {
                    opacity: 0.4,
                    backgroundImage: 'radial-gradient(#BAE6FD 1.2px, transparent 1.2px)',
                    backgroundSize: '24px 24px'
                }}
            />

            <InstallPrompt />

            <NotificationPermissionModal
                isOpen={notificationModalOpen}
                onClose={() => setNotificationModalOpen(false)}
                onAllow={handleAllowNotifications}
            />

            <RegistrationPendingModal
                isOpen={showRestrictionModal}
                onClose={handleModalClose}
            />

            {/* Desktop Sidebar Toggle Button */}
            {!desktopSidebarOpen && (
                <button
                    className={`hidden lg:flex fixed top-6 left-6 z-50 p-2 backdrop-blur-md rounded-lg shadow-sm border transition-all hover:scale-105 active:scale-95 ${isBirthday ? 'bg-amber-50/90 border-amber-200 text-amber-700 hover:text-amber-900' : 'bg-white/80 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    onClick={() => setDesktopSidebarOpen(true)}
                    title="Expand Sidebar"
                >
                    <RiMenuLine size={20} />
                </button>
            )}

            {/* Sidebar (HIDDEN on Mobile) */}
            <aside className={`
                hidden lg:flex
                fixed inset-y-0 left-0 z-40 w-72 backdrop-blur-xl border-r transform transition-all duration-500 ease-in-out
                ${isBirthday ? 'bg-white/95 border-amber-200/60 shadow-[4px_0_24px_-2px_rgba(245,158,11,0.05)]' : 'bg-white/95 border-gray-200/60 shadow-[4px_0_24px_-2px_rgba(0,0,0,0.02)]'}
                ${desktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-full flex flex-col">
                    {/* Logo Area */}
                    <div className={`h-16 lg:h-[4.25rem] flex items-center justify-between px-5 border-b transition-all duration-300 ${isBirthday ? 'border-amber-100 bg-gradient-to-r from-amber-50/50 to-orange-50/30' : 'border-gray-100/80 bg-white/50'}`}>
                        <div className="flex items-center gap-3.5 group cursor-pointer" onClick={() => navigate('/student/dashboard')}>
                            <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${isBirthday ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-200' : 'bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sky-200'}`}>
                                {isBirthday ? <span className="text-xl">🎂</span> : <span className="font-black text-xl tracking-tighter">S</span>}
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="text-lg font-black text-gray-900 tracking-tight leading-none">
                                    {isBirthday ? 'Happy Day!' : 'Student'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setDesktopSidebarOpen(false)}
                            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100/80 rounded-xl transition-all active:scale-90"
                        >
                            <RiMenuLine size={18} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-3 py-4 lg:py-5 space-y-0.5 overflow-y-auto no-scrollbar scroll-smooth">
                        {navItems.map((item, index) => (
                            item.isCrtApp ? (
                                <button
                                    key={`${item.path}-${index}`}
                                    type="button"
                                    onClick={() => navigateToCrtApp('/student/dashboard')}
                                    className={`
                                      relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-bold transition-all duration-200 group w-full text-left
                                      ${isBirthday ? 'text-gray-500 hover:bg-amber-50 hover:text-amber-700' : 'text-gray-500 hover:bg-sky-100 hover:text-sky-700'}
                                    `}
                                >
                                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full transition-all duration-300 opacity-0 scale-y-0 ${isBirthday ? 'bg-amber-500' : 'bg-sky-500'}`}></span>
                                    <item.icon size={20} className="transition-transform duration-300 group-hover:scale-110 opacity-80 group-hover:opacity-100" />
                                    <span className="tracking-tight">{item.label}</span>
                                </button>
                            ) : item.isExternal ? (
                                <a
                                    key={`${item.path}-${index}`}
                                    href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                    className={`
                                      relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-bold transition-all duration-200 group
                                      ${isBirthday ? 'text-gray-500 hover:bg-amber-50 hover:text-amber-700' : 'text-gray-500 hover:bg-sky-100 hover:text-sky-700'}
                                    `}
                                >
                                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full transition-all duration-300 opacity-0 scale-y-0 ${isBirthday ? 'bg-amber-500' : 'bg-sky-500'}`}></span>
                                    <item.icon size={20} className="transition-transform duration-300 group-hover:scale-110 opacity-80 group-hover:opacity-100" />
                                    <span className="tracking-tight">{item.label}</span>
                                </a>
                            ) : (
                                <NavLink
                                    key={`${item.path}-${index}`}
                                    to={item.path}
                                    onClick={(e) => handleNavigation(e, item.path)}
                                    className={({ isActive }) => `
                                      relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-bold transition-all duration-200 group
                                      ${isActive
                                            ? isBirthday ? 'bg-amber-100/60 text-amber-700 shadow-sm' : 'bg-sky-100 text-sky-700 shadow-sm border border-sky-500/20'
                                            : 'text-gray-500 hover:bg-gray-50/80 hover:text-gray-900'}
                                    `}
                                >
                                    {({ isActive }) => {
                                        const Icon = isActive ? item.activeIcon : item.icon;
                                        return (
                                            <>
                                                <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full transition-all duration-500 ${isBirthday ? 'bg-amber-500' : 'bg-sky-500'} ${isActive ? 'opacity-100 translate-x-[-8px]' : 'opacity-0 scale-y-0'}`}></span>
                                                <Icon size={20} className={`transition-all duration-300 ${isActive ? 'scale-110 opacity-100' : 'opacity-70 group-hover:opacity-100 group-hover:scale-110'}`} />
                                                <span className="tracking-tight">{item.label}</span>
                                                {isActive && (
                                                    <div className={`ml-auto w-1.5 h-1.5 rounded-full animate-pulse transition-all ${isBirthday ? 'bg-amber-500 shadow-lg shadow-amber-400' : 'bg-sky-500 shadow-lg shadow-sky-500/40'}`}></div>
                                                )}
                                            </>
                                        );
                                    }}
                                </NavLink>
                            )
                        ))}
                    </nav>

                    {/* User Info Card */}
                    <div
                        onClick={() => navigate('/student/profile')}
                        className={`mx-5 mb-3 p-4 rounded-2xl border relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-500 ${isBirthday ? 'bg-white border-amber-100 shadow-amber-100/20' : 'bg-white border-sky-100 shadow-sky-500/10'}`}
                    >
                        <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12 ${isBirthday ? 'bg-amber-50/80' : 'bg-sky-100/80'}`}></div>
                        <div className="flex items-center gap-3.5 relative z-10">
                            <div className="relative shrink-0">
                                <div className="h-11 w-11 rounded-full ring-2 ring-white shadow-lg bg-gray-100 overflow-hidden relative z-10 transition-transform duration-500 group-hover:scale-105">
                                    {user?.student_photo ? (
                                        <img src={user.student_photo} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className={`h-full w-full flex items-center justify-center ${isBirthday ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-700'}`}>
                                            <RiUser3Fill size={20} />
                                        </div>
                                    )}
                                </div>
                                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white z-20 ${isBirthday ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="text-[13px] font-black text-gray-900 truncate tracking-tight">{user?.name || 'Student'}</p>
                                </div>
                                <p className="text-[11px] font-bold text-gray-400 truncate tracking-wide uppercase">{user?.admission_number}</p>
                            </div>
                        </div>
                    </div>

                    {/* Logout */}
                    <div className={`p-4 border-t ${isBirthday ? 'border-amber-100 bg-amber-50/30' : 'border-gray-100 bg-gray-50/30'}`}>
                        <button
                            onClick={handleLogout}
                            className={`flex items-center justify-center gap-2.5 px-4 py-3.5 w-full rounded-xl text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 group ${isBirthday ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-900 hover:bg-gray-800'}`}
                        >
                            <RiLogoutBoxRLine size={18} className="group-hover:-translate-x-1 transition-transform" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`
                flex-1 h-screen overflow-y-auto p-4 lg:p-5 xl:p-6 relative transition-all duration-300 
                ${desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'}
                pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-8
            `}>
                {/* Birthday banner strip */}
                {isBirthday && (
                    <div className="mb-4 rounded-xl bg-gradient-to-r from-amber-400/90 via-orange-400/90 to-pink-400/90 text-white px-4 py-2.5 shadow-lg shadow-amber-200/40 flex items-center justify-center gap-2 text-sm font-bold">
                        <span className="text-lg">🎂</span>
                        <span>Happy Birthday! Have a wonderful day.</span>
                        <span className="text-lg">🎈</span>
                    </div>
                )}

                {/* Notification Icon */}
                <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-8 right-4 lg:right-8 z-[50]">
                    <NotificationIcon />
                </div>

                <div className="w-full max-w-none">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation - Floating Premium Dock */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[55] pointer-events-none pb-[env(safe-area-inset-bottom)]">
                <div className={`
                    pointer-events-auto h-[68px] sm:h-[72px] backdrop-blur-3xl border-t shadow-[0_-8px_32px_rgba(0,0,0,0.08)] rounded-t-[1.5rem] sm:rounded-t-[2rem] flex items-center justify-between px-2 sm:px-4
                    ${isBirthday ? 'bg-white/95 border-amber-200/50' : 'bg-white/95 border-gray-200/50'}
                `}>
                    {mobilePrimaryItems.map((item) => (
                        item.isExternal ? (
                            <a
                                key={item.path}
                                href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-[60px] h-full transition-all duration-300 group"
                            >
                                <div className="relative p-1.5 rounded-2xl transition-all duration-300 group-active:scale-95 group-active:bg-gray-100/50">
                                    <item.icon size={24} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
                                </div>
                                <span className="text-[10px] font-bold tracking-wide text-gray-500 leading-none">
                                    {item.label === 'Dashboard' ? 'Home' : item.label}
                                </span>
                            </a>
                        ) : (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={(e) => handleNavigation(e, item.path)}
                                className={({ isActive }) => `
                                    flex-1 flex flex-col items-center justify-center gap-1 min-w-[60px] h-full transition-all duration-300 ease-out group
                                    ${isActive ? (isBirthday ? 'text-amber-600' : 'text-sky-700') : 'text-gray-400'}
                                `}
                            >
                                {({ isActive }) => {
                                    // Use activeIcon (filled) when active, otherwise outlined icon
                                    const Icon = isActive ? item.activeIcon : item.icon;
                                    const themeColor = isBirthday ? 'bg-amber-500' : 'bg-sky-500';
                                    const lightColor = isBirthday ? 'bg-amber-50/80' : 'bg-sky-100';
                                    return (
                                        <>
                                            <div className={`
                                                relative p-2 rounded-2xl transition-all duration-500 
                                                ${isActive ? `${lightColor} -translate-y-1` : 'group-active:scale-95 group-active:bg-gray-50'}
                                            `}>
                                                <Icon
                                                    size={24}
                                                    className={`transition-all duration-300 ${isActive ? 'scale-110' : 'group-hover:text-gray-600'}`}
                                                />
                                                {isActive && (
                                                    <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${themeColor}`}></span>
                                                )}
                                            </div>
                                            <span className={`
                                                text-[10px] font-bold tracking-wide leading-none transition-all duration-300
                                                ${isActive ? 'opacity-100 font-extrabold' : 'opacity-80 text-gray-500'}
                                            `}>
                                                {item.label === 'Fee Management' ? 'Fees' :
                                                    item.label === 'Attendance' ? 'Attend' :
                                                        item.label === 'Sem Registration' ? 'Reg.' :
                                                            item.label === 'Dashboard' ? 'Home' :
                                                                item.label}
                                            </span>
                                        </>
                                    );
                                }}
                            </NavLink>
                        )
                    ))}

                    {/* More Menu Indicator */}
                    <button
                        onClick={() => setMoreMenuOpen(true)}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 min-w-[60px] h-full transition-all duration-300 group ${moreMenuOpen ? (isBirthday ? 'text-amber-600' : 'text-sky-700') : 'text-gray-400'}`}
                    >
                        <div className={`relative p-2 rounded-2xl transition-all duration-300 ${moreMenuOpen ? (isBirthday ? 'bg-amber-50/80 -translate-y-1' : 'bg-sky-100 -translate-y-1') : 'group-active:scale-95'}`}>
                            {moreMenuOpen ? <RiMenuFill size={24} className="scale-110" /> : <RiMenuLine size={24} className="group-hover:text-gray-600" />}
                            {moreMenuOpen && <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isBirthday ? 'bg-amber-500' : 'bg-sky-500'}`}></span>}
                        </div>
                        <span className={`text-[10px] tracking-wide leading-none transition-all duration-300 ${moreMenuOpen ? 'opacity-100 font-extrabold' : 'opacity-80 font-bold text-gray-500'}`}>Menu</span>
                    </button>
                </div>
            </div>

            {/* Mobile More Menu Drawer */}
            {moreMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-[60] flex flex-col justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                        onClick={() => setMoreMenuOpen(false)}
                    />

                    {/* Drawer Content - Compact Glassmorphism */}
                    <div className={`relative rounded-t-[1.5rem] sm:rounded-t-[2rem] p-4 sm:p-5 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] animate-fade-in-up pb-[calc(68px+env(safe-area-inset-bottom))] sm:pb-[calc(72px+env(safe-area-inset-bottom))] border-t backdrop-blur-3xl transition-all duration-500 ${isBirthday ? 'bg-amber-50/85 border-amber-200/50' : 'bg-white/90 border-white/60'}`}>
                        {/* Grab Handle */}
                        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 opacity-50"></div>

                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-black text-gray-900 tracking-tight">{isBirthday ? '🎂 Explore' : 'Explore'}</h3>
                            <button onClick={() => setMoreMenuOpen(false)} className="p-2 bg-white/50 rounded-xl text-gray-500 shadow-sm border border-gray-200/50 active:scale-95 transition-all hover:bg-white/80">
                                <RiCloseLine size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3 mb-5">
                            {mobileSecondaryItems.map((item) => (
                                item.isCrtApp ? (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => { navigateToCrtApp('/student/dashboard'); setMoreMenuOpen(false); }}
                                        className="flex flex-col items-center gap-1.5 p-1 group"
                                    >
                                        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-[14px] bg-white/60 border border-white/60 shadow-sm flex items-center justify-center text-gray-500 group-active:scale-90 transition-all">
                                            <item.icon size={20} className="sm:hidden" />
                                            <item.icon size={22} className="hidden sm:block" />
                                        </div>
                                        <span className="text-[9px] sm:text-[10px] font-bold text-gray-600 text-center line-clamp-1 w-full px-0.5">
                                            CRT Portal
                                        </span>
                                    </button>
                                ) : item.isExternal ? (
                                    <a
                                        key={item.path}
                                        href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                        className="flex flex-col items-center gap-1.5 p-1 group"
                                    >
                                        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-[14px] bg-white/60 border border-white/60 shadow-sm flex items-center justify-center text-gray-500 group-active:scale-90 group-active:bg-gray-100/50 transition-all">
                                            <item.icon size={20} className="sm:hidden" />
                                            <item.icon size={22} className="hidden sm:block" />
                                        </div>
                                        <span className="text-[9px] sm:text-[10px] font-bold text-gray-600 text-center line-clamp-1 w-full px-0.5">
                                            {item.label}
                                        </span>
                                    </a>
                                ) : (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={(e) => handleNavigation(e, item.path)}
                                        className="flex flex-col items-center gap-1.5 p-1 group"
                                    >
                                        {({ isActive }) => {
                                            const Icon = isActive ? item.activeIcon : item.icon;
                                            return (
                                                <>
                                                    <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-[14px] border flex items-center justify-center transition-all duration-300 group-active:scale-90 ${isActive
                                                        ? (isBirthday ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-200/50' : 'bg-sky-500 border-sky-500 text-white shadow-md shadow-sky-500/30')
                                                        : 'bg-white/60 border-white/60 text-gray-500 shadow-sm'}`}>
                                                        <Icon size={20} className="sm:hidden" />
                                                        <Icon size={22} className="hidden sm:block" />
                                                    </div>
                                                    <span className={`text-[9px] sm:text-[10px] font-bold text-center line-clamp-1 w-full px-0.5 transition-colors ${isActive ? (isBirthday ? 'text-amber-600' : 'text-sky-700') : 'text-gray-600'}`}>
                                                        {item.label === 'Sem Registration' ? 'Reg.' : item.label}
                                                    </span>
                                                </>
                                            );
                                        }}
                                    </NavLink>
                                )
                            ))}
                        </div>

                        {/* Profile & Logout in Drawer */}
                        <div className="flex gap-2 sm:gap-3">
                            <div
                                onClick={() => {
                                    navigate('/student/profile');
                                    setMoreMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center gap-3 p-3 rounded-2xl border relative overflow-hidden active:scale-95 transition-all cursor-pointer ${isBirthday ? 'bg-white/60 border-amber-200/50' : 'bg-white/60 border-white/60'} shadow-sm`}
                            >
                                <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${isBirthday ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-700'}`}>
                                    {user?.student_photo ? (
                                        <img src={user.student_photo} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <RiUser3Fill className="w-5 h-5 sm:w-6 sm:h-6" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] sm:text-sm font-black text-gray-900 truncate tracking-tight">{user?.name || 'Student'}</p>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest">{user?.admission_number}</p>
                                </div>
                            </div>

                            <button
                                onClick={handleLogout}
                                className="w-[60px] sm:w-[72px] flex flex-col items-center justify-center gap-1 p-2 rounded-2xl bg-gray-900/90 backdrop-blur-md text-white font-bold text-[9px] sm:text-[10px] tracking-wider uppercase hover:bg-black active:scale-95 transition-all shadow-md shrink-0"
                            >
                                <RiLogoutBoxRLine className="w-5 h-5 sm:w-6 sm:h-6" />
                                <span>Exit</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentLayout;

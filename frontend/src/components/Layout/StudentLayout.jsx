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
    RiArrowDownSLine,
    RiQuestionAnswerLine,
    RiQuestionAnswerFill,
    RiCalendar2Line,
    RiCalendar2Fill,
    RiMapPinLine,
    RiMapPinFill
} from 'react-icons/ri';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import toast from 'react-hot-toast';
import NotificationPermissionModal from '../NotificationPermissionModal';
import NotificationIcon from '../Notifications/NotificationIcon';
import InstallPrompt from '../PWA/InstallPrompt';
import { getSubscriptionStatus, registerServiceWorker, subscribeUser } from '../../services/pushService';
import RegistrationPendingModal from '../RegistrationPendingModal';

const StudentLayout = ({ children }) => {
    // State
    const [sidebarOpen, setSidebarOpen] = useState(false); // Kept for logic compatibility or specialized tablet views
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [notificationModalOpen, setNotificationModalOpen] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [showRestrictionModal, setShowRestrictionModal] = useState(false);
    const [fetchedStatus, setFetchedStatus] = useState(null);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false); // New: For mobile "More" menu
    const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
    const [hasInternship, setHasInternship] = useState(false);
    const [layoutSettings, setLayoutSettings] = useState(null);

    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();

    useEffect(() => {
        const fetchStudentStatus = async () => {
            if (user?.admission_number) {
                try {
                    const res = await api.get(`/students/${user.admission_number}`);
                    if (res.data.success && res.data.data) {
                        setFetchedStatus(res.data.data);
                    }
                } catch (error) {
                    console.error('Failed to fetch student status in layout', error);
                }
            }
        };
        fetchStudentStatus();
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

    // Registration Status Check
    const isRegistrationPending = () => {
        const data = fetchedStatus || user;
        const rawSource = data?.registration_status
            || (data?.student_data ? (data.student_data['Registration Status'] || data.student_data.registration_status) : '')
            || '';
        const raw = String(rawSource).trim().toLowerCase();
        return raw !== 'completed';
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
            setMostRecentNavClick(null); // specific logic cleaner
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

    const getTicketAppUrl = (path) => {
        const token = localStorage.getItem('token');
        let userStr = localStorage.getItem('user');

        // Remove large fields (like student_photo) to prevent HTTP 431 Header Too Large errors
        try {
            const userObj = JSON.parse(userStr);
            if (userObj) {
                const { student_photo, ...safeUser } = userObj;
                userStr = JSON.stringify(safeUser);
            }
        } catch (e) {
            console.error('Error parsing user object for SSO', e);
        }

        return `${TICKET_APP_URL}/auth-callback?token=${token}&user=${encodeURIComponent(userStr)}&redirect=${path}`;
    };

    const TICKET_APP_URL = import.meta.env.VITE_TICKET_APP_URL || 'http://localhost:5174';

    const navItems = [
        { icon: RiHome4Line, activeIcon: RiHome4Fill, label: 'Dashboard', path: '/student/dashboard' },
        { icon: RiMegaphoneLine, activeIcon: RiMegaphoneFill, label: 'Announcements', path: '/student/announcements' },
        { icon: RiGroupLine, activeIcon: RiGroupFill, label: 'Clubs', path: '/student/clubs' },
        { icon: RiCalendarEventLine, activeIcon: RiCalendarEventFill, label: 'Event Calendar', path: '/student/events' },
        { icon: RiCheckboxCircleLine, activeIcon: RiCheckboxCircleFill, label: 'Attendance', path: '/student/attendance' },
        { icon: RiMapPinLine, activeIcon: RiMapPinFill, label: 'Internship', path: '/student/internship' },
        { icon: RiCalendar2Line, activeIcon: RiCalendar2Fill, label: 'Time Table', path: '/student/timetable' },
        { icon: RiFileList3Line, activeIcon: RiFileList3Fill, label: 'Sem Registration', path: '/student/semester-registration' },
        { icon: RiServiceLine, activeIcon: RiServiceFill, label: 'Services', path: '/student/services' },
        { icon: RiTicketLine, activeIcon: RiTicketFill, label: 'Maintenance', path: '/student/my-tickets', isExternal: true, isTicketApp: true },
        { icon: RiBusLine, activeIcon: RiBusFill, label: 'Transport', path: '/student/transport' },
        { icon: RiWallet3Line, activeIcon: RiWallet3Fill, label: 'Fee Management', path: '/student/fees' },
        { icon: RiQuestionAnswerLine, activeIcon: RiQuestionAnswerFill, label: 'Feed Back', path: '/student/feedback' },
        { icon: RiFolderLine, activeIcon: RiFolderFill, label: 'My Requests', path: '/student/profile-requests' },
    ].filter(item => {
        if (item.label === 'Internship' && !hasInternship) return false;

        if (layoutSettings) {
            // Map path to setting key
            const key = item.path.replace('/student/', '');
            // Check if explicitly disabled (if key exists and is false)
            if (layoutSettings[key] === false) return false;
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
        <div className={`flex h-screen overflow-hidden transition-colors duration-500 ${isBirthday ? 'bg-gradient-to-br from-amber-50 via-orange-50/70 to-pink-50' : 'bg-[#F8FAFC]'}`}>
            {/* Background Pattern - birthday: festive dots; default: gray dots */}
            <div
                className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-500"
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
                    backgroundImage: 'radial-gradient(#CBD5E1 1.5px, transparent 1.5px)',
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
                fixed inset-y-0 left-0 z-40 w-72 backdrop-blur-xl border-r shadow-[4px_0_24px_-2px_rgba(0,0,0,0.02)] transform transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1)
                ${isBirthday ? 'bg-white/95 border-amber-200/60' : 'bg-white/90 border-gray-200/60'}
                ${desktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-full flex flex-col">
                    {/* Logo Area */}
                    <div className={`h-20 flex items-center justify-between px-6 border-b ${isBirthday ? 'border-amber-100 bg-gradient-to-r from-amber-50/80 to-orange-50/50' : 'border-gray-100'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-white shadow-lg ${isBirthday ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-200' : 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-200'}`}>
                                {isBirthday ? <span className="text-base">🎂</span> : <span className="font-bold text-lg">P</span>}
                            </div>
                            <span className="text-lg font-bold text-gray-900 tracking-tight heading-font">
                                {isBirthday ? 'Happy Birthday!' : 'Student Portal'}
                            </span>
                        </div>
                        <button
                            onClick={() => setDesktopSidebarOpen(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                            <RiMenuLine size={20} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto custom-scrollbar">
                        {navItems.map((item, index) => (
                            item.isExternal ? (
                                <a
                                    key={`${item.path}-${index}`}
                                    href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                    className={`
                                      relative flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group
                                      ${isBirthday ? 'text-gray-600 hover:bg-amber-50 hover:text-amber-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'}
                                    `}
                                >
                                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-300 opacity-0 scale-y-0 ${isBirthday ? 'bg-amber-500' : 'bg-blue-600'}`}></span>
                                    <item.icon size={20} className={`transition-transform duration-300 group-hover:scale-110`} />
                                    <span className="tracking-wide">{item.label}</span>
                                </a>
                            ) : (
                                <NavLink
                                    key={`${item.path}-${index}`}
                                    to={item.path}
                                    onClick={(e) => handleNavigation(e, item.path)}
                                    className={({ isActive }) => `
                                      relative flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group
                                      ${isActive
                                            ? isBirthday ? 'bg-amber-50/80 text-amber-700 shadow-sm' : 'bg-blue-50/80 text-blue-700 shadow-sm'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                                    `}
                                >
                                    {({ isActive }) => {
                                        const Icon = isActive ? item.activeIcon : item.icon;
                                        return (
                                            <>
                                                <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-300 ${isBirthday ? 'bg-amber-500' : 'bg-blue-600'} ${isActive ? 'opacity-100' : 'opacity-0 scale-y-0'}`}></span>
                                                <Icon size={20} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                                <span className="tracking-wide">{item.label}</span>
                                                {isActive && <div className={`ml-auto w-1.5 h-1.5 rounded-full shadow-lg ${isBirthday ? 'bg-amber-500 shadow-amber-400' : 'bg-blue-600 shadow-blue-400'}`}></div>}
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
                        className={`mx-4 mb-2 p-4 rounded-xl border shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md transition-all ${isBirthday ? 'bg-gradient-to-br from-amber-50 to-orange-50/30 border-amber-100' : 'bg-gradient-to-br from-gray-50 to-white border-gray-100'}`}
                    >
                        {isBirthday && (
                            <div className="absolute top-1 right-2 text-lg opacity-90">🎂</div>
                        )}
                        <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110 ${isBirthday ? 'bg-amber-100' : 'bg-blue-50'}`}></div>
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="h-10 w-10 rounded-full ring-2 ring-white shadow-md bg-gray-200 overflow-hidden shrink-0">
                                {user?.student_photo ? (
                                    <img src={user.student_photo} alt="Profile" className="h-full w-full object-cover" />
                                ) : (
                                    <div className={`h-full w-full flex items-center justify-center ${isBirthday ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                        <RiUser3Fill size={18} />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-gray-900 truncate">{user?.name || 'Student'}</p>
                                </div>
                                <p className="text-xs font-medium text-gray-500 truncate">{user?.admission_number}</p>
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
                flex-1 h-screen overflow-y-auto p-4 lg:p-8 relative z-10 transition-all duration-300 
                ${desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'}
                pb-24 lg:pb-8
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
                <div className="fixed bottom-20 lg:bottom-8 right-4 lg:right-8 z-50">
                    <NotificationIcon />
                </div>

                <div className="w-full">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation - Docked & Premium */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-3xl z-50 pb-safe ${isBirthday ? 'bg-white/95 border-amber-200/50' : 'bg-white/95 border-gray-200/50'}`}>
                <div className="flex items-center justify-around px-2 pt-3 pb-2">
                    {mobilePrimaryItems.map((item) => (
                        item.isExternal ? (
                            <a
                                key={item.path}
                                href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                className={`
                                    flex-1 flex flex-col items-center justify-center gap-1.5 p-1 transition-all duration-300 group
                                    text-gray-400 hover:text-gray-600
                                `}
                            >
                                <div className="relative p-1 transition-all">
                                    <item.icon
                                        size={26}
                                        className={`transition-all duration-300 group-active:scale-90`}
                                    />
                                </div>
                                <span className={`text-[10px] font-bold tracking-wide leading-none transition-colors duration-300 text-gray-500 font-medium`}>
                                    {item.label}
                                </span>
                            </a>
                        ) : (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={(e) => handleNavigation(e, item.path)}
                                className={({ isActive }) => `
                                    flex-1 flex flex-col items-center justify-center gap-1.5 p-1 transition-all duration-300 group
                                    ${isActive ? (isBirthday ? 'text-amber-600' : 'text-blue-600') : 'text-gray-400 hover:text-gray-600'}
                                `}
                            >
                                {({ isActive }) => {
                                    const Icon = isActive ? item.activeIcon : item.icon;
                                    const dotClass = isBirthday ? 'bg-amber-400' : 'bg-blue-400';
                                    const dotClassSolid = isBirthday ? 'bg-amber-500' : 'bg-blue-500';
                                    return (
                                        <>
                                            <div className="relative p-1 transition-all">
                                                <Icon
                                                    size={26}
                                                    className={`transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-sm' : 'group-active:scale-90'}`}
                                                />
                                                {isActive && (
                                                    <span className="absolute -top-1 right-0 flex h-2 w-2">
                                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass}`}></span>
                                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClassSolid}`}></span>
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[10px] font-bold tracking-wide truncate w-full text-center leading-none transition-colors duration-300 ${isActive ? (isBirthday ? 'text-amber-600' : 'text-blue-600') : 'text-gray-500 font-medium'}`}>
                                                {/* Shorten labels for mobile */}
                                                {item.label === 'Fee Management' ? 'Fees' :
                                                    item.label === 'Attendance' ? 'Attend' :
                                                        item.label === 'Sem Registration' ? 'Register' :
                                                            item.label}
                                            </span>
                                        </>
                                    );
                                }}
                            </NavLink>
                        )
                    ))}

                    {/* More Button */}
                    <button
                        onClick={() => setMoreMenuOpen(true)}
                        className={`flex-1 flex flex-col items-center justify-center gap-1.5 p-1 transition-all duration-300 group ${moreMenuOpen ? (isBirthday ? 'text-amber-600' : 'text-blue-600') : 'text-gray-400'}`}
                    >
                        <div className="relative p-1">
                            <RiMenuLine
                                size={26}
                                className={`transition-all duration-300 ${moreMenuOpen ? 'scale-110 drop-shadow-sm' : 'group-active:scale-90'}`}
                            />
                        </div>
                        <span className={`text-[10px] font-bold tracking-wide leading-none transition-colors duration-300 ${moreMenuOpen ? (isBirthday ? 'text-amber-600' : 'text-blue-600') : 'text-gray-500 font-medium'}`}>
                            Menu
                        </span>
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

                    {/* Drawer Content - with margin for bottom bar */}
                    <div className={`relative rounded-t-3xl p-6 shadow-2xl animate-fade-in-up pb-32 ${isBirthday ? 'bg-gradient-to-b from-amber-50/90 to-[#F8FAFC]' : 'bg-[#F8FAFC]'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-900">{isBirthday ? '🎂 More Menu' : 'More Menu'}</h3>
                            <button onClick={() => setMoreMenuOpen(false)} className="p-2 bg-white rounded-full text-gray-600 shadow-sm border border-gray-100">
                                <RiCloseLine size={20} />
                            </button>
                        </div>



                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {mobileSecondaryItems.map((item) => (
                                item.isExternal ? (
                                    <a
                                        key={item.path}
                                        href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                                        className={`
                                            flex flex-col items-center gap-1.5 p-1.5 rounded-2xl transition-all border
                                            bg-white text-gray-600 border-gray-100 shadow-sm hover:shadow-md active:scale-95
                                        `}
                                    >
                                        <div className={`p-2 rounded-xl bg-gray-50`}>
                                            <item.icon size={18} />
                                        </div>
                                        <span className="text-[9px] font-bold text-center line-clamp-1 leading-tight w-full">
                                            {item.label}
                                        </span>
                                    </a>
                                ) : (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={(e) => handleNavigation(e, item.path)}
                                        className={({ isActive }) => `
                                            flex flex-col items-center gap-1.5 p-1.5 rounded-2xl transition-all border
                                            ${isActive
                                                ? isBirthday
                                                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-200'
                                                    : 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
                                                : 'bg-white text-gray-600 border-gray-100 shadow-sm hover:shadow-md active:scale-95'}
                                        `}
                                    >
                                        {({ isActive }) => {
                                            const Icon = isActive ? item.activeIcon : item.icon;
                                            return (
                                                <>
                                                    <div className={`p-2 rounded-xl ${isActive ? 'bg-white/20' : 'bg-gray-50'}`}>
                                                        <Icon size={18} />
                                                    </div>
                                                    <span className="text-[9px] font-bold text-center line-clamp-1 leading-tight w-full">
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
                        <div className="space-y-3">
                            <div
                                onClick={() => {
                                    navigate('/student/profile');
                                    setMoreMenuOpen(false);
                                }}
                                className={`flex items-center gap-3 p-4 rounded-2xl border shadow-sm active:bg-gray-50 transition-colors cursor-pointer ${isBirthday ? 'bg-amber-50/50 border-amber-100' : 'bg-white border-gray-100'}`}
                            >
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center overflow-hidden ${isBirthday ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {user?.student_photo ? (
                                        <img src={user.student_photo} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <RiUser3Fill size={20} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{user?.name || 'Student'}</p>
                                    <p className="text-xs text-gray-500">View Profile</p>
                                </div>
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <RiMore2Fill size={18} className="text-gray-400" />
                                </div>
                            </div>

                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-50 text-red-600 font-bold border border-red-100 active:bg-red-100 transition-colors"
                            >
                                <RiLogoutBoxRLine size={20} />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentLayout;

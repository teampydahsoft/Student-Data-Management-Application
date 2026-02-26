import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import {
    LayoutDashboard,
    ClipboardList,
    Settings,
    Users,
    Shield,
    LogOut,
    Menu,
    ArrowLeftCircle,
    FolderTree,
    ChevronDown,
    ChevronRight
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { FRONTEND_MODULES } from '../../constants/rbac';

// Main App URL for redirection
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';

const AdminLayout = () => {
    // State
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
    const navigate = useNavigate();
    const { user, logout, token } = useAuthStore();

    const handleLogout = () => {
        logout();
        toast.success('Logged out successfully');
        navigate('/login');
    };

    const hasPortalAccess = !user?.is_worker;

    // --- Navigation Configuration ---
    const navItems = [
        {
            icon: LayoutDashboard,
            label: 'Dashboard',
            path: '/dashboard',
            permission: FRONTEND_MODULES.DASHBOARD
        },
        {
            icon: ClipboardList,
            label: 'Task Management',
            path: '/task-management',
            permission: FRONTEND_MODULES.TASK_MANAGEMENT
        },
        {
            icon: Settings,
            label: 'Configuration',
            path: '/configuration',
            permission: FRONTEND_MODULES.TICKETS
        },
        {
            icon: Users,
            label: 'Employees',
            path: '/employees',
            permission: FRONTEND_MODULES.USERS
        },
        {
            icon: Shield,
            label: 'Sub Admins',
            path: '/sub-admins',
            permission: FRONTEND_MODULES.USERS
        },
        {
            icon: Shield,
            label: 'Role Management',
            path: '/roles',
            permission: FRONTEND_MODULES.USERS
        },
        ...(hasPortalAccess ? [{
            icon: ArrowLeftCircle,
            label: 'Back to Portal',
            path: '/',
            isExternal: true
        }] : []),
    ];

    // --- Inline Styles & Media Queries (Matching StudentLayout) ---
    const styles = {
        container: {
            display: 'flex',
            height: '100vh',
            backgroundColor: '#F8FAFC',
            overflow: 'hidden',
        },
        sidebar: {
            width: '270px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRight: '1px solid #e2e8f0',
            height: '100%',
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 40,
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: desktopSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
        },
        logoArea: {
            height: '70px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid #f1f5f9',
        },
        logoBox: {
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '18px',
            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)',
        },
        logoText: {
            fontSize: '16px',
            fontWeight: '700',
            color: '#111827',
            marginLeft: '12px',
            fontFamily: "'Poppins', sans-serif",
            letterSpacing: '-0.025em',
        },
        nav: {
            padding: '20px 16px',
            overflowY: 'auto',
            flex: 1,
        },
        navItem: (isActive) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            marginBottom: '6px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '500',
            textDecoration: 'none',
            color: isActive ? '#1D4ED8' : '#4B5563',
            backgroundColor: isActive ? '#EFF6FF' : 'transparent',
            transition: 'all 0.2s',
            position: 'relative',
        }),
        mainContent: {
            flex: 1,
            height: '100vh',
            overflowY: 'auto',
            padding: '24px',
            paddingBottom: '100px',
            marginLeft: desktopSidebarOpen ? '270px' : '0',
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            width: '100%',
        },
        toggleButton: {
            position: 'fixed', top: '24px', left: '24px', zIndex: 50,
            padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.8)',
            border: '1px solid #e5e7eb', cursor: 'pointer', backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        },
        profileCard: {
            margin: '0 16px 8px 16px',
            padding: '12px',
            borderRadius: '12px',
            background: 'white',
            border: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
        },
        logoutButton: {
            width: '100%', padding: '10px', borderRadius: '8px',
            backgroundColor: '#111827', color: 'white',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontSize: '13px', fontWeight: '600'
        },
        mobileHeader: {
            display: 'none',
            height: '64px',
            background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            position: 'fixed',
            top: 0, left: 0, right: 0,
            zIndex: 45,
            color: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        mobileBottomBar: {
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            borderTop: '1px solid rgba(226, 232, 240, 0.8)',
            backdropFilter: 'blur(12px)',
            zIndex: 50,
            paddingBottom: 'env(safe-area-inset-bottom, 20px)',
            justifyContent: 'space-around',
            paddingTop: '8px',
            height: 'auto',
            boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)',
        },
        mobileNavItem: (isActive) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px',
            textDecoration: 'none',
            color: isActive ? '#2563EB' : '#9CA3AF',
            fontSize: '10px',
            fontWeight: '600',
        }),
        backdrop: {
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 48,
            backdropFilter: 'blur(2px)',
        }
    };

    return (
        <div style={styles.container}>
            {/* Inject CSS for Media Queries */}
            <style>{`
                @media (max-width: 1024px) {
                    .desktop-sidebar { width: 270px; z-index: 60 !important; }
                    .main-content { margin-left: 0 !important; padding-top: 84px !important; }
                    .mobile-header { display: flex !important; }
                    .mobile-bottom-bar { display: flex !important; }
                }
                @media (min-width: 1025px) {
                    .desktop-sidebar { display: flex !important; }
                    .mobile-header { display: none !important; }
                    .mobile-bottom-bar { display: none !important; }
                }
            `}</style>

            {/* Background Pattern */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                opacity: 0.4,
                backgroundImage: `radial-gradient(#CBD5E1 1.5px, transparent 1.5px)`,
                backgroundSize: '24px 24px'
            }} />

            {/* Mobile Sidebar Backdrop */}
            {desktopSidebarOpen && (
                <div
                    className="lg:hidden"
                    style={styles.backdrop}
                    onClick={() => setDesktopSidebarOpen(false)}
                />
            )}

            {/* Mobile Header (Blue Theme) */}
            <header style={styles.mobileHeader} className="mobile-header">
                <button
                    onClick={() => setDesktopSidebarOpen(true)}
                    className="p-2 -ml-2 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <Menu size={24} />
                </button>

                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                        <span className="font-bold text-white">A</span>
                    </div>
                    <span className="font-bold text-lg tracking-wide text-white">Admin Portal</span>
                </div>

                <div
                    className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border-2 border-white/20"
                >
                    <span className="text-sm font-bold text-white">{user?.username?.charAt(0).toUpperCase() || 'A'}</span>
                </div>
            </header>

            {/* Sidebar */}
            <aside style={styles.sidebar} className="desktop-sidebar shadow-xl">
                <div style={styles.logoArea}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={styles.logoBox}>T</div>
                        <span style={styles.logoText}>Ticket Admin</span>
                    </div>
                    {/* Hide sidebar button (Desktop only) */}
                    <button onClick={() => setDesktopSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                        <Menu size={20} />
                    </button>
                </div>

                <nav style={styles.nav} className="custom-scrollbar">
                    {navItems.map((item, index) => {
                        const Icon = item.icon;
                        if (item.isExternal) {
                            return (
                                <a
                                    key={index}
                                    href={item.path === '/' ? MAIN_APP_URL : `${MAIN_APP_URL}${item.path}`}
                                    style={styles.navItem(false)}
                                    className="hover:bg-blue-50 hover:text-blue-700"
                                >
                                    <Icon size={20} />
                                    <span>{item.label}</span>
                                </a>
                            );
                        }
                        return (
                            <NavLink
                                key={index}
                                to={item.path}
                                style={({ isActive }) => styles.navItem(isActive)}
                            >
                                {({ isActive }) => (
                                    <>
                                        <Icon size={20} />
                                        <span>{item.label}</span>
                                        {isActive && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563EB' }} />}
                                    </>
                                )}
                            </NavLink>
                        );
                    })}

                    {/* Workspace Dropdown */}
                    {hasPortalAccess && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                            <button
                                onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
                                style={{
                                    ...styles.navItem(false),
                                    width: '100%',
                                    justifyContent: 'space-between',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#4B5563'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <FolderTree size={20} />
                                    <span>Workspace</span>
                                </div>
                                {workspaceDropdownOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>

                            {workspaceDropdownOpen && (
                                <div style={{ paddingLeft: '24px', marginTop: '4px' }}>
                                    <a
                                        href={`${MAIN_APP_URL}/auth-callback?token=${token}&role=${user?.role || 'admin'}&from=ticket_app`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '10px 16px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            textDecoration: 'none',
                                            color: '#4B5563',
                                            transition: 'all 0.2s'
                                        }}
                                        className="hover:bg-blue-50 hover:text-blue-700"
                                    >
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
                                        <span>Student Database</span>
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </nav>

                {/* User Info */}
                <div style={styles.profileCard}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F46E5', fontSize: '14px', fontWeight: 'bold' }}>
                        {user?.username?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                            {user?.name || user?.username || 'Admin'}
                        </p>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>
                            {user?.role}
                        </p>
                    </div>
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid #f1f5f9', backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
                    <button onClick={handleLogout} style={styles.logoutButton}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={styles.mainContent} className="main-content">
                <Outlet />
            </main>

            {/* Mobile Bottom Bar */}
            <div style={styles.mobileBottomBar} className="mobile-bottom-bar">
                {navItems.slice(0, 4).map((item, index) => {
                    if (item.isExternal) {
                        return (
                            <a
                                key={index}
                                href={item.path === '/' ? MAIN_APP_URL : `${MAIN_APP_URL}${item.path}`}
                                style={styles.mobileNavItem(false)}
                            >
                                <item.icon size={24} />
                                <span>{item.label}</span>
                            </a>
                        );
                    }

                    return (
                        <NavLink
                            key={index}
                            to={item.path}
                            style={({ isActive }) => styles.mobileNavItem(isActive)}
                        >
                            <item.icon size={24} />
                            <span>{item.label === 'Task Management' ? 'Tickets' : item.label === 'Configuration' ? 'Settings' : item.label}</span>
                        </NavLink>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminLayout;

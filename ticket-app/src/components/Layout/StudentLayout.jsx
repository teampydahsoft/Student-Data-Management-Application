import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import {
    RiHome4Line,
    RiHome4Fill,
    RiTicketLine,
    RiTicketFill,
    RiUser3Line,
    RiUser3Fill,
    RiLogoutBoxRLine,
    RiMenuLine,
    RiCloseLine,
    RiMore2Fill,
    RiAddCircleLine,
    RiAddCircleFill
} from 'react-icons/ri';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import NotificationPrompt from '../NotificationPrompt';
import { getWorkspaceLinks, hasStudentDatabasePortalAccess, isHrmsOnlyTicketUser } from '../../utils/hrmsPortal';
import { getMainAppReturnUrl } from '../../utils/mainAppUrl';
import { RiExternalLinkLine } from 'react-icons/ri';

const StudentLayout = ({ children }) => {
    // State
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [workspaceOpen, setWorkspaceOpen] = useState(false);

    const navigate = useNavigate();
    const { user, logout, token } = useAuthStore();
    const isHrmsOnly = isHrmsOnlyTicketUser(user);
    const hasPortalAccess = hasStudentDatabasePortalAccess(user);
    const workspaceLinks = getWorkspaceLinks(user, { token });

    // --- Navigation Configuration (Short List) ---
    const allNavItems = [
        { icon: RiHome4Line, activeIcon: RiHome4Fill, label: 'Dashboard', path: '/student/dashboard', isExternal: false },
        { icon: RiAddCircleLine, activeIcon: RiAddCircleFill, label: 'Raise Ticket', path: '/student/raise-ticket', isExternal: false },
        { icon: RiTicketLine, activeIcon: RiTicketFill, label: 'Ticket History', path: '/student/my-tickets', isExternal: false },
        { icon: RiUser3Line, activeIcon: RiUser3Fill, label: 'Portal Profile', path: '/student/profile', isExternal: true },
        { icon: RiLogoutBoxRLine, activeIcon: RiLogoutBoxRLine, label: 'Back to Portal', path: '/student/dashboard', isExternal: true },
    ];

    const navItems = isHrmsOnly
        ? allNavItems.filter((item) => !item.isExternal)
        : allNavItems;

    const mobilePrimaryItems = navItems.slice(0, 4); // Show first 4 on mobile bar

    const handleNavigation = (e, item) => {
        if (item.isExternal) {
            e.preventDefault();
            window.location.href = getMainAppReturnUrl({
                token,
                role: 'student',
                path: item.path,
            });
        }
        setMoreMenuOpen(false);
    };

    const portalExternalHref = (path) =>
        getMainAppReturnUrl({ token, role: 'student', path });

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // --- Inline Styles & Media Queries ---
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
            display: 'flex',            // Base display (desktop override handled by css)
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
            // Display property is controlled via CSS class to handle media queries
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
        profileCard: {
            margin: '0 16px 8px 16px',
            padding: '12px',
            borderRadius: '12px',
            background: 'white',
            border: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
        },
    };

    return (
        <div style={styles.container}>
            {/* Inject CSS for Media Queries */}
            <style>{`
                /* Desktop Sidebar */
                @media (max-width: 1024px) {
                    .desktop-sidebar { display: none !important; }
                    .main-content { margin-left: 0 !important; padding-top: 24px !important; padding-bottom: 80px !important; }
                    .mobile-bottom-bar { display: flex !important; }
                }
                @media (min-width: 1025px) {
                    .desktop-sidebar { display: flex !important; }
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

            {/* Desktop Sidebar */}
            <aside style={styles.sidebar} className="desktop-sidebar shadow-xl">
                <div style={styles.logoArea}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={styles.logoBox}>T</div>
                        <span style={styles.logoText}>Ticket Support</span>
                    </div>
                    {/* Hide sidebar button (Desktop only) */}
                    <button onClick={() => setDesktopSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                        <RiMenuLine size={20} />
                    </button>
                </div>

                <nav style={styles.nav} className="custom-scrollbar">
                    {navItems.map((item, index) => {
                        return item.isExternal ? (
                            <a
                                key={index}
                                href={portalExternalHref(item.path)}
                                onClick={(e) => handleNavigation(e, item)}
                                style={styles.navItem(false)}
                                className="hover:bg-blue-50 hover:text-blue-700"
                            >
                                <item.icon size={20} style={{ minWidth: '20px' }} />
                                <span>{item.label}</span>
                            </a>
                        ) : (
                            <NavLink
                                key={index}
                                to={item.path}
                                style={({ isActive }) => styles.navItem(isActive)}
                            >
                                {({ isActive }) => (
                                    <>
                                        <item.icon size={20} style={{ minWidth: '20px' }} />
                                        <span>{item.label}</span>
                                        {isActive && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563EB' }} />}
                                    </>
                                )}
                            </NavLink>
                        )
                    })}
                    {workspaceLinks.length > 0 && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setWorkspaceOpen(!workspaceOpen)}
                                style={{
                                    ...styles.navItem(false),
                                    width: '100%',
                                    justifyContent: 'space-between',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <span>Workspace</span>
                                <RiExternalLinkLine size={16} />
                            </button>
                            {workspaceOpen && workspaceLinks.map((link) => (
                                <a
                                    key={link.id}
                                    href={link.href}
                                    target={link.external ? '_blank' : undefined}
                                    rel={link.external ? 'noopener noreferrer' : undefined}
                                    style={{
                                        ...styles.navItem(false),
                                        marginTop: '4px',
                                        marginLeft: '8px',
                                        fontSize: '13px',
                                    }}
                                    className="hover:bg-blue-50 hover:text-blue-700"
                                >
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
                                    <span>{link.label}</span>
                                </a>
                            ))}
                        </div>
                    )}
                </nav>

                {/* User Profile */}
                <div
                    style={{
                        ...styles.profileCard,
                        cursor: hasPortalAccess ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                        if (hasPortalAccess) {
                            window.location.href = getMainAppReturnUrl({
                                token,
                                role: 'student',
                                path: '/student/profile',
                            });
                        }
                    }}
                >
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F46E5', overflow: 'hidden' }}>
                        {user?.student_photo ? (
                            <img src={user.student_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <RiUser3Fill size={18} />
                        )}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                            {user?.student_name || user?.name || 'Student'}
                        </p>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>
                            {user?.admission_number || user?.admissionNumber || user?.username || user?.email}
                        </p>
                    </div>
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid #f1f5f9', backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%', padding: '10px', borderRadius: '8px',
                            backgroundColor: '#111827', color: 'white',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            fontSize: '13px', fontWeight: '600'
                        }}
                    >
                        <RiLogoutBoxRLine size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={styles.mainContent} className="main-content">
                <Outlet />
            </main>

            {/* Mobile Bottom Bar */}
            <div style={styles.mobileBottomBar} className="mobile-bottom-bar">
                {mobilePrimaryItems.map((item, index) => {
                    const active = !item.isExternal && window.location.pathname === item.path; // Simple active check

                    if (item.isExternal) {
                        return (
                            <a
                                key={index}
                                href={portalExternalHref(item.path)}
                                onClick={(e) => handleNavigation(e, item)}
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
                            <span>{item.label === 'Ticket History' ? 'History' : item.label === 'Raise Ticket' ? 'Raise' : item.label}</span>
                        </NavLink>
                    );
                })}
            </div>
            <NotificationPrompt />
        </div>
    );
};

export default StudentLayout;

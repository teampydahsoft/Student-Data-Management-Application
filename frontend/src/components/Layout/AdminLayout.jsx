import React, { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  LogOut,
  Menu,
  X,
  Settings,
  CalendarCheck,
  ShieldCheck,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  DollarSign,
  Ticket,
  FolderTree,
  Megaphone,
  Briefcase,
  ArrowLeftRight,
  Wrench,
  GraduationCap,
  Building2,
  Database,
  UserPlus,
  Clock,
  UserSquare,
  MessageSquare,
  PieChart,
  Tag,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import {
  MODULE_ROUTE_MAP,
  getModuleKeyForPath,
  hasModuleAccess,
  getAllowedFrontendModules,
  isFullAccessRole,
  FRONTEND_MODULES,
  FRONTEND_TO_BACKEND_MAP,
  hasPermission,
  ROLE_LABELS,
  USER_ROLES,
} from "../../constants/rbac";
import toast from "react-hot-toast";

const TICKET_APP_URL = import.meta.env.VITE_TICKET_APP_URL || 'https://pydahsdms-tickets.vercel.app';

const NAV_ITEMS = [
  {
    path: "/",
    icon: LayoutDashboard,
    label: "Dashboard",
    permission: FRONTEND_MODULES.DASHBOARD,
  },
  {
    path: "/students",
    icon: Users,
    label: "Students",
    permission: FRONTEND_MODULES.STUDENTS,
    subItems: [
      {
        path: "/students",
        label: "Students Database",
        icon: Database,
        permission: FRONTEND_MODULES.STUDENTS,
      },
      {
        path: "/students/self-registration",
        label: "Self Registration",
        icon: UserPlus,
        permission: FRONTEND_MODULES.SUBMISSIONS,
      },
      {
        path: "/students/profile-change-requests",
        label: "Profile Requests",
        icon: ClipboardList,
        permission: FRONTEND_MODULES.STUDENTS,
        action: 'edit_student'
      },
    ],
  },
  {
    path: "/attendance",
    icon: CalendarCheck,
    label: "Attendance",
    permission: FRONTEND_MODULES.ATTENDANCE,
    subItems: [
      {
        path: "/attendance",
        label: "Daily Attendance",
        icon: CalendarCheck,
        permission: FRONTEND_MODULES.ATTENDANCE,
        action: 'view'
      },
      // Hourly Attendance hidden as requested
      /* {
        path: "/attendance-monitoring",
        label: "Hourly Attendance",
        icon: Clock,
        permission: FRONTEND_MODULES.ATTENDANCE,
        action: 'view_hourly'
      }, */
      {
        path: "/internship-management",
        label: "Internship Attendance",
        icon: Briefcase,
        permission: FRONTEND_MODULES.ATTENDANCE,
        action: 'view_internship'
      }
    ]
  },
  {
    path: "/reports",
    icon: BarChart3,
    label: "Reports",
    permission: FRONTEND_MODULES.REPORTS,
    subItems: [
      {
        path: "/reports",
        label: "Registration Reports",
        icon: FileText,
        permission: FRONTEND_MODULES.REPORTS,
        action: 'view_registration'
      },
      {
        path: "/reports/attendance",
        label: "Attendance Reports",
        icon: ClipboardList,
        permission: FRONTEND_MODULES.REPORTS,
        action: 'view_attendance'
      },
      {
        path: "/reports/day-end",
        label: "Day End Report",
        icon: PieChart,
        permission: FRONTEND_MODULES.REPORTS,
        action: 'view_day_end'
      },
      {
        path: "/reports/category",
        label: "Category Report",
        icon: Tag,
        permission: FRONTEND_MODULES.REPORTS,
        action: 'view_category'
      },
    ],
  },
  {
    path: "/users",
    icon: ShieldCheck,
    label: "User Management",
    permission: FRONTEND_MODULES.USERS,
  },
  {
    path: "/announcements",
    icon: Megaphone,
    label: "Announcements",
    permission: FRONTEND_MODULES.ANNOUNCEMENTS,
  },
  {
    path: "/clubs",
    icon: Users,
    label: "Clubs",
    permission: FRONTEND_MODULES.ANNOUNCEMENTS,
  }, // Reusing announcement permission for now, or use a new one if available.
  {
    path: "/services",
    icon: Briefcase,
    label: "Services",
    permission: FRONTEND_MODULES.SERVICES,
    subItems: [
      {
        path: "/services/requests",
        label: "Service Requests",
        icon: ClipboardList,
        permission: FRONTEND_MODULES.SERVICES,
      },
      {
        path: "/services/config",
        label: "Configuration",
        icon: Settings,
        permission: FRONTEND_MODULES.SERVICES,
      },
    ],
  },
  {
    path: "/courses",
    icon: Settings,
    label: "Settings",
    permission: FRONTEND_MODULES.COURSES,
  },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set()); // Collapsed by default
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false); // New: For mobile "More" menu

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const getTicketAppUrl = (path) => {
    const token = localStorage.getItem('token');
    let userStr = localStorage.getItem('user');

    // Remove large fields (like student_photo) to prevent HTTP 431 Header Too Large errors
    try {
      const userObj = JSON.parse(userStr);
      if (userObj) {
        // Filter out photo or other large fields
        const { student_photo, ...safeUser } = userObj;
        userStr = JSON.stringify(safeUser);
      }
    } catch (e) {
      console.error('Error parsing user object for SSO', e);
    }

    return `${TICKET_APP_URL}/auth-callback?token=${token}&user=${encodeURIComponent(userStr)}&redirect=${path}`;
  };

  // Get allowed modules based on user role and permissions
  const allowedModules = useMemo(() => {
    if (!user) return [];

    // Super admin and legacy admin have full access to all modules
    if (isFullAccessRole(user.role)) {
      return Object.values(FRONTEND_MODULES);
    }

    // For RBAC users, check permissions using the mapping
    if (user.permissions) {
      return getAllowedFrontendModules(user.permissions);
    }

    // Legacy staff users with modules array
    return Array.isArray(user.modules) ? user.modules : [];
  }, [user]);

  // Whether user has access to any workspace item (e.g. Ticket/Maintenance Management).
  // Only show the Workspace section in sidebar when they have access.
  const hasWorkspaceAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    if (user.permissions && hasModuleAccess(user.permissions, FRONTEND_MODULES.TICKETS)) return true;
    return Array.isArray(user.modules) && user.modules.includes(FRONTEND_MODULES.TICKETS);
  }, [user]);

  // Filter navigation items based on user's allowed modules
  const filteredNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.permission) return true;

      // Super admin and legacy admin have full access
      if (isFullAccessRole(user?.role)) return true;

      // For RBAC users, check permissions using the mapping
      if (user?.permissions) {
        return hasModuleAccess(user.permissions, item.permission);
      }

      // Legacy staff users
      return allowedModules.includes(item.permission);
    }).map((item) => {
      // Filter sub-items based on permissions
      if (item.subItems) {
        const filteredSubItems = item.subItems.filter((subItem) => {
          if (!subItem.permission) return true;

          if (isFullAccessRole(user?.role)) return true;

          if (user?.permissions) {
            // If specific action is required, check that action
            if (subItem.action) {
              const backendModules = FRONTEND_TO_BACKEND_MAP[subItem.permission];
              if (!backendModules || backendModules.length === 0) return false;
              // Check if user has the specific action in ANY of the backend modules mapped to this frontend module
              return backendModules.some(backendModule =>
                hasPermission(user.permissions, backendModule, subItem.action)
              );
            }
            return hasModuleAccess(user.permissions, subItem.permission);
          }

          return allowedModules.includes(subItem.permission);
        });

        return { ...item, subItems: filteredSubItems };
      }
      return item;
    });
  }, [allowedModules, user?.role, user?.permissions]);

  // Check if a route is active (including sub-routes)
  const isRouteActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  // Toggle submenu expansion
  const toggleSubmenu = (path) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // Auto-expand parent menu when on a sub-route
  useEffect(() => {
    filteredNavItems.forEach((item) => {
      if (item.subItems) {
        const hasActiveSubItem = item.subItems.some(
          (subItem) => location.pathname === subItem.path,
        );
        if (hasActiveSubItem && !expandedItems.has(item.path)) {
          setExpandedItems((prev) => new Set([...prev, item.path]));
        }
      }
    });
  }, [location.pathname, filteredNavItems]);

  // Close workspace dropdown when sidebar collapses
  useEffect(() => {
    if (sidebarCollapsed) {
      setWorkspaceDropdownOpen(false);
    }
  }, [sidebarCollapsed]);

  // Redirect user if they try to access a module they don't have access to
  useEffect(() => {
    if (!user) return;

    // Super admin and legacy admin have full access
    if (isFullAccessRole(user.role)) return;

    const currentModuleKey = getModuleKeyForPath(location.pathname);

    // Check if user has access to current module
    if (currentModuleKey && !allowedModules.includes(currentModuleKey)) {
      // Redirect to first allowed route or dashboard
      const firstAllowedRoute =
        allowedModules.length > 0 ? MODULE_ROUTE_MAP[allowedModules[0]] : "/";
      navigate(firstAllowedRoute, { replace: true });
    }
  }, [user, allowedModules, location.pathname, navigate]);

  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embedded") === "true";

  if (isEmbedded) {
    return (
      <div className="min-h-screen bg-white">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 relative">
      {/* 1. Global Sidebars & Overlays (Stacking Context Fix) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[90] lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          hidden lg:flex flex-col bg-[#11180F] border-r border-white/10 transition-all duration-300 ease-in-out z-40
          ${sidebarCollapsed ? "w-20" : "w-64"}
          premium-stars-sidebar
        `}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo and Close Button */}
          <div
            className={`border-b border-white/10 flex items-center transition-[padding,justify-content] duration-300 ease-out ${sidebarCollapsed ? "justify-center p-3 lg:p-4" : "justify-between p-4 lg:p-6"}`}
          >
            <div className={`flex items-center gap-3 transition-all duration-300 ${sidebarCollapsed ? 'justify-center w-10 h-10' : 'w-full px-2'}`}>
              {!sidebarCollapsed && (
                <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center shrink-0">
                  <Building2 size={20} className="text-white" />
                </div>
              )}
              {!sidebarCollapsed && (
                <div className="flex flex-col">
                  <span className="text-lg font-bold tracking-wider !text-white heading-font">
                    PYDAH
                  </span>
                  <span className="text-[10px] text-gray-300 font-medium uppercase tracking-tight">
                    {user?.role ? (ROLE_LABELS[user.role] || user.role.replace('_', ' ')) : "ADMIN"}
                  </span>
                </div>
              )}
            </div>
            {/* Toggle button for sidebar */}
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(!sidebarOpen);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              className="p-2.5 rounded-lg text-gray-100 hover:text-white transition-all flex-shrink-0 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center bg-transparent"
              aria-label={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {window.innerWidth < 1024 ? (
                sidebarOpen ? <ChevronsLeft size={24} /> : <Menu size={24} />
              ) : (
                sidebarCollapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav
            className={`flex-1 space-y-1 transition-[padding] duration-300 ease-out overflow-y-auto overflow-x-hidden premium-sidebar-nav ${sidebarCollapsed ? "p-2" : "p-3 sm:p-4"}`}
            style={{ scrollBehavior: "smooth" }}
          >
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = expandedItems.has(item.path);
              const isActive = isRouteActive(item.path);

              if (hasSubItems && !sidebarCollapsed) {
                const shouldAutoExpand = item.subItems.some(subItem => location.pathname === subItem.path);
                const isActuallyExpanded = isExpanded || shouldAutoExpand;

                return (
                  <div key={item.path} className="space-y-1">
                    <button
                      onClick={() => {
                        setWorkspaceDropdownOpen(false);
                        toggleSubmenu(item.path);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg transition-all duration-200 gap-3 px-3 py-2.5 min-h-[44px]
                        ${isActive && !isActuallyExpanded ? "bg-[#4a5d3f] text-white font-semibold shadow-md active" : isActuallyExpanded ? "bg-white/5 text-white font-medium" : "text-gray-100/90 hover:bg-white/10 hover:text-white"}`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Icon size={18} className="flex-shrink-0" />
                        <span className="whitespace-nowrap font-medium text-xs">{item.label}</span>
                      </div>
                      {isActuallyExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {isActuallyExpanded && (
                      <div className="ml-2 space-y-0.5 pl-6 py-2 border-l-2 border-[#4a5d3f] bg-gradient-to-r from-white/5 to-transparent rounded-r-md">
                        {item.subItems.map((subItem) => {
                          const isSubActive = location.pathname === subItem.path;
                          const SubIcon = subItem.icon || LayoutDashboard;
                          return (
                            <Link
                              key={subItem.path}
                              to={subItem.path}
                              onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                              className={`flex items-center rounded-md transition-all duration-200 gap-2 px-2 py-1.5 text-[11px] font-medium relative min-h-[36px]
                                ${isSubActive ? "bg-[#4a5d3f] text-white font-semibold shadow-lg scale-[1.02] active" : "text-gray-200/80 hover:bg-white/10 hover:text-white hover:translate-x-1"}`}
                            >
                              <SubIcon size={14} className={isSubActive ? "text-white" : "text-gray-400"} />
                              <span className="whitespace-nowrap">{subItem.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.subItems?.[0]?.path || item.path}
                  onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                  className={`flex items-center rounded-md transition-all duration-200 
                    ${sidebarCollapsed ? "justify-center px-1.5 py-3" : "gap-2 px-2.5 py-2"}
                    ${isActive ? "bg-[#4a5d3f] text-white font-semibold shadow-md active" : "text-gray-100/90 hover:bg-white/10 hover:text-white"}`}
                  title={sidebarCollapsed ? item.label : ""}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="text-xs">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Footer of Sidebar */}
          <div className={`border-t border-white/10 ${sidebarCollapsed ? "p-2" : "p-4"} space-y-4`}>
            {hasWorkspaceAccess && (
              <div className="space-y-1">
                <button
                  onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
                  className={`w-full flex items-center justify-between rounded-lg transition-all duration-200 gap-3 px-3 py-2.5 min-h-[44px]
                    ${workspaceDropdownOpen ? "bg-white/5 text-white font-medium shadow-sm" : "text-gray-100/90 hover:bg-white/10 hover:text-white"}`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <FolderTree size={18} className="flex-shrink-0" />
                    {!sidebarCollapsed && <span className="text-xs font-medium">Workspace</span>}
                  </div>
                  {!sidebarCollapsed && (workspaceDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                </button>

                {workspaceDropdownOpen && !sidebarCollapsed && (
                  <div className="ml-2 space-y-0.5 pl-6 py-2 border-l-2 border-indigo-500/50 bg-gradient-to-r from-white/5 to-transparent rounded-r-md">
                    {/* Maintenance Management Link */}
                    {(isFullAccessRole(user?.role) || (user?.permissions && hasModuleAccess(user.permissions, FRONTEND_MODULES.TICKETS)) || (Array.isArray(user?.modules) && user.modules.includes(FRONTEND_MODULES.TICKETS))) && (
                      <a
                        href={getTicketAppUrl('/tickets')}
                        className="flex items-center rounded-md transition-all duration-200 gap-2 px-2 py-1.5 text-[11px] font-medium text-gray-200/80 hover:bg-white/10 hover:text-white hover:translate-x-1 min-h-[32px]"
                      >
                        <Ticket size={14} className="text-gray-400" />
                        <span>Maintenance Management</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-3" : "justify-between"}`}>
              <Link to="/profile" onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }} className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{user?.username?.charAt(0).toUpperCase()}</span>
                </div>
                {!sidebarCollapsed && <span className="text-sm text-white truncate">{user?.name || user?.username}</span>}
              </Link>
              <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-100 hover:text-red-400">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className={`flex-1 h-screen overflow-y-auto overflow-x-hidden relative z-10 transition-all duration-300 pb-20 lg:pb-0`}>
        <div className="p-4 lg:p-8 bg-gray-50/20 min-h-full">
          <Outlet />
        </div>
      </main>

      {/* 3. Mobile Navigation Bar (Docked at Bottom) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-gray-100/50 z-[80] pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2.5rem] transition-all duration-500">
        <div className="flex items-center justify-around h-20 px-4">
          {filteredNavItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 transition-all duration-300
                  ${isActive ? "text-[#4a5d3f] -translate-y-1" : "text-gray-400"}`}
              >
                <div className={`relative p-2 rounded-2xl transition-all duration-300 ${isActive ? "bg-[#4a5d3f]/10 shadow-sm" : "hover:bg-gray-50"}`}>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
                  {isActive && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4a5d3f] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#4a5d3f]"></span>
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-black tracking-tighter uppercase transition-colors ${isActive ? "text-[#4a5d3f]" : "text-gray-400"}`}>
                  {item.label === "User Management" ? "Users" : item.label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreMenuOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 transition-all duration-300
              ${moreMenuOpen ? "text-[#4a5d3f] -translate-y-1" : "text-gray-400"}`}
          >
            <div className={`p-2 rounded-2xl transition-all duration-300 ${moreMenuOpen ? "bg-[#4a5d3f]/10 shadow-sm" : "hover:bg-gray-50"}`}>
              <Menu size={24} strokeWidth={moreMenuOpen ? 2.5 : 1.5} />
            </div>
            <span className={`text-[10px] font-black tracking-tighter uppercase ${moreMenuOpen ? "text-[#4a5d3f]" : "text-gray-400"}`}>Menu</span>
          </button>
        </div>
      </div>

      {/* 4. Mobile "More Menu" Drawer */}
      {moreMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[100] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreMenuOpen(false)}
          />

          {/* Drawer */}
          <div className="relative bg-white/95 backdrop-blur-2xl rounded-t-[3rem] p-8 shadow-2xl animate-fade-in-up max-h-[85vh] overflow-y-auto pb-safe border-t border-white/20">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8 opacity-50" />
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight heading-font">Admin Menu</h3>
                <p className="text-xs text-gray-500 font-medium">Quick access to all modules</p>
              </div>
              <button
                onClick={() => setMoreMenuOpen(false)}
                className="p-3 bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all active:scale-90"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-10">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = isRouteActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreMenuOpen(false)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-3xl transition-all duration-300 border
                      ${isActive
                        ? "bg-[#4a5d3f] text-white border-[#4a5d3f] shadow-xl shadow-[#4a5d3f]/20 -translate-y-1"
                        : "bg-white text-gray-600 border-gray-100 hover:border-gray-200 active:scale-95"}`}
                  >
                    <div className={`p-3 rounded-2xl transition-all ${isActive ? "bg-white/20 shadow-inner" : "bg-gray-50 text-gray-400"}`}>
                      <Icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
                    </div>
                    <span className="text-[10px] font-black text-center line-clamp-1 leading-tight tracking-tight uppercase px-1">
                      {item.label === "User Management" ? "Users" : item.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="space-y-4 pt-6 border-t border-gray-100">
              {/* Workspace Links in Mobile Menu */}
              {hasWorkspaceAccess && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Workspaces</p>
                    <div className="h-px bg-gray-100 flex-1 ml-4" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {(isFullAccessRole(user?.role) || (user?.permissions && hasModuleAccess(user.permissions, FRONTEND_MODULES.TICKETS)) || (Array.isArray(user?.modules) && user.modules.includes(FRONTEND_MODULES.TICKETS))) && (
                      <a
                        href={getTicketAppUrl('/tickets')}
                        className="group flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 text-indigo-700 font-bold active:scale-[0.98] transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-white shadow-sm group-hover:scale-110 transition-transform">
                            <Ticket size={20} className="text-indigo-600" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm">Maintenance Management</span>
                            <span className="text-[10px] text-indigo-500/70 font-medium">External Application</span>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-indigo-300" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50/80 border border-gray-100 shadow-inner">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg ring-4 ring-white">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 leading-tight">{user?.name || user?.username}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                    {user?.role ? (ROLE_LABELS[user.role] || user.role.replace('_', ' ')) : "ADMIN"}
                  </p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMoreMenuOpen(false)}
                  className="p-2.5 bg-white rounded-xl text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100"
                >
                  <Settings size={18} />
                </Link>
              </div>

              <button
                onClick={handleLogout}
                className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-rose-50 text-rose-600 font-bold border border-rose-100 active:bg-rose-100 transition-colors shadow-sm"
              >
                <LogOut size={20} strokeWidth={2.5} />
                <span className="tracking-tight">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default AdminLayout;

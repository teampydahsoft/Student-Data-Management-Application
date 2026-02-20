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
} from "../../constants/rbac";
import toast from "react-hot-toast";

const TICKET_APP_URL = import.meta.env.VITE_TICKET_APP_URL || 'http://localhost:5174';

const NAV_ITEMS = [
  {
    path: "/",
    icon: LayoutDashboard,
    label: "Dashboard",
    permission: FRONTEND_MODULES.DASHBOARD,
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
    ],
  },
  {
    path: "/promotions",
    icon: TrendingUp,
    label: "Promotions",
    permission: FRONTEND_MODULES.PROMOTIONS,
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
      {
        path: "/attendance-monitoring",
        label: "Hourly Attendance",
        icon: Clock,
        permission: FRONTEND_MODULES.ATTENDANCE,
        action: 'view_hourly'
      },
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
    path: "/courses",
    icon: Settings,
    label: "Settings",
    permission: FRONTEND_MODULES.COURSES,
  },

  {
    path: "/users",
    icon: ShieldCheck,
    label: "User Management",
    permission: FRONTEND_MODULES.USERS,
  },
  {
    path: "/faculty-management",
    icon: GraduationCap,
    label: "Faculty Members",
    permission: FRONTEND_MODULES.FACULTY_MANAGEMENT,
    subItems: [
      {
        path: "/faculty-management",
        label: "Faculty List",
        icon: UserSquare,
        permission: FRONTEND_MODULES.FACULTY_MANAGEMENT,
      },
      {
        path: "/feedback-forms",
        label: "Feed Back",
        icon: MessageSquare,
        permission: FRONTEND_MODULES.FACULTY_MANAGEMENT,
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
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set()); // Collapsed by default
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);

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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 heading-font">
          Admin Panel
        </h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2.5 rounded-lg hover:bg-blue-100 active:bg-blue-200 text-gray-700 hover:text-blue-700 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen premium-stars-sidebar border-r border-white/10
          transition-[width,transform] duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          ${sidebarCollapsed ? "w-16" : "w-56"}
          flex flex-col
        `}
        style={{ willChange: "width, transform" }}
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
                <span className="text-xl font-bold tracking-wider !text-white heading-font">
                  PYDAH
                </span>
              )}
            </div>
            {/* Toggle button for mobile and desktop */}
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
            style={{
              scrollBehavior: "smooth",
            }}
          >
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = expandedItems.has(item.path);
              const isActive = isRouteActive(item.path);

              if (hasSubItems && !sidebarCollapsed) {
                // Auto-expand if any sub-item is active
                const shouldAutoExpand = item.subItems.some(
                  (subItem) => location.pathname === subItem.path,
                );
                const isActuallyExpanded = isExpanded || shouldAutoExpand;

                return (
                  <div key={item.path} className="space-y-1">
                    <button
                      onClick={() => {
                        // Close workspace dropdown when opening other menus
                        setWorkspaceDropdownOpen(false);
                        toggleSubmenu(item.path);
                        setSidebarOpen(false);
                      }}
                      className={`
                        w-full flex items-center justify-between rounded-lg transition-all duration-200 touch-manipulation premium-sidebar-link
                        gap-3 px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px]
                        ${isActive && !isActuallyExpanded
                          ? "bg-[#4a5d3f] text-white font-semibold shadow-md active"
                          : isActuallyExpanded
                            ? "bg-white/5 text-white font-medium"
                            : "text-gray-100/90 hover:bg-white/10 hover:text-white"
                        }
                      `}
                      aria-label={
                        isActuallyExpanded ? "Collapse menu" : "Expand menu"
                      }
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Icon size={18} className="flex-shrink-0" />
                        <span className="whitespace-nowrap font-medium text-xs">
                          {item.label}
                        </span>
                      </div>
                      {isActuallyExpanded ? (
                        <ChevronUp
                          size={18}
                          className="flex-shrink-0 transition-transform duration-200"
                        />
                      ) : (
                        <ChevronDown
                          size={18}
                          className="flex-shrink-0 transition-transform duration-200"
                        />
                      )}
                    </button>
                    {isActuallyExpanded && (
                      <div className="ml-2 space-y-0.5 pl-6 py-2 border-l-2 border-[#4a5d3f] bg-gradient-to-r from-white/5 to-transparent rounded-r-md">
                        {item.subItems.map((subItem, index) => {
                          const isSubActive =
                            location.pathname === subItem.path;

                          if (subItem.isExternal) {
                            const SubIcon = subItem.icon || LayoutDashboard;
                            return (
                              <a
                                key={subItem.path}
                                href={subItem.isTicketApp ? getTicketAppUrl(subItem.path) : subItem.path}
                                className={`
                                    flex items-center rounded-md transition-all duration-200 touch-manipulation premium-sidebar-link
                                    gap-2 px-2 py-1.5 text-[11px] font-medium relative min-h-[36px]
                                    text-gray-200/80 hover:bg-white/10 hover:text-white hover:translate-x-1
                                  `}
                              >
                                <SubIcon size={14} className={`flex-shrink-0 ${isSubActive ? "text-white" : "text-gray-400"}`} />
                                <span className="whitespace-nowrap">
                                  {subItem.label}
                                </span>
                              </a>
                            );
                          }

                          const SubIcon = subItem.icon || LayoutDashboard;
                          return (
                            <Link
                              key={subItem.path}
                              to={subItem.path}
                              onClick={() => {
                                setSidebarOpen(false);
                                // Keep expanded when clicking sub-items
                                if (!expandedItems.has(item.path)) {
                                  setExpandedItems(
                                    (prev) => new Set([...prev, item.path]),
                                  );
                                }
                              }}
                              className={`
                                flex items-center rounded-md transition-all duration-200 touch-manipulation premium-sidebar-link
                                gap-2 px-2 py-1.5 text-[11px] font-medium relative min-h-[36px]
                                ${isSubActive
                                  ? "bg-[#4a5d3f] text-white font-semibold shadow-lg transform scale-[1.02] active"
                                  : "text-gray-200/80 hover:bg-white/10 hover:text-white hover:translate-x-1"
                                }
                              `}
                            >
                              <SubIcon
                                size={14}
                                className={`flex-shrink-0 ${isSubActive ? "text-white" : "text-gray-400"}`}
                              />
                              <span className="whitespace-nowrap">
                                {subItem.label}
                              </span>
                              {isSubActive && (
                                <div className="absolute right-2 w-1 h-1 bg-white rounded-full"></div>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Handle collapsed sidebar - show as simple link for items with sub-items
              if (hasSubItems && sidebarCollapsed) {
                // If on a sub-route, show parent as active
                const hasActiveSubItem = item.subItems?.some(
                  (subItem) => location.pathname === subItem.path,
                );
                const isActiveState = isActive || hasActiveSubItem;

                if (item.isExternal) {
                  return (
                    <a
                      key={item.path}
                      href={item.isTicketApp ? getTicketAppUrl(item.subItems ? (item.subItems[0]?.path || item.path) : item.path) : (item.subItems ? (item.subItems[0]?.path || item.path) : item.path)}
                      className={`
                          flex items-center justify-center rounded-md transition-colors premium-sidebar-link
                          px-2 py-3
                          text-gray-100/90 hover:bg-white/10 hover:text-white
                        `}
                      title={item.label}
                    >
                      <Icon size={20} className="flex-shrink-0" />
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.subItems[0]?.path || item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center justify-center rounded-md transition-colors premium-sidebar-link
                      px-2 py-3
                      ${isActiveState
                        ? "bg-[#4a5d3f] text-white font-semibold shadow-md active"
                        : "text-gray-100/90 hover:bg-white/10 hover:text-white"
                      }
                    `}
                    title={item.label}
                  >
                    <Icon size={20} className="flex-shrink-0" />
                  </Link>
                );
              }

              if (item.isExternal) {
                return (
                  <a
                    key={item.path}
                    href={item.isTicketApp ? getTicketAppUrl(item.path) : item.path}
                    className={`
                        flex items-center rounded-md transition-all duration-200 touch-manipulation premium-sidebar-link
                        ${sidebarCollapsed ? "justify-center px-1.5 py-2.5" : "gap-2 px-2.5 py-1.5"}
                        min-h-[36px]
                        text-gray-100/90 hover:bg-white/10 hover:text-white
                      `}
                    title={sidebarCollapsed ? item.label : ""}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span
                      className={`
                          transition-opacity duration-300 ease-out whitespace-nowrap overflow-hidden text-xs
                          ${sidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}
                        `}
                    >
                      {item.label}
                    </span>
                  </a>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center rounded-md transition-all duration-200 touch-manipulation premium-sidebar-link
                    ${sidebarCollapsed ? "justify-center px-1.5 py-2.5" : "gap-2 px-2.5 py-1.5"}
                    min-h-[36px]
                    ${isActive
                      ? "bg-[#4a5d3f] text-white font-semibold shadow-md active"
                      : "text-gray-100/90 hover:bg-white/10 hover:text-white"
                    }
                  `}
                  title={sidebarCollapsed ? item.label : ""}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span
                    className={`
                      transition-opacity duration-300 ease-out whitespace-nowrap overflow-hidden text-xs
                      ${sidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}
                    `}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Workspace Dropdown - only show when user has access to at least one workspace item (e.g. Ticket Management) */}
          {hasWorkspaceAccess && (
            <div className={`border-t border-white/10 transition-[padding] duration-300 ease-out ${sidebarCollapsed ? "p-2" : "p-3 sm:p-4"}`}>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    // Close all other expanded items when opening workspace
                    setExpandedItems(new Set());
                    setWorkspaceDropdownOpen(!workspaceDropdownOpen);
                    setSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center justify-between rounded-lg transition-all duration-200 touch-manipulation premium-sidebar-link
                    gap-3 px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px]
                    ${workspaceDropdownOpen
                      ? "bg-white/5 text-white font-medium"
                      : "text-gray-100/90 hover:bg-white/10 hover:text-white"
                    }
                  `}
                  aria-label={workspaceDropdownOpen ? "Collapse workspace menu" : "Expand workspace menu"}
                >
                  <div className={`flex items-center gap-2 flex-1 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                    <FolderTree size={18} className="flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="whitespace-nowrap font-medium text-xs">
                        Workspace
                      </span>
                    )}
                  </div>
                  {!sidebarCollapsed && (
                    workspaceDropdownOpen ? (
                      <ChevronUp
                        size={18}
                        className="flex-shrink-0 transition-transform duration-200"
                      />
                    ) : (
                      <ChevronDown
                        size={18}
                        className="flex-shrink-0 transition-transform duration-200"
                      />
                    )
                  )}
                </button>
                {workspaceDropdownOpen && !sidebarCollapsed && (
                  <div className="ml-2 space-y-0.5 pl-6 py-2 border-l-2 border-blue-300 bg-gradient-to-r from-blue-50/50 to-transparent rounded-r-md">
                    <a
                      href={getTicketAppUrl("/dashboard")}
                      className="flex items-center rounded-md transition-all duration-200 touch-manipulation premium-sidebar-link
                        gap-2 px-2 py-1.5 text-[11px] font-medium relative min-h-[36px]
                        text-gray-200/80 hover:bg-white/10 hover:text-white hover:translate-x-1"
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#4a5d3f]"></div>
                      <span className="whitespace-nowrap">
                        Maintenance Management
                      </span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Info & Logout */}
          <div
            className={`border-t border-white/10 transition-[padding] duration-300 ease-out ${sidebarCollapsed ? "p-2" : "p-3 sm:p-4"}`}
          >
            <div className={`flex ${sidebarCollapsed ? "flex-col items-center" : "items-center justify-between"} gap-2`}>
              <Link
                to="/profile"
                onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                className={`flex items-center gap-3 flex-1 min-w-0 group ${sidebarCollapsed ? "justify-center" : ""}`}
                title={sidebarCollapsed ? "Profile" : ""}
              >
                <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 group-hover:ring-2 group-hover:ring-white/20 transition-all">
                  <span className="text-white font-semibold text-sm">
                    {user?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium text-white truncate group-hover:text-blue-200 transition-colors">
                    {user?.name || user?.username || "User"}
                  </span>
                )}
              </Link>

              <button
                onClick={handleLogout}
                className={`
                  flex items-center justify-center rounded-md bg-white/5 text-gray-100 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 
                  ${sidebarCollapsed ? "w-10 h-10 mt-1" : "p-2"}
                `}
                title="Logout"
              >
                <LogOut size={sidebarCollapsed ? 20 : 18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main
        className="flex-1 h-screen overflow-hidden flex flex-col relative z-0 premium-stars-content"
      >
        <div className="flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-2 lg:p-3 flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

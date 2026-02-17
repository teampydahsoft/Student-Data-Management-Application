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
  DollarSign,
  Ticket,
  FolderTree,
  Megaphone,
  Briefcase,
  ArrowLeftRight,
  Wrench,
  GraduationCap,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import {
  MODULE_ROUTE_MAP,
  getModuleKeyForPath,
  hasModuleAccess,
  getAllowedFrontendModules,
  isFullAccessRole,
  FRONTEND_MODULES,
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
    label: "Student Management",
    permission: FRONTEND_MODULES.STUDENTS,
    subItems: [
      {
        path: "/students",
        label: "Students Database",
        permission: FRONTEND_MODULES.STUDENTS,
      },
      {
        path: "/students/self-registration",
        label: "Self Registration",
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
        permission: FRONTEND_MODULES.ATTENDANCE,
      },
      {
        path: "/attendance-monitoring",
        label: "Hourly Attendance",
        permission: FRONTEND_MODULES.ATTENDANCE,
      },
      {
        path: "/internship-management",
        label: "Internship Attendance",
        permission: FRONTEND_MODULES.ATTENDANCE,
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
    label: "Faculty Management",
    permission: FRONTEND_MODULES.FACULTY_MANAGEMENT,
    subItems: [
      {
        path: "/faculty-management",
        label: "Faculty List",
        permission: FRONTEND_MODULES.FACULTY_MANAGEMENT,
      },
      {
        path: "/feedback-forms",
        label: "Feed Back",
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
        permission: FRONTEND_MODULES.REPORTS,
      },
      {
        path: "/reports/attendance",
        label: "Attendance Reports",
        permission: FRONTEND_MODULES.REPORTS,
      },
      {
        path: "/reports/day-end",
        label: "Day End Report",
        permission: FRONTEND_MODULES.REPORTS,
      },
      {
        path: "/reports/category",
        label: "Category Report",
        permission: FRONTEND_MODULES.REPORTS,
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
        permission: FRONTEND_MODULES.SERVICES,
      },
      {
        path: "/services/config",
        label: "Configuration",
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
            <div className={`p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center transition-all duration-300 ${sidebarCollapsed ? 'w-10 h-10' : 'w-full px-4 py-3'}`}>
              <img
                src="/logo.png"
                alt="Pydah DB Logo"
                className={`
                  h-10 sm:h-12 w-auto max-w-full object-contain transition-opacity duration-300 ease-out
                  ${sidebarCollapsed ? "opacity-0 w-0 h-0 overflow-hidden" : "opacity-100"}
                `}
                loading="lazy"
              />
              {sidebarCollapsed && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white opacity-50 animate-pulse"></div>
                </div>
              )}
            </div>
            {/* Close button for mobile, collapse button for desktop */}
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              className="lg:hidden p-2.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors flex-shrink-0 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-900 transition-colors flex-shrink-0"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav
            className={`flex-1 space-y-1 transition-[padding] duration-300 ease-out overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30 premium-sidebar-nav ${sidebarCollapsed ? "p-2" : "p-3 sm:p-4"}`}
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
                        <ChevronDown
                          size={18}
                          className="flex-shrink-0 transition-transform duration-200"
                        />
                      ) : (
                        <ChevronRight
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
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#4a5d3f]"></div>
                                <span className="whitespace-nowrap">
                                  {subItem.label}
                                </span>
                              </a>
                            );
                          }

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
                              <div
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSubActive ? "bg-white" : "bg-gray-400"}`}
                              ></div>
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
                  <div className="flex items-center gap-2 flex-1">
                    <FolderTree size={18} className="flex-shrink-0" />
                    <span className="whitespace-nowrap font-medium text-xs">
                      Workspace
                    </span>
                  </div>
                  {workspaceDropdownOpen ? (
                    <ChevronDown
                      size={18}
                      className="flex-shrink-0 transition-transform duration-200"
                    />
                  ) : (
                    <ChevronRight
                      size={18}
                      className="flex-shrink-0 transition-transform duration-200"
                    />
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
            <div
              className={`
                flex items-center gap-3 mb-2 transition-opacity duration-300 ease-out overflow-hidden
                ${sidebarCollapsed ? "opacity-0 h-0 mb-0" : "opacity-100 h-auto mb-2"}
              `}
            >
              <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || user?.username || "User"}
                </p>
                <p className="text-xs text-gray-300 truncate">
                  {user?.email ||
                    (isFullAccessRole(user?.role)
                      ? "Administrator"
                      : "Team Member")}
                </p>
              </div>
            </div>

            {/* Profile Link */}
            <Link
              to="/profile"
              onClick={() => {
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center rounded-md bg-white/5 text-gray-100 hover:bg-white/10 transition-colors duration-200 touch-manipulation min-h-[44px] mb-2 ${sidebarCollapsed
                ? "justify-center p-3"
                : "gap-3 px-4 py-2.5 sm:py-3"
                }`}
              title={sidebarCollapsed ? "Profile" : ""}
            >
              <Users size={20} className="flex-shrink-0" />
              <span
                className={`
                  transition-opacity duration-300 ease-out whitespace-nowrap overflow-hidden
                  ${sidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}
                `}
              >
                Profile
              </span>
            </Link>

            <button
              onClick={handleLogout}
              className={`w-full flex items-center rounded-md bg-white/5 text-gray-100 hover:bg-red-500/20 hover:text-red-400 transition-colors duration-200 touch-manipulation min-h-[44px] ${sidebarCollapsed
                ? "justify-center p-3"
                : "gap-3 px-4 py-2.5 sm:py-3"
                }`}
              title={sidebarCollapsed ? "Logout" : ""}
            >
              <LogOut size={20} className="flex-shrink-0" />
              <span
                className={`
                  transition-opacity duration-300 ease-out whitespace-nowrap overflow-hidden
                  ${sidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}
                `}
              >
                Logout
              </span>
            </button>
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

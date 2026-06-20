import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  ClipboardList,
  Clock,
  ArrowRight,
  Eye,
  CheckCircle,
  XCircle,
  TrendingUp,
  FileText,
  AlertCircle,
  BarChart3,
  CalendarCheck,
  ShieldCheck,
  Settings,
  GraduationCap,
  UserCheck,
  Database,
  Building2,
  Megaphone
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from '../components/LoadingAnimation';
import { formatDate } from '../utils/dateUtils';
import { useStudentStats } from '../hooks/useStudents';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';

import DashboardSkeleton from '../components/skeletons/DashboardSkeleton';

const Dashboard = () => {
  const { user } = useAuthStore();
  const userPermissions = user?.permissions || {};
  const isAdmin = isFullAccessRole(user?.role);

  // Check individual module permissions
  const canViewStudents = isAdmin || hasPermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view');
  const canViewColleges = isAdmin || hasPermission(userPermissions, BACKEND_MODULES.SETTINGS, 'view');
  const canViewSubmissions = isAdmin || hasPermission(userPermissions, BACKEND_MODULES.PRE_REGISTRATION, 'approve') || hasPermission(userPermissions, BACKEND_MODULES.PRE_REGISTRATION, 'add_student');

  // Use React Query for stats (includes today's attendance counts)
  const { data: stats, isLoading: loadingStats } = useStudentStats({
    enabled: canViewStudents
  });

  // Fetch colleges count
  const { data: collegesData, isLoading: loadingColleges } = useQuery({
    queryKey: ['colleges', 'count'],
    queryFn: async () => {
      const response = await api.get('/colleges');
      const data = response.data?.data || [];
      return { count: Array.isArray(data) ? data.length : 0 };
    },
    enabled: canViewColleges || canViewStudents,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Use React Query for recent submissions
  const { data: recentSubmissionsData, isLoading: loadingSubmissions } = useQuery({
    queryKey: ['submissions', 'recent'],
    queryFn: async () => {
      const response = await api.get('/submissions');
      const submissions = response.data.data || [];
      return submissions
        .sort((a, b) => new Date(b.created_at || b.submitted_at) - new Date(a.created_at || a.submitted_at))
        .slice(0, 10);
    },
    enabled: canViewSubmissions,
    staleTime: 2 * 60 * 1000,
  });

  // College-wise dashboard stats
  const { data: collegeDashboardData, isLoading: loadingCollegeStats } = useQuery({
    queryKey: ['colleges', 'dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/colleges/dashboard-stats');
      return response.data?.data || [];
    },
    enabled: canViewColleges || isAdmin,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // All announcements for the panel
  const { data: announcementsData, isLoading: loadingAnnouncements } = useQuery({
    queryKey: ['announcements', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/announcements/admin');
      return response.data?.data || [];
    },
    enabled: isAdmin || hasPermission(userPermissions, BACKEND_MODULES.ANNOUNCEMENTS, 'view'),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const recentSubmissions = recentSubmissionsData || [];
  const presentToday = stats?.presentToday ?? 0;
  const absentToday = stats?.absentToday ?? 0;
  const totalCampuses = collegesData?.count ?? (Array.isArray(collegesData) ? collegesData.length : 0);

  // Block page skeleton only until the primary stats arrive
  const loading = loadingStats;

  const statCards = [
    {
      title: 'Total Students',
      value: stats?.totalStudents || 0,
      isLoading: loadingStats,
      icon: Users,
      bgGradient: 'from-blue-600 to-blue-700',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      subtitle: 'Regular students',
      change: null,
    },
    {
      title: 'Present Today',
      value: presentToday,
      isLoading: loadingStats,
      icon: CheckCircle,
      bgGradient: 'from-green-500 to-green-600',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
      subtitle: 'Students marked present',
      change: null,
    },
    {
      title: 'Absent Today',
      value: absentToday,
      isLoading: loadingStats,
      icon: XCircle,
      bgGradient: 'from-red-500 to-red-600',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
      subtitle: 'Students marked absent',
      change: null,
    },
    {
      title: 'Total Campuses',
      value: totalCampuses,
      isLoading: loadingColleges,
      icon: Building2,
      bgGradient: 'from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      subtitle: 'Active campuses',
      change: null,
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 bg-gray-50">
      {/* Header */}
      <div className="mb-4 sm:mb-6 lg:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg flex-shrink-0">
            <Database className="text-white" size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 heading-font">Student Database Portal</h1>
            <p className="hidden sm:block text-sm sm:text-base text-gray-600 body-font mt-1">Complete control over admissions, student management, attendance, users, and reports</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="group flex items-center gap-4 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 px-5 py-4"
            >
              <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.bgGradient} shadow-sm flex-shrink-0`}>
                <Icon className="text-white" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-400 truncate mb-0.5">{stat.title}</p>
                {stat.isLoading ? (
                  <div className="h-8 w-20 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{stat.value.toLocaleString()}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* College Attendance + Announcements — two-column layout */}
      {(canViewColleges || isAdmin) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

          {/* LEFT — College-wise attendance stats (takes 2/3 width on lg) */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <CalendarCheck size={20} className="text-purple-600" />
                College-Wise Attendance
              </h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-medium">Today</span>
            </div>

            {loadingCollegeStats ? (
              <div className="space-y-2 flex-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 p-3 rounded-xl border border-gray-100">
                    <div className="h-4 bg-gray-200 rounded w-4/5" />
                    <div className="h-8 w-24 bg-gray-100 rounded-lg" />
                    <div className="h-8 w-24 bg-gray-100 rounded-lg" />
                    <div className="h-8 w-24 bg-gray-100 rounded-lg" />
                    <div className="h-5 w-12 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : collegeDashboardData && collegeDashboardData.length > 0 ? (
              <>
                {/* Header row — labels aligned to each column */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_108px_108px_108px_80px] items-center gap-3 px-3 pb-1 border-b border-gray-100 mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">College</span>
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide text-center">Total</span>
                  <span className="text-xs font-semibold text-green-400 uppercase tracking-wide text-center">Present</span>
                  <span className="text-xs font-semibold text-red-400 uppercase tracking-wide text-center">Absent</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Rate</span>
                </div>

                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[400px] pr-1">
                  {collegeDashboardData.map((college) => {
                    const attendanceRate = college.totalStudents > 0
                      ? Math.round((college.presentToday / college.totalStudents) * 100)
                      : null;
                    const barColor =
                      attendanceRate === null ? 'bg-gray-200' :
                      attendanceRate >= 75 ? 'bg-green-500' :
                      attendanceRate >= 50 ? 'bg-yellow-400' : 'bg-red-400';
                    const badgeBg =
                      attendanceRate === null ? 'bg-gray-100 text-gray-400' :
                      attendanceRate >= 75 ? 'bg-green-100 text-green-700' :
                      attendanceRate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

                    return (
                      <div
                        key={college.id}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_108px_108px_108px_80px] items-center gap-2 sm:gap-3 p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/20 transition-all duration-150"
                      >
                        {/* Col 1 — College name + code, full width, no truncation */}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm leading-tight">
                            {college.name}
                          </p>
                          {college.code && (
                            <span className="text-xs text-purple-500 font-medium">{college.code}</span>
                          )}
                        </div>

                        {/* Col 2 — Total */}
                        <div className="flex items-center justify-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <Users size={11} className="text-blue-400 flex-shrink-0" />
                          <span className="text-sm font-bold text-blue-700 tabular-nums">{college.totalStudents.toLocaleString()}</span>
                          <span className="text-xs text-blue-400 sm:hidden">total</span>
                        </div>

                        {/* Col 3 — Present */}
                        <div className="flex items-center justify-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                          <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                          <span className="text-sm font-bold text-green-700 tabular-nums">{college.presentToday.toLocaleString()}</span>
                          <span className="text-xs text-green-400 sm:hidden">present</span>
                        </div>

                        {/* Col 4 — Absent */}
                        <div className="flex items-center justify-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <XCircle size={11} className="text-red-400 flex-shrink-0" />
                          <span className="text-sm font-bold text-red-700 tabular-nums">{college.absentToday.toLocaleString()}</span>
                          <span className="text-xs text-red-400 sm:hidden">absent</span>
                        </div>

                        {/* Col 5 — Rate badge + bar */}
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                            {attendanceRate !== null ? `${attendanceRate}%` : 'N/A'}
                          </span>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${attendanceRate !== null ? Math.min(attendanceRate, 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400">
                <Building2 size={36} className="mb-3 opacity-40" />
                <p className="text-sm">No college data available</p>
              </div>
            )}
          </div>

          {/* RIGHT — Overall Announcements panel (takes 1/3 width on lg) */}
          <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <Megaphone size={20} className="text-amber-500" />
                Announcements
              </h2>
              {!loadingAnnouncements && announcementsData && (
                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                  {announcementsData.length}
                </span>
              )}
            </div>

            {loadingAnnouncements ? (
              <div className="space-y-3 flex-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse space-y-1.5 p-3 rounded-xl border border-gray-100">
                    <div className="h-3.5 bg-gray-200 rounded w-4/5" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3 mt-2" />
                  </div>
                ))}
              </div>
            ) : announcementsData && announcementsData.length > 0 ? (
              <>
                {/* Total count summary bar */}
                <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
                  <div>
                    <p className="text-xs text-amber-600 font-medium">Total Announcements</p>
                    <p className="text-2xl font-bold text-amber-700">{announcementsData.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-amber-600 font-medium">Active</p>
                    <p className="text-2xl font-bold text-green-600">
                      {announcementsData.filter(a => a.is_active).length}
                    </p>
                  </div>
                </div>

                {/* Scrollable list */}
                <div className="space-y-2 overflow-y-auto max-h-[320px] flex-1 pr-0.5">
                  {announcementsData.slice(0, 20).map((ann) => (
                    <div
                      key={ann.id}
                      className={`p-3 rounded-xl border transition-colors ${
                        ann.is_active
                          ? 'bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/40'
                          : 'bg-gray-50 border-gray-100 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-800 leading-snug flex-1 line-clamp-1">
                          {ann.title}
                        </p>
                        {ann.is_active ? (
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-1" title="Active" />
                        ) : (
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-300 mt-1" title="Inactive" />
                        )}
                      </div>
                      {ann.content && (
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{ann.content}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <p className="text-xs text-gray-400">
                          {new Date(ann.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {ann.audience_count > 0 && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <Users size={10} />
                            {ann.audience_count.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {announcementsData.length > 20 && (
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Showing 20 of {announcementsData.length} announcements
                  </p>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400">
                <Megaphone size={36} className="mb-3 opacity-40" />
                <p className="text-sm">No announcements yet</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Self Registration */}
          <Link
            to="/students/self-registration"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-blue-200 hover:border-blue-500 active:border-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors flex-shrink-0">
              <ClipboardList className="text-blue-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">Self Registration</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {stats?.pendingSubmissions || 0} pending reviews
              </p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-blue-600 flex-shrink-0" size={18} />
          </Link>

          {/* Students Database */}
          <Link
            to="/students"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-green-200 hover:border-green-500 active:border-green-600 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-green-100 group-hover:bg-green-200 transition-colors flex-shrink-0">
              <Database className="text-green-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">Students Database</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {stats?.totalStudents || 0} total students
              </p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-green-600 flex-shrink-0" size={18} />
          </Link>

          {/* Promotions */}
          <Link
            to="/promotions"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-green-200 hover:border-green-500 active:border-green-600 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-green-100 group-hover:bg-green-200 transition-colors flex-shrink-0">
              <TrendingUp className="text-green-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">Promotions</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Manage student promotions</p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-green-600 flex-shrink-0" size={18} />
          </Link>

          {/* Attendance */}
          <Link
            to="/attendance"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-purple-200 hover:border-purple-500 active:border-purple-600 hover:bg-purple-50 active:bg-purple-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-purple-100 group-hover:bg-purple-200 transition-colors flex-shrink-0">
              <CalendarCheck className="text-purple-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">Mark Attendance</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Track student attendance</p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-purple-600 flex-shrink-0" size={18} />
          </Link>

          {/* User Management */}
          <Link
            to="/users"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-indigo-200 hover:border-indigo-500 active:border-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 transition-colors flex-shrink-0">
              <UserCheck className="text-indigo-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">User Management</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Manage users and roles</p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-indigo-600 flex-shrink-0" size={18} />
          </Link>

          {/* Settings */}
          <Link
            to="/courses"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-indigo-200 hover:border-indigo-500 active:border-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 transition-colors flex-shrink-0">
              <Settings className="text-indigo-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">Settings</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Configure system settings</p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-indigo-600 flex-shrink-0" size={18} />
          </Link>

          {/* Reports */}
          <Link
            to="/reports"
            className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-lg border-2 border-amber-200 hover:border-amber-500 active:border-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-all duration-200 group shadow-sm touch-manipulation min-h-[80px] sm:min-h-[100px]"
          >
            <div className="p-2 sm:p-3 rounded-lg bg-amber-100 group-hover:bg-amber-200 transition-colors flex-shrink-0">
              <BarChart3 className="text-amber-700" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-base sm:text-lg">View Reports</p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Generate insights and analytics</p>
            </div>
            <ArrowRight className="text-gray-400 group-hover:text-amber-600 flex-shrink-0" size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
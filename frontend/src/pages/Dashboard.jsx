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
  Building2
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
    <div className="space-y-4 sm:space-y-6 bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="group relative overflow-hidden rounded-lg sm:rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="relative p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${stat.bgGradient} shadow-lg flex-shrink-0`}>
                    <Icon className="text-white" size={20} />
                  </div>
                  {stat.change !== null && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${stat.change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      <TrendingUp size={12} className={stat.change < 0 ? 'rotate-180' : ''} />
                      {Math.abs(stat.change)}%
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">{stat.title}</p>
                  {stat.isLoading ? (
                    <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mb-2" />
                  ) : (
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">{stat.value.toLocaleString()}</p>
                  )}
                  {stat.subtitle && (
                    <p className="text-xs font-medium text-gray-400">{stat.subtitle}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
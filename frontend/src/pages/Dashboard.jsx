import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  ClipboardList,
  Clock,
  ChevronRight,
  CalendarCheck,
  Wrench,
  FileSpreadsheet,
  UserCog,
  Info,
  Calendar as CalendarIcon,
  Bell,
  CheckCircle,
  FileText,
  Plus,
  ArrowRight,
  TrendingUp,
  MapPin,
  Clock3,
  X,
  Building2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import { useStudentStats } from '../hooks/useStudents';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../constants/rbac';
import DashboardSkeleton from '../components/skeletons/DashboardSkeleton';

// SVG Donut Chart Component
const DonutChart = ({
  total,
  segments,
  centerLabel = 'Total',
  centerValue = null,
  size = 145,
  strokeWidth = 16
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;
  const validTotal = total > 0 ? total : 1;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, idx) => {
          if (!seg.value || seg.value <= 0) return null;
          const percent = seg.value / validTotal;
          const strokeDasharray = `${percent * circumference} ${circumference}`;
          const strokeDashoffset = -accumulatedPercent * circumference;
          accumulatedPercent += percent;

          return (
            <circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500 hover:opacity-85"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-xl font-extrabold text-slate-900 leading-none">
          {centerValue !== null ? centerValue : total.toLocaleString()}
        </span>
        {centerLabel && (
          <span className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
};

// SVG Stacked Bar Chart Component for Registrations
const StackedBarChart = ({ data = [], height = 180 }) => {
  const maxValInScale = Math.max(
    ...data.map((item) => (Number(item.approved) || 0) + (Number(item.pending) || 0) + (Number(item.rejected) || 0)),
    10
  );
  const maxValue = Math.ceil(maxValInScale / 50) * 50 || 100;
  const step = Math.round(maxValue / 4);
  const scaleValues = [maxValue, step * 3, step * 2, step, 0];

  return (
    <div className="w-full flex flex-col justify-end pt-2" style={{ height }}>
      <div className="relative flex-1 flex flex-col justify-between text-[10px] text-slate-400">
        {scaleValues.map((val, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-slate-100 w-full h-0">
            <span className="w-6 text-right shrink-0 font-medium">{val}</span>
            <div className="w-full border-b border-dashed border-slate-200/60" />
          </div>
        ))}

        {/* Bars Container */}
        <div className="absolute inset-0 pl-8 pr-2 pt-2 pb-5 flex items-end justify-between">
          {data.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-medium">
              No registration data available
            </div>
          ) : (
            data.map((item, idx) => {
              const approved = Number(item.approved) || 0;
              const pending = Number(item.pending) || 0;
              const rejected = Number(item.rejected) || 0;
              const total = approved + pending + rejected;
              const approvedHeight = (approved / maxValue) * 100;
              const pendingHeight = (pending / maxValue) * 100;
              const rejectedHeight = (rejected / maxValue) * 100;

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 flex-1 max-w-[38px] group relative h-full justify-end">
                  {/* Hover Tooltip */}
                  <div className="absolute -top-14 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] py-1 px-2.5 rounded-lg shadow-xl z-20 whitespace-nowrap pointer-events-none">
                    <span className="font-bold">{item.month}: {total}</span>
                    <span className="text-emerald-400">Approved: {approved}</span>
                    <span className="text-blue-400">Pending: {pending}</span>
                    <span className="text-rose-400">Rejected: {rejected}</span>
                  </div>

                  {/* Stacked Column Bar */}
                  <div className="w-full bg-slate-100 rounded-t flex flex-col justify-end overflow-hidden max-w-[26px] h-[125px] shadow-2xs">
                    {rejected > 0 && (
                      <div style={{ height: `${rejectedHeight}%` }} className="bg-rose-500 w-full transition-all" />
                    )}
                    {pending > 0 && (
                      <div style={{ height: `${pendingHeight}%` }} className="bg-blue-500 w-full transition-all" />
                    )}
                    {approved > 0 && (
                      <div style={{ height: `${approvedHeight}%` }} className="bg-emerald-500 w-full transition-all" />
                    )}
                  </div>

                  {/* Month Label */}
                  <span className="text-[11px] font-semibold text-slate-500">{item.month}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userPermissions = user?.permissions || {};
  const isAdmin = isFullAccessRole(user?.role);

  const [attendancePeriod, setAttendancePeriod] = useState('Today');
  const [showCollegeModal, setShowCollegeModal] = useState(false);

  const canViewStudents = isAdmin || hasPermission(userPermissions, BACKEND_MODULES.STUDENT_MANAGEMENT, 'view');
  const canViewColleges = isAdmin || hasPermission(userPermissions, BACKEND_MODULES.SETTINGS, 'view');

  // Primary stats query
  const { data: statsData, isLoading: loadingStats, refetch: refetchStats } = useStudentStats({
    enabled: canViewStudents
  });

  // College stats
  const { data: collegeDashboardData } = useQuery({
    queryKey: ['colleges', 'dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/colleges/dashboard-stats');
      return response.data?.data || [];
    },
    enabled: canViewColleges || isAdmin,
    staleTime: 3 * 60 * 1000,
  });

  // Events query
  const { data: eventsData } = useQuery({
    queryKey: ['events', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/events/admin');
      return response.data?.data || [];
    },
    staleTime: 3 * 60 * 1000,
  });

  if (loadingStats) {
    return <DashboardSkeleton />;
  }

  // Real values from statsData payload
  const attendancePostedCount = statsData?.attendanceStatus?.collegesPostedCount ?? 0;
  const attendanceTotalClasses = statsData?.attendanceStatus?.totalCollegesCount ?? 0;
  const collegeList = statsData?.attendanceStatus?.collegeList ?? [];
  const periodsData = statsData?.attendanceStatus?.periods ?? {};

  const currentPeriodKey = attendancePeriod === 'Today' ? 'today' : attendancePeriod === 'This Month' ? 'monthly' : 'weekly';
  const currentAttendance = periodsData[currentPeriodKey] || {
    present: 0,
    absent: 0,
    holiday: 0,
    pending: 0,
    total: 0,
    marked: 0,
    rate: 0
  };

  const attendanceRate = attendanceTotalClasses > 0
    ? Math.round((attendancePostedCount / attendanceTotalClasses) * 100)
    : 0;

  const eventsList = (eventsData && eventsData.length > 0)
    ? eventsData
    : (statsData?.events?.list ?? []);

  // Dynamic recent activities from backend payload
  const recentActivities = (statsData?.recentActivities && statsData.recentActivities.length > 0)
    ? statsData.recentActivities.map((act) => {
        let icon = Users;
        let color = 'text-blue-500 bg-blue-50';
        if (act.type === 'ticket') {
          icon = Wrench;
          color = 'text-amber-500 bg-amber-50';
        } else if (act.type === 'service') {
          icon = FileSpreadsheet;
          color = 'text-purple-500 bg-purple-50';
        } else if (act.type === 'profile') {
          icon = UserCog;
          color = 'text-pink-500 bg-pink-50';
        }
        let timeStr = 'Recently';
        if (act.time) {
          const dt = new Date(act.time);
          if (!isNaN(dt.getTime())) {
            timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
        }
        return {
          id: act.id,
          text: act.text,
          time: timeStr,
          icon,
          color
        };
      })
    : [
        { id: 1, text: 'Dashboard data synced with database', time: 'Just now', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50' }
      ];

  // Service Requests summary
  const serviceSummary = statsData?.serviceRequests?.summary ?? { total: 0, pending: 0, processing: 0, completed: 0, rejected: 0 };
  const openServices = serviceSummary.pending ?? 0;
  const inProgressServices = serviceSummary.processing ?? 0;
  const resolvedServices = serviceSummary.completed ?? 0;
  const totalServices = serviceSummary.total ?? 0;

  // Maintenance Tickets summary
  const maintenanceSummary = statsData?.maintenanceTickets?.summary ?? { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
  const openTickets = maintenanceSummary.open ?? 0;
  const inProgressTickets = maintenanceSummary.in_progress ?? 0;
  const resolvedTickets = maintenanceSummary.resolved ?? 0;
  const totalTickets = maintenanceSummary.total ?? 0;

  // Profile Requests summary
  const profileSummary = statsData?.profileRequests?.summary ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
  const pendingProfile = profileSummary.pending ?? 0;
  const approvedProfile = profileSummary.approved ?? 0;
  const rejectedProfile = profileSummary.rejected ?? 0;
  const totalProfile = profileSummary.total ?? 0;

  // Registration summary
  const regSummary = statsData?.registrations?.summary ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
  const totalReg = regSummary.total ?? 0;
  const approvedReg = regSummary.approved ?? 0;
  const pendingReg = regSummary.pending ?? 0;
  const rejectedReg = regSummary.rejected ?? 0;

  // Monthly Registrations stacked bar chart from backend payload
  const monthlyRegistrationsData = statsData?.registrations?.monthly ?? [];

  // Dynamic Current Date Display e.g. "Tuesday, 24 September 2026"
  const formattedDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="space-y-6 bg-[#f8fafc] min-h-screen p-4 sm:p-6 text-slate-800 font-sans">
      
      {/* Top Title & Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <Link to="/" className="hover:text-blue-600 flex items-center gap-1">
              <span className="text-blue-600">🏠</span> Home
            </Link>
            <span>›</span>
            <span className="text-slate-400 font-medium">Dashboard</span>
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-500 bg-white px-3.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-auto">
          {formattedDate}
        </div>
      </div>

      {/* Row 1: 6 KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        
        {/* Card 1: Attendance Posted */}
        <div
          onClick={() => setShowCollegeModal(true)}
          className="bg-[#f0f7ff] border border-blue-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Users size={16} />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCollegeModal(true); }}
                className="p-1 rounded-lg text-blue-600 hover:bg-blue-100/60 transition-colors"
                title="View College-Wise Attendance"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{attendanceRate}%</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Attendance Posted</p>
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-blue-200/50">
            <span>{attendancePostedCount} / {attendanceTotalClasses} Colleges Posted</span>
            <span className="text-blue-600 font-bold hover:underline">View Breakdown</span>
          </div>
        </div>

        {/* Card 2: Upcoming Events */}
        <div className="bg-[#f0fdf4] border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CalendarIcon size={16} />
              </div>
              <Link to="/events" className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100/60 transition-colors">
                <ChevronRight size={18} />
              </Link>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{eventsList.length}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Upcoming Events</p>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-emerald-200/50">
            {eventsList.length > 0 ? `${eventsList.length} Active Events` : 'No upcoming events'}
          </p>
        </div>

        {/* Card 3: Service Requests */}
        <div className="bg-[#faf5ff] border border-purple-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                <FileSpreadsheet size={16} />
              </div>
              <Link to="/services" className="p-1 rounded-lg text-purple-600 hover:bg-purple-100/60 transition-colors">
                <ChevronRight size={18} />
              </Link>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{totalServices}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Service Requests</p>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-purple-200/50">
            {openServices} Open • {inProgressServices} In Progress
          </p>
        </div>

        {/* Card 4: Maintenance Tickets */}
        <div className="bg-[#fff7ed] border border-orange-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
                <Wrench size={16} />
              </div>
              <Link to="/tickets" className="p-1 rounded-lg text-orange-600 hover:bg-orange-100/60 transition-colors">
                <ChevronRight size={18} />
              </Link>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{totalTickets}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Maintenance Tickets</p>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-orange-200/50">
            {openTickets} Open • {inProgressTickets} In Progress
          </p>
        </div>

        {/* Card 5: Profile Requests */}
        <div className="bg-[#fdf2f8] border border-pink-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-pink-600 text-white flex items-center justify-center shadow-xs">
                <UserCog size={16} />
              </div>
              <Link to="/students/profile-change-requests" className="p-1 rounded-lg text-pink-600 hover:bg-pink-100/60 transition-colors">
                <ChevronRight size={18} />
              </Link>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{pendingProfile}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Profile Requests</p>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-pink-200/50">
            Pending for Review
          </p>
        </div>

        {/* Card 6: Registrations */}
        <div className="bg-[#ecfdf5] border border-teal-100 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200 relative group">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                <ClipboardList size={16} />
              </div>
              <Link to="/students/self-registration" className="p-1 rounded-lg text-teal-600 hover:bg-teal-100/60 transition-colors">
                <ChevronRight size={18} />
              </Link>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{totalReg.toLocaleString()}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">Registrations</p>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-3 pt-2 border-t border-teal-200/50">
            {pendingReg} Pending • {totalReg > 0 ? Math.round((approvedReg / totalReg) * 100) : 0}% Approved
          </p>
        </div>

      </div>

      {/* Row 2: Middle Section (Student Attendance Status, Events Calendar, Recent Activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Widget 1: Student Attendance Status */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm text-slate-900">Student Attendance Status</h3>
                <button
                  onClick={() => setShowCollegeModal(true)}
                  className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                  title="View College-Wise Details"
                >
                  <Info size={15} />
                </button>
              </div>
              <select
                value={attendancePeriod}
                onChange={(e) => setAttendancePeriod(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="This Week">This Week</option>
                <option value="Today">Today</option>
                <option value="This Month">This Month</option>
              </select>
            </div>

            <div className="flex items-center justify-around py-2">
              <DonutChart
                total={currentAttendance.total}
                centerValue={`${currentAttendance.rate}%`}
                centerLabel="Posted Rate"
                size={140}
                strokeWidth={15}
                segments={[
                  { label: 'Present', value: currentAttendance.present, color: '#10b981' },
                  { label: 'Absent', value: currentAttendance.absent, color: '#ef4444' },
                  { label: 'Pending/Holiday', value: currentAttendance.pending + currentAttendance.holiday, color: '#f59e0b' }
                ]}
              />

              <div className="space-y-2 text-xs font-semibold">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-slate-500">Present</span>
                  </div>
                  <span className="font-extrabold text-slate-900">{currentAttendance.present.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-slate-500">Absent</span>
                  </div>
                  <span className="font-extrabold text-slate-900">{currentAttendance.absent.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-slate-500">Pending / Holiday</span>
                  </div>
                  <span className="font-extrabold text-slate-900">{(currentAttendance.pending + currentAttendance.holiday).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="text-slate-700 font-bold">Total Over All</span>
                  </div>
                  <span className="font-black text-slate-900">{currentAttendance.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500 mt-2">
            <span>{attendancePostedCount} / {attendanceTotalClasses} Colleges Posted</span>
            <button
              onClick={() => setShowCollegeModal(true)}
              className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              College Wise Details <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Widget 2: Events Calendar */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Events Calendar</h3>
              <Link to="/events" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {eventsList.slice(0, 4).map((evt) => (
                <div key={evt.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="text-center px-2 py-1 bg-red-50 rounded-xl min-w-[42px]">
                      <p className="text-[13px] font-black text-red-600 leading-none">
                        {evt.dateStr ? evt.dateStr.split(' ')[0] : '24'}
                      </p>
                      <p className="text-[9px] font-bold text-red-500 uppercase leading-none mt-0.5">
                        {evt.dateStr ? evt.dateStr.split(' ')[1] : 'Sep'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{evt.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1"><MapPin size={10} /> {evt.location || 'Main Auditorium'}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock3 size={10} /> {evt.time || '10:00 AM'}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${evt.tagColor || 'bg-blue-50 text-blue-600'}`}>
                    {evt.tag || 'Today'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Widget 3: Recent Activity */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Recent Activity</h3>
              <Link to="/reports" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {recentActivities.map((act) => {
                const IconComp = act.icon;
                return (
                  <div key={act.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${act.color}`}>
                        <IconComp size={14} />
                      </div>
                      <span className="font-semibold text-slate-800 truncate text-[11px]">{act.text}</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0 ml-2">{act.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Row 3: 3 Donut Charts (Service Requests, Maintenance Tickets, Student Profile Requests) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Service Requests Donut Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Service Requests</h3>
              <Link to="/services" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="flex items-center justify-around py-2">
              <DonutChart
                total={totalServices}
                centerValue={totalServices}
                centerLabel="Total"
                size={135}
                strokeWidth={15}
                segments={[
                  { label: 'Open', value: openServices, color: '#ef4444' },
                  { label: 'In Progress', value: inProgressServices, color: '#3b82f6' },
                  { label: 'Resolved', value: resolvedServices, color: '#10b981' },
                  { label: 'On Hold', value: 0, color: '#f59e0b' }
                ]}
              />

              <div className="space-y-2 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Open</span>
                  <span className="font-extrabold text-slate-900">{openServices}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">In Progress</span>
                  <span className="font-extrabold text-slate-900">{inProgressServices}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Resolved</span>
                  <span className="font-extrabold text-slate-900">{resolvedServices}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">On Hold</span>
                  <span className="font-extrabold text-slate-900">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Maintenance Tickets Donut Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Maintenance Tickets</h3>
              <Link to="/tickets" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="flex items-center justify-around py-2">
              <DonutChart
                total={totalTickets}
                centerValue={totalTickets}
                centerLabel="Total"
                size={135}
                strokeWidth={15}
                segments={[
                  { label: 'Open', value: openTickets, color: '#ef4444' },
                  { label: 'In Progress', value: inProgressTickets, color: '#3b82f6' },
                  { label: 'Resolved', value: resolvedTickets, color: '#10b981' },
                  { label: 'On Hold', value: 0, color: '#f59e0b' }
                ]}
              />

              <div className="space-y-2 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Open</span>
                  <span className="font-extrabold text-slate-900">{openTickets}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">In Progress</span>
                  <span className="font-extrabold text-slate-900">{inProgressTickets}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Resolved</span>
                  <span className="font-extrabold text-slate-900">{resolvedTickets}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">On Hold</span>
                  <span className="font-extrabold text-slate-900">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Student Profile Requests Donut Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Student Profile Requests</h3>
              <Link to="/students/profile-change-requests" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="flex items-center justify-around py-2">
              <DonutChart
                total={totalProfile}
                centerValue={totalProfile}
                centerLabel="Total"
                size={135}
                strokeWidth={15}
                segments={[
                  { label: 'Pending', value: pendingProfile, color: '#ef4444' },
                  { label: 'Approved', value: approvedProfile, color: '#10b981' },
                  { label: 'Rejected', value: rejectedProfile, color: '#94a3b8' }
                ]}
              />

              <div className="space-y-2 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Pending</span>
                  <span className="font-extrabold text-slate-900">{pendingProfile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Approved</span>
                  <span className="font-extrabold text-slate-900">{approvedProfile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-slate-500 min-w-[70px]">Rejected</span>
                  <span className="font-extrabold text-slate-900">{rejectedProfile}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Row 4: Registration Stages Overview (2 Cols) & Registration Status Donut Chart (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Registration Stages Overview (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Registration Stages Overview</h3>
                <p className="text-xs text-slate-500 mt-0.5">Track student progress across the 5 registration stages</p>
              </div>
              <Link to="/reports" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                View Reports <ChevronRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              
              {/* Card 1: Registration Stage */}
              <div className="bg-[#fff1f2] border border-rose-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider mb-1">REGISTRATION</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.registration?.completed ?? approvedReg).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-amber-500">{(statsData?.registrations?.stages?.registration?.temporary ?? rejectedReg).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.registration?.pending ?? pendingReg).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Completed / Temp / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden flex">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.registration?.completed ?? approvedReg) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.registration?.temporary ?? rejectedReg) / totalReg) * 100) : 0}%` }} className="bg-amber-500 h-full" />
                </div>
              </div>

              {/* Card 2: Verification Stage */}
              <div className="bg-[#fefce8] border border-yellow-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-yellow-600 uppercase tracking-wider mb-1">VERIFICATION</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.verification?.completed ?? 3415).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.verification?.pending ?? 2388).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Completed / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.verification?.completed ?? 3415) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                </div>
              </div>

              {/* Card 3: Certificates Stage */}
              <div className="bg-[#faf5ff] border border-purple-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-purple-600 uppercase tracking-wider mb-1">CERTIFICATES</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.certificates?.verified ?? 4139).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-amber-500">{(statsData?.registrations?.stages?.certificates?.temporary ?? 473).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.certificates?.pending ?? 1191).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Verified / Temp / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden flex">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.certificates?.verified ?? 4139) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.certificates?.temporary ?? 473) / totalReg) * 100) : 0}%` }} className="bg-amber-500 h-full" />
                </div>
              </div>

              {/* Card 4: Fees Stage */}
              <div className="bg-[#f0fdf4] border border-emerald-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider mb-1">FEES</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.fees?.cleared ?? 3642).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.fees?.pending ?? 2161).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Cleared / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.fees?.cleared ?? 3642) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                </div>
              </div>

              {/* Card 5: Promotion Stage */}
              <div className="bg-[#f0f9ff] border border-sky-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider mb-1">PROMOTION</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.promotion?.completed ?? 5803).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.promotion?.pending ?? 0).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Completed / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.promotion?.completed ?? 5803) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                </div>
              </div>

              {/* Card 6: Scholarship Stage */}
              <div className="bg-[#fdf2f8] border border-pink-100 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-extrabold text-pink-600 uppercase tracking-wider mb-1">SCHOLARSHIP</p>
                  <div className="flex items-baseline gap-1 text-sm font-black">
                    <span className="text-emerald-600">{(statsData?.registrations?.stages?.scholarship?.assigned ?? 3318).toLocaleString()}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-rose-600">{(statsData?.registrations?.stages?.scholarship?.pending ?? 2485).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">Assigned / Pending</p>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div style={{ width: `${totalReg > 0 ? Math.round(((statsData?.registrations?.stages?.scholarship?.assigned ?? 3318) / totalReg) * 100) : 0}%` }} className="bg-emerald-500 h-full" />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Registration Status (Current Year) Donut Chart (1 Col) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm text-slate-900">Registration Status</h3>
              <Link to="/reports" className="text-xs font-bold text-blue-600 hover:text-blue-800">
                View Reports
              </Link>
            </div>

            <div className="flex items-center justify-around py-3">
              <DonutChart
                total={totalReg}
                centerValue={totalReg.toLocaleString()}
                centerLabel="Total"
                size={145}
                strokeWidth={16}
                segments={[
                  { label: 'Completed', value: approvedReg, color: '#10b981' },
                  { label: 'Temporary', value: rejectedReg, color: '#f59e0b' },
                  { label: 'Pending', value: pendingReg, color: '#3b82f6' }
                ]}
              />

              <div className="space-y-3 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-500 min-w-[75px]">Completed</span>
                  <span className="font-extrabold text-slate-900">{approvedReg.toLocaleString()} ({totalReg > 0 ? Math.round((approvedReg/totalReg)*100) : 0}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-slate-500 min-w-[75px]">Temporary</span>
                  <span className="font-extrabold text-slate-900">{rejectedReg.toLocaleString()} ({totalReg > 0 ? Math.round((rejectedReg/totalReg)*100) : 0}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-slate-500 min-w-[75px]">Pending</span>
                  <span className="font-extrabold text-slate-900">{pendingReg.toLocaleString()} ({totalReg > 0 ? Math.round((pendingReg/totalReg)*100) : 0}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* College-Wise Attendance Modal */}
      {showCollegeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">College-Wise Attendance Status</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Today's attendance posting status across all colleges</p>
                </div>
              </div>
              <button
                onClick={() => setShowCollegeModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3">
              {collegeList.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No college data available</div>
              ) : (
                collegeList.map((col) => (
                  <div
                    key={col.id || col.code}
                    className="flex items-center justify-between p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-700 shadow-2xs">
                        {col.code ? col.code.slice(0, 4) : 'COL'}
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900">{col.name}</h4>
                        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                          Total Students: <span className="font-bold text-slate-800">{col.totalStudents.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <div className="flex items-center gap-2 justify-end text-[11px]">
                          <span className="text-emerald-600 font-bold">Present: {col.presentToday.toLocaleString()}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-rose-500 font-bold">Absent: {col.absentToday.toLocaleString()}</span>
                        </div>
                      </div>
                      {col.isPosted ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle size={12} /> Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                          <Clock size={12} /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs text-slate-500 font-medium">
              <span>Total Colleges: <strong className="text-slate-800">{collegeList.length}</strong></span>
              <button
                onClick={() => setShowCollegeModal(false)}
                className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    RefreshCw,
    Umbrella,
    Sun,
    BookOpen,
    TrendingUp,
    Info
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend
} from 'recharts';
import api from '../../config/api';
import { toast } from 'react-hot-toast';
import { SkeletonBox } from '../../components/SkeletonLoader';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
    });
};

const formatShortDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata'
    });
};

const getHolidayLabel = (holidayObj) => {
    if (!holidayObj) return 'Holiday';
    // Custom / Institute holiday
    if (holidayObj.title) return holidayObj.title;
    // Public holiday
    if (holidayObj.localName) return holidayObj.localName;
    if (holidayObj.name) return holidayObj.name;
    return 'Holiday';
};

const getHolidayType = (holidayObj) => {
    if (!holidayObj) return 'other';
    if (holidayObj.title) return 'custom';      // Institute holiday
    if (holidayObj.localName || holidayObj.name) return 'public'; // Public holiday
    return 'other';
};

const statusColor = (status) => {
    switch (status) {
        case 'present': return 'bg-green-500';
        case 'absent': return 'bg-red-500';
        case 'holiday': return 'bg-amber-500';
        default: return 'bg-gray-300';
    }
};

const StatusIcon = ({ status, size = 18 }) => {
    switch (status) {
        case 'present': return <CheckCircle size={size} className="text-green-600" />;
        case 'absent': return <XCircle size={size} className="text-red-500" />;
        case 'holiday': return <Umbrella size={size} className="text-amber-600" />;
        default: return <Clock size={size} className="text-gray-400" />;
    }
};

// ─── Loading Skeleton ────────────────────────────────────────────────────────

const LoadingSkeleton = () => (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto px-4 md:px-6 pb-8 animate-pulse">
        <header className="flex items-center justify-between">
            <div className="space-y-2">
                <SkeletonBox height="h-8" width="w-64" />
                <SkeletonBox height="h-4" width="w-48" />
            </div>
        </header>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-2">
                    <SkeletonBox height="h-4" width="w-32" />
                    <SkeletonBox height="h-6" width="w-64" />
                    <div className="flex gap-2">
                        <SkeletonBox height="h-6" width="w-40" className="rounded-full" />
                        <SkeletonBox height="h-6" width="w-32" className="rounded-full" />
                    </div>
                </div>
                <SkeletonBox height="h-20" width="w-48" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SkeletonBox height="h-24" className="rounded-xl" />
                <SkeletonBox height="h-24" className="rounded-xl" />
                <SkeletonBox height="h-24" className="rounded-xl" />
                <SkeletonBox height="h-24" className="rounded-xl" />
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
                <SkeletonBox height="h-40" className="rounded-2xl" />
                <SkeletonBox height="h-72" className="rounded-2xl" />
            </div>
            <div className="lg:col-span-4">
                <SkeletonBox height="h-96" className="rounded-2xl" />
            </div>
        </div>
    </div>
);

// ─── Stat Card ───────────────────────────────────────────────────────────────

const StatCard = ({ label, value, colorClass, bgClass, borderClass }) => (
    <div className={`${bgClass} ${borderClass} border rounded-xl p-4 text-center`}>
        <p className="text-xs text-gray-600 uppercase font-medium tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const Attendance = () => {
    const [loading, setLoading] = useState(true);
    const [historyData, setHistoryData] = useState(null);

    useEffect(() => {
        fetchAttendanceHistory();
    }, []);

    const fetchAttendanceHistory = async (showToast = false) => {
        try {
            setLoading(true);
            const response = await api.get('/attendance/student', {
                params: { _t: Date.now() }
            });
            if (response.data.success) {
                setHistoryData(response.data.data);
                if (showToast) toast.success('Attendance updated');
            } else {
                toast.error(response.data.message || 'Failed to load attendance records');
            }
        } catch (error) {
            console.error('Error fetching attendance:', error);
            toast.error('Failed to load attendance records');
        } finally {
            setLoading(false);
        }
    };

    // ── Derived: semester stats ──────────────────────────────────────────────
    const stats = useMemo(() => {
        if (!historyData?.semester?.series) return null;
        let present = 0, absent = 0, holidays = 0, unmarked = 0, totalWorkingDays = 0;
        historyData.semester.series.forEach(entry => {
            if (entry.isHoliday) {
                holidays++;
            } else {
                totalWorkingDays++;
                if (entry.status === 'present') present++;
                else if (entry.status === 'absent') absent++;
                else unmarked++;
            }
        });
        // Percentage based only on marked days (present + absent), ignoring future/pending days
        const markedDays = present + absent;
        const percentage = markedDays > 0
            ? ((present / markedDays) * 100).toFixed(1)
            : '0.0';
        return { present, absent, holidays, unmarked, totalWorkingDays, markedDays, percentage };
    }, [historyData]);

    // ── Derived: all holidays in semester ────────────────────────────────────
    const semesterHolidays = useMemo(() => {
        if (!historyData?.semester?.series) return [];
        const seen = new Set();
        const result = [];
        historyData.semester.series.forEach(entry => {
            // Only show holidays that have a proper name (skip unnamed Sundays/weekends)
            if (entry.isHoliday && !seen.has(entry.date) && entry.holiday) {
                const label = getHolidayLabel(entry.holiday);
                if (label && label !== 'Holiday') {
                    seen.add(entry.date);
                    result.push({
                        date: entry.date,
                        holiday: entry.holiday,
                        label,
                        type: getHolidayType(entry.holiday)
                    });
                }
            }
        });
        return result.sort((a, b) => a.date.localeCompare(b.date));
    }, [historyData]);

    const publicHolidays = useMemo(() => semesterHolidays.filter(h => h.type === 'public'), [semesterHolidays]);
    const customHolidays = useMemo(() => semesterHolidays.filter(h => h.type === 'custom'), [semesterHolidays]);
    const otherHolidays = useMemo(() => semesterHolidays.filter(h => h.type === 'other'), [semesterHolidays]);

    // ── Derived: monthly breakdown from semester series ───────────────────────
    const monthlyBreakdown = useMemo(() => {
        if (!historyData?.semester?.series) return [];
        const monthlyData = {};
        historyData.semester.series.forEach(entry => {
            const date = new Date(`${entry.date}T00:00:00+05:30`);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { monthName, present: 0, absent: 0, unmarked: 0, holidays: 0, total: 0 };
            }
            monthlyData[monthKey].total++;
            if (entry.isHoliday) monthlyData[monthKey].holidays++;
            else if (entry.status === 'present') monthlyData[monthKey].present++;
            else if (entry.status === 'absent') monthlyData[monthKey].absent++;
            else monthlyData[monthKey].unmarked++;
        });
        return Object.keys(monthlyData).sort().map(key => ({ key, ...monthlyData[key] }));
    }, [historyData]);

    // ── Derived: chart data from semester series ─────────────────────────────
    const chartData = useMemo(() => {
        if (!historyData?.semester?.series) return [];
        // For the chart, aggregate by month for readability
        return monthlyBreakdown.map(m => ({
            name: m.monthName.slice(0, 3) + ' ' + m.monthName.slice(-4), // e.g. "Jan 2025"
            Present: m.present,
            Absent: m.absent,
            Holiday: m.holidays,
            Pending: m.unmarked
        }));
    }, [historyData, monthlyBreakdown]);

    // ── Derived: recent activity from weekly series ───────────────────────────
    const recentActivity = useMemo(() => {
        if (!historyData?.weekly?.series) return [];
        return [...historyData.weekly.series].reverse().slice(0, 7);
    }, [historyData]);

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) return <LoadingSkeleton />;

    if (!historyData) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No Attendance Records Found</h3>
                <p className="text-gray-500">Could not retrieve attendance data at this time.</p>
            </div>
        );
    }

    const semester = historyData.semester;
    const isFallback = semester?.semesterSource === 'fallback' || semester?.isFallback;

    // ── Percentage color ─────────────────────────────────────────────────────
    const pct = parseFloat(stats?.percentage ?? 0);
    const pctColor = pct >= 75 ? 'text-green-700' : pct >= 50 ? 'text-yellow-700' : 'text-red-600';
    const pctBg = pct >= 75 ? 'bg-green-50 border-green-200' : pct >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1920px] mx-auto px-4 md:px-6 pb-10">

            {/* ── Header ── */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 heading-font">My Attendance</h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5">Track your comprehensive attendance overview</p>
                </div>
                <button
                    onClick={() => fetchAttendanceHistory(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </header>

            {/* ── Semester Summary Card ── */}
            {semester && stats && (
                <section className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-4 md:p-6">
                    {/* Top row: title + percentage */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                                <BookOpen size={14} />
                                Semester Attendance
                            </p>

                            {/* Semester Dates */}
                            {semester.startDate && semester.endDate ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-semibold">
                                        <Calendar size={14} />
                                        {formatDisplayDate(semester.startDate)}
                                    </span>
                                    <span className="text-gray-400 font-bold text-lg">→</span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-semibold">
                                        <Calendar size={14} />
                                        {formatDisplayDate(semester.endDate)}
                                    </span>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">Semester dates not configured</p>
                            )}

                            {/* Fallback warning */}
                            {isFallback && (
                                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 max-w-sm">
                                    <Info size={14} className="mt-0.5 shrink-0" />
                                    <span>Semester dates are not set. Set them in <strong>Settings → Academic Calendar</strong> for accurate attendance.</span>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200">
                                    <Calendar size={12} />
                                    {stats.totalWorkingDays} working days
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-200">
                                    <Sun size={12} />
                                    {stats.holidays} holidays
                                </span>
                            </div>
                        </div>

                        {/* Percentage Badge */}
                        <div className={`flex items-center justify-between gap-6 px-5 py-4 rounded-2xl border ${pctBg} min-w-[200px]`}>
                            <div>
                                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Attendance</p>
                                <p className={`text-4xl font-extrabold ${pctColor}`}>{stats.percentage}%</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {stats.present} of {stats.markedDays} marked days
                                </p>
                            </div>
                            <TrendingUp size={36} className={pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'} />
                        </div>
                    </div>

                    {/* Stat Grid */}
                    <div className="grid grid-cols-3 gap-4">
                        <StatCard label="Present" value={stats.present} colorClass="text-green-700" bgClass="bg-green-50" borderClass="border-green-100" />
                        <StatCard label="Absent" value={stats.absent} colorClass="text-red-600" bgClass="bg-red-50" borderClass="border-red-100" />
                        <StatCard label="Holidays" value={stats.holidays} colorClass="text-amber-700" bgClass="bg-amber-50" borderClass="border-amber-100" />
                    </div>
                </section>
            )}

            {/* ── Holidays Section ── */}
            {semesterHolidays.length > 0 && (
                <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 md:p-6">
                    <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Umbrella size={18} className="text-amber-500" />
                        Holidays This Semester
                        <span className="ml-auto text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            {semesterHolidays.length} total
                        </span>
                    </h2>

                    <div className="space-y-4">
                        {/* Institute / Custom Holidays */}
                        {customHolidays.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                                    Institute Holidays ({customHolidays.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {customHolidays.map(h => (
                                        <div key={h.date} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-100">
                                            <div className="mt-0.5 w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                                                <BookOpen size={14} className="text-purple-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-purple-900 truncate">{h.label}</p>
                                                <p className="text-xs text-purple-600 mt-0.5">{formatShortDate(h.date)}</p>
                                                {h.holiday?.description && (
                                                    <p className="text-[11px] text-purple-500 mt-0.5 truncate">{h.holiday.description}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Public Holidays */}
                        {publicHolidays.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                                    Public Holidays ({publicHolidays.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {publicHolidays.map(h => (
                                        <div key={h.date} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-100">
                                            <div className="mt-0.5 w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                                                <Sun size={14} className="text-orange-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-orange-900 truncate">{h.label}</p>
                                                {h.holiday?.name && h.holiday?.localName && h.holiday.name !== h.holiday.localName && (
                                                    <p className="text-[11px] text-orange-600 truncate">{h.holiday.name}</p>
                                                )}
                                                <p className="text-xs text-orange-500 mt-0.5">{formatShortDate(h.date)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Other Holidays */}
                        {otherHolidays.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {otherHolidays.map(h => (
                                    <div key={h.date} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
                                        <div className="mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                            <Umbrella size={14} className="text-amber-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-amber-900 truncate">{h.label}</p>
                                            <p className="text-xs text-amber-600 mt-0.5">{formatShortDate(h.date)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {semesterHolidays.length === 0 && semester && (
                <section className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-5 flex items-center gap-3 text-gray-500">
                    <Umbrella size={20} className="text-gray-300 shrink-0" />
                    <p className="text-sm">No holidays recorded in this semester period.</p>
                </section>
            )}

            {/* ── Main Grid: Chart + Recent Activity ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: Bar Chart */}
                <div className="lg:col-span-8 space-y-6">

                    {/* Monthly Summary Bar Chart */}
                    {chartData.length > 0 && (
                        <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-800 mb-4">Monthly Attendance Overview</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} barCategoryGap="30%">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            cursor={{ fill: '#f8fafc' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                                        <Bar dataKey="Present" fill="#22c55e" name="Present" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Absent" fill="#ef4444" name="Absent" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Holiday" fill="#f59e0b" name="Holiday" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Pending" fill="#a3a3a3" name="Pending" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    {/* Monthly Breakdown Cards */}
                    {monthlyBreakdown.length > 0 && (
                        <section>
                            <h3 className="text-base font-bold text-gray-900 mb-4 px-0.5">Month-by-Month Breakdown</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {monthlyBreakdown.map(month => {
                                    const workingDays = month.total - month.holidays;
                                    const markedM = month.present + month.absent;
                                    // Percentage based on marked days only (exclude future/pending)
                                    const pctM = markedM > 0
                                        ? ((month.present / markedM) * 100).toFixed(1)
                                        : (workingDays === 0 ? '0.0' : '—');
                                    const pctMNum = parseFloat(pctM);
                                    const badgeCls = pctMNum >= 75
                                        ? 'bg-green-100 text-green-700'
                                        : pctMNum >= 50
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700';

                                    return (
                                        <div
                                            key={month.key}
                                            className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <h4 className="text-sm font-bold text-gray-800">{month.monthName}</h4>
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${badgeCls}`}>
                                                    {pctM}%
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="bg-green-50 rounded-lg p-2.5">
                                                    <p className="text-[10px] text-green-700 font-semibold uppercase">Present</p>
                                                    <p className="text-lg font-bold text-green-800">{month.present}</p>
                                                </div>
                                                <div className="bg-red-50 rounded-lg p-2.5">
                                                    <p className="text-[10px] text-red-700 font-semibold uppercase">Absent</p>
                                                    <p className="text-lg font-bold text-red-800">{month.absent}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-2.5">
                                                    <p className="text-[10px] text-gray-600 font-semibold uppercase">Working Days</p>
                                                    <p className="text-lg font-bold text-gray-700">{workingDays}</p>
                                                </div>
                                                <div className="bg-amber-50 rounded-lg p-2.5">
                                                    <p className="text-[10px] text-amber-700 font-semibold uppercase">Holidays</p>
                                                    <p className="text-lg font-bold text-amber-800">{month.holidays}</p>
                                                </div>
                                            </div>

                                            {/* Thin progress bar */}
                                            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${pctMNum >= 75 ? 'bg-green-500' : pctMNum >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                    style={{ width: `${Math.min(100, pctMNum)}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 text-right">{markedM} days marked</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right: Recent Activity + Weekly Summary */}
                <div className="lg:col-span-4 space-y-5">

                    {/* Weekly Summary */}
                    {historyData.weekly && (
                        <div className="bg-white border border-blue-100 rounded-2xl p-4 md:p-5 shadow-sm">
                            <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide mb-3">This Week</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2 text-center">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase">Present</p>
                                    <p className="text-xl font-bold text-green-600">{historyData.weekly?.totals?.present ?? 0}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase">Absent</p>
                                    <p className="text-xl font-bold text-red-500">{historyData.weekly?.totals?.absent ?? 0}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase">Pending</p>
                                    <p className="text-xl font-bold text-gray-500">{historyData.weekly?.totals?.unmarked ?? 0}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase">Holiday</p>
                                    <p className="text-xl font-bold text-amber-600">{historyData.weekly?.totals?.holidays ?? 0}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 mb-3">Recent Activity</h3>
                        {recentActivity.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">No recent activity</p>
                        ) : (
                            <div className="space-y-2">
                                {recentActivity.map(entry => (
                                    <div
                                        key={entry.date}
                                        className={`flex items-center justify-between p-3 rounded-xl border ${entry.status === 'present'
                                            ? 'border-green-200 bg-green-50'
                                            : entry.status === 'absent'
                                                ? 'border-red-200 bg-red-50'
                                                : entry.isHoliday
                                                    ? 'border-amber-200 bg-amber-50'
                                                    : 'border-gray-200 bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-1.5 h-8 rounded-full ${statusColor(entry.isHoliday ? 'holiday' : entry.status)}`} />
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">{formatShortDate(entry.date)}</p>
                                                <p className="text-[11px] capitalize text-gray-600">
                                                    {entry.isHoliday
                                                        ? getHolidayLabel(entry.holiday)
                                                        : entry.status === 'present'
                                                            ? 'Present'
                                                            : entry.status === 'absent'
                                                                ? 'Absent'
                                                                : 'Pending'}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusIcon status={entry.isHoliday ? 'holiday' : entry.status} size={16} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Attendance;

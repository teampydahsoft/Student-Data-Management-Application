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
    Info,
    BarChart2,
    Award
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
    if (holidayObj.title) return holidayObj.title;
    if (holidayObj.localName) return holidayObj.localName;
    if (holidayObj.name) return holidayObj.name;
    return 'Holiday';
};

const getHolidayType = (holidayObj) => {
    if (!holidayObj) return 'other';
    if (holidayObj.title) return 'custom';
    if (holidayObj.localName || holidayObj.name) return 'public';
    return 'other';
};

// Date helpers (IST)
const getNowInIST = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const dateKeyFromDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const dateFromKeyIST = (key) => new Date(`${key}T00:00:00+05:30`);

const getCurrentWeekRangeIST = (now = getNowInIST()) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const dow = start.getDay(); // 0=Sun,1=Mon,...,6=Sat
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    start.setDate(start.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 5); // Mon -> Sat
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const getCurrentMonthRangeIST = (now = getNowInIST()) => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// Correct percentage: present / (present + absent) — excludes holidays and pending
const calcPct = (present, absent) => {
    const marked = present + absent;
    if (marked === 0) return 0;
    return (present / marked) * 100;
};

const pctColors = (pct) => {
    if (pct >= 75) return { ring: '#22c55e', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' };
    if (pct >= 50) return { ring: '#f59e0b', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' };
    return { ring: '#ef4444', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-600' };
};

// ─── Circular Progress Ring ───────────────────────────────────────────────────

const CircularRing = ({ pct, size = 140 }) => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const clampedPct = Math.min(100, Math.max(0, pct));
    const dashOffset = circumference - (clampedPct / 100) * circumference;
    const colors = pctColors(clampedPct);

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke={colors.ring}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-extrabold ${colors.text}`}>{clampedPct.toFixed(1)}%</span>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Attendance</span>
            </div>
        </div>
    );
};

// ─── Status Icon ─────────────────────────────────────────────────────────────

const StatusIcon = ({ status, size = 16 }) => {
    switch (status) {
        case 'present': return <CheckCircle size={size} className="text-green-500" />;
        case 'absent': return <XCircle size={size} className="text-red-500" />;
        case 'holiday': return <Umbrella size={size} className="text-amber-500" />;
        default: return <Clock size={size} className="text-gray-400" />;
    }
};

const statusBg = (status) => {
    switch (status) {
        case 'present': return 'border-green-200 bg-green-50';
        case 'absent': return 'border-red-200 bg-red-50';
        case 'holiday': return 'border-amber-200 bg-amber-50';
        default: return 'border-gray-200 bg-gray-50';
    }
};

const statusDot = (status) => {
    switch (status) {
        case 'present': return 'bg-green-500';
        case 'absent': return 'bg-red-500';
        case 'holiday': return 'bg-amber-400';
        default: return 'bg-gray-300';
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
        <div className="flex gap-2">
            <SkeletonBox height="h-10" width="w-28" className="rounded-xl" />
            <SkeletonBox height="h-10" width="w-28" className="rounded-xl" />
            <SkeletonBox height="h-10" width="w-28" className="rounded-xl" />
        </div>
        <SkeletonBox height="h-64" className="rounded-2xl" />
        <SkeletonBox height="h-72" className="rounded-2xl" />
    </div>
);

// ─── Stat Mini Card ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, colorClass, bgClass, borderClass }) => (
    <div className={`${bgClass} ${borderClass} border rounded-2xl p-4 text-center`}>
        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-extrabold ${colorClass}`}>{value}</p>
    </div>
);

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
    { id: 'weekly', label: 'Weekly', icon: Calendar },
    { id: 'monthly', label: 'Monthly', icon: BarChart2 },
    { id: 'semester', label: 'Semester', icon: Award },
];

// ─── Weekly Tab ──────────────────────────────────────────────────────────────

const WeeklyTab = ({ weekly, semesterSeries }) => {
    const present = weekly?.totals?.present ?? 0;
    const absent = weekly?.totals?.absent ?? 0;
    const holidays = weekly?.totals?.holidays ?? 0;
    const unmarked = weekly?.totals?.unmarked ?? 0;
    const pct = calcPct(present, absent);
    const colors = pctColors(pct);

    // Day-by-day entries for this week
    const days = useMemo(() => {
        if (!weekly?.series) return [];
        return [...weekly.series];
    }, [weekly]);

    return (
        <div className="space-y-6">
            {/* Hero Card */}
            <div className={`bg-white border ${colors.border} rounded-2xl p-5 shadow-sm`}>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <CircularRing pct={pct} size={140} />
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Week</p>
                            {weekly?.startDate && weekly?.endDate && (
                                <p className="text-sm font-bold text-gray-800 mt-0.5">
                                    {formatDisplayDate(weekly.startDate)} → {formatDisplayDate(weekly.endDate)}
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatCard label="Present" value={present} colorClass="text-green-700" bgClass="bg-green-50" borderClass="border-green-100" />
                            <StatCard label="Absent" value={absent} colorClass="text-red-600" bgClass="bg-red-50" borderClass="border-red-100" />
                            <StatCard label="Holidays" value={holidays} colorClass="text-amber-700" bgClass="bg-amber-50" borderClass="border-amber-100" />
                            <StatCard label="Pending" value={unmarked} colorClass="text-gray-500" bgClass="bg-gray-50" borderClass="border-gray-200" />
                        </div>
                        <p className="text-xs text-gray-400">
                            Percentage based on <span className="font-semibold">{present + absent}</span> marked day{present + absent !== 1 ? 's' : ''} (holidays &amp; pending excluded)
                        </p>
                    </div>
                </div>
            </div>

            {/* Day-by-Day List */}
            {days.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar size={16} className="text-blue-500" />
                        Day-by-Day Breakdown
                    </h3>
                    <div className="space-y-2">
                        {days.map(entry => {
                            const effectiveStatus = entry.isHoliday ? 'holiday' : (entry.status || 'pending');
                            return (
                                <div
                                    key={entry.date}
                                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${statusBg(effectiveStatus)}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-8 rounded-full ${statusDot(effectiveStatus)}`} />
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{formatShortDate(entry.date)}</p>
                                            <p className="text-xs text-gray-500 capitalize">
                                                {entry.isHoliday
                                                    ? getHolidayLabel(entry.holiday)
                                                    : effectiveStatus === 'present'
                                                        ? 'Present'
                                                        : effectiveStatus === 'absent'
                                                            ? 'Absent'
                                                            : 'Pending / Unmarked'}
                                            </p>
                                        </div>
                                    </div>
                                    <StatusIcon status={effectiveStatus} size={18} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Monthly Tab ─────────────────────────────────────────────────────────────

const MonthlyTab = ({ monthly, semesterSeries }) => {
    // Selected month (defaults to API month or current month in IST)
    const initialMonth = useMemo(() => {
        if (monthly?.startDate) return dateFromKeyIST(monthly.startDate);
        return getNowInIST();
    }, [monthly]);

    const [monthCursor, setMonthCursor] = useState(initialMonth);
    const monthInitialized = React.useRef(false);

    useEffect(() => {
        // on the very first render with valid data set the cursor; after that
        // keep whatever month the user has navigated to, even if `monthly`
        // changes due to a refresh.  This stops Refresh from snapping the view
        // back to the current month.
        if (!monthInitialized.current) {
            setMonthCursor(initialMonth);
            monthInitialized.current = true;
        }
    }, [initialMonth]);

    // No need to re-fetch when the month cursor changes; the parent
    // already returns the entire semester series, so we can derive any
    // month's data locally. Keeping historyData local is more efficient and
    // eliminates strange refresh loops.

    const { monthLabel, startOfMonth, days, totals, pct, colors } = useMemo(() => {
        const start = new Date(monthCursor);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        const label = start.toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        });

        const map = new Map((semesterSeries || []).map(e => [e.date, e]));
        const dayCells = [];
        const totalsAcc = { present: 0, absent: 0, holidays: 0, unmarked: 0 };

        const daysInMonth = end.getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const cur = new Date(start.getFullYear(), start.getMonth(), d);
            const key = dateKeyFromDate(cur);
            const entry = map.get(key);
            const isHoliday = Boolean(entry?.isHoliday) || entry?.status === 'holiday';
            const status = entry?.status || 'unmarked';
            const holiday = entry?.holiday || null;

            if (isHoliday) totalsAcc.holidays += 1;
            else if (status === 'present') totalsAcc.present += 1;
            else if (status === 'absent') totalsAcc.absent += 1;
            else totalsAcc.unmarked += 1;

            dayCells.push({
                dateKey: key,
                dayNumber: d,
                weekday: cur.getDay(),
                status: isHoliday ? 'holiday' : status,
                isHoliday,
                holiday
            });
        }

        const percentage = calcPct(totalsAcc.present, totalsAcc.absent);
        const colorSet = pctColors(percentage);

        return {
            monthLabel: label,
            startOfMonth: start,
            days: dayCells,
            totals: totalsAcc,
            pct: percentage,
            colors: colorSet
        };
    }, [monthCursor, semesterSeries]);

    const goToPrevMonth = () => {
        const prev = new Date(monthCursor);
        prev.setMonth(prev.getMonth() - 1);
        setMonthCursor(prev);
    };

    const goToNextMonth = () => {
        const next = new Date(monthCursor);
        next.setMonth(next.getMonth() + 1);
        setMonthCursor(next);
    };

    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const calendarCells = useMemo(() => {
        if (!days || days.length === 0) return [];
        const firstDay = new Date(startOfMonth);
        const firstWeekday = (firstDay.getDay() + 6) % 7; // 0=Mon..6=Sun
        const cells = [];
        for (let i = 0; i < firstWeekday; i++) cells.push(null);
        days.forEach(day => cells.push(day));
        return cells;
    }, [days, startOfMonth]);

    const present = totals.present;
    const absent = totals.absent;
    const holidays = totals.holidays;
    const unmarked = totals.unmarked;

    return (
        <div className="space-y-6">
            {/* Hero Card — selected month */}
            <div className={`bg-white border ${colors.border} rounded-2xl p-4 sm:p-5 shadow-sm`}>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <CircularRing pct={pct} size={120} />
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                            <div className="w-full text-center sm:w-auto sm:text-left">
                                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    This Month
                                </p>
                                <p className="text-sm font-bold text-gray-800 mt-0.5">
                                    {monthLabel}
                                </p>
                            </div>
                            <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
                                <button
                                    onClick={goToPrevMonth}
                                    className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm grid place-items-center"
                                >
                                    ‹
                                </button>
                                <button
                                    onClick={goToNextMonth}
                                    className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm grid place-items-center"
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatCard label="Present" value={present} colorClass="text-green-700" bgClass="bg-green-50" borderClass="border-green-100" />
                            <StatCard label="Absent" value={absent} colorClass="text-red-600" bgClass="bg-red-50" borderClass="border-red-100" />
                            <StatCard label="Holidays" value={holidays} colorClass="text-amber-700" bgClass="bg-amber-50" borderClass="border-amber-100" />
                            <StatCard label="Pending" value={unmarked} colorClass="text-gray-500" bgClass="bg-gray-50" borderClass="border-gray-200" />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-400">
                            Percentage based on <span className="font-semibold">{present + absent}</span> marked day{present + absent !== 1 ? 's' : ''} (holidays &amp; pending excluded)
                        </p>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm overflow-hidden">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar size={16} className="text-blue-500" />
                    Monthly Calendar
                </h3>
                <div className="grid grid-cols-7 gap-1 text-center text-[9px] sm:text-[10px] font-semibold text-gray-400 mb-2">
                    {weekdayLabels.map(label => (
                        <div key={label} className="py-1 uppercase tracking-wide">
                            {label}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-[10px] sm:text-xs">
                    {calendarCells.map((cell, idx) => {
                        if (!cell) return <div key={idx} className="h-14 sm:h-16 rounded-xl" />;
                        const effectiveStatus = cell.isHoliday ? 'holiday' : (cell.status || 'unmarked');
                        const baseClasses = statusBg(effectiveStatus);
                        return (
                            <div
                                key={cell.dateKey}
                                className={`h-14 sm:h-16 rounded-xl border ${baseClasses} flex flex-col items-start justify-between p-1.5 sm:p-2`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[11px] sm:text-[11px] font-bold text-gray-900">
                                        {cell.dayNumber}
                                    </span>
                                    <span className={`w-2 h-2 rounded-full ${statusDot(effectiveStatus)}`} />
                                </div>
                                <div className="w-full text-[8px] sm:text-[9px] text-gray-500 capitalize line-clamp-1">
                                    {cell.isHoliday
                                        ? getHolidayLabel(cell.holiday)
                                        : effectiveStatus === 'present'
                                            ? 'Present'
                                            : effectiveStatus === 'absent'
                                                ? 'Absent'
                                                : 'Pending / Unmarked'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Semester Tab ─────────────────────────────────────────────────────────────

const SemesterTab = ({ semester, semesterSeries }) => {
    const isFallback = semester?.semesterSource === 'fallback' || semester?.isFallback;

    const stats = useMemo(() => {
        if (!semesterSeries) return null;
        let present = 0, absent = 0, holidays = 0, unmarked = 0, workingDays = 0;
        semesterSeries.forEach(entry => {
            if (entry.isHoliday) holidays++;
            else {
                workingDays++;
                if (entry.status === 'present') present++;
                else if (entry.status === 'absent') absent++;
                else unmarked++;
            }
        });
        const pct = calcPct(present, absent);
        return { present, absent, holidays, unmarked, workingDays, pct };
    }, [semesterSeries]);

    // Holidays
    const semesterHolidays = useMemo(() => {
        if (!semesterSeries) return [];
        const seen = new Set();
        const result = [];
        semesterSeries.forEach(entry => {
            if (entry.isHoliday && !seen.has(entry.date) && entry.holiday) {
                const label = getHolidayLabel(entry.holiday);
                if (label && label !== 'Holiday') {
                    seen.add(entry.date);
                    result.push({ date: entry.date, holiday: entry.holiday, label, type: getHolidayType(entry.holiday) });
                }
            }
        });
        return result.sort((a, b) => a.date.localeCompare(b.date));
    }, [semesterSeries]);

    const publicHolidays = semesterHolidays.filter(h => h.type === 'public');
    const customHolidays = semesterHolidays.filter(h => h.type === 'custom');
    const otherHolidays = semesterHolidays.filter(h => h.type === 'other');

    const pct = stats?.pct ?? 0;
    const colors = pctColors(pct);

    if (!semester || !stats) {
        return (
            <div className="text-center py-12 text-gray-400">
                <AlertCircle className="mx-auto h-10 w-10 mb-3" />
                <p className="text-sm">No semester data available.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Hero Card */}
            <div className={`bg-white border ${colors.border} rounded-2xl p-5 shadow-sm`}>
                {isFallback && (
                    <div className="flex items-start gap-2 px-3 py-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        <span>Semester dates are not set. Configure them in <strong>Settings → Academic Calendar</strong> for accurate attendance.</span>
                    </div>
                )}
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <CircularRing pct={pct} size={150} />
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1.5">
                                <BookOpen size={14} /> Semester Attendance
                            </p>
                            {semester.startDate && semester.endDate && (
                                <div className="flex flex-wrap items-center gap-2 mt-2 justify-center sm:justify-start">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-semibold">
                                        <Calendar size={13} /> {formatDisplayDate(semester.startDate)}
                                    </span>
                                    <span className="text-gray-400 font-bold">→</span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-semibold">
                                        <Calendar size={13} /> {formatDisplayDate(semester.endDate)}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2 justify-center sm:justify-start">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200">
                                    <Calendar size={12} /> {stats.workingDays} working days
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-200">
                                    <Sun size={12} /> {stats.holidays} holidays
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatCard label="Present" value={stats.present} colorClass="text-green-700" bgClass="bg-green-50" borderClass="border-green-100" />
                            <StatCard label="Absent" value={stats.absent} colorClass="text-red-600" bgClass="bg-red-50" borderClass="border-red-100" />
                            <StatCard label="Holidays" value={stats.holidays} colorClass="text-amber-700" bgClass="bg-amber-50" borderClass="border-amber-100" />
                            <StatCard label="Pending" value={stats.unmarked} colorClass="text-gray-500" bgClass="bg-gray-50" borderClass="border-gray-200" />
                        </div>
                        <p className="text-xs text-gray-400">
                            Percentage based on <span className="font-semibold">{stats.present + stats.absent}</span> marked days (holidays &amp; pending excluded)
                        </p>
                    </div>
                </div>
            </div>

            {/* Holidays */}
            {semesterHolidays.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Umbrella size={16} className="text-amber-500" />
                        Holidays This Semester
                        <span className="ml-auto text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            {semesterHolidays.length} total
                        </span>
                    </h3>
                    <div className="space-y-4">
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
                                                <BookOpen size={13} className="text-purple-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-purple-900 truncate">{h.label}</p>
                                                <p className="text-xs text-purple-600 mt-0.5">{formatShortDate(h.date)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                                                <Sun size={13} className="text-orange-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-orange-900 truncate">{h.label}</p>
                                                <p className="text-xs text-orange-500 mt-0.5">{formatShortDate(h.date)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {otherHolidays.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {otherHolidays.map(h => (
                                    <div key={h.date} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
                                        <div className="mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                            <Umbrella size={13} className="text-amber-600" />
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
                </div>
            )}
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const Attendance = () => {
    const [loading, setLoading] = useState(true);
    const [historyData, setHistoryData] = useState(null);
    const [activeTab, setActiveTab] = useState('weekly');

    useEffect(() => {
        // initial load only
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

    const semesterSeries = historyData?.semester?.series ?? [];

    // Force "Weekly" and "Monthly" to reflect current week/month (IST),
    // derived from semester series so we never regress to rolling windows.
    const derivedWeekly = useMemo(() => {
        const { start, end } = getCurrentWeekRangeIST();
        const startKey = dateKeyFromDate(start);
        const endKey = dateKeyFromDate(end);

        const map = new Map((semesterSeries || []).map(e => [e.date, e]));
        const series = [];
        const totals = { present: 0, absent: 0, holidays: 0, unmarked: 0 };

        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            const key = dateKeyFromDate(cursor);
            const entry = map.get(key);
            const isHoliday = Boolean(entry?.isHoliday) || entry?.status === 'holiday';
            const status = entry?.status || 'unmarked';
            const holiday = entry?.holiday || null;

            if (isHoliday) totals.holidays += 1;
            else if (status === 'present') totals.present += 1;
            else if (status === 'absent') totals.absent += 1;
            else totals.unmarked += 1;

            series.push({ date: key, status: isHoliday ? 'holiday' : status, isHoliday, holiday });
        }

        return { startDate: startKey, endDate: endKey, totals, series, holidays: series.filter(s => s.isHoliday) };
    }, [semesterSeries]);

    const derivedMonthly = useMemo(() => {
        const { start, end } = getCurrentMonthRangeIST();
        const startKey = dateKeyFromDate(start);
        const endKey = dateKeyFromDate(end);

        const map = new Map((semesterSeries || []).map(e => [e.date, e]));
        const series = [];
        const totals = { present: 0, absent: 0, holidays: 0, unmarked: 0 };

        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            const key = dateKeyFromDate(cursor);
            const entry = map.get(key);
            const isHoliday = Boolean(entry?.isHoliday) || entry?.status === 'holiday';
            const status = entry?.status || 'unmarked';
            const holiday = entry?.holiday || null;

            if (isHoliday) totals.holidays += 1;
            else if (status === 'present') totals.present += 1;
            else if (status === 'absent') totals.absent += 1;
            else totals.unmarked += 1;

            series.push({ date: key, status: isHoliday ? 'holiday' : status, isHoliday, holiday });
        }

        return { startDate: startKey, endDate: endKey, totals, series, holidays: series.filter(s => s.isHoliday) };
    }, [semesterSeries]);

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

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1920px] mx-auto px-4 md:px-6 pb-10">

            {/* ── Header ── */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 heading-font">My Attendance</h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5">Track your comprehensive attendance overview</p>
                </div>
                {/* refresh only shown outside monthly tab; monthly data auto-fetches on navigation */}
                {activeTab !== 'monthly' && (
                    <button
                        onClick={() => fetchAttendanceHistory(true)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                )}
            </header>

            {/* ── Tabs ── */}
            <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100/80 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl w-full sm:w-fit">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-1 sm:flex-none justify-center items-center gap-1.5 sm:gap-2 px-2 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${isActive
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                                }`}
                        >
                            <Icon size={14} className="sm:w-[15px] sm:h-[15px]" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}
            <div key={activeTab} className="animate-fade-in">
                {activeTab === 'weekly' && (
                    <WeeklyTab
                        weekly={derivedWeekly}
                        semesterSeries={semesterSeries}
                    />
                )}
                {activeTab === 'monthly' && (
                    <MonthlyTab
                        monthly={derivedMonthly}
                        semesterSeries={semesterSeries}
                    />
                )}
                {activeTab === 'semester' && (
                    <SemesterTab
                        semester={historyData.semester}
                        semesterSeries={semesterSeries}
                    />
                )}
            </div>
        </div>
    );
};

export default Attendance;

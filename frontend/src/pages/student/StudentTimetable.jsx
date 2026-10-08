import React, { useEffect, useState, useMemo } from 'react';
import {
    Clock,
    Calendar,
    BookOpen,
    AlertCircle,
    Info,
    Award,
    CheckCircle,
    XCircle,
    TrendingUp,
    RefreshCw,
    Filter,
    UserCheck,
    ChevronRight,
    Layers,
    ShieldCheck
} from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import { toast } from 'react-hot-toast';

const StudentTimetable = () => {
    const { user } = useAuthStore();

    // Data States
    const [timetableData, setTimetableData] = useState([]);
    const [periodSlots, setPeriodSlots] = useState([]);
    const [attendanceData, setAttendanceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters, Tabs & Modal
    const [selectedYear, setSelectedYear] = useState(Number(user?.current_year) || 1);
    const [selectedSem, setSelectedSem] = useState(Number(user?.current_semester) || 1);
    const [activeTab, setActiveTab] = useState('grid'); // 'grid' | 'periodwise' | 'academic'
    const [selectedPeriodModal, setSelectedPeriodModal] = useState(null);

    const days = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

    // Default active day for mobile/periodwise
    const today = new Date().getDay();
    const defaultDay = today >= 1 && today <= 6 ? days[today - 1] : 'MON';
    const [activeDay, setActiveDay] = useState(defaultDay);

    // Sync user default year/sem on load
    useEffect(() => {
        if (user?.current_year) setSelectedYear(Number(user.current_year) || 1);
        if (user?.current_semester) setSelectedSem(Number(user.current_semester) || 1);
    }, [user]);

    // Fetch Timetable & Period Slots
    const fetchTimetableAndSlots = async (isManualRefresh = false) => {
        const branchId = user?.branch_id || user?.course_branch_id || user?.branchId;
        const collegeId = user?.college_id || user?.collegeId;

        try {
            if (isManualRefresh) setRefreshing(true);
            else setLoading(true);

            // 1. Fetch Period Slots
            const slotsRes = await api.get('/period-slots', {
                params: collegeId ? { college_id: collegeId } : {}
            });
            if (slotsRes.data?.success) {
                setPeriodSlots(slotsRes.data.data || []);
            }

            // 2. Fetch Timetable for Selected Year & Semester
            if (branchId) {
                const timetableRes = await api.get('/timetable', {
                    params: {
                        branch_id: branchId,
                        year: selectedYear,
                        semester: selectedSem
                    }
                });
                if (timetableRes.data?.success) {
                    setTimetableData(timetableRes.data.data || []);
                }
            }

            // 3. Fetch Academic Attendance Summary
            try {
                const attRes = await api.get('/attendance/student');
                if (attRes.data?.success) {
                    setAttendanceData(attRes.data.data || null);
                }
            } catch (attErr) {
                console.warn('Notice: Attendance summary endpoint unavailable:', attErr?.message);
            }

            if (isManualRefresh) toast.success('Timetable & Attendance refreshed!');
        } catch (error) {
            console.error('Failed to fetch timetable data:', error);
            toast.error('Failed to load timetable details');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchTimetableAndSlots();
    }, [user, selectedYear, selectedSem]);

    // Time Format Helper
    const formatTimeTo12h = (timeStr) => {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const m = minutes;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${h}:${m} ${ampm}`;
    };

    const normalizeDay = (d) => {
        if (!d) return '';
        const str = String(d).trim().toUpperCase();
        if (str.startsWith('MON')) return 'MON';
        if (str.startsWith('TUE')) return 'TUE';
        if (str.startsWith('WED')) return 'WED';
        if (str.startsWith('THU')) return 'THUR';
        if (str.startsWith('FRI')) return 'FRI';
        if (str.startsWith('SAT')) return 'SAT';
        if (str.startsWith('SUN')) return 'SUN';
        return str;
    };

    const getEntryForSlot = (day, slotObj) => {
        if (!slotObj) return undefined;
        const targetId = Number(typeof slotObj === 'object' ? (slotObj.id ?? slotObj.sort_order) : slotObj);
        const targetSortOrder = Number(typeof slotObj === 'object' ? (slotObj.sort_order ?? slotObj.id) : slotObj);
        const targetLabel = String(typeof slotObj === 'object' ? (slotObj.slot_name || slotObj.name || '') : '').trim().toUpperCase();

        return timetableData.find(item => {
            const itemDay = normalizeDay(item.day_of_week || item.day);
            const targetDay = normalizeDay(day);
            if (itemDay !== targetDay) return false;

            const itemSlotId = Number(item.period_slot_id || item.timing_slot_id || item.slot_id);
            const itemSlotOrder = Number(item.slot_order || item.slot_order_id || item.period_slot_id);
            const itemLabel = String(item.slot_label || item.label || '').trim().toUpperCase();

            return (
                itemSlotId === targetId ||
                itemSlotOrder === targetSortOrder ||
                itemSlotOrder === targetId ||
                (targetLabel && itemLabel && targetLabel === itemLabel)
            );
        });
    };

    const getMobileEntryForSlot = (day, slotIndex) => {
        const exactEntry = getEntryForSlot(day, periodSlots[slotIndex]?.id);
        if (exactEntry) return { ...exactEntry, isStart: true };

        for (let i = 0; i < slotIndex; i++) {
            const prevEntry = getEntryForSlot(day, periodSlots[i]?.id);
            if (prevEntry && prevEntry.span > (slotIndex - i)) {
                return { ...prevEntry, isCovered: true };
            }
        }
        return null;
    };

    const currentDayName = useMemo(() => {
        const d = new Date().getDay();
        const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];
        return dayMap[d];
    }, []);

    // Direct Academic Portal Attendance Summary (strictly as provided by Academic Portal)
    const academicAttendanceSummary = useMemo(() => {
        const semesterData = attendanceData?.semester;
        const totals = semesterData?.totals || attendanceData?.totals || attendanceData;

        const rawPct = totals?.percentage ?? totals?.overallPercentage ?? totals?.attendance_percentage;
        const present = totals?.present ?? totals?.presentDays ?? totals?.present_count ?? 0;
        const absent = totals?.absent ?? totals?.absentDays ?? totals?.absent_count ?? 0;
        const holidays = totals?.holidays ?? totals?.holidayDays ?? 0;
        const workingDays = totals?.workingDays ?? totals?.totalWorkingDays ?? (present + absent);

        let numericPct = 0;
        if (rawPct !== undefined && rawPct !== null && Number(rawPct) > 0) {
            numericPct = Number(rawPct);
        } else if ((present + absent) > 0) {
            numericPct = (present / (present + absent)) * 100;
        } else {
            numericPct = 0.0;
        }

        return {
            percentage: numericPct.toFixed(1),
            present,
            absent,
            holidays,
            workingDays,
            status: numericPct >= 75 ? 'Compliant' : 'Shortage Alert',
            color: numericPct >= 75 ? 'text-blue-900' : 'text-rose-600',
            badgeBg: numericPct >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
        };
    }, [attendanceData]);

    // Period-wise posted attendance logs from Academic Portal DB (ap_attendance_post_students)
    const periodWiseLogs = useMemo(() => {
        return attendanceData?.periodWiseLogs || attendanceData?.semester?.periodWiseLogs || [];
    }, [attendanceData]);

    // Compute Subject-Wise Attendance from Academic Portal Series & Timetable Schedule
    const subjectAttendanceStatsMap = useMemo(() => {
        const statsMap = new Map();
        const series = attendanceData?.semester?.series || attendanceData?.series || [];

        // 1. Group timetable entries by subject code/title to find scheduled days & slot times
        const subjectDaysMap = new Map();
        timetableData.forEach(item => {
            const title = item.subject_name || item.custom_label || item.title || item.name;
            if (title) {
                const key = (item.subject_code || title).trim().toUpperCase();
                const day = normalizeDay(item.day_of_week || item.day);
                const slotLabel = item.slot_label || (item.start_time ? `${formatTimeTo12h(item.start_time)}` : null);
                if (!subjectDaysMap.has(key)) {
                    subjectDaysMap.set(key, {
                        name: title,
                        code: item.subject_code || 'SUB-101',
                        days: new Set(),
                        slotLabels: new Set(),
                        faculty: item.faculty_name || item.teacher_name || item.faculty || item.staff_name || item.instructor_name || null,
                        slotsCount: 0
                    });
                }
                const existing = subjectDaysMap.get(key);
                if (day) existing.days.add(day);
                if (slotLabel) existing.slotLabels.add(slotLabel);
                existing.slotsCount += item.span || 1;
                if (!existing.faculty && (item.faculty_name || item.teacher_name || item.faculty || item.staff_name)) {
                    existing.faculty = item.faculty_name || item.teacher_name || item.faculty || item.staff_name;
                }
            }
        });

        // 2. Compute attendance for each subject strictly from slot-based periodWiseLogs (Academic Portal DB)
        subjectDaysMap.forEach((info, key) => {
            let total = 0;
            let present = 0;
            let absent = 0;

            // Direct match from ap_attendance_post_students period-wise logs
            const directLogs = periodWiseLogs.filter(log => {
                const codeMatch = log.subject_code && log.subject_code.trim().toUpperCase() === info.code.trim().toUpperCase();
                const nameMatch = log.subject_name && log.subject_name.trim().toUpperCase() === info.name.trim().toUpperCase();
                return codeMatch || nameMatch;
            });

            if (directLogs.length > 0) {
                directLogs.forEach(log => {
                    if (log.status === 'present') present++;
                    else if (log.status === 'absent') absent++;
                    if (log.faculty_name && !info.faculty) {
                        info.faculty = log.faculty_name;
                    }
                });
                total = present + absent;
            }

            // Strictly slot-based: If no slot-based attendance posted, percentage is 0.0
            const pct = total > 0 ? (present / total) * 100 : 0.0;
            const scheduledDaysStr = Array.from(info.days).join(', ');
            const slotLabelsStr = Array.from(info.slotLabels).join(', ');

            statsMap.set(key, {
                name: info.name,
                code: info.code,
                slotsCount: info.slotsCount,
                daysStr: scheduledDaysStr,
                slotLabelsStr: slotLabelsStr,
                faculty: info.faculty || 'Department Faculty',
                present,
                absent,
                total,
                percentage: Number(pct).toFixed(1),
                status: pct >= 75 ? 'Compliant' : 'Shortage Alert'
            });
        });

        return statsMap;
    }, [timetableData, attendanceData, academicAttendanceSummary, periodWiseLogs]);

    const timetableSubjects = useMemo(() => {
        return Array.from(subjectAttendanceStatsMap.values());
    }, [subjectAttendanceStatsMap]);

    if (loading) {
        return (
            <div className="space-y-6 max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 pb-8 animate-pulse">
                <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-6 border border-slate-200 space-y-3">
                    <SkeletonBox height="h-8" width="w-64" className="rounded-xl" />
                    <SkeletonBox height="h-4" width="w-48" />
                </div>
                <div className="flex gap-2">
                    <SkeletonBox height="h-10" width="w-32" className="rounded-xl" />
                    <SkeletonBox height="h-10" width="w-32" className="rounded-xl" />
                    <SkeletonBox height="h-10" width="w-32" className="rounded-xl" />
                </div>
                <SkeletonBox height="h-96" className="w-full rounded-2xl" />
            </div>
        );
    }

    const TimetableCard = ({ entry, slot, day, isMobile = false, postedSlotLog = null, onClick }) => {
        const sName = String(slot?.slot_name || slot?.name || slot?.label || '').trim().toUpperCase();
        const sOrder = Number(slot?.sort_order ?? slot?.id ?? 0);
        const startTime = String(slot?.start_time || '');
        const isBreakSlot = 
            !entry && (
                sName === 'P3' || 
                sName === 'P6' || 
                sName.includes('P3') || 
                sName.includes('P6') || 
                sName.includes('BREAK') ||
                sOrder === 3 || 
                sOrder === 6 ||
                startTime.startsWith('10:50') ||
                startTime.startsWith('12:45')
            );

        const entryType = String(entry?.type || '').toLowerCase();
        const isLab = entryType === 'lab';
        const isBreak = entryType === 'break' || entryType === 'lunch' || isBreakSlot;
        const isOther = entryType === 'other';

        let badgeText = String(entry?.type || '').toUpperCase();
        if (!entry) {
            badgeText = isBreakSlot ? 'BREAK' : 'FREE SLOT';
        } else if (!badgeText || badgeText === 'SUBJECT' || badgeText === 'THEORY') {
            badgeText = 'THEORY';
        }

        let badgeStyle = 'bg-blue-50 text-blue-800 border-blue-200/80';
        let barColor = 'bg-blue-600';
        let periodBadgeStyle = 'bg-blue-100 text-blue-900 border-blue-300';
        let timeColor = 'text-blue-700';

        if (postedSlotLog) {
            if (postedSlotLog.status === 'present') {
                badgeText = `${badgeText} • PRESENT`;
                badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            } else if (postedSlotLog.status === 'absent') {
                badgeText = `${badgeText} • ABSENT`;
                badgeStyle = 'bg-rose-100 text-rose-800 border-rose-300';
            }
        } else if (isLab) {
            badgeStyle = 'bg-purple-50 text-purple-800 border-purple-200/80';
            barColor = 'bg-purple-600';
            periodBadgeStyle = 'bg-purple-100 text-purple-900 border-purple-300';
            timeColor = 'text-purple-700';
        } else if (isBreak) {
            badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200/80';
            barColor = 'bg-amber-500';
            periodBadgeStyle = 'bg-amber-100 text-amber-900 border-amber-300';
            timeColor = 'text-amber-800';
        } else if (isOther) {
            badgeStyle = 'bg-teal-50 text-teal-800 border-teal-200/80';
            barColor = 'bg-teal-600';
            periodBadgeStyle = 'bg-teal-100 text-teal-900 border-teal-300';
            timeColor = 'text-teal-700';
        } else if (!entry) {
            badgeStyle = 'bg-slate-100 text-slate-500 border-slate-200';
            barColor = 'bg-slate-300';
            periodBadgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
            timeColor = 'text-slate-500';
        }

        const titleText = entry
            ? (entry.subject_name || entry.custom_label || entry.title || entry.name || (entry.type ? `${entry.type}` : 'Subject Class'))
            : (isBreakSlot ? (sName.includes('P3') || sOrder === 3 ? 'Morning Break' : 'Lunch Break') : 'Free Period Slot');

        const codeOrLabel = entry?.subject_code || (entry?.subject_name ? entry?.custom_label : null) || slot?.slot_name || 'Class';
        const facultyName = postedSlotLog?.faculty_name || entry?.faculty_name || entry?.teacher_name || entry?.faculty || entry?.staff_name;

        // Mobile View Layout
        if (isMobile) {
            return (
                <div
                    onClick={() => onClick && entry && onClick(entry, slot, day)}
                    className={`w-full rounded-2xl border bg-white shadow-xs transition-all duration-200 group relative overflow-hidden p-3.5 space-y-2.5 ${entry ? 'hover:border-blue-500 hover:shadow-md cursor-pointer' : 'border-slate-200/90'} ${isBreakSlot ? 'bg-amber-50/30 border-amber-200/80' : ''}`}
                    title={entry ? 'Click to view teacher & subject attendance details' : undefined}
                >
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${barColor}`} />

                    {/* 1. Top Row: P1 badge on left, THEORY/LAB badge on right */}
                    <div className="flex items-center justify-between pl-1">
                        <span className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-lg border shadow-2xs ${periodBadgeStyle}`}>
                            {slot?.slot_name || 'P1'}
                        </span>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${badgeStyle}`}>
                            {badgeText}
                        </span>
                    </div>

                    {/* 2. Timing line below P1 */}
                    <div className="flex items-center gap-1.5 text-xs font-bold pl-1">
                        <Clock size={13} className={`${timeColor} shrink-0`} />
                        <span className="text-slate-600">
                            {formatTimeTo12h(slot?.start_time)} {slot?.end_time ? `- ${formatTimeTo12h(slot?.end_time)}` : ''}
                        </span>
                    </div>

                    {/* 3. Subject Name */}
                    <div className="pl-1">
                        <h4 className="font-extrabold text-blue-950 text-sm sm:text-base leading-snug tracking-tight group-hover:text-blue-700 transition-colors">
                            {titleText}
                        </h4>
                    </div>

                    {/* 4. Footer: Subject Faculty Name & Subject Code */}
                    {entry && (
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between pl-1 gap-2 text-xs min-w-0">
                            <div className="flex items-center gap-1.5 text-blue-950 font-extrabold min-w-0 flex-1" title={facultyName || 'Faculty'}>
                                <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">{facultyName || 'Department Faculty'}</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-500 font-bold text-xs bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/80 shrink-0">
                                <Info className="w-3 h-3 text-blue-600 shrink-0" />
                                <span>{codeOrLabel}</span>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // Desktop Grid Cell View
        if (!entry) {
            return (
                <div className={`h-full w-full rounded-xl border flex items-center justify-between min-h-[110px] ${isBreakSlot ? 'bg-amber-50/60 border-amber-200/90' : 'bg-slate-50/40 border-slate-200/80 border-dashed'} p-3`}>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${isBreakSlot ? 'bg-amber-100 text-amber-900 border-amber-300' : 'text-slate-400 border-transparent'}`}>
                            {isBreakSlot ? 'BREAK' : 'FREE SLOT'}
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div
                onClick={() => onClick && entry && onClick(entry, slot, day)}
                className="h-full w-full rounded-xl flex flex-col justify-between border border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-md transition-all duration-200 group relative overflow-hidden cursor-pointer p-3 min-h-[110px]"
                title="Click to view teacher & subject attendance details"
            >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${barColor}`} />

                <div className="flex-1 pl-1.5">
                    <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeStyle}`}>
                            {badgeText}
                        </span>
                    </div>
                    <h4 className="font-extrabold text-blue-950 text-xs leading-snug line-clamp-2 tracking-tight group-hover:text-blue-700 transition-colors">
                        {titleText}
                    </h4>
                </div>

                <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between pl-1.5 gap-1.5 min-w-0">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider shrink-0 max-w-[80px]">
                        <Info className="w-3 h-3 opacity-60 text-blue-600 shrink-0" />
                        <span className="truncate">{codeOrLabel}</span>
                    </div>
                    {facultyName && (
                        <div className="flex items-center gap-1 text-[9px] font-extrabold text-blue-900 min-w-0 flex-1 justify-end" title={facultyName}>
                            <UserCheck className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="truncate">{facultyName}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 pb-40 sm:pb-16 overflow-x-hidden">

            {/* ── Top Portal Header ── */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
                <div>
                    <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold !text-blue-900 heading-font">
                        Academic Timetable & Schedule
                    </h1>
                    <p className="text-[11px] sm:text-xs md:text-sm text-gray-500 font-semibold mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <BookOpen size={14} className="text-blue-600 shrink-0" />
                        <span>{user?.branch || 'Engineering'}</span>
                        <span className="text-slate-300">•</span>
                        <span>Year {selectedYear}</span>
                        <span className="text-slate-300">•</span>
                        <span>Semester {selectedSem}</span>
                    </p>
                </div>

                <div className="flex items-center justify-end sm:justify-start gap-2.5 sm:gap-3">
                    {/* Attendance Pill (Hidden on Mobile View as requested) */}
                    <div className="hidden sm:flex bg-white border border-slate-200 px-3.5 sm:px-4 py-2 rounded-xl shadow-xs items-center gap-2.5 sm:gap-3 shrink-0">
                        <div className="p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                            <Award size={18} />
                        </div>
                        <div>
                            <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider leading-none mb-1">Academic Attendance</p>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="text-sm sm:text-base font-extrabold text-blue-900 leading-none">{academicAttendanceSummary.percentage}%</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${academicAttendanceSummary.badgeBg}`}>
                                    {academicAttendanceSummary.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Refresh Button (Hidden on Mobile View) */}
                    <button
                        onClick={() => fetchTimetableAndSlots(true)}
                        disabled={refreshing}
                        className="hidden sm:flex p-2.5 sm:p-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-xs items-center justify-center shrink-0"
                        title="Refresh"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            {/* ── View Navigation Tabs (Optimized for Mobile) ── */}
            <div className="bg-gray-100/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl w-full sm:w-fit shrink-0 shadow-xs">
                <div className="grid grid-cols-3 sm:flex items-center gap-1 sm:gap-1.5">
                    <button
                        onClick={() => setActiveTab('grid')}
                        className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 text-center ${activeTab === 'grid'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                            }`}
                    >
                        <Calendar size={14} className="shrink-0 hidden sm:inline-block" />
                        <span className="sm:hidden">Timetable</span>
                        <span className="hidden sm:inline">Semester Timetable (Grid)</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('periodwise')}
                        className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 text-center ${activeTab === 'periodwise'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                            }`}
                    >
                        <Clock size={14} className="shrink-0 hidden sm:inline-block" />
                        <span className="sm:hidden">Period-wise</span>
                        <span className="hidden sm:inline">Period-wise Breakdown</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('academic')}
                        className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold transition-all duration-200 text-center ${activeTab === 'academic'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                            }`}
                    >
                        <TrendingUp size={14} className="shrink-0 hidden sm:inline-block" />
                        <span className="sm:hidden">Summary</span>
                        <span className="hidden sm:inline">Academic Summary</span>
                    </button>
                </div>
            </div>

            {/* ── TAB 1: SEMESTER TIMETABLE (GRID VIEW) ── */}
            {activeTab === 'grid' && (
                <div>
                    {/* Mobile View */}
                    <div className="md:hidden space-y-4 w-full overflow-x-hidden">
                        <div className="bg-white/95 backdrop-blur-md px-2 py-2 border border-slate-200 rounded-xl shadow-xs">
                            <div className="flex overflow-x-auto no-scrollbar gap-1.5 py-0.5">
                                {days.map((day) => (
                                    <button
                                        key={day}
                                        onClick={() => setActiveDay(day)}
                                        className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeDay === day
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 pt-1 w-full min-w-0">
                            {periodSlots.map((slot, index) => {
                                const entry = getMobileEntryForSlot(activeDay, index);
                                return (
                                    <TimetableCard
                                        key={slot.id}
                                        entry={entry}
                                        slot={slot}
                                        day={activeDay}
                                        isMobile
                                        onClick={(entry, slot, day) => setSelectedPeriodModal({ entry, slot, day })}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Desktop View (Tabular Grid) */}
                    <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {periodSlots.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-20 text-center">
                                <Calendar className="w-12 h-12 text-slate-300 mb-3" />
                                <h3 className="text-lg font-bold text-blue-900 mb-1">No Timetable Configured</h3>
                                <p className="text-slate-500 max-w-xs text-xs">
                                    Please contact your department HOD for the weekly schedule.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto no-scrollbar">
                                <div className="min-w-[1200px]">
                                    {/* Table Header Row */}
                                    <div className="flex border-b border-slate-200 bg-slate-50/80">
                                        <div className="w-24 flex-shrink-0 p-4 flex items-center justify-center border-r border-slate-200">
                                            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">SLOTS</span>
                                        </div>
                                        <div className="flex-1 flex">
                                            {periodSlots.map((slot) => (
                                                <div key={slot.id} className="flex-1 min-w-[120px] py-4 px-3 text-center border-r border-slate-200 last:border-r-0 flex flex-col justify-center">
                                                    <p className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider mb-1">{slot.slot_name}</p>
                                                    <p className="text-[10px] font-bold text-slate-600 flex items-center justify-center gap-1">
                                                        <Clock size={12} className="text-blue-600" />
                                                        {formatTimeTo12h(slot.start_time).replace(' AM', '').replace(' PM', '')} - {formatTimeTo12h(slot.end_time)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Table Body Rows */}
                                    <div className="divide-y divide-slate-200">
                                        {days.map((day) => (
                                            <div key={day} className={`flex transition-colors ${day === currentDayName ? 'bg-blue-50/20' : 'hover:bg-slate-50/40'}`}>
                                                <div className={`w-24 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-200 font-extrabold text-xs tracking-wider ${day === currentDayName ? 'text-blue-700 bg-blue-50/50' : 'text-slate-600 bg-slate-50/50'}`}>
                                                    {day}
                                                    {day === currentDayName && <div className="h-1.5 w-1.5 bg-blue-600 rounded-full mt-1.5 animate-pulse" />}
                                                </div>

                                                <div className="flex-1 flex">
                                                    {periodSlots.map((slot) => {
                                                        const entry = getEntryForSlot(day, slot);
                                                        return (
                                                            <div
                                                                key={slot.id}
                                                                className="flex-1 min-w-[120px] p-1.5 min-h-[110px] flex border-r border-slate-200 last:border-r-0"
                                                            >
                                                                <TimetableCard
                                                                    entry={entry}
                                                                    slot={slot}
                                                                    day={day}
                                                                    onClick={(entry, slot, day) => setSelectedPeriodModal({ entry, slot, day })}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 2: PERIOD-WISE BREAKDOWN ── */}
            {activeTab === 'periodwise' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                        <div>
                            <h3 className="text-sm sm:text-base font-extrabold text-blue-900 tracking-tight leading-snug">
                                Period-wise Timetable Breakdown
                            </h3>
                            <p className="hidden sm:block text-xs text-slate-500 font-medium mt-0.5">
                                Select a day to view period schedule and posted teacher attendance details.
                            </p>
                        </div>
                        <div className="flex overflow-x-auto no-scrollbar gap-1.5 py-0.5 w-full sm:w-auto">
                            {days.map((day) => (
                                <button
                                    key={day}
                                    onClick={() => setActiveDay(day)}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${activeDay === day
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {periodSlots.map((slot, index) => {
                            const entry = getEntryForSlot(activeDay, slot);

                            // Find posted attendance log for this period from ap_attendance_post_students
                            const postedSlotLog = periodWiseLogs.find(log => {
                                const logDay = normalizeDay(log.day_of_week);
                                const dayMatch = !logDay || logDay === normalizeDay(activeDay);
                                const slotMatch = Number(log.period_slot_id) === Number(slot.id) || Number(log.timing_slot_id) === Number(slot.id);
                                const codeMatch = entry?.subject_code && log.subject_code && log.subject_code.trim().toUpperCase() === entry.subject_code.trim().toUpperCase();
                                return dayMatch && (slotMatch || codeMatch);
                            });

                            return (
                                <TimetableCard
                                    key={slot.id}
                                    entry={entry}
                                    slot={slot}
                                    day={activeDay}
                                    isMobile
                                    postedSlotLog={postedSlotLog}
                                    onClick={(entry, slot, day) => entry && setSelectedPeriodModal({ entry, slot, day })}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── TAB 3: ACADEMIC SUMMARY ── */}
            {activeTab === 'academic' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                        <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] sm:text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-0.5 sm:mb-1 truncate">Total Attendance %</p>
                                <h3 className="text-base sm:text-xl font-extrabold text-blue-900">{academicAttendanceSummary.percentage}%</h3>
                                <p className="text-[10px] sm:text-xs font-semibold text-emerald-700 mt-0.5 truncate">Target: 75%</p>
                            </div>
                            <div className="p-2 sm:p-3 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl shrink-0">
                                <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                        </div>

                        <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] sm:text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-0.5 sm:mb-1 truncate">Present Days</p>
                                <h3 className="text-base sm:text-xl font-extrabold text-emerald-700">{academicAttendanceSummary.present} Days</h3>
                                <p className="text-[10px] sm:text-xs font-semibold text-slate-500 mt-0.5 truncate">Attended</p>
                            </div>
                            <div className="p-2 sm:p-3 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl shrink-0">
                                <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                        </div>

                        <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] sm:text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-0.5 sm:mb-1 truncate">Absent Days</p>
                                <h3 className="text-base sm:text-xl font-extrabold text-rose-600">{academicAttendanceSummary.absent} Days</h3>
                                <p className="text-[10px] sm:text-xs font-semibold text-slate-500 mt-0.5 truncate">Missed</p>
                            </div>
                            <div className="p-2 sm:p-3 bg-rose-50 text-rose-600 rounded-lg sm:rounded-xl shrink-0">
                                <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                        </div>

                        <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] sm:text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-0.5 sm:mb-1 truncate">Academic Status</p>
                                <h3 className="text-xs sm:text-base font-extrabold text-blue-900 truncate">{academicAttendanceSummary.status}</h3>
                                <p className="text-[10px] sm:text-xs font-semibold text-blue-600 mt-0.5 truncate">Exam Eligible</p>
                            </div>
                            <div className="p-2 sm:p-3 bg-purple-50 text-purple-600 rounded-lg sm:rounded-xl shrink-0">
                                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-extrabold text-blue-900 tracking-tight">Semester Subjects & Load</h3>
                                <p className="hidden sm:block text-xs text-slate-500 font-medium">Weekly subject schedule in Year {selectedYear} Sem {selectedSem} timetable.</p>
                            </div>
                            <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100 whitespace-nowrap shrink-0">
                                {timetableSubjects.length} Courses
                            </span>
                        </div>

                        {timetableSubjects.length === 0 ? (
                            <p className="text-slate-400 text-xs font-medium text-center py-6">No subjects listed in current timetable configuration.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {timetableSubjects.map((sub) => (
                                    <div key={sub.code} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition-all space-y-2.5">
                                        <div className="flex items-start justify-between">
                                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                {sub.code}
                                            </span>
                                            <span className="text-xs font-bold text-slate-500">
                                                {sub.slotsCount} Weekly Hours
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-blue-900 text-xs sm:text-sm">{sub.name}</h4>

                                        {sub.daysStr && (
                                            <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                                <Clock size={11} className="text-blue-600 shrink-0" />
                                                <span>Slots: {sub.daysStr} {sub.slotLabelsStr ? `(${sub.slotLabelsStr})` : ''}</span>
                                            </p>
                                        )}

                                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] gap-2">
                                            <span className="text-slate-600 font-bold flex items-center gap-1 min-w-0 flex-1 truncate" title={sub.faculty}>
                                                <UserCheck size={13} className="text-blue-600 shrink-0" />
                                                <span className="truncate">{sub.faculty}</span>
                                            </span>
                                            <span className="font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                                                {sub.percentage}% Attd
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── PERIOD DETAILS POPUP MODAL ── */}
            {selectedPeriodModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
                    onClick={() => setSelectedPeriodModal(null)}
                >
                    <div
                        className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 sm:space-y-5 transform transition-all scale-100 max-h-[80vh] sm:max-h-[90vh] overflow-y-auto no-scrollbar mb-16 sm:mb-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                                        {selectedPeriodModal.day} • {selectedPeriodModal.slot?.slot_name || 'Period'}
                                    </span>
                                    {selectedPeriodModal.slot?.start_time && (
                                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                            <Clock size={12} className="text-blue-600" />
                                            {formatTimeTo12h(selectedPeriodModal.slot.start_time)} - {formatTimeTo12h(selectedPeriodModal.slot.end_time)}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-extrabold text-blue-950 leading-snug">
                                    {selectedPeriodModal.entry?.subject_name || selectedPeriodModal.entry?.custom_label || selectedPeriodModal.entry?.title || 'Scheduled Period'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedPeriodModal(null)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>

                        {/* Content Details */}
                        <div className="space-y-4">
                            {(() => {
                                const subjKey = (selectedPeriodModal.entry?.subject_code || selectedPeriodModal.entry?.subject_name || selectedPeriodModal.entry?.custom_label || '').trim().toUpperCase();
                                const stats = subjectAttendanceStatsMap.get(subjKey) || {
                                    faculty: selectedPeriodModal.entry?.faculty_name || selectedPeriodModal.entry?.teacher_name || selectedPeriodModal.entry?.faculty || selectedPeriodModal.entry?.staff_name || 'Department Faculty',
                                    percentage: '0.0',
                                    status: 'Shortage Alert',
                                    present: 0,
                                    total: 0
                                };

                                return (
                                    <>
                                        {/* Faculty / Teacher Card */}
                                        <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100/80 flex items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
                                                <UserCheck size={22} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-extrabold uppercase text-blue-600 tracking-wider">Assigned Faculty / Teacher</p>
                                                <h4 className="text-sm font-extrabold text-blue-950 mt-0.5">
                                                    {stats.faculty}
                                                </h4>
                                            </div>
                                        </div>

                                        {/* Subject Attendance Info */}
                                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Award size={15} className="text-blue-600" />
                                                    Subject Attendance Status
                                                </span>
                                                <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${stats.status === 'Compliant' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                    {stats.status}
                                                </span>
                                            </div>

                                            <div className="flex items-baseline justify-between pt-1">
                                                <div>
                                                    <span className="text-2xl font-extrabold text-blue-950">{stats.percentage}%</span>
                                                    <span className="text-xs text-slate-500 font-medium ml-2">
                                                        {stats.total > 0 ? `${stats.present} / ${stats.total} Classes Attended` : 'Semester Performance'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                                                <div
                                                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.min(100, Math.max(0, Number(stats.percentage)))}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Period-wise Posted Attendance Log from ap_attendance_post_students */}
                                        {(() => {
                                            const postedLog = periodWiseLogs.find(log => {
                                                const logDay = normalizeDay(log.day_of_week);
                                                const dayMatch = !logDay || logDay === normalizeDay(selectedPeriodModal.day);
                                                const slotMatch = Number(log.period_slot_id) === Number(selectedPeriodModal.slot?.id) || Number(log.timing_slot_id) === Number(selectedPeriodModal.slot?.id);
                                                const codeMatch = selectedPeriodModal.entry?.subject_code && log.subject_code && log.subject_code.trim().toUpperCase() === selectedPeriodModal.entry.subject_code.trim().toUpperCase();
                                                return dayMatch && (slotMatch || codeMatch);
                                            });

                                            if (!postedLog) return null;

                                            return (
                                                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-extrabold uppercase text-amber-900 tracking-wider flex items-center gap-1">
                                                            <UserCheck size={12} className="text-amber-700" />
                                                            Teacher Posted Period Record
                                                        </span>
                                                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${postedLog.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                            {postedLog.status.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-extrabold text-blue-950">
                                                        Faculty: {postedLog.faculty_name || stats.faculty}
                                                    </p>
                                                    <p className="text-[11px] font-semibold text-slate-600">
                                                        Date: {postedLog.attendance_date} ({postedLog.start_time || ''} - {postedLog.end_time || ''})
                                                    </p>
                                                    {postedLog.remarks && (
                                                        <p className="text-[11px] italic text-slate-500">Remarks: {postedLog.remarks}</p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </>
                                );
                            })()}

                            {/* Additional Period Details */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <p className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Subject Code</p>
                                    <p className="font-extrabold text-blue-950 mt-0.5">{selectedPeriodModal.entry?.subject_code || 'N/A'}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <p className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Classroom / Venue</p>
                                    <p className="font-extrabold text-blue-950 mt-0.5">{selectedPeriodModal.entry?.room_no || selectedPeriodModal.entry?.location || 'Dept Classroom'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <button
                            onClick={() => setSelectedPeriodModal(null)}
                            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-xs"
                        >
                            Close Details
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentTimetable;

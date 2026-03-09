import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Calendar, ChevronLeft, ChevronRight, BookOpen, MapPin, AlertCircle, Info } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import { toast } from 'react-hot-toast';

const StudentTimetable = () => {
    const { user } = useAuthStore();
    const [timetableData, setTimetableData] = useState([]);
    const [periodSlots, setPeriodSlots] = useState([]);
    const [loading, setLoading] = useState(true);

    const days = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

    // Get current day index for default active tab (0 = Sun, 1 = Mon...)
    const today = new Date().getDay();
    const defaultDay = today >= 1 && today <= 6 ? days[today - 1] : 'MON';
    const [activeDay, setActiveDay] = useState(defaultDay);

    useEffect(() => {
        const fetchData = async () => {
            if (!user?.college_id || !user?.branch_id) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const slotsRes = await api.get('/period-slots', { params: { college_id: user.college_id } });
                if (slotsRes.data.success) {
                    setPeriodSlots(slotsRes.data.data);
                }

                const timetableRes = await api.get('/timetable', {
                    params: {
                        branch_id: user.branch_id,
                        year: user.current_year,
                        semester: user.current_semester || 1
                    }
                });
                if (timetableRes.data.success) {
                    setTimetableData(timetableRes.data.data);
                }
            } catch (error) {
                console.error('Failed to fetch timetable:', error);
                toast.error('Failed to load timetable');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const formatTimeTo12h = (timeStr) => {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const m = minutes;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        return `${h}:${m} ${ampm}`;
    };

    const getEntryForSlot = (day, slotId) => {
        return timetableData.find(item => item.day_of_week === day && item.period_slot_id === slotId);
    };

    /**
     * For mobile: determine if a slot is "covered" by a merged entry starting earlier
     */
    const getMobileEntryForSlot = (day, slotIndex) => {
        // First check if an entry starts at this exact slot
        const exactEntry = getEntryForSlot(day, periodSlots[slotIndex]?.id);
        if (exactEntry) return { ...exactEntry, isStart: true };

        // Check if any previous entry on this day covers this slot
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

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="text-slate-500 font-medium">Loading your schedule...</p>
            </div>
        );
    }

    const TimetableCard = ({ entry, span, isMobile = false }) => {
        if (!entry) {
            return (
                <div className={`h-full w-full rounded-2xl border border-dashed border-slate-100 flex items-center justify-center transition-colors group-hover:border-slate-200 ${isMobile ? 'py-6 px-4' : ''}`}>
                    <span className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">Free Slot</span>
                </div>
            );
        }

        // Special state for mobile "covered" slots
        if (isMobile && entry.isCovered) {
            return (
                <div className="h-full w-full rounded-2xl border border-dashed bg-slate-50/50 border-slate-200 p-3 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-1 opacity-40">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Continuing</span>
                        <p className="text-[9px] font-bold text-slate-500 text-center line-clamp-1 italic">{entry.type === 'subject' ? entry.subject_name : entry.custom_label}</p>
                    </div>
                </div>
            );
        }

        const isLab = entry.type === 'lab';
        const isBreak = entry.type === 'break' || entry.type === 'Lunch';

        let accentColor = 'bg-indigo-600';
        let lightBg = 'bg-indigo-50/30';
        let textColor = 'text-indigo-600';
        let tagColor = 'bg-indigo-100 text-indigo-700';

        if (isLab) {
            accentColor = 'bg-purple-600';
            lightBg = 'bg-purple-50/30';
            textColor = 'text-purple-600';
            tagColor = 'bg-purple-100 text-purple-700';
        } else if (isBreak) {
            accentColor = 'bg-amber-500';
            lightBg = 'bg-amber-50/30';
            textColor = 'text-amber-600';
            tagColor = 'bg-amber-100 text-amber-700';
        } else if (entry.type === 'Other' || entry.type === 'other') {
            accentColor = 'bg-cyan-500';
            lightBg = 'bg-cyan-50/30';
            textColor = 'text-cyan-600';
            tagColor = 'bg-cyan-100 text-cyan-700';
        }

        return (
            <div className={`h-full w-full rounded-[1.8rem] p-4 flex flex-col border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:-translate-y-1.5 hover:scale-[1.01] cursor-pointer transition-all duration-500 group relative overflow-hidden bg-white`}>
                <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                <div className={`absolute top-0 right-0 w-20 h-20 ${lightBg} rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-150 transition-transform duration-700`}></div>

                <div className="flex-1 relative z-10">
                    <div className="flex items-start justify-between mb-3">
                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg ${tagColor} shadow-sm backdrop-blur-md border border-white/50`}>
                            {entry.type}
                        </span>
                        {span > 1 && !isMobile && (
                            <span className="text-[8px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg shadow-sm uppercase tracking-widest">
                                {span} Periods
                            </span>
                        )}
                    </div>
                    <h4 className={`font-black ${textColor} text-[13px] leading-tight line-clamp-2 group-hover:text-slate-900 transition-colors tracking-tight`}>
                        {entry.type === 'subject' ? entry.subject_name : entry.custom_label}
                    </h4>
                </div>
                {(entry.subject_code || (isMobile && span > 1)) && (
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between relative z-10">
                        {entry.subject_code && (
                            <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <Info className="w-3 h-3 opacity-40" />
                                {entry.subject_code}
                            </div>
                        )}
                        {isMobile && span > 1 && entry.isStart && (
                            <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest italic">
                                Extended
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            {/* Header Section */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 mb-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] overflow-hidden relative">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-50/40 rounded-full -mr-40 -mt-40 blur-3xl pointer-events-none" />
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-10 h-1 bg-indigo-600 rounded-full" />
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Weekly Schedule</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-1 tracking-tight">Academic Timetable</h1>
                        <p className="text-slate-500 text-sm md:text-base flex items-center gap-2 font-semibold">
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            {user.branch} <span className="text-slate-300 mx-1">/</span> Year {user.current_year} Sem {user.current_semester || 1}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-50/60 backdrop-blur-md px-5 py-3.5 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="w-11 h-11 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shadow-sm">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Date</p>
                            <p className="text-sm font-bold text-slate-900 leading-none">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
                <div className="sticky top-0 z-20 bg-[#f8fafc]/80 backdrop-blur-xl -mx-4 px-4 py-3 border-b border-slate-100/50">
                    <div className="flex overflow-x-auto no-scrollbar gap-2">
                        {days.map((day) => (
                            <button
                                key={day}
                                onClick={() => setActiveDay(day)}
                                className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-widest transition-all duration-300 ${activeDay === day
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-[1.02]'
                                    : 'bg-white text-slate-400 border border-slate-200/50'
                                    }`}
                            >
                                {day}
                                {day === currentDayName && <div className="h-1 w-3 bg-current mx-auto mt-0.5 rounded-full opacity-50" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4 pt-2">
                    {periodSlots.map((slot, index) => {
                        const entry = getMobileEntryForSlot(activeDay, index);
                        return (
                            <div key={slot.id} className="flex gap-4 group">
                                <div className="w-20 pt-2 flex-shrink-0 text-right">
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">{slot.slot_name}</p>
                                    <p className="text-[10px] font-black text-slate-600 bg-slate-100/50 py-1 px-2 rounded-lg inline-block whitespace-nowrap">
                                        {formatTimeTo12h(slot.start_time)}
                                    </p>
                                </div>
                                <div className="flex-1 min-h-[90px]">
                                    <TimetableCard entry={entry} isMobile />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Desktop View (Tabular Grid) */}
            <div className="hidden md:block bg-white rounded-[3rem] border border-slate-200 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.06)] overflow-hidden">
                {periodSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-32 text-center">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                            <Calendar className="w-12 h-12 text-slate-200" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">No Timetable Configured</h3>
                        <p className="text-slate-400 max-w-xs mx-auto text-sm font-semibold">
                            Please contact your department for the weekly schedule.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto no-scrollbar">
                        <div className="min-w-[1250px]">
                            {/* Header row */}
                            <div className="flex border-b border-slate-100 bg-slate-50/40">
                                <div className="w-24 flex-shrink-0 p-6 flex items-center justify-center border-r border-slate-100 bg-slate-50/20">
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">SLOTS</span>
                                </div>
                                <div className="flex-1 flex">
                                    {periodSlots.map((slot) => (
                                        <div key={slot.id} className="flex-1 min-w-[130px] h-[85px] py-5 px-4 text-center border-r border-slate-100 last:border-r-0 flex flex-col justify-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">{slot.slot_name}</p>
                                            <p className="text-[10px] font-black text-slate-900 flex items-center justify-center gap-1.5 opacity-80">
                                                <Clock className="w-3 h-3 text-indigo-500 opacity-60" />
                                                {formatTimeTo12h(slot.start_time).replace(' AM', '').replace(' PM', '')} - {formatTimeTo12h(slot.end_time)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Body Rows */}
                            <div className="divide-y divide-slate-100">
                                {days.map((day) => (
                                    <div key={day} className={`flex transition-all duration-300 ${day === currentDayName ? 'bg-indigo-50/10' : 'hover:bg-slate-50/20'}`}>
                                        <div className={`w-24 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 font-black text-[13px] tracking-tight ${day === currentDayName ? 'text-indigo-600 bg-indigo-50/20' : 'text-slate-400'}`}>
                                            {day}
                                            {day === currentDayName && <div className="h-1.5 w-1.5 bg-indigo-600 rounded-full mt-2 ring-4 ring-indigo-50 animate-pulse" />}
                                        </div>

                                        <div className="flex-1 flex">
                                            {(() => {
                                                let skipCount = 0;
                                                return periodSlots.map((slot) => {
                                                    if (skipCount > 0) {
                                                        skipCount--;
                                                        return null;
                                                    }

                                                    const entry = getEntryForSlot(day, slot.id);
                                                    const span = entry?.span || 1;
                                                    if (span > 1) skipCount = span - 1;

                                                    return (
                                                        <div
                                                            key={slot.id}
                                                            className={`p-2 min-h-[110px] flex border-r border-slate-100 last:border-r-0`}
                                                            style={{ flex: span }}
                                                        >
                                                            <TimetableCard entry={entry} span={span} />
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Information Cards */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 p-5 rounded-[2rem] flex gap-4 transition-all hover:border-indigo-200 group shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                        <Info className="w-6 h-6" />
                    </div>
                    <div>
                        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Merged Time Slots</h5>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                            Extended cards indicate sessions like Labs that cover multiple periods. Timing is reflected in the top bar.
                        </p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-[2rem] flex gap-4 transition-all hover:border-amber-200 group shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Schedule Queries</h5>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                            For any discrepancies or missed classes, please consult your department's HOD or academic coordinator.
                        </p>
                    </div>
                </div>

                <div className="hidden lg:flex bg-indigo-600 p-5 rounded-[2.2rem] text-white flex gap-4 shadow-md transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                        <h5 className="text-[11px] font-black text-white/60 uppercase tracking-widest mb-1.5">Academic Compliance</h5>
                        <p className="text-xs text-white/90 leading-relaxed font-semibold">
                            Maintain 100% attendance by strictly following the weekly timetable for all sessions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default StudentTimetable;

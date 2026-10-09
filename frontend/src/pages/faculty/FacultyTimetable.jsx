import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Calendar, BookOpen, AlertCircle, Info, MapPin } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import { toast } from 'react-hot-toast';

const FacultyTimetable = () => {
    const { user } = useAuthStore();
    const [timetableData, setTimetableData] = useState([]);
    const [periodSlots, setPeriodSlots] = useState([]);
    const [loading, setLoading] = useState(true);

    const days = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

    const normalizeSlotTimings = (rawSlots) => {
        if (!Array.isArray(rawSlots)) return [];
        return rawSlots.map(slot => {
            const sName = String(slot.slot_name || slot.name || slot.label || '').trim().toUpperCase();
            const sOrder = Number(slot.sort_order ?? slot.id ?? 0);

            let updatedSlot = { ...slot };

            if (sName === 'P3' || sName.includes('P3') || sOrder === 3) {
                updatedSlot.start_time = '10:55:00';
                updatedSlot.end_time = '11:05:00';
            } else if (sName === 'P4' || sName.includes('P4') || sOrder === 4) {
                updatedSlot.start_time = '11:05:00';
                updatedSlot.end_time = '12:45:00';
            } else if (sName === 'P6' || sName.includes('P6') || sOrder === 6) {
                updatedSlot.start_time = '12:45:00';
                updatedSlot.end_time = '13:45:00';
            } else if (sName === 'P7' || sName.includes('P7') || sOrder === 7) {
                updatedSlot.start_time = '13:45:00';
                updatedSlot.end_time = '14:35:00';
            }

            return updatedSlot;
        });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Step 1: Get period slots for the faculty's college
                const slotsRes = await api.get('/period-slots', { params: { college_id: user.college_id } });
                if (slotsRes.data.success) {
                    setPeriodSlots(normalizeSlotTimings(slotsRes.data.data));
                }

                // Step 2: Get timetable data for this specific faculty
                const timetableRes = await api.get('/timetable', {
                    params: {
                        faculty_id: user.id
                    }
                });
                if (timetableRes.data.success) {
                    setTimetableData(timetableRes.data.data);
                }
            } catch (error) {
                console.error('Failed to fetch faculty timetable:', error);
                toast.error('Failed to load your timetable');
            } finally {
                setLoading(false);
            }
        };

        if (user?.id) {
            fetchData();
        }
    }, [user]);

    const getEntriesForSlot = (day, slotId) => {
        return timetableData.filter(item => item.day_of_week === day && item.period_slot_id === slotId);
    };

    const currentDay = useMemo(() => {
        const d = new Date().getDay();
        const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];
        return dayMap[d];
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                <p className="text-slate-500 font-medium">Loading your teaching schedule...</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            {/* Header section */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 mb-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">My Teaching Schedule</h1>
                        <p className="text-slate-500 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            Weekly timetable for all your assigned subjects
                        </p>
                    </div>
                    <div className="flex items-center gap-4 bg-teal-50 px-6 py-4 rounded-2xl border border-teal-100/50">
                        <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-100">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest leading-none mb-1">Current Day</p>
                            <p className="text-lg font-bold text-teal-900 leading-none">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Timetable Grid Container */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <div className="min-w-[1000px]">
                        {/* Grid Header */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            <div className="w-24 flex-shrink-0 p-6 flex items-center justify-center border-r border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">DAY</span>
                            </div>
                            <div className="flex-1 flex">
                                {periodSlots.map((slot) => (
                                    <div key={slot.id} className="flex-1 min-w-[120px] p-6 text-center border-r border-slate-100 last:border-r-0">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{slot.slot_name}</p>
                                        <p className="text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-teal-500" />
                                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Grid Body */}
                        <div className="divide-y divide-slate-100">
                            {days.map((day) => (
                                <div key={day} className={`flex group transition-colors ${day === currentDay ? 'bg-teal-50/30' : 'hover:bg-slate-50/50'}`}>
                                    {/* Day Label */}
                                    <div className={`w-24 flex-shrink-0 p-6 flex items-center justify-center border-r border-slate-100 font-black text-sm tracking-tighter ${day === currentDay ? 'text-teal-600' : 'text-slate-400'}`}>
                                        {day === currentDay && <div className="absolute left-0 w-1 h-12 bg-teal-600 rounded-r-full" />}
                                        {day}
                                    </div>

                                    {/* Slots */}
                                    <div className="flex-1 flex min-w-0">
                                        {periodSlots.map((slot) => {
                                            const entries = getEntriesForSlot(day, slot.id);

                                            return (
                                                <div
                                                    key={slot.id}
                                                    className="flex-1 min-w-[140px] p-2 border-r border-slate-100 last:border-r-0 min-h-[110px]"
                                                >
                                                    {entries.length > 0 ? (
                                                        <div className="flex flex-col gap-2">
                                                            {entries.map(entry => (
                                                                <div key={entry.id} className={`rounded-xl p-3 border shadow-sm ${entry.type === 'subject' ? 'bg-white border-slate-200' :
                                                                        entry.type === 'lab' ? 'bg-purple-50 border-purple-100' :
                                                                            'bg-amber-50 border-amber-100'
                                                                    }`}>
                                                                    <div className="flex items-start justify-between mb-1">
                                                                        <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${entry.type === 'subject' ? 'bg-teal-100 text-teal-700' :
                                                                                entry.type === 'lab' ? 'bg-purple-100 text-purple-700' :
                                                                                    'bg-amber-100 text-amber-700'
                                                                            }`}>
                                                                            {entry.type}
                                                                        </span>
                                                                    </div>
                                                                    <h4 className="font-bold text-slate-800 text-[11px] leading-tight mb-1">
                                                                        {entry.type === 'subject' ? entry.subject_name : entry.custom_label}
                                                                    </h4>
                                                                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        {entry.branch_name}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="h-full rounded-2xl border border-dashed border-slate-100 flex items-center justify-center opacity-40">
                                                            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">Free</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Tip */}
            <div className="mt-8 bg-teal-50/50 border border-teal-100 p-6 rounded-[2rem] flex gap-4">
                <Info className="w-6 h-6 text-teal-500 shrink-0" />
                <div>
                    <h4 className="font-bold text-teal-900 text-sm mb-1">About Your Schedule</h4>
                    <p className="text-xs text-teal-700 leading-relaxed font-medium">
                        This schedule is generated based on the class timetables created by the respective Branch HODs. If there are any discrepancies or missing slots, please coordinate with your HOD to update the central timetable.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default FacultyTimetable;

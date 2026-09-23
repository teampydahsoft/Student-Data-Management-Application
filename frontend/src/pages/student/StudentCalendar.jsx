import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Clock,
    CalendarCheck,
    MapPin,
    AlertCircle,
    X,
    Filter,
    Layers,
    BookOpen,
    Award,
    Sparkles,
    Sun,
    Tag,
    Search,
    ChevronRight as ArrowRightIcon,
    CalendarDays
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { SkeletonBox } from '../../components/SkeletonLoader';

const EVENT_TYPES = [
    { key: 'all', label: 'All Events', icon: Layers, badgeBg: 'bg-gray-900 text-white', activeTab: 'bg-gray-900 text-white shadow-md' },
    { key: 'academic', label: 'Academic', icon: BookOpen, badgeBg: 'bg-blue-100 text-blue-800 border-blue-200', activeTab: 'bg-blue-600 text-white shadow-md' },
    { key: 'exam', label: 'Exams', icon: Award, badgeBg: 'bg-amber-100 text-amber-800 border-amber-200', activeTab: 'bg-amber-500 text-white shadow-md' },
    { key: 'holiday', label: 'Holidays', icon: Sun, badgeBg: 'bg-rose-100 text-rose-800 border-rose-200', activeTab: 'bg-rose-600 text-white shadow-md' },
    { key: 'event', label: 'Events', icon: Sparkles, badgeBg: 'bg-purple-100 text-purple-800 border-purple-200', activeTab: 'bg-purple-600 text-white shadow-md' },
    { key: 'other', label: 'Other', icon: Tag, badgeBg: 'bg-gray-100 text-gray-700 border-gray-200', activeTab: 'bg-gray-700 text-white shadow-md' }
];

const parseLocalDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        const [y, m, day] = dateVal.split('-').map(n => parseInt(n, 10));
        return new Date(y, m - 1, day);
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const cleanEventDescription = (desc) => {
    if (!desc) return '';
    return String(desc).replace(/\[.*?\]\s*/g, '').trim();
};

const StudentCalendar = () => {
    const location = useLocation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedType, setSelectedType] = useState('all');

    const [calendarDays, setCalendarDays] = useState([]);
    const [showEventModal, setShowEventModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);

    // Day View Modal for date cells with many events (+X more)
    const [showDayModal, setShowDayModal] = useState(false);
    const [selectedDayInfo, setSelectedDayInfo] = useState(null);
    const [daySearchQuery, setDaySearchQuery] = useState('');

    useEffect(() => {
        if (location.state?.initialDate) {
            setCurrentDate(new Date(location.state.initialDate));
        }
        fetchEvents();
    }, [location.state]);

    useEffect(() => {
        generateCalendar(currentDate, events, selectedType);
    }, [currentDate, events, selectedType]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await api.get('/events/student');
            if (response.data.success) {
                setEvents(response.data.data || []);
            }
        } catch (error) {
            console.error('Failed to load events:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateCalendar = (date, allEvents, activeType) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const filteredEvents = activeType === 'all'
            ? allEvents
            : allEvents.filter(e => (e.event_type || 'other').toLowerCase() === activeType);

        const days = [];
        for (let i = 0; i < startingDay; i++) {
            days.push({ day: null });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDayDate = new Date(year, month, i);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

            const dayEvents = filteredEvents.filter(e => {
                const eventStart = parseLocalDate(e.event_date);
                const eventEnd = e.end_date ? parseLocalDate(e.end_date) : eventStart;

                if (!eventStart) return false;
                return currentDayDate >= eventStart && currentDayDate <= (eventEnd || eventStart);
            });

            days.push({ day: i, date: dateStr, dateObj: currentDayDate, events: dayEvents });
        }
        setCalendarDays(days);
    };

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const getEventTypeStyle = (type) => {
        switch (type?.toLowerCase()) {
            case 'holiday':
                return {
                    badge: 'bg-rose-100 text-rose-700 border-rose-200',
                    pill: 'bg-rose-50/90 text-rose-700 border-rose-200 hover:bg-rose-100 hover:shadow-xs',
                    bar: 'bg-rose-500',
                    gradient: 'from-rose-600 via-pink-600 to-red-600'
                };
            case 'exam':
                return {
                    badge: 'bg-amber-100 text-amber-800 border-amber-200',
                    pill: 'bg-amber-50/90 text-amber-900 border-amber-200 hover:bg-amber-100 hover:shadow-xs',
                    bar: 'bg-amber-500',
                    gradient: 'from-amber-500 via-orange-500 to-amber-600'
                };
            case 'academic':
                return {
                    badge: 'bg-blue-100 text-blue-700 border-blue-200',
                    pill: 'bg-blue-50/90 text-blue-800 border-blue-200 hover:bg-blue-100 hover:shadow-xs',
                    bar: 'bg-blue-500',
                    gradient: 'from-blue-600 via-indigo-600 to-blue-700'
                };
            case 'event':
                return {
                    badge: 'bg-purple-100 text-purple-700 border-purple-200',
                    pill: 'bg-purple-50/90 text-purple-800 border-purple-200 hover:bg-purple-100 hover:shadow-xs',
                    bar: 'bg-purple-500',
                    gradient: 'from-purple-600 via-violet-600 to-fuchsia-600'
                };
            default:
                return {
                    badge: 'bg-gray-100 text-gray-700 border-gray-200',
                    pill: 'bg-gray-50/90 text-gray-800 border-gray-200 hover:bg-gray-100 hover:shadow-xs',
                    bar: 'bg-gray-500',
                    gradient: 'from-slate-700 via-gray-700 to-zinc-800'
                };
        }
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${h}:${minutes} ${ampm}`;
    };

    const formatDateRange = (eventDate, endDate) => {
        if (!eventDate) return '';
        const start = parseLocalDate(eventDate);
        const end = endDate ? parseLocalDate(endDate) : null;
        const options = { month: 'short', day: 'numeric', year: 'numeric' };

        if (!end || start.getTime() === end.getTime()) {
            return start.toLocaleDateString('en-US', options);
        }
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', options)}`;
    };

    // Events that fall within or overlap with the currently selected month
    const currentMonthEvents = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

        return events.filter(e => {
            const eventStart = parseLocalDate(e.event_date);
            const eventEnd = e.end_date ? parseLocalDate(e.end_date) : eventStart;
            if (!eventStart) return false;
            const end = eventEnd || eventStart;
            return eventStart <= lastDayOfMonth && end >= firstDayOfMonth;
        });
    }, [events, currentDate]);

    const getTypeCount = (typeKey) => {
        if (typeKey === 'all') return currentMonthEvents.length;
        return currentMonthEvents.filter(e => (e.event_type || 'other').toLowerCase() === typeKey).length;
    };

    const monthEvents = useMemo(() => {
        const filtered = selectedType === 'all'
            ? currentMonthEvents
            : currentMonthEvents.filter(e => (e.event_type || 'other').toLowerCase() === selectedType);

        return filtered.sort((a, b) => parseLocalDate(a.event_date) - parseLocalDate(b.event_date));
    }, [currentMonthEvents, selectedType]);

    const filteredDayEvents = useMemo(() => {
        if (!selectedDayInfo?.events) return [];
        if (!daySearchQuery.trim()) return selectedDayInfo.events;
        const query = daySearchQuery.toLowerCase();
        return selectedDayInfo.events.filter(e =>
            (e.title || '').toLowerCase().includes(query) ||
            (e.description || '').toLowerCase().includes(query) ||
            (e.event_type || '').toLowerCase().includes(query)
        );
    }, [selectedDayInfo, daySearchQuery]);

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 space-y-6 animate-fade-in text-gray-800">
            {loading ? (
                <div className="animate-pulse space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="space-y-2">
                            <SkeletonBox height="h-8" width="w-64" />
                            <SkeletonBox height="h-4" width="w-48" />
                        </div>
                        <SkeletonBox height="h-10" width="w-80" className="rounded-lg" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 h-[600px] p-4">
                            <SkeletonBox height="h-full" width="w-full" />
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5 h-96">
                            <SkeletonBox height="h-6" width="w-32" className="mb-4" />
                            <div className="space-y-4">
                                <SkeletonBox height="h-20" width="w-full" className="rounded-lg" />
                                <SkeletonBox height="h-20" width="w-full" className="rounded-lg" />
                                <SkeletonBox height="h-20" width="w-full" className="rounded-lg" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 heading-font flex items-center gap-2.5">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                                    <CalendarIcon size={24} />
                                </div>
                                Academic Calendar
                            </h1>
                            <p className="text-gray-500 text-sm mt-1">View schedules, exam timetables, holidays, and college events.</p>
                        </div>

                        {/* Controls Container: Month Navigator & Type Dropdown strictly INLINE on 1 row */}
                        <div className="flex flex-row items-center gap-2 w-full lg:w-auto">
                            {/* Month Navigator */}
                            <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200 shadow-xs flex-1 sm:flex-initial justify-between">
                                <button
                                    onClick={handlePrevMonth}
                                    className="p-1.5 hover:bg-white hover:shadow-xs rounded-lg transition-all text-gray-700 active:scale-95 shrink-0"
                                    title="Previous Month"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="font-bold text-center select-none text-gray-900 text-xs md:text-sm px-1 truncate min-w-0">
                                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    onClick={handleNextMonth}
                                    className="p-1.5 hover:bg-white hover:shadow-xs rounded-lg transition-all text-gray-700 active:scale-95 shrink-0"
                                    title="Next Month"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Type Dropdown strictly inline right beside Month Selector */}
                            <div className="relative flex-1 sm:w-48 min-w-0">
                                <select
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                    className="w-full appearance-none bg-slate-100/80 border border-slate-200 text-gray-900 font-bold text-xs md:text-sm rounded-xl px-2.5 py-2 pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-xs hover:bg-white truncate"
                                >
                                    {EVENT_TYPES.map(type => (
                                        <option key={type.key} value={type.key}>
                                            {type.label} ({getTypeCount(type.key)})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            </div>
                        </div>
                    </div>




                    {/* Main Content Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                        {/* Calendar Grid Container */}
                        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden flex flex-col">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 bg-slate-100/70 border-b border-slate-200">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-600">{d}</div>
                                ))}
                            </div>

                            {/* Date Cells */}
                            <div className="grid grid-cols-7 auto-rows-fr bg-slate-200/40 gap-[1px]">
                                {calendarDays.map((item, idx) => {
                                    const isToday = item.date === new Date().toISOString().split('T')[0];
                                    const maxVisibleEvents = 2;
                                    const hasMoreEvents = item.events && item.events.length > maxVisibleEvents;
                                    const visibleEvents = item.events ? item.events.slice(0, maxVisibleEvents) : [];

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                if (item.day && item.events && item.events.length > 0) {
                                                    setSelectedDayInfo({
                                                        date: item.date,
                                                        day: item.day,
                                                        events: item.events,
                                                        dateObj: item.dateObj
                                                    });
                                                    setDaySearchQuery('');
                                                    setShowDayModal(true);
                                                }
                                            }}
                                            className={`min-h-[110px] md:min-h-[125px] max-h-[160px] p-1.5 md:p-2 bg-white relative transition-all duration-150 flex flex-col justify-between ${
                                                !item.day
                                                    ? 'bg-slate-50/60 opacity-60 pointer-events-none'
                                                    : 'hover:bg-blue-50/30 cursor-pointer group'
                                            } ${isToday ? 'bg-blue-50/20 ring-2 ring-blue-500 ring-inset z-10' : ''}`}
                                        >
                                            {item.day && (
                                                <>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-xs md:text-sm font-bold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full transition-colors ${
                                                            isToday
                                                                ? 'bg-blue-600 text-white shadow-xs'
                                                                : 'text-gray-700 group-hover:text-blue-600'
                                                        }`}>
                                                            {item.day}
                                                        </span>

                                                        {item.events && item.events.length > 0 && (
                                                            <span className="text-[10px] font-semibold text-slate-400 group-hover:text-blue-600">
                                                                {item.events.length} {item.events.length === 1 ? 'event' : 'events'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Event Pills List (Max 2 visible to keep cells clean and aligned) */}
                                                    <div className="space-y-1 overflow-hidden flex-1">
                                                        {visibleEvents.map(ev => {
                                                            const typeStyle = getEventTypeStyle(ev.event_type);
                                                            return (
                                                                <div
                                                                    key={ev.id}
                                                                    title={`${ev.title} (${ev.event_type})`}
                                                                    className={`text-[10px] md:text-xs px-1.5 py-1 rounded-md border flex items-center gap-1 cursor-pointer transition-all ${typeStyle.pill}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedEvent(ev);
                                                                        setShowEventModal(true);
                                                                    }}
                                                                >
                                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeStyle.bar}`}></span>
                                                                    <span className="truncate font-semibold text-gray-900 block flex-1">{ev.title}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* "+ X More" Button */}
                                                    {hasMoreEvents && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDayInfo({
                                                                    date: item.date,
                                                                    day: item.day,
                                                                    events: item.events,
                                                                    dateObj: item.dateObj
                                                                });
                                                                setDaySearchQuery('');
                                                                setShowDayModal(true);
                                                            }}
                                                            className="w-full text-[10px] font-bold py-1 px-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-colors flex items-center justify-between mt-1"
                                                        >
                                                            <span>+{item.events.length - maxVisibleEvents} more</span>
                                                            <ArrowRightIcon size={10} />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sidebar: Legend & Upcoming Events */}
                        <div className="space-y-6">

                            {/* Type Legend Summary */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
                                <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                                    <Tag size={16} className="text-blue-600" /> Event Legend
                                </h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    {EVENT_TYPES.filter(t => t.key !== 'all').map(t => {
                                        const style = getEventTypeStyle(t.key);
                                        const count = getTypeCount(t.key);
                                        return (
                                            <div
                                                key={t.key}
                                                onClick={() => setSelectedType(t.key)}
                                                className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                                                    selectedType === t.key ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className={`w-2.5 h-2.5 rounded-full ${style.bar}`}></span>
                                                <span className="font-medium text-gray-800 truncate flex-1">{t.label}</span>
                                                <span className="font-bold text-[10px] text-gray-500">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Events List for Selected Month */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                                        <CalendarCheck size={16} className="text-blue-600" /> Events ({currentDate.toLocaleString('default', { month: 'short' })})
                                    </h3>
                                    <span className="text-xs font-bold text-gray-400">({monthEvents.length})</span>
                                </div>

                                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                                    {monthEvents.map(ev => {
                                        const style = getEventTypeStyle(ev.event_type);
                                        return (
                                            <div
                                                key={ev.id}
                                                className="p-3.5 rounded-xl border bg-slate-50/70 border-slate-200 hover:bg-white hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-pointer group relative overflow-hidden"
                                                onClick={() => {
                                                    setSelectedEvent(ev);
                                                    setShowEventModal(true);
                                                }}
                                            >
                                                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.bar}`}></div>
                                                <div className="pl-2.5">
                                                    <div className="flex justify-between items-start gap-2 mb-1">
                                                        <h4 className="font-bold text-sm text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                                            {ev.title}
                                                        </h4>
                                                        <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-extrabold tracking-wider border shrink-0 ${style.badge}`}>
                                                            {ev.event_type || 'other'}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                                        <CalendarCheck size={13} className="text-slate-400" />
                                                        <span>{formatDateRange(ev.event_date, ev.end_date)}</span>
                                                    </div>

                                                    {ev.start_time && (
                                                        <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-1">
                                                            <Clock size={12} className="text-slate-400" />
                                                            <span>{formatTime(ev.start_time)} {ev.end_time ? `– ${formatTime(ev.end_time)}` : ''}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {monthEvents.length === 0 && (
                                        <div className="text-center py-8 text-gray-400 space-y-2">
                                            <CalendarDays size={32} className="mx-auto text-gray-300" />
                                            <p className="text-sm font-medium">No events found in {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* DAY EVENTS OVERVIEW MODAL (Triggered when user clicks "+X more" or a day cell) */}
                    {showDayModal && selectedDayInfo && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-gray-100">
                                {/* Header */}
                                <div className="p-6 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                                    <div>
                                        <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 block mb-1">
                                            Events Overview
                                        </span>
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <CalendarIcon size={20} className="text-blue-400" />
                                            {selectedDayInfo.dateObj ? selectedDayInfo.dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : selectedDayInfo.date}
                                        </h3>
                                        <p className="text-xs text-slate-300 mt-1">Total {selectedDayInfo.events.length} event(s) scheduled on this date.</p>
                                    </div>
                                    <button
                                        onClick={() => setShowDayModal(false)}
                                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white z-10"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Search Bar if many events */}
                                {selectedDayInfo.events.length > 3 && (
                                    <div className="p-4 border-b bg-slate-50">
                                        <div className="relative">
                                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Search events on this date..."
                                                value={daySearchQuery}
                                                onChange={(e) => setDaySearchQuery(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Events List */}
                                <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
                                    {filteredDayEvents.map(ev => {
                                        const style = getEventTypeStyle(ev.event_type);
                                        return (
                                            <div
                                                key={ev.id}
                                                onClick={() => {
                                                    setSelectedEvent(ev);
                                                    setShowEventModal(true);
                                                }}
                                                className="p-4 rounded-xl border border-gray-200 bg-white hover:bg-slate-50 hover:border-blue-300 shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                                            >
                                                <div className="space-y-1 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider border ${style.badge}`}>
                                                            {ev.event_type || 'other'}
                                                        </span>
                                                        {ev.start_time && (
                                                            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                                <Clock size={12} /> {formatTime(ev.start_time)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-base">
                                                        {ev.title}
                                                    </h4>
                                                    {ev.description && (
                                                        <p className="text-xs text-gray-500 line-clamp-2">{cleanEventDescription(ev.description)}</p>
                                                    )}
                                                </div>

                                                <button className="px-3.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors shrink-0 self-start md:self-center">
                                                    View Details
                                                </button>
                                            </div>
                                        );
                                    })}

                                    {filteredDayEvents.length === 0 && (
                                        <p className="text-center py-8 text-sm text-gray-400">No matching events found</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* EVENT DETAILS MODAL */}
                    {showEventModal && selectedEvent && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in relative border border-gray-100">
                                <button
                                    onClick={() => setShowEventModal(false)}
                                    className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 text-white rounded-full transition-colors z-20 shadow-md backdrop-blur-md"
                                >
                                    <X size={20} />
                                </button>

                                {/* Dynamic Header Based on Event Type */}
                                <div className={`p-6 sm:p-8 text-white relative overflow-hidden bg-gradient-to-br ${getEventTypeStyle(selectedEvent.event_type).gradient}`}>
                                    <div className="relative z-10 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold backdrop-blur-md border border-white/20 uppercase tracking-wide">
                                                {selectedEvent.event_type || 'Event'}
                                            </span>
                                        </div>

                                        <h3 className="text-2xl font-bold leading-tight">{selectedEvent.title}</h3>

                                        <div className="flex items-center gap-2 text-white/90 text-sm font-medium pt-1">
                                            <CalendarCheck size={16} />
                                            <span>{formatDateRange(selectedEvent.event_date, selectedEvent.end_date)}</span>
                                        </div>
                                    </div>

                                    {/* Ambient Glow Orbs */}
                                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-black/10 rounded-full blur-2xl pointer-events-none"></div>
                                </div>

                                <div className="p-6 md:p-8 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-bold">Start Time</p>
                                            <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                                                <Clock size={16} className="text-blue-500" />
                                                {selectedEvent.start_time ? formatTime(selectedEvent.start_time) : 'All Day'}
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-bold">End Time</p>
                                            <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                                                <Clock size={16} className="text-blue-500" />
                                                {selectedEvent.end_time ? formatTime(selectedEvent.end_time) : 'N/A'}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</h4>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
                                            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                                                {cleanEventDescription(selectedEvent.description) || 'No additional description provided for this event.'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                                        <button
                                            onClick={() => setShowEventModal(false)}
                                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors shadow-md active:scale-95 text-sm"
                                        >
                                            Close Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StudentCalendar;


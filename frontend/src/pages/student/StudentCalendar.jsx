import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    CalendarCheck,
    MapPin,
    AlertCircle,
    X
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { SkeletonBox } from '../../components/SkeletonLoader';

const StudentCalendar = () => {
    const location = useLocation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    const [calendarDays, setCalendarDays] = useState([]);
    const [showEventModal, setShowEventModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        if (location.state?.initialDate) {
            setCurrentDate(new Date(location.state.initialDate));
        }
        fetchEvents();
    }, [location.state]);

    useEffect(() => {
        generateCalendar(currentDate);
    }, [currentDate, events]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await api.get('/events/student');
            if (response.data.success) {
                setEvents(response.data.data);
            }
        } catch (error) {
            console.error(error);
            // toast.error('Failed to load events'); // Optional: suppress if minor
        } finally {
            setLoading(false);
        }
    };

    const generateCalendar = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const days = [];
        for (let i = 0; i < startingDay; i++) {
            days.push({ day: null });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayEvents = events.filter(e => {
                const eventDate = new Date(e.event_date);
                return eventDate.getDate() === i &&
                    eventDate.getMonth() === month &&
                    eventDate.getFullYear() === year;
            });
            days.push({ day: i, date: dateStr, events: dayEvents });
        }
        setCalendarDays(days);
    };

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const handleToday = () => setCurrentDate(new Date());

    const getEventTypeColor = (type) => {
        switch (type) {
            case 'holiday': return 'bg-red-100 text-red-700 border-red-200';
            case 'exam': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'academic': return 'bg-blue-100 text-blue-700 border-blue-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        // Handle "09:30:00" or "09:30"
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        return `${h}:${minutes} ${ampm}`;
    };

    return (
        <div className="min-h-screen bg-transparent p-6 space-y-6 animate-fade-in text-gray-800">
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
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 heading-font flex items-center gap-2">
                                <CalendarIcon className="text-blue-600" /> Academic Calendar
                            </h1>
                            <p className="text-gray-500">View upcoming holidays, exams, and events.</p>
                        </div>
                        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border shadow-sm">
                            <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-md"><ChevronLeft size={20} /></button>
                            <span className="font-bold w-32 text-center select-none">
                                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-md"><ChevronRight size={20} /></button>
                            <button onClick={handleToday} className="ml-2 px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-md font-medium hover:bg-blue-100">Today</button>
                        </div>
                    </div>



                    {/* Event Details Modal */}
                    {
                        showEventModal && selectedEvent && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in relative">
                                    <button
                                        onClick={() => setShowEventModal(false)}
                                        className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors z-10"
                                    >
                                        <X size={20} className="text-gray-600" />
                                    </button>

                                    <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm border border-white/10 uppercase tracking-wide">
                                                    {selectedEvent.event_type}
                                                </span>
                                            </div>
                                            <h3 className="text-2xl font-bold leading-tight mb-2">{selectedEvent.title}</h3>
                                            <div className="flex items-center gap-4 text-indigo-100 text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={16} />
                                                    <span>{new Date(selectedEvent.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                                        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-indigo-500/50 rounded-full blur-2xl"></div>
                                    </div>

                                    <div className="p-8">
                                        <div className="flex flex-col gap-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Start Time</p>
                                                    <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                        <Clock size={18} className="text-indigo-500" />
                                                        {selectedEvent.start_time ? formatTime(selectedEvent.start_time) : 'All Day'}
                                                    </div>
                                                </div>
                                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">End Time</p>
                                                    <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                        <Clock size={18} className="text-indigo-500" />
                                                        {selectedEvent.end_time ? formatTime(selectedEvent.end_time) : 'N/A'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Description</h4>
                                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                                                    {selectedEvent.description || 'No description provided.'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                                            <button
                                                onClick={() => setShowEventModal(false)}
                                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
                                            >
                                                Close Details
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Calendar Grid */}
                        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-7 bg-gray-50 border-b">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="py-3 text-center text-sm font-semibold text-gray-500">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 auto-rows-fr">
                                {calendarDays.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`min-h-[80px] md:min-h-[100px] p-1 md:p-2 border-b ${(idx + 1) % 7 === 0 ? '' : 'border-r'} relative transition-colors ${!item.day ? 'bg-gray-50/50' : 'hover:bg-blue-50/10'} ${item.date === new Date().toISOString().split('T')[0] ? 'bg-blue-50/20' : ''}`}
                                    >
                                        {item.day && (
                                            <>
                                                <span className={`text-xs md:text-sm font-medium w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full ${item.date === new Date().toISOString().split('T')[0] ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700'}`}>
                                                    {item.day}
                                                </span>
                                                <div className="mt-1 md:mt-2 space-y-1">
                                                    {item.events.map(ev => (
                                                        <div
                                                            key={ev.id}
                                                            title={ev.description || ev.title}
                                                            className={`text-[10px] px-1 py-0.5 md:px-1.5 md:py-1 rounded border truncate cursor-pointer hover:shadow-sm transition-shadow ${getEventTypeColor(ev.event_type)}`}
                                                            onClick={() => {
                                                                setSelectedEvent(ev);
                                                                setShowEventModal(true);
                                                            }}
                                                        >
                                                            <span className="truncate font-medium block">{ev.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sidebar: Upcoming */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 h-fit">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Clock size={16} /> Upcoming</h3>
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                                {events
                                    .filter(e => new Date(e.event_date) >= new Date().setHours(0, 0, 0, 0))
                                    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
                                    .slice(0, 5) // Limit to 5
                                    .map(ev => (
                                        <div key={ev.id}
                                            className="p-3 rounded-lg border bg-gray-50 relative overflow-hidden cursor-pointer hover:bg-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                                            onClick={() => {
                                                setSelectedEvent(ev);
                                                setShowEventModal(true);
                                            }}
                                        >
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${ev.event_type === 'holiday' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                            <div className="pl-2">
                                                <div className="flex justify-between items-start mb-1 gap-2">
                                                    <h4 className="font-semibold text-sm text-gray-900 line-clamp-1">{ev.title}</h4>
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-2 mb-1">
                                                    <CalendarCheck size={12} /> {new Date(ev.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                </div>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider inline-block ${getEventTypeColor(ev.event_type)}`}>{ev.event_type}</span>
                                            </div>
                                        </div>
                                    ))}
                                {events.filter(e => new Date(e.event_date) >= new Date().setHours(0, 0, 0, 0)).length === 0 && (
                                    <p className="text-sm text-gray-400 text-center py-4">No upcoming events</p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div >
    );
};

export default StudentCalendar;

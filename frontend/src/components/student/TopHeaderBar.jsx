import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';

const TopHeaderBar = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { unreadCount, fetchNotifications } = useNotificationStore();

    useEffect(() => {
        fetchNotifications(1);
        const interval = setInterval(() => {
            fetchNotifications(1);
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // Dynamic time of day greeting
    const timeGreeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 4 && hour < 12) {
            return 'Good Morning';
        } else if (hour >= 12 && hour < 17) {
            return 'Good Afternoon';
        } else if (hour >= 17 && hour < 22) {
            return 'Good Evening';
        } else {
            return 'Good Night';
        }
    }, []);

    const displayBadgeCount = unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : 5;
    const initialLetter = (user?.name || user?.student_name || 'Damerla')?.charAt(0)?.toUpperCase() || 'D';

    return (
        <div className="sticky -top-4 lg:-top-5 xl:-top-6 z-40 bg-[#f8fafc]/95 backdrop-blur-md flex items-center justify-between py-2.5 px-4 lg:px-5 xl:px-6 -mx-4 lg:-mx-5 xl:-mx-6 -mt-4 lg:-mt-5 xl:-mt-6 mb-3 transition-all border-b border-slate-200/60 shadow-2xs min-h-[52px] sm:min-h-[58px]">
            {/* Left: College Logo & Time Wish with Cursive Pydian */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
                <img
                    src="/logo.png"
                    alt="Pydah Group"
                    className="h-8 sm:h-9 w-auto object-contain drop-shadow-xs cursor-pointer block"
                    onClick={() => navigate('/student/dashboard')}
                />
                <div className="flex items-center border-l border-slate-300/80 pl-2.5 sm:pl-3 h-6 sm:h-7 min-w-0">
                    <span className="text-xs sm:text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5 truncate leading-none">
                        <span>{timeGreeting}</span>
                        <span
                            className="text-[#f97316] font-bold tracking-normal text-sm sm:text-lg ml-0.5 inline-block"
                            style={{ fontFamily: "'Dancing Script', 'Brush Script MT', 'Caveat', 'Segoe Script', cursive" }}
                        >
                            Pydian
                        </span>
                    </span>
                </div>
            </div>

            {/* Right: Notification Bell & Profile Initial Avatar */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
                {/* Notification Bell */}
                <button
                    onClick={() => navigate('/student/announcements')}
                    className="relative flex items-center justify-center p-1.5 sm:p-2 rounded-full text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="View Announcements & Notifications"
                >
                    <Bell className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#1e293b]" />
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] sm:text-[10px] font-bold text-white bg-red-500 rounded-full shadow-xs border border-white leading-none">
                        {displayBadgeCount}
                    </span>
                </button>

                {/* Profile Placeholder Initial Letter Circle Button */}
                <button
                    onClick={() => navigate('/student/profile')}
                    className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 aspect-square rounded-full bg-[#2563eb] text-white flex items-center justify-center shadow-xs border-2 border-blue-200 cursor-pointer hover:bg-blue-700 transition-all font-black text-xs sm:text-sm uppercase leading-none"
                    title="View Profile"
                >
                    {initialLetter}
                </button>
            </div>
        </div>
    );
};

export default TopHeaderBar;

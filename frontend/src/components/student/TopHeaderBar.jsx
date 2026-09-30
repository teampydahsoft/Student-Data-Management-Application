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
        <div className="flex items-center justify-between py-1.5 px-0.5 mb-3 w-full relative z-30">
            {/* Left: College Logo & Time Wish with Cursive Pydian */}
            <div className="flex items-center gap-2.5 shrink-0">
                <img
                    src="/logo.png"
                    alt="Pydah Group"
                    className="h-9 sm:h-10 w-auto object-contain drop-shadow-xs cursor-pointer"
                    onClick={() => navigate('/student/dashboard')}
                />
                <div className="flex flex-col leading-none border-l border-slate-200 pl-2.5">
                    <span className="text-sm sm:text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                        <span>{timeGreeting}</span>
                        <span
                            className="text-[#f97316] font-bold tracking-normal text-base sm:text-lg ml-0.5"
                            style={{ fontFamily: "'Dancing Script', 'Brush Script MT', 'Caveat', 'Segoe Script', cursive" }}
                        >
                            Pydian
                        </span>
                    </span>
                </div>
            </div>

            {/* Right: Notification Bell & Profile Initial Avatar */}
            <div className="flex items-center gap-2 sm:gap-2.5 relative">
                {/* Notification Bell */}
                <button
                    onClick={() => navigate('/student/announcements')}
                    className="relative p-1.5 sm:p-2 rounded-full text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="View Announcements & Notifications"
                >
                    <Bell className="w-5 h-5 text-[#1e293b]" />
                    <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-xs">
                        {displayBadgeCount}
                    </span>
                </button>

                {/* Profile Placeholder Initial Letter Circle Button */}
                <button
                    onClick={() => navigate('/student/profile')}
                    className="w-10 h-10 sm:w-10 sm:h-10 shrink-0 aspect-square rounded-full bg-[#2563eb] text-white flex items-center justify-center shadow-xs border-2 border-blue-200 cursor-pointer hover:bg-blue-700 transition-all font-black text-base uppercase leading-none"
                    title="View Profile"
                >
                    {initialLetter}
                </button>
            </div>
        </div>
    );
};

export default TopHeaderBar;

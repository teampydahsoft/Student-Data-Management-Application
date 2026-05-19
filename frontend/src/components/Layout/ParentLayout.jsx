import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  RiHome4Line,
  RiHome4Fill,
  RiUser3Line,
  RiUser3Fill,
  RiCheckboxCircleLine,
  RiCheckboxCircleFill,
  RiBankCardLine,
  RiBankCardFill,
  RiMenuLine,
  RiLogoutBoxRLine,
} from 'react-icons/ri';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { getStaticFileUrlDirect } from '../../config/api';

const ParentLayout = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('parent-portal');
    document.body.classList.add('parent-portal');
    return () => {
      document.documentElement.classList.remove('parent-portal');
      document.body.classList.remove('parent-portal');
    };
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/parent/login', { replace: true });
  };

  const photoUrl = user?.student_photo
    ? (user.student_photo.startsWith('http') || user.student_photo.startsWith('data:')
      ? user.student_photo
      : getStaticFileUrlDirect(user.student_photo))
    : null;

  const navItems = [
    { icon: RiHome4Line, activeIcon: RiHome4Fill, label: 'Home', path: '/parent/dashboard' },
    { icon: RiUser3Line, activeIcon: RiUser3Fill, label: 'Student Profile', path: '/parent/profile' },
    { icon: RiCheckboxCircleLine, activeIcon: RiCheckboxCircleFill, label: 'Attendance', path: '/parent/attendance' },
    { icon: RiBankCardLine, activeIcon: RiBankCardFill, label: 'ID Card', path: '/parent/id-card' },
  ];

  const pageBackgroundStyle = {
    backgroundImage: "url('/images/login_background.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#f8fafc',
  };

  return (
    <div className="parent-portal-shell fixed inset-0 flex flex-col overflow-hidden">
      <div className="fixed inset-0 pointer-events-none -z-10" style={pageBackgroundStyle} aria-hidden />
      <div
        className="fixed inset-0 pointer-events-none opacity-30 -z-10"
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <header className="lg:hidden shrink-0 z-50 w-full bg-white/95 backdrop-blur-xl border-b border-gray-200/60 shadow-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="h-14 w-full flex items-center gap-3 px-4">
          <div className="h-10 w-10 flex items-center justify-center p-1 bg-white rounded-xl shadow-sm border border-gray-100 shrink-0">
            <img src="/logo.png" alt="College Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Parent</p>
            <p className="text-sm font-black text-gray-900 tracking-tight leading-tight">Portal</p>
          </div>
        </div>
      </header>

      {!desktopSidebarOpen && (
        <button
          type="button"
          className="hidden lg:flex fixed top-6 left-6 z-50 p-2 bg-white/80 backdrop-blur-md rounded-lg shadow-sm border border-gray-200 text-gray-500 hover:text-gray-900"
          onClick={() => setDesktopSidebarOpen(true)}
        >
          <RiMenuLine size={20} />
        </button>
      )}

      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-40 w-72 bg-white/95 backdrop-blur-xl border-r border-gray-200/60 shadow-sm transform transition-all duration-500 ${
          desktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col w-full">
          <div className="h-24 flex items-center justify-between px-6 border-b border-gray-100">
            <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => navigate('/parent/dashboard')}>
              <div className="h-12 w-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center p-1.5 shrink-0">
                <img src="/logo.png" alt="College Logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <span className="text-lg font-black text-gray-900 tracking-tight block leading-none">Parent</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Portal</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen(false)}
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl shrink-0"
            >
              <RiMenuLine size={18} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `relative flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/30'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => {
                  const Icon = isActive ? item.activeIcon : item.icon;
                  return (
                    <>
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </>
                  );
                }}
              </NavLink>
            ))}
          </nav>

          <div
            className="mx-5 mb-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/parent/profile')}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full overflow-hidden bg-indigo-100 ring-2 ring-white shrink-0">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-indigo-600">
                    <RiUser3Fill size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-gray-900 truncate">{user?.student_name || 'Student'}</p>
                <p className="text-[11px] font-bold text-gray-400 truncate">{user?.admission_number}</p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all"
            >
              <RiLogoutBoxRLine size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main
        className={`parent-portal-scroll relative z-10 flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden lg:ml-0 ${
          desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'
        }`}
      >
        <div className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain lg:px-8 lg:py-8">
          <div className="parent-portal-page w-full min-h-full flex flex-col">
            <Outlet />
          </div>
        </div>
      </main>

      <nav className="lg:hidden shrink-0 z-[55] w-full bg-white/95 backdrop-blur-3xl border-t border-gray-200/50 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="h-[68px] w-full flex items-stretch justify-between px-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 h-full ${
                  isActive ? 'text-indigo-600' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => {
                const Icon = isActive ? item.activeIcon : item.icon;
                const short =
                  item.label === 'Student Profile' ? 'Profile' :
                  item.label === 'Attendance' ? 'Attend' :
                  item.label === 'ID Card' ? 'ID' : 'Home';
                return (
                  <>
                    <div className={`p-2 rounded-2xl ${isActive ? 'bg-indigo-50 -translate-y-0.5' : ''}`}>
                      <Icon size={22} />
                    </div>
                    <span className={`text-[10px] font-bold leading-none ${isActive ? 'font-extrabold' : ''}`}>
                      {short}
                    </span>
                  </>
                );
              }}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 h-full text-gray-400 active:text-red-600 hover:text-red-600 transition-colors"
            aria-label="Sign out"
          >
            <div className="p-2 rounded-2xl active:bg-red-50">
              <RiLogoutBoxRLine size={22} />
            </div>
            <span className="text-[10px] font-bold leading-none">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default ParentLayout;

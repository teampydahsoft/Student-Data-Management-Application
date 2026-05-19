import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getStaticFileUrlDirect } from '../../config/api';
import useAuthStore from '../../store/authStore';
import { SkeletonBox } from '../../components/SkeletonLoader';
import { buildParentDisplayData } from '../../utils/parentProfileHelpers';
import {
  User,
  Calendar,
  CreditCard,
  ChevronRight,
  GraduationCap,
  Building2,
  BookOpen,
  Layers,
  Hash,
} from 'lucide-react';

const ParentDashboard = () => {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/parent/profile');
        if (res.data.success) {
          setData(buildParentDisplayData(res.data.data));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const display = data || buildParentDisplayData(user);
  const photoUrl = display?.student_photo
    ? (display.student_photo.startsWith('http') || display.student_photo.startsWith('data:')
      ? display.student_photo
      : getStaticFileUrlDirect(display.student_photo))
    : null;

  const quickLinks = [
    { to: '/parent/profile', label: 'Student Profile', desc: 'Full student details', icon: User, color: 'bg-blue-50 text-blue-600' },
    { to: '/parent/attendance', label: 'Attendance', desc: 'View attendance records', icon: Calendar, color: 'bg-green-50 text-green-600' },
    { to: '/parent/id-card', label: 'ID Card', desc: 'Digital student ID', icon: CreditCard, color: 'bg-purple-50 text-purple-600' },
  ];

  const academicRows = [
    { icon: BookOpen, label: 'Course', value: display?.course },
    { icon: Layers, label: 'Branch', value: display?.branch },
    { icon: GraduationCap, label: 'Year / Semester', value: `${display?.current_year || '—'} / ${display?.current_semester || '—'}` },
    { icon: Hash, label: 'Batch', value: display?.batch },
  ];

  if (loading) {
    return (
      <div className="w-full flex-1 flex flex-col min-h-full">
        <SkeletonBox className="h-56 w-full shrink-0" />
        <SkeletonBox className="h-36 w-full shrink-0" />
        <SkeletonBox className="flex-1 w-full min-h-[160px]" />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col min-h-full sm:max-w-4xl sm:mx-auto">
      {/* Hero: gradient + highlighted photo */}
      <section className="w-full shrink-0 bg-gradient-to-br from-primary via-primary to-primary-dark text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-20 -mt-20 blur-2xl pointer-events-none" aria-hidden />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full -ml-16 blur-2xl pointer-events-none" aria-hidden />

        <div className="relative z-10 px-4 pt-3 pb-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-75">Welcome, Parent</p>
        </div>

        <div className="relative z-10 flex justify-center px-4 -mb-14">
          <div className="relative">
            <div className="absolute -inset-1 rounded-[1.35rem] bg-white/40 blur-sm" aria-hidden />
            <div className="relative w-[120px] h-[120px] sm:w-[132px] sm:h-[132px] rounded-2xl overflow-hidden bg-white border-[4px] border-white shadow-[0_12px_40px_rgba(0,0,0,0.25)] ring-2 ring-white/50">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover object-center" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                  <User size={48} strokeWidth={1.25} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 px-4 pt-16 pb-5 text-center">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight break-words">
            {display?.student_name || 'Student'}
          </h1>
          <p className="text-xs sm:text-sm opacity-90 mt-1.5 font-medium">
            {display?.admission_number || '—'}
            {display?.pin_no ? ` · PIN ${display.pin_no}` : ''}
          </p>
        </div>
      </section>

      {/* College + course / branch / batch */}
      <section className="w-full shrink-0 bg-white px-4 py-4 border-b border-gray-100 shadow-sm">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/10">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Building2 size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">College</p>
            <p className="text-sm sm:text-base font-bold text-gray-900 mt-0.5 leading-snug break-words">
              {display?.college || '—'}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
          {academicRows.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100 text-left"
            >
              <Icon size={16} className="text-gray-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-xs sm:text-sm font-bold text-gray-900 mt-0.5 break-words leading-snug" title={value}>
                  {value || '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick access — fills remaining screen; items stretch evenly */}
      <section className="w-full flex-1 flex flex-col min-h-0 bg-white sm:rounded-b-2xl">
        <h2 className="shrink-0 px-4 py-2.5 text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b border-gray-100">
          <GraduationCap size={15} /> Quick access
        </h2>
        <div className="flex-1 flex flex-col min-h-0 divide-y divide-gray-100">
          {quickLinks.map(({ to, label, desc, icon: Icon, color }) => (
            <Link
              key={to}
              to={to}
              className="group flex-1 flex items-center gap-3.5 px-4 py-3 min-h-[4.5rem] bg-white active:bg-gray-50/90 hover:bg-gray-50/80 transition-colors"
            >
              <div className={`p-3 rounded-xl shrink-0 ${color}`}>
                <Icon size={22} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-bold text-gray-900 text-[15px]">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={20} className="text-gray-300 group-hover:text-primary shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ParentDashboard;

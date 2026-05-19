import React, { useEffect, useState } from 'react';
import api, { getStaticFileUrlDirect } from '../../config/api';
import { User } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import useAuthStore from '../../store/authStore';
import { toast } from 'react-hot-toast';
import ProfileDetailsView from '../../components/parent/ProfileDetailsView';
import { buildParentDisplayData } from '../../utils/parentProfileHelpers';

const ParentProfile = () => {
  const { user } = useAuthStore();
  const [display, setDisplay] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/parent/profile');
        if (response.data.success) {
          const merged = buildParentDisplayData({
            ...response.data.data,
            parent_mobile: response.data.data.parent_mobile || user?.parent_mobile,
          });
          setDisplay(merged);
          api.post('/parent/view-log', { page: 'profile' }).catch(() => {});
        }
      } catch (error) {
        console.error('Error fetching parent profile:', error);
        toast.error('Failed to load student profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user?.parent_mobile]);

  const photoUrl = display?.student_photo
    ? (display.student_photo.startsWith('http') || display.student_photo.startsWith('data:')
      ? display.student_photo
      : getStaticFileUrlDirect(display.student_photo))
    : null;

  if (loading) {
    return (
      <div className="w-full min-h-full space-y-3 sm:max-w-6xl sm:mx-auto">
        <SkeletonBox className="h-36 w-full rounded-none sm:rounded-2xl" />
        <SkeletonBox className="h-96 w-full rounded-none sm:rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-full flex flex-col space-y-4 sm:space-y-6 sm:max-w-6xl sm:mx-auto">
      <div className="w-full bg-white border-y border-gray-100 shadow-sm overflow-hidden sm:rounded-2xl sm:border">
        <div className="bg-gradient-to-r from-primary to-primary-dark px-3 pt-4 pb-14 sm:px-8 sm:py-7 text-white relative overflow-hidden">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Student Profile</p>
          <h1 className="text-lg sm:text-2xl font-black mt-1 break-words">{display?.student_name || '—'}</h1>
          <p className="text-xs sm:text-sm opacity-90 mt-1 break-words">
            {display?.admission_number}
            {display?.pin_no ? ` · PIN ${display.pin_no}` : ''}
          </p>
        </div>
        <div className="px-3 pb-4 sm:p-6 flex flex-row items-start gap-2.5 sm:gap-5 -mt-11 sm:mt-0 relative z-10 border-b border-gray-100">
          <div className="shrink-0">
            <div className="w-[88px] h-[88px] sm:w-28 sm:h-28 rounded-xl sm:rounded-2xl overflow-hidden bg-gray-100 border-[3px] sm:border-2 border-white shadow-lg ring-1 ring-gray-100">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User size={32} className="text-gray-300" />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-0 sm:pt-1 text-left">
            <p className="text-xs sm:text-sm text-gray-600 break-words">
              <span className="font-bold text-gray-900">{display?.college}</span>
              {display?.course && ` · ${display.course}`}
              {display?.branch && ` · ${display.branch}`}
            </p>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-1.5">
              Year {display?.current_year || '—'} · Sem {display?.current_semester || '—'} · Batch {display?.batch || '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="w-full px-0 sm:px-0">
        <ProfileDetailsView data={display} />
      </div>
    </div>
  );
};

export default ParentProfile;

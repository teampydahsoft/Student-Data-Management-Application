import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { SkeletonBox } from '../../components/SkeletonLoader';
import DigitalStudentCard from '../../components/DigitalStudentCard';
import { buildParentDisplayData } from '../../utils/parentProfileHelpers';
import { toast } from 'react-hot-toast';

const ParentIdCard = () => {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/parent/profile');
        if (res.data.success) {
          setStudentData(buildParentDisplayData(res.data.data));
        }
      } catch (e) {
        console.error(e);
        toast.error('Failed to load ID card');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="w-full min-h-full flex items-start justify-center px-3 sm:px-0">
        <SkeletonBox className="h-[420px] w-full max-w-[380px] rounded-none sm:rounded-2xl" />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="w-full min-h-full flex items-center justify-center px-4">
        <p className="text-center text-gray-500">Unable to load student ID card.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full flex flex-col sm:max-w-lg sm:mx-auto">
      <div className="w-full px-3 py-3 sm:px-0 sm:mb-6 bg-white border-b border-gray-100 sm:bg-transparent sm:border-0">
        <h1 className="text-lg sm:text-xl font-black text-gray-900">Digital ID Card</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Official student identification card (view only)</p>
      </div>
      <div className="flex-1 w-full flex justify-center px-2 sm:px-0 pb-4">
        <DigitalStudentCard
          className="w-full max-w-[380px]"
          student={studentData}
          getStudentData={(key, fallback = '') => {
            const sd = studentData?.student_data || {};
            const val = sd[key];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val);
            return fallback;
          }}
        />
      </div>
    </div>
  );
};

export default ParentIdCard;

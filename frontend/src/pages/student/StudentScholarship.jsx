import React from 'react';
import useAuthStore from '../../store/authStore';
import StudentScholarshipHistoryTab from '../../components/Students/StudentScholarshipHistoryTab';

const StudentScholarship = () => {
  const { user } = useAuthStore();

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900">Student Scholarship</h1>
        <p className="text-sm text-gray-500 mt-1">
          View your year-wise scholarship application status, sanctioned amount, and release history.
        </p>
      </div>

      <StudentScholarshipHistoryTab
        student={{ admission_number: user?.admission_number, student_name: user?.name }}
        readOnly
      />
    </div>
  );
};

export default StudentScholarship;

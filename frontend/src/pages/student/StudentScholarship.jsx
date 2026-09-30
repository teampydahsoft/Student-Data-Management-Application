import React from 'react';
import useAuthStore from '../../store/authStore';
import StudentScholarshipHistoryTab from '../../components/Students/StudentScholarshipHistoryTab';

const StudentScholarship = () => {
  const { user } = useAuthStore();

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div>
        <h1 className="text-lg sm:text-xl font-extrabold text-[#1e3a8a] tracking-tight">Student Scholarship</h1>
      </div>

      <StudentScholarshipHistoryTab
        student={{
          admission_number: user?.admission_number || user?.admissionNumber,
          student_name: user?.name || user?.student_name
        }}
        readOnly
      />
    </div>
  );
};

export default StudentScholarship;

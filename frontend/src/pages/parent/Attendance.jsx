import React from 'react';
import StudentAttendance from '../student/Attendance';

const ParentAttendance = () => (
  <div className="w-full min-h-full flex flex-col sm:max-w-6xl sm:mx-auto">
    <div className="w-full px-3 py-3 sm:px-0 sm:mb-6 bg-white border-b border-gray-100 sm:bg-transparent sm:border-0">
      <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight">Attendance</h1>
      <p className="text-xs sm:text-sm text-gray-500 mt-1">Weekly, monthly, and semester attendance overview</p>
    </div>
    <div className="w-full flex-1 min-h-0 px-0 sm:px-0">
      <StudentAttendance apiPath="/parent/attendance" logParentView />
    </div>
  </div>
);

export default ParentAttendance;

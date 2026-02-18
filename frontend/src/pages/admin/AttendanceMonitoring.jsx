/**
 * Admin – Hourly Attendance Monitoring (Pydah v2.0)
 */

import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { CalendarCheck, Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { BACKEND_MODULES, hasPermission, isFullAccessRole } from '../../constants/rbac';
import { useMemo } from 'react';

export default function AttendanceMonitoring() {
  const { user } = useAuthStore();

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (isFullAccessRole(user.role)) return true;
    return hasPermission(user.permissions, BACKEND_MODULES.ATTENDANCE, 'view_hourly');
  }, [user]);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  if (!hasAccess && user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-4 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock className="text-red-500" size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-slate-600 max-w-sm">
          You do not have permission to view Hourly Attendance Monitoring.
        </p>
      </div>
    );
  }

  useEffect(() => {
    setLoading(true);
    api.get('/hourly-attendance', { params: { date } })
      .then((r) => {
        if (r.data.success) setData(r.data.data || []);
        else setData([]);
      })
      .catch((e) => {
        toast.error(e.response?.data?.message || 'Failed to load');
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">Hourly Attendance Monitoring</h1>
      <p className="text-slate-600 mb-6">View hourly (period-wise) attendance by date.</p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Admission No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Course / Branch</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No hourly attendance for this date. Filter by period/course/branch in API if needed.</td></tr>
              ) : (
                data.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.student_name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.admission_number}</td>
                    <td className="px-4 py-3 text-slate-600">{r.course} / {r.branch}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-sm ${r.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-slate-500">{r.period_slot_id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

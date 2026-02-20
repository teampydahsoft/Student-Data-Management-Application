import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar,
    Clock,
    AlertTriangle,
    Loader2
} from 'lucide-react';
import api from '../../config/api';
import LoadingAnimation from '../LoadingAnimation';
import toast from 'react-hot-toast';

const StudentAttendanceTab = ({ student }) => {
    const [historyData, setHistoryData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (student?.id) {
            fetchHistory();
        }
    }, [student]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/attendance/student/${student.id}/history`);
            if (response.data.success) {
                setHistoryData(response.data.data);
            } else {
                toast.error(response.data.message || 'Failed to load attendance history');
            }
        } catch (error) {
            console.error('Attendance fetch error:', error);
            toast.error('Failed to load attendance history');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadReport = async () => {
        if (!student) return;
        setDownloading(true);
        try {
            // Assume the endpoint generates a PDF or similar
            const response = await api.get(`/attendance/student/${student.id}/history`, {
                params: { download: true },
                responseType: 'blob'
            });

            // If the endpoint actually returns the file
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${student.studentName || 'student'}_attendance_report.pdf`); // Adjust extension as needed
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            // Fallback if the endpoint is different or just for viewing
            toast.error("Download feature not fully implemented in this view.");
        } finally {
            setDownloading(false);
        }
    };



    if (loading) {
        return (
            <div className="py-20 flex justify-center">
                <LoadingAnimation message="Fetching attendance history..." />
            </div>
        );
    }

    if (!historyData) {
        return (
            <div className="py-20 flex flex-col items-center gap-3 text-gray-500">
                <AlertTriangle size={28} />
                <p>Unable to load attendance history or no data available.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                {/* Download Button Placeholder - logic needed depends on backend implementation */}
            </div>

            {/* Semester Summary */}
            {historyData.semester && (
                <section>
                    <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-5">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-indigo-600 uppercase">Semester Attendance</p>
                                <p className="text-lg font-bold text-gray-900">
                                    {historyData.semester?.startDate} → {historyData.semester?.endDate}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        <Calendar size={12} /> {historyData.semester?.workingDays ?? 0} working days
                                    </span>
                                    {historyData.semester?.lastUpdated && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                                            <Clock size={12} /> Updated {new Date(historyData.semester.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                {(() => {
                                    const semesterTotals = historyData.semester?.totals || {};
                                    const markedDays =
                                        (semesterTotals.present || 0) +
                                        (semesterTotals.absent || 0);
                                    const presentDays = semesterTotals.present || 0;
                                    const percentage = markedDays > 0 ? ((presentDays / markedDays) * 100).toFixed(1) : '0.0';
                                    return (
                                        <div className="inline-flex items-center gap-3 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
                                            <div className="text-left">
                                                <p className="text-xs text-gray-600">Attendance %</p>
                                                <p className="text-2xl font-bold text-indigo-700">{percentage}%</p>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                <p><span className="font-semibold text-green-600">{semesterTotals.present ?? 0}</span> present</p>
                                                <p><span className="font-semibold text-red-500">{semesterTotals.absent ?? 0}</span> absent</p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-3">
                            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                                <p className="text-xs text-gray-600">Present</p>
                                <p className="text-xl font-bold text-green-700">{historyData.semester?.totals?.present ?? 0}</p>
                            </div>
                            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                                <p className="text-xs text-gray-600">Absent</p>
                                <p className="text-xl font-bold text-red-600">{historyData.semester?.totals?.absent ?? 0}</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-xs text-gray-600">Unmarked</p>
                                <p className="text-xl font-bold text-gray-700">{historyData.semester?.totals?.unmarked ?? 0}</p>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                <p className="text-xs text-gray-600">Holidays</p>
                                <p className="text-xl font-bold text-amber-700">{historyData.semester?.totals?.holidays ?? 0}</p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase">Weekly Summary</h3>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        <div>
                            <p className="text-xs text-gray-500">Present</p>
                            <p className="text-lg font-semibold text-green-600">{historyData.weekly?.totals?.present ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Absent</p>
                            <p className="text-lg font-semibold text-red-500">{historyData.weekly?.totals?.absent ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Unmarked</p>
                            <p className="text-lg font-semibold text-gray-600">{historyData.weekly?.totals?.unmarked ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Holidays</p>
                            <p className="text-lg font-semibold text-amber-600">{historyData.weekly?.totals?.holidays ?? 0}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Range: {historyData.weekly?.startDate} → {historyData.weekly?.endDate}</p>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-purple-700 uppercase">Monthly Summary</h3>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        <div>
                            <p className="text-xs text-gray-500">Present</p>
                            <p className="text-lg font-semibold text-green-600">{historyData.monthly?.totals?.present ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Absent</p>
                            <p className="text-lg font-semibold text-red-500">{historyData.monthly?.totals?.absent ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Unmarked</p>
                            <p className="text-lg font-semibold text-gray-600">{historyData.monthly?.totals?.unmarked ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Holidays</p>
                            <p className="text-lg font-semibold text-amber-600">{historyData.monthly?.totals?.holidays ?? 0}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Range: {historyData.monthly?.startDate} → {historyData.monthly?.endDate}</p>
                </div>
            </section>



            {/* Monthly Breakdown - Show all months in semester */}
            {historyData.semester && historyData.semester.series && (() => {
                // Group attendance by month
                const monthlyData = {};
                historyData.semester.series.forEach((entry) => {
                    const date = new Date(entry.date);
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {
                            monthName,
                            present: 0,
                            absent: 0,
                            unmarked: 0,
                            holidays: 0,
                            total: 0
                        };
                    }

                    if (entry.isHoliday) {
                        monthlyData[monthKey].holidays++;
                    } else if (entry.status === 'present') {
                        monthlyData[monthKey].present++;
                    } else if (entry.status === 'absent') {
                        monthlyData[monthKey].absent++;
                    } else {
                        monthlyData[monthKey].unmarked++;
                    }
                    monthlyData[monthKey].total++;
                });

                const months = Object.keys(monthlyData).sort().map(key => ({
                    key,
                    ...monthlyData[key]
                }));

                return (
                    <section>
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">
                            Monthly Breakdown (Semester: {historyData.semester.startDate} → {historyData.semester.endDate})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {months.map((month) => {
                                const markedDays = month.present + month.absent;
                                const percentage = markedDays > 0
                                    ? ((month.present / markedDays) * 100).toFixed(1)
                                    : '0.0';

                                return (
                                    <div
                                        key={month.key}
                                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                                    >
                                        <h4 className="text-sm font-semibold text-gray-800 mb-3">{month.monthName}</h4>
                                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                            <div>
                                                <p className="text-xs text-gray-500">Present</p>
                                                <p className="text-base font-semibold text-green-600">{month.present}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Absent</p>
                                                <p className="text-base font-semibold text-red-600">{month.absent}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Holidays</p>
                                                <p className="text-base font-semibold text-amber-600">{month.holidays}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Unmarked</p>
                                                <p className="text-base font-semibold text-gray-500">{month.unmarked}</p>
                                            </div>
                                        </div>
                                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                            <span className="text-xs text-gray-500">Attendance</span>
                                            <span className={`text-lg font-bold ${Number(percentage) >= 75 ? 'text-green-600' :
                                                Number(percentage) >= 65 ? 'text-amber-600' : 'text-red-600'
                                                }`}>
                                                {percentage}%
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })()}
        </div>
    );
};

export default StudentAttendanceTab;

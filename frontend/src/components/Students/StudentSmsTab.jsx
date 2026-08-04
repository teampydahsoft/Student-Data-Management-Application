import React, { useState, useEffect } from 'react';
import {
    MessageSquare,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Filter
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const StudentSmsTab = ({ student }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filterCategory, setFilterCategory] = useState('All');

    useEffect(() => {
        if (student?.admission_number) {
            fetchLogs();
        }
    }, [student]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/students/${student.admission_number}/sms-logs`);
            if (response.data.success) {
                setLogs(response.data.data);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load SMS logs');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status) => {
        if (status === 'Sent' || status === 'Delivered') return <CheckCircle2 size={16} className="text-green-500" />;
        if (status === 'Failed') return <XCircle size={16} className="text-red-500" />;
        return <Clock size={16} className="text-yellow-500" />;
    };

    // Extract unique categories
    const categories = ['All', ...new Set(logs.map(log => log.category).filter(Boolean))];

    const filteredLogs = filterCategory === 'All'
        ? logs
        : logs.filter(log => log.category === filterCategory);

    // Calculate stats
    const totalSent = logs.filter(l => l.status === 'Sent' || l.status === 'Delivered').length;
    const totalFailed = logs.filter(l => l.status === 'Failed').length;

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                    <p className="text-xs uppercase text-blue-500 font-semibold mb-1">Total SMS Sent</p>
                    <p className="text-2xl font-bold text-gray-800">{totalSent}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                    <p className="text-xs uppercase text-red-500 font-semibold mb-1">Failed</p>
                    <p className="text-2xl font-bold text-gray-800">{totalFailed}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <MessageSquare className="text-blue-600" size={20} /> SMS Tracking
                    </h3>

                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-gray-400" />
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        >
                            {categories.map((cat) => (
                                <option key={cat} value={cat.id || cat}>{cat.name || cat}</option>
                            ))}
                        </select>
                        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full ml-2">
                            {filteredLogs.length} Records
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : filteredLogs.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                                <tr>
                                    <th className="px-6 py-3 w-[100px]">Status</th>
                                    <th className="px-6 py-3 w-[150px]">Category</th>
                                    <th className="px-6 py-3 min-w-[300px]">Message Content</th>
                                    <th className="px-6 py-3 w-[120px]">Year / Sem</th>
                                    <th className="px-6 py-3 w-[150px]">Date Sent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(log.status)}
                                                <span className={`text-xs font-medium ${log.status === 'Sent' ? 'text-green-700' :
                                                        log.status === 'Failed' ? 'text-red-700' : 'text-gray-700'
                                                    }`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${log.category === 'Attendance' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                    log.category === 'Announcement' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                        'bg-blue-50 text-blue-700 border-blue-100'
                                                }`}>
                                                {log.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="relative group cursor-pointer">
                                                <p className="text-gray-800 line-clamp-1 group-hover:line-clamp-none transition-all duration-200">
                                                    {log.message}
                                                </p>
                                                {/* Tooltip-like expansion in place on hover is handled by line-clamp removal, 
                                                    but max-width might be needed for very long messages */}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 font-medium">
                                            <div className="flex flex-col text-xs">
                                                {log.current_year ? (
                                                    <span className="font-semibold text-gray-900">Year {log.current_year}</span>
                                                ) : '-'}
                                                {log.current_semester ? (
                                                    <span className="text-gray-500">Sem {log.current_semester}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-900">
                                                    {new Date(log.sent_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-xs">
                                                    {new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-12 text-center text-gray-400 italic flex flex-col items-center">
                        <MessageSquare size={40} className="mb-2 opacity-20" />
                        <p>No SMS logs found {filterCategory !== 'All' ? `for ${filterCategory}` : ''}.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentSmsTab;

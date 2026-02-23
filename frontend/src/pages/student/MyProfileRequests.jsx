import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, FileText, AlertCircle } from 'lucide-react';
import api from '../../config/api';

const MyProfileRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await api.get('/profile-changes/my-requests');
            if (res.data?.success) {
                setRequests(res.data.data);
            } else {
                setError('Failed to fetch requests');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return <Clock className="text-amber-500" size={20} />;
            case 'approved': return <CheckCircle className="text-emerald-500" size={20} />;
            case 'rejected': return <XCircle className="text-rose-500" size={20} />;
            default: return null;
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Pending Review</span>;
            case 'approved': return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Approved</span>;
            case 'rejected': return <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Rejected</span>;
            default: return null;
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
                {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse"></div>)}
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex items-center gap-3">
                <AlertCircle />
                <p className="font-semibold">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 heading-font">My Profile Requests</h1>
                    <p className="text-sm font-medium text-gray-500 mt-1">Track the status of your profile update requests.</p>
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <FileText className="text-gray-400" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No requests found</h3>
                    <p className="text-gray-500 mt-2 max-w-sm">You haven't submitted any profile change requests yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {requests.map((req) => {
                        let changes = {};
                        if (typeof req.requested_changes === 'string') {
                            try { changes = JSON.parse(req.requested_changes); } catch (e) { }
                        } else {
                            changes = req.requested_changes || {};
                        }

                        return (
                            <div key={req.id} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-50 pb-4 mb-4 gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 rounded-xl">
                                            {getStatusIcon(req.status)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">Request #{req.id}</p>
                                            <p className="text-xs text-gray-500 font-medium">Submitted on {new Date(req.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    {getStatusBadge(req.status)}
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Requested Changes</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {Object.entries(changes).map(([key, value]) => (
                                            <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                                    {key.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-sm font-bold text-gray-900 break-all">{value || '(Empty)'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {req.comments && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100/50">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admin Comments</h4>
                                        <p className="text-sm text-gray-700">{req.comments}</p>
                                        <p className="text-xs text-gray-400 mt-2 italic">- Reviewed by {req.reviewed_by}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MyProfileRequests;

import React, { useState, useEffect } from 'react';
import {
    MessageSquare,
    Plus,
    Loader2,
    Trash2,
    Edit2,
    Check,
    Clock,
    User
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

const ROLE_STYLES = {
    'Admin': {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-100',
        accent: 'bg-red-500'
    },
    'Principal': {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-100',
        accent: 'bg-indigo-500'
    },
    'AO': {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-100',
        accent: 'bg-purple-500'
    },
    'HOD': {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-100',
        accent: 'bg-amber-500'
    },
    'Initial': {
        bg: 'bg-slate-50',
        text: 'text-slate-600',
        border: 'border-slate-200',
        accent: 'bg-slate-400'
    },
    'Other': {
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-green-100',
        accent: 'bg-green-500'
    }
};

const StudentRemarksContent = ({ student, canAddRemarks = false, canManageRemarks = false }) => {
    const [remarks, setRemarks] = useState([]);
    const [loadingRemarks, setLoadingRemarks] = useState(false);
    const [newRemark, setNewRemark] = useState('');
    const [addingRemark, setAddingRemark] = useState(false);
    const [editingRemarkId, setEditingRemarkId] = useState(null);
    const [editingRemarkText, setEditingRemarkText] = useState('');
    const [updatingRemark, setUpdatingRemark] = useState(false);
    const [deletingRemarkId, setDeletingRemarkId] = useState(null);

    const user = useAuthStore((state) => state.user);

    useEffect(() => {
        if (student?.admission_number) {
            fetchRemarks();
        }
    }, [student]);

    const fetchRemarks = async () => {
        setLoadingRemarks(true);
        try {
            const response = await api.get(`/student-history/remarks/${student.admission_number}`);
            if (response.data.success) {
                setRemarks(response.data.data);
            }
        } catch (error) {
            toast.error('Failed to load remarks');
        } finally {
            setLoadingRemarks(false);
        }
    };

    const handleAddRemark = async (e) => {
        e.preventDefault();
        if (!newRemark.trim() || !canAddRemarks) return;

        setAddingRemark(true);
        try {
            const response = await api.post('/student-history/remarks', {
                admission_number: student.admission_number,
                remark: newRemark
            });

            if (response.data.success) {
                toast.success('Remark added');
                setNewRemark('');
                fetchRemarks();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add remark');
        } finally {
            setAddingRemark(false);
        }
    };

    const handleUpdateRemark = async (remarkId) => {
        if (!editingRemarkText.trim() || !canManageRemarks) return;

        setUpdatingRemark(true);
        try {
            const response = await api.put(`/student-history/remarks/${remarkId}`, {
                remark: editingRemarkText
            });

            if (response.data.success) {
                toast.success('Remark updated');
                setEditingRemarkId(null);
                setEditingRemarkText('');
                fetchRemarks();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update remark');
        } finally {
            setUpdatingRemark(false);
        }
    };

    const handleDeleteRemark = async (remarkId) => {
        if (!canManageRemarks) return;
        if (!window.confirm('Are you sure you want to delete this remark?')) return;

        setDeletingRemarkId(remarkId);
        try {
            const response = await api.delete(`/student-history/remarks/${remarkId}`);

            if (response.data.success) {
                toast.success('Remark deleted');
                fetchRemarks();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete remark');
        } finally {
            setDeletingRemarkId(null);
        }
    };

    const canEditRemark = (remark) => {
        if (remark.is_legacy || String(remark.id).startsWith('legacy-')) return false;
        const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
        const isCreator = remark.created_by === user?.id;
        return (isSuperAdmin || isCreator) && canManageRemarks;
    };

    if (!student) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Remarks List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50/30">
                {loadingRemarks ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Loader2 className="animate-spin mb-3" size={32} />
                        <p className="text-sm font-medium">Fetching remarks...</p>
                    </div>
                ) : remarks.length > 0 ? (
                    <div className="relative pt-2 pb-8">
                        {/* Vertical Timeline Thread */}
                        <div className="absolute left-[22px] top-0 bottom-8 w-0.5 bg-gray-100 rounded-full" />

                        <div className="space-y-6">
                            {remarks.map((remark) => {
                                const style = ROLE_STYLES[remark.remark_category] || ROLE_STYLES['Other'];
                                return (
                                    <div key={remark.id} className="relative pl-12">
                                        {/* Timeline Dot */}
                                        <div className={`absolute left-[15px] top-4 w-4 h-4 rounded-full border-4 border-white shadow-sm z-10 ${style.accent}`} />

                                        <div className={`group relative bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 border-l-4 ${style.accent.replace('bg-', 'border-l-')}`}>
                                            {editingRemarkId === remark.id ? (
                                                <div className="space-y-3">
                                                    <textarea
                                                        value={editingRemarkText}
                                                        onChange={(e) => setEditingRemarkText(e.target.value)}
                                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm min-h-[100px]"
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setEditingRemarkId(null);
                                                                setEditingRemarkText('');
                                                            }}
                                                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateRemark(remark.id)}
                                                            disabled={updatingRemark || !editingRemarkText.trim()}
                                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-100"
                                                        >
                                                            {updatingRemark ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                            Update
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            <span className="font-bold text-gray-900 tracking-tight">{remark.created_by_name}</span>
                                                            <span className="text-gray-300 font-light">•</span>
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${style.bg} ${style.text} ${style.border} border`}>
                                                                {remark.remark_category}
                                                            </span>
                                                        </div>

                                                        {canEditRemark(remark) && (
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingRemarkId(remark.id);
                                                                        setEditingRemarkText(remark.remark);
                                                                    }}
                                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                    title="Edit"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteRemark(remark.id)}
                                                                    disabled={deletingRemarkId === remark.id}
                                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Delete"
                                                                >
                                                                    {deletingRemarkId === remark.id ? (
                                                                        <Loader2 size={14} className="animate-spin" />
                                                                    ) : (
                                                                        <Trash2 size={14} />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pl-0">
                                                        <p className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                                                            {remark.remark}
                                                        </p>
                                                        <div className="mt-4 flex items-center justify-between">
                                                            <div className="flex items-center gap-3 text-[11px] text-gray-400 font-semibold">
                                                                <span className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
                                                                    <Clock size={12} className="text-gray-400" />
                                                                    {new Date(remark.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                                </span>
                                                                {remark.student_year && (
                                                                    <span className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg">
                                                                        Year {remark.student_year} • Sem {remark.student_semester}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {remark.updated_at && (
                                                                <span className="text-[10px] text-gray-300 italic">
                                                                    Edited
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-100">
                        <MessageSquare size={48} className="mb-4 opacity-20" />
                        <p className="text-base font-medium">No remarks found for this student</p>
                        <p className="text-xs mt-1">Add a new remark below to get started</p>
                    </div>
                )}
            </div>

            {/* Footer/Add Remark */}
            {canAddRemarks && (
                <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/50 backdrop-blur-sm">
                    <form onSubmit={handleAddRemark} className="space-y-4">
                        <div className="relative group">
                            <textarea
                                value={newRemark}
                                onChange={(e) => setNewRemark(e.target.value)}
                                placeholder="Write a note about this student..."
                                className="w-full p-4 pr-14 bg-white border border-gray-200 rounded-[20px] shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none text-[14px] min-h-[80px] font-medium placeholder:text-gray-400"
                            />
                            <div className="absolute top-4 right-6 text-gray-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                                <MessageSquare size={20} className="opacity-40" />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                                    <User size={13} className="text-blue-600" />
                                </div>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                    Posting as <span className="text-blue-600 underline decoration-blue-200 decoration-2 underline-offset-4">{user?.username}</span>
                                </p>
                            </div>
                            <button
                                type="submit"
                                disabled={addingRemark || !newRemark.trim()}
                                className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-[16px] font-extrabold text-xs hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-200 hover:shadow-blue-300 active:scale-[0.98] ring-4 ring-white"
                            >
                                {addingRemark ? <Loader2 className="animate-spin" size={18} /> : <><Plus size={18} strokeWidth={3} /> Post Remark</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default StudentRemarksContent;

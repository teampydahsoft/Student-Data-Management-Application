import React, { useState, useEffect } from 'react';
import {
    MessageSquare,
    Plus,
    Loader2,
    User,
    Clock,
    Edit2,
    Trash2,
    X,
    Check
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

const StudentHistoryTab = ({ student, canAddRemarks = false }) => {
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
        if (!newRemark.trim()) return;

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

    const handleEditRemark = (remark) => {
        setEditingRemarkId(remark.id);
        setEditingRemarkText(remark.remark);
    };

    const handleCancelEdit = () => {
        setEditingRemarkId(null);
        setEditingRemarkText('');
    };

    const handleUpdateRemark = async (remarkId) => {
        if (!editingRemarkText.trim()) return;

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
        const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
        const isCreator = remark.created_by === user?.id;
        return (isSuperAdmin || isCreator) && canAddRemarks;
    };

    return (
        <div className="space-y-6">
            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-sm">
                <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold">Batch</p>
                    <p className="font-medium text-gray-900">{student.batch || 'N/A'}</p>
                </div>
                <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold">Current Status</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${student.student_status === 'Regular'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {student.student_status || 'Unknown'}
                    </span>
                </div>
                <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold">Year / Semester</p>
                    <p className="font-medium text-gray-900">{student.current_year} / {student.current_semester}</p>
                </div>
                <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold">College</p>
                    <p className="font-medium text-gray-900 truncate" title={student.college}>{student.college}</p>
                </div>
            </div>

            {/* Remarks Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <MessageSquare className="text-blue-600" size={20} /> Remarks History
                    </h3>
                    <div className="text-xs text-gray-500">
                        Showing remarks from all departments
                    </div>
                </div>

                {loadingRemarks ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <RemarkSection
                            title="Admin Remarks"
                            category="Admin"
                            remarks={remarks}
                            icon="⚙️"
                            color="red"
                            user={user}
                            editingRemarkId={editingRemarkId}
                            editingRemarkText={editingRemarkText}
                            setEditingRemarkText={setEditingRemarkText}
                            updatingRemark={updatingRemark}
                            deletingRemarkId={deletingRemarkId}
                            onEdit={handleEditRemark}
                            onCancelEdit={handleCancelEdit}
                            onUpdate={handleUpdateRemark}
                            onDelete={handleDeleteRemark}
                            canEdit={canEditRemark}
                        />
                        <RemarkSection
                            title="Principal Remarks"
                            category="Principal"
                            remarks={remarks}
                            icon="🎓"
                            color="blue"
                            user={user}
                            editingRemarkId={editingRemarkId}
                            editingRemarkText={editingRemarkText}
                            setEditingRemarkText={setEditingRemarkText}
                            updatingRemark={updatingRemark}
                            deletingRemarkId={deletingRemarkId}
                            onEdit={handleEditRemark}
                            onCancelEdit={handleCancelEdit}
                            onUpdate={handleUpdateRemark}
                            onDelete={handleDeleteRemark}
                            canEdit={canEditRemark}
                        />
                        <RemarkSection
                            title="AO Remarks"
                            category="AO"
                            remarks={remarks}
                            icon="📋"
                            color="purple"
                            user={user}
                            editingRemarkId={editingRemarkId}
                            editingRemarkText={editingRemarkText}
                            setEditingRemarkText={setEditingRemarkText}
                            updatingRemark={updatingRemark}
                            deletingRemarkId={deletingRemarkId}
                            onEdit={handleEditRemark}
                            onCancelEdit={handleCancelEdit}
                            onUpdate={handleUpdateRemark}
                            onDelete={handleDeleteRemark}
                            canEdit={canEditRemark}
                        />
                        <RemarkSection
                            title="HOD Remarks"
                            category="HOD"
                            remarks={remarks}
                            icon="👨‍🏫"
                            color="amber"
                            user={user}
                            editingRemarkId={editingRemarkId}
                            editingRemarkText={editingRemarkText}
                            setEditingRemarkText={setEditingRemarkText}
                            updatingRemark={updatingRemark}
                            deletingRemarkId={deletingRemarkId}
                            onEdit={handleEditRemark}
                            onCancelEdit={handleCancelEdit}
                            onUpdate={handleUpdateRemark}
                            onDelete={handleDeleteRemark}
                            canEdit={canEditRemark}
                        />
                        <RemarkSection
                            title="Accountant Remarks"
                            category="Accountant"
                            remarks={remarks}
                            icon="💰"
                            color="green"
                            user={user}
                            editingRemarkId={editingRemarkId}
                            editingRemarkText={editingRemarkText}
                            setEditingRemarkText={setEditingRemarkText}
                            updatingRemark={updatingRemark}
                            deletingRemarkId={deletingRemarkId}
                            onEdit={handleEditRemark}
                            onCancelEdit={handleCancelEdit}
                            onUpdate={handleUpdateRemark}
                            onDelete={handleDeleteRemark}
                            canEdit={canEditRemark}
                        />
                    </div>
                )}
            </div>

            {/* Add Remark */}
            {canAddRemarks ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Add New Remark</h4>
                    <form onSubmit={handleAddRemark} className="flex flex-col sm:flex-row gap-4 items-start">
                        <textarea
                            value={newRemark}
                            onChange={(e) => setNewRemark(e.target.value)}
                            placeholder="Type remark here..."
                            className="flex-1 w-full min-h-[80px] p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                        />
                        <button
                            type="submit"
                            disabled={addingRemark || !newRemark.trim()}
                            className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shrink-0"
                        >
                            {addingRemark ? <Loader2 className="animate-spin" size={18} /> : <><Plus size={18} /> Add</>}
                        </button>
                    </form>
                    <p className="text-xs text-gray-400 mt-2">
                        Remark will be logged under your current role automatically with Year {student.current_year}, Semester {student.current_semester}.
                    </p>
                </div>
            ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-yellow-800 font-medium">
                        You do not have permission to add remarks.
                    </p>
                </div>
            )}
        </div>
    );
};

const RemarkSection = ({
    title,
    category,
    remarks,
    icon,
    color,
    user,
    editingRemarkId,
    editingRemarkText,
    setEditingRemarkText,
    updatingRemark,
    deletingRemarkId,
    onEdit,
    onCancelEdit,
    onUpdate,
    onDelete,
    canEdit
}) => {
    const categoryRemarks = remarks.filter(r => r.remark_category === category);
    const colorClasses = {
        red: 'bg-red-50 border-red-100 text-red-800',
        blue: 'bg-blue-50 border-blue-100 text-blue-800',
        purple: 'bg-purple-50 border-purple-100 text-purple-800',
        amber: 'bg-amber-50 border-amber-100 text-amber-800',
        green: 'bg-green-50 border-green-100 text-green-800'
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-96">
            <div className={`px-4 py-2.5 border-b font-bold flex items-center gap-2 text-sm ${colorClasses[color]}`}>
                <span>{icon}</span> {title}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {categoryRemarks.length > 0 ? (
                    categoryRemarks.map(remark => (
                        <div key={remark.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm group">
                            {editingRemarkId === remark.id ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={editingRemarkText}
                                        onChange={(e) => setEditingRemarkText(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                                        rows={3}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onUpdate(remark.id)}
                                            disabled={updatingRemark}
                                            className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs"
                                        >
                                            {updatingRemark ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                            Save
                                        </button>
                                        <button
                                            onClick={onCancelEdit}
                                            disabled={updatingRemark}
                                            className="flex items-center gap-1 px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 disabled:opacity-50 text-xs"
                                        >
                                            <X size={12} /> Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-gray-800 whitespace-pre-wrap">{remark.remark}</p>
                                    <div className="mt-2 flex items-center justify-between text-xs">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium text-gray-600">{remark.created_by_name}</span>
                                            <span className="text-gray-400 flex items-center gap-1">
                                                <Clock size={10} />
                                                {new Date(remark.created_at).toLocaleString()}
                                                {remark.student_year && remark.student_semester && (
                                                    <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
                                                        Y{remark.student_year} S{remark.student_semester}
                                                    </span>
                                                )}
                                            </span>
                                            {remark.updated_at && (
                                                <span className="text-gray-400 italic text-[10px]">
                                                    Edited: {new Date(remark.updated_at).toLocaleString()}
                                                    {remark.updated_by && ` by ${remark.updated_by}`}
                                                </span>
                                            )}
                                        </div>
                                        {canEdit(remark) && (
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => onEdit(remark)}
                                                    className="p-1 hover:bg-blue-100 rounded text-blue-600"
                                                    title="Edit remark"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => onDelete(remark.id)}
                                                    disabled={deletingRemarkId === remark.id}
                                                    className="p-1 hover:bg-red-100 rounded text-red-600 disabled:opacity-50"
                                                    title="Delete remark"
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
                                </>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                        No remarks recorded
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentHistoryTab;

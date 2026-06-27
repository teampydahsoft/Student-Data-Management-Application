import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, User, Clock, Plus, Loader2, Filter,
    ChevronDown, Eye, X, MessageSquare, Edit2, Trash2, Check, History
} from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import TargetSelector from '../components/TargetSelector';
import useAuthStore from '../store/authStore';
import StudentHistoryLogs from '../components/Students/StudentHistoryLogs';

const StudentHistory = () => {
    // Selection state
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Data State
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // Filter state
    const [filterData, setFilterData] = useState({
        target_college: [],
        target_course: [],
        target_branch: [],
        target_batch: [],
        target_year: [],
        target_semester: []
    });

    // Pagination (Client side for now limit 500)
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch students when filters change
    const fetchStudents = async () => {
        const hasFilter = Object.values(filterData).some(val => val && val.length > 0);
        // If no filter, maybe don't load or load empty? User logic implies "selection of batch... and load"
        // Let's allow empty load (no students) until filter.
        if (!hasFilter) {
            setStudents([]);
            return;
        }

        setLoadingStudents(true);
        try {
            const params = new URLSearchParams();
            if (filterData.target_college?.length) params.append('college', filterData.target_college[0]);
            if (filterData.target_course?.length) params.append('course', filterData.target_course[0]);
            if (filterData.target_branch?.length) params.append('branch', filterData.target_branch[0]);
            if (filterData.target_batch?.length) params.append('batch', filterData.target_batch[0]);
            if (filterData.target_year?.length) params.append('year', filterData.target_year[0]);
            if (filterData.target_semester?.length) params.append('semester', filterData.target_semester[0]);

            const response = await api.get(`/student-history?${params.toString()}`);
            if (response.data.success) {
                setStudents(response.data.data);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load students');
        } finally {
            setLoadingStudents(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [filterData]);

    const handleViewStudent = (student) => {
        setSelectedStudent(student);
        setIsModalOpen(true);
    };

    const filteredStudents = useMemo(() => {
        if (!searchTerm) return students;
        const lowerSearch = searchTerm.toLowerCase();
        return students.filter(s =>
            s.student_name?.toLowerCase().includes(lowerSearch) ||
            s.admission_number?.toLowerCase().includes(lowerSearch)
        );
    }, [students, searchTerm]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 shadow-sm z-10 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Student History & Remarks</h1>
                    <p className="text-sm text-gray-500">View audit activity and remarks for regular students</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white px-6 py-4 border-b shadow-sm">
                <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
                    <div className="flex-1 w-full xl:w-auto">
                        <TargetSelector
                            formData={filterData}
                            setFormData={setFilterData}
                            layout="row"
                        />
                    </div>
                    {/* Search Bar - Inline with filters */}
                    <div className="relative w-full xl:w-64 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search in list..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden p-6 flex flex-col">
                {/* Results Count */}
                <div className="mb-4 flex justify-end items-center">
                    <div className="text-sm text-gray-500">

                        Showing {filteredStudents.length} students
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl shadow border overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Admission No</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Course / Branch</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Year / Sem</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {loadingStudents ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center">
                                            <div className="flex justify-center flex-col items-center gap-2">
                                                <Loader2 className="animate-spin text-blue-500" size={24} />
                                                <span className="text-gray-500">Loading students...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredStudents.length > 0 ? (
                                    filteredStudents.map((student) => (
                                        <tr key={student.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    {student.student_photo ? (
                                                        <img src={student.student_photo} alt="" className="w-9 h-9 rounded-full object-cover border" />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                                            <User size={16} />
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-gray-900">{student.student_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                                                {student.admission_number}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {student.course} - {student.branch}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {student.current_year} / {student.current_semester}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={() => handleViewStudent(student)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-sm font-medium transition-colors"
                                                >
                                                    <Eye size={16} /> View History
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                            {Object.values(filterData).some(v => v.length)
                                                ? 'No students found matching criteria'
                                                : <div className="flex flex-col items-center"><Filter size={32} className="mb-2 opacity-50" />Select filters above to load students</div>
                                            }
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Student Profile & Remarks Modal */}
            {isModalOpen && selectedStudent && (
                <StudentHistoryModal
                    student={selectedStudent}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
};

const StudentHistoryModal = ({ student, onClose }) => {
    const [activeTab, setActiveTab] = useState('audit');
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
        fetchRemarks();
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
        return isSuperAdmin || isCreator;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-scale-in">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-4">
                        {student.student_photo ? (
                            <img src={student.student_photo} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                                <User size={24} />
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{student.student_name}</h2>
                            <p className="text-sm text-gray-500">{student.admission_number} • {student.course} ({student.branch})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 border-b bg-white flex gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('audit')}
                        className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                            activeTab === 'audit'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <History size={16} /> Activity & Audit Log
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('remarks')}
                        className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                            activeTab === 'remarks'
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <MessageSquare size={16} /> Remarks
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
                    {activeTab === 'audit' ? (
                        <div className="flex-1 overflow-hidden">
                            <StudentHistoryLogs student={student} />
                        </div>
                    ) : (
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border shadow-sm text-sm">
                            <div>
                                <p className="text-gray-500 text-xs uppercase font-semibold">Batch</p>
                                <p className="font-medium text-gray-900">{student.batch || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-xs uppercase font-semibold">Current Status</p>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Regular</span>
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
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <MessageSquare className="text-blue-600" /> Remarks History
                        </h3>

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

                        {/* Add Remark */}
                        <div className="bg-white rounded-xl shadow-sm border p-4">
                            <h4 className="font-semibold text-gray-800 mb-2">Add New Remark</h4>
                            <form onSubmit={handleAddRemark} className="flex gap-4 items-start">
                                <textarea
                                    value={newRemark}
                                    onChange={(e) => setNewRemark(e.target.value)}
                                    placeholder="Type remark here..."
                                    className="flex-1 min-h-[80px] p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={addingRemark || !newRemark.trim()}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors shrink-0"
                                >
                                    {addingRemark ? <Loader2 className="animate-spin" size={18} /> : <><Plus size={18} /> Add</>}
                                </button>
                            </form>
                            <p className="text-xs text-gray-400 mt-2">
                                Remark will be logged under your current role automatically with Year {student.current_year}, Semester {student.current_semester}.
                            </p>
                        </div>
                    </div>
                </div>
                    )}
                </div>
            </div>
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
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-96">
            <div className={`px-4 py-2.5 border-b font-bold flex items-center gap-2 text-sm ${colorClasses[color]}`}>
                <span>{icon}</span> {title}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {categoryRemarks.length > 0 ? (
                    categoryRemarks.map(remark => (
                        <div key={remark.id} className="bg-gray-50 p-3 rounded-lg border text-sm group">
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

export default StudentHistory;

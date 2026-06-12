import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Ticket,
    Search,
    UserPlus,
    Edit,
    Eye,
    CheckCircle,
    Clock,
    XCircle,
    Filter
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import TicketDetailsModal from '../../components/admin/TicketDetailsModal';
import { TaskManagementSkeleton } from '../../components/SkeletonLoader';
import '../../styles/admin-pages.css';

const STATUS_COLORS = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    approaching: 'bg-blue-100 text-blue-800 border-blue-200',
    resolving: 'bg-purple-100 text-purple-800 border-purple-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    closed: 'bg-gray-100 text-gray-800 border-gray-200'
};

const STATUS_LABELS = {
    pending: 'Pending',
    approaching: 'Approaching',
    resolving: 'Resolving',
    completed: 'Completed',
    closed: 'Closed'
};

const TaskManagement = () => {
    const [activeTab, setActiveTab] = useState('pending'); // pending, assigned, resolved
    const [filters, setFilters] = useState({
        category_id: '',
        assigned_to: '',
        search: ''
    });
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [assignTab, setAssignTab] = useState('managers'); // 'managers' | 'workers'

    // Forms state
    const [assignForm, setAssignForm] = useState({ assigned_to: [], notes: '' });
    const [statusForm, setStatusForm] = useState({ status: '', notes: '' });
    const [commentForm, setCommentForm] = useState({ comment_text: '', is_internal: false });

    const queryClient = useQueryClient();

    // Map tabs to status array
    const getStatusesForTab = (tab) => {
        switch (tab) {
            case 'pending': return ['pending'];
            case 'assigned': return ['approaching', 'resolving'];
            case 'resolved': return ['completed', 'closed'];
            default: return [];
        }
    };

    // Queries
    const { data: ticketsData, isLoading } = useQuery({
        queryKey: ['tickets', activeTab, filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            // We fetch all or filter client side if backend doesn't support multiple stats well
            // For now, let's just fetch default list and filter client side for tabs to ensure accuracy
            params.append('page', '1');
            params.append('limit', '200'); // Fetch more to filter locally for now
            const response = await api.get(`/tickets?${params.toString()}`);
            return response.data;
        }
    });

    const { data: usersData } = useQuery({
        queryKey: ['rbac-users'],
        queryFn: async () => {
            const response = await api.get('/rbac/users');
            return response.data?.data || [];
        }
    });

    const { data: categoriesData } = useQuery({
        queryKey: ['complaint-categories'],
        queryFn: async () => {
            const response = await api.get('/complaint-categories');
            return response.data?.data || [];
        }
    });

    const { data: employeesData } = useQuery({
        queryKey: ['employees'],
        queryFn: async () => {
            const response = await api.get('/employees');
            return response.data?.data || [];
        }
    });

    // Mutations
    const assignMutation = useMutation({
        mutationFn: async ({ ticketId, data }) => {
            const response = await api.post(`/tickets/${ticketId}/assign`, data);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Ticket assigned successfully');
            setShowAssignModal(false);
            setAssignForm({ assigned_to: [], notes: '' });
            queryClient.invalidateQueries(['tickets']);
            if (selectedTicket) queryClient.invalidateQueries(['ticket', selectedTicket.id]);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to assign ticket')
    });

    const statusMutation = useMutation({
        mutationFn: async ({ ticketId, data }) => {
            const response = await api.put(`/tickets/${ticketId}/status`, data);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Status updated successfully');
            setShowStatusModal(false);
            setStatusForm({ status: '', notes: '' });
            queryClient.invalidateQueries(['tickets']);
            if (selectedTicket) queryClient.invalidateQueries(['ticket', selectedTicket.id]);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status')
    });

    const commentMutation = useMutation({
        mutationFn: async ({ ticketId, data }) => {
            const response = await api.post(`/tickets/${ticketId}/comments`, data);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Comment added successfully');
            setShowCommentModal(false);
            setCommentForm({ comment_text: '', is_internal: false });
            queryClient.invalidateQueries(['ticket', selectedTicket?.id]);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to add comment')
    });

    // Filter Logic
    const allTickets = ticketsData?.data || [];
    const filteredTickets = allTickets.filter(ticket => {
        const statuses = getStatusesForTab(activeTab);
        const matchesStatus = statuses.includes(ticket.status);
        const matchesCategory = filters.category_id ? ticket.category_id === parseInt(filters.category_id) : true;
        // const matchesAssignee = filters.assigned_to ? ... : true; // Complex logic if array, simplified for now
        const matchesSearch = filters.search ?
            ticket.title.toLowerCase().includes(filters.search.toLowerCase()) ||
            ticket.ticket_number.toLowerCase().includes(filters.search.toLowerCase())
            : true;

        return matchesStatus && matchesCategory && matchesSearch;
    });

    const managersList = employeesData?.filter(u => u.legacy_role !== 'worker' && u.role !== 'worker') || [];
    const workersList = employeesData?.filter(u => u.legacy_role === 'worker' || u.role === 'worker') || [];

    // Handlers
    const handleAssign = () => {
        if (assignForm.assigned_to.length === 0) return toast.error('Select at least one user');
        assignMutation.mutate({ ticketId: selectedTicket.id, data: assignForm });
    };

    const handleStatusUpdate = () => {
        if (!statusForm.status) return toast.error('Select a status');
        statusMutation.mutate({ ticketId: selectedTicket.id, data: statusForm });
    };

    // Modal Openers
    const openAssignModal = (ticket) => {
        setSelectedTicket(ticket);
        setAssignForm({ assigned_to: ticket.assignments?.map(a => a.assigned_to) || [], notes: '' });
        setShowAssignModal(true);
    };

    const openStatusModal = (ticket) => {
        setSelectedTicket(ticket);
        setStatusForm({ status: ticket.status, notes: '' });
        setShowStatusModal(true);
    };

    if (isLoading) {
        return <TaskManagementSkeleton />;
    }

    return (
        <div className="admin-page-container">
            {/* Header */}
            <div className="page-header animate-fade-in">
                <h1 className="page-title">Task Management</h1>
                <p className="page-subtitle">Track and manage support tickets</p>
            </div>

            {/* Main Content Card - Using CSSFlex via card-base */}
            <div className="card-base" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Tabs Section - Pure CSS */}
                <div className="admin-tabs-container">
                    <div className="admin-tabs-list">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`admin-tab-btn ${activeTab === 'pending' ? 'active-pending' : ''}`}
                        >
                            <Clock size={16} /> Pending
                        </button>
                        <button
                            onClick={() => setActiveTab('assigned')}
                            className={`admin-tab-btn ${activeTab === 'assigned' ? 'active-assigned' : ''}`}
                        >
                            <UserPlus size={16} /> Assigned / In Progress
                        </button>
                        <button
                            onClick={() => setActiveTab('resolved')}
                            className={`admin-tab-btn ${activeTab === 'resolved' ? 'active-resolved' : ''}`}
                        >
                            <CheckCircle size={16} /> Resolved
                        </button>
                    </div>
                </div>

                {/* Filters Section - Pure CSS */}
                <div className="admin-filters-section">
                    <div className="admin-filters-grid">
                        <div className="input-group-wrapper">
                            <Search className="input-icon" size={16} />
                            <input
                                type="text"
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                placeholder="Search by ID or Title..."
                                className="input-with-icon"
                            />
                        </div>
                        <div className="input-group-wrapper">
                            <Filter className="input-icon" size={16} />
                            <select
                                value={filters.category_id}
                                onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
                                className="input-with-icon"
                                style={{ appearance: 'none', cursor: 'pointer' }}
                            >
                                <option value="">All Categories</option>
                                {categoriesData?.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Table Section - Pure CSS */}
                <div className="admin-table-scroll-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Ref #</th>
                                <th>Title</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTickets.length > 0 ? (
                                filteredTickets.map((ticket) => (
                                    <tr key={ticket.id}>
                                        <td>
                                            <span className="text-sm font-bold text-gray-900">{ticket.ticket_number}</span>
                                            <div className="text-xs text-gray-500 mt-0.5">{new Date(ticket.created_at).toLocaleDateString()}</div>
                                        </td>
                                        <td>
                                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{ticket.title}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{ticket.requester_name || ticket.student_name || ticket.staff_requester_name || 'Staff'}</div>
                                        </td>
                                        <td>
                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200">
                                                {ticket.category_name}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${STATUS_COLORS[ticket.status]}`}>
                                                {STATUS_LABELS[ticket.status]}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setSelectedTicket(ticket)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="View Details">
                                                    <Eye size={18} />
                                                </button>
                                                <button onClick={() => openAssignModal(ticket)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-100" title="Assign">
                                                    <UserPlus size={18} />
                                                </button>
                                                <button onClick={() => openStatusModal(ticket)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100" title="Update Status">
                                                    <Edit size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" style={{ padding: '4rem 0', textAlign: 'center' }}>
                                        <div className="flex flex-col items-center justify-center text-gray-500">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                                <Ticket size={32} className="text-gray-300" />
                                            </div>
                                            <p className="text-lg font-medium text-gray-900">No tickets found</p>
                                            <p className="text-sm mt-1">Try adjusting your filters or check back later</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {selectedTicket && !showAssignModal && !showStatusModal && !showCommentModal && (
                <TicketDetailsModal
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onAssign={() => openAssignModal(selectedTicket)}
                    onStatusUpdate={() => openStatusModal(selectedTicket)}
                    onAddComment={() => {
                        setSelectedTicket(selectedTicket);
                        setShowCommentModal(true);
                    }}
                />
            )}

            {/* Assign Modal */}
            {showAssignModal && selectedTicket && (
                <div className="modal-overlay backdrop-blur-sm bg-gray-900/50">
                    <div className="modal-content animate-fade-in modal-md shadow-2xl rounded-2xl border border-gray-100 transform scale-100 transition-all">
                        <div className="modal-header border-b border-gray-100 p-5 bg-white rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Assign Ticket</h2>
                                <p className="text-sm text-gray-500 mt-1">Select personnel to handle this request</p>
                            </div>
                            <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="modal-body p-6 bg-gray-50/50">
                            {/* Tabs */}
                            <div className="flex items-center p-1.5 bg-gray-200/60 rounded-xl mb-6 select-none relative z-10">
                                <button
                                    onClick={() => setAssignTab('managers')}
                                    className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ease-out ${assignTab === 'managers'
                                        ? 'bg-white text-primary shadow-sm ring-1 ring-black/5 scale-[1.02]'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                                        }`}
                                >
                                    <span>Managers</span>
                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${assignTab === 'managers' ? 'bg-primary/10 text-primary-dark' : 'bg-gray-300/50 text-gray-600'
                                        }`}>
                                        {managersList.length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setAssignTab('workers')}
                                    className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ease-out ${assignTab === 'workers'
                                        ? 'bg-white text-primary shadow-sm ring-1 ring-black/5 scale-[1.02]'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                                        }`}
                                >
                                    <span>Workers</span>
                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${assignTab === 'workers' ? 'bg-primary/10 text-primary-dark' : 'bg-gray-300/50 text-gray-600'
                                        }`}>
                                        {workersList.length}
                                    </span>
                                </button>
                            </div>

                            <div className="max-h-[350px] overflow-y-auto px-1 custom-scrollbar">
                                {assignTab === 'managers' && (
                                    <div className="space-y-2 animate-fade-in">
                                        {managersList.length > 0 ? (
                                            managersList.map((user) => {
                                                const userId = user.rbac_user_id || user.id;
                                                return (
                                                    <label key={user.id} className={`group flex items-start p-3.5 rounded-xl cursor-pointer transition-all border-2 ${assignForm.assigned_to.includes(userId)
                                                        ? 'bg-blue-50 border-blue-500 shadow-sm'
                                                        : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-200 shadow-sm'
                                                        }`}>
                                                        <div className="mt-1 relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={assignForm.assigned_to.includes(userId)}
                                                                onChange={() => {
                                                                    const newAssigned = assignForm.assigned_to.includes(userId)
                                                                        ? assignForm.assigned_to.filter(id => id !== userId)
                                                                        : [...assignForm.assigned_to, userId];
                                                                    setAssignForm({ ...assignForm, assigned_to: newAssigned });
                                                                }}
                                                                className="peer appearance-none w-5 h-5 rounded-md border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-4 focus:ring-blue-600/20 transition-all cursor-pointer"
                                                            />
                                                            <CheckCircle className="w-3.5 h-3.5 text-white absolute top-[5px] left-[5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-all scale-50 peer-checked:scale-100" strokeWidth={3} />
                                                        </div>

                                                        <div className="ml-4 flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className={`font-semibold text-sm ${assignForm.assigned_to.includes(userId) ? 'text-gray-900' : 'text-gray-700'}`}>
                                                                    {user.name}
                                                                </span>
                                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${user.active_tickets_count > 0
                                                                    ? 'bg-orange-100 text-orange-700'
                                                                    : 'bg-green-100 text-green-700'
                                                                    }`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${user.active_tickets_count > 0 ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                                                                    {user.active_tickets_count || 0} active
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between w-full">
                                                                <div className="flex items-center text-xs text-blue-700 font-medium">
                                                                    <span className="truncate">@{user.username}</span>
                                                                </div>
                                                                <div className="text-[10px] px-2 py-0.5 text-blue-800 bg-blue-100 rounded-lg">
                                                                    {user.role_display_name || user.role}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </label>
                                                )
                                            })
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                    <UserPlus size={32} className="text-gray-300" strokeWidth={1.5} />
                                                </div>
                                                <p className="text-sm font-medium text-gray-500">No managers found</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {assignTab === 'workers' && (
                                    <div className="space-y-2 animate-fade-in">
                                        {workersList.length > 0 ? (
                                            workersList.map((user) => {
                                                const userId = user.rbac_user_id || user.id;
                                                return (
                                                    <label key={user.id} className={`group flex items-start p-3.5 rounded-xl cursor-pointer transition-all border-2 ${assignForm.assigned_to.includes(userId)
                                                        ? 'bg-blue-50 border-blue-500 shadow-sm'
                                                        : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-200 shadow-sm'
                                                        }`}>
                                                        <div className="mt-1 relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={assignForm.assigned_to.includes(userId)}
                                                                onChange={() => {
                                                                    const newAssigned = assignForm.assigned_to.includes(userId)
                                                                        ? assignForm.assigned_to.filter(id => id !== userId)
                                                                        : [...assignForm.assigned_to, userId];
                                                                    setAssignForm({ ...assignForm, assigned_to: newAssigned });
                                                                }}
                                                                className="peer appearance-none w-5 h-5 rounded-md border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-4 focus:ring-blue-600/20 transition-all cursor-pointer"
                                                            />
                                                            <CheckCircle className="w-3.5 h-3.5 text-white absolute top-[5px] left-[5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-all scale-50 peer-checked:scale-100" strokeWidth={3} />
                                                        </div>

                                                        <div className="ml-4 flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className={`font-semibold text-sm ${assignForm.assigned_to.includes(userId) ? 'text-gray-900' : 'text-gray-700'}`}>
                                                                    {user.name}
                                                                </span>
                                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${user.active_tickets_count > 0
                                                                    ? 'bg-orange-100 text-orange-700'
                                                                    : 'bg-green-100 text-green-700'
                                                                    }`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${user.active_tickets_count > 0 ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                                                                    {user.active_tickets_count || 0} active
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between w-full">
                                                                <div className="flex items-center text-xs text-blue-700 font-medium">
                                                                    <span className="truncate">@{user.username}</span>
                                                                </div>
                                                                <div className="text-[10px] px-2 py-0.5 text-blue-800 bg-blue-100 rounded-lg">
                                                                    {user.role_display_name || user.role}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </label>
                                                )
                                            })
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                    <UserPlus size={32} className="text-gray-300" strokeWidth={1.5} />
                                                </div>
                                                <p className="text-sm font-medium text-gray-500">No workers found</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer p-5 border-t border-gray-100 bg-white rounded-b-2xl flex items-center justify-end gap-3">
                            <button onClick={() => setShowAssignModal(false)} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors">Cancel</button>
                            <button onClick={handleAssign} disabled={assignMutation.isPending} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/30 disabled:opacity-70 disabled:shadow-none transition-all transform hover:scale-[1.02] active:scale-[0.98]">
                                {assignMutation.isPending ? 'Assigning...' : 'Assign Selected'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Modal */}
            {showStatusModal && selectedTicket && (
                <div className="modal-overlay">
                    <div className="modal-content animate-fade-in modal-sm">
                        <div className="modal-header">
                            <h2 className="modal-title">Update Status</h2>
                            <button onClick={() => setShowStatusModal(false)} className="modal-close-btn"><XCircle size={24} /></button>
                        </div>
                        <div className="modal-body">
                            <div>
                                <label className="form-label">New Status</label>
                                <select
                                    value={statusForm.status}
                                    onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                                    className="form-input cursor-pointer"
                                >
                                    <option value="">Select Status</option>
                                    {Object.entries(STATUS_LABELS)
                                        .filter(([k]) => k !== 'closed')
                                        .map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setShowStatusModal(false)} className="btn-secondary">Cancel</button>
                            <button onClick={handleStatusUpdate} disabled={statusMutation.isPending} className="btn-primary">
                                {statusMutation.isPending ? 'Updating...' : 'Update Status'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Comment Modal */}
            {showCommentModal && selectedTicket && (
                <div className="modal-overlay">
                    <div className="modal-content animate-fade-in modal-md">
                        <div className="modal-header">
                            <h2 className="modal-title">Add Comment</h2>
                            <button onClick={() => setShowCommentModal(false)} className="modal-close-btn"><XCircle size={24} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="space-y-4">
                                <div>
                                    <label className="form-label">Comment</label>
                                    <textarea
                                        value={commentForm.comment_text}
                                        onChange={(e) => setCommentForm({ ...commentForm, comment_text: e.target.value })}
                                        className="form-input min-h-[100px]"
                                        placeholder="Type your comment here..."
                                    />
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={commentForm.is_internal}
                                        onChange={(e) => setCommentForm({ ...commentForm, is_internal: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Internal Note (Visible only to staff)</span>
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setShowCommentModal(false)} className="btn-secondary">Cancel</button>
                            <button
                                onClick={() => {
                                    if (!commentForm.comment_text.trim()) return toast.error('Please enter a comment');
                                    commentMutation.mutate({ ticketId: selectedTicket.id, data: commentForm });
                                }}
                                disabled={commentMutation.isPending}
                                className="btn-primary"
                            >
                                {commentMutation.isPending ? 'Adding...' : 'Add Comment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskManagement;

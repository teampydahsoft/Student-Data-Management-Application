import React from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    UserPlus,
    Edit,
    MessageSquare,
    Star,
    Clock,
    User,
    CheckCircle,
    AlertCircle,
    MapPin
} from 'lucide-react';
import TicketStepper from './TicketStepper';

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

const TicketDetailsModal = ({ ticket, onClose, onAssign, onStatusUpdate, onAddComment }) => {
    if (!ticket) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className="fixed inset-0"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white z-20">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Ticket Details</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded">
                                Ref: {ticket.ticket_number}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock size={12} />
                                {new Date(ticket.created_at).toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">

                    {/* Stepper */}
                    <div className="py-2">
                        <TicketStepper status={ticket.status} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Left Column: Details */}
                        <div className="md:col-span-2 space-y-6">

                            {/* Main Info Card */}
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Subject</label>
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{ticket.title}</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Category</label>
                                        <div className="font-medium text-gray-900">
                                            {ticket.category_name}
                                            {ticket.sub_category_name && (
                                                <span className="text-gray-500 text-sm block">› {ticket.sub_category_name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Student</label>
                                        <div className="font-medium text-gray-900">{ticket.student_name}</div>
                                        <div className="text-sm text-gray-500">{ticket.admission_number}</div>
                                    </div>
                                </div>

                                {/* Physical Location Details */}
                                {(ticket.college_name || ticket.block_no || ticket.floor_no || ticket.room_no) && (
                                    <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl space-y-2">
                                        <div className="text-[11px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <MapPin size={14} className="text-blue-600" /> Physical Location
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-xs font-bold text-blue-900">
                                            {ticket.college_name && (
                                                <div>
                                                    <span className="text-[10px] text-blue-500 uppercase block font-semibold">College</span>
                                                    <span>{ticket.college_name}</span>
                                                </div>
                                            )}
                                            {ticket.block_no && (
                                                <div>
                                                    <span className="text-[10px] text-blue-500 uppercase block font-semibold">Block</span>
                                                    <span>{ticket.block_no}</span>
                                                </div>
                                            )}
                                            {ticket.floor_no && (
                                                <div>
                                                    <span className="text-[10px] text-blue-500 uppercase block font-semibold">Floor</span>
                                                    <span>{ticket.floor_no}</span>
                                                </div>
                                            )}
                                            {ticket.room_no && (
                                                <div>
                                                    <span className="text-[10px] text-blue-500 uppercase block font-semibold">Room No</span>
                                                    <span>{ticket.room_no}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Description</label>
                                    <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                                        {ticket.description || <span className="italic text-gray-400">No description provided.</span>}
                                    </p>
                                </div>
                            </div>

                            {/* Photo */}
                            {ticket.photo_url && (
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Attachment</label>
                                    <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                        <img src={ticket.photo_url} alt="Ticket attachment" className="w-full h-auto max-h-[300px] object-contain" />
                                    </div>
                                </div>
                            )}

                            {/* Comments Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <MessageSquare size={20} className="text-gray-400" />
                                        Comments History
                                    </h3>
                                </div>

                                {ticket.comments && ticket.comments.length > 0 ? (
                                    <div className="space-y-4">
                                        {ticket.comments.map((comment) => (
                                            <div
                                                key={comment.id}
                                                className={`p-4 rounded-xl border ${comment.is_internal ? 'bg-yellow-50 border-yellow-100' : 'bg-white border-gray-100'}`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${comment.is_internal ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {comment.user_name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">{comment.user_name}</p>
                                                            <p className="text-xs text-gray-500">{new Date(comment.created_at).toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                    {comment.is_internal && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Internal Note</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-700 ml-10">{comment.comment_text}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                        <MessageSquare className="mx-auto text-gray-300 mb-2" size={24} />
                                        <p className="text-sm text-gray-500">No comments yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Meta & Actions */}
                        <div className="space-y-6">
                            {/* Status Box */}
                            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Current Status</label>
                                <div className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${STATUS_COLORS[ticket.status] || 'bg-gray-100'}`}>
                                    {STATUS_LABELS[ticket.status] || ticket.status}
                                </div>
                            </div>

                            {/* Assignments Box */}
                            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Assigned Staff</label>
                                {ticket.assignments && ticket.assignments.length > 0 ? (
                                    <div className="space-y-3">
                                        {ticket.assignments.map((assignment) => (
                                            <div key={assignment.id} className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                    <User size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{assignment.assigned_to_name}</p>
                                                    <p className="text-xs text-gray-500 capitalize">{assignment.assigned_to_role}</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                                        {new Date(assignment.assigned_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500 italic flex items-center gap-2">
                                        <AlertCircle size={14} /> Not assigned yet
                                    </div>
                                )}
                            </div>

                            {/* Feedback Box (if completed) */}
                            {ticket.feedback && (
                                <div className="bg-green-50 rounded-xl border border-green-100 p-4">
                                    <label className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                        <Star size={12} className="fill-green-700" /> Student Feedback
                                    </label>
                                    <div className="flex items-center gap-1 mb-2">
                                        <span className="text-2xl font-bold text-green-800">{ticket.feedback.rating}</span>
                                        <span className="text-sm text-green-600 font-medium">/ 5</span>
                                    </div>
                                    {ticket.feedback.feedback_text && (
                                        <p className="text-sm text-green-800 italic">"{ticket.feedback.feedback_text}"</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-end gap-3 z-20">
                    <button
                        onClick={onAssign}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                        <UserPlus size={18} />
                        Assign Staff
                    </button>
                    <button
                        onClick={onStatusUpdate}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                        <Edit size={18} />
                        Update Status
                    </button>
                    <button
                        onClick={onAddComment}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                        <MessageSquare size={18} />
                        Add Comment
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default TicketDetailsModal;

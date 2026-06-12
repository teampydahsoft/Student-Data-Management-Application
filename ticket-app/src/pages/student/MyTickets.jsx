import React, { useState } from 'react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    Ticket,
    Plus,
    Eye,
    Clock,
    CheckCircle,
    X,
    MessageSquare,
    Star,
    Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { resolveTicketPhotoUrl } from '../../utils/ticketPhoto';
import '../../styles/student-pages.css';

const STATUS_CLASSES = {
    pending: 'status-pending',
    approaching: 'status-active',
    resolving: 'status-active',
    completed: 'status-completed',
    closed: 'status-closed'
};

const STATUS_LABELS = {
    pending: 'Pending',
    approaching: 'Approaching',
    resolving: 'Resolving',
    completed: 'Completed',
    closed: 'Closed'
};

const MyTickets = () => {
    const queryClient = useQueryClient();
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackForm, setFeedbackForm] = useState({ rating: 5, feedback_text: '' });

    // Fetch student tickets
    const { data: ticketsData, isLoading } = useQuery({
        queryKey: ['student-tickets'],
        queryFn: async () => {
            const response = await api.get('/tickets/student');
            return response.data?.data || [];
        },
        staleTime: 0,
        refetchOnMount: 'always'
    });

    // Fetch ticket details
    const { data: ticketDetails } = useQuery({
        queryKey: ['ticket', selectedTicket?.id],
        queryFn: async () => {
            const response = await api.get(`/tickets/${selectedTicket.id}`);
            return response.data?.data;
        },
        enabled: !!selectedTicket
    });

    // Submit feedback mutation
    const feedbackMutation = useMutation({
        mutationFn: async ({ ticketId, data }) => {
            const response = await api.post(`/tickets/${ticketId}/feedback`, data);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Feedback submitted successfully');
            setShowFeedbackModal(false);
            setFeedbackForm({ rating: 5, feedback_text: '' });
            setSelectedTicket(null);
            queryClient.invalidateQueries(['student-tickets']);
            if (selectedTicket?.id) {
                queryClient.invalidateQueries(['ticket', selectedTicket.id]);
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || 'Failed to submit feedback');
        }
    });

    const tickets = ticketsData || [];
    const ticket = ticketDetails || selectedTicket;

    const reopenMutation = useMutation({
        mutationFn: async (ticketId) => {
            const response = await api.put(`/tickets/${ticketId}/status`, {
                status: 'pending',
                notes: 'Reopened by student (Not Satisfied)'
            });
            return response.data;
        },
        onSuccess: () => {
            toast.success('Ticket reopened successfully');
            setSelectedTicket(null);
            queryClient.invalidateQueries(['student-tickets']);
            if (selectedTicket?.id) {
                queryClient.invalidateQueries(['ticket', selectedTicket.id]);
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || 'Failed to reopen ticket');
        }
    });

    const handleReopen = () => {
        if (!selectedTicket) return;
        if (window.confirm('Are you sure you want to reopen this ticket? logic will restart.')) {
            reopenMutation.mutate(selectedTicket.id);
        }
    };

    const handleFeedbackSubmit = () => {
        if (!feedbackForm.rating) {
            toast.error('Please provide a rating');
            return;
        }
        feedbackMutation.mutate({
            ticketId: selectedTicket.id,
            data: feedbackForm
        });
    };

    if (isLoading) {
        return (
            <div className="student-page-container animate-pulse">
                <div className="flex-col md:flex-row flex-between pb-2 border-b border-gray-100" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div className="page-header" style={{ marginBottom: 0 }}>
                        <SkeletonBox height="h-4" width="w-32" className="mb-2" />
                        <SkeletonBox height="h-8" width="w-48" className="mb-2" />
                        <SkeletonBox height="h-4" width="w-64" />
                    </div>
                    <SkeletonBox height="h-10" width="w-40" rounded="rounded-lg" />
                </div>
                <div className="flex-col" style={{ gap: '1.25rem', marginTop: '1.5rem' }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="ticket-item" style={{ height: '140px' }}>
                            <div className="flex justify-between items-start w-full gap-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex gap-4 items-center mb-4">
                                        <SkeletonBox height="h-6" width="w-48" />
                                        <SkeletonBox height="h-6" width="w-24" rounded="rounded-full" />
                                    </div>
                                    <div className="flex gap-4 mb-4">
                                        <SkeletonBox height="h-8" width="w-24" rounded="rounded-lg" />
                                        <SkeletonBox height="h-8" width="w-32" rounded="rounded-lg" />
                                        <SkeletonBox height="h-8" width="w-32" rounded="rounded-lg" />
                                    </div>
                                    <SkeletonBox height="h-4" width="w-full" />
                                </div>
                                <SkeletonBox height="h-10" width="w-10" rounded="rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="student-page-container animate-fade-in-up">
            {/* Header Section */}
            <div className="flex-col md:flex-row flex-between pb-2 border-b border-gray-100" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2563eb', marginBottom: '0.25rem' }}>
                        <Ticket size={16} />
                        <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2em' }}>Support Center</span>
                    </div>
                    <h1 className="page-title">
                        My Tickets
                    </h1>
                    <p className="page-subtitle">
                        Track and manage your assistance requests
                    </p>
                </div>
                <Link
                    to="/student/raise-ticket"
                    className="btn-primary"
                >
                    <Plus size={20} />
                    <span>Raise New Ticket</span>
                </Link>
            </div>

            {/* Content Area */}
            <AnimatePresence mode="wait">
                {tickets.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="empty-state"
                    >
                        <div className="relative z-10 max-w-md mx-auto">
                            <div className="empty-state-icon">
                                <Ticket className="text-blue-600" size={48} color="#2563eb" />
                            </div>
                            <h3 className="heading-font" style={{ fontSize: '1.875rem', fontWeight: 900, color: '#111827', marginBottom: '1rem' }}>
                                No Active Tickets
                            </h3>
                            <p className="body-font" style={{ color: '#6b7280', marginBottom: '2.5rem', fontWeight: 500, lineHeight: 1.6 }}>
                                Everything looks good! You haven't raised any complaints or assistance requests yet.
                            </p>
                            <Link
                                to="/student/raise-ticket"
                                className="btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 2rem' }}
                            >
                                <Sparkles size={20} color="#60a5fa" />
                                <span>Create Your First Ticket</span>
                                <Plus size={20} />
                            </Link>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex-col" style={{ gap: '1.25rem' }}>
                        {tickets.map((ticket, index) => (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                key={ticket.id}
                                className="ticket-item"
                                style={{ position: 'relative', overflow: 'hidden' }}
                            >
                                <div className="flex-start" style={{ width: '100%', gap: '1.5rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                    <div style={{ flex: 1 }}>
                                        <div className="flex-start" style={{ gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                            <h3 className="heading-font" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>{ticket.title}</h3>
                                            <span className={`status-badge ${STATUS_CLASSES[ticket.feedback?.id ? 'closed' : ticket.status] || 'status-pending'}`}>
                                                {STATUS_LABELS[ticket.feedback?.id ? 'closed' : ticket.status] || ticket.status}
                                            </span>
                                        </div>

                                        <div className="flex-start" style={{ gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #f3f4f6' }}>
                                                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>ID:</span>
                                                <code style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb' }}>{ticket.ticket_number}</code>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #f3f4f6' }}>
                                                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Type:</span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>{ticket.category_name}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #f3f4f6' }}>
                                                <Clock size={12} color="#9ca3af" />
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563' }}>{new Date(ticket.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        {ticket.description && (
                                            <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5, maxWidth: '40rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ticket.description}</p>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', alignSelf: 'center' }}>
                                        <button
                                            onClick={() => setSelectedTicket(ticket)}
                                            style={{ padding: '0.75rem', color: '#2563eb', backgroundColor: '#eff6ff', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                                            title="View Details"
                                        >
                                            <Eye size={22} />
                                        </button>

                                        {ticket.status === 'completed' && (!ticket.feedback || (ticket.feedback && !ticket.feedback.id)) && (
                                            <button
                                                onClick={() => setSelectedTicket(ticket)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.75rem 1rem',
                                                    backgroundColor: '#16a34a',
                                                    color: 'white',
                                                    borderRadius: '0.75rem',
                                                    border: 'none',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)'
                                                }}
                                            >
                                                <MessageSquare size={18} />
                                                <span>Review</span>
                                            </button>
                                        )}

                                        {(ticket.status === 'completed' || ticket.status === 'closed') && ticket.feedback && ticket.feedback.id && (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.75rem 1rem',
                                                color: '#15803d',
                                                backgroundColor: '#dcfce7',
                                                borderRadius: '0.75rem',
                                                border: '1px solid #bbf7d0',
                                                fontWeight: '600',
                                                fontSize: '0.875rem'
                                            }}>
                                                <CheckCircle size={18} />
                                                <span>Reviewed</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </AnimatePresence>

            {/* Modal Section */}
            {selectedTicket && !showFeedbackModal && (
                <TicketDetailsModal
                    ticket={ticket}
                    onClose={() => setSelectedTicket(null)}
                    onFeedback={() => {
                        if (selectedTicket.status === 'completed' && !selectedTicket.feedback) {
                            setShowFeedbackModal(true);
                        }
                    }}
                    onReopen={handleReopen}
                />
            )}

            {showFeedbackModal && selectedTicket && (
                <FeedbackModal
                    ticket={selectedTicket}
                    form={feedbackForm}
                    setForm={setFeedbackForm}
                    onClose={() => {
                        setShowFeedbackModal(false);
                        setSelectedTicket(null);
                    }}
                    onSubmit={handleFeedbackSubmit}
                    loading={feedbackMutation.isPending}
                />
            )}
        </div>
    );
};

// Ticket Details Modal
import { createPortal } from 'react-dom';

const TicketStepper = ({ status }) => {
    const steps = [
        { label: 'Submitted', value: 'pending' },
        { label: 'Assigned', value: 'approaching' },
        { label: 'In Progress', value: 'resolving' },
        { label: 'Resolved', value: 'completed' }
    ];

    const currentStepIndex = steps.findIndex(s => s.value === status) === -1
        ? (status === 'closed' ? 3 : 0)
        : steps.findIndex(s => s.value === status);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', margin: '2rem 0' }}>
            {/* Progress Bar Background */}
            <div style={{ position: 'absolute', top: '1.25rem', left: '0', right: '0', height: '0.25rem', backgroundColor: '#eff6ff', zIndex: 0 }}></div>
            {/* Active Progress Bar */}
            <div style={{
                position: 'absolute',
                top: '1.25rem',
                left: '0',
                height: '0.25rem',
                backgroundColor: '#2563eb',
                zIndex: 0,
                width: `${(currentStepIndex / (steps.length - 1)) * 100}%`,
                transition: 'width 0.5s ease'
            }}></div>

            {steps.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', zIndex: 1, flex: 1 }}>
                        <div style={{
                            width: '2.5rem',
                            height: '2.5rem',
                            borderRadius: '50%',
                            backgroundColor: isCompleted ? '#2563eb' : '#eff6ff',
                            border: isCurrent ? '4px solid #dbeafe' : '4px solid white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isCompleted ? 'white' : '#9ca3af',
                            transition: 'all 0.3s ease',
                            boxShadow: isCurrent ? '0 0 0 2px #2563eb' : 'none'
                        }}>
                            {isCompleted ? <CheckCircle size={16} /> : <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{index + 1}</span>}
                        </div>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: isCompleted ? '#111827' : '#9ca3af',
                            textAlign: 'center'
                        }}>
                            {step.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const TicketDetailsModal = ({ ticket, onClose, onFeedback, onReopen }) => {
    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="modal-content"
                style={{ position: 'relative', zIndex: 10000, maxHeight: '85vh', margin: '2rem' }}
            >
                {/* Header Container */}
                <div className="modal-header">
                    <div>
                        <h2 className="heading-font" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827' }}>Ticket Details</h2>
                        <p style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.125rem' }}>Reference: {ticket.ticket_number}</p>
                    </div>
                    <button onClick={onClose} style={{ padding: '0.75rem', backgroundColor: '#f3f4f6', color: '#6b7280', borderRadius: '1rem', border: 'none', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body-responsive">
                    {/* Status Stepper */}
                    <TicketStepper status={ticket.status} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                <label style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#9ca3af', letterSpacing: '0.05em' }}>Category & Type</label>
                                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                                    {ticket.category_name}
                                    {ticket.sub_category_name && <span style={{ color: '#2563eb', marginLeft: '0.5rem' }}>› {ticket.sub_category_name}</span>}
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                <label style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#9ca3af', letterSpacing: '0.05em' }}>Subject</label>
                                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>{ticket.title}</p>
                            </div>
                        </div>

                        {(ticket.photo_url || ticket.has_photo) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#9ca3af', letterSpacing: '0.05em' }}>Evidence / Attachment</label>
                                <div style={{ borderRadius: '1.5rem', overflow: 'hidden', border: '4px solid #f9fafb', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.06)' }}>
                                    <img
                                        src={resolveTicketPhotoUrl(ticket.photo_url)}
                                        alt="Ticket attachment"
                                        style={{ width: '100%', height: '12rem', objectFit: 'cover' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <label style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#9ca3af', letterSpacing: '0.05em' }}>Detailed Description</label>
                        <div style={{ padding: '1.5rem', backgroundColor: '#f9fafb', borderRadius: '1.5rem', border: '1px solid #f3f4f6', minHeight: '6rem' }}>
                            {ticket.description ? (
                                <p style={{ color: '#374151', lineHeight: 1.6, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
                            ) : (
                                <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.875rem' }}>No detailed description provided.</p>
                            )}
                        </div>
                    </div>

                    {/* Feedback Display if exists */}
                    {ticket.feedback && (
                        <div style={{ padding: '2rem', backgroundColor: '#f0fdf4', borderRadius: '2rem', border: '1px solid #bbf7d0', position: 'relative', overflow: 'hidden' }}>
                            <h4 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#14532d', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MessageSquare size={20} />
                                Your Feedback
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <Star
                                            key={star}
                                            size={20}
                                            className={star <= ticket.feedback.rating ? "text-green-600" : "text-green-200"}
                                            fill={star <= ticket.feedback.rating ? "currentColor" : "none"}
                                        />
                                    ))}
                                </div>
                                <span style={{ fontWeight: 900, color: '#15803d', marginLeft: '0.5rem', fontSize: '1.25rem' }}>{ticket.feedback.rating}/5</span>
                            </div>
                            {ticket.feedback.feedback_text && (
                                <p style={{ color: '#166534', fontWeight: 500, lineHeight: 1.6 }}>{ticket.feedback.feedback_text}</p>
                            )}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div style={{ paddingTop: '2rem', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
                        {ticket.status === 'completed' && !ticket.feedback && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>Are you satisfied with the resolution?</span>

                                <button
                                    onClick={onReopen}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: '0.75rem',
                                        border: '1px solid #fecaca',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Not Satisfied
                                </button>

                                <button
                                    onClick={onFeedback}
                                    className="btn-primary"
                                    style={{ backgroundColor: '#16a34a' }}
                                >
                                    Satisfied
                                </button>
                            </div>
                        )}
                        {(!ticket.status?.includes('completed') || ticket.feedback) && (
                            <button
                                onClick={onClose}
                                className="btn-secondary"
                            >
                                Close Details
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

// Feedback Modal
const FeedbackModal = ({ ticket, form, setForm, onClose, onSubmit, loading }) => {
    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="modal-content"
                style={{ maxWidth: '28rem', borderRadius: '2.5rem', overflow: 'hidden', position: 'relative', zIndex: 10000, margin: '1rem' }}
            >
                <div style={{ padding: '2rem', borderBottom: '1px solid #f9fafb', textAlign: 'center' }}>
                    <div style={{ width: '4rem', height: '4rem', backgroundColor: '#f0fdf4', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                        <CheckCircle className="text-green-600" size={32} color="#16a34a" />
                    </div>
                    <h2 className="heading-font" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827' }}>Rate Resolution</h2>
                    <p style={{ color: '#6b7280', fontWeight: 500, marginTop: '0.25rem' }}>How was your experience with Ticket #{ticket.ticket_number}?</p>
                </div>

                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Select Rating</label>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                            {[1, 2, 3, 4, 5].map((rating) => (
                                <button
                                    key={rating}
                                    type="button"
                                    onClick={() => setForm({ ...form, rating })}
                                    style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', transform: form.rating >= rating ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }}
                                >
                                    <Star
                                        size={40}
                                        color={form.rating >= rating ? '#facc15' : '#d1d5db'}
                                        fill={form.rating >= rating ? '#facc15' : 'none'}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#9ca3af', letterSpacing: '0.05em', paddingLeft: '0.25rem' }}>Detailed Feedback</label>
                        <textarea
                            value={form.feedback_text}
                            onChange={(e) => setForm({ ...form, feedback_text: e.target.value })}
                            className="form-textarea"
                            rows={4}
                            placeholder="Tell us what we did great or how we can improve..."
                            style={{ resize: 'none' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.5rem' }}>
                        <button
                            onClick={onSubmit}
                            disabled={loading || !form.rating}
                            className="btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1.125rem' }}
                        >
                            {loading ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{ width: '100%', padding: '0.75rem', color: '#6b7280', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            Maybe Later
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default MyTickets;

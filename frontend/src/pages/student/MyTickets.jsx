import React, { useState } from 'react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Ticket,
  Plus,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
  Star,
  Sparkles,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../config/api';

import toast from 'react-hot-toast';

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

const MyTickets = () => {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, feedback_text: '' });

  // Fetch student tickets
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['student-tickets'],
    queryFn: async () => {
      const response = await api.get('/tickets/student/my-tickets');
      return response.data?.data || [];
    }
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
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to submit feedback');
    }
  });

  const tickets = ticketsData || [];
  const ticket = ticketDetails || selectedTicket;

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
      <div className="max-w-6xl mx-auto p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBox height="h-8" width="w-48" />
            <SkeletonBox height="h-4" width="w-64" />
          </div>
          <SkeletonBox height="h-10" width="w-40" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <SkeletonBox height="h-6" width="w-64" />
                    <SkeletonBox height="h-6" width="w-24" className="rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <SkeletonBox height="h-4" width="w-48" />
                    <SkeletonBox height="h-4" width="w-56" />
                    <SkeletonBox height="h-4" width="w-40" />
                  </div>
                  <SkeletonBox height="h-16" width="w-full" className="rounded-lg" />
                </div>
                <div className="ml-4">
                  <SkeletonBox height="h-10" width="w-10" className="rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-12"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Ticket size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Support Portal</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-gray-900 heading-font tracking-tight">
            Ticket History
          </h1>
          <p className="text-gray-500 text-sm lg:text-base font-medium">
            View and track your previous assistance requests
          </p>
        </div>
        <Link
          to="/student/raise-ticket"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all hover:-translate-y-1 active:scale-95"
        >
          <Plus size={20} className="transition-transform group-hover:rotate-90 duration-300" />
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
            className="relative overflow-hidden bg-white rounded-[2rem] border border-gray-100 p-12 lg:p-20 text-center shadow-2xl shadow-gray-100/50"
          >
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-50/50 rounded-full -ml-32 -mb-32 blur-3xl"></div>

            <div className="relative z-10 max-w-md mx-auto">
              <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 group hover:rotate-6 transition-transform">
                <Ticket className="text-blue-600" size={48} />
              </div>
              <h3 className="text-2xl lg:text-3xl font-black text-gray-900 mb-4 heading-font">
                No History Yet
              </h3>
              <p className="text-gray-500 mb-10 leading-relaxed font-medium">
                Everything looks good! You haven't raised any complaints or assistance requests yet.
              </p>
              <Link
                to="/student/raise-ticket"
                className="inline-flex items-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black shadow-2xl shadow-gray-200 transition-all hover:-translate-y-1 active:scale-95 group"
              >
                <Sparkles size={20} className="text-blue-400 group-hover:animate-pulse" />
                <span>Create Your First Ticket</span>
                <Plus size={20} />
              </Link>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {tickets.map((ticket, index) => (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                key={ticket.id}
                className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:-translate-y-1 hover:border-indigo-100 transition-all duration-300 group relative overflow-hidden"
              >
                <div className="flex items-start justify-between relative z-10">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <h3 className="text-xl font-bold text-gray-900 heading-font group-hover:text-blue-600 transition-colors">{ticket.title}</h3>
                      <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border shadow-sm ${STATUS_COLORS[ticket.status] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[ticket.status] || ticket.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 mb-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ID:</span>
                        <code className="text-xs font-mono font-bold text-blue-600">{ticket.ticket_number}</code>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Type:</span>
                        <span className="text-xs font-bold text-gray-700">{ticket.category_name}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                        <Clock size={12} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-600">{new Date(ticket.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {ticket.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed max-w-3xl italic">"{ticket.description}"</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 ml-6 self-center">
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="p-3 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-2xl transition-all shadow-sm group/btn active:scale-90"
                      title="View Details"
                    >
                      <Eye size={22} className="group-hover/btn:scale-110 transition-transform" />
                    </button>

                    {ticket.status === 'completed' && !ticket.feedback && (
                      <button
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setShowFeedbackModal(true);
                        }}
                        className="px-5 py-2.5 bg-green-600 text-white rounded-2xl hover:bg-green-700 text-sm font-bold flex items-center gap-2 shadow-lg shadow-green-100 hover:shadow-green-200 transition-all active:scale-95"
                      >
                        <MessageSquare size={18} />
                        Feedback
                      </button>
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
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onFeedback={() => {
            if (selectedTicket.status === 'completed' && !selectedTicket.feedback) {
              setShowFeedbackModal(true);
            }
          }}
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
    </motion.div>
  );
};

// Ticket Details Modal
const TicketDetailsModal = ({ ticket, onClose, onFeedback }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 lg:p-8"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/20 relative"
      >
        {/* Header Container */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-20 px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900 heading-font">Ticket Details</h2>
            <p className="text-xs text-blue-600 font-bold tracking-widest uppercase mt-0.5">Reference: {ticket.ticket_number}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 rounded-2xl transition-all active:scale-95 shadow-sm">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 lg:p-10 space-y-10">
          <div className="flex flex-wrap items-center gap-4">
            <div className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest border shadow-sm ${STATUS_COLORS[ticket.status] || 'bg-gray-100'}`}>
              {STATUS_LABELS[ticket.status] || ticket.status}
            </div>
            <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
              <Clock size={16} />
              <span>Created {new Date(ticket.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Category & Type</label>
                <p className="text-lg font-bold text-gray-900">
                  {ticket.category_name}
                  {ticket.sub_category_name && <span className="text-blue-600 ml-2">› {ticket.sub_category_name}</span>}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Subject</label>
                <p className="text-lg font-bold text-gray-900 leading-tight">{ticket.title}</p>
              </div>
            </div>

            {ticket.photo_url && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Evidence / Attachment</label>
                <div className="rounded-3xl overflow-hidden border-4 border-gray-50 shadow-inner group">
                  <img
                    src={ticket.photo_url}
                    alt="Ticket attachment"
                    className="w-full h-48 object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Detailed Description</label>
            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
              <p className="text-gray-700 leading-relaxed font-medium whitespace-pre-wrap italic">"{ticket.description}"</p>
            </div>
          </div>

          {ticket.feedback && (
            <div className="p-8 bg-green-50 rounded-[2rem] border border-green-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Star size={80} className="text-green-600" />
              </div>
              <h4 className="text-lg font-black text-green-900 mb-4 flex items-center gap-2">
                <MessageSquare size={20} />
                Your Feedback
              </h4>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={20}
                      className={star <= ticket.feedback.rating ? "fill-green-600 text-green-600" : "text-green-200"}
                    />
                  ))}
                </div>
                <span className="font-black text-green-700 ml-2 text-xl">{ticket.feedback.rating}/5</span>
              </div>
              {ticket.feedback.feedback_text && (
                <p className="text-green-800 font-medium leading-relaxed italic">"{ticket.feedback.feedback_text}"</p>
              )}
            </div>
          )}

          <div className="pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {ticket.status === 'completed' && !ticket.feedback && (
                <button
                  onClick={onFeedback}
                  className="px-8 py-3 bg-green-600 text-white rounded-2xl font-black hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center gap-2 active:scale-95"
                >
                  <Star size={18} />
                  Rate Resolution
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all active:scale-95"
            >
              Close Details
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Feedback Modal
const FeedbackModal = ({ ticket, form, setForm, onClose, onSubmit, loading }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] max-w-md w-full shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-gray-50 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-600" size={32} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 heading-font">Rate Resolution</h2>
          <p className="text-gray-500 font-medium mt-1">How was your experience with Ticket #{ticket.ticket_number}?</p>
        </div>

        <div className="p-8 space-y-8">
          <div className="text-center">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Select Rating</label>
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setForm({ ...form, rating })}
                  className={`group relative p-2 transition-all duration-300 ${form.rating >= rating ? 'scale-125' : 'grayscale opacity-30 hover:grayscale-0 hover:opacity-100 hover:scale-110'}`}
                >
                  <Star
                    size={40}
                    className={form.rating >= rating ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-gray-300'}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black text-gray-400 tracking-tighter px-1">Detailed Feedback</label>
            <textarea
              value={form.feedback_text}
              onChange={(e) => setForm({ ...form, feedback_text: e.target.value })}
              className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all outline-none font-medium resize-none"
              rows={4}
              placeholder="Tell us what we did great or how we can improve..."
            />
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={onSubmit}
              disabled={loading || !form.rating}
              className="w-full py-4 bg-green-600 text-white rounded-2xl font-black text-lg hover:bg-green-700 disabled:opacity-50 transition-all shadow-xl shadow-green-100 active:scale-95"
            >
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MyTickets;



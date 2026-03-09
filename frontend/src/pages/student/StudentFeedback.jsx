import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RiMessage2Line,
    RiCheckDoubleLine,
    RiUser3Line,
    RiBookOpenLine,
    RiCloseLine,
    RiStarFill,
    RiStarLine,
    RiArrowRightLine
} from 'react-icons/ri';
import api from '../../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from '../../components/LoadingAnimation';

const StudentFeedback = () => {
    const [loading, setLoading] = useState(true);
    const [feedbackItems, setFeedbackItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [responses, setResponses] = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchFeedback();
    }, []);

    const fetchFeedback = async () => {
        try {
            setLoading(true);
            const res = await api.get('/feedback-forms/student/pending');
            if (res.data.success) {
                setFeedbackItems(res.data.data);
            }
        } catch (error) {
            console.error('Error fetching feedback:', error);
            // Don't toast error if just network/auth issue, user might see blank state
        } finally {
            setLoading(false);
        }
    };

    const handleOpenFeedback = (item) => {
        setSelectedItem(item);
        setResponses({});
    };

    const handleCloseModal = () => {
        setSelectedItem(null);
        setResponses({});
    };

    const handleAnswerChange = (fieldId, value) => {
        setResponses(prev => ({
            ...prev,
            [fieldId]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic Validation
        const missingFields = selectedItem.questions.filter(q => q.required && !responses[q.id]);
        if (missingFields.length > 0) {
            toast.error(`Please answer all required questions.`);
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                formId: selectedItem.formId,
                facultyId: selectedItem.facultyId,
                subjectId: selectedItem.subjectId,
                responses
            };

            const res = await api.post('/feedback-forms/student/submit', payload);

            if (res.data.success) {
                toast.success('Feedback submitted successfully!');
                handleCloseModal();
                fetchFeedback(); // Refresh list
            }
        } catch (error) {
            console.error('Submit error:', error);
            toast.error(error.response?.data?.message || 'Failed to submit feedback');
        } finally {
            setSubmitting(false);
        }
    };

    // Render Field Helper
    const renderField = (field) => {
        switch (field.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        placeholder="Your answer..."
                        value={responses[field.id] || ''}
                        onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                        required={field.required}
                    />
                );
            case 'textarea':
                return (
                    <textarea
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-h-[100px]"
                        placeholder="Your detailed answer..."
                        value={responses[field.id] || ''}
                        onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                        required={field.required}
                    />
                );
            case 'select':
                return (
                    <select
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                        value={responses[field.id] || ''}
                        onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                        required={field.required}
                    >
                        <option value="">Select an option</option>
                        {field.options?.map((opt, idx) => (
                            <option key={idx} value={opt}>{opt}</option>
                        ))}
                    </select>
                );
            case 'radio':
                return (
                    <div className="space-y-2">
                        {field.options?.map((opt, idx) => (
                            <label key={idx} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                <input
                                    type="radio"
                                    name={field.id}
                                    value={opt}
                                    checked={responses[field.id] === opt}
                                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span className="text-gray-700">{opt}</span>
                            </label>
                        ))}
                    </div>
                );
            case 'checkbox':
                // Checkbox usually implies multiple selection, but simple string might be stored for 'Yes/No'.
                // If options exist, it's multi-select. If not, it's single boolean-ish.
                // Assuming multi-select for options.
                const currentVals = Array.isArray(responses[field.id]) ? responses[field.id] : [];
                const toggleVal = (val) => {
                    if (currentVals.includes(val)) {
                        handleAnswerChange(field.id, currentVals.filter(v => v !== val));
                    } else {
                        handleAnswerChange(field.id, [...currentVals, val]);
                    }
                };
                return (
                    <div className="space-y-2">
                        {field.options?.map((opt, idx) => (
                            <label key={idx} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                <input
                                    type="checkbox"
                                    value={opt}
                                    checked={currentVals.includes(opt)}
                                    onChange={() => toggleVal(opt)}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="text-gray-700">{opt}</span>
                            </label>
                        ))}
                    </div>
                );
            case 'rating':
            case 'number': // Treat number as potential rating if localized context implies, otherwise standard input
                // If it's explicitly 'rating' or just small number range.
                // My FormBuilder supports 'rating' (1-5 stars).
                return (
                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => handleAnswerChange(field.id, star)}
                                className={`p-2 rounded-full transition-all ${(responses[field.id] || 0) >= star ? 'text-yellow-400 bg-yellow-50' : 'text-gray-300 hover:text-gray-400'
                                    }`}
                            >
                                <RiStarFill size={32} />
                            </button>
                        ))}
                        <span className="ml-2 text-sm text-gray-500 font-medium">
                            {responses[field.id] ? `${responses[field.id]}/5` : ''}
                        </span>
                    </div>
                );
            default:
                return null;
        }
    };

    if (loading) return <LoadingAnimation />;

    // Group items by submitted status for visual separation? Or just grid.
    const pendingItems = feedbackItems.filter(i => !i.isSubmitted);
    const submittedItems = feedbackItems.filter(i => i.isSubmitted);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-4">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                            <RiMessage2Line size={28} />
                        </div>
                        Academic Appraisal
                    </h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] items-center flex gap-2 ml-14">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        Direct channel for pedagogical improvement
                    </p>
                </div>
            </div>

            {feedbackItems.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <RiMessage2Line size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No Feedback Pending</h3>
                    <p className="text-gray-500 mt-1">You're all caught up! Check back later.</p>
                </div>
            ) : (
                <>
                    {/* Pending Section */}
                    {pendingItems.length > 0 && (
                        <div className="space-y-6">
                            <h2 className="text-sm font-black text-slate-900 flex items-center gap-3 uppercase tracking-[0.2em]">
                                <span className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.4)]"></span>
                                Outstanding Appraisals ({pendingItems.length})
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pendingItems.map((item, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 relative overflow-hidden group"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-100 transition-all duration-500 pointer-events-none"></div>

                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="p-4 bg-indigo-600 text-white rounded-[1.2rem] shadow-lg shadow-indigo-200 group-hover:rotate-6 transition-transform">
                                                    <RiBookOpenLine size={28} />
                                                </div>
                                            </div>

                                            <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight group-hover:text-indigo-600 transition-colors uppercase line-clamp-1">{item.subjectName}</h3>
                                            <div className="flex flex-wrap items-center gap-2 mb-6">
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{item.subjectCode}</p>
                                                <span className={`px-3 py-1 text-[8px] font-black rounded-lg border uppercase tracking-widest ${item.subjectType === 'lab'
                                                    ? 'bg-purple-50 text-purple-600 border-purple-100'
                                                    : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                    }`}>
                                                    {item.subjectType === 'lab' ? 'Laboratory' : 'Theory Core'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-4 mb-8 p-4 bg-slate-50 border border-slate-100 rounded-[1.5rem]">
                                                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                                                    <RiUser3Line size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Pedagogue</p>
                                                    <p className="text-[15px] font-black text-slate-700 tracking-tight">{item.facultyName}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleOpenFeedback(item)}
                                                className="w-full py-4 px-6 bg-slate-900 hover:bg-indigo-600 text-white rounded-[1.2rem] font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-indigo-200 active:scale-95 duration-500"
                                            >
                                                Initialize Review
                                                <RiArrowRightLine size={18} className="group-hover:translate-x-1.5 transition-transform" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Submitted Section */}
                    {submittedItems.length > 0 && (
                        <div className="space-y-4 pt-8 border-t border-dashed">
                            <h2 className="text-lg font-bold text-gray-500 flex items-center gap-2 opacity-80">
                                <RiCheckDoubleLine className="text-green-500" />
                                Completed ({submittedItems.length})
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60 hover:opacity-100 transition-opacity">
                                {submittedItems.map((item, idx) => (
                                    <div key={idx} className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-gray-700">{item.subjectName}</h3>
                                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg uppercase">Submitted</span>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-2">{item.facultyName}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Feedback Modal */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z[100] flex items-center justify-center p-4 sm:p-6" style={{ zIndex: 100 }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={handleCloseModal}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="p-8 border-b-2 border-slate-50 flex justify-between items-center bg-white relative z-10">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedItem.subjectName}</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 italic">Formal evaluation of {selectedItem.facultyName}</p>
                                </div>
                                <button onClick={handleCloseModal} className="p-3 bg-slate-50 hover:bg-rose-50 hover:text-rose-500 text-slate-400 rounded-2xl transition-all active:scale-90">
                                    <RiCloseLine size={24} />
                                </button>
                            </div>

                            {/* Modal Body (Scrollable) */}
                            <div className="flex-1 overflow-y-auto p-8 lg:p-10 space-y-10 bg-white">
                                <form id="feedback-form" onSubmit={handleSubmit} className="space-y-10">
                                    {selectedItem.questions.map((q, idx) => (
                                        <div key={q.id || idx} className="space-y-4">
                                            <label className="block text-sm font-black text-slate-700 leading-relaxed">
                                                <span className="text-indigo-600 mr-2 opacity-50 font-mono">#{idx + 1}</span>
                                                {q.label} {q.required && <span className="text-rose-500 ml-1">*</span>}
                                            </label>

                                            <div className="pl-6 border-l-2 border-slate-50">
                                                {renderField(q)}
                                            </div>
                                        </div>
                                    ))}
                                </form>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-8 border-t-2 border-slate-50 bg-white flex flex-col sm:flex-row justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    Abort
                                </button>
                                <button
                                    type="submit"
                                    form="feedback-form"
                                    disabled={submitting}
                                    className="px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 hover:shadow-indigo-200 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Transmitting...
                                        </>
                                    ) : (
                                        'Commit Review'
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentFeedback;

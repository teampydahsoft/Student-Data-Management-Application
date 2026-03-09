
import React, { useState, useEffect } from 'react';
import { Loader2, Megaphone, Calendar, BarChart2, CheckCircle, Clock, AlertCircle, X, RefreshCw } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import api from '../../config/api';
import toast from 'react-hot-toast';

const StudentAnnouncements = () => {
    const [activeTab, setActiveTab] = useState('announcements');
    const [loading, setLoading] = useState(true);
    const [announcements, setAnnouncements] = useState([]);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
    const [polls, setPolls] = useState([]);
    const [votingId, setVotingId] = useState(null);

    // Pagination & Caching states
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [dataFetched, setDataFetched] = useState({ announcements: false, polls: false });

    useEffect(() => {
        if (activeTab === 'announcements' && !dataFetched.announcements) {
            fetchAnnouncements();
        } else if (activeTab === 'polls' && !dataFetched.polls) {
            fetchPolls();
        }
    }, [activeTab]);

    const fetchAnnouncements = async (isRefresh = false, loadMore = false) => {
        if (!loadMore) setLoading(true);
        else setIsFetchingMore(true);

        try {
            const currentOffset = isRefresh ? 0 : (loadMore ? offset : 0);
            const response = await api.get(`/announcements/student?limit=5&offset=${currentOffset}`);
            if (response.data.success) {
                const newData = response.data.data || [];
                if (isRefresh || (!loadMore)) {
                    setAnnouncements(newData);
                    setOffset(5);
                } else {
                    setAnnouncements(prev => [...prev, ...newData]);
                    setOffset(prev => prev + 5);
                }
                setHasMore(response.data.hasMore);
                setDataFetched(prev => ({ ...prev, announcements: true }));
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load announcements');
        } finally {
            setLoading(false);
            setIsFetchingMore(false);
        }
    };

    const fetchPolls = async (isRefresh = false) => {
        setLoading(true);
        try {
            const response = await api.get('/polls/student');
            if (response.data.success) {
                setPolls(response.data.data || []);
                setDataFetched(prev => ({ ...prev, polls: true }));
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load polls');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        if (activeTab === 'announcements') {
            fetchAnnouncements(true);
        } else {
            fetchPolls(true);
        }
    };

    const handleVote = async (pollId, optionIndex) => {
        setVotingId(pollId);
        try {
            const response = await api.post(`/polls/${pollId}/vote`, { option_index: optionIndex });
            if (response.data.success) {
                toast.success('Vote recorded!');
                fetchPolls(true);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Vote failed');
        } finally {
            setVotingId(null);
        }
    };

    if (loading && announcements.length === 0 && polls.length === 0) {
        return (
            <div className="space-y-6 animate-pulse p-2 md:p-6 min-h-screen">
                <div className="flex gap-1 mx-auto md:mx-0">
                    <SkeletonBox height="h-10" width="w-32" className="rounded-xl" />
                    <SkeletonBox height="h-10" width="w-32" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-96">
                            <SkeletonBox height="h-52" width="w-full" />
                            <div className="p-6 space-y-4">
                                <SkeletonBox height="h-4" width="w-32" />
                                <SkeletonBox height="h-6" width="w-full" />
                                <SkeletonBox height="h-4" width="w-full" />
                                <SkeletonBox height="h-4" width="w-2/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in p-4 lg:p-8 bg-gray-50/50 min-h-screen">
            {/* Premium Header / Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
                {/* Segmented Control Styling */}
                <div className="bg-white/60 backdrop-blur-md rounded-[1.25rem] p-1.5 shadow-sm border border-white flex gap-1 w-full sm:w-auto">
                    <button
                        onClick={() => setActiveTab('announcements')}
                        className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'announcements' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/50 scale-100' : 'text-gray-500 hover:text-gray-900 hover:bg-white/80 scale-[0.98]'}`}
                    >
                        <Megaphone size={18} /> Announcements
                    </button>
                    <button
                        onClick={() => setActiveTab('polls')}
                        className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'polls' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/50 scale-100' : 'text-gray-500 hover:text-gray-900 hover:bg-white/80 scale-[0.98]'}`}
                    >
                        <BarChart2 size={18} /> Campus Polls
                    </button>
                </div>

                <button
                    onClick={handleRefresh}
                    className="p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white hover:bg-white hover:shadow-md text-gray-500 hover:text-indigo-600 transition-all flex items-center justify-center shrink-0 group active:scale-95"
                    title="Refresh Data"
                >
                    <RefreshCw size={20} className={`transition-transform duration-500 ${loading && !isFetchingMore ? "animate-spin text-indigo-600" : "group-hover:rotate-180"}`} />
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'announcements' ? (
                <div>
                    {announcements.length === 0 ? (
                        <div className="text-center py-24 bg-white/60 backdrop-blur-xl rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white">
                            <div className="mx-auto w-24 h-24 bg-indigo-50/80 rounded-[2rem] flex items-center justify-center text-indigo-400 mb-6 shadow-inner">
                                <Megaphone size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Quiet Horizon</h3>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No new transmissions detected</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {announcements.map((ann) => (
                                <div
                                    key={ann.id}
                                    onClick={() => setSelectedAnnouncement(ann)}
                                    className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.02] transition-all duration-500 group cursor-pointer flex flex-col h-full relative"
                                >
                                    <div className="absolute top-5 right-5 z-30 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200">
                                            <Megaphone size={16} />
                                        </div>
                                    </div>
                                    {ann.image_url ? (
                                        <div className="h-52 w-full bg-slate-100 overflow-hidden relative shrink-0">
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent z-10 opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
                                            <img src={ann.image_url} alt={ann.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" />
                                            <div className="absolute bottom-5 left-5 z-20">
                                                <span className="bg-white text-indigo-600 px-3 py-1.5 rounded-xl text-[9px] uppercase font-black tracking-widest shadow-xl border border-white">
                                                    {ann.target_college || 'Notice'}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-40 bg-slate-50 flex items-center justify-center relative overflow-hidden shrink-0 border-b border-slate-100/50">
                                            <div className="absolute -right-8 -top-8 text-indigo-600/5 group-hover:scale-110 group-hover:rotate-12 transition-all duration-1000 ease-out">
                                                <Megaphone size={140} />
                                            </div>
                                            <div className="h-16 w-16 bg-white rounded-[1.8rem] shadow-md border border-slate-100 flex items-center justify-center relative z-10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                                                <Megaphone className="text-indigo-500" size={32} />
                                            </div>
                                        </div>
                                    )}
                                    <div className="p-8 flex-1 flex flex-col">
                                        <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 mb-5">
                                            <Calendar size={14} className="text-indigo-400/60" /> {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 mb-4 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-tight tracking-tight">{ann.title}</h3>
                                        <p className="text-slate-500 text-[14px] line-clamp-3 leading-relaxed font-bold italic mt-auto opacity-70">{ann.content}</p>
                                        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                                Read More <Clock size={12} />
                                            </span>
                                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                                                <RefreshCw size={14} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Load More Button */}
                    {!loading && activeTab === 'announcements' && announcements.length > 0 && hasMore && (
                        <div className="flex justify-center mt-12 pb-8">
                            <button
                                onClick={() => fetchAnnouncements(false, true)}
                                disabled={isFetchingMore}
                                className="px-8 py-3.5 bg-white/80 backdrop-blur-md border border-white shadow-sm text-gray-600 font-bold tracking-wide rounded-[1.5rem] hover:bg-white hover:text-indigo-600 hover:shadow-md transition-all flex items-center gap-3 group"
                            >
                                {isFetchingMore ? <Loader2 className="animate-spin text-indigo-600" size={20} /> : <><RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" /> Load More Announcements</>}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    {polls.length === 0 ? (
                        <div className="text-center py-24 bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-sm border border-white">
                            <div className="mx-auto w-24 h-24 bg-indigo-50/80 rounded-[2rem] flex items-center justify-center text-indigo-500 mb-6 shadow-inner">
                                <BarChart2 size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">No Active Polls</h3>
                            <p className="text-gray-500 font-medium">There are no polls available right now.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                            {polls.map((poll) => {
                                const timeLeft = poll.end_time ? new Date(poll.end_time) - new Date() : null;
                                const isUrgent = timeLeft && timeLeft < 86400000; // Less than 24h

                                return (
                                    <div key={poll.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 sm:p-8 hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative flex flex-col h-full group">
                                        {/* Status Badge */}
                                        <div className="absolute top-5 right-5 sm:top-6 sm:right-6">
                                            {poll.has_voted ? (
                                                <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center gap-1.5 shadow-sm border border-green-200/50">
                                                    <CheckCircle size={14} /> Voted
                                                </span>
                                            ) : (
                                                <span className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center gap-1.5 shadow-sm border ${isUrgent ? 'bg-rose-50 text-rose-600 border-rose-200/50 animate-pulse' : 'bg-indigo-50 text-indigo-600 border-indigo-200/50'}`}>
                                                    {isUrgent ? <Clock size={14} /> : <AlertCircle size={14} />}
                                                    {isUrgent ? 'Ending Soon' : 'Active'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="mb-8 pr-20">
                                            <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-3 leading-tight tracking-tight group-hover:text-indigo-600 transition-colors">{poll.question}</h3>
                                            <div className="flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                                                <span>{new Date(poll.created_at).toLocaleDateString()}</span>
                                                {poll.end_time && (
                                                    <span className={`flex items-center gap-1.5 ${isUrgent ? 'text-rose-500' : ''}`}>
                                                        <Clock size={14} className="opacity-70" /> {new Date(poll.end_time).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {poll.has_voted ? (
                                            <div className="flex flex-col items-center justify-center py-10 text-center animate-fade-in bg-green-50/50 rounded-3xl border border-green-100 mt-auto">
                                                <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center text-green-500 shadow-md shadow-green-200/50 mb-4 transform hover:scale-110 hover:rotate-3 transition-all duration-500">
                                                    <CheckCircle size={32} strokeWidth={2.5} />
                                                </div>
                                                <h3 className="text-lg font-black text-green-800 mb-1 tracking-tight">Vote Confirmed</h3>
                                                <p className="text-green-600/80 font-semibold text-sm">
                                                    Your response has been recorded.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3 mt-auto">
                                                {poll.options.map((opt, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => handleVote(poll.id, idx)}
                                                        disabled={votingId === poll.id}
                                                        className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-transparent bg-gray-50 hover:border-indigo-500 hover:bg-indigo-50/50 hover:shadow-md transition-all duration-300 text-gray-700 font-bold group relative overflow-hidden active:scale-[0.98]"
                                                    >
                                                        <div className="flex items-center justify-between relative z-10">
                                                            <span className="pr-4">{opt}</span>
                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-indigo-600 group-hover:bg-indigo-600 transition-colors shadow-sm shrink-0 flex items-center justify-center">
                                                                <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                            </div>
                                                        </div>
                                                        {votingId === poll.id && (
                                                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                                                                <Loader2 className="animate-spin text-indigo-600" size={24} />
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                                <p className="text-[11px] font-bold tracking-widest uppercase text-center text-gray-400 mt-6 pt-2">Select an option to cast vote</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {/* Announcement Details Modal */}
            {selectedAnnouncement && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedAnnouncement(null)}>
                    <div
                        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col md:flex-row overflow-hidden animate-scale-in border border-white"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Image Section - Left Panel */}
                        {selectedAnnouncement.image_url && (
                            <div className="md:w-5/12 bg-gray-50 relative shrink-0 h-48 sm:h-64 md:h-auto md:max-h-none flex items-center justify-center overflow-hidden border-r border-gray-100">
                                <img
                                    src={selectedAnnouncement.image_url}
                                    alt={selectedAnnouncement.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}

                        {/* Content Section - Right Panel */}
                        <div className="flex-1 flex flex-col min-w-0 bg-white relative min-h-0 overflow-hidden">
                            {/* Sticky Header */}
                            <div className="sticky top-0 right-0 p-5 sm:p-8 bg-white/90 backdrop-blur-md border-b border-gray-100 shrink-0 z-20">
                                <div className="flex justify-between items-start gap-4">
                                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 leading-tight flex-1 pr-2 tracking-tight">{selectedAnnouncement.title}</h2>
                                    <button
                                        onClick={() => setSelectedAnnouncement(null)}
                                        className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all shrink-0 flex-shrink-0 text-gray-500 hover:text-gray-900 active:scale-95"
                                        aria-label="Close"
                                    >
                                        <X size={20} className="sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Body */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" style={{ scrollBehavior: 'smooth' }}>
                                <div className="p-5 sm:p-8">
                                    <div className="flex items-center gap-2 text-[11px] sm:text-xs uppercase tracking-widest text-indigo-500 font-bold mb-6">
                                        <Calendar size={14} className="sm:w-4 sm:h-4 shrink-0 opacity-80" />
                                        <span className="whitespace-nowrap">
                                            {new Date(selectedAnnouncement.created_at).toLocaleDateString(undefined, {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>

                                    <div className="prose prose-indigo max-w-none mb-8">
                                        <p className="whitespace-pre-wrap text-gray-600 leading-relaxed text-[15px] sm:text-base break-words font-medium">
                                            {selectedAnnouncement.content}
                                        </p>
                                    </div>

                                    {selectedAnnouncement.target_college && (
                                        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-wrap items-center gap-2 sm:gap-3">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Targeted to:</span>
                                            <span className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider">{selectedAnnouncement.target_college}</span>
                                            {selectedAnnouncement.target_course && <span className="bg-gray-50 text-gray-700 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-gray-100">{selectedAnnouncement.target_course}</span>}
                                            {selectedAnnouncement.target_branch && <span className="bg-gray-50 text-gray-700 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-gray-100">{selectedAnnouncement.target_branch}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentAnnouncements;

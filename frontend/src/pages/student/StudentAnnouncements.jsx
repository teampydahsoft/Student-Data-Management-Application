
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Megaphone, Calendar, BarChart2, CheckCircle, Clock, AlertCircle, X, RefreshCw, ChevronRight } from 'lucide-react';
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

    // Infinite scroll sentinel ref
    const sentinelRef = useRef(null);

    // IntersectionObserver for infinite scroll
    const observerRef = useRef(null);
    const setupObserver = useCallback(() => {
        if (observerRef.current) observerRef.current.disconnect();
        if (!sentinelRef.current) return;
        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
                    fetchAnnouncements(false, true);
                }
            },
            { threshold: 0.1 }
        );
        observerRef.current.observe(sentinelRef.current);
    }, [hasMore, isFetchingMore]);

    useEffect(() => {
        if (activeTab === 'announcements' && dataFetched.announcements) {
            setupObserver();
        }
        return () => { if (observerRef.current) observerRef.current.disconnect(); };
    }, [activeTab, dataFetched.announcements, setupObserver]);

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
            const response = await api.get(`/announcements/student?limit=6&offset=${currentOffset}`);
            if (response.data.success) {
                const newData = response.data.data || [];
                if (isRefresh || (!loadMore)) {
                    setAnnouncements(newData);
                    setOffset(6);
                } else {
                    setAnnouncements(prev => [...prev, ...newData]);
                    setOffset(prev => prev + 6);
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
            <div className="animate-pulse bg-gray-50/50 min-h-screen">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex gap-1.5 flex-1">
                        <SkeletonBox height="h-9" width="w-32" className="rounded-xl" />
                        <SkeletonBox height="h-9" width="w-20" className="rounded-xl" />
                    </div>
                    <SkeletonBox height="h-9" width="w-9" className="rounded-xl shrink-0" />
                </div>
                <div className="p-3 sm:p-6 space-y-2">
                    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 divide-y divide-slate-50">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3">
                                <SkeletonBox height="h-9" width="w-9" className="rounded-xl shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <SkeletonBox height="h-3.5" width="w-3/4" />
                                    <SkeletonBox height="h-2.5" width="w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in bg-gray-50/50 min-h-screen">

            {/* ── Sticky Tab Bar ── */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2">
                <div className="bg-slate-100/80 rounded-xl p-1 flex gap-1 flex-1 sm:flex-none min-w-0">
                    <button
                        id="tab-announcements"
                        onClick={() => setActiveTab('announcements')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-lg font-bold text-[11px] sm:text-sm transition-all duration-200 whitespace-nowrap min-w-0 ${activeTab === 'announcements' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/60' : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'}`}
                    >
                        <Megaphone size={12} className="sm:w-4 sm:h-4 shrink-0" />
                        <span className="truncate">Announcements</span>
                    </button>
                    <button
                        id="tab-polls"
                        onClick={() => setActiveTab('polls')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-lg font-bold text-[11px] sm:text-sm transition-all duration-200 whitespace-nowrap min-w-0 ${activeTab === 'polls' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/60' : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'}`}
                    >
                        <BarChart2 size={12} className="sm:w-4 sm:h-4 shrink-0" />
                        <span className="truncate">Campus Polls</span>
                    </button>
                </div>
                <button
                    onClick={handleRefresh}
                    className="p-2 sm:p-2.5 bg-slate-100 hover:bg-indigo-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all active:scale-95 shrink-0"
                    title="Refresh"
                >
                    <RefreshCw size={15} className={`sm:w-4 sm:h-4 transition-transform ${loading && !isFetchingMore ? 'animate-spin text-indigo-600' : 'hover:rotate-180'}`} />
                </button>
            </div>

            <div className="sm:p-6 lg:p-8 space-y-3 sm:space-y-6">

            {/* ══ ANNOUNCEMENTS ══ */}
            {activeTab === 'announcements' && (
                <div>
                    {announcements.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
                            <div className="mx-auto w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400 mb-3">
                                <Megaphone size={26} />
                            </div>
                            <h3 className="text-base font-black text-slate-800 tracking-tight">No Announcements</h3>
                            <p className="text-slate-400 font-medium text-xs mt-1">Nothing new right now.</p>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE: Single-column card feed with infinite scroll */}
                            <div className="md:hidden px-3 pb-4">
                                <div className="space-y-3">
                                    {announcements.map((ann) => (
                                        <div
                                            key={ann.id}
                                            onClick={() => setSelectedAnnouncement(ann)}
                                            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden active:scale-[0.97] transition-all duration-150 cursor-pointer flex flex-col group"
                                        >
                                            {/* Image / Placeholder */}
                                            {ann.image_url ? (
                                                <div className="w-full aspect-[4/3] bg-slate-100 overflow-hidden shrink-0 relative">
                                                    <img src={ann.image_url} alt={ann.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    {ann.target_college && (
                                                        <span className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm text-indigo-600 px-1.5 py-0.5 rounded-md text-[8px] uppercase font-black tracking-wider shadow-sm">{ann.target_college}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full aspect-[4/3] bg-gradient-to-br from-indigo-50 to-indigo-100/60 flex items-center justify-center relative overflow-hidden shrink-0">
                                                    <div className="absolute -right-4 -bottom-4 text-indigo-200 opacity-60"><Megaphone size={64} /></div>
                                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-indigo-100 flex items-center justify-center relative z-10">
                                                        <Megaphone size={18} className="text-indigo-400" />
                                                    </div>
                                                </div>
                                            )}
                                            {/* Content */}
                                            <div className="p-2.5 flex-1 flex flex-col">
                                                <p className="text-[9px] text-indigo-500 font-black uppercase tracking-wider mb-1">
                                                    {new Date(ann.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                                <h3 className="text-[12px] font-black text-slate-800 leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors">{ann.title}</h3>
                                                <p className="text-[10px] text-slate-400 font-medium leading-relaxed line-clamp-2 mt-1 flex-1">{ann.content}</p>
                                                <div className="flex items-center gap-0.5 mt-2 pt-2 border-t border-slate-100">
                                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Read More</span>
                                                    <ChevronRight size={10} className="text-indigo-400" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* DESKTOP: Card Grid */}
                            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
                                {announcements.map((ann) => (
                                    <div
                                        key={ann.id}
                                        onClick={() => setSelectedAnnouncement(ann)}
                                        className="bg-white rounded-[2rem] shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1.5 transition-all duration-400 group cursor-pointer flex flex-col h-full relative"
                                    >
                                        <div className="absolute top-4 right-4 z-30 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg"><Megaphone size={14} /></div>
                                        </div>
                                        {ann.image_url ? (
                                            <div className="h-44 w-full bg-slate-100 overflow-hidden relative shrink-0">
                                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-transparent z-10 opacity-60 group-hover:opacity-40 transition-opacity" />
                                                <img src={ann.image_url} alt={ann.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                                <div className="absolute bottom-4 left-4 z-20">
                                                    <span className="bg-white text-indigo-600 px-2.5 py-1 rounded-lg text-[9px] uppercase font-black tracking-widest shadow border border-white">{ann.target_college || 'Notice'}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-32 bg-indigo-50/60 flex items-center justify-center relative overflow-hidden shrink-0 border-b border-slate-100">
                                                <div className="absolute -right-6 -top-6 text-indigo-600/5 group-hover:scale-110 transition-all duration-700"><Megaphone size={110} /></div>
                                                <div className="h-12 w-12 bg-white rounded-2xl shadow-md border border-slate-100 flex items-center justify-center relative z-10"><Megaphone className="text-indigo-500" size={24} /></div>
                                            </div>
                                        )}
                                        <div className="p-5 flex-1 flex flex-col">
                                            <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-[0.15em] text-slate-400 mb-3">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={11} className="text-indigo-400/60" />
                                                    {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                                {ann.expires_at && (
                                                    <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold text-[9px]">
                                                        <Clock size={10} />
                                                        <span>Valid till {new Date(ann.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="text-base font-black text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug tracking-tight">{ann.title}</h3>
                                            <p className="text-slate-500 text-[12px] line-clamp-2 leading-relaxed font-medium mt-auto opacity-80">{ann.content}</p>
                                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center">
                                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">Read More <ChevronRight size={10} /></span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Automatic pagination sentinel for every viewport */}
                            {hasMore ? (
                                <div ref={sentinelRef} className="flex justify-center py-5">
                                    {isFetchingMore && (
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={16} className="animate-spin text-indigo-500" />
                                            <span className="text-[11px] font-bold text-slate-400">Loading more...</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">All caught up</p>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ══ POLLS ══ */}
            {activeTab === 'polls' && (
                <div>
                    {polls.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
                            <div className="mx-auto w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mb-3">
                                <BarChart2 size={26} />
                            </div>
                            <h3 className="text-base font-black text-slate-800 tracking-tight">No Active Polls</h3>
                            <p className="text-slate-400 font-medium text-xs mt-1">Check back later for new polls.</p>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE: Compact Poll Cards */}
                            <div className="md:hidden space-y-2.5">
                                {polls.map((poll) => {
                                    const timeLeft = poll.end_time ? new Date(poll.end_time) - new Date() : null;
                                    const isUrgent = timeLeft && timeLeft < 86400000;
                                    return (
                                        <div key={poll.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                            <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-50">
                                                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <BarChart2 size={13} className="text-indigo-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-black text-slate-800 leading-snug line-clamp-2">{poll.question}</p>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                                        {new Date(poll.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                                        {poll.end_time && ` · Ends ${new Date(poll.end_time).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
                                                    </p>
                                                </div>
                                                {poll.has_voted ? (
                                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-0.5 mt-0.5">
                                                        <CheckCircle size={9} /> Done
                                                    </span>
                                                ) : (
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-0.5 border mt-0.5 ${isUrgent ? 'text-rose-600 bg-rose-50 border-rose-100 animate-pulse' : 'text-indigo-600 bg-indigo-50 border-indigo-100'}`}>
                                                        {isUrgent ? <><Clock size={9} /> Soon</> : <><AlertCircle size={9} /> Vote</>}
                                                    </span>
                                                )}
                                            </div>
                                            {!poll.has_voted ? (
                                                <div className="p-2.5 space-y-1.5">
                                                    {poll.options.map((opt, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleVote(poll.id, idx)}
                                                            disabled={votingId === poll.id}
                                                            className="w-full text-left px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/60 transition-all text-[11px] font-bold text-slate-700 flex items-center justify-between gap-2 active:scale-[0.98] relative overflow-hidden"
                                                        >
                                                            <span className="truncate">{opt}</span>
                                                            <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 shrink-0" />
                                                            {votingId === poll.id && (
                                                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                                    <Loader2 className="animate-spin text-indigo-600" size={13} />
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 px-3 py-2.5 text-emerald-600">
                                                    <CheckCircle size={13} />
                                                    <span className="text-[11px] font-black">Your vote has been recorded.</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* DESKTOP: Card Grid */}
                            <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                                {polls.map((poll) => {
                                    const timeLeft = poll.end_time ? new Date(poll.end_time) - new Date() : null;
                                    const isUrgent = timeLeft && timeLeft < 86400000;
                                    return (
                                        <div key={poll.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 sm:p-8 hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative flex flex-col h-full group">
                                            <div className="absolute top-5 right-5">
                                                {poll.has_voted ? (
                                                    <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center gap-1.5 shadow-sm border border-green-200/50">
                                                        <CheckCircle size={13} /> Voted
                                                    </span>
                                                ) : (
                                                    <span className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center gap-1.5 shadow-sm border ${isUrgent ? 'bg-rose-50 text-rose-600 border-rose-200/50 animate-pulse' : 'bg-indigo-50 text-indigo-600 border-indigo-200/50'}`}>
                                                        {isUrgent ? <Clock size={13} /> : <AlertCircle size={13} />}
                                                        {isUrgent ? 'Ending Soon' : 'Active'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mb-6 pr-24">
                                                <h3 className="text-xl font-black text-gray-900 mb-2 leading-tight tracking-tight group-hover:text-indigo-600 transition-colors">{poll.question}</h3>
                                                <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                                                    <span>{new Date(poll.created_at).toLocaleDateString()}</span>
                                                    {poll.end_time && (
                                                        <span className={`flex items-center gap-1.5 ${isUrgent ? 'text-rose-500' : ''}`}>
                                                            <Clock size={13} className="opacity-70" /> {new Date(poll.end_time).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {poll.has_voted ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-center bg-green-50/50 rounded-3xl border border-green-100 mt-auto">
                                                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-green-500 shadow-md mb-3">
                                                        <CheckCircle size={28} strokeWidth={2.5} />
                                                    </div>
                                                    <h3 className="text-base font-black text-green-800 mb-1">Vote Confirmed</h3>
                                                    <p className="text-green-600/80 font-semibold text-sm">Your response has been recorded.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2.5 mt-auto">
                                                    {poll.options.map((opt, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleVote(poll.id, idx)}
                                                            disabled={votingId === poll.id}
                                                            className="w-full text-left p-4 rounded-2xl border-2 border-transparent bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-md transition-all duration-300 text-gray-700 font-bold group relative overflow-hidden active:scale-[0.98]"
                                                        >
                                                            <div className="flex items-center justify-between relative z-10">
                                                                <span className="pr-4 text-sm">{opt}</span>
                                                                <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-indigo-600 group-hover:bg-indigo-600 transition-colors shrink-0 flex items-center justify-center">
                                                                    <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                                </div>
                                                            </div>
                                                            {votingId === poll.id && (
                                                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                                                                    <Loader2 className="animate-spin text-indigo-600" size={20} />
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                    <p className="text-[10px] font-bold tracking-widest uppercase text-center text-gray-400 pt-2">Select an option to cast vote</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            </div>
            {/* ── Detail Modal (bottom-sheet on mobile, centered on desktop) ── */}
            {selectedAnnouncement && (
                <div
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setSelectedAnnouncement(null)}
                >
                    <div
                        className="bg-white w-full sm:rounded-[2rem] sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden border border-white/80 rounded-t-[2rem] shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drag Handle */}
                        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
                            <div className="w-10 h-1 rounded-full bg-slate-200" />
                        </div>
                        {/* Header */}
                        <div className="px-4 sm:px-6 pt-2 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 shrink-0">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-sm sm:text-xl font-black text-slate-900 leading-snug flex-1 pr-2 tracking-tight">{selectedAnnouncement.title}</h2>
                                <button
                                    onClick={() => setSelectedAnnouncement(null)}
                                    className="p-1.5 sm:p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shrink-0 text-slate-500 hover:text-slate-900 active:scale-95"
                                    aria-label="Close"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-indigo-500 font-black mt-1.5">
                                <Calendar size={10} className="opacity-80 shrink-0" />
                                {new Date(selectedAnnouncement.created_at).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                        </div>
                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            {selectedAnnouncement.image_url && (
                                <div className="w-full h-44 sm:h-56 bg-slate-100 overflow-hidden shrink-0">
                                    <img src={selectedAnnouncement.image_url} alt={selectedAnnouncement.title} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="p-4 sm:p-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:pb-6">
                                <p className="whitespace-pre-wrap text-slate-600 leading-relaxed text-[13px] sm:text-sm break-words font-medium">{selectedAnnouncement.content}</p>
                                {selectedAnnouncement.target_college && (
                                    <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Targeted to:</span>
                                        <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">{selectedAnnouncement.target_college}</span>
                                        {selectedAnnouncement.target_course && <span className="bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-100">{selectedAnnouncement.target_course}</span>}
                                        {selectedAnnouncement.target_branch && <span className="bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-100">{selectedAnnouncement.target_branch}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentAnnouncements;

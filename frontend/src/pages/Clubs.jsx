import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Plus, Users, X, Trash2, Check, Edit2, Shield, Wallet,
    ArrowRight, Zap, Search, Settings, UserCheck, CheckCircle,
    AlertTriangle, UserPlus, RefreshCw, Eye, Bell, BellOff,
    MessageSquare, Calendar, Clock, Send, Hash, Paperclip, ChevronDown,
    DollarSign, AlertCircle, CheckCircle2, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import clubService from '../services/clubService';
import chatService from '../services/chatService';
import api from '../config/api';
import useAuthStore from '../store/authStore';
import { BACKEND_MODULES, hasPermission } from '../constants/rbac';
import toast from 'react-hot-toast';

const CLUB_ADMIN_PAGES = [
    { key: 'management', label: 'Club Management' },
    { key: 'students', label: 'Members' },
    { key: 'settings', label: 'Club Settings' }
];
const DEFAULT_CLUB_ADMIN_PAGES = CLUB_ADMIN_PAGES.map(page => page.key);
const getPagePermissions = (assignment = {}) => {
    const legacyPages = Array.isArray(assignment.pages) ? assignment.pages : DEFAULT_CLUB_ADMIN_PAGES;
    return Object.fromEntries(CLUB_ADMIN_PAGES.map(({ key }) => {
        const configured = assignment.pagePermissions?.[key];
        if (configured && typeof configured === 'object') {
            const write = configured.write === true;
            return [key, { read: configured.read === true || write, write }];
        }
        const allowed = legacyPages.includes(key);
        return [key, { read: allowed, write: allowed }];
    }));
};
const pagesFromPermissions = permissions => CLUB_ADMIN_PAGES
    .map(page => page.key)
    .filter(key => permissions[key]?.read || permissions[key]?.write);
const DEFAULT_USER_ROLE_OPTIONS = [
    { value: 'college_principal', label: 'College Principal' },
    { value: 'college_ao', label: 'College AO' },
    { value: 'college_attender', label: 'College Attender' },
    { value: 'branch_hod', label: 'Branch HOD' },
    { value: 'office_assistant', label: 'Office Assistant' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'faculty', label: 'Faculty' },
    { value: 'course_principal', label: 'Course Principal' },
    { value: 'course_hod', label: 'Course HOD' },
    { value: 'branch_clerk', label: 'Branch Clerk' },
    { value: 'branch_counselor', label: 'Branch Counselor' },
    { value: 'branch_faculty', label: 'Branch Faculty' },
    { value: 'support_staff', label: 'Support Staff' }
];
const formatMembershipFee = (amount) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number(amount) || 0);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   INLINE CLUB CHAT BOX
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ClubChatBox = ({ club }) => {
    const [channel, setChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);
    const pollRef = useRef(null);

    const currentUserId = localStorage.getItem('userId');
    const currentUserName = localStorage.getItem('userName') || localStorage.getItem('username') || 'You';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadMessages = useCallback(async (ch) => {
        const activeChannel = ch || channel;
        if (!activeChannel) return;
        try {
            const res = await chatService.getMessages(activeChannel.id, { limit: 80 });
            if (res.success && res.data) {
                setMessages(res.data);
                setTimeout(scrollToBottom, 50);
            }
        } catch (e) {
            // silent poll failure
        }
    }, [channel]);

    useEffect(() => {
        if (!club?.id) return;
        setLoading(true);
        setError(null);
        chatService.getChannelByClub(club.id)
            .then(res => {
                if (res.success && res.data) {
                    setChannel(res.data);
                    return chatService.getMessages(res.data.id, { limit: 80 })
                        .then(msgRes => {
                            if (msgRes.success && msgRes.data) {
                                setMessages(msgRes.data);
                                setTimeout(scrollToBottom, 80);
                            }
                        });
                } else {
                    // create channel if not found
                    return chatService.createChannel({ club_id: club.id, name: club.name, type: 'club' })
                        .then(createRes => {
                            if (createRes.success && createRes.data) {
                                setChannel(createRes.data);
                            } else {
                                setError('Could not load or create chat channel.');
                            }
                        });
                }
            })
            .catch(() => setError('Failed to connect to chat.'))
            .finally(() => setLoading(false));
    }, [club?.id]);

    // Poll every 6 seconds
    useEffect(() => {
        if (!channel) return;
        pollRef.current = setInterval(() => loadMessages(channel), 6000);
        return () => clearInterval(pollRef.current);
    }, [channel, loadMessages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || !channel || sending) return;
        setSending(true);
        const optimistic = {
            id: `opt-${Date.now()}`,
            message: input.trim(),
            sender_name: currentUserName,
            sender_id: currentUserId,
            created_at: new Date().toISOString(),
            _optimistic: true
        };
        setMessages(prev => [...prev, optimistic]);
        setInput('');
        setTimeout(scrollToBottom, 50);
        try {
            await chatService.postMessage(channel.id, optimistic.message);
            await loadMessages(channel);
        } catch (err) {
            toast.error('Failed to send message');
            setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        } finally {
            setSending(false);
        }
    };

    const formatTime = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    const formatDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString();
    };

    // Group messages by date
    const groupedMessages = messages.reduce((acc, msg) => {
        const dateKey = formatDate(msg.created_at);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(msg);
        return acc;
    }, {});

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-72 gap-3 text-gray-400">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
            <p className="text-sm">Loading chatâ€¦</p>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-72 gap-3 text-red-400">
            <AlertTriangle size={28} />
            <p className="text-sm font-medium">{error}</p>
        </div>
    );

    return (
        <div className="flex flex-col" style={{ height: '520px' }}>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                    <Hash size={18} />
                </div>
                <div>
                    <p className="text-sm font-bold text-gray-900">{club?.name} â€” Club Chat</p>
                    <p className="text-[11px] text-gray-500">{messages.length} messages Â· Updates every 6s</p>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50/50">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                        <MessageSquare size={40} className="opacity-30" />
                        <p className="text-sm">No messages yet. Say hi! ðŸ‘‹</p>
                    </div>
                ) : (
                    Object.entries(groupedMessages).map(([date, dayMsgs]) => (
                        <div key={date}>
                            <div className="flex items-center gap-3 my-3">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-[10px] text-gray-400 font-semibold px-2 py-0.5 bg-white border rounded-full">{date}</span>
                                <div className="flex-1 h-px bg-gray-200" />
                            </div>
                            {dayMsgs.map((msg, idx) => {
                                const isOwn = String(msg.sender_id) === String(currentUserId);
                                return (
                                    <div key={msg.id || idx} className={`flex gap-2 mb-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                            isOwn ? 'bg-blue-600 text-white' : 'bg-indigo-100 text-indigo-700'
                                        }`}>
                                            {(msg.sender_name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                            {!isOwn && (
                                                <p className="text-[10px] text-gray-500 font-semibold mb-0.5 px-1">{msg.sender_name}</p>
                                            )}
                                            <div className={`px-3.5 py-2.5 rounded-2xl text-sm break-words ${
                                                isOwn
                                                    ? 'bg-blue-600 text-white rounded-tr-sm'
                                                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-xs'
                                            } ${msg._optimistic ? 'opacity-70' : ''}`}>
                                                {msg.message}
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-0.5 px-1">{formatTime(msg.created_at)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5 border-t bg-white rounded-b-xl">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={`Message #${club?.name}â€¦`}
                    disabled={sending}
                    className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 placeholder-gray-400"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-all shadow-sm"
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
};

const ClubCard = ({ club, onViewDetails, isAdmin, onToggleStatus, onEdit }) => {
    const memberCount = club.memberCount ?? (club.members || []).filter(m => m.status === 'approved').length;
    const initials = club.name ? club.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
    const gradients = [
        'from-blue-500 to-indigo-600',
        'from-violet-500 to-purple-600',
        'from-emerald-500 to-teal-600',
        'from-orange-500 to-rose-500',
        'from-sky-500 to-cyan-600',
        'from-pink-500 to-fuchsia-600',
    ];
    const gradient = gradients[club.id % gradients.length] || gradients[0];

    return (
        <div
            onClick={() => onViewDetails(club)}
            className={`relative rounded-2xl overflow-hidden flex flex-col cursor-pointer group transition-all duration-200 hover:-translate-y-1 hover:shadow-xl shadow-md ${
                club.is_active ? '' : 'opacity-60 grayscale'
            }`}
            style={{ background: 'white', border: '1px solid #e5e7eb' }}
        >
            {/* Gradient Banner */}
            <div className={`h-24 bg-gradient-to-br ${gradient} relative flex items-end px-4 pb-3 shrink-0`}>
                {!club.is_active && (
                    <div className="absolute top-2 left-2 bg-black/40 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Inactive
                    </div>
                )}
                {/* Quick action buttons */}
                <div className="absolute top-2 right-2 flex gap-1.5">
                    {isAdmin && onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(club); }}
                            className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/40 transition-all"
                            title="Edit Club"
                        >
                            <Edit2 size={13} />
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleStatus(club.id, club.is_active); }}
                            className={`p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                                club.is_active
                                    ? 'bg-white/20 text-white hover:bg-red-500/80'
                                    : 'bg-white/20 text-white hover:bg-green-500/80'
                            }`}
                            title={club.is_active ? 'Deactivate' : 'Activate'}
                        >
                            <Zap size={13} className="fill-current" />
                        </button>
                    )}
                </div>
                {/* Avatar */}
                <div className="w-14 h-14 rounded-xl border-2 border-white/60 overflow-hidden bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-md">
                    {club.image_url ? (
                        <img src={club.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-white font-extrabold text-lg leading-none">{initials}</span>
                    )}
                </div>
            </div>

            {/* Card Body */}
            <div className="flex flex-col flex-1 p-4 gap-2">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900 text-base leading-snug group-hover:text-blue-600 transition-colors line-clamp-1">{club.name}</h3>
                    {club.membership_fee > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                            {formatMembershipFee(club.membership_fee)}
                        </span>
                    ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap shrink-0">Free</span>
                    )}
                </div>

                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{club.description || 'No description provided.'}</p>

                {/* Members count + fee type */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <Users size={12} className="text-blue-500" />
                        <span className="font-semibold text-gray-700">{memberCount}</span> Members
                    </span>
                    {club.fee_type && (
                        <span className="flex items-center gap-1">
                            <Clock size={12} className="text-purple-400" /> {club.fee_type}
                        </span>
                    )}
                </div>

                {/* Admin roles chips */}
                {club.admin_roles && club.admin_roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {club.admin_roles.slice(0, 2).map((roleItem, idx) => (
                            <span key={idx} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                                {roleItem.roleName}: {roleItem.name?.split(' ')[0]}
                            </span>
                        ))}
                        {club.admin_roles.length > 2 && (
                            <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">+{club.admin_roles.length - 2} more</span>
                        )}
                    </div>
                ) : (
                    <p className="text-[10px] text-gray-400 italic">No officers assigned</p>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 pb-4">
                <button
                    onClick={(e) => { e.stopPropagation(); onViewDetails(club); }}
                    className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-gray-50 text-gray-700 border border-gray-200 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600"
                >
                    <Eye size={13} /> View Details
                </button>
            </div>
        </div>
    );
};

const Modal = ({ show, onClose, title, children, size = 'default' }) => (
    <AnimatePresence>
        {show && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white rounded-2xl w-full shadow-2xl overflow-hidden my-4 ${size === 'tall' ? 'max-w-5xl min-h-[92vh] max-h-[96vh] flex flex-col' : 'max-w-3xl'}`}
                >
                    <div className="flex shrink-0 justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <div className={`p-6 ${size === 'tall' ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[80vh] overflow-y-auto'}`}>
                        {children}
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
);

const MultiSelectDropdown = ({ label, options, value, onChange, placeholder, disabled = false, headerAccessory = null }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const selectedValues = value || [];
    const selectedLabels = options.filter(option => selectedValues.includes(String(option.value))).map(option => option.label);
    const summary = selectedLabels.length > 0
        ? selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels[0]} +${selectedLabels.length - 1}`
        : placeholder;

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div ref={containerRef} className="relative min-w-0">
            <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-700">{label}</span>
                {headerAccessory}
            </div>
            <button
                type="button"
                disabled={disabled}
                aria-expanded={open}
                onClick={() => setOpen(current => !current)}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
                <span className="truncate">{summary}</span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-gray-500">
                    {selectedValues.length ? `${selectedValues.length} selected` : ''}
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>
            {open && !disabled && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
                    {options.length > 0 ? options.map(option => {
                        const optionValue = String(option.value);
                        const checked = selectedValues.includes(optionValue);
                        return (
                            <label key={optionValue} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs text-gray-700 hover:bg-blue-50">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onChange(checked
                                        ? selectedValues.filter(item => item !== optionValue)
                                        : [...selectedValues, optionValue]
                                    )}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="truncate">{option.label}</span>
                            </label>
                        );
                    }) : <p className="px-3 py-2 text-xs text-gray-400">No options available</p>}
                </div>
            )}
        </div>
    );
};

const Clubs = ({ initialSubPage }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = useAuthStore(state => state.user);
    const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());
    const getClubPageAccess = (clubId, pageKey) => {
        if (isAdmin) return { read: true, write: true };
        const pageActions = {
            management: { read: ['view', 'manage'], write: ['manage'] },
            students: { read: ['view_students', 'manage_students'], write: ['manage_students'] },
            settings: { read: ['view_settings', 'manage_settings'], write: ['manage_settings'] }
        }[pageKey];
        const globalRead = pageActions?.read.some(action => hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, action)) || false;
        const globalWrite = pageActions?.write.some(action => hasPermission(user?.permissions, BACKEND_MODULES.CLUBS, action)) || false;
        const assignments = (user?.clubRoles || []).filter(role => clubId == null || String(role.clubId) === String(clubId));
        return assignments.reduce((access, assignment) => {
            const pageAccess = getPagePermissions(assignment)[pageKey] || { read: false, write: false };
            return {
                read: access.read || pageAccess.read || pageAccess.write,
                write: access.write || pageAccess.write
            };
        }, { read: globalRead || globalWrite, write: globalWrite });
    };

    // Determine subPage directly from pathname or initialSubPage prop
    const getSubPageFromPath = () => {
        if (location.pathname.endsWith('/students')) return 'students';
        if (location.pathname.endsWith('/settings')) return 'settings';
        return initialSubPage || 'management';
    };

    const [subPage, setSubPage] = useState(getSubPageFromPath());

    useEffect(() => {
        setSubPage(getSubPageFromPath());
    }, [location.pathname]);

    useEffect(() => {
        if (!user?.clubRoles?.length || isAdmin) return;
        const availablePages = [...new Set(user.clubRoles.flatMap(role => pagesFromPermissions(getPagePermissions(role))))];
        if (availablePages.includes(subPage)) return;
        const fallbackPage = availablePages[0];
        navigate(fallbackPage ? (fallbackPage === 'management' ? '/clubs' : `/clubs/${fallbackPage}`) : '/', { replace: true });
    }, [user, subPage, navigate, isAdmin]);

    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'details'
    const [selectedClub, setSelectedClub] = useState(null);
    const [detailsTab, setDetailsTab] = useState('overview'); // 'overview' | 'members' | 'requests' | 'activities' | 'chat' | 'settings'

    useEffect(() => {
        if (viewMode !== 'details' || !selectedClub || isAdmin) return;
        const tabPage = { overview: 'management', activities: 'management', chat: 'management', members: 'students', pending: 'students', admins: 'settings', settings: 'settings' };
        if (getClubPageAccess(selectedClub.id, tabPage[detailsTab]).read) return;
        const firstAvailableTab = [
            ['management', 'overview'],
            ['students', 'members'],
            ['settings', 'settings']
        ].find(([page]) => getClubPageAccess(selectedClub.id, page).read)?.[1];
        if (firstAvailableTab) setDetailsTab(firstAvailableTab);
    }, [viewMode, selectedClub, detailsTab, user, isAdmin]);

    // Notification Toggles State
    const [announcementNotify, setAnnouncementNotify] = useState(localStorage.getItem('club_announcement_notify') !== 'false');
    const [feeNotify, setFeeNotify] = useState(localStorage.getItem('club_fee_notify') !== 'false');
    const [activityNotify, setActivityNotify] = useState(localStorage.getItem('club_activity_notify') !== 'false');

    // Dynamic Roles & HRMS Data
    const [dynamicRoles, setDynamicRoles] = useState([]);
    const [studentsList, setStudentsList] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);

    // Filter states for Students tab
    const [studentSearch, setStudentSearch] = useState('');
    const [studentClubFilter, setStudentClubFilter] = useState('');
    const [studentStatusFilter, setStudentStatusFilter] = useState('');

    // Filter states for Pending Students tab in Details view
    const [pendingSearch, setPendingSearch] = useState('');
    const [pendingCollege, setPendingCollege] = useState('');
    const [pendingCourse, setPendingCourse] = useState('');
    const [pendingBranch, setPendingBranch] = useState('');
    const [pendingYear, setPendingYear] = useState('');

    // Filter states for Members tab in Details view
    const [memberSearch, setMemberSearch] = useState('');
    const [memberCollege, setMemberCollege] = useState('');
    const [memberCourse, setMemberCourse] = useState('');
    const [memberBranch, setMemberBranch] = useState('');
    const [memberYear, setMemberYear] = useState('');

    // Modal States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [pageAssignmentToEdit, setPageAssignmentToEdit] = useState(null);
    const [pageAccessDraft, setPageAccessDraft] = useState(() => getPagePermissions());
    const [clubRoleDraft, setClubRoleDraft] = useState({ roleCode: '', roleName: '' });
    const [savingPageAccess, setSavingPageAccess] = useState(false);

    // Form Data for Club
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        image: null,
        membership_fee: '',
        fee_type: 'Yearly',
        admin_roles: [] // Array of multiple assigned admin roles [{ userId, hrmsId, empNo, name, email, roleCode, roleName }]
    });

    // Temp state for adding multiple dynamic admin roles inside Club Creation/Edit modal
    const [selectedRoleCode, setSelectedRoleCode] = useState('');
    const [hrmsSearchQuery, setHrmsSearchQuery] = useState('');
    const [hrmsSearchResults, setHrmsSearchResults] = useState([]);
    const [searchingHrms, setSearchingHrms] = useState(false);
    const [selectedHrmsEmployee, setSelectedHrmsEmployee] = useState(null);
    const [hrmsUserStatus, setHrmsUserStatus] = useState(null);

    // New/Edit Role Form Data
    const [roleForm, setRoleForm] = useState({ role_name: '', description: '', pages: [...DEFAULT_CLUB_ADMIN_PAGES] });

    // Inline Create User Form Data (for HRMS employee without SDMS user account)
    // Uses HRMS credentials — no manual password needed
    const [collegesList, setCollegesList] = useState([]);
    const [createUserRoleOptions, setCreateUserRoleOptions] = useState(DEFAULT_USER_ROLE_OPTIONS);
    const [createUserCourses, setCreateUserCourses] = useState([]);
    const [createUserBranches, setCreateUserBranches] = useState([]);
    const [loadingCreateUserCourses, setLoadingCreateUserCourses] = useState(false);
    const [loadingCreateUserBranches, setLoadingCreateUserBranches] = useState(false);
    const [createUserForm, setCreateUserForm] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'faculty',
        college_id: '',
        collegeIds: [],
        courseIds: [],
        branchIds: [],
        allCourses: false,
        allBranches: false,
        hodYears: [],
        allHodYears: true,
        hrms_id: ''
    });
    const [creatingUser, setCreatingUser] = useState(false);

    // Activity Modal State
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activityForm, setActivityForm] = useState({ title: '', description: '', date: '', location: '' });
    const [savingActivity, setSavingActivity] = useState(false);

    useEffect(() => {
        fetchClubs();
        if (isAdmin || getClubPageAccess(null, 'settings').read) fetchDynamicRoles();
        api.get('/colleges?includeInactive=false')
            .then(r => {
                if (r.data?.success && r.data?.data) {
                    setCollegesList(r.data.data);
                }
            })
            .catch(() => {});
        api.get('/rbac/users/roles/available')
            .then(r => {
                if (r.data?.success && Array.isArray(r.data?.data) && r.data.data.length > 0) {
                    setCreateUserRoleOptions(r.data.data);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (subPage === 'students') {
            fetchStudents();
        }
    }, [subPage]);

    const fetchClubs = async () => {
        setLoading(true);
        try {
            const response = await clubService.getClubs();
            if (response.success && response.data) {
                setClubs(response.data);
            }
        } catch (error) {
            toast.error('Failed to fetch clubs');
        } finally {
            setLoading(false);
        }
    };

    const fetchDynamicRoles = async () => {
        try {
            const res = await clubService.getClubRoles();
            if (res.success && res.data) {
                setDynamicRoles(res.data);
                if (res.data.length > 0 && !selectedRoleCode) {
                    setSelectedRoleCode(res.data[0].role_code);
                }
            }
        } catch (error) {
            console.error('Failed to fetch club roles:', error);
        }
    };

    const fetchStudents = async () => {
        setStudentsLoading(true);
        try {
            const res = await clubService.getAllClubStudents({
                club_id: studentClubFilter || undefined,
                status: studentStatusFilter || undefined
            });
            if (res.success && res.data) {
                setStudentsList(res.data);
            }
        } catch (error) {
            toast.error('Failed to load club students');
        } finally {
            setStudentsLoading(false);
        }
    };

    const selectedHodBranches = createUserBranches.filter(branch => createUserForm.branchIds.includes(String(branch.id)));
    const selectedHodCourses = createUserCourses.filter(course => createUserForm.courseIds.includes(String(course.id)));
    const branchYearCount = Math.max(0, ...selectedHodBranches.map(branch => Number(branch.totalYears || branch.total_years || branch.structure?.totalYears) || 0));
    const courseYearCount = Math.max(0, ...selectedHodCourses.map(course => Number(course.totalYears || course.total_years || course.structure?.totalYears) || 0));
    const createUserHodYearCount = Math.min(10, branchYearCount || courseYearCount || 4);

    // --- Dynamic Employee / HRMS Search ---
    const handleSearchHrms = async (query) => {
        setHrmsSearchQuery(query);
        if (!query || !query.trim()) {
            setHrmsSearchResults([]);
            return;
        }
        setSearchingHrms(true);
        try {
            const res = await clubService.searchHrmsEmployees(query.trim());
            if (res.success && res.data) {
                setHrmsSearchResults(res.data);
            }
        } catch (error) {
            console.error('Employee Search Error:', error);
        } finally {
            setSearchingHrms(false);
        }
    };

    const handleSelectHrmsEmployee = async (emp) => {
        setSelectedHrmsEmployee(emp);
        setHrmsSearchResults([]);

        if (emp.hasUserAccount) {
            setHrmsUserStatus({
                checking: false,
                hasUserAccount: true,
                userAccount: emp.userAccount || { id: emp._id, username: emp.emp_no }
            });
            return;
        }

        setHrmsUserStatus({ checking: true });
        try {
            const checkRes = await clubService.checkHrmsUserAccount({
                hrms_id: emp._id,
                email: emp.email,
                emp_no: emp.emp_no
            });

            if (checkRes.success) {
                setHrmsUserStatus({
                    checking: false,
                    hasUserAccount: checkRes.hasUserAccount,
                    userAccount: checkRes.userAccount
                });
            }
        } catch (err) {
            console.error('Error checking user account:', err);
            setHrmsUserStatus({ checking: false, hasUserAccount: false, userAccount: null });
        }
    };

    const loadCreateUserCourses = async (collegeIds) => {
        if (!collegeIds.length) {
            setCreateUserCourses([]);
            return;
        }
        setLoadingCreateUserCourses(true);
        try {
            const responses = await Promise.all(collegeIds.map(id => api.get(`/colleges/${id}/courses?includeInactive=false`)));
            setCreateUserCourses(responses.flatMap((response, index) =>
                (response.data?.data || []).map(course => ({ ...course, collegeId: collegeIds[index] }))
            ));
        } catch (error) {
            toast.error('Failed to load courses');
            setCreateUserCourses([]);
        } finally {
            setLoadingCreateUserCourses(false);
        }
    };

    const loadCreateUserBranches = async (courseIds) => {
        if (!courseIds.length) {
            setCreateUserBranches([]);
            return;
        }
        setLoadingCreateUserBranches(true);
        try {
            const responses = await Promise.all(courseIds.map(id => api.get(`/courses/${id}/branches?includeInactive=false`)));
            setCreateUserBranches(responses.flatMap((response, index) =>
                (response.data?.data || []).map(branch => ({
                    ...branch,
                    courseId: courseIds[index],
                    courseName: createUserCourses.find(course => String(course.id) === String(courseIds[index]))?.name || ''
                }))
            ));
        } catch (error) {
            toast.error('Failed to load branches');
            setCreateUserBranches([]);
        } finally {
            setLoadingCreateUserBranches(false);
        }
    };

    const handleCreateUserCollegeChange = async (collegeIds) => {
        setCreateUserForm(prev => ({
            ...prev,
            college_id: collegeIds[0] || '',
            collegeIds,
            courseIds: [],
            branchIds: [],
            allCourses: false,
            allBranches: false
        }));
        setCreateUserBranches([]);
        await loadCreateUserCourses(collegeIds);
    };

    const handleCreateUserCourseChange = async (courseIds) => {
        setCreateUserForm(prev => ({ ...prev, courseIds, branchIds: [], allBranches: false }));
        await loadCreateUserBranches(courseIds);
    };

    // Open inline modal to create SDMS user account for HRMS employee
    const handleOpenCreateUserModal = () => {
        if (!selectedHrmsEmployee) return;
        const defaultCol = collegesList.length > 0 ? collegesList[0].id : '';
        setCreateUserForm({
            name: selectedHrmsEmployee.name || '',
            email: selectedHrmsEmployee.email && !selectedHrmsEmployee.email.includes('@hrms') ? selectedHrmsEmployee.email : `${selectedHrmsEmployee.emp_no}@pydah.edu.in`,
            phone: selectedHrmsEmployee.phone || '',
            role: 'faculty',
            college_id: defaultCol,
            collegeIds: defaultCol ? [String(defaultCol)] : [],
            courseIds: [],
            branchIds: [],
            allCourses: false,
            allBranches: false,
            hodYears: [],
            allHodYears: true,
            hrms_id: selectedHrmsEmployee._id || ''
        });
        setCreateUserCourses([]);
        setCreateUserBranches([]);
        if (defaultCol) loadCreateUserCourses([String(defaultCol)]);
        setShowCreateUserModal(true);
    };

    const handleCreateSDMSUserAccount = async (e) => {
        e.preventDefault();
        if (!createUserForm.collegeIds.length) return toast.error('Select at least one college');
        if (createUserForm.role === 'branch_hod' && createUserForm.courseIds.length === 0) {
            return toast.error('Select at least one course for a Branch HOD');
        }
        if (createUserForm.role === 'branch_hod' && createUserForm.branchIds.length === 0) {
            return toast.error('Select at least one branch for a Branch HOD');
        }
        if (createUserForm.role === 'branch_hod' && !createUserForm.allHodYears && createUserForm.hodYears.length === 0) {
            return toast.error('Select at least one year or choose All Years');
        }
        setCreatingUser(true);
        try {
            // Use emp_no as username and HRMS-linked credentials (no manual password)
            const payload = {
                ...createUserForm,
                college_id: createUserForm.college_id,
                collegeIds: createUserForm.collegeIds,
                courseIds: createUserForm.role === 'branch_hod' || !createUserForm.allCourses ? createUserForm.courseIds : [],
                branchIds: createUserForm.role === 'branch_hod' || !createUserForm.allBranches ? createUserForm.branchIds : [],
                allCourses: createUserForm.role !== 'branch_hod' && createUserForm.allCourses,
                allBranches: createUserForm.role !== 'branch_hod' && createUserForm.allBranches,
                hodYears: createUserForm.role === 'branch_hod' ? createUserForm.hodYears : [],
                allHodYears: createUserForm.role === 'branch_hod' ? !!createUserForm.allHodYears : false,
                username: selectedHrmsEmployee?.emp_no || createUserForm.email,
                use_hrms_credentials: true  // backend will derive password from HRMS link
            };
            const response = await api.post('/rbac/users', payload);
            if (response.data && response.data.success) {
                toast.success(`SDMS User Account created for ${createUserForm.name}`);
                setShowCreateUserModal(false);
                const newUser = response.data.data;
                setHrmsUserStatus({
                    checking: false,
                    hasUserAccount: true,
                    userAccount: newUser
                });
            } else {
                toast.error(response.data?.message || 'Failed to create user account');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create user account');
        } finally {
            setCreatingUser(false);
        }
    };

    // Handle adding a new activity to the selected club
    const handleAddActivity = async (e) => {
        e.preventDefault();
        if (!selectedClub?.id) return;
        setSavingActivity(true);
        try {
            const res = await clubService.createActivity(selectedClub.id, activityForm);
            if (res.success) {
                toast.success('Activity added successfully');
                setShowActivityModal(false);
                setActivityForm({ title: '', description: '', date: '', location: '' });
                // Refresh club details
                const updated = await clubService.getClubDetails(selectedClub.id);
                if (updated.success) setSelectedClub(updated.data);
            } else {
                toast.error(res.message || 'Failed to add activity');
            }
        } catch (err) {
            toast.error('Failed to add activity');
        } finally {
            setSavingActivity(false);
        }
    };

    const handleAddAdminRoleAssignment = () => {
        if (!selectedRoleCode) return toast.error('Please select a role');
        if (!selectedHrmsEmployee) return toast.error('Please select an employee');
        if (!hrmsUserStatus?.hasUserAccount) {
            return toast.error('Employee must have an active SDMS User Account before assignment.');
        }

        const roleObj = dynamicRoles.find(r => r.role_code === selectedRoleCode) || { role_name: selectedRoleCode };
        const isSuperAdmin = ['admin', 'super_admin', 'superadmin'].includes(String(hrmsUserStatus.userAccount?.role || '').toLowerCase());
        const pagePermissions = isSuperAdmin
            ? getPagePermissions()
            : getPagePermissions({ pages: roleObj.pages || DEFAULT_CLUB_ADMIN_PAGES });

        const newAssignment = {
            userId: hrmsUserStatus.userAccount?.id,
            hrmsId: selectedHrmsEmployee._id,
            empNo: selectedHrmsEmployee.emp_no,
            name: selectedHrmsEmployee.name,
            email: selectedHrmsEmployee.email,
            roleCode: selectedRoleCode,
            roleName: roleObj.role_name,
            pages: pagesFromPermissions(pagePermissions),
            pagePermissions,
            isSuperAdmin
        };

        setFormData(prev => ({
            ...prev,
            admin_roles: [...(prev.admin_roles || []), newAssignment]
        }));

        setSelectedHrmsEmployee(null);
        setHrmsSearchQuery('');
        setHrmsUserStatus(null);
        toast.success(`Assigned ${newAssignment.name} as ${newAssignment.roleName}`);
    };

    const handleRemoveAdminRoleAssignment = (index) => {
        setFormData(prev => ({
            ...prev,
            admin_roles: prev.admin_roles.filter((_, i) => i !== index)
        }));
    };

    const handleChangeAssignedClubRole = (assignmentIndex, roleCode) => {
        const selectedRole = dynamicRoles.find(role => role.role_code === roleCode);
        if (!selectedRole) return;
        setFormData(prev => ({
            ...prev,
            admin_roles: prev.admin_roles.map((assignment, index) => {
                if (index !== assignmentIndex) return assignment;
                const pagePermissions = assignment.isSuperAdmin
                    ? getPagePermissions()
                    : getPagePermissions({ pages: selectedRole.pages || DEFAULT_CLUB_ADMIN_PAGES });
                return {
                    ...assignment,
                    roleCode: selectedRole.role_code,
                    roleName: selectedRole.role_name,
                    pagePermissions,
                    pages: pagesFromPermissions(pagePermissions)
                };
            })
        }));
    };

    const handleToggleAdminRolePage = (assignmentIndex, pageKey, accessType) => {
        setFormData(prev => ({
            ...prev,
            admin_roles: prev.admin_roles.map((assignment, index) => {
                if (index !== assignmentIndex || assignment.isSuperAdmin) return assignment;
                const pagePermissions = getPagePermissions(assignment);
                const current = pagePermissions[pageKey];
                const next = { ...current, [accessType]: !current[accessType] };
                if (accessType === 'write' && next.write) next.read = true;
                if (accessType === 'read' && !next.read) next.write = false;
                pagePermissions[pageKey] = next;
                return {
                    ...assignment,
                    pagePermissions,
                    pages: pagesFromPermissions(pagePermissions)
                };
            })
        }));
    };

    const openClubUserEditor = (club, assignment, assignmentIndex) => {
        setPageAssignmentToEdit({ club, assignment, assignmentIndex });
        setPageAccessDraft(assignment.isSuperAdmin ? getPagePermissions() : getPagePermissions(assignment));
        setClubRoleDraft({
            roleCode: assignment.roleCode || '',
            roleName: assignment.roleName || assignment.roleCode || ''
        });
    };

    const handleSavePageAccess = async () => {
        if (!pageAssignmentToEdit) return;
        const { club, assignmentIndex } = pageAssignmentToEdit;
        const adminRoles = (club.admin_roles || []).map((assignment, index) =>
            index === assignmentIndex ? (() => {
                const pagePermissions = assignment.isSuperAdmin ? getPagePermissions() : pageAccessDraft;
                return {
                    ...assignment,
                    roleCode: clubRoleDraft.roleCode || assignment.roleCode,
                    roleName: clubRoleDraft.roleName || assignment.roleName,
                    pagePermissions,
                    pages: pagesFromPermissions(pagePermissions)
                };
            })() : assignment
        );
        const updateData = new FormData();
        updateData.append('name', club.name || '');
        updateData.append('description', club.description || '');
        updateData.append('membership_fee', club.membership_fee || 0);
        updateData.append('fee_type', club.fee_type || 'Yearly');
        updateData.append('admin_roles', JSON.stringify(adminRoles));

        setSavingPageAccess(true);
        try {
            const response = await clubService.updateClub(club.id, updateData);
            if (!response.success) throw new Error(response.message || 'Could not update page access');
            toast.success('Club role and page access updated');
            setPageAssignmentToEdit(null);
            await fetchClubs();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Failed to update page access');
        } finally {
            setSavingPageAccess(false);
        }
    };

    // --- Dynamic Club Roles Management ---
    const handleSaveDynamicRole = async (e) => {
        e.preventDefault();
        try {
            if (editingRole) {
                const res = await clubService.updateClubRole(editingRole.id, roleForm);
                if (res.success) {
                    toast.success('Dynamic role updated');
                    setShowRoleModal(false);
                    setEditingRole(null);
                    setRoleForm({ role_name: '', description: '', pages: [...DEFAULT_CLUB_ADMIN_PAGES] });
                    fetchDynamicRoles();
                } else {
                    toast.error(res.message || 'Failed to update role');
                }
            } else {
                const res = await clubService.createClubRole(roleForm);
                if (res.success) {
                    toast.success('Dynamic role created');
                    setShowRoleModal(false);
                    setRoleForm({ role_name: '', description: '', pages: [...DEFAULT_CLUB_ADMIN_PAGES] });
                    fetchDynamicRoles();
                } else {
                    toast.error(res.message || 'Failed to create role');
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error saving dynamic role');
        }
    };

    const handleOpenEditRole = (role) => {
        setEditingRole(role);
        setRoleForm({
            role_name: role.role_name || '',
            description: role.description || '',
            pages: [...(role.pages || DEFAULT_CLUB_ADMIN_PAGES)]
        });
        setShowRoleModal(true);
    };

    const handleToggleRolePage = (pageKey) => {
        setRoleForm(prev => ({
            ...prev,
            pages: (prev.pages || DEFAULT_CLUB_ADMIN_PAGES).includes(pageKey)
                ? (prev.pages || DEFAULT_CLUB_ADMIN_PAGES).filter(page => page !== pageKey)
                : [...(prev.pages || DEFAULT_CLUB_ADMIN_PAGES), pageKey]
        }));
    };

    const handleDeleteDynamicRole = async (roleId) => {
        if (!window.confirm('Are you sure you want to delete this dynamic role?')) return;
        try {
            const res = await clubService.deleteClubRole(roleId);
            if (res.success) {
                toast.success('Role deleted');
                fetchDynamicRoles();
            } else {
                toast.error(res.message || 'Failed to delete role');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error deleting role');
        }
    };

    // --- Club Actions ---
    const handleCreateClub = async (e) => {
        e.preventDefault();
        try {
            if (!formData.name) return toast.error('Club name is required');
            const data = new FormData();
            data.append('name', formData.name);
            data.append('description', formData.description);
            data.append('membership_fee', formData.membership_fee);
            data.append('fee_type', formData.fee_type);
            data.append('admin_roles', JSON.stringify(formData.admin_roles || []));

            if (formData.image) {
                data.append('image', formData.image);
            }

            const response = await clubService.createClub(data);
            if (response.success) {
                toast.success('Student Club created successfully');
                setShowCreateModal(false);
                resetForm();
                fetchClubs();
            }
        } catch (error) {
            toast.error('Failed to create club');
        }
    };

    const handleUpdateClub = async (e) => {
        e.preventDefault();
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('description', formData.description);
            data.append('membership_fee', formData.membership_fee);
            data.append('fee_type', formData.fee_type);
            data.append('admin_roles', JSON.stringify(formData.admin_roles || []));

            if (formData.image) {
                data.append('image', formData.image);
            }

            const response = await clubService.updateClub(selectedClub.id, data);
            if (response.success) {
                toast.success('Club updated successfully');
                setShowEditModal(false);
                fetchClubs();
                if (selectedClub) {
                    const updated = await clubService.getClubDetails(selectedClub.id);
                    if (updated.success) setSelectedClub(updated.data);
                }
            }
        } catch (error) {
            toast.error('Failed to update club');
        }
    };

    const handleToggleStatus = async (clubId, currentStatus) => {
        try {
            const response = await clubService.toggleClubStatus(clubId, !currentStatus);
            if (response.success) {
                toast.success(response.message);
                fetchClubs();
            }
        } catch (error) {
            toast.error('Failed to toggle club status');
        }
    };

    const handleApprovalAction = async (clubId, studentId, status) => {
        try {
            const res = await clubService.updateMembershipStatus(clubId, studentId, status);
            if (res.success) {
                toast.success(`Request ${status} successfully`);
                fetchClubs();
                fetchStudents();
                if (selectedClub && selectedClub.id === clubId) {
                    const updatedClub = await clubService.getClubDetails(clubId);
                    if (updatedClub?.success && updatedClub?.data) {
                        setSelectedClub(updatedClub.data);
                    }
                }
            }
        } catch (error) {
            toast.error(`Failed to ${status} request`);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            image: null,
            membership_fee: '',
            fee_type: 'Yearly',
            admin_roles: []
        });
        setSelectedHrmsEmployee(null);
        setHrmsSearchQuery('');
        setHrmsUserStatus(null);
    };

    const prepareEdit = (club) => {
        setSelectedClub(club);
        setFormData({
            name: club.name || '',
            description: club.description || '',
            image: null,
            membership_fee: club.membership_fee || '',
            fee_type: club.fee_type || 'Yearly',
            admin_roles: club.admin_roles || []
        });
        setShowEditModal(true);
    };

    const handleViewDetails = async (club) => {
        if (!club) return;
        setSelectedClub(club);
        setDetailsTab('overview');
        setViewMode('details');
        try {
            const res = await clubService.getClubDetails(club.id);
            if (res.success && res.data) {
                setSelectedClub(res.data);
            }
        } catch (error) {
            console.error('Failed to load full club details:', error);
        }
    };

    const filteredStudents = studentsList.filter(s => {
        const matchesSearch = !studentSearch || 
            s.student_name?.toLowerCase().includes(studentSearch.toLowerCase()) || 
            s.admission_number?.toLowerCase().includes(studentSearch.toLowerCase());
        const matchesClub = !studentClubFilter || String(s.club_id) === String(studentClubFilter);
        const matchesStatus = !studentStatusFilter || s.status === studentStatusFilter;
        return matchesSearch && matchesClub && matchesStatus;
    });

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">

            {/* ================= 1. SUBPAGE: CLUB MANAGEMENT ================= */}
            {subPage === 'management' && (
                <>
                    {viewMode === 'list' ? (
                        <div className="space-y-4">
                            {/* Top Bar */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                                        <Users size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-extrabold text-gray-900 leading-tight">Student Clubs</h2>
                                        <p className="text-xs text-gray-500">{clubs.length} {clubs.length === 1 ? 'club' : 'clubs'} registered</p>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={() => { resetForm(); setShowCreateModal(true); }}
                                        className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm"
                                    >
                                        <Plus size={16} strokeWidth={2.5} /> Create Club
                                    </button>
                                )}
                            </div>

                            {/* Clubs Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {clubs.map(club => (
                                    <ClubCard
                                        key={club.id}
                                        club={club}
                                        onViewDetails={handleViewDetails}
                                        isAdmin={isAdmin}
                                        onToggleStatus={handleToggleStatus}
                                        onEdit={prepareEdit}
                                    />
                                ))}
                                {clubs.length === 0 && !loading && (
                                    <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                                        <Shield size={48} className="mx-auto mb-4 opacity-20" />
                                        <p className="text-lg font-medium text-gray-500">No student clubs found</p>
                                        <p className="text-sm">Click "Create New Club" to register a new student club</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Club Details View */
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                            {/* Gradient Banner Header */}
                            {(() => {
                                const gradients = [
                                    'from-blue-500 to-indigo-600',
                                    'from-violet-500 to-purple-600',
                                    'from-emerald-500 to-teal-600',
                                    'from-orange-500 to-rose-500',
                                    'from-sky-500 to-cyan-600',
                                    'from-pink-500 to-fuchsia-600',
                                ];
                                const gradient = gradients[(selectedClub?.id || 0) % gradients.length];
                                const initials = selectedClub?.name ? selectedClub.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
                                return (
                                    <div className={`bg-gradient-to-br ${gradient} px-6 pt-6 pb-4 relative`}>
                                        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                                            <div className="flex items-end gap-4">
                                                <button
                                                    onClick={() => setViewMode('list')}
                                                    className="p-2 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all mb-0.5"
                                                >
                                                    <ArrowRight size={18} className="rotate-180" />
                                                </button>
                                                <div className="w-16 h-16 rounded-2xl border-2 border-white/50 overflow-hidden bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                                                    {selectedClub?.image_url ? (
                                                        <img src={selectedClub.image_url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-white font-extrabold text-xl">{initials}</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h2 className="text-2xl font-extrabold text-white">{selectedClub?.name}</h2>
                                                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${
                                                            selectedClub?.is_active ? 'bg-white/20 text-white' : 'bg-red-200/70 text-red-900'
                                                        }`}>
                                                            {selectedClub?.is_active ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-white/80 mt-0.5 max-w-xl line-clamp-1">{selectedClub?.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pb-1">
                                                {getClubPageAccess(selectedClub?.id, 'settings').write && (
                                                    <button
                                                        onClick={() => prepareEdit(selectedClub)}
                                                        className="px-3.5 py-2 bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-white/30"
                                                    >
                                                        <Edit2 size={14} /> Edit Club
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setDetailsTab('chat')}
                                                    disabled={!getClubPageAccess(selectedClub?.id, 'management').read}
                                                    title={!getClubPageAccess(selectedClub?.id, 'management').read ? 'Management read access required' : 'Open club chat'}
                                                    className="px-3.5 py-2 bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-white/30"
                                                >
                                                    <MessageSquare size={14} /> Chat
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Inner Navigation Tabs Bar */}
                            {(() => {
                                const approvedMembers = (selectedClub?.members || []).filter(m => m.status === 'approved');
                                const pendingFeeStudents = (selectedClub?.members || []).filter(m =>
                                    m.payment_status === 'payment_due' || Number(m.due_amount) > 0 || (Number(selectedClub?.membership_fee) > 0 && m.status !== 'approved')
                                );
                                const clubActivities = selectedClub?.activities || [];

                                return (
                                    <>
                                        {/* Tab Strip */}
                                        <div className="border-b border-gray-200 bg-white">
                                            <div className="flex items-center gap-0 overflow-x-auto px-6 scrollbar-hide">
                                                {[
                                                    { key: 'overview', label: 'Overview', pageKey: 'management', icon: Shield },
                                                    { key: 'members', label: `Members`, pageKey: 'students', count: approvedMembers.length, icon: Users },
                                                    { key: 'pending', label: `Pending`, pageKey: 'students', count: pendingFeeStudents.length, icon: Clock },
                                                    { key: 'activities', label: `Activities`, pageKey: 'management', count: clubActivities.length, icon: Calendar },
                                                    { key: 'chat', label: 'Chat', pageKey: 'management', icon: MessageSquare },
                                                    { key: 'admins', label: 'Club Admins', pageKey: 'settings', count: selectedClub?.admin_roles?.length || 0, icon: UserCheck },
                                                    { key: 'settings', label: 'Settings', pageKey: 'settings', icon: Settings }
                                                ].filter(tab => getClubPageAccess(selectedClub?.id, tab.pageKey).read).map(tab => {
                                                    const Icon = tab.icon;
                                                    const isActive = detailsTab === tab.key;
                                                    return (
                                                        <button
                                                            key={tab.key}
                                                            onClick={() => setDetailsTab(tab.key)}
                                                            className={`flex items-center gap-2 px-4 py-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                                                                isActive
                                                                    ? 'border-blue-600 text-blue-600'
                                                                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                                            }`}
                                                        >
                                                            <Icon size={14} />
                                                            {tab.label}
                                                            {tab.count !== undefined && (
                                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold leading-none ${
                                                                    isActive
                                                                        ? 'bg-blue-100 text-blue-700'
                                                                        : tab.count > 0
                                                                            ? 'bg-amber-100 text-amber-700'
                                                                            : 'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                    {tab.count}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Tab Content */}
                                        <div className="p-6 space-y-6">

                                        {/* TAB 1: OVERVIEW */}
                                        {detailsTab === 'overview' && (
                                            <div className="space-y-6 pt-2">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                                    {getClubPageAccess(selectedClub?.id, 'students').read && <div className="p-4 rounded-xl border border-gray-100 bg-blue-50/50">
                                                        <p className="text-xs text-blue-600 font-medium">Approved Members</p>
                                                        <p className="text-2xl font-bold text-gray-900 mt-1">{approvedMembers.length}</p>
                                                    </div>}
                                                    {getClubPageAccess(selectedClub?.id, 'students').read && <div className="p-4 rounded-xl border border-gray-100 bg-amber-50/50">
                                                        <p className="text-xs text-amber-600 font-medium">Fee Pending Students</p>
                                                        <p className="text-2xl font-bold text-gray-900 mt-1">{pendingFeeStudents.length}</p>
                                                    </div>}
                                                    <div className="p-4 rounded-xl border border-gray-100 bg-green-50/50">
                                                        <p className="text-xs text-green-600 font-medium">Membership Fee</p>
                                                        <p className="text-2xl font-bold text-gray-900 mt-1">{formatMembershipFee(selectedClub?.membership_fee)}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl border border-gray-100 bg-purple-50/50">
                                                        <p className="text-xs text-purple-600 font-medium">Fee Schedule</p>
                                                        <p className="text-2xl font-bold text-gray-900 mt-1">{selectedClub?.fee_type || 'Yearly'}</p>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                                                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                        <Shield size={18} className="text-blue-600" /> Club Officers & Dynamic Admin Roles
                                                    </h3>
                                                    {selectedClub?.admin_roles && selectedClub.admin_roles.length > 0 ? (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                            {selectedClub.admin_roles.map((roleItem, i) => (
                                                                <div key={i} className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs shadow-xs">
                                                                    <p className="font-extrabold text-blue-700">{roleItem.roleName}</p>
                                                                    <p className="font-semibold text-slate-800 mt-1">{roleItem.name}</p>
                                                                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{roleItem.email}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-500 italic">No admin leadership roles assigned yet. Go to Settings tab to manage officers.</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {detailsTab === 'admins' && (
                                            <div className="space-y-4 pt-2">
                                                <div>
                                                    <h3 className="text-base font-bold text-gray-900">Club Admins ({selectedClub?.admin_roles?.length || 0})</h3>
                                                    <p className="text-xs text-gray-500">People assigned to manage this club and their page access.</p>
                                                </div>
                                                {selectedClub?.admin_roles?.length ? (
                                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                                        <table className="w-full text-left text-xs">
                                                            <thead className="border-b bg-gray-50 font-semibold uppercase text-gray-600">
                                                                <tr>
                                                                    <th className="p-3">Name</th>
                                                                    <th className="p-3">Email / Username</th>
                                                                    <th className="p-3">Club Role</th>
                                                                    <th className="p-3">Page Access</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {selectedClub.admin_roles.map((assignment, index) => (
                                                                    <tr key={`${assignment.userId || assignment.email || assignment.empNo}-${index}`}>
                                                                        <td className="p-3 font-semibold text-gray-900">{assignment.name || 'Club Admin'}</td>
                                                                        <td className="p-3 text-gray-600">{assignment.email || assignment.empNo || '—'}</td>
                                                                        <td className="p-3 text-gray-700">{assignment.roleName || assignment.roleCode || 'Club Admin'}</td>
                                                                        <td className="p-3">
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {CLUB_ADMIN_PAGES.flatMap(page => {
                                                                                    const access = getPagePermissions(assignment)[page.key];
                                                                                    if (!access.read && !access.write) return [];
                                                                                    return [(
                                                                                        <span key={page.key} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                                                            {page.label}: {access.write ? 'Read/Write' : 'Read'}
                                                                                        </span>
                                                                                    )];
                                                                                })}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-sm text-gray-500">
                                                        No admins are assigned to this club yet.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* TAB 2: MEMBERS */}
                                        {detailsTab === 'members' && (() => {
                                            const memberColleges = Array.from(new Set(approvedMembers.map(m => m.college).filter(Boolean))).sort();
                                            const memberCourses = Array.from(new Set(approvedMembers.map(m => m.course).filter(Boolean))).sort();
                                            const memberBranches = Array.from(new Set(approvedMembers.map(m => m.branch).filter(Boolean))).sort();
                                            const memberYears = Array.from(new Set(approvedMembers.map(m => m.current_year).filter(Boolean))).sort((a, b) => Number(a) - Number(b));

                                            const filteredMembers = approvedMembers.filter(m => {
                                                if (memberCollege && String(m.college || '').toLowerCase() !== memberCollege.toLowerCase()) return false;
                                                if (memberCourse && String(m.course || '').toLowerCase() !== memberCourse.toLowerCase()) return false;
                                                if (memberBranch && String(m.branch || '').toLowerCase() !== memberBranch.toLowerCase()) return false;
                                                if (memberYear && String(m.current_year || '') !== String(memberYear)) return false;
                                                if (memberSearch.trim()) {
                                                    const q = memberSearch.toLowerCase().trim();
                                                    const name = String(m.student_name || m.name || '').toLowerCase();
                                                    const adm = String(m.admission_number || m.pin_no || '').toLowerCase();
                                                    const email = String(m.email || '').toLowerCase();
                                                    const phone = String(m.student_mobile || m.phone_number || '').toLowerCase();
                                                    const branch = String(m.branch || '').toLowerCase();
                                                    const course = String(m.course || '').toLowerCase();
                                                    const college = String(m.college || '').toLowerCase();
                                                    if (!name.includes(q) && !adm.includes(q) && !email.includes(q) && !phone.includes(q) && !branch.includes(q) && !course.includes(q) && !college.includes(q)) {
                                                        return false;
                                                    }
                                                }
                                                return true;
                                            });

                                            const hasActiveMemberFilters = memberSearch || memberCollege || memberCourse || memberBranch || memberYear;

                                            return (
                                                <div className="space-y-4 pt-2">
                                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                                        <h3 className="text-base font-bold text-gray-900">
                                                            Approved Student Members ({filteredMembers.length}{hasActiveMemberFilters ? ` of ${approvedMembers.length}` : ''})
                                                        </h3>
                                                    </div>

                                                    {/* Filter Toolbar for Members */}
                                                    <div className="flex flex-wrap items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200">
                                                        {/* Search Box */}
                                                        <div className="relative flex-1 min-w-[200px]">
                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                value={memberSearch}
                                                                onChange={(e) => setMemberSearch(e.target.value)}
                                                                placeholder="Search by name, PIN, branch..."
                                                                className="w-full pl-9 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                            />
                                                            {memberSearch && (
                                                                <button
                                                                    onClick={() => setMemberSearch('')}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* College */}
                                                        <select
                                                            value={memberCollege}
                                                            onChange={(e) => setMemberCollege(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Colleges</option>
                                                            {memberColleges.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>

                                                        {/* Course */}
                                                        <select
                                                            value={memberCourse}
                                                            onChange={(e) => setMemberCourse(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Courses</option>
                                                            {memberCourses.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>

                                                        {/* Branch */}
                                                        <select
                                                            value={memberBranch}
                                                            onChange={(e) => setMemberBranch(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Branches</option>
                                                            {memberBranches.map(b => (
                                                                <option key={b} value={b}>{b}</option>
                                                            ))}
                                                        </select>

                                                        {/* Year */}
                                                        <select
                                                            value={memberYear}
                                                            onChange={(e) => setMemberYear(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Years</option>
                                                            {(memberYears.length > 0 ? memberYears : [1, 2, 3, 4]).map(y => (
                                                                <option key={y} value={y}>Year {y}</option>
                                                            ))}
                                                        </select>

                                                        {hasActiveMemberFilters && (
                                                            <button
                                                                onClick={() => {
                                                                    setMemberSearch('');
                                                                    setMemberCollege('');
                                                                    setMemberCourse('');
                                                                    setMemberBranch('');
                                                                    setMemberYear('');
                                                                }}
                                                                className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1"
                                                            >
                                                                <X size={12} /> Clear
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="overflow-x-auto border rounded-xl bg-white shadow-xs">
                                                        <table className="w-full text-left text-xs">
                                                            <thead className="bg-gray-50 border-b text-gray-600 uppercase font-semibold">
                                                                <tr>
                                                                    <th className="p-3">Student Name</th>
                                                                    <th className="p-3">Admission No</th>
                                                                    <th className="p-3">Academic Info</th>
                                                                    <th className="p-3">Contact</th>
                                                                    <th className="p-3">Joined Date</th>
                                                                    <th className="p-3">Payment Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {filteredMembers.map((m, idx) => (
                                                                    <tr key={m.id || m.student_id || idx} className="hover:bg-gray-50/50 transition-colors">
                                                                        <td className="p-3 font-semibold text-gray-900">{m.student_name || m.name}</td>
                                                                        <td className="p-3 font-mono text-gray-600">{m.admission_number || m.student_id || '—'}</td>
                                                                        <td className="p-3 text-gray-700">
                                                                            {m.course || m.branch ? (
                                                                                <div>
                                                                                    <p className="font-medium">{[m.course, m.branch].filter(Boolean).join(' • ')}</p>
                                                                                    <p className="text-[11px] text-gray-500">
                                                                                        {m.college ? `${m.college} • ` : ''}{m.current_year ? `Year ${m.current_year}` : ''}
                                                                                    </p>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-gray-400 italic">Not available</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="p-3 text-gray-500">{m.email || m.phone_number || m.student_mobile || '—'}</td>
                                                                        <td className="p-3 text-gray-500">{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'N/A'}</td>
                                                                        <td className="p-3">
                                                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold text-[10px]">
                                                                                {m.payment_status || 'Paid'}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {filteredMembers.length === 0 && (
                                                                    <tr>
                                                                        <td colSpan={6} className="p-8 text-center text-gray-400">
                                                                            {hasActiveMemberFilters
                                                                                ? 'No approved members match the selected filters.'
                                                                                : 'No approved members found for this club yet.'}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* TAB: PENDING STUDENTS & CLUB FEE PENDING */}
                                        {detailsTab === 'pending' && (() => {
                                            const pendingColleges = Array.from(new Set(pendingFeeStudents.map(m => m.college).filter(Boolean))).sort();
                                            const pendingCourses = Array.from(new Set(pendingFeeStudents.map(m => m.course).filter(Boolean))).sort();
                                            const pendingBranches = Array.from(new Set(pendingFeeStudents.map(m => m.branch).filter(Boolean))).sort();
                                            const pendingYears = Array.from(new Set(pendingFeeStudents.map(m => m.current_year).filter(Boolean))).sort((a, b) => Number(a) - Number(b));

                                            const filteredPending = pendingFeeStudents.filter(m => {
                                                if (pendingCollege && String(m.college || '').toLowerCase() !== pendingCollege.toLowerCase()) return false;
                                                if (pendingCourse && String(m.course || '').toLowerCase() !== pendingCourse.toLowerCase()) return false;
                                                if (pendingBranch && String(m.branch || '').toLowerCase() !== pendingBranch.toLowerCase()) return false;
                                                if (pendingYear && String(m.current_year || '') !== String(pendingYear)) return false;
                                                if (pendingSearch.trim()) {
                                                    const q = pendingSearch.toLowerCase().trim();
                                                    const name = String(m.student_name || m.name || '').toLowerCase();
                                                    const adm = String(m.admission_number || m.pin_no || '').toLowerCase();
                                                    const email = String(m.email || '').toLowerCase();
                                                    const phone = String(m.student_mobile || m.phone_number || '').toLowerCase();
                                                    const branch = String(m.branch || '').toLowerCase();
                                                    const course = String(m.course || '').toLowerCase();
                                                    const college = String(m.college || '').toLowerCase();
                                                    if (!name.includes(q) && !adm.includes(q) && !email.includes(q) && !phone.includes(q) && !branch.includes(q) && !course.includes(q) && !college.includes(q)) {
                                                        return false;
                                                    }
                                                }
                                                return true;
                                            });

                                            const hasActivePendingFilters = pendingSearch || pendingCollege || pendingCourse || pendingBranch || pendingYear;

                                            return (
                                                <div className="space-y-4 pt-2">
                                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                                        <div>
                                                            <h3 className="text-base font-bold text-gray-900">
                                                                Pending Students ({filteredPending.length}{hasActivePendingFilters ? ` of ${pendingFeeStudents.length}` : ''})
                                                            </h3>
                                                            <p className="text-xs text-gray-500">
                                                                Students are automatically added as approved members once their club fee is paid.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Filter Toolbar for Pending Students */}
                                                    <div className="flex flex-wrap items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200">
                                                        {/* Search Box */}
                                                        <div className="relative flex-1 min-w-[200px]">
                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                value={pendingSearch}
                                                                onChange={(e) => setPendingSearch(e.target.value)}
                                                                placeholder="Search by name, PIN, branch..."
                                                                className="w-full pl-9 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                            />
                                                            {pendingSearch && (
                                                                <button
                                                                    onClick={() => setPendingSearch('')}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* College */}
                                                        <select
                                                            value={pendingCollege}
                                                            onChange={(e) => setPendingCollege(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Colleges</option>
                                                            {pendingColleges.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>

                                                        {/* Course */}
                                                        <select
                                                            value={pendingCourse}
                                                            onChange={(e) => setPendingCourse(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Courses</option>
                                                            {pendingCourses.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>

                                                        {/* Branch */}
                                                        <select
                                                            value={pendingBranch}
                                                            onChange={(e) => setPendingBranch(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Branches</option>
                                                            {pendingBranches.map(b => (
                                                                <option key={b} value={b}>{b}</option>
                                                            ))}
                                                        </select>

                                                        {/* Year */}
                                                        <select
                                                            value={pendingYear}
                                                            onChange={(e) => setPendingYear(e.target.value)}
                                                            className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700"
                                                        >
                                                            <option value="">All Years</option>
                                                            {(pendingYears.length > 0 ? pendingYears : [1, 2, 3, 4]).map(y => (
                                                                <option key={y} value={y}>Year {y}</option>
                                                            ))}
                                                        </select>

                                                        {hasActivePendingFilters && (
                                                            <button
                                                                onClick={() => {
                                                                    setPendingSearch('');
                                                                    setPendingCollege('');
                                                                    setPendingCourse('');
                                                                    setPendingBranch('');
                                                                    setPendingYear('');
                                                                }}
                                                                className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1"
                                                            >
                                                                <X size={12} /> Clear
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Pending Students Table */}
                                                    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-xs">
                                                        <table className="w-full text-left text-xs">
                                                            <thead className="bg-gray-50/90 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                                                                <tr>
                                                                    <th className="p-3">Student Details</th>
                                                                    <th className="p-3">Academic Info</th>
                                                                    <th className="p-3">Club Fee Dues</th>
                                                                    <th className="p-3">Membership Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {filteredPending.map((m, idx) => {
                                                                    const feeAmount = m.due_amount !== undefined && m.due_amount !== null
                                                                        ? Number(m.due_amount)
                                                                        : (Number(selectedClub?.membership_fee) || 0);

                                                                    return (
                                                                        <tr key={m.id || m.student_id || idx} className="hover:bg-gray-50/80 transition-colors">
                                                                            {/* Student Details */}
                                                                            <td className="p-3">
                                                                                <div className="flex items-center gap-2.5">
                                                                                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-xs shrink-0">
                                                                                        {(m.student_name || m.name || 'S').charAt(0).toUpperCase()}
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="font-bold text-gray-900 leading-tight">
                                                                                            {m.student_name || m.name || 'Unknown Student'}
                                                                                        </p>
                                                                                        <p className="text-[11px] font-mono text-gray-500 mt-0.5">
                                                                                            {m.admission_number || m.student_id || '—'}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            </td>

                                                                            {/* Academic Info */}
                                                                            <td className="p-3 text-gray-700">
                                                                                {m.course || m.branch ? (
                                                                                    <div>
                                                                                        <p className="font-medium">{[m.course, m.branch].filter(Boolean).join(' • ')}</p>
                                                                                        <p className="text-[11px] text-gray-500">
                                                                                            {m.college ? `${m.college} • ` : ''}{m.current_year ? `Year ${m.current_year}` : ''} {m.current_semester ? `(Sem ${m.current_semester})` : ''}
                                                                                        </p>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="text-gray-400 italic">Not available</span>
                                                                                )}
                                                                            </td>

                                                                            {/* Club Fee Dues */}
                                                                            <td className="p-3">
                                                                                <div className="space-y-0.5">
                                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full font-bold text-[10px]">
                                                                                        <AlertCircle size={10} /> Fee Pending: ₹{feeAmount.toLocaleString('en-IN')}
                                                                                    </span>
                                                                                    {Number(m.paid_amount) > 0 && (
                                                                                        <p className="text-[10px] text-gray-500">Paid: ₹{Number(m.paid_amount).toLocaleString('en-IN')}</p>
                                                                                    )}
                                                                                </div>
                                                                            </td>

                                                                            {/* Membership Status */}
                                                                            <td className="p-3">
                                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10px]">
                                                                                    <Clock size={10} /> Activates on Payment
                                                                                </span>
                                                                                <p className="text-[10px] text-gray-400 mt-1">
                                                                                    Joined: {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'N/A'}
                                                                                </p>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}

                                                                {filteredPending.length === 0 && (
                                                                    <tr>
                                                                        <td colSpan={4} className="py-12 text-center">
                                                                            <div className="flex flex-col items-center justify-center text-gray-400 space-y-2">
                                                                                <CheckCircle size={32} className="text-emerald-500 opacity-60" />
                                                                                <p className="text-sm font-semibold text-gray-600">
                                                                                    {hasActivePendingFilters ? 'No pending students match the selected filters' : 'No students with fee pending'}
                                                                                </p>
                                                                                <p className="text-xs text-gray-400 max-w-sm">
                                                                                    {hasActivePendingFilters
                                                                                        ? 'Try clearing or changing your filters to see more results.'
                                                                                        : 'All students have paid their club membership fees and are active members!'}
                                                                                </p>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* TAB 3: ACTIVITIES */}
                                        {detailsTab === 'activities' && (
                                            <div className="space-y-4 pt-2">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="text-base font-bold text-gray-900">Club Activities ({clubActivities.length})</h3>
                                                        <p className="text-xs text-gray-500">Events, workshops and programs organized by this club.</p>
                                                    </div>
                                                    {getClubPageAccess(selectedClub?.id, 'management').write && (
                                                        <button
                                                            onClick={() => setShowActivityModal(true)}
                                                            className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5 shadow-sm transition-all"
                                                        >
                                                            <Plus size={14} /> Add Activity
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {clubActivities.map((act, i) => (
                                                        <div key={i} className="p-4 border rounded-xl bg-gray-50/50 space-y-2">
                                                            <h4 className="font-bold text-sm text-gray-900">{act.title}</h4>
                                                            <p className="text-xs text-gray-600">{act.description}</p>
                                                            <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t">
                                                                <span>ðŸ“… {act.date}</span>
                                                                {act.location && <span>ðŸ“ {act.location}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {clubActivities.length === 0 && (
                                                        <div className="col-span-full py-10 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                                                            <p className="text-sm">No activities published for this club yet.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* TAB 5: CHAT */}
                                        {detailsTab === 'chat' && (
                                            <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm mt-2">
                                                <ClubChatBox club={selectedClub} />
                                            </div>
                                        )}

                                        {/* TAB 6: SETTINGS */}
                                        {detailsTab === 'settings' && (
                                            <div className="space-y-6 pt-2">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="text-base font-bold text-gray-900">Club Configuration & Admin Roles</h3>
                                                        <p className="text-xs text-gray-500">Edit club details and assign dynamic admin leadership roles.</p>
                                                    </div>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => prepareEdit(selectedClub)}
                                                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
                                                        >
                                                            <Edit2 size={14} /> Update Settings & Assign Roles
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-3 text-xs">
                                                    <p className="text-gray-700">Membership Fee: <b>{formatMembershipFee(selectedClub?.membership_fee)}</b> ({selectedClub?.fee_type || 'Yearly'})</p>
                                                    <p className="text-gray-700">Active Status: <b>{selectedClub?.is_active ? 'Active' : 'Inactive'}</b></p>
                                                    <p className="text-gray-700">Total Officers: <b>{selectedClub?.admin_roles?.length || 0}</b></p>
                                                </div>
                                            </div>
                                        )}
                                        </div>

                                    </>
                                );
                            })()}
                        </div>
                    )}
                </>
            )}

            {/* ================= 2. SUBPAGE: STUDENTS ================= */}
            {subPage === 'students' && (
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Student Club Members</h2>
                            <p className="text-xs text-gray-500">View and manage all registered student club members across clubs.</p>
                        </div>
                        <button onClick={fetchStudents} className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>

                    {/* Filter controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search student name / admission no..."
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <select
                            value={studentClubFilter}
                            onChange={(e) => setStudentClubFilter(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Student Clubs</option>
                            {clubs.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <select
                            value={studentStatusFilter}
                            onChange={(e) => setStudentStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="approved">Approved</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>

                    {/* Students Table */}
                    <div className="overflow-x-auto border rounded-xl">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 border-b text-gray-600 uppercase font-semibold">
                                <tr>
                                    <th className="p-3">Student Name</th>
                                    <th className="p-3">Admission No</th>
                                    <th className="p-3">Club</th>
                                    <th className="p-3">Membership Status</th>
                                    <th className="p-3">Payment Status</th>
                                    <th className="p-3">Joined Date</th>
                                    <th className="p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredStudents.map((s) => (
                                    <tr key={s.membership_id} className="hover:bg-gray-50/50">
                                        <td className="p-3 font-semibold text-gray-900">{s.student_name}</td>
                                        <td className="p-3 text-gray-600">{s.admission_number}</td>
                                        <td className="p-3 font-medium text-blue-700">{s.club_name}</td>
                                        <td className="p-3">
                                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                                s.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                s.payment_status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {s.payment_status || 'free'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-gray-500">{new Date(s.joined_at).toLocaleDateString()}</td>
                                        <td className="p-3">
                                            {s.status === 'pending' && getClubPageAccess(s.club_id, 'students').write ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApprovalAction(s.club_id, s.student_id, 'approved')}
                                                        className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 font-semibold text-green-700 hover:bg-green-100"
                                                    ><Check size={12} /> Approve</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApprovalAction(s.club_id, s.student_id, 'rejected')}
                                                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
                                                    ><X size={12} /> Reject</button>
                                                </div>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-gray-400">
                                            {studentsLoading ? 'Loading members...' : 'No club students found.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ================= 3. SUBPAGE: CLUB SETTINGS & DYNAMIC ROLES ================= */}
            {subPage === 'settings' && (
                <div className="space-y-6">
                    {/* Dynamic Roles Creation & Management Card */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Dynamic Club Admin Roles</h2>
                                <p className="text-xs text-gray-500">Define dynamic leadership and coordinator roles for student clubs with full edit and delete capabilities.</p>
                            </div>
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingRole(null);
                                        setRoleForm({ role_name: '', description: '', pages: [...DEFAULT_CLUB_ADMIN_PAGES] });
                                        setShowRoleModal(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                                >
                                    <Plus size={14} /> Add Role
                                </button>
                            )}
                        </div>

                        {/* Roles Grid with Edit and Delete Buttons for ALL roles */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {dynamicRoles.map(role => (
                                <div key={role.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2 relative group hover:bg-white hover:shadow-md transition-all flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="font-bold text-sm text-gray-900">{role.role_name}</h3>
                                            <span className="text-[10px] font-extrabold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded shrink-0">
                                                Dynamic Role
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{role.description || 'No description provided.'}</p>
                                    </div>

                                    <div className="pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs">
                                        <span className="text-[10px] font-mono text-slate-400">
                                            {role.role_code}
                                        </span>
                                        {isAdmin && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleOpenEditRole(role)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit Role"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDynamicRole(role.id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Role"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Announcements & Notifications Configuration */}
                    {getClubPageAccess(null, 'settings').write && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Bell size={20} className="text-blue-600" /> Club Announcements & Push Notifications
                                </h2>
                                <p className="text-xs text-gray-500">Configure global automated notification preferences for student club events and announcements.</p>
                            </div>
                        </div>

                        <div className="space-y-4 divide-y divide-gray-100">
                            <div className="flex justify-between items-center pt-2">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Club Announcements Notifications</p>
                                    <p className="text-xs text-gray-500">Automatically notify registered members when new club announcements are posted.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newVal = !announcementNotify;
                                        setAnnouncementNotify(newVal);
                                        localStorage.setItem('club_announcement_notify', String(newVal));
                                        toast.success(`Announcement notifications ${newVal ? 'ENABLED' : 'DISABLED'}`);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        announcementNotify ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    {announcementNotify ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="flex justify-between items-center pt-4">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Fee Payment Alert Notifications</p>
                                    <p className="text-xs text-gray-500">Send push reminders to students when club membership fee payments are due.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newVal = !feeNotify;
                                        setFeeNotify(newVal);
                                        localStorage.setItem('club_fee_notify', String(newVal));
                                        toast.success(`Fee notifications ${newVal ? 'ENABLED' : 'DISABLED'}`);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        feeNotify ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    {feeNotify ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="flex justify-between items-center pt-4">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Member Activity Push Notifications</p>
                                    <p className="text-xs text-gray-500">Notify club members when new events, activities, or schedule changes are published.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newVal = !activityNotify;
                                        setActivityNotify(newVal);
                                        localStorage.setItem('club_activity_notify', String(newVal));
                                        toast.success(`Activity notifications ${newVal ? 'ENABLED' : 'DISABLED'}`);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        activityNotify ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    {activityNotify ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* User Access Management for Club Pages Only */}
                    {isAdmin && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Shield size={20} className="text-indigo-600" /> User Access Management (Club Pages Only)
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Grant or manage user access permissions and dynamic leadership roles specifically for Club Management and Club Pages.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/users')}
                                className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5 shrink-0"
                            >
                                <UserCheck size={14} /> Full User Management
                            </button>
                        </div>

                        {/* Quick Employee / User Access Search & Grant */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <UserPlus size={14} className="text-indigo-600" /> Grant Club Admin Access to Employee / User
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={hrmsSearchQuery}
                                            onChange={(e) => handleSearchHrms(e.target.value)}
                                            placeholder="Search HRMS employee by name, emp ID or email..."
                                            className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                        />
                                        {searchingHrms && (
                                            <div className="absolute right-3 top-2.5">
                                                <RefreshCw size={14} className="animate-spin text-indigo-600" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleSearchHrms(hrmsSearchQuery)}
                                    disabled={searchingHrms}
                                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Search size={14} /> Search Employee
                                </button>
                            </div>

                            {/* HRMS Search Results in Access Management */}
                            {hrmsSearchResults.length > 0 && (
                                <div className="mt-2 bg-white rounded-lg border border-slate-200 divide-y max-h-48 overflow-y-auto shadow-sm">
                                    {hrmsSearchResults.map(emp => (
                                        <div
                                            key={emp._id}
                                            onClick={() => handleSelectHrmsEmployee(emp)}
                                            className={`p-2.5 text-xs flex justify-between items-center cursor-pointer hover:bg-indigo-50/60 transition-colors ${selectedHrmsEmployee?._id === emp._id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900">{emp.name}</p>
                                                <p className="text-[10px] text-gray-500">{emp.emp_no} • {emp.email || 'No email'}</p>
                                            </div>
                                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                                                Select for Club Access
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedHrmsEmployee && (
                                <div className="mt-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                    <div className="text-xs">
                                        <p className="font-bold text-indigo-950">Selected: {selectedHrmsEmployee.name} ({selectedHrmsEmployee.emp_no})</p>
                                        <p className="text-[11px] text-indigo-700">
                                            {hrmsUserStatus?.checking ? 'Checking SDMS Account...' : hrmsUserStatus?.hasUserAccount ? '✓ Active SDMS Account Linked' : '⚠ No SDMS Account found.'}
                                        </p>
                                    </div>
                                    {!hrmsUserStatus?.checking && !hrmsUserStatus?.hasUserAccount && (
                                        <button
                                            type="button"
                                            onClick={handleOpenCreateUserModal}
                                            className="px-3 py-1.5 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                        >
                                            + Create SDMS Account (With College)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Table of Active Club Officers / Admins */}
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Users size={14} className="text-indigo-600" /> Active Club Heads & Officers ({
                                    clubs.reduce((acc, c) => acc + (c.admin_roles ? c.admin_roles.length : 0), 0)
                                })
                            </h3>

                            <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
                                        <tr>
                                            <th className="p-3">Club Name</th>
                                            <th className="p-3">Officer Name</th>
                                            <th className="p-3">Club Role</th>
                                            <th className="p-3">Emp ID / Username</th>
                                            <th className="p-3">Page Access</th>
                                            <th className="p-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {clubs.flatMap(c => (c.admin_roles || []).map((r, i) => ({ club: c, role: r, key: `${c.id}_${i}` }))).length > 0 ? (
                                            clubs.flatMap(c => (c.admin_roles || []).map((r, i) => (
                                                <tr key={`${c.id}_${i}`} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 font-bold text-gray-900">{c.name}</td>
                                                    <td className="p-3 text-gray-800 font-medium">{r.name || r.email || 'Assigned Officer'}</td>
                                                    <td className="p-3">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                                            🏆 {r.roleName || r.roleCode || 'Club Admin'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-gray-500 font-mono">{r.empNo || r.userId || '—'}</td>
                                                    <td className="p-3">
                                                        <div className="flex flex-wrap gap-1">
                                                            {CLUB_ADMIN_PAGES.flatMap(page => {
                                                                const access = getPagePermissions(r)[page.key];
                                                                if (!access.read && !access.write) return [];
                                                                return [(
                                                                    <span key={page.key} title={`${page.label}: ${access.write ? 'Read and write' : 'Read only'}`} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                                                        {page.label}: {access.write ? 'Read/Write' : 'Read'}
                                                                    </span>
                                                                )];
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openClubUserEditor(c, r, i)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                                                                title={`Edit club role for ${r.name || r.email || ''}`}
                                                            >
                                                                <Edit2 size={12} /> Edit Club Role
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )))
                                        ) : (
                                            <tr>
                                                <td colSpan="6" className="p-6 text-center text-gray-500 italic">
                                                    No club admin officers assigned yet. Edit any club to assign dynamic club roles.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {/* ================= MODAL: CREATE / EDIT CLUB WITH MULTIPLE DYNAMIC ADMIN ROLES & HRMS USER CHECK ================= */}
            <Modal
                show={showCreateModal || showEditModal}
                onClose={() => { setShowCreateModal(false); setShowEditModal(false); resetForm(); }}
                title={showEditModal ? 'Edit Student Club & Admin Roles' : 'Create New Student Club'}
            >
                <form onSubmit={showEditModal ? handleUpdateClub : handleCreateClub} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-bold text-gray-700">Club Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Robotics & Innovation Club"
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-bold text-gray-700">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe the objectives and activities of this student club..."
                                rows={3}
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700">Membership Fee (INR)</label>
                            <input
                                type="number"
                                value={formData.membership_fee}
                                onChange={(e) => setFormData({ ...formData, membership_fee: e.target.value })}
                                placeholder="0 for free club"
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700">Fee Frequency</label>
                            <select
                                value={formData.fee_type}
                                onChange={(e) => setFormData({ ...formData, fee_type: e.target.value })}
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Yearly">Yearly</option>
                                <option value="One-Time">One-Time</option>
                                <option value="Semester">Semester-wise</option>
                            </select>
                        </div>
                    </div>

                    {isAdmin && (
                    <>
                    {/* Section: Assign Multiple Dynamic Club Admin Roles */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                    <Shield size={16} className="text-blue-600" /> Multiple Club Admin Roles
                                </h3>
                                <p className="text-[11px] text-gray-500">Assign multiple officers (President, Vice Presidents, Faculty Coordinators, etc.) to this club.</p>
                            </div>
                        </div>

                        {/* Existing Assigned Multiple Roles List */}
                        {formData.admin_roles && formData.admin_roles.length > 0 ? (
                            <div className="space-y-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                <p className="text-xs font-bold text-blue-900">Currently Assigned Admin Roles ({formData.admin_roles.length}):</p>
                                {formData.admin_roles.map((item, idx) => (
                                    <div key={idx} className="bg-white p-2.5 rounded-lg border border-blue-200 text-xs shadow-2xs space-y-2">
                                        <div className="flex justify-between items-center gap-3">
                                            <div>
                                                <select
                                                    value={item.roleCode || ''}
                                                    onChange={event => handleChangeAssignedClubRole(idx, event.target.value)}
                                                    className="mb-1 max-w-full rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-800"
                                                    aria-label={`Club role for ${item.name}`}
                                                >
                                                    {!dynamicRoles.some(role => role.role_code === item.roleCode) && item.roleCode && (
                                                        <option value={item.roleCode}>{item.roleName}</option>
                                                    )}
                                                    {dynamicRoles.map(role => (
                                                        <option key={role.role_code} value={role.role_code}>{role.role_name}</option>
                                                    ))}
                                                </select>
                                                <span className="font-bold text-gray-900">{item.name}</span>
                                                <span className="text-gray-500 text-[11px] ml-2">({item.empNo || item.email})</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAdminRoleAssignment(idx)}
                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                                title="Remove this role assignment"
                                            >
                                                <X size={15} />
                                            </button>
                                        </div>
                                        <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-gray-100 pt-2">
                                            <legend className="sr-only">Read and write access for {item.name}</legend>
                                            {CLUB_ADMIN_PAGES.map(page => {
                                                const access = getPagePermissions(item)[page.key];
                                                return (
                                                    <div key={page.key} className="rounded-md border border-gray-100 px-2 py-1.5">
                                                        <p className="text-[10px] font-semibold text-gray-700">{page.label}</p>
                                                        <div className="flex gap-3 mt-1">
                                                            {['read', 'write'].map(accessType => (
                                                                <label key={accessType} className="inline-flex items-center gap-1 text-[10px] text-gray-600 capitalize">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={item.isSuperAdmin || access[accessType]}
                                                                        onChange={() => handleToggleAdminRolePage(idx, page.key, accessType)}
                                                                        disabled={item.isSuperAdmin}
                                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    {accessType}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </fieldset>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic bg-gray-50 p-2.5 rounded-lg border border-dashed">
                                No admin roles assigned to this club yet. Use the form below to search and add officers.
                            </p>
                        )}

                        {/* Add Officer Assign Form */}
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                            <p className="text-xs font-bold text-slate-800">Add New Admin Role Assignment</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700">Select Dynamic Role</label>
                                    <select
                                        value={selectedRoleCode}
                                        onChange={(e) => setSelectedRoleCode(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white"
                                    >
                                        {dynamicRoles.map(r => (
                                            <option key={r.role_code} value={r.role_code}>{r.role_name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[11px] font-bold text-slate-700">Search HRMS Employee / SDMS User</label>
                                    <input
                                        type="text"
                                        placeholder="Type name, emp_no, email..."
                                        value={hrmsSearchQuery}
                                        onChange={(e) => handleSearchHrms(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white"
                                    />
                                    {searchingHrms && <span className="text-[10px] text-gray-400">Searching employees...</span>}
                                </div>
                            </div>

                            {/* HRMS Search Results Dropdown */}
                            {hrmsSearchResults.length > 0 && (
                                <div className="max-h-40 overflow-y-auto bg-white border border-slate-300 rounded-lg divide-y shadow-lg">
                                    {hrmsSearchResults.map((emp, i) => (
                                        <div
                                            key={i}
                                            onClick={() => handleSelectHrmsEmployee(emp)}
                                            className="p-2.5 hover:bg-blue-50 cursor-pointer text-xs flex justify-between items-center"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900">{emp.name}</p>
                                                <p className="text-[10px] text-gray-500">ID: {emp.emp_no} | {emp.email}</p>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                                emp.type === 'SDMS User' || emp.hasUserAccount ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {emp.type || 'Employee'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Selected Employee Card & Account Check */}
                            {selectedHrmsEmployee && (
                                <div className="bg-white p-3 border rounded-xl space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">Selected: {selectedHrmsEmployee.name}</p>
                                            <p className="text-[11px] text-gray-500">{selectedHrmsEmployee.emp_no} | {selectedHrmsEmployee.email}</p>
                                        </div>
                                        <button type="button" onClick={() => setSelectedHrmsEmployee(null)} className="text-xs text-red-500 font-bold">Change</button>
                                    </div>

                                    {hrmsUserStatus?.checking && (
                                        <p className="text-xs text-blue-600 animate-pulse">Checking SDMS User Account...</p>
                                    )}

                                    {/* ALERT IF NO SDMS USER ACCOUNT */}
                                    {hrmsUserStatus && !hrmsUserStatus.checking && !hrmsUserStatus.hasUserAccount && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                                            <div className="flex items-start gap-2 text-amber-800 text-xs">
                                                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-bold">No SDMS User Account Found!</p>
                                                    <p className="text-[11px] text-amber-700 mt-0.5">
                                                        Employee <b>{selectedHrmsEmployee.name}</b> doesn't have a user login account in SDMS. Please create an account for this employee first, then add them to the role.
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleOpenCreateUserModal}
                                                className="w-full py-1.5 bg-amber-600 text-white font-bold text-xs rounded-md hover:bg-amber-700 flex items-center justify-center gap-1.5 shadow-xs"
                                            >
                                                <UserPlus size={14} /> Create SDMS Account for {selectedHrmsEmployee.name}
                                            </button>
                                        </div>
                                    )}

                                    {/* SUCCESS IF SDMS USER ACCOUNT EXISTS */}
                                    {hrmsUserStatus && !hrmsUserStatus.checking && hrmsUserStatus.hasUserAccount && (
                                        <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                                            <div className="flex items-center gap-1.5">
                                                <CheckCircle size={15} className="text-green-600" />
                                                <span className="font-bold">SDMS Account Active ({hrmsUserStatus.userAccount?.username || 'User'})</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddAdminRoleAssignment}
                                                className="px-3 py-1 bg-green-700 text-white rounded font-bold hover:bg-green-800 text-xs"
                                            >
                                                Add to Role
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    </>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button
                            type="button"
                            onClick={() => { setShowCreateModal(false); setShowEditModal(false); resetForm(); }}
                            className="px-4 py-2 text-xs font-bold text-gray-600 border rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
                        >
                            {showEditModal ? (isAdmin ? 'Update Club & Save Admin Roles' : 'Save Club Settings') : 'Create Club'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                show={!!pageAssignmentToEdit}
                onClose={() => setPageAssignmentToEdit(null)}
                title={`Edit Club Access for ${pageAssignmentToEdit?.assignment?.name || 'Club Admin'}`}
            >
                <div className="space-y-4">
                    <p className="text-xs text-gray-600">
                        Edit {pageAssignmentToEdit?.assignment?.name || 'this user'}'s role and page access for {pageAssignmentToEdit?.club?.name}.
                    </p>
                    <label className="block space-y-1.5">
                        <span className="text-xs font-semibold text-gray-700">Club role</span>
                        <select
                            value={clubRoleDraft.roleCode}
                            onChange={(event) => {
                                const selectedRole = dynamicRoles.find(role => role.role_code === event.target.value);
                                setClubRoleDraft({
                                    roleCode: selectedRole?.role_code || '',
                                    roleName: selectedRole?.role_name || ''
                                });
                                if (!pageAssignmentToEdit?.assignment?.isSuperAdmin && selectedRole) {
                                    setPageAccessDraft(getPagePermissions({ pages: selectedRole.pages || DEFAULT_CLUB_ADMIN_PAGES }));
                                }
                            }}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                            {!dynamicRoles.some(role => role.role_code === clubRoleDraft.roleCode) && clubRoleDraft.roleCode && (
                                <option value={clubRoleDraft.roleCode}>{clubRoleDraft.roleName}</option>
                            )}
                            {dynamicRoles.map(role => (
                                <option key={role.role_code} value={role.role_code}>{role.role_name}</option>
                            ))}
                        </select>
                    </label>
                    {pageAssignmentToEdit?.assignment?.isSuperAdmin && (
                        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            Superadmin accounts always have access to every club page.
                        </p>
                    )}
                    <div className="space-y-2">
                        {CLUB_ADMIN_PAGES.map(page => (
                            <div key={page.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                                <span className="text-sm font-medium text-gray-800">{page.label}</span>
                                <div className="flex gap-4">
                                    {['read', 'write'].map(accessType => (
                                        <label key={accessType} className="inline-flex items-center gap-1.5 text-xs text-gray-700 capitalize">
                                            <input
                                                type="checkbox"
                                                checked={pageAssignmentToEdit?.assignment?.isSuperAdmin || pageAccessDraft[page.key]?.[accessType] === true}
                                                onChange={() => setPageAccessDraft(current => {
                                                    const pagePermissions = { ...current };
                                                    const next = { ...pagePermissions[page.key], [accessType]: !pagePermissions[page.key]?.[accessType] };
                                                    if (accessType === 'write' && next.write) next.read = true;
                                                    if (accessType === 'read' && !next.read) next.write = false;
                                                    pagePermissions[page.key] = next;
                                                    return pagePermissions;
                                                })}
                                                disabled={pageAssignmentToEdit?.assignment?.isSuperAdmin}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            {accessType}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2 border-t pt-3">
                        <button
                            type="button"
                            onClick={() => setPageAssignmentToEdit(null)}
                            className="px-4 py-2 text-xs font-bold text-gray-600 border rounded-lg"
                        >Cancel</button>
                        <button
                            type="button"
                            onClick={handleSavePageAccess}
                            disabled={savingPageAccess}
                            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >{savingPageAccess ? 'Saving...' : 'Save Club Role'}</button>
                    </div>
                </div>
            </Modal>

            {/* ================= MODAL: CREATE / EDIT DYNAMIC ROLE ================= */}
            <Modal
                show={showRoleModal}
                onClose={() => { setShowRoleModal(false); setEditingRole(null); }}
                title={editingRole ? 'Edit Dynamic Club Role' : 'Add New Dynamic Club Role'}
            >
                <form onSubmit={handleSaveDynamicRole} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Role Name *</label>
                        <input
                            type="text"
                            value={roleForm.role_name}
                            onChange={(e) => setRoleForm({ ...roleForm, role_name: e.target.value })}
                            placeholder="e.g. Media Head, Event Director, Treasurer"
                            className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Description</label>
                        <textarea
                            value={roleForm.description}
                            onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                            placeholder="Role responsibilities and guidelines..."
                            rows={3}
                            className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <fieldset className="space-y-2 border-t border-gray-200 pt-4">
                        <legend className="text-xs font-bold text-gray-700">Club Page Access</legend>
                        <p className="text-[11px] text-gray-500">Users assigned this role will see the selected pages.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {CLUB_ADMIN_PAGES.map(page => (
                                <label key={page.key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={(roleForm.pages || DEFAULT_CLUB_ADMIN_PAGES).includes(page.key)}
                                        onChange={() => handleToggleRolePage(page.key)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    {page.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <div className="flex justify-end gap-2 pt-3">
                        <button type="button" onClick={() => { setShowRoleModal(false); setEditingRole(null); }} className="px-4 py-2 text-xs font-bold text-gray-600 border rounded-lg">Cancel</button>
                        <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                            {editingRole ? 'Update Role' : 'Create Role'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ================= MODAL: INLINE SDMS USER ACCOUNT CREATION FOR HRMS EMPLOYEE ================= */}
            <Modal
                show={showCreateUserModal}
                onClose={() => setShowCreateUserModal(false)}
                title={`Create SDMS Account for ${createUserForm.name}`}
                size="tall"
            >
                <form onSubmit={handleCreateSDMSUserAccount} className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                        <p className="font-bold">Linking HRMS Employee to SDMS</p>
                        <p className="text-[11px] mt-0.5">The employee's HRMS credentials (Employee ID as username) will be used automatically â€” no manual password required.</p>
                        <div className="mt-2 flex items-center gap-2 bg-white/60 p-2 rounded-lg border border-blue-100">
                            <CheckCircle size={14} className="text-green-600 shrink-0" />
                            <span className="font-semibold text-blue-900">Username: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-800">{selectedHrmsEmployee?.emp_no}</code> (from HRMS)</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label className="font-bold text-gray-700">Full Name *</label>
                            <input
                                type="text"
                                value={createUserForm.name}
                                onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg mt-1"
                                required
                            />
                        </div>
                        <div>
                            <label className="font-bold text-gray-700">Email Address *</label>
                            <input
                                type="email"
                                value={createUserForm.email}
                                onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg mt-1"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-xs lg:grid-cols-3">
                        <MultiSelectDropdown
                            label="Colleges *"
                            options={collegesList.map(college => ({
                                value: String(college.id),
                                label: `${college.name} (${college.code || college.short_name || 'COLLEGE'})`
                            }))}
                            value={createUserForm.collegeIds}
                            onChange={handleCreateUserCollegeChange}
                            placeholder="Select one or more colleges"
                        />
                        <div>
                            <label className="font-bold text-gray-700">System Role *</label>
                            <select
                                value={createUserForm.role}
                                onChange={(e) => setCreateUserForm(prev => ({
                                    ...prev,
                                    role: e.target.value,
                                    allCourses: e.target.value === 'branch_hod' ? false : prev.allCourses,
                                    allBranches: e.target.value === 'branch_hod' ? false : prev.allBranches
                                }))}
                                className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                {createUserRoleOptions.map(role => (
                                    <option key={role.value || role.role_key} value={role.value || role.role_key}>
                                        {role.label || role.role_key || role.value}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <MultiSelectDropdown
                                label={createUserForm.role === 'branch_hod' ? 'Courses *' : 'Courses'}
                                options={createUserCourses.map(course => ({
                                    value: String(course.id),
                                    label: `${course.name}${course.level ? ` (${course.level.toUpperCase()})` : ''}`
                                }))}
                                value={createUserForm.courseIds}
                                onChange={handleCreateUserCourseChange}
                                placeholder={createUserForm.collegeIds.length ? 'Select courses' : 'Select colleges first'}
                                disabled={loadingCreateUserCourses || createUserForm.collegeIds.length === 0 || createUserForm.allCourses}
                                headerAccessory={createUserForm.role !== 'branch_hod' && (
                                    <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={createUserForm.allCourses}
                                            onChange={(e) => setCreateUserForm(prev => ({
                                                ...prev,
                                                allCourses: e.target.checked,
                                                courseIds: e.target.checked ? [] : prev.courseIds,
                                                allBranches: e.target.checked,
                                                branchIds: e.target.checked ? [] : prev.branchIds
                                            }))}
                                        />
                                        All
                                    </label>
                                )}
                            />
                            {createUserForm.allCourses && <p className="mt-1 text-[10px] text-emerald-700">All courses selected</p>}
                            {loadingCreateUserCourses && <p className="mt-1 text-[10px] text-gray-500">Loading courses...</p>}
                        </div>
                    </div>

                    {(createUserForm.courseIds.length > 0 || createUserForm.role === 'branch_hod') && (
                    <div className="grid grid-cols-1 gap-3 text-xs lg:grid-cols-3">
                        {createUserForm.courseIds.length > 0 && !createUserForm.allCourses && (
                            <div>
                                <MultiSelectDropdown
                                    label={createUserForm.role === 'branch_hod' ? 'Branches *' : 'Branches'}
                                    options={createUserBranches.map(branch => ({
                                        value: String(branch.id),
                                        label: `${branch.name} (${branch.courseName || 'Course'})`
                                    }))}
                                    value={createUserForm.branchIds}
                                    onChange={branchIds => setCreateUserForm(prev => ({ ...prev, branchIds }))}
                                    placeholder="Select branches"
                                    disabled={loadingCreateUserBranches || createUserBranches.length === 0 || createUserForm.allBranches}
                                    headerAccessory={createUserForm.role !== 'branch_hod' && (
                                        <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={createUserForm.allBranches}
                                                onChange={(e) => setCreateUserForm(prev => ({
                                                    ...prev,
                                                    allBranches: e.target.checked,
                                                    branchIds: e.target.checked ? [] : prev.branchIds
                                                }))}
                                            />
                                            All
                                        </label>
                                    )}
                                />
                                {createUserForm.allBranches && createUserForm.role !== 'branch_hod' && <p className="mt-1 text-[10px] text-orange-700">All branches selected</p>}
                                {loadingCreateUserBranches && <p className="mt-1 text-[10px] text-gray-500">Loading branches...</p>}
                            </div>
                        )}
                        {createUserForm.role === 'branch_hod' && createUserForm.courseIds.length > 0 && (
                            <div className="rounded-lg border border-slate-200 p-3 lg:col-span-2">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-bold text-gray-700">Year Access *</label>
                                    <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={createUserForm.allHodYears}
                                            onChange={(e) => setCreateUserForm(prev => ({
                                                ...prev,
                                                allHodYears: e.target.checked,
                                                hodYears: e.target.checked ? [] : prev.hodYears
                                            }))}
                                        />
                                        All years
                                    </label>
                                </div>
                                {!createUserForm.allHodYears && (
                                    <div className="mt-2 flex flex-wrap gap-3">
                                        {Array.from({ length: createUserHodYearCount }, (_, index) => index + 1).map(year => (
                                            <label key={year} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={createUserForm.hodYears.includes(year)}
                                                    onChange={() => setCreateUserForm(prev => ({
                                                        ...prev,
                                                        hodYears: prev.hodYears.includes(year)
                                                            ? prev.hodYears.filter(value => value !== year)
                                                            : [...prev.hodYears, year]
                                                    }))}
                                                />
                                                Year {year}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button type="button" onClick={() => setShowCreateUserModal(false)} className="px-4 py-2 text-xs font-bold text-gray-600 border rounded-lg">Cancel</button>
                        <button type="submit" disabled={creatingUser} className="px-5 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1.5">
                            {creatingUser ? 'Creating Account...' : 'Create Account & Continue'}
                        </button>
                    </div>
                </form>
            </Modal>
            {/* ================= MODAL: ADD ACTIVITY ================= */}
            <Modal
                show={showActivityModal}
                onClose={() => { setShowActivityModal(false); setActivityForm({ title: '', description: '', date: '', location: '' }); }}
                title="Add Club Activity"
            >
                <form onSubmit={handleAddActivity} className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
                        <p className="font-bold">Adding activity to: <span className="text-blue-600">{selectedClub?.name}</span></p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Activity Title *</label>
                        <input
                            type="text"
                            value={activityForm.title}
                            onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                            placeholder="e.g. Annual Tech Fest, Workshop on Robotics..."
                            className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Description</label>
                        <textarea
                            value={activityForm.description}
                            onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                            placeholder="Brief overview of the activity, objectives, and details..."
                            rows={3}
                            className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700">Date *</label>
                            <input
                                type="date"
                                value={activityForm.date}
                                onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })}
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700">Location / Venue</label>
                            <input
                                type="text"
                                value={activityForm.location}
                                onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })}
                                placeholder="e.g. Seminar Hall A"
                                className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t">
                        <button
                            type="button"
                            onClick={() => { setShowActivityModal(false); setActivityForm({ title: '', description: '', date: '', location: '' }); }}
                            className="px-4 py-2 text-xs font-bold text-gray-600 border rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={savingActivity}
                            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
                        >
                            <Plus size={14} /> {savingActivity ? 'Saving...' : 'Add Activity'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Clubs;

import React, { useState, useEffect, useRef } from 'react';
import {
    Plus, Users, Calendar, X, Trash2, Check, XCircle,
    Edit2, Layout, UserPlus, FileText, ArrowRight,
    TrendingUp, Award, Zap, Heart, Camera, Search, Filter,
    MoreHorizontal, Shield, Wallet, Send, Image, MessageSquare,
    Clock, BarChart2, Settings
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import clubService from '../services/clubService';
import chatService from '../services/chatService';
import toast from 'react-hot-toast';

const formatChatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatMessageTime = (dateStr) => new Date(dateStr).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

const ClubCard = ({ club, onSelect, isAdmin, onToggleStatus }) => (
    <div
        onClick={() => onSelect(club)}
        className={`group bg-white rounded-xl border ${club.is_active ? 'border-gray-200 hover:border-blue-400' : 'border-red-200 hover:border-red-300 opacity-75 hover:opacity-100'} p-5 transition-all cursor-pointer hover:shadow-lg relative overflow-hidden`}
    >
        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
            {isAdmin && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleStatus(club.id, club.is_active); }}
                    className={`p-1.5 rounded-md ${club.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                    title={club.is_active ? "Deactivate Club" : "Activate Club"}
                >
                    <Zap size={16} className={club.is_active ? "fill-red-600" : "fill-green-600"} />
                </button>
            )}
            <div className="bg-blue-50 text-blue-600 p-1.5 rounded-md">
                <ArrowRight size={16} />
            </div>
        </div>

        {!club.is_active && (
            <div className="absolute top-0 left-0 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-br-lg z-10 uppercase tracking-wide">
                Inactive
            </div>
        )}

        <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-xl ${club.is_active ? 'bg-gray-100' : 'bg-gray-50 grayscale'} flex items-center justify-center shrink-0 border border-gray-100 overflow-hidden text-gray-400`}>
                {club.image_url ? (
                    <img src={club.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <Users size={28} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-lg leading-tight group-hover:text-blue-600 transition-colors truncate ${!club.is_active && 'text-gray-500'}`}>{club.name}</h3>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Users size={14} /> {(club.members || []).length} Members</span>
                    {club.membership_fee > 0 && (
                        <span className="flex items-center gap-1 text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-md">
                            <Wallet size={12} /> ₹{club.membership_fee}
                        </span>
                    )}
                </div>
            </div>
        </div>
        <p className="mt-4 text-gray-600 text-sm line-clamp-2">{club.description}</p>
    </div>
);

const Modal = ({ show, onClose, title, children }) => (
    <AnimatePresence>
        {show && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8"
                >
                    <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 max-h-[80vh] overflow-y-auto">
                        {children}
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
);

const Clubs = () => {
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userType, setUserType] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'details'
    const [selectedClub, setSelectedClub] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'members' | 'activities' | 'communication' | 'settings'

    // Modal States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        image: null,
        membership_fee: '',
        fee_type: 'Yearly',
    });

    // Activity State
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);
    const [activityForm, setActivityForm] = useState({
        title: '',
        description: '',
        image: null
    });

    // Filtering State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCourse, setFilterCourse] = useState('');
    const [filterBranch, setFilterBranch] = useState('');
    const [filterYear, setFilterYear] = useState('');

    // Communication (Club Chat) State
    const [clubChannel, setClubChannel] = useState(null);
    const [clubMessages, setClubMessages] = useState([]);
    const [channelLoading, setChannelLoading] = useState(false);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [creatingChannel, setCreatingChannel] = useState(false);
    const [editingMsgId, setEditingMsgId] = useState(null);
    const [editDraft, setEditDraft] = useState('');
    const [postMode, setPostMode] = useState('message'); // 'message' | 'poll' | 'schedule'
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['Yes', 'No']);
    const [scheduledAt, setScheduledAt] = useState('');
    const [scheduledMessages, setScheduledMessages] = useState([]);
    const [scheduledLoading, setScheduledLoading] = useState(false);
    const [channelSettings, setChannelSettings] = useState(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [autoDeletePreset, setAutoDeletePreset] = useState('30'); // '7' | '10' | '30' | 'custom'
    const [autoDeleteCustomDays, setAutoDeleteCustomDays] = useState(15); // 1-30 when preset is custom
    const [attachmentFile, setAttachmentFile] = useState(null);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [editingPollId, setEditingPollId] = useState(null);
    const [editPollQuestion, setEditPollQuestion] = useState('');
    const [editPollOptions, setEditPollOptions] = useState([]);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const type = localStorage.getItem('userType');
        setUserType(type || '');
        fetchClubs();
    }, []);

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

    const isAdmin = ['admin', 'super_admin'].includes(userType);

    // --- Actions ---
    const handleCreateClub = async (e) => {
        e.preventDefault();
        try {
            if (!formData.name) return toast.error('Club name is required');
            const data = new FormData();
            data.append('name', formData.name);
            data.append('description', formData.description);
            data.append('membership_fee', formData.membership_fee);
            data.append('fee_type', formData.fee_type);

            const target_audience = {
                colleges: formData.target_college,
                batches: formData.target_batch,
                courses: formData.target_course,
                branches: formData.target_branch,
                years: formData.target_year,
                semesters: formData.target_semester
            };
            data.append('target_audience', JSON.stringify(target_audience));

            if (formData.image) data.append('image', formData.image);

            await clubService.createClub(data);
            toast.success('Club created successfully');
            setShowCreateModal(false);
            resetForm();
            fetchClubs();
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

            const target_audience = {
                colleges: formData.target_college,
                batches: formData.target_batch,
                courses: formData.target_course,
                branches: formData.target_branch,
                years: formData.target_year,
                semesters: formData.target_semester
            };
            data.append('target_audience', JSON.stringify(target_audience));

            if (formData.image) data.append('image', formData.image);

            await clubService.updateClub(selectedClub.id, data);
            toast.success('Club updated');
            setShowEditModal(false);
            fetchClubs();
            // Update selected club locally
            setSelectedClub(prev => ({ ...prev, ...formData, target_audience }));
        } catch (error) {
            toast.error('Failed to update club');
        }
    };

    const handleDeleteClub = async (id) => {
        if (!window.confirm('Delete this club completely? This cannot be undone.')) return;
        try {
            await clubService.deleteClub(id);
            toast.success('Club deleted');
            if (selectedClub?.id === id) {
                setSelectedClub(null);
                setViewMode('list');
            }
            fetchClubs();
        } catch (error) {
            toast.error('Delete failed');
        }
    };

    const handleToggleStatus = async (clubId, currentStatus) => {
        try {
            const newStatus = !currentStatus;
            await clubService.toggleClubStatus(clubId, newStatus);
            toast.success(`Club ${newStatus ? 'activated' : 'deactivated'}`);

            if (selectedClub && selectedClub.id === clubId) {
                setSelectedClub(prev => ({ ...prev, is_active: newStatus }));
            }

            setClubs(prev => prev.map(c => c.id === clubId ? { ...c, is_active: newStatus } : c));
        } catch (error) {
            toast.error('Failed to change status');
        }
    };

    const handleActivitySubmit = async (e) => {
        e.preventDefault();
        try {
            const data = new FormData();
            data.append('title', activityForm.title);
            data.append('description', activityForm.description);
            if (activityForm.image) {
                data.append('image', activityForm.image);
            }

            if (editingActivity) {
                await clubService.updateActivity(selectedClub.id, editingActivity.id, data);
                toast.success('Activity updated');
            } else {
                await clubService.createActivity(selectedClub.id, data);
                toast.success('Activity posted');
            }

            // Refresh details
            const response = await clubService.getClubDetails(selectedClub.id);
            if (response.success) setSelectedClub(response.data);

            setShowActivityModal(false);
            resetActivityForm();
        } catch (error) {
            console.error(error);
            toast.error('Failed to save activity');
        }
    };

    const handleDeleteActivity = async (activityId) => {
        if (!window.confirm('Delete this activity?')) return;
        try {
            await clubService.deleteActivity(selectedClub.id, activityId);
            toast.success('Activity deleted');
            const response = await clubService.getClubDetails(selectedClub.id);
            if (response.success) setSelectedClub(response.data);
        } catch (error) {
            toast.error('Failed to delete activity');
        }
    };

    const prepareActivityEdit = (activity) => {
        setEditingActivity(activity);
        setActivityForm({
            title: activity.title,
            description: activity.description,
            image: null // New image logic handled separately or UI indicator needed if keeping old
        });
        setShowActivityModal(true);
    };

    const resetActivityForm = () => {
        setEditingActivity(null);
        setActivityForm({ title: '', description: '', image: null });
    };

    const handleMemberAction = async (studentId, action) => {
        try {
            await clubService.updateMembershipStatus(selectedClub.id, studentId, action);
            toast.success(`Member ${action === 'approved' ? 'approved' : 'rejected'} successfully`);
            // Refresh club details to show updated status
            const response = await clubService.getClubDetails(selectedClub.id);
            if (response.success) {
                setSelectedClub(response.data);
            }
        } catch (error) {
            toast.error(`Failed to ${action} member`);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            image: null,
            membership_fee: '',
            fee_type: 'Yearly',

        });
    };

    const prepareEdit = (club) => {
        setFormData({
            name: club.name,
            description: club.description,
            image: null,
            membership_fee: club.membership_fee || '',
            fee_type: club.fee_type || 'Yearly'
        });
        setSelectedClub(club);
        setShowEditModal(true);
    };


    const handleViewDetails = async (club) => {
        // Set basic info immediately
        setSelectedClub(club);
        setViewMode('details');
        setActiveTab('members');

        // Fetch full details
        try {
            const response = await clubService.getClubDetails(club.id);
            if (response.success) {
                setSelectedClub(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch club details", error);
            toast.error("Failed to load full club details");
        }
    };

    // Fetch club channel when Communication or Settings tab is active
    useEffect(() => {
        if ((activeTab !== 'communication' && activeTab !== 'settings') || !selectedClub?.id) return;
        const load = async () => {
            setChannelLoading(true);
            setClubChannel(null);
            try {
                const res = await chatService.getChannelByClub(selectedClub.id);
                if (res.success && res.data) {
                    setClubChannel(res.data);
                    if (activeTab === 'communication') fetchClubMessages(res.data.id);
                }
            } catch (e) {
                if (activeTab === 'communication') toast.error('Failed to load club communication');
            } finally {
                setChannelLoading(false);
            }
        };
        load();
    }, [activeTab, selectedClub?.id]);

    useEffect(() => {
        if ((activeTab === 'communication' || activeTab === 'settings') && clubChannel?.id) {
            if (activeTab === 'communication') fetchScheduledMessages();
            chatService.getChannelSettings(clubChannel.id).then((r) => {
                if (r.success && r.data) {
                    setChannelSettings(r.data);
                    const days = r.data.auto_delete_after_days ?? 30;
                    if (days === 7 || days === 10 || days === 30) setAutoDeletePreset(String(days));
                    else { setAutoDeletePreset('custom'); setAutoDeleteCustomDays(Math.min(30, Math.max(1, Number(days) || 15))); }
                }
            });
        }
    }, [activeTab, clubChannel?.id]);

    const fetchClubMessages = async (channelId) => {
        if (!channelId) return;
        setMessagesLoading(true);
        try {
            const res = await chatService.getMessages(channelId);
            if (res.success && res.data) setClubMessages(res.data);
        } catch (e) {
            toast.error('Failed to load messages');
        } finally {
            setMessagesLoading(false);
        }
    };
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => {
        if (clubMessages.length && activeTab === 'communication') scrollToBottom();
    }, [clubMessages.length, activeTab]);

    const handleCreateClubChannel = async () => {
        if (!selectedClub?.id) return;
        setCreatingChannel(true);
        try {
            const res = await chatService.createChannel({
                channel_type: 'club',
                name: `${selectedClub.name} – Chat`,
                club_id: selectedClub.id,
            });
            if (res.success && res.data) {
                setClubChannel({ id: res.data.id, channel_type: 'club', name: `${selectedClub.name} – Chat`, club_id: selectedClub.id });
                toast.success('Communication channel created');
                fetchClubMessages(res.data.id);
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to create channel');
        } finally {
            setCreatingChannel(false);
        }
    };

    const MAX_ATTACHMENT_BYTES = 20 * 1024; // 20 KB
    const handlePostClubMessage = async (e) => {
        e.preventDefault();
        if (!clubChannel?.id) return;
        const text = newMessage?.trim() || '';
        if (!text && !attachmentFile) return;
        setUploadingAttachment(!!attachmentFile);
        try {
            let attachmentUrl = null;
            let attachmentType = null;
            if (attachmentFile) {
                if (attachmentFile.size > MAX_ATTACHMENT_BYTES) {
                    toast.error('File must be 20 KB or less');
                    return;
                }
                const up = await chatService.uploadAttachment(clubChannel.id, attachmentFile);
                if (up.success && up.data) {
                    attachmentUrl = up.data.url;
                    attachmentType = up.data.attachment_type;
                } else {
                    toast.error('Upload failed');
                    return;
                }
            }
            await chatService.postMessage(clubChannel.id, text || ' ', 'text', attachmentUrl, attachmentType);
            setNewMessage('');
            setAttachmentFile(null);
            fetchClubMessages(clubChannel.id);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to send message');
        } finally {
            setUploadingAttachment(false);
        }
    };

    const handleDeleteMessage = async (msgId) => {
        try {
            await chatService.deleteMessage(msgId);
            toast.success('Message deleted');
            fetchClubMessages(clubChannel.id);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to delete message');
        }
    };

    const handleEditMessage = async (e) => {
        e.preventDefault();
        if (!editingMsgId || !editDraft?.trim()) return;
        try {
            await chatService.editMessage(editingMsgId, editDraft.trim());
            toast.success('Message updated');
            setEditingMsgId(null);
            setEditDraft('');
            fetchClubMessages(clubChannel.id);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Cannot edit (only within 5 min)');
        }
    };

    const handleVotePoll = async (msgId, optionIndex) => {
        try {
            await chatService.votePoll(msgId, optionIndex);
            fetchClubMessages(clubChannel.id);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to vote');
        }
    };

    const fetchScheduledMessages = async () => {
        if (!clubChannel?.id) return;
        setScheduledLoading(true);
        try {
            const res = await chatService.listScheduledMessages(clubChannel.id);
            if (res.success && res.data) setScheduledMessages(res.data);
        } catch (e) {
            setScheduledMessages([]);
        } finally {
            setScheduledLoading(false);
        }
    };

    const handleScheduleMessage = async (e) => {
        e.preventDefault();
        if (!clubChannel?.id || !newMessage?.trim() || !scheduledAt) {
            toast.error('Enter message and schedule date/time');
            return;
        }
        const at = new Date(scheduledAt);
        if (isNaN(at.getTime()) || at.getTime() <= Date.now()) {
            toast.error('Schedule time must be in the future');
            return;
        }
        try {
            await chatService.createScheduledMessage(clubChannel.id, newMessage.trim(), at.toISOString());
            toast.success('Message scheduled');
            setNewMessage('');
            setScheduledAt('');
            setPostMode('message');
            fetchScheduledMessages();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to schedule');
        }
    };

    const handlePostPoll = async (e) => {
        e.preventDefault();
        const question = (postMode === 'poll' ? pollQuestion : newMessage)?.trim();
        const opts = postMode === 'poll' ? pollOptions.filter(Boolean) : [];
        if (!clubChannel?.id || !question) return;
        if (opts.length < 2) {
            toast.error('Add at least 2 options');
            return;
        }
        try {
            await chatService.postPoll(clubChannel.id, question, opts);
            setPollQuestion('');
            setPollOptions(['Yes', 'No']);
            setNewMessage('');
            setPostMode('message');
            fetchClubMessages(clubChannel.id);
            toast.success('Poll created');
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to create poll');
        }
    };

    const addPollOption = () => {
        if (pollOptions.length >= 20) return;
        setPollOptions([...pollOptions, '']);
    };
    const removePollOption = (idx) => {
        if (pollOptions.length <= 2) return;
        setPollOptions(pollOptions.filter((_, i) => i !== idx));
    };
    const setPollOptionAt = (idx, value) => {
        setPollOptions(pollOptions.map((o, i) => (i === idx ? value : o)));
    };

    const handleEditPollSubmit = async (e, msgId) => {
        e.preventDefault();
        try {
            await chatService.editPoll(msgId, { message: editPollQuestion, options: editPollOptions.filter(Boolean) });
            toast.success('Poll updated');
            setEditingPollId(null);
            fetchClubMessages(clubChannel.id);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed');
        }
    };

    const handleUpdateChannelSettings = async (patch) => {
        if (!clubChannel?.id) return;
        setSavingSettings(true);
        try {
            const res = await chatService.updateChannelSettings(clubChannel.id, { ...channelSettings, ...patch });
            if (res.success && res.data) setChannelSettings((s) => ({ ...s, ...res.data }));
            toast.success('Settings saved');
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    // --- Render Components ---



    const tabList = [
        { id: 'overview', label: 'Overview', icon: Layout },
        { id: 'members', label: 'Members', icon: Users },
        { id: 'requests', label: 'Requests', icon: UserPlus },
        { id: 'activities', label: 'Activities', icon: Calendar },
        { id: 'communication', label: 'Chat', icon: MessageSquare },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className={`p-4 sm:p-6 w-full max-w-[100vw] mx-auto overflow-x-hidden ${viewMode === 'list' ? 'space-y-4 sm:space-y-6' : 'flex flex-col min-h-0 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]'}`}>
            {/* Header - mobile friendly */}
            {viewMode === 'list' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Clubs & Communities</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Manage organizations, memberships, and activities.</p>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowCreateModal(true); }}
                        className="w-full sm:w-auto px-4 py-3 sm:px-5 sm:py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                        <Plus size={18} strokeWidth={2.5} /> Create New Club
                    </button>
                </div>
            )}

            {viewMode === 'list' ? (
                <div className="space-y-4 sm:space-y-6 min-h-0">
                    {/* Stats Row - single column on mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Clubs</p>
                                <h3 className="text-2xl font-bold text-gray-900">{clubs.length}</h3>
                            </div>
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                <Shield size={20} />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Members</p>
                                <h3 className="text-2xl font-bold text-gray-900">
                                    {clubs.reduce((acc, c) => acc + (c.members?.length || 0), 0)}
                                </h3>
                            </div>
                            <div className="w-10 h-10 bg-green-50 text-green-600 rounded-lg flex items-center justify-center">
                                <Users size={20} />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Monthly Active</p>
                                <h3 className="text-2xl font-bold text-gray-900">
                                    {clubs.reduce((acc, c) => acc + (c.activities?.length || 0), 0)}
                                </h3>
                            </div>
                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                                <Zap size={20} />
                            </div>
                        </div>
                    </div>

                    {/* Clubs Grid - 1 col mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        {clubs.map(club => (
                            <ClubCard
                                key={club.id}
                                club={club}
                                onSelect={handleViewDetails}
                                isAdmin={isAdmin}
                                onToggleStatus={handleToggleStatus}
                            />
                        ))}
                        {clubs.length === 0 && !loading && (
                            <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                                <Shield size={48} className="mx-auto mb-4 opacity-20" />
                                <p className="text-lg font-medium text-gray-500">No clubs found</p>
                                <p className="text-sm">Create a new club to get started</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Club Detail View - fills root; root is height-constrained so only chat messages scroll */
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-0">
                    {/* Detail Header - single row on desktop, description wraps; actions aligned with title */}
                    <div className="border-b border-gray-100 p-4 sm:p-6 bg-gray-50/30">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                            <button onClick={() => setViewMode('list')} className="shrink-0 self-start sm:self-center p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900 transition-colors touch-manipulation" aria-label="Back to list">
                                <ArrowRight className="rotate-180" size={20} />
                            </button>
                            <div className="flex gap-3 min-w-0 flex-1 sm:min-w-0">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                                    {selectedClub.image_url ? (
                                        <img src={selectedClub.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Users className="text-gray-300" size={28} />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{selectedClub.name}</h1>
                                    <p className="text-gray-500 text-xs sm:text-sm mt-0.5 line-clamp-2 sm:line-clamp-2 break-words">{selectedClub.description}</p>
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 gap-2 flex-wrap sm:flex-nowrap">
                                {isAdmin && (
                                    <button onClick={() => handleToggleStatus(selectedClub.id, selectedClub.is_active)} className={`px-3 py-2 border rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors touch-manipulation whitespace-nowrap ${selectedClub.is_active ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'}`}>
                                        <Zap size={14} className={selectedClub.is_active ? "fill-red-600" : "fill-green-600"} /> {selectedClub.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                )}
                                <button onClick={() => prepareEdit(selectedClub)} className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-xs sm:text-sm font-bold flex items-center gap-1.5 touch-manipulation whitespace-nowrap">
                                    <Edit2 size={14} /> Edit
                                </button>
                                <button onClick={() => handleDeleteClub(selectedClub.id)} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 touch-manipulation whitespace-nowrap">
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs - horizontal scroll on mobile */}
                    <div className="border-b border-gray-100 bg-white sticky top-0 z-10 overflow-x-auto scrollbar-hide">
                        <div className="flex gap-0 min-w-max sm:min-w-0 sm:flex-wrap px-2 sm:px-6">
                            {tabList.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`shrink-0 py-3 px-3 sm:py-4 sm:px-2 sm:mr-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 touch-manipulation ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Icon size={16} className="shrink-0" />
                                    <span>{label}</span>
                                    {id === 'requests' && selectedClub?.members?.filter(m => m.status === 'pending').length > 0 && (
                                        <span className="ml-0.5 px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">
                                            {selectedClub.members.filter(m => m.status === 'pending').length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={`p-4 sm:p-6 flex-1 bg-gray-50/30 min-h-0 flex flex-col ${activeTab === 'communication' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                        {activeTab === 'overview' && (
                            <div className="max-w-7xl space-y-6 animate-in fade-in duration-300">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left Column: Fees & Stats */}
                                    <div className="lg:col-span-1 space-y-6">
                                        {/* Membership & Fees Card */}
                                        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Membership & Fees</h3>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                    <span className="text-gray-600">Fee Amount</span>
                                                    <span className="font-bold text-gray-900">
                                                        {selectedClub.membership_fee > 0 ? `₹${selectedClub.membership_fee}` : 'Free'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                    <span className="text-gray-600">Frequency</span>
                                                    <span className="font-medium text-gray-900">{selectedClub.fee_type || 'N/A'}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2">
                                                    <span className="text-gray-600">Total Revenue (Est.)</span>
                                                    <span className="font-bold text-green-600">
                                                        ₹{(selectedClub.membership_fee || 0) * (selectedClub.members?.length || 0)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Club Statistics Card */}
                                        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Club Statistics</h3>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                    <span className="text-gray-600">Total Members</span>
                                                    <span className="font-bold text-gray-900">{selectedClub.members?.length || 0}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                    <span className="text-gray-600">Total Activities</span>
                                                    <span className="font-medium text-gray-900">{selectedClub.activities?.length || 0}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2">
                                                    <span className="text-gray-600">Status</span>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedClub.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {selectedClub.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Description + Club Image */}
                                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Description</h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                                            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedClub.description}</p>
                                            <div className="w-full min-h-[200px] rounded-xl overflow-hidden border border-gray-100 bg-gray-50 shadow-sm">
                                                {selectedClub.image_url ? (
                                                    <img
                                                        src={selectedClub.image_url}
                                                        alt={selectedClub.name}
                                                        className="w-full h-full min-h-[200px] object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full min-h-[200px] flex items-center justify-center text-gray-300">
                                                        <Users size={48} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'members' && (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                {/* Search & Filter Bar */}
                                <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Search by name or admission no..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <select
                                        value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[150px]"
                                    >
                                        <option value="">All Programs</option>
                                        {[...new Set(selectedClub.members?.map(m => m.course).filter(Boolean))].map((c) => <option key={c} value={c.id || c}>{c.name || c}</option>)}
                                    </select>
                                    <select
                                        value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[150px]"
                                    >
                                        <option value="">All Branches</option>
                                        {[...new Set(selectedClub.members?.map(m => m.branch).filter(Boolean))].map((b) => <option key={b} value={b.id || b}>{b.name || b}</option>)}
                                    </select>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {!selectedClub.members || selectedClub.members.length === 0 ? (
                                        <div className="p-12 text-center text-gray-400">No members yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                                                    <tr>
                                                        <th className="px-6 py-4">Student Details</th>
                                                        <th className="px-6 py-4">Academic Info</th>
                                                        <th className="px-6 py-4">Status</th>
                                                        <th className="px-6 py-4">Payment</th>
                                                        <th className="px-6 py-4">Joined Date</th>
                                                        <th className="px-6 py-4">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {selectedClub.members
                                                        .filter(m => m.status && m.status !== 'pending')
                                                        .filter(member => {
                                                            const matchesSearch = (member.student_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                                                                (member.admission_number?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                                                            const matchesCourse = !filterCourse || member.course === filterCourse;
                                                            const matchesBranch = !filterBranch || member.branch === filterBranch;
                                                            return matchesSearch && matchesCourse && matchesBranch;
                                                        })
                                                        .map((member, idx) => (
                                                            <tr key={idx} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                                                                            {member.student_photo ? <img src={member.student_photo} className="w-full h-full object-cover" alt="" /> : <Users size={18} className="m-auto mt-2.5 text-gray-400" />}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-gray-900">{member.student_name}</div>
                                                                            <div className="text-xs text-gray-500">{member.admission_number}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="text-sm text-gray-900 font-medium">{member.course} - {member.branch}</div>
                                                                    <div className="text-xs text-gray-500">{member.college}</div>
                                                                    <div className="text-xs text-gray-500">Year: {member.current_year} | Sem: {member.current_semester}</div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${member.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                        }`}>
                                                                        {(member.status || 'N/A').toUpperCase()}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`text-sm font-medium ${member.payment_status === 'paid' ? 'text-green-600' :
                                                                        member.payment_status === 'payment_due' ? 'text-orange-600' : 'text-gray-600'
                                                                        }`}>
                                                                        {member.payment_status === 'payment_due' ? 'Payment Due' :
                                                                            member.payment_status === 'paid' ? 'Paid' : 'N/A'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                                    {new Date(member.joined_at).toLocaleDateString()}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    {member.status === 'approved' && (
                                                                        <button
                                                                            onClick={() => handleMemberAction(member.student_id, 'rejected')}
                                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                            title="Remove Member"
                                                                        >
                                                                            <XCircle size={18} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'requests' && (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                {/* Search & Filter Bar */}
                                <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Search by name or admission no..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <select
                                        value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[150px]"
                                    >
                                        <option value="">All Programs</option>
                                        {[...new Set(selectedClub.members?.map(m => m.course).filter(Boolean))].map((c) => <option key={c} value={c.id || c}>{c.name || c}</option>)}
                                    </select>
                                    <select
                                        value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[150px]"
                                    >
                                        <option value="">All Branches</option>
                                        {[...new Set(selectedClub.members?.map(m => m.branch).filter(Boolean))].map((b) => <option key={b} value={b.id || b}>{b.name || b}</option>)}
                                    </select>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {(() => {
                                        const pendingMembers = selectedClub.members
                                            ?.filter(m => m.status === 'pending')
                                            .filter(member => {
                                                const matchesSearch = (member.student_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                                                    (member.admission_number?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                                                const matchesCourse = !filterCourse || member.course === filterCourse;
                                                const matchesBranch = !filterBranch || member.branch === filterBranch;
                                                return matchesSearch && matchesCourse && matchesBranch;
                                            }) || [];

                                        if (pendingMembers.length === 0) {
                                            return <div className="p-12 text-center text-gray-400">No pending requests found.</div>;
                                        }
                                        return (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                                                        <tr>
                                                            <th className="px-6 py-4">Student Details</th>
                                                            <th className="px-6 py-4">Academic Info</th>
                                                            <th className="px-6 py-4">Status</th>
                                                            <th className="px-6 py-4">Requested Date</th>
                                                            <th className="px-6 py-4">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {pendingMembers.map((member, idx) => (
                                                            <tr key={idx} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                                                                            {member.student_photo ? <img src={member.student_photo} className="w-full h-full object-cover" alt="" /> : <Users size={18} className="m-auto mt-2.5 text-gray-400" />}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-gray-900">{member.student_name}</div>
                                                                            <div className="text-xs text-gray-500">{member.admission_number}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="text-sm text-gray-900 font-medium">{member.course} - {member.branch}</div>
                                                                    <div className="text-xs text-gray-500">{member.college}</div>
                                                                    <div className="text-xs text-gray-500">Year: {member.current_year} | Sem: {member.current_semester}</div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                                                                        PENDING
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                                    {new Date(member.joined_at).toLocaleDateString()}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleMemberAction(member.student_id, 'approved')}
                                                                            className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-bold flex items-center gap-1"
                                                                        >
                                                                            <Check size={14} /> Approve
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleMemberAction(member.student_id, 'rejected')}
                                                                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-xs font-bold flex items-center gap-1"
                                                                        >
                                                                            <XCircle size={14} /> Reject
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {activeTab === 'activities' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                {isAdmin && (
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => { resetActivityForm(); setShowActivityModal(true); }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-sm"
                                        >
                                            <Plus size={16} /> Add Activity
                                        </button>
                                    </div>
                                )}

                                {(!selectedClub.activities || selectedClub.activities.length === 0) ? (
                                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Calendar className="text-gray-400" size={32} />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No activities yet</h3>
                                        <p className="text-gray-500 max-w-sm mx-auto mt-1">
                                            {isAdmin ? 'Get started by posting an update or event for this club.' : 'This club hasn\'t posted any activities yet.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {selectedClub.activities.map((activity) => (
                                            <div key={activity.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                {activity.image_url && (
                                                    <div className="h-48 overflow-hidden bg-gray-100">
                                                        <img src={activity.image_url} alt={activity.title} className="w-full h-full object-cover" />
                                                    </div>
                                                )}
                                                <div className="p-5">
                                                    <div className="flex justify-between items-start gap-4 mb-2">
                                                        <div>
                                                            <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">
                                                                {new Date(activity.posted_at).toLocaleDateString()}
                                                            </div>
                                                            <h3 className="font-bold text-gray-900 text-lg leading-tight">{activity.title}</h3>
                                                        </div>
                                                        {isAdmin && (
                                                            <div className="flex bg-gray-50 rounded-lg border border-gray-100 p-1 shrink-0">
                                                                <button
                                                                    onClick={() => prepareActivityEdit(activity)}
                                                                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded-md transition-all"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteActivity(activity.id)}
                                                                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-white rounded-md transition-all"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-600 text-sm line-clamp-3">{activity.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'communication' && (
                            <div className={`animate-in fade-in duration-300 ${clubChannel ? 'flex flex-col flex-1 min-h-0' : 'space-y-6'}`}>
                                {channelLoading ? (
                                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                                        Loading communication...
                                    </div>
                                ) : !clubChannel ? (
                                    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                                        <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">No Communication Channel Yet</h3>
                                        <p className="text-gray-500 max-w-md mx-auto mb-6">
                                            Create a chat channel for club members to communicate.
                                        </p>
                                        {isAdmin && (
                                            <button
                                                onClick={handleCreateClubChannel}
                                                disabled={creatingChannel}
                                                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                                            >
                                                <MessageSquare size={18} />
                                                {creatingChannel ? 'Creating...' : 'Create Communication Channel'}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                        {/* WhatsApp-style header */}
                                        <div className="py-3 px-4 bg-[#075e54] text-white flex items-center gap-2 shrink-0">
                                            <MessageSquare size={22} className="text-white/90 shrink-0" />
                                            <span className="font-semibold truncate">{clubChannel.name || 'Club Chat'}</span>
                                        </div>
                                        {/* Messages area - fills remaining height, scrolls on mobile */}
                                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 bg-[#efeae2] flex flex-col gap-1">
                                            {messagesLoading ? (
                                                <div className="text-center text-gray-500 py-8">Loading messages...</div>
                                            ) : clubMessages.length === 0 ? (
                                                <div className="text-center text-gray-500 py-12">No messages yet. Start the conversation!</div>
                                            ) : (
                                                (() => {
                                                    const items = [];
                                                    let lastDate = null;
                                                    clubMessages.forEach((msg) => {
                                                        const d = formatChatTime(msg.created_at);
                                                        if (d !== lastDate) { items.push({ type: 'date', key: `d-${msg.id}`, label: d }); lastDate = d; }
                                                        items.push({ type: 'msg', key: msg.id, msg });
                                                    });
                                                    return items.map((item) => {
                                                        if (item.type === 'date') return <div key={item.key} className="flex justify-center my-2"><span className="text-xs text-gray-600 bg-white/80 px-3 py-1 rounded-full shadow-sm">{item.label}</span></div>;
                                                        const msg = item.msg;
                                                        const isOwn = msg.is_own;
                                                        return (
                                                            <div key={item.key} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} w-full min-w-0`}>
                                                                <div className={`group relative max-w-[85%] min-w-0 ${isOwn ? 'order-2' : 'order-1'}`}>
                                                                    <div className={`rounded-2xl px-3 py-2 shadow-md break-words overflow-hidden ${msg.is_deleted ? 'bg-gray-200' : isOwn ? 'bg-[#dcf8c6] rounded-br-md' : 'bg-white rounded-bl-md'}`}>
                                                                        {!isOwn && <p className="text-xs font-semibold text-[#075e54] mb-0.5">{msg.sender_name || 'Unknown'}</p>}
                                                                        {msg.is_deleted ? (
                                                                            <p className="text-sm text-gray-600 italic">This message was deleted{msg.deleted_by_name ? ` by ${msg.deleted_by_name}` : ''}.</p>
                                                                        ) : editingMsgId === msg.id ? (
                                                                            <form onSubmit={handleEditMessage} className="flex gap-2">
                                                                                <input type="text" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded-lg text-sm min-w-[120px]" autoFocus />
                                                                                <button type="submit" className="px-2 py-1 bg-[#075e54] text-white rounded text-sm">Save</button>
                                                                                <button type="button" onClick={() => { setEditingMsgId(null); setEditDraft(''); }} className="px-2 py-1 border rounded text-sm">Cancel</button>
                                                                            </form>
                                                                        ) : msg.message_type === 'poll' ? (
                                                                            <div className="space-y-1.5 min-w-0">
                                                                                <p className="text-sm font-medium text-gray-900 break-words">{msg.message}</p>
                                                                                <div className="flex flex-col gap-2 mt-1">
                                                                                    {(msg.poll_options || ['Yes', 'No']).map((label, idx) => {
                                                                                        const count = (msg.poll_option_counts && msg.poll_option_counts[idx]) != null ? msg.poll_option_counts[idx] : (idx === 0 ? msg.poll_yes_count : msg.poll_no_count);
                                                                                        const voters = (msg.voters_by_option && msg.voters_by_option[idx]) || [];
                                                                                        const totalVoters = (msg.voters_count_by_option && msg.voters_count_by_option[idx]) != null ? msg.voters_count_by_option[idx] : voters.length;
                                                                                        const isSelected = msg.current_user_option_index === idx || (msg.current_user_vote === 'yes' && idx === 0) || (msg.current_user_vote === 'no' && idx === 1);
                                                                                        const moreCount = totalVoters > voters.length ? totalVoters - voters.length : 0;
                                                                                        const voterLabel = voters.length > 0 ? (voters.join(', ') + (moreCount > 0 ? ` and ${moreCount} more` : '')) : '';
                                                                                        return (
                                                                                            <div key={idx} className="flex flex-col gap-0.5 min-w-0">
                                                                                                <button type="button" onClick={() => handleVotePoll(msg.id, idx)} disabled={msg.current_user_vote != null || msg.current_user_option_index != null} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium touch-manipulation ${isSelected ? 'bg-[#075e54] text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>{label} {count != null ? `(${count})` : ''}</button>
                                                                                                {voterLabel && <span className="text-[10px] text-gray-500 pl-1 truncate" title={voterLabel}>— {voterLabel}</span>}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                                {(msg.current_user_vote != null || msg.current_user_option_index != null) && <span className="text-[10px] text-gray-500 block mt-0.5">You voted: {(msg.poll_options || ['Yes', 'No'])[msg.current_user_option_index ?? (msg.current_user_vote === 'yes' ? 0 : 1)]}</span>}
                                                                                {(msg.can_edit_any || (msg.is_own && msg.message_type === 'poll')) && editingPollId !== msg.id && <button type="button" onClick={() => { setEditingPollId(msg.id); setEditPollQuestion(msg.message); setEditPollOptions(msg.poll_options || ['Yes', 'No']); }} className="text-[10px] text-[#075e54] hover:underline mt-0.5 touch-manipulation">Edit poll</button>}
                                                                                {editingPollId === msg.id && (
                                                                                    <form onSubmit={(e) => handleEditPollSubmit(e, msg.id)} className="mt-2 p-2 bg-white/90 rounded-lg border border-gray-200 space-y-2">
                                                                                        <input type="text" value={editPollQuestion} onChange={(e) => setEditPollQuestion(e.target.value)} placeholder="Question" className="w-full min-w-0 px-2 py-1 text-sm border rounded" />
                                                                                        {editPollOptions.map((o, i) => <div key={i} className="flex gap-1 min-w-0"><input type="text" value={o} onChange={(e) => setEditPollOptions(editPollOptions.map((opt, j) => j === i ? e.target.value : opt))} className="flex-1 min-w-0 px-2 py-1 text-sm border rounded" placeholder={`Option ${i + 1}`} /></div>)}
                                                                                        <div className="flex flex-wrap gap-1"><button type="submit" className="px-2 py-1 bg-[#075e54] text-white text-sm rounded touch-manipulation">Save</button><button type="button" onClick={() => setEditingPollId(null)} className="px-2 py-1 border rounded text-sm touch-manipulation">Cancel</button></div>
                                                                                    </form>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                {msg.attachment_url && (msg.attachment_type === 'image' ? <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mb-1 max-w-full"><img src={msg.attachment_url} alt="" className="max-w-[220px] max-h-36 rounded-lg object-cover w-full" /></a> : <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#075e54] hover:underline block mb-1 break-all">View attachment</a>)}
                                                                                {(msg.message && msg.message.trim()) && <p className={`text-sm ${msg.is_hidden ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{msg.message}</p>}
                                                                            </>
                                                                        )}
                                                                        <div className="flex items-center justify-end gap-1 mt-0.5">
                                                                            {msg.edited_at && <span className="text-[10px] text-gray-500">(edited)</span>}
                                                                            <span className="text-[10px] text-gray-500">{formatMessageTime(msg.created_at)}</span>
                                                                            {!msg.is_deleted && (msg.can_edit || msg.can_edit_any) && editingMsgId !== msg.id && <button type="button" onClick={() => { setEditingMsgId(msg.id); setEditDraft(msg.message); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:bg-gray-200/80" title="Edit"><Edit2 size={12} /></button>}
                                                                            {!msg.is_deleted && (isAdmin || msg.can_edit_any) && <button type="button" onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={12} /></button>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()
                                            )}
                                            <div ref={messagesEndRef} className="h-0" />
                                        </div>
                                        {isAdmin && (
                                            <>
                                                <div className="px-2 pt-1.5 pb-1 border-t border-gray-200 bg-white flex gap-1 flex-wrap shrink-0">
                                                    <button type="button" onClick={() => setPostMode('message')} className={`shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium touch-manipulation ${postMode === 'message' ? 'bg-[#075e54] text-white' : 'bg-gray-100 text-gray-600'}`}>Message</button>
                                                    <button type="button" onClick={() => setPostMode('poll')} className={`shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium touch-manipulation ${postMode === 'poll' ? 'bg-[#075e54] text-white' : 'bg-gray-100 text-gray-600'}`}><BarChart2 size={12} className="inline mr-0.5" /> Poll</button>
                                                    <button type="button" onClick={() => setPostMode('schedule')} className={`shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium touch-manipulation ${postMode === 'schedule' ? 'bg-[#075e54] text-white' : 'bg-gray-100 text-gray-600'}`}><Clock size={12} className="inline mr-0.5" /> Schedule</button>
                                                </div>
                                                {postMode === 'poll' && (
                                                    <div className="px-3 py-2 space-y-2 border-t border-gray-100 bg-gray-50/50">
                                                        <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Poll question" className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm" />
                                                        {pollOptions.map((opt, idx) => (
                                                            <div key={idx} className="flex gap-1">
                                                                <input type="text" value={opt} onChange={(e) => setPollOptionAt(idx, e.target.value)} placeholder={`Option ${idx + 1}`} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-xl text-sm" />
                                                                <button type="button" onClick={() => removePollOption(idx)} disabled={pollOptions.length <= 2} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40">×</button>
                                                            </div>
                                                        ))}
                                                        <button type="button" onClick={addPollOption} disabled={pollOptions.length >= 20} className="text-xs text-[#075e54] font-medium">+ Add option</button>
                                                    </div>
                                                )}
                                                {postMode === 'schedule' && (
                                                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                                                        <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm" />
                                                        {scheduledMessages.length > 0 && <div className="text-[10px] text-gray-500 mt-1">Scheduled: {scheduledMessages.length}</div>}
                                                    </div>
                                                )}
                                                <form onSubmit={postMode === 'poll' ? handlePostPoll : postMode === 'schedule' ? handleScheduleMessage : handlePostClubMessage} className="p-2 bg-white border-t border-gray-200 flex items-end gap-2 shrink-0 min-h-0">
                                                    {postMode !== 'poll' && (
                                                        <>
                                                            <label className="shrink-0 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 cursor-pointer touch-manipulation" title="Attach (max 20 KB)">
                                                                <Image size={20} />
                                                                <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size <= MAX_ATTACHMENT_BYTES) setAttachmentFile(f); else if (f) toast.error('File must be 20 KB or less'); e.target.value = ''; }} />
                                                            </label>
                                                            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={postMode === 'schedule' ? 'Message to schedule...' : 'Type a message'} className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-[#075e54]/30 focus:border-[#075e54] outline-none text-sm" />
                                                            {attachmentFile && <span className="text-[10px] text-gray-500 truncate max-w-[80px] shrink-0">{attachmentFile.name}</span>}
                                                        </>
                                                    )}
                                                    {postMode === 'poll' && <div className="flex-1 min-w-0" />}
                                                    <button type="submit" className="shrink-0 w-10 h-10 rounded-full bg-[#075e54] text-white flex items-center justify-center hover:bg-[#064e47] disabled:opacity-50 transition-colors touch-manipulation" disabled={postMode === 'poll' && (!pollQuestion?.trim() || pollOptions.filter(Boolean).length < 2) || (postMode === 'message' && !newMessage?.trim() && !attachmentFile) || uploadingAttachment} title="Send">
                                                        {uploadingAttachment ? <span className="text-xs">...</span> : <Send size={18} className="ml-0.5" />}
                                                    </button>
                                                </form>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                {channelLoading ? (
                                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Loading...</div>
                                ) : !clubChannel ? (
                                    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                                        <Settings size={48} className="mx-auto mb-4 text-gray-300" />
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">No Communication Channel</h3>
                                        <p className="text-gray-500 max-w-md mx-auto">Create a communication channel from the Communication tab to configure settings.</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl">
                                        <h3 className="text-lg font-bold text-gray-900 mb-6">Club communication settings</h3>
                                        <div className="space-y-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={channelSettings?.students_can_send !== false} onChange={(e) => handleUpdateChannelSettings({ students_can_send: e.target.checked })} disabled={savingSettings} className="rounded border-gray-300" />
                                                <span className="text-sm font-medium text-gray-700">Allow students to send messages</span>
                                            </label>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Auto-disappearing messages</label>
                                                <p className="text-xs text-gray-500 mb-2">Messages older than this will be automatically removed. Max 30 days.</p>
                                                <select
                                                    value={autoDeletePreset}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setAutoDeletePreset(v);
                                                        if (v !== 'custom') handleUpdateChannelSettings({ auto_delete_after_days: Number(v) });
                                                    }}
                                                    disabled={savingSettings}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                                                >
                                                    <option value="7">7 days</option>
                                                    <option value="10">10 days</option>
                                                    <option value="30">Monthly (30 days)</option>
                                                    <option value="custom">Custom</option>
                                                </select>
                                                {autoDeletePreset === 'custom' && (
                                                    <div className="mt-2">
                                                        <label className="block text-xs text-gray-600 mb-1">Number of days (1–30)</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={30}
                                                            value={autoDeleteCustomDays}
                                                            onChange={(e) => setAutoDeleteCustomDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                                                            onBlur={() => handleUpdateChannelSettings({ auto_delete_after_days: autoDeleteCustomDays })}
                                                            disabled={savingSettings}
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal
                show={showCreateModal || showEditModal}
                onClose={() => { setShowCreateModal(false); setShowEditModal(false); }}
                title={showEditModal ? 'Edit Club Configuration' : 'Create New Club'}
            >
                <form onSubmit={showEditModal ? handleUpdateClub : handleCreateClub} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-full">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Club Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                                placeholder="e.g. Robotics Club"
                                required
                            />
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-24"
                                placeholder="Describe the club's mission and activities..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Membership Fee (₹)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-gray-400">₹</span>
                                <input
                                    type="number"
                                    value={formData.membership_fee}
                                    onChange={e => setFormData({ ...formData, membership_fee: e.target.value })}
                                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Fee Frequency</label>
                            <select
                                value={formData.fee_type}
                                onChange={e => setFormData({ ...formData, fee_type: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                            >
                                <option value="Yearly">Yearly</option>
                                <option value="Semesterly">Semesterly</option>
                            </select>
                        </div>

                        <div className="col-span-full">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Club Logo</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors cursor-pointer relative">
                                <div className="space-y-1 text-center">
                                    <Camera className="mx-auto h-12 w-12 text-gray-400" />
                                    <div className="flex text-sm text-gray-600">
                                        <label className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                                            <span>Upload a file</span>
                                            <input
                                                type="file"
                                                className="sr-only"
                                                accept="image/*"
                                                onChange={e => setFormData({ ...formData, image: e.target.files[0] })}
                                            />
                                        </label>
                                        <p className="pl-1">or drag and drop</p>
                                    </div>
                                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                                    {formData.image && (
                                        <p className="text-sm font-bold text-green-600 mt-2">{formData.image.name}</p>
                                    )}
                                </div>
                            </div>
                        </div>


                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
                            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2 transition-all"
                        >
                            {showEditModal ? 'Save Changes' : 'Create Club'} <ArrowRight size={16} />
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Activity Modal */}
            <Modal
                show={showActivityModal}
                onClose={() => setShowActivityModal(false)}
                title={editingActivity ? 'Edit Activity' : 'Post New Activity'}
            >
                <form onSubmit={handleActivitySubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={activityForm.title}
                            onChange={e => setActivityForm({ ...activityForm, title: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            placeholder="e.g. Weekly Workshop"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                        <textarea
                            value={activityForm.description}
                            onChange={e => setActivityForm({ ...activityForm, description: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-32"
                            placeholder="Details about the activity..."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Image (Optional)</label>
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                            <input
                                type="file"
                                onChange={e => setActivityForm({ ...activityForm, image: e.target.files[0] })}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                accept="image/*"
                            />
                            {activityForm.image ? (
                                <div className="text-sm text-green-600 font-medium flex flex-col items-center gap-2">
                                    <Check size={24} />
                                    {activityForm.image.name}
                                </div>
                            ) : (
                                <div className="text-gray-400 flex flex-col items-center gap-2">
                                    <Image size={24} />
                                    <span className="text-sm font-medium">Click to upload image</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setShowActivityModal(false)}
                            className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-md transition-all active:scale-95 flex items-center gap-2"
                        >
                            {editingActivity ? <Edit2 size={16} /> : <Send size={16} />}
                            {editingActivity ? 'Update Activity' : 'Post Activity'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Clubs;

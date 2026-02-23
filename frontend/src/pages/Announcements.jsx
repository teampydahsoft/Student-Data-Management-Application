import React, { useState, useEffect } from 'react';
import {
    Megaphone,
    Send,
    Trash2,
    Eye,
    EyeOff,
    Image as ImageIcon,
    Loader2,
    Users,
    X,
    Pencil,
    BarChart2,
    PlusCircle,
    MinusCircle,
    Calendar as CalendarIcon,
    Clock,
    Plus,
    MessageSquare,
    Smartphone,
    FileText,
    Settings,
    LayoutTemplate
} from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';

import TargetSelector from '../components/TargetSelector';
import EventCalendar from './admin/EventCalendar';

const Announcements = () => {
    const [activeTab, setActiveTab] = useState('announcements');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

    // Data States
    const [announcements, setAnnouncements] = useState([]);
    const [polls, setPolls] = useState([]);
    const [smsTemplates, setSmsTemplates] = useState([]);

    // SMS States
    const [smsMode, setSmsMode] = useState('broadcast'); // 'broadcast' | 'templates'
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    // UI States
    const [loading, setLoading] = useState(false);
    const [fetchingFeed, setFetchingFeed] = useState(true);
    const [editId, setEditId] = useState(null);
    const [audienceCount, setAudienceCount] = useState(null);
    const [fetchingCount, setFetchingCount] = useState(false);

    // Initial Form State
    const initialFormState = {
        title: '',
        content: '',
        // Poll specific
        question: '',
        options: ['', ''],
        start_time: '',
        end_time: '',
        // SMS Specific
        template_name: '', // For saving template
        template_id: '',
        template_content: '',
        variable_mappings: [], // Array of { type: 'static'|'field', value: '' }
        // Shared Targets
        target_college: [],
        target_batch: [],
        target_course: [],
        target_branch: [],
        target_year: [],
        target_semester: [],
        image: null,
        existing_image_url: null
    };

    const [formData, setFormData] = useState(initialFormState);

    useEffect(() => {
        if (activeTab === 'announcements') fetchAnnouncements();
        else if (activeTab === 'polls') fetchPolls();
        else if (activeTab === 'sms') fetchSmsTemplates();
    }, [activeTab]);

    const fetchAnnouncements = async () => {
        setFetchingFeed(true);
        try {
            const response = await api.get('/announcements/admin');
            if (response.data.success) setAnnouncements(response.data.data || []);
        } catch (error) { toast.error('Failed to load announcements'); }
        finally { setFetchingFeed(false); }
    };

    const fetchPolls = async () => {
        setFetchingFeed(true);
        try {
            const response = await api.get('/polls/admin');
            if (response.data.success) setPolls(response.data.data || []);
        } catch (error) { toast.error('Failed to load polls'); }
        finally { setFetchingFeed(false); }
    };

    const fetchSmsTemplates = async () => {
        setFetchingFeed(true);
        try {
            const response = await api.get('/sms-templates');
            if (response.data.success) setSmsTemplates(response.data.data || []);
        } catch (error) { console.error('Failed to load templates'); }
        finally { setFetchingFeed(false); }
    };

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            setFormData({
                ...formData,
                image: file,
                previewUrl: URL.createObjectURL(file) // Create local preview URL
            });
        }
    };

    const openCreateModal = (type = 'announcements') => {
        setFormData(initialFormState);
        setEditId(null);
        setActiveTab(type);
        setIsCreateModalOpen(true);
    };

    const openTemplateModal = (template = null) => {
        if (template) {
            setEditId(template.id);
            setFormData({
                ...initialFormState,
                template_name: template.name,
                template_id: template.template_id,
                template_content: template.content,
                variable_mappings: typeof template.variable_mappings === 'string' ? JSON.parse(template.variable_mappings) : (template.variable_mappings || [])
            });
        } else {
            setEditId(null);
            setFormData(initialFormState);
        }
        setIsTemplateModalOpen(true);
    };

    const openEditModal = (item, type) => {
        setEditId(item.id);
        setActiveTab(type);

        const parseField = (val) => {
            if (!val) return [];
            return Array.isArray(val) ? val : (typeof val === 'string' ? JSON.parse(val) : []);
        };

        if (type === 'announcements') {
            setFormData({
                ...initialFormState,
                title: item.title,
                content: item.content,
                target_college: parseField(item.target_college),
                target_batch: parseField(item.target_batch),
                target_course: parseField(item.target_course),
                target_branch: parseField(item.target_branch),
                target_year: parseField(item.target_year),
                target_semester: parseField(item.target_semester),
                existing_image_url: item.image_url
            });
        } else {
            // Poll
            const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : '';
            setFormData({
                ...initialFormState,
                question: item.question,
                options: Array.isArray(item.options) ? item.options : JSON.parse(item.options),
                start_time: formatDate(item.start_time),
                end_time: formatDate(item.end_time),
                target_college: parseField(item.target_college),
                target_batch: parseField(item.target_batch),
                target_course: parseField(item.target_course),
                target_branch: parseField(item.target_branch),
                target_year: parseField(item.target_year),
                target_semester: parseField(item.target_semester),
            });
        }
        setIsCreateModalOpen(true);
    };

    const handleCancel = () => {
        setIsCreateModalOpen(false);
        setIsTemplateModalOpen(false);
        setEditId(null);
        setFormData(initialFormState);
    };

    // Fetch audience count when targets change
    useEffect(() => {
        if (!isCreateModalOpen && !isTemplateModalOpen) return;

        const timer = setTimeout(async () => {
            setFetchingCount(true);
            try {
                const response = await api.post('/announcements/count', {
                    target_college: formData.target_college,
                    target_batch: formData.target_batch,
                    target_course: formData.target_course,
                    target_branch: formData.target_branch,
                    target_year: formData.target_year,
                    target_semester: formData.target_semester
                });
                if (response.data.success) {
                    setAudienceCount(response.data.count);
                }
            } catch (error) {
                console.error('Failed to fetch audience count');
            } finally {
                setFetchingCount(false);
            }
        }, 500); // Debounce

        return () => clearTimeout(timer);
    }, [
        formData.target_college,
        formData.target_batch,
        formData.target_course,
        formData.target_branch,
        formData.target_year,
        formData.target_semester,
        isCreateModalOpen,
        isTemplateModalOpen
    ]);

    // SMS Variable Logic for Template Creation

    // Handle Template Selection for Broadcast
    const handleTemplateSelect = (e) => {
        const tId = e.target.value;
        const template = smsTemplates.find(t => t.id.toString() === tId);
        setSelectedTemplate(template);
        if (template) {
            setFormData(prev => ({
                ...prev,
                template_id: template.template_id,
                template_content: template.content,
                variable_mappings: typeof template.variable_mappings === 'string' ? JSON.parse(template.variable_mappings) : (template.variable_mappings || [])
            }));
        } else {
            setFormData(prev => ({ ...prev, template_id: '', template_content: '', variable_mappings: [] }));
        }
    };

    const handleMappingChange = (index, key, value) => {
        // Only allow mapping changes during broadcast if we want to override default template mapping?
        // Or if we are creating a template.
        // For now let's assume mapping is set in template, but can be overridden in broadcast if needed?
        // User request says "on sending we will select audience and configured template and send".
        // It implies variables are PRE-CONFIGURED in the template or re-entered?
        // "on the new sms communication we needed to enter the name and dlt template id and content and variables and we will save them"
        // So variables are saved with template.

        const newMappings = [...formData.variable_mappings];
        newMappings[index] = { ...newMappings[index], [key]: value };
        setFormData({ ...formData, variable_mappings: newMappings });
    };

    const handleSubmitAnnouncement = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.content) return toast.error('Title and Content required');

        setLoading(true);
        const data = new FormData();
        data.append('title', formData.title);
        data.append('content', formData.content);
        if (formData.image) data.append('image', formData.image);
        if (editId && formData.existing_image_url && !formData.image) data.append('existing_image_url', formData.existing_image_url);

        ['target_college', 'target_batch', 'target_course', 'target_branch', 'target_year', 'target_semester'].forEach(key => {
            if (formData[key].length) data.append(key, JSON.stringify(formData[key]));
        });

        try {
            const url = editId ? `/announcements/${editId}` : '/announcements';
            const method = editId ? api.put : api.post;
            await method(url, data, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success(editId ? 'Updated' : 'Posted');
            handleCancel();
            fetchAnnouncements();
        } catch (error) { console.error(error); toast.error('Failed'); }
        finally { setLoading(false); }
    };

    const handleSubmitPoll = async (e) => {
        e.preventDefault();
        if (!formData.question || formData.options.filter(o => o.trim()).length < 2) return toast.error('Question and at least 2 options required');

        setLoading(true);
        const payload = {
            question: formData.question,
            options: formData.options.filter(o => o.trim()),
            start_time: formData.start_time || null,
            end_time: formData.end_time || null,
            target_college: formData.target_college,
            target_batch: formData.target_batch,
            target_course: formData.target_course,
            target_branch: formData.target_branch,
            target_year: formData.target_year,
            target_semester: formData.target_semester
        };

        try {
            if (editId) {
                await api.put(`/polls/${editId}`, payload);
                toast.success('Poll updated successfully');
            } else {
                await api.post('/polls', payload);
                toast.success('Poll created successfully');
            }
            handleCancel();
            fetchPolls();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to save poll');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveTemplate = async (e) => {
        e.preventDefault();
        if (!formData.template_name || !formData.template_id || !formData.template_content) return toast.error('All fields required');

        setLoading(true);
        try {
            const payload = {
                name: formData.template_name,
                template_id: formData.template_id,
                content: formData.template_content,
                variable_mappings: formData.variable_mappings
            };

            if (editId) {
                await api.put(`/sms-templates/${editId}`, payload);
                toast.success('Template updated');
            } else {
                await api.post('/sms-templates', payload);
                toast.success('Template created');
            }
            handleCancel();
            fetchSmsTemplates();
        } catch (error) {
            console.error(error);
            toast.error('Failed to save template');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm('Delete this template?')) return;
        try {
            await api.delete(`/sms-templates/${id}`);
            toast.success('Template deleted');
            fetchSmsTemplates();
        } catch (e) { toast.error('Failed to delete'); }
    };

    const handleSendBroadcast = async (e) => {
        e.preventDefault();
        if (!selectedTemplate) return toast.error('Please select a template');

        const hasEmptyMapping = formData.variable_mappings.some(m => !m.value);
        if (hasEmptyMapping) return toast.error('Please fill all variable mappings');

        setLoading(true);
        try {
            const payload = {
                template_id: formData.template_id,
                template_content: formData.template_content,
                variable_mappings: formData.variable_mappings,
                target_college: formData.target_college,
                target_batch: formData.target_batch,
                target_course: formData.target_course,
                target_branch: formData.target_branch,
                target_year: formData.target_year,
                target_semester: formData.target_semester
            };

            const response = await api.post('/announcements/sms', payload);
            if (response.data.success) {
                toast.success(response.data.message || 'SMS Sending Initiated');
                // Reset form but keep mode
                setFormData(prev => ({
                    ...initialFormState,
                    target_college: [],
                    target_batch: []
                }));
                setSelectedTemplate(null);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to send SMS');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, type) => {
        if (!window.confirm('Delete this item?')) return;
        try {
            await api.delete(`/${type}/${id}`);
            toast.success('Deleted');
            if (type === 'announcements') fetchAnnouncements(); else fetchPolls();
        } catch (e) { toast.error('Failed to delete'); }
    };

    const toggleStatus = async (id, currentStatus, type) => {
        try {
            await api.patch(`/${type}/${id}/status`, { is_active: !currentStatus });
            toast.success('Status updated');
            if (type === 'announcements') fetchAnnouncements(); else fetchPolls();
        } catch (e) { toast.error('Failed update'); }
    };

    // Poll Option Helpers
    const addOption = () => {
        if (formData.options.length < 6) setFormData({ ...formData, options: [...formData.options, ''] });
    };
    const removeOption = (idx) => {
        if (formData.options.length > 2) {
            const newOpts = [...formData.options];
            newOpts.splice(idx, 1);
            setFormData({ ...formData, options: newOpts });
        }
    };
    const updateOption = (idx, val) => {
        const newOpts = [...formData.options];
        newOpts[idx] = val;
        setFormData({ ...formData, options: newOpts });
    };

    // Student Fields for Mapping
    const studentFields = [
        { label: 'Student Name', value: 'student_name' },
        { label: 'Admission Number', value: 'admission_number' },
        { label: 'User Name', value: 'admission_number' },
        { label: 'Login Link', value: 'login_link' },
        { label: 'Default Password', value: 'default_password' },
        { label: 'Parent Name', value: 'father_name' },
        { label: 'Parent Mobile', value: 'parent_mobile1' },
        { label: 'Student Mobile', value: 'student_mobile' },
        { label: 'College Name', value: 'college' },
        { label: 'Branch', value: 'branch' },
        { label: 'Current Year', value: 'current_year' },
        { label: 'Current Semester', value: 'current_semester' },
        { label: 'Total Due Amount', value: 'total_due' },
        { label: 'Attendance %', value: 'attendance_percentage' },
        { label: 'Current Date', value: 'current_date' }
    ];



    const AnnouncementSkeleton = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                    <div className="flex justify-between items-start mb-3">
                        <div className="h-5 bg-gray-200 rounded w-2/3"></div>
                        <div className="flex gap-1">
                            <div className="w-8 h-8 bg-gray-100 rounded"></div>
                            <div className="w-8 h-8 bg-gray-100 rounded"></div>
                        </div>
                    </div>
                    <div className="h-32 bg-gray-100 rounded-lg mb-3"></div>
                    <div className="space-y-2">
                        <div className="h-4 bg-gray-50 rounded w-full"></div>
                        <div className="h-4 bg-gray-50 rounded w-5/6"></div>
                    </div>
                </div>
            ))}
        </div>
    );

    const PollSkeleton = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="space-y-3 mb-6">
                        <div className="h-10 bg-gray-50 rounded"></div>
                        <div className="h-10 bg-gray-50 rounded"></div>
                    </div>
                    <div className="h-12 bg-gray-50 rounded-b-xl -mx-6 -mb-6"></div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-transparent space-y-6 animate-fade-in relative">
            {/* Tabs & Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 bg-white/80 backdrop-blur-md px-6 py-2 rounded-t-2xl shadow-sm overflow-hidden sticky top-0 z-30">
                <div className="flex overflow-x-auto scrollbar-hide w-full sm:w-auto -mx-2 sm:mx-0">
                    <div className="flex bg-gray-100/50 p-1 rounded-xl">
                        {[
                            { id: 'announcements', label: 'Announcements', icon: Megaphone },
                            { id: 'polls', label: 'Polls', icon: BarChart2 },
                            { id: 'sms', label: 'SMS', icon: Smartphone },
                            { id: 'calendar', label: 'Events', icon: CalendarIcon }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); }}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab !== 'calendar' && activeTab !== 'sms' && (
                    <button
                        onClick={() => openCreateModal(activeTab)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transform transition-all hover:-translate-y-0.5"
                    >
                        <Plus size={18} strokeWidth={3} />
                        Create New
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-b-2xl shadow-sm border border-gray-200 border-t-0 p-6 min-h-[400px]">
                {fetchingFeed && activeTab === 'announcements' && <AnnouncementSkeleton />}
                {fetchingFeed && activeTab === 'polls' && <PollSkeleton />}
                {fetchingFeed && (activeTab === 'sms' || activeTab === 'calendar') && (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin text-blue-600" />
                    </div>
                )}

                {/* SMS View */}
                {activeTab === 'sms' && (
                    <div className="space-y-6">
                        {/* SMS Sub-tabs */}
                        <div className="flex gap-4 border-b pb-4">
                            <button
                                onClick={() => setSmsMode('broadcast')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${smsMode === 'broadcast' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <Send size={16} /> Send Broadcast
                            </button>
                            <button
                                onClick={() => setSmsMode('templates')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${smsMode === 'templates' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <LayoutTemplate size={16} /> Manage Templates
                            </button>
                        </div>

                        {smsMode === 'templates' ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-bold text-gray-800">SMS Templates</h3>
                                    <button
                                        onClick={() => openTemplateModal()}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                                    >
                                        <Plus size={16} /> Create Template
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {smsTemplates.map(template => (
                                        <div key={template.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all group">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-bold text-gray-900">{template.name}</h4>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openTemplateModal(template)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded"><Pencil size={14} /></button>
                                                    <button onClick={() => handleDeleteTemplate(template.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2 font-mono bg-gray-50 p-1 rounded w-fit">ID: {template.template_id}</div>
                                            <p className="text-sm text-gray-600 line-clamp-3">{template.content}</p>
                                        </div>
                                    ))}
                                    {smsTemplates.length === 0 && (
                                        <div className="col-span-full text-center py-10 text-gray-400">No templates found. Create one to get started.</div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full">
                                <form onSubmit={handleSendBroadcast} className="block w-full">
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-140px)] overflow-hidden">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start h-full">
                                            {/* Left Column: Template Selection & Preview */}
                                            <div className="lg:col-span-5 space-y-6 border-r border-gray-100 pr-8 overflow-y-auto scrollbar-hide">
                                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 sticky top-0 bg-white z-10 py-2">
                                                    <LayoutTemplate className="text-blue-500" size={20} />
                                                    Template Configuration
                                                </h3>

                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Template</label>
                                                        <div className="relative">
                                                            <select
                                                                className="w-full p-3 pl-4 pr-10 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all appearance-none cursor-pointer text-gray-700 font-medium shadow-sm sticky top-0"
                                                                value={selectedTemplate?.id || ''}
                                                                onChange={handleTemplateSelect}
                                                            >
                                                                <option value="">-- Choose a Template --</option>
                                                                {smsTemplates.map(t => (
                                                                    <option key={t.id} value={t.id}>{t.name} ({t.template_id})</option>
                                                                ))}
                                                            </select>
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                                <LayoutTemplate size={16} />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSmsMode('templates')}
                                                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 transition-colors"
                                                            >
                                                                <Settings size={12} /> Manage Templates
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {selectedTemplate && (
                                                        <div className="animate-fade-in space-y-4">
                                                            {/* Message Preview */}
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Message Preview</label>
                                                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl rounded-tr-none border border-blue-100 shadow-sm relative">
                                                                    <div className="absolute -right-2 -top-2 bg-blue-600 text-white p-1 rounded-full shadow-md">
                                                                        <MessageSquare size={12} />
                                                                    </div>
                                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-medium">
                                                                        {formData.template_content}
                                                                    </p>
                                                                    <div className="mt-2 flex justify-end">
                                                                        <span className="text-[10px] text-gray-400 font-medium uppercase">SMS Preview</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Variable Mapping Config */}
                                                            {formData.variable_mappings.length > 0 && (
                                                                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 shadow-inner">
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <Settings size={14} className="text-gray-500" />
                                                                        <label className="text-xs font-bold text-gray-600 uppercase">Variable Configuration</label>
                                                                    </div>
                                                                    <div className="space-y-3">
                                                                        {formData.variable_mappings.map((mapping, idx) => (
                                                                            <div key={idx} className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold font-mono">#{idx + 1}</span>
                                                                                    <span className="text-gray-500 text-xs">maps to</span>
                                                                                </div>
                                                                                <span className="font-semibold text-gray-800 truncate max-w-[150px]" title={mapping.type === 'static' ? mapping.value : mapping.value}>
                                                                                    {mapping.type === 'static'
                                                                                        ? `"${mapping.value}"`
                                                                                        : (studentFields.find(f => f.value === mapping.value)?.label || mapping.value)
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-400 mt-3 text-center">To edit mappings, go to 'Manage Templates'</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Column: Audience & Action */}
                                            <div className="lg:col-span-7 flex flex-col h-full pl-4 overflow-hidden">
                                                <div className="flex-1 overflow-y-auto scrollbar-hide pt-2">
                                                    <div className="bg-gray-50 p-1 rounded-xl border border-gray-200">
                                                        <TargetSelector formData={formData} setFormData={setFormData} hideTitle={true} />
                                                    </div>
                                                </div>

                                                <div className="mt-auto pt-6 border-t border-gray-100 bg-white">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="text-sm text-gray-500">
                                                            <p className="font-medium text-gray-700">Ready to broadcast?</p>
                                                            <p className="text-xs">Estimate: {selectedTemplate ? 'Calculating...' : 'Select template first'}</p>
                                                        </div>
                                                        <button
                                                            type="submit"
                                                            disabled={loading || !selectedTemplate}
                                                            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-4 rounded-xl font-bold hover:from-green-700 hover:to-emerald-700 flex items-center gap-3 shadow-lg hover:shadow-green-500/30 transform transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none min-w-[200px] justify-center"
                                                        >
                                                            {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                                                            <span>Send Broadcast</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}


                {
                    activeTab === 'announcements' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {announcements.map(ann => (
                                <div key={ann.id} className={`bg-white rounded-xl shadow-sm border p-4 group hover:shadow-md transition-all ${!ann.is_active ? 'opacity-75 grayscale' : ''}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="font-bold text-gray-900 line-clamp-1">{ann.title}</h4>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => toggleStatus(ann.id, ann.is_active, 'announcements')} className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
                                                {ann.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                            </button>
                                            <button onClick={() => openEditModal(ann, 'announcements')} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded"><Pencil size={16} /></button>
                                            <button onClick={() => handleDelete(ann.id, 'announcements')} className="p-1.5 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    {ann.image_url && (
                                        <div className="mb-3 h-32 overflow-hidden rounded-lg bg-gray-100">
                                            <img src={ann.image_url} alt={ann.title} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{ann.content}</p>
                                </div>
                            ))}
                            {announcements.length === 0 && !loading && (
                                <div className="col-span-full text-center py-10 text-gray-500">No announcements found.</div>
                            )}
                        </div>
                    )
                }

                {/* Polls list */}
                {activeTab === 'polls' && !loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {polls.map(poll => (
                            <div key={poll.id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 group hover:shadow-md transition-all ${!poll.is_active ? 'opacity-75' : ''}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1">
                                        <h4 className="font-bold text-gray-900 text-lg line-clamp-2">{poll.question}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                                                {poll.audience_count || poll.stats?.assigned || 0} Students
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => toggleStatus(poll.id, poll.is_active, 'polls')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                                            {poll.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                        </button>
                                        <button onClick={() => openEditModal(poll, 'polls')} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg"><Pencil size={16} /></button>
                                        <button onClick={() => handleDelete(poll.id, 'polls')} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="mb-4 space-y-3">
                                    {(poll.options || []).map((opt, i) => {
                                        const count = poll.vote_counts?.[i] || 0;
                                        const total = poll.stats?.votes || 1;
                                        const percent = Math.round((count / total) * 100);
                                        return (
                                            <div key={i} className="text-sm">
                                                <div className="flex justify-between mb-1.5">
                                                    <span className="font-medium text-gray-700">{opt}</span>
                                                    <span className="text-gray-400 font-bold text-[10px]">{count} votes ({percent}%)</span>
                                                </div>
                                                <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                                                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="pt-4 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-500 mt-6 pt-4">
                                    <div className="flex gap-4">
                                        <span className="flex items-center gap-1 font-semibold" title="Assigned Students"><Users size={12} /> {poll.stats?.assigned || 0}</span>
                                        <span className="flex items-center gap-1 font-semibold" title="Total Votes"><BarChart2 size={12} /> {poll.stats?.votes || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                                        <Clock size={12} className="text-amber-500" />
                                        {poll.end_time ? `Deadline: ${new Date(poll.end_time).toLocaleDateString()}` : 'No deadline'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {
                    activeTab === 'calendar' && (
                        <div className="-m-6">
                            <EventCalendar isEmbedded={true} />
                        </div>
                    )
                }
            </div >

            {/* General Modal (Announcements/Polls) */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b flex justify-between items-center bg-white z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                                    {editId ? <Pencil size={24} /> : <PlusCircle size={24} />}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">
                                        {editId ? 'Edit Item' : (activeTab === 'announcements' ? 'New Announcement' : 'New Poll')}
                                    </h2>
                                    <p className="text-xs text-gray-500">Configure your broadcast targets and content</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {/* Live Audience Indicator */}
                                <div className="hidden md:flex flex-col items-end px-4 py-2 bg-gray-50 rounded-2xl border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estimated Reach</span>
                                    <div className="flex items-center gap-2">
                                        {fetchingCount ? (
                                            <Loader2 size={12} className="animate-spin text-blue-500" />
                                        ) : (
                                            <Users size={12} className="text-blue-500" />
                                        )}
                                        <span className="text-sm font-black text-gray-900">{audienceCount ?? '...'} Students</span>
                                    </div>
                                </div>
                                <button onClick={handleCancel} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto bg-gray-50/30">
                            <form onSubmit={activeTab === 'announcements' ? handleSubmitAnnouncement : handleSubmitPoll} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        {activeTab === 'announcements' ? (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                                    <input
                                                        type="text"
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Enter title"
                                                        value={formData.title}
                                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                                    <textarea
                                                        className="w-full p-2 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Enter details..."
                                                        value={formData.content}
                                                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Image (Optional)</label>
                                                    {formData.existing_image_url && !formData.image && (
                                                        <div className="mb-2 h-20 w-32 relative group">
                                                            <img src={formData.existing_image_url} alt="Current" className="h-full w-full object-cover rounded border" />
                                                            <button type="button" onClick={() => setFormData({ ...formData, existing_image_url: null })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={12} /></button>
                                                        </div>
                                                    )}
                                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors relative">
                                                        <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                                        <div className="flex flex-col items-center gap-2 text-gray-500">
                                                            {formData.previewUrl ? (
                                                                <div className="relative w-full h-48 mb-2">
                                                                    <img src={formData.previewUrl} alt="Preview" className="w-full h-full object-contain rounded-md" />
                                                                    <div className="text-xs mt-1 text-blue-600 font-semibold">Click to change</div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <ImageIcon size={24} />
                                                                    <span className="text-sm">{formData.image ? formData.image.name : 'Click to update image'}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Poll Question</label>
                                                    <input
                                                        type="text"
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Ask something..."
                                                        value={formData.question}
                                                        onChange={e => setFormData({ ...formData, question: e.target.value })}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Start Time</label>
                                                        <input
                                                            type="datetime-local"
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                            value={formData.start_time || ''}
                                                            onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">End Time</label>
                                                        <input
                                                            type="datetime-local"
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                            value={formData.end_time || ''}
                                                            onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                                                    <div className="space-y-2">
                                                        {formData.options.map((opt, idx) => (
                                                            <div key={idx} className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                                    placeholder={`Option ${idx + 1}`}
                                                                    value={opt}
                                                                    onChange={e => updateOption(idx, e.target.value)}
                                                                />
                                                                {formData.options.length > 2 && (
                                                                    <button type="button" onClick={() => removeOption(idx)} className="text-red-500 hover:bg-red-50 p-2 rounded"><MinusCircle size={20} /></button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {formData.options.length < 6 && (
                                                            <button type="button" onClick={addOption} className="text-blue-600 text-sm font-semibold flex items-center gap-1 mt-2">
                                                                <PlusCircle size={16} /> Add Option
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <TargetSelector formData={formData} setFormData={setFormData} />
                                </div>
                                <div className="flex justify-end pt-4 border-t gap-3">
                                    <button type="button" onClick={handleCancel} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-70"
                                    >
                                        {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                                        {loading ? (formData.image ? 'Uploading post...' : 'Submitting...') : (editId ? 'Update' : (activeTab === 'announcements' ? 'Post' : 'Create Poll'))}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )
            }

            {/* SMS Template Modal */}
            {
                isTemplateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
                            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <Settings className="text-blue-600" size={20} />
                                    {editId ? 'Edit SMS Template' : 'Create SMS Template'}
                                </h2>
                                <button onClick={handleCancel} className="p-2 hover:bg-gray-200 rounded-full text-gray-500">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6">
                                <form onSubmit={handleSaveTemplate} className="space-y-4">
                                    <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 mb-4">
                                        <h4 className="font-bold flex items-center gap-1 mb-1"><MessageSquare size={14} /> Guide</h4>
                                        <p>Use <code>{'{#var#}'}</code> as placeholder for variables in content.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name (Internal)</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2 border rounded bg-white"
                                            placeholder="e.g. Absent Alert"
                                            value={formData.template_name}
                                            onChange={e => setFormData({ ...formData, template_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">DLT Template ID</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2 border rounded bg-white"
                                            placeholder="1007..."
                                            value={formData.template_id}
                                            onChange={e => setFormData({ ...formData, template_id: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                        <textarea
                                            required
                                            className="w-full p-2 border rounded bg-white h-24"
                                            placeholder="Content with {#var#}..."
                                            value={formData.template_content}
                                            onChange={e => setFormData({ ...formData, template_content: e.target.value })}
                                        />
                                    </div>

                                    {formData.variable_mappings.length > 0 && (
                                        <div className="space-y-3 bg-gray-50 p-3 rounded border">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Map Variables</label>
                                            {formData.variable_mappings.map((mapping, idx) => (
                                                <div key={idx} className="flex gap-2 items-center">
                                                    <span className="text-xs font-mono text-gray-500 w-12">var#{idx + 1}</span>
                                                    <select
                                                        className="p-1 border rounded text-xs bg-white"
                                                        value={mapping.type}
                                                        onChange={(e) => handleMappingChange(idx, 'type', e.target.value)}
                                                    >
                                                        <option value="static">Static</option>
                                                        <option value="field">Field</option>
                                                    </select>
                                                    {mapping.type === 'static' ? (
                                                        <input
                                                            type="text"
                                                            className="flex-1 p-1 border rounded text-xs"
                                                            placeholder="Value"
                                                            value={mapping.value}
                                                            onChange={(e) => handleMappingChange(idx, 'value', e.target.value)}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="flex-1 p-1 border rounded text-xs bg-white"
                                                            value={mapping.value}
                                                            onChange={(e) => handleMappingChange(idx, 'value', e.target.value)}
                                                        >
                                                            <option value="">Select Field...</option>
                                                            {studentFields.map(f => (
                                                                <option key={f.value} value={f.value}>{f.label}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-3 pt-4">
                                        <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                                        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-blue-700">
                                            {editId ? 'Save Changes' : 'Create Template'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Announcements;

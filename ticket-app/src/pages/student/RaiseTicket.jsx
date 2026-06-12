import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    Ticket,
    Upload,
    X,
    AlertCircle,
    CheckCircle,
    Camera,
    Sparkles,
    Plus
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { compressTicketPhoto, MAX_TICKET_PHOTO_BYTES } from '../../utils/ticketPhoto';

import { motion } from 'framer-motion';
import { SkeletonBox } from '../../components/SkeletonLoader';
import '../../styles/student-pages.css';

const RaiseTicket = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        category_id: '',
        sub_category_id: '',
        title: '',
        description: '',
        photo: null
    });
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoProcessing, setPhotoProcessing] = useState(false);
    const queryClient = useQueryClient();

    // Fetch active categories
    const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
        queryKey: ['complaint-categories-active'],
        queryFn: async () => {
            const response = await api.get('/complaint-categories/active');
            return response.data?.data || [];
        }
    });

    // Create ticket mutation
    const createMutation = useMutation({
        mutationFn: async (formDataToSend) => {
            const formDataObj = new FormData();
            formDataObj.append('category_id', formDataToSend.category_id);
            if (formDataToSend.sub_category_id) {
                formDataObj.append('sub_category_id', formDataToSend.sub_category_id);
            }
            formDataObj.append('title', formDataToSend.title);
            formDataObj.append('description', formDataToSend.description);
            if (formDataToSend.photo) {
                formDataObj.append('photo', formDataToSend.photo);
            }

            const response = await api.post('/tickets', formDataObj, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            return response.data;
        },
        onSuccess: async () => {
            toast.success('Ticket raised successfully!');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['student-tickets'] }),
                queryClient.invalidateQueries({ queryKey: ['tickets'] }),
                queryClient.invalidateQueries({ queryKey: ['ticket-audience-counts'] }),
                queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
            ]);
            navigate('/student/my-tickets');
        },
        onError: (error) => {
            console.error('Ticket creation failed:', error);
            console.log('Error response:', error.response);
            toast.error(error.response?.data?.message || 'Failed to raise ticket');
        }
    });

    const categories = categoriesData || [];
    const selectedCategory = categories.find(cat => cat.id === parseInt(formData.category_id));

    const handleCategoryChange = (categoryId) => {
        setFormData({
            ...formData,
            category_id: categoryId,
            sub_category_id: '' // Reset sub-category when main category changes
        });
    };

    const handlePhotoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            e.target.value = '';
            return;
        }

        if (file.size > MAX_TICKET_PHOTO_BYTES) {
            setPhotoProcessing(true);
            try {
                const compressed = await compressTicketPhoto(file, MAX_TICKET_PHOTO_BYTES);
                if (compressed.size > MAX_TICKET_PHOTO_BYTES) {
                    toast.error('Photo must be 1MB or smaller. Try a smaller image.');
                    e.target.value = '';
                    return;
                }
                setFormData({ ...formData, photo: compressed });
                setPhotoPreview(URL.createObjectURL(compressed));
                toast.success('Photo compressed to meet the 1MB limit');
            } catch (error) {
                toast.error(error.message || 'Failed to process photo');
                e.target.value = '';
            } finally {
                setPhotoProcessing(false);
            }
            return;
        }

        setFormData({ ...formData, photo: file });
        setPhotoPreview(URL.createObjectURL(file));
    };

    const removePhoto = () => {
        setFormData({ ...formData, photo: null });
        setPhotoPreview(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.category_id) {
            toast.error('Please select a complaint category');
            return;
        }

        if (!formData.title.trim()) {
            toast.error('Please enter a title');
            return;
        }

        // Description is optional now
        createMutation.mutate(formData);
    };

    if (categoriesLoading) {
        return (
            <div className="student-page-container animate-pulse" style={{ maxWidth: '48rem', margin: '0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <SkeletonBox height="h-8" width="w-48" />
                    <SkeletonBox height="h-4" width="w-72" />
                </div>
                <div className="card-base" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <SkeletonBox height="h-4" width="w-32" />
                        <SkeletonBox height="h-10" width="w-full" className="rounded-lg" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <SkeletonBox height="h-4" width="w-24" />
                        <SkeletonBox height="h-10" width="w-full" className="rounded-lg" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <SkeletonBox height="h-4" width="w-32" />
                        <SkeletonBox height="h-32" width="w-full" className="rounded-lg" />
                    </div>
                    <SkeletonBox height="h-20" width="w-full" className="rounded-lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="student-page-container animate-fade-in-up raise-ticket-page">
            {/* Header Section */}
            <div className="flex-col md:flex-row flex-between pb-2 border-b border-gray-100" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '0.375rem', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <div className="raise-ticket-header-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#2563eb', marginBottom: '0.125rem' }}>
                        <Ticket size={14} />
                        <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2em' }}>Support Case</span>
                    </div>
                    <h1 className="page-title">
                        Raise a Ticket
                    </h1>
                    <p className="page-subtitle">
                        Submit your details and our team will get back to you shortly
                    </p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="form-container">
                {/* Category Selection */}
                <div className="form-group">
                    <label className="form-label">
                        Category <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                        value={formData.category_id}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        required
                        className="form-select"
                        style={{ appearance: 'none' }}
                    >
                        <option value="">Select a category</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </select>
                    {selectedCategory?.description && (
                        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, paddingLeft: '0.25rem', fontStyle: 'italic' }}>
                            Tip: {selectedCategory.description}
                        </p>
                    )}
                </div>

                {/* Sub-Category Selection (if available) */}
                {selectedCategory && selectedCategory.has_sub_categories && selectedCategory.sub_categories.length > 0 && (
                    <div className="form-group animate-fade-in">
                        <label className="form-label">
                            Specific Issue <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500, marginLeft: '0.25rem' }}>(Optional)</span>
                        </label>
                        <select
                            value={formData.sub_category_id}
                            onChange={(e) => setFormData({ ...formData, sub_category_id: e.target.value })}
                            className="form-select"
                        >
                            <option value="">Select a sub-category</option>
                            {selectedCategory.sub_categories.map((subCategory) => (
                                <option key={subCategory.id} value={subCategory.id}>
                                    {subCategory.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Title */}
                <div className="form-group">
                    <label className="form-label">
                        Subject Line <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder="What's the issue?"
                        className="form-input"
                    />
                </div>

                {/* Description */}
                <div className="form-group">
                    <label className="form-label">
                        Detailed Description <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500, marginLeft: '0.25rem' }}>(Optional)</span>
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={4}
                        placeholder="Please provide as much detail as possible to help us resolve this quickly..."
                        className="form-textarea"
                        style={{ resize: 'none' }}
                    />
                </div>

                {/* Photo Upload */}
                <div className="form-group">
                    <label className="form-label">
                        Attachment <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500, marginLeft: '0.25rem' }}>(Optional)</span>
                    </label>
                    {!photoPreview ? (
                        <div className="photo-upload-box">
                            <input
                                type="file"
                                id="photo-upload"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="photo-upload" style={{ cursor: 'pointer', display: 'block' }}>
                                <div style={{ width: '3rem', height: '3rem', backgroundColor: '#f9fafb', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto' }}>
                                    <Camera size={24} color="#9ca3af" />
                                </div>
                                <p className="photo-upload-title" style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', marginBottom: '0.125rem' }}>Click or drag photo</p>
                                <p style={{ fontSize: '0.6875rem', color: '#6b7280', fontWeight: 500, letterSpacing: '0.025em' }}>JPG, PNG up to 1MB</p>
                            </label>
                        </div>
                    ) : (
                        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '1.5rem', border: '2px solid #dbeafe', padding: '0.5rem' }}>
                            <img
                                src={photoPreview}
                                alt="Preview"
                                style={{ width: '100%', maxHeight: '18rem', objectFit: 'cover', borderRadius: '1rem' }}
                            />
                            <div className="group-hover:opacity-100" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = 1} onMouseLeave={(e) => e.currentTarget.style.opacity = 0}>
                                <button
                                    type="button"
                                    onClick={removePhoto}
                                    style={{ padding: '0.75rem', backgroundColor: '#dc2626', color: 'white', borderRadius: '1rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <div className="raise-ticket-submit-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1rem', position: 'relative', zIndex: 10 }}>
                    <button
                        type="submit"
                        disabled={createMutation.isPending || photoProcessing}
                        className="btn-primary raise-ticket-submit-btn"
                        style={{ width: '100%', padding: '1rem', fontSize: '1.125rem' }}
                    >
                        {createMutation.isPending ? (
                            <>
                                <div className="animate-spin rounded-full h-6 w-6 border-4 border-white/20 border-b-white"></div>
                                <span>Submitting...</span>
                            </>
                        ) : photoProcessing ? (
                            <>
                                <div className="animate-spin rounded-full h-6 w-6 border-4 border-white/20 border-b-white"></div>
                                <span>Processing photo...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles size={22} style={{ color: '#bfdbfe' }} />
                                <span>Submit Ticket</span>
                                <Plus size={22} />
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/student/my-tickets')}
                        className="btn-secondary"
                        style={{ width: '100%', backgroundColor: '#f3f4f6', color: '#374151' }}
                    >
                        Cancel
                    </button>
                    <style>{`
                        .btn-secondary:hover {
                            background-color: #e5e7eb !important;
                        }
                    `}</style>
                </div>
            </form>

            {/* Info Box */}
            <div
                className="raise-ticket-info-box animate-fade-in"
                style={{ background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', border: '1px solid #dbeafe', borderRadius: '1.5rem', padding: '1.5rem 2rem' }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '1rem', color: '#2563eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h3 className="heading-font" style={{ fontSize: '1.125rem', fontWeight: 900, color: '#1e3a8a', marginBottom: '0.5rem', fontStyle: 'italic' }}>What's next?</h3>
                        <div className="stats-grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#60a5fa', letterSpacing: '0.05em' }}>Phase 01</p>
                                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e40af', lineHeight: 1.25 }}>Review by administration</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#60a5fa', letterSpacing: '0.05em' }}>Phase 02</p>
                                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e40af', lineHeight: 1.25 }}>Resource allocation</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 900, color: '#60a5fa', letterSpacing: '0.05em' }}>Phase 03</p>
                                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e40af', lineHeight: 1.25 }}>Solution & Feedback</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RaiseTicket;

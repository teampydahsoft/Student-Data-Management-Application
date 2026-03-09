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

import { motion } from 'framer-motion';
import { SkeletonBox } from '../../components/SkeletonLoader';

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
    onSuccess: (data) => {
      toast.success('Ticket raised successfully!');
      queryClient.invalidateQueries(['tickets']);
      navigate('/student/my-tickets');
    },
    onError: (error) => {
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

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo size must be less than 5MB');
        return;
      }
      setFormData({ ...formData, photo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
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

    // Description is now optional
    createMutation.mutate(formData);
  };

  if (categoriesLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6 animate-pulse">
        <div className="space-y-2">
          <SkeletonBox height="h-8" width="w-48" />
          <SkeletonBox height="h-4" width="w-72" />
        </div>
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="space-y-2">
            <SkeletonBox height="h-4" width="w-32" />
            <SkeletonBox height="h-10" width="w-full" className="rounded-lg" />
          </div>
          <div className="space-y-2">
            <SkeletonBox height="h-4" width="w-24" />
            <SkeletonBox height="h-10" width="w-full" className="rounded-lg" />
          </div>
          <div className="space-y-2">
            <SkeletonBox height="h-4" width="w-32" />
            <SkeletonBox height="h-32" width="w-full" className="rounded-lg" />
            <SkeletonBox height="h-3" width="w-full" />
          </div>
          <SkeletonBox height="h-20" width="w-full" className="rounded-lg" />
          <div className="flex gap-4 pt-4 border-t">
            <SkeletonBox height="h-12" width="w-full" className="rounded-lg" />
            <SkeletonBox height="h-12" width="w-32" className="rounded-lg" />
          </div>
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-4">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
              <Ticket size={28} />
            </div>
            Support Terminal
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] items-center flex gap-2 ml-14">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
            Dispatching queries to infrastructure management
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] border border-slate-100 p-8 lg:p-12 space-y-10 shadow-xl shadow-slate-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none"></div>

        {/* Category Selection */}
        <div className="relative z-10">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
            Classification <span className="text-rose-500">*</span>
          </label>
          <select
            value={formData.category_id}
            onChange={(e) => handleCategoryChange(e.target.value)}
            required
            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-[1.2rem] focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-50/50 transition-all outline-none font-bold text-slate-700 appearance-none shadow-sm"
          >
            <option value="">Select Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {selectedCategory?.description && (
            <p className="mt-2 text-xs text-blue-600 font-semibold px-1 italic">
              Tip: {selectedCategory.description}
            </p>
          )}
        </div>

        {/* Sub-Category Selection (if available) */}
        {selectedCategory && selectedCategory.has_sub_categories && selectedCategory.sub_categories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="relative z-10"
          >
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
              Specify Issue <span className="text-slate-300 text-[8px] italic ml-2">(Optional)</span>
            </label>
            <select
              value={formData.sub_category_id}
              onChange={(e) => setFormData({ ...formData, sub_category_id: e.target.value })}
              className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all outline-none font-medium appearance-none"
            >
              <option value="">Select a sub-category</option>
              {selectedCategory.sub_categories.map((subCategory) => (
                <option key={subCategory.id} value={subCategory.id}>
                  {subCategory.name}
                </option>
              ))}
            </select>
          </motion.div>
        )}

        {/* Title */}
        <div className="relative z-10">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
            Incident Heading <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            placeholder="Headline of your query"
            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-[1.2rem] focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-50/50 transition-all outline-none font-bold text-slate-700 shadow-sm"
          />
        </div>

        {/* Description */}
        <div className="relative z-10">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
            Detailed Exposition <span className="text-slate-300 text-[8px] italic ml-2">(Optional)</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={6}
            placeholder="Provide context for rapid resolution..."
            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-[1.5rem] focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-50/50 transition-all outline-none font-bold text-slate-700 resize-none shadow-sm"
          />
        </div>

        {/* Photo Upload */}
        <div className="relative z-10">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">
            Visual Documentation <span className="text-slate-300 text-[8px] italic ml-2">(Optional)</span>
          </label>
          {!photoPreview ? (
            <div className="group border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer bg-slate-50/50">
              <input
                type="file"
                id="photo-upload"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <label htmlFor="photo-upload" className="cursor-pointer block">
                <div className="w-20 h-20 bg-white shadow-md rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <Camera className="text-indigo-600" size={36} />
                </div>
                <p className="text-lg text-slate-900 font-black mb-1">Upload Visual Proof</p>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">JPG, PNG up to 5MB</p>
              </label>
            </div>
          ) : (
            <div className="relative group overflow-hidden rounded-3xl border-2 border-blue-100 ring-8 ring-blue-50/50">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full max-h-72 object-cover transition-transform group-hover:scale-105 duration-500"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={removePhoto}
                  className="p-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 shadow-xl transform transition-all active:scale-90"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 relative z-10">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full sm:flex-1 px-8 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4 shadow-xl shadow-indigo-200 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 active:scale-95 group"
          >
            {createMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-4 border-white/20 border-b-white"></div>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Sparkles size={22} className="group-hover:animate-pulse text-blue-200" />
                <span>Submit Ticket</span>
                <Plus size={22} className="transition-transform group-hover:rotate-90" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/student/my-tickets')}
            className="w-full sm:w-auto px-8 py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95 shadow-sm"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-blue-50 border border-blue-100 rounded-3xl p-6 lg:p-8"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-2xl text-blue-600 shadow-sm border border-blue-100">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-blue-900 mb-2 italic">What's next?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-black text-blue-400 tracking-tighter">Phase 01</p>
                <p className="text-sm font-bold text-blue-800 leading-tight">Review by administration</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-black text-blue-400 tracking-tighter">Phase 02</p>
                <p className="text-sm font-bold text-blue-800 leading-tight">Resource allocation</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-black text-blue-400 tracking-tighter">Phase 03</p>
                <p className="text-sm font-bold text-blue-800 leading-tight">Solution & Feedback</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RaiseTicket;


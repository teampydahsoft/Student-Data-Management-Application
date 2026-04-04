import React, { useState, useEffect } from 'react';
import { X, Settings, Shield, Check, Loader2, Save, Filter, ClipboardList } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const ProfileUpdateSettingsModal = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [enabledFields, setEnabledFields] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch available fields
      const fieldsRes = await api.get('/rbac/users/student-fields');

      if (fieldsRes.data?.success) {
        setCategories(fieldsRes.data.data.categories || []);
      }

      // Fetch current settings
      const settingsRes = await api.get('/settings/profile-update-fields');
      if (settingsRes.data?.success) {
        setEnabledFields(settingsRes.data.data.enabledFields || []);
      }
    } catch (error) {
      console.error('Failed to fetch settings data:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (fieldKey) => {
    setEnabledFields(prev => {
      if (prev.includes(fieldKey)) {
        return prev.filter(k => k !== fieldKey);
      } else {
        return [...prev, fieldKey];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put('/settings/profile-update-fields', { enabledFields });
      if (response.data?.success) {
        toast.success('Settings saved successfully');
        onClose();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <ClipboardList size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Profile Update Request Settings</h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">Control which fields students can update during mobile verification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-indigo-600" size={40} />
              <p className="text-sm font-medium text-gray-500">Loading available fields...</p>
            </div>
          ) : (
            categories.map(category => (
              <div key={category.id} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className={`p-1.5 rounded-md bg-${category.color || 'blue'}-50 text-${category.color || 'blue'}-600`}>
                    <Shield size={16} />
                  </div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{category.label}</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {category.fields.map(field => {
                    const isSelected = enabledFields.includes(field.key);
                    return (
                      <button
                        key={field.key}
                        onClick={() => toggleField(field.key)}
                        className={`group relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                          ${isSelected 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm' 
                            : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200 hover:shadow-sm'
                          }`}
                      >
                        <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors
                          ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate leading-tight">{field.label}</p>
                          <p className="text-[10px] font-medium text-gray-400 mt-0.5 uppercase tracking-tighter">{field.type} • {field.key}</p>
                        </div>
                        
                        {/* Selected Indicator Pill */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-gray-500 font-medium">
              <span className="font-bold text-indigo-600">{enabledFields.length}</span> fields enabled for student update requests.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition-all text-sm"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-2 transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileUpdateSettingsModal;

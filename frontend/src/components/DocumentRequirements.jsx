import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Save, X, AlertCircle } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from './LoadingAnimation';

const DocumentRequirements = () => {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    course_type: 'UG',
    academic_stage: '10th',
    required_documents: [],
    is_enabled: true
  });

  const COURSE_TYPES = ['UG', 'PG'];
  const ACADEMIC_STAGES = ['10th', 'Inter', 'Diploma', 'UG'];
  const DOCUMENT_TYPES = [
    '10th Certificate',
    '10th Study Certificate',
    '10th TC (Transfer Certificate)',
    'Inter Certificate',
    'Inter Study Certificate',
    'Inter TC (Transfer Certificate)',
    'Diploma Certificate',
    'Diploma Study Certificate',
    'Diploma TC (Transfer Certificate)',
    'UG Certificate',
    'UG Study Certificate',
    'UG TC (Transfer Certificate)'
  ];

  useEffect(() => {
    fetchRequirements();
  }, []);

  const fetchRequirements = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/documents');
      if (response.data.success) {
        setRequirements(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching document requirements:', error);
      toast.error('Failed to load document requirements');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = () => {
    if (!formData.required_documents.includes(formData.newDocument)) {
      setFormData({
        ...formData,
        required_documents: [...formData.required_documents, formData.newDocument],
        newDocument: ''
      });
    }
  };

  const handleRemoveDocument = (doc) => {
    setFormData({
      ...formData,
      required_documents: formData.required_documents.filter(d => d !== doc)
    });
  };

  const handleSave = async () => {
    if (!formData.course_type || !formData.academic_stage) {
      toast.error('Program type and academic stage are required');
      return;
    }

    if (formData.required_documents.length === 0) {
      toast.error('At least one document is required');
      return;
    }

    try {
      setSaving(true);
      await api.post('/settings/documents', formData);
      toast.success('Document requirements saved successfully');
      setShowAddForm(false);
      setFormData({
        course_type: 'UG',
        academic_stage: '10th',
        required_documents: [],
        is_enabled: true
      });
      await fetchRequirements();
    } catch (error) {
      console.error('Error saving document requirements:', error);
      toast.error(error.response?.data?.message || 'Failed to save document requirements');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (courseType, academicStage) => {
    if (!window.confirm(`Delete document requirements for ${courseType} - ${academicStage}?`)) {
      return;
    }

    try {
      await api.delete(`/settings/documents/${courseType}/${academicStage}`);
      toast.success('Document requirements deleted successfully');
      await fetchRequirements();
    } catch (error) {
      console.error('Error deleting document requirements:', error);
      toast.error('Failed to delete document requirements');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation width={32} height={32} message="Loading document requirements..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Document Requirements</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure which documents are required for different program types and academic stages
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus size={16} />
          Add Requirements
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">Add New Document Requirements</h4>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({
                  course_type: 'UG',
                  academic_stage: '10th',
                  required_documents: [],
                  is_enabled: true
                });
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Program Type *</label>
              <select
                value={formData.course_type}
                onChange={(e) => setFormData({ ...formData, course_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              >
                {COURSE_TYPES.map((type) => (
                  <option key={type} value={type.id || type}>{type.name || type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Stage *</label>
              <select
                value={formData.academic_stage}
                onChange={(e) => setFormData({ ...formData, academic_stage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              >
                {ACADEMIC_STAGES.map((stage) => (
                  <option key={stage} value={stage.id || stage}>{stage.name || stage}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Required Documents *</label>
            <div className="flex gap-2 mb-2">
              <select
                value={formData.newDocument || ''}
                onChange={(e) => setFormData({ ...formData, newDocument: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              >
                <option value="">Select a document</option>
                {DOCUMENT_TYPES.filter(doc => !formData.required_documents.includes(doc)).map((doc) => (
                  <option key={doc} value={doc.id || doc}>{doc.name || doc}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddDocument}
                disabled={!formData.newDocument}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.required_documents.map((doc, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm"
                >
                  {doc}
                  <button
                    type="button"
                    onClick={() => handleRemoveDocument(doc)}
                    className="text-purple-700 hover:text-purple-900"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isEnabled"
              checked={formData.is_enabled}
              onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="isEnabled" className="text-sm text-gray-700">Enabled</label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({
                  course_type: 'UG',
                  academic_stage: '10th',
                  required_documents: [],
                  is_enabled: true
                });
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <LoadingAnimation width={16} height={16} showMessage={false} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {requirements.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-gray-200 bg-gray-50">
            <FileText size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No document requirements configured yet</p>
            <p className="text-sm text-gray-500 mt-1">Click "Add Requirements" to get started</p>
          </div>
        ) : (
          requirements.map((req, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                      {req.course_type}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
                      {req.academic_stage}
                    </span>
                    {req.is_enabled ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                        Enabled
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Required Documents:</p>
                    <div className="flex flex-wrap gap-2">
                      {(req.required_documents || []).map((doc, docIndex) => (
                        <span
                          key={docIndex}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                        >
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(req.course_type, req.academic_stage)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DocumentRequirements;


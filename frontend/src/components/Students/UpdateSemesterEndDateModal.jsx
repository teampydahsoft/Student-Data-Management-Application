import React, { useState, useEffect } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../config/api';

const UpdateSemesterEndDateModal = ({ isOpen, onClose, semesterData, onUpdated }) => {
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && semesterData?.endDate) {
      try {
        const d = new Date(semesterData.endDate);
        if (!isNaN(d.getTime())) {
          setEndDate(d.toISOString().split('T')[0]);
        }
      } catch (e) {
        // Ignore
      }
    }
  }, [isOpen, semesterData]);

  if (!isOpen || !semesterData) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!endDate) {
      toast.error('Please select an end date');
      return;
    }

    try {
      setSubmitting(true);
      const response = await api.put(`/semesters/${semesterData.id}`, {
        endDate
      });
      if (response.data?.success) {
        toast.success('Semester end date updated successfully');
        onUpdated?.(response.data.data);
        onClose();
      } else {
        toast.error(response.data?.message || 'Failed to update end date');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update end date');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50">
          <div>
            <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <Calendar size={18} className="text-amber-600" />
              Update Semester End Date
            </h2>
            <p className="text-xs text-amber-700 mt-1">
              Required for promotion: Year {semesterData.yearOfStudy} • Semester {semesterData.semesterNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-amber-100 text-amber-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4 text-sm text-gray-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
            <strong>Warning:</strong> You are trying to promote a student, but their current semester's end date is in the future. Please update the end date to today or a past date to proceed.
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]} // Max date is today
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Update End Date
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdateSemesterEndDateModal;

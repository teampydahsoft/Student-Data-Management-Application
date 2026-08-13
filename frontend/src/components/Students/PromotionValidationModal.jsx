import React, { useMemo } from 'react';
import { X, Calendar, AlertTriangle, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

const PromotionValidationModal = ({ 
  isOpen, 
  onClose, 
  currentSemesterData, 
  nextSemesterData, 
  onProceed, 
  onUpdateEndDate 
}) => {
  const isFutureEndDate = useMemo(() => {
    if (currentSemesterData && currentSemesterData.endDate) {
      const endDate = new Date(currentSemesterData.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      return endDate > today;
    }
    return false;
  }, [currentSemesterData]);

  const hasNextStartDateError = !nextSemesterData || !nextSemesterData.startDate;

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not Set';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
              <Calendar size={18} className="text-indigo-600" />
              Promotion Validation
            </h2>
            <p className="text-xs text-indigo-700 mt-1">
              Review semester dates before promoting the student
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-indigo-100 text-indigo-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Dates Overview */}
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Current Semester</div>
              <div className="font-medium text-gray-900">
                {currentSemesterData ? `Year ${currentSemesterData.yearOfStudy} - Sem ${currentSemesterData.semesterNumber}` : 'N/A'}
              </div>
              <div className="text-sm text-gray-600 mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Start:</span>
                  <span className="font-medium">{formatDate(currentSemesterData?.startDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>End:</span>
                  <span className={`font-medium ${isFutureEndDate ? 'text-amber-600' : ''}`}>
                    {formatDate(currentSemesterData?.endDate)}
                  </span>
                </div>
              </div>
            </div>

            <ArrowRight className="text-gray-400 shrink-0" size={24} />

            <div className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-indigo-500 uppercase mb-1">Next Semester</div>
              <div className="font-medium text-indigo-900">
                {nextSemesterData ? `Year ${nextSemesterData.yearOfStudy} - Sem ${nextSemesterData.semesterNumber}` : 'N/A'}
              </div>
              <div className="text-sm text-indigo-700 mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Start:</span>
                  <span className={`font-medium ${hasNextStartDateError ? 'text-red-600' : ''}`}>
                    {formatDate(nextSemesterData?.startDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>End:</span>
                  <span className="font-medium">{formatDate(nextSemesterData?.endDate)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Validation Messages */}
          <div className="space-y-3">
            {hasNextStartDateError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-sm font-semibold text-red-800">Next Semester Start Date Missing</h4>
                  <p className="text-sm text-red-700 mt-1">
                    The start date for the next semester is required to promote a student. Please configure it in the Academic Calendar settings first.
                  </p>
                </div>
              </div>
            )}

            {!hasNextStartDateError && isFutureEndDate && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Current Semester Ends in the Future</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    The current semester has an end date of <strong>{formatDate(currentSemesterData?.endDate)}</strong>. 
                    You can choose to proceed anyway, or update the end date now.
                  </p>
                </div>
              </div>
            )}

            {!hasNextStartDateError && !isFutureEndDate && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
                <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-sm font-semibold text-green-800">Ready for Promotion</h4>
                  <p className="text-sm text-green-700 mt-1">
                    All academic calendar dates are properly configured. You can safely promote this student.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>

          {!hasNextStartDateError && isFutureEndDate && (
            <button
              type="button"
              onClick={onUpdateEndDate}
              className="px-4 py-2 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors text-sm font-medium"
            >
              Update End Date
            </button>
          )}

          <button
            type="button"
            disabled={hasNextStartDateError}
            onClick={onProceed}
            className={`px-4 py-2 rounded-lg text-white font-medium text-sm shadow transition-colors flex items-center gap-2
              ${hasNextStartDateError 
                ? 'bg-gray-400 cursor-not-allowed opacity-70' 
                : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
          >
            {isFutureEndDate ? 'Proceed Anyway' : 'Confirm Promotion'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromotionValidationModal;

import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  buildExportFieldOptions,
  buildStudentsCsv,
  DEFAULT_EXPORT_FIELD_KEYS,
  fetchStudentsForExport
} from '../../utils/studentExportUtils';

const StudentExportModal = ({
  isOpen,
  onClose,
  filters = {},
  search = '',
  forms = [],
  canViewField = () => true,
  totalCount = 0
}) => {
  const availableFields = useMemo(
    () => buildExportFieldOptions(forms, canViewField),
    [forms, canViewField]
  );

  const [selectedKeys, setSelectedKeys] = useState([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const defaultKeys = DEFAULT_EXPORT_FIELD_KEYS.filter((key) =>
      availableFields.some((field) => field.key === key)
    );
    setSelectedKeys(defaultKeys.length > 0 ? defaultKeys : availableFields.map((field) => field.key));
  }, [isOpen, availableFields]);

  const groupedFields = useMemo(() => {
    const groups = {};
    availableFields.forEach((field) => {
      const group = field.group || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(field);
    });
    return groups;
  }, [availableFields]);

  const selectedFields = availableFields.filter((field) => selectedKeys.includes(field.key));
  const allSelected = availableFields.length > 0 && selectedKeys.length === availableFields.length;

  const toggleField = (fieldKey) => {
    setSelectedKeys((prev) =>
      prev.includes(fieldKey) ? prev.filter((key) => key !== fieldKey) : [...prev, fieldKey]
    );
  };

  const toggleAll = () => {
    setSelectedKeys(allSelected ? [] : availableFields.map((field) => field.key));
  };

  const handleDownload = async () => {
    if (selectedFields.length === 0) {
      toast.error('Select at least one field to export');
      return;
    }

    setDownloading(true);
    try {
      const exportStudents = await fetchStudentsForExport({ filters, search });
      if (!exportStudents.length) {
        toast.error('No data to export');
        return;
      }

      const csvContent = buildStudentsCsv(exportStudents, selectedFields);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const hasFilters = Object.keys(filters).length > 0 || (search && search.trim());
      link.href = url;
      link.download = hasFilters
        ? `students_filtered_${new Date().toISOString().split('T')[0]}.csv`
        : `students_all_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${exportStudents.length} student${exportStudents.length === 1 ? '' : 's'}`);
      onClose();
    } catch (error) {
      console.error('Student export failed:', error);
      toast.error(error.response?.data?.message || 'Failed to export students');
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Export Students to CSV</h2>
            <p className="text-sm text-gray-500">
              Select the fields to include, matching the student details view.
              {totalCount > 0 ? ` ${totalCount.toLocaleString()} student${totalCount === 1 ? '' : 's'} match current filters.` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            aria-label="Close export dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {selectedKeys.length} of {availableFields.length} fields selected
          </p>
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {allSelected ? <Square size={16} /> : <CheckSquare size={16} />}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {Object.entries(groupedFields).map(([group, fields]) => (
            <div key={group}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{group}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {fields.map((field) => {
                  const isSelected = selectedKeys.includes(field.key);
                  return (
                    <label
                      key={field.key}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-blue-200 hover:bg-blue-50/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleField(field.key)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-blue-500' : 'border-2 border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs font-medium leading-tight">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {availableFields.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No exportable fields available for your account.</p>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || selectedFields.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-medium"
          >
            <Download size={18} />
            {downloading ? 'Preparing CSV...' : 'Download CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentExportModal;

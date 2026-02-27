import React, { useState, useEffect, useMemo } from 'react';
import { Upload, X, Download, AlertCircle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from './LoadingAnimation';

const BulkUploadModal = ({ isOpen, onClose, forms, onUploadComplete, isLoadingForms = false }) => {
  if (!isOpen) {
    return null;
  }

  // Auto-select the first available form when forms are loaded
  const [selectedForm, setSelectedForm] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [confirmingUpload, setConfirmingUpload] = useState(false);
  const [templateMetadata, setTemplateMetadata] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [validRecordsPage, setValidRecordsPage] = useState(1);
  const [invalidRecordsPage, setInvalidRecordsPage] = useState(1);
  const recordsPerPage = 50;

  const selectedFormDetails = useMemo(() => {
    if (!forms || forms.length === 0 || !selectedForm) {
      return null;
    }
    return forms.find((form) => form.form_id === selectedForm) || null;
  }, [forms, selectedForm]);

  const resolvedFormFields = useMemo(() => {
    if (!selectedFormDetails || !selectedFormDetails.form_fields) {
      return [];
    }
    const { form_fields: rawFields } = selectedFormDetails;
    if (Array.isArray(rawFields)) {
      return rawFields;
    }
    try {
      const parsed = JSON.parse(rawFields);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Unable to parse form fields for bulk upload template', error);
      return [];
    }
  }, [selectedFormDetails]);

  const normalize = (value) =>
    value ? value.toString().toLowerCase().replace(/[\s_-]+/g, '') : '';

  const stageFieldSummary = useMemo(() => {
    if (resolvedFormFields.length === 0) {
      return null;
    }

    const findField = (identifiers = []) =>
      resolvedFormFields.find((field) => {
        const key = normalize(field.key);
        const label = normalize(field.label);
        return identifiers.some((identifier) => key === identifier || label === identifier);
      });

    const courseField = findField(['course', 'coursename']);
    const branchField = findField(['branch', 'branchname']);
    const yearField = findField(['currentacademicyear', 'currentyear', 'year']);
    const semesterField = findField(['currentsemester', 'semester']);

    return {
      courseField,
      branchField,
      yearField,
      semesterField
    };
  }, [resolvedFormFields]);

  // Fetch colleges on mount
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        setCollegesLoading(true);
        const response = await api.get('/colleges');
        if (response.data?.success) {
          setColleges(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch colleges:', error);
      } finally {
        setCollegesLoading(false);
      }
    };

    if (isOpen) {
      fetchColleges();
    }
  }, [isOpen]);

  useEffect(() => {
    if (forms && forms.length > 0 && !selectedForm) {
      setSelectedForm(forms[0].form_id);
      console.log('🔄 Auto-selected form:', forms[0].form_name, forms[0].form_id);
    }
  }, [forms, selectedForm]);

  useEffect(() => {
    if (!forms || forms.length === 0) {
      setSelectedForm('');
    }
  }, [forms]);

  useEffect(() => {
    if (!selectedForm) {
      setTemplateMetadata(null);
      setMetadataError(null);
      setSelectedCourseId('');
      setSelectedBranchId('');
      return;
    }

    let isCancelled = false;

    const fetchTemplateMetadata = async () => {
      setMetadataLoading(true);
      setMetadataError(null);
      try {
        const response = await api.get(`/submissions/template/${selectedForm}/metadata`);
        if (!isCancelled) {
          const metadata = response.data?.data || null;
          setTemplateMetadata(metadata);

          if (metadata?.courseOptions?.length === 1) {
            const defaultCourseId = String(metadata.courseOptions[0].id);
            setSelectedCourseId(defaultCourseId);
            const branches = metadata.courseOptions[0].branches || [];
            if (branches.length === 1) {
              setSelectedBranchId(String(branches[0].id));
            } else {
              setSelectedBranchId('');
            }
          } else {
            setSelectedCourseId('');
            setSelectedBranchId('');
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Template metadata fetch failed:', error);
          setTemplateMetadata(null);
          setSelectedCourseId('');
          setSelectedBranchId('');
          setMetadataError(error.response?.data?.message || 'Failed to load template details');
        }
      } finally {
        if (!isCancelled) {
          setMetadataLoading(false);
        }
      }
    };

    fetchTemplateMetadata();

    return () => {
      isCancelled = true;
    };
  }, [selectedForm]);

  useEffect(() => {
    setPreviewData(null);
    setUploadResult(null);
  }, [selectedForm, selectedCollegeId]);

  const courseOptions = useMemo(
    () => (templateMetadata?.courseOptions ? templateMetadata.courseOptions : []),
    [templateMetadata]
  );

  const selectedCourseOption = useMemo(() => {
    if (!selectedCourseId) {
      return null;
    }
    return courseOptions.find((course) => String(course.id) === String(selectedCourseId)) || null;
  }, [courseOptions, selectedCourseId]);

  const branchOptions = useMemo(
    () => (selectedCourseOption?.branches ? selectedCourseOption.branches : []),
    [selectedCourseOption]
  );

  useEffect(() => {
    if (!selectedCourseOption) {
      if (selectedBranchId) {
        setSelectedBranchId('');
      }
      return;
    }

    if (branchOptions.length === 1) {
      const onlyBranchId = String(branchOptions[0].id);
      if (selectedBranchId !== onlyBranchId) {
        setSelectedBranchId(onlyBranchId);
      }
    } else if (selectedBranchId) {
      const branchExists = branchOptions.some((branch) => String(branch.id) === String(selectedBranchId));
      if (!branchExists) {
        setSelectedBranchId('');
      }
    }
  }, [selectedCourseOption, branchOptions, selectedBranchId]);

  const selectedBranchOption = useMemo(() => {
    if (!selectedBranchId) {
      return null;
    }
    return branchOptions.find((branch) => String(branch.id) === String(selectedBranchId)) || null;
  }, [branchOptions, selectedBranchId]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    console.log('📁 File selected:', {
      name: selectedFile?.name,
      type: selectedFile?.type,
      size: selectedFile?.size
    });

    const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (selectedFile && validTypes.includes(selectedFile.type)) {
      setFile(selectedFile);
      setUploadResult(null);
      setPreviewData(null);
      console.log('✅ Valid file selected:', selectedFile.name, 'Type:', selectedFile.type);
    } else {
      toast.error('Please select a valid CSV or Excel file');
      e.target.value = null;
      console.log('❌ Invalid file selected:', selectedFile?.type);
    }
  };

  const downloadTemplate = async () => {
    if (!selectedForm) {
      toast.error('Please select a form first');
      return;
    }

    try {
      const queryParams = new URLSearchParams();

      if (selectedCourseOption) {
        queryParams.append('course', selectedCourseOption.name);
      }

      if (selectedBranchOption) {
        queryParams.append('branch', selectedBranchOption.name);
      }

      const endpoint = queryParams.toString()
        ? `/submissions/template/${selectedForm}?${queryParams.toString()}`
        : `/submissions/template/${selectedForm}`;

      // Download Excel template from backend
      const response = await api.get(endpoint, {
        responseType: 'blob' // Important for binary data
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${forms.find(f => f.form_id === selectedForm)?.form_name}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Excel template downloaded successfully');
    } catch (error) {
      console.error('Download template error:', error);
      const message = error.response?.data?.message || 'Failed to download template';
      toast.error(message);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a CSV or Excel file');
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setPreviewData(null);
    setUploadProgress('Preparing preview...');

    if (!selectedCollegeId) {
      toast.error('Please select a college before uploading');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedForm) {
        formData.append('formId', selectedForm);
      }
      if (selectedCollegeId) {
        formData.append('collegeId', selectedCollegeId);
      }

      const response = await api.post('/students/bulk-upload/preview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const preview = response?.data?.data || null;
      setPreviewData(preview);
      setUploadProgress('');

      if (preview?.summary) {
        toast.success(
          `Preview ready: ${preview.summary.validCount} valid, ${preview.summary.invalidCount} invalid`
        );
      } else {
        toast.success('Preview generated successfully');
      }
    } catch (error) {
      console.error('❌ Preview generation error:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to prepare upload preview';
      toast.error(message);
      setPreviewData(null);
      setUploadResult(null);
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleConfirmUpload = async () => {
    if (!previewData || !Array.isArray(previewData?.validRecords) || previewData.validRecords.length === 0) {
      toast.error('No valid records available to upload');
      return;
    }

    setConfirmingUpload(true);
    setUploadResult(null);

    if (!selectedCollegeId) {
      toast.error('Please select a college before uploading');
      return;
    }

    try {
      const payload = {
        records: previewData.validRecords.map((record) => ({
          rowNumber: record.rowNumber,
          sanitizedData: record.sanitizedData
        })),
        collegeId: selectedCollegeId
      };

      const response = await api.post('/students/bulk-upload/commit', payload);
      setUploadResult(response.data);

      if (response?.data?.message) {
        toast.success(response.data.message);
      } else {
        toast.success('Students uploaded successfully');
      }

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error('❌ Commit upload error:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to upload student records';
      toast.error(message);
      setUploadResult({
        success: false,
        message,
        error: error.response?.data || null
      });
    } finally {
      setConfirmingUpload(false);
    }
  };

  const handleClose = () => {
    setSelectedForm('');
    setFile(null);
    setUploadResult(null);
    setUploadProgress('');
    setTemplateMetadata(null);
    setMetadataError(null);
    setSelectedCourseId('');
    setSelectedBranchId('');
    setSelectedCollegeId('');
    setPreviewData(null);
    setConfirmingUpload(false);
    onClose();
  };

  // Pagination calculations
  const validRecordsTotalPages = useMemo(() => {
    if (!previewData?.validRecords) return 1;
    return Math.ceil(previewData.validRecords.length / recordsPerPage);
  }, [previewData?.validRecords]);

  const invalidRecordsTotalPages = useMemo(() => {
    if (!previewData?.invalidRecords) return 1;
    return Math.ceil(previewData.invalidRecords.length / recordsPerPage);
  }, [previewData?.invalidRecords]);

  const paginatedValidRecords = useMemo(() => {
    if (!previewData?.validRecords) return [];
    const start = (validRecordsPage - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return previewData.validRecords.slice(start, end);
  }, [previewData?.validRecords, validRecordsPage]);

  const paginatedInvalidRecords = useMemo(() => {
    if (!previewData?.invalidRecords) return [];
    const start = (invalidRecordsPage - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return previewData.invalidRecords.slice(start, end);
  }, [previewData?.invalidRecords, invalidRecordsPage]);

  // Get all unique column keys from valid records
  const allColumns = useMemo(() => {
    if (!previewData?.validRecords || previewData.validRecords.length === 0) {
      return [];
    }
    const columnSet = new Set();
    previewData.validRecords.forEach(record => {
      if (record.rawData) {
        Object.keys(record.rawData).forEach(key => columnSet.add(key));
      }
      if (record.sanitizedData) {
        Object.keys(record.sanitizedData).forEach(key => columnSet.add(key));
      }
    });
    return Array.from(columnSet).sort();
  }, [previewData?.validRecords]);

  // Reset pagination when preview data changes
  useEffect(() => {
    setValidRecordsPage(1);
    setInvalidRecordsPage(1);
  }, [previewData]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Bulk Upload Dashboard</h3>
              <p className="text-blue-100 text-xs mt-1">Upload and manage student data in bulk</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar text-sm">

          <div className="space-y-6">
            {/* College Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select College * <span className="text-red-500">(Required for validation)</span>
              </label>
              <select
                value={selectedCollegeId}
                onChange={(e) => {
                  setSelectedCollegeId(e.target.value);
                  setPreviewData(null);
                  setUploadResult(null);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none disabled:bg-gray-100 disabled:text-gray-500"
                disabled={collegesLoading}
              >
                <option value="">
                  {collegesLoading ? 'Loading colleges...' : 'Choose a college...'}
                </option>
                {!collegesLoading && colleges && colleges.length > 0 ? (
                  colleges.map((college) => (
                    <option key={college.id} value={college.id}>
                      {college.name}
                    </option>
                  ))
                ) : (
                  !collegesLoading && <option value="" disabled>No colleges available</option>
                )}
              </select>
              {selectedCollegeId && (
                <p className="text-xs text-blue-600 mt-1">
                  Courses and branches will be validated against this college
                </p>
              )}
            </div>

            {/* Form Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Form *
              </label>
              <select
                value={selectedForm}
                onChange={(e) => setSelectedForm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none disabled:bg-gray-100 disabled:text-gray-500"
                disabled={isLoadingForms || !forms || forms.length === 0}
              >
                <option value="">
                  {isLoadingForms ? 'Loading forms...' : 'Choose a form...'}
                </option>
                {!isLoadingForms && forms && forms.length > 0 ? (
                  forms.map((form) => (
                    <option key={form.form_id} value={form.form_id}>
                      {form.form_name}
                    </option>
                  ))
                ) : (
                  !isLoadingForms && <option value="" disabled>No forms available</option>
                )}
              </select>
              {isLoadingForms && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                  <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                  <span>Fetching available templates...</span>
                </div>
              )}
            </div>

            {/* Download Template */}
            {selectedForm && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 mb-2">
                      Download the Excel template for the selected form. You can optionally pre-select a course and branch to pre-fill the sample row in the sheet.
                    </p>
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <Download size={16} />
                      Download Excel Template
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 uppercase tracking-wide mb-1">
                      Program for sample row
                    </label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      disabled={metadataLoading || courseOptions.length === 0}
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-blue-100 disabled:text-blue-500"
                    >
                      <option value="">
                        {metadataLoading
                          ? 'Loading courses...'
                          : courseOptions.length > 0
                            ? 'Select a program (optional)'
                            : 'No active programs found'}
                      </option>
                      {courseOptions.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} {course.level ? `(${course.level.toUpperCase()})` : ''}
                        </option>
                      ))}
                    </select>
                    {!metadataLoading && courseOptions.length === 0 && (
                      <p className="text-xs text-blue-700 mt-1">
                        Configure programs in the Settings page to enable quick selections.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 uppercase tracking-wide mb-1">
                      Branch for sample row
                    </label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      disabled={
                        metadataLoading ||
                        !selectedCourseOption ||
                        branchOptions.length === 0
                      }
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-blue-100 disabled:text-blue-500"
                    >
                      <option value="">
                        {!selectedCourseOption
                          ? 'Select a course first'
                          : branchOptions.length > 0
                            ? 'Select a branch (optional)'
                            : 'No branches available'}
                      </option>
                      {branchOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                    {selectedCourseOption && branchOptions.length === 0 && !metadataLoading && (
                      <p className="text-xs text-blue-700 mt-1">
                        This course does not have active branches. Update the course configuration to add branches.
                      </p>
                    )}
                  </div>
                </div>
                {metadataError && (
                  <div className="bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    {metadataError}
                  </div>
                )}
              </div>
            )}

            {selectedForm && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-indigo-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm text-indigo-800 font-medium mb-2">
                      Make sure your Excel file includes the required academic structure columns so students are linked to the correct course, branch, year and semester.
                    </p>
                    <ul className="text-sm text-indigo-700 list-disc ml-5 space-y-1">
                      <li>
                        <span className="font-semibold">Course</span>{' '}
                        {stageFieldSummary?.courseField
                          ? `→ matches form field "${stageFieldSummary.courseField.label || stageFieldSummary.courseField.key}"`
                          : '→ add a column named "Course"'}
                      </li>
                      <li>
                        <span className="font-semibold">Branch</span>{' '}
                        {stageFieldSummary?.branchField
                          ? `→ matches form field "${stageFieldSummary.branchField.label || stageFieldSummary.branchField.key}"`
                          : '→ add a column named "Branch"'}
                      </li>
                      <li>
                        <span className="font-semibold">Current Academic Year</span>{' '}
                        {stageFieldSummary?.yearField
                          ? `→ matches form field "${stageFieldSummary.yearField.label || stageFieldSummary.yearField.key}"`
                          : '→ add a column named "Current Academic Year"'}
                      </li>
                      <li>
                        <span className="font-semibold">Current Semester</span>{' '}
                        {stageFieldSummary?.semesterField
                          ? `→ matches form field "${stageFieldSummary.semesterField.label || stageFieldSummary.semesterField.key}"`
                          : '→ add a column named "Current Semester"'}
                      </li>
                    </ul>
                    <p className="text-xs text-indigo-600 mt-2">
                      These columns ensure that each uploaded student is grouped under the correct course & branch and is placed in the right academic stage.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* File Upload */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Upload CSV File *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-500 transition-colors">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                  disabled={!selectedForm || !selectedCollegeId}
                />
                <label
                  htmlFor="csv-upload"
                  className={`cursor-pointer ${!selectedForm || !selectedCollegeId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-sm text-gray-600 mb-1">
                    {file ? file.name : 'Click to upload CSV or Excel file'}
                  </p>
                  <p className="text-xs text-gray-500">CSV or Excel files only</p>
                </label>
              </div>
            </div>

            {previewData && (
              <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">Upload Preview</h4>
                      <p className="text-xs text-gray-600">
                        Review valid and invalid student records before committing them to the master database.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-green-700 font-semibold flex items-center gap-1">
                        <CheckCircle size={14} />
                        {previewData.summary?.validCount || 0} valid
                      </span>
                      <span className="text-xs text-red-700 font-semibold flex items-center gap-1">
                        <AlertCircle size={14} />
                        {previewData.summary?.invalidCount || 0} invalid
                      </span>
                      {previewData.invalidRecords?.length > 0 && (
                        <button
                          onClick={() => setShowAllErrors(!showAllErrors)}
                          className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                        >
                          <AlertCircle size={12} />
                          {showAllErrors ? 'Hide' : 'Show'} All Errors
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {showAllErrors && previewData.invalidRecords?.length > 0 && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                        <AlertCircle size={16} />
                        All Invalid Records ({previewData.invalidRecords.length})
                      </h5>
                      <button
                        onClick={() => setShowAllErrors(false)}
                        className="text-xs text-red-700 hover:text-red-900"
                      >
                        Close
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh]">
                      <table className="min-w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-red-200 z-10">
                          <tr className="text-left text-red-800 uppercase tracking-wide">
                            <th className="px-2 py-1.5 border border-red-300 font-semibold">Row</th>
                            <th className="px-2 py-1.5 border border-red-300 font-semibold">Admission #</th>
                            <th className="px-2 py-1.5 border border-red-300 font-semibold">Name</th>
                            {allColumns.slice(0, 10).map((col) => (
                              <th key={col} className="px-2 py-1.5 border border-red-300 font-semibold whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                            <th className="px-2 py-1.5 border border-red-300 font-semibold">Issues</th>
                          </tr>
                        </thead>
                        <tbody className="text-red-900">
                          {previewData.invalidRecords.map((record) => (
                            <tr key={`invalid-all-${record.rowNumber}`} className="border-t border-red-200 hover:bg-red-100">
                              <td className="px-2 py-1.5 border border-red-200 font-medium">{record.rowNumber}</td>
                              <td className="px-2 py-1.5 border border-red-200">{record.sanitizedData?.admission_number || '-'}</td>
                              <td className="px-2 py-1.5 border border-red-200">{record.sanitizedData?.student_name || '-'}</td>
                              {allColumns.slice(0, 10).map((col) => (
                                <td key={col} className="px-2 py-1.5 border border-red-200 whitespace-nowrap">
                                  {record.rawData?.[col] || record.sanitizedData?.[col] || '-'}
                                </td>
                              ))}
                              <td className="px-2 py-1.5 border border-red-200">
                                <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                                  {record.issues.map((issue, idx) => (
                                    <li key={idx}>{issue}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!showAllErrors && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-semibold text-green-800 flex items-center gap-1">
                          <CheckCircle size={14} />
                          Valid Students
                        </h5>
                        <span className="text-xs text-green-700">
                          {previewData.summary?.validCount || 0} ready
                        </span>
                      </div>
                      {previewData.validRecords?.length > 0 ? (
                        <>
                          <div className="overflow-x-auto max-h-[50vh]">
                            <table className="min-w-full text-xs border-collapse">
                              <thead className="sticky top-0 bg-green-200 z-10">
                                <tr className="text-left text-green-800 uppercase tracking-wide">
                                  <th className="px-2 py-1 border border-green-300 font-semibold">Row</th>
                                  {allColumns.map((col) => (
                                    <th key={col} className="px-2 py-1 border border-green-300 font-semibold whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="text-green-900">
                                {paginatedValidRecords.map((record) => (
                                  <tr key={`valid-${record.rowNumber}`} className="border-t border-green-200 hover:bg-green-100">
                                    <td className="px-2 py-1 border border-green-200 font-medium">{record.rowNumber}</td>
                                    {allColumns.map((col) => (
                                      <td key={col} className="px-2 py-1 border border-green-200 whitespace-nowrap">
                                        {record.rawData?.[col] || record.sanitizedData?.[col] || '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {validRecordsTotalPages > 1 && (
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-200">
                              <button
                                onClick={() => setValidRecordsPage(p => Math.max(1, p - 1))}
                                disabled={validRecordsPage === 1}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                <ChevronLeft size={12} />
                                Previous
                              </button>
                              <span className="text-xs text-green-700">
                                Page {validRecordsPage} of {validRecordsTotalPages} ({previewData.validRecords.length} total)
                              </span>
                              <button
                                onClick={() => setValidRecordsPage(p => Math.min(validRecordsTotalPages, p + 1))}
                                disabled={validRecordsPage === validRecordsTotalPages}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                Next
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-green-700">No valid records detected.</p>
                      )}
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-semibold text-red-800 flex items-center gap-1">
                          <AlertCircle size={14} />
                          Invalid Students
                        </h5>
                        <span className="text-xs text-red-700">
                          {previewData.summary?.invalidCount || 0} need attention
                        </span>
                      </div>
                      {previewData.invalidRecords?.length > 0 ? (
                        <>
                          <div className="overflow-x-auto max-h-[50vh]">
                            <table className="min-w-full text-xs border-collapse">
                              <thead className="sticky top-0 bg-red-200 z-10">
                                <tr className="text-left text-red-800 uppercase tracking-wide">
                                  <th className="px-2 py-1 border border-red-300 font-semibold">Row</th>
                                  <th className="px-2 py-1 border border-red-300 font-semibold">Admission #</th>
                                  <th className="px-2 py-1 border border-red-300 font-semibold">Name</th>
                                  {allColumns.slice(0, 5).map((col) => (
                                    <th key={col} className="px-2 py-1 border border-red-300 font-semibold whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                  <th className="px-2 py-1 border border-red-300 font-semibold">Issues</th>
                                </tr>
                              </thead>
                              <tbody className="text-red-900">
                                {paginatedInvalidRecords.map((record) => (
                                  <tr key={`invalid-${record.rowNumber}`} className="border-t border-red-200 hover:bg-red-100 align-top">
                                    <td className="px-2 py-1 border border-red-200 font-medium">{record.rowNumber}</td>
                                    <td className="px-2 py-1 border border-red-200">{record.sanitizedData?.admission_number || '-'}</td>
                                    <td className="px-2 py-1 border border-red-200">{record.sanitizedData?.student_name || '-'}</td>
                                    {allColumns.slice(0, 5).map((col) => (
                                      <td key={col} className="px-2 py-1 border border-red-200 whitespace-nowrap">
                                        {record.rawData?.[col] || record.sanitizedData?.[col] || '-'}
                                      </td>
                                    ))}
                                    <td className="px-2 py-1 border border-red-200">
                                      <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                                        {record.issues.map((issue, idx) => (
                                          <li key={idx}>{issue}</li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {invalidRecordsTotalPages > 1 && (
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-red-200">
                              <button
                                onClick={() => setInvalidRecordsPage(p => Math.max(1, p - 1))}
                                disabled={invalidRecordsPage === 1}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                <ChevronLeft size={12} />
                                Previous
                              </button>
                              <span className="text-xs text-red-700">
                                Page {invalidRecordsPage} of {invalidRecordsTotalPages} ({previewData.invalidRecords.length} total)
                              </span>
                              <button
                                onClick={() => setInvalidRecordsPage(p => Math.min(invalidRecordsTotalPages, p + 1))}
                                disabled={invalidRecordsPage === invalidRecordsTotalPages}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                Next
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-red-700">Great! No invalid records detected.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upload Progress Indicator */}
            {uploading && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <LoadingAnimation
                      width={32}
                      height={32}
                      variant="minimal"
                      showMessage={false}
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-blue-800 mb-2">Processing Upload...</h4>
                    <p className="text-sm text-blue-700">
                      {uploadProgress || 'Please wait while we process your data...'}
                    </p>
                    <div className="mt-3 w-full bg-blue-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Recovery Actions */}
            {uploadResult && !uploadResult.success && (uploadResult.failedCount > 0 || uploadResult.duplicateCount > 0 || uploadResult.missingFieldCount > 0) && (
              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h6 className="text-sm font-semibold text-yellow-800 mb-3">Suggested Actions</h6>
                <div className="flex flex-wrap gap-2">
                  {uploadResult.duplicateCount > 0 && (
                    <button className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm flex items-center gap-2">
                      <AlertCircle size={16} />
                      Review Duplicates
                    </button>
                  )}
                  {uploadResult.missingFieldCount > 0 && (
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2">
                      <Upload size={16} />
                      Fix Missing Fields
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {uploadResult && (
              <div
                className={`border rounded-xl p-6 ${uploadResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${uploadResult.success ? 'bg-green-100' : 'bg-red-100'
                      }`}
                  >
                    {uploadResult.success ? (
                      <CheckCircle className="text-green-600" size={24} />
                    ) : (
                      <AlertCircle className="text-red-600" size={24} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4
                      className={`text-lg font-semibold ${uploadResult.success ? 'text-green-800' : 'text-red-800'
                        }`}
                    >
                      {uploadResult.success ? 'Upload Completed' : 'Upload Failed'}
                    </h4>
                    <p className="text-sm text-gray-700 mt-1">
                      {uploadResult.message || 'No additional information provided.'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                      <div className="bg-white rounded-lg border border-green-200 p-4 text-center shadow-sm">
                        <div className="text-2xl font-bold text-green-600">
                          {uploadResult.successCount ?? 0}
                        </div>
                        <div className="text-sm text-gray-600">Uploaded</div>
                      </div>
                      <div className="bg-white rounded-lg border border-yellow-200 p-4 text-center shadow-sm">
                        <div className="text-2xl font-bold text-yellow-600">
                          {uploadResult.skippedCount ?? uploadResult.failedCount ?? 0}
                        </div>
                        <div className="text-sm text-gray-600">Skipped</div>
                      </div>
                      {previewData?.summary && (
                        <div className="bg-white rounded-lg border border-blue-200 p-4 text-center shadow-sm">
                          <div className="text-2xl font-bold text-blue-600">
                            {previewData.summary.invalidCount || 0}
                          </div>
                          <div className="text-sm text-gray-600">Invalid in Preview</div>
                        </div>
                      )}
                    </div>

                    {Array.isArray(uploadResult.details?.failures) &&
                      uploadResult.details.failures.length > 0 && (
                        <div className="mt-4">
                          <h5 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                            <AlertCircle size={16} />
                            Records not uploaded
                          </h5>
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {uploadResult.details.failures.slice(0, 10).map((failure, idx) => (
                              <div
                                key={idx}
                                className="bg-red-100 border border-red-200 rounded-lg p-3 text-sm text-red-800"
                              >
                                <div className="font-semibold">
                                  Row {failure.rowNumber || '-'}
                                </div>
                                <div>Admission #: {failure.admissionNumber || 'N/A'}</div>
                                {Array.isArray(failure.errors) && failure.errors.length > 0 && (
                                  <ul className="list-disc list-inside mt-1 space-y-1">
                                    {failure.errors.map((err, errIdx) => (
                                      <li key={errIdx}>{err}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                            {uploadResult.details.failures.length > 10 && (
                              <p className="text-xs text-red-700">
                                Showing first 10 of {uploadResult.details.failures.length} skipped records.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 pt-3">
              <button
                onClick={handleUpload}
                disabled={!selectedForm || !file || !selectedCollegeId || uploading}
                className="w-full md:flex-1 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs font-semibold shadow-lg"
              >
                {uploading ? (
                  <>
                    <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                    <div className="flex flex-col items-start">
                      <span className="text-xs">Generating Preview...</span>
                      {uploadProgress && (
                        <span className="text-[10px] opacity-90">{uploadProgress}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {previewData ? 'Regenerate Preview' : 'Generate Preview'}
                  </>
                )}
              </button>

              {previewData?.validRecords?.length > 0 && (
                <button
                  onClick={handleConfirmUpload}
                  disabled={confirmingUpload}
                  className="w-full md:flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs font-semibold shadow-lg"
                >
                  {confirmingUpload ? (
                    <>
                      <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      Confirm Upload ({previewData.summary?.validCount || 0})
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleClose}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;

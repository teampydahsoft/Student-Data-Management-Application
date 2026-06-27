import React, { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet, FileText, Search, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const RegistrationDownloadModal = ({ isOpen, onClose, initialFilters = {}, filterOptions = {} }) => {
    const [localFilters, setLocalFilters] = useState(initialFilters);
    const [previewData, setPreviewData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLocalFilters(initialFilters);
            setPreviewData([]);
        }
    }, [isOpen, initialFilters]);

    // Handle local filter changes
    const handleFilterChange = (field, value) => {
        setLocalFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handlePreview = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            // Add all active filters (backend expects filter_scholarship_status for scholarship)
            Object.entries(localFilters).forEach(([key, value]) => {
                if (value) {
                    if (key === 'scholarshipStatus') params.append('filter_scholarship_status', value);
                    else params.append(`filter_${key}`, value);
                }
            });
            params.append('limit', 5); // Fetch only 5 for preview
            params.append('page', 1);

            const response = await api.get(`/students/reports/registration/abstract?${params.toString()}`);
            if (response.data?.success) {
                setPreviewData(response.data.data || []);
                toast.success('Preview loaded successfully');
            } else {
                throw new Error(response.data?.message || 'Failed to load preview');
            }
        } catch (error) {
            console.error('Preview error:', error);
            toast.error('Failed to load preview data');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (format) => {
        setDownloading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(localFilters).forEach(([key, value]) => {
                if (value) {
                    if (key === 'scholarshipStatus') params.append('filter_scholarship_status', value);
                    else params.append(`filter_${key}`, value);
                }
            });
            params.append('format', format);

            if (format === 'excel') {
                const response = await api.get(`/students/reports/registration/export?${params.toString()}`, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `registration_abstract_report_${new Date().toISOString().split('T')[0]}.xlsx`);
                document.body.appendChild(link);
                link.click();
                link.remove();
            } else if (format === 'pdf') {
                const response = await api.get(`/students/reports/registration/export?${params.toString()}&type=pdf`, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `registration_abstract_report_${new Date().toISOString().split('T')[0]}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
            }

            toast.success(`${format.toUpperCase()} report downloaded successfully`);
            onClose();
        } catch (error) {
            console.error('Download error:', error);
            toast.error(`Failed to download ${format.toUpperCase()} report`);
        } finally {
            setDownloading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Download Registration Report</h2>
                        <p className="text-sm text-gray-500">Select filters and format to download (Abstract Summary)</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                {/* content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Filters Grid */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <Search size={16} /> Filter Selection
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {/* College */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">College</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.college || ''}
                                    onChange={(e) => handleFilterChange('college', e.target.value)}
                                >
                                    <option value="">All Colleges</option>
                                    {[...new Set(filterOptions.colleges || [])].map(opt => <option key={`reg-col-${opt}`} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            {/* Batch */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Batch</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.batch || ''}
                                    onChange={(e) => handleFilterChange('batch', e.target.value)}
                                >
                                    <option value="">All Batches</option>
                                    {[...new Set(filterOptions.batches || [])].map(opt => <option key={`reg-batch-${opt}`} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            {/* Program */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Program</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.course || ''}
                                    onChange={(e) => handleFilterChange('course', e.target.value)}
                                >
                                    <option value="">All Programs</option>
                                    {[...new Set(filterOptions.courses || [])].map(opt => <option key={`reg-course-${opt}`} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            {/* Branch */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Branch</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.branch || ''}
                                    onChange={(e) => handleFilterChange('branch', e.target.value)}
                                >
                                    <option value="">All Branches</option>
                                    {[...new Set(filterOptions.branches || [])].map(opt => <option key={`reg-branch-${opt}`} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            {/* Year */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Year</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.year || ''}
                                    onChange={(e) => handleFilterChange('year', e.target.value)}
                                >
                                    <option value="">All Years</option>
                                    {[1, 2, 3, 4].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            {/* Semester */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Semester</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.semester || ''}
                                    onChange={(e) => handleFilterChange('semester', e.target.value)}
                                >
                                    <option value="">All Semesters</option>
                                    {[1, 2].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            {/* Scholarship Status */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 uppercase">Scholarship</label>
                                <select
                                    className="w-full text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={localFilters.scholarshipStatus || ''}
                                    onChange={(e) => handleFilterChange('scholarshipStatus', e.target.value)}
                                >
                                    <option value="">All Scholarship</option>
                                    <option value="pending">Pending (empty)</option>
                                    <option value="eligible">Eligible</option>
                                    <option value="not_eligible">Not eligible</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handlePreview}
                                disabled={loading}
                                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors border border-blue-200"
                            >
                                {loading ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Search size={16} />}
                                Generate Preview (Abstract)
                            </button>
                        </div>
                    </div>

                    {/* Preview Table */}
                    {previewData.length > 0 ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Preview (First 5 records)</h3>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-gray-500">{previewData.length} records shown</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 whitespace-nowrap">Batch</th>
                                            <th className="px-4 py-3 whitespace-nowrap">College</th>
                                            <th className="px-4 py-3 whitespace-nowrap">Program</th>
                                            <th className="px-4 py-3 whitespace-nowrap">Branch</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center">Year</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center">Sem</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center">Total</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center">Completed</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center">Pending</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center text-xs">Verification</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center text-xs">Certificates</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center text-xs">Fees</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center text-xs">Promotion</th>
                                            <th className="px-4 py-3 whitespace-nowrap text-center text-xs">Scholarship</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {previewData.map((row, idx) => {
                                            const total = parseInt(row.total || 0);
                                            const completed = parseInt(row.overall_completed || 0);
                                            const pending = total - completed;

                                            // Ensure limit to 5 if API returns more
                                            if (idx >= 5) return null;

                                            return (
                                                <tr key={`${row.batch}-${row.college}-${row.course}-${row.branch}-${row.current_year}-${row.current_semester}-${idx}`} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3 text-gray-900">{row.batch || '-'}</td>
                                                    <td className="px-4 py-3 text-gray-700">{row.college || '-'}</td>
                                                    <td className="px-4 py-3 text-gray-900 font-medium">{row.course || '-'}</td>
                                                    <td className="px-4 py-3 text-gray-700">{row.branch || '-'}</td>
                                                    <td className="px-4 py-3 text-center text-gray-600">{row.current_year}</td>
                                                    <td className="px-4 py-3 text-center text-gray-600">{row.current_semester}</td>
                                                    <td className="px-4 py-3 text-center font-semibold">{total}</td>
                                                    <td className="px-4 py-3 text-center text-green-600 font-medium">{completed}</td>
                                                    <td className="px-4 py-3 text-center text-red-500 font-medium">{pending}</td>

                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{row.verification_completed}/{total - row.verification_completed}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{row.certificates_verified}/{total - row.certificates_verified}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{row.fee_cleared}/{total - row.fee_cleared}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{row.promotion_completed}/{total - row.promotion_completed}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{row.scholarship_assigned}/{row.scholarship_pending ?? (total - row.scholarship_assigned)}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                            <div className="bg-white p-3 rounded-full border border-gray-100 shadow-sm mb-3">
                                <Search className="text-gray-400" size={24} />
                            </div>
                            <p className="text-gray-500 font-medium">No preview data generated</p>
                            <p className="text-gray-400 text-sm mt-1">Select filters and click "Generate Preview" to see data</p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                        <AlertCircle size={14} className="text-blue-500" />
                        <span>Export will include all records matching selected filters</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleDownload('excel')}
                            disabled={downloading || previewData.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-medium"
                        >
                            <FileSpreadsheet size={18} />
                            Download Excel
                        </button>
                        <button
                            onClick={() => handleDownload('pdf')}
                            disabled={downloading || previewData.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-medium"
                        >
                            <FileText size={18} />
                            Download PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegistrationDownloadModal;

import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';

const RejoinModal = ({ isOpen, onClose, student, onRejoinComplete }) => {
    const [loading, setLoading] = useState(false);
    const [batches, setBatches] = useState([]);
    const [batchesLoading, setBatchesLoading] = useState(true);
    const [rejoinData, setRejoinData] = useState({
        fromBatch: student?.batch || '',
        toBatch: '',
        remarks: ''
    });

    // Load available batches
    useEffect(() => {
        if (!isOpen) return;

        const loadBatches = async () => {
            try {
                setBatchesLoading(true);
                const response = await api.get('/announcements/batches');
                if (response.data.success) {
                    setBatches(response.data.data || []);
                    // Set the current batch as fromBatch
                    setRejoinData(prev => ({
                        ...prev,
                        fromBatch: student?.batch || ''
                    }));
                }
            } catch (error) {
                console.error('Failed to load batches:', error);
                toast.error('Failed to load batches');
            } finally {
                setBatchesLoading(false);
            }
        };

        loadBatches();
    }, [isOpen, student]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!rejoinData.toBatch) {
            toast.error('Please select the batch to rejoin');
            return;
        }

        if (!rejoinData.remarks || !rejoinData.remarks.trim()) {
            toast.error('Please provide remarks for rejoining');
            return;
        }

        if (rejoinData.fromBatch === rejoinData.toBatch) {
            toast.error('Student is already in the selected batch');
            return;
        }

        try {
            setLoading(true);

            const response = await api.post(`/students/${student.admission_number}/rejoin`, {
                fromBatch: rejoinData.fromBatch,
                toBatch: rejoinData.toBatch,
                remarks: rejoinData.remarks
            });

            if (response.data.success) {
                toast.success(`Student rejoined successfully from ${rejoinData.fromBatch} to ${rejoinData.toBatch}`);

                if (onRejoinComplete) {
                    onRejoinComplete(response.data.data);
                }

                handleClose();
            } else {
                toast.error(response.data.message || 'Failed to process rejoin');
            }
        } catch (error) {
            console.error('Error processing rejoin:', error);
            toast.error(error.response?.data?.message || 'Failed to process rejoin');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRejoinData({
            fromBatch: student?.batch || '',
            toBatch: '',
            remarks: ''
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-screen">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg">
                                <RefreshCw size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Student Rejoin</h3>
                                <p className="text-blue-100 text-sm mt-1">
                                    {student?.student_name || 'Student'} - {student?.admission_number}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                            disabled={loading}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
                    {/* Info Banner */}
                    <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg px-4 py-3 flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-semibold text-amber-900">Important Information</p>
                            <p className="text-xs text-amber-700 mt-1">
                                The student will be moved to the selected batch and their status will be changed to "Regular (Rejoined)".
                                This action will be recorded in the student's history.
                            </p>
                        </div>
                    </div>

                    {/* Current Batch (Read-only) */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Current Batch (From)
                        </label>
                        <div className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-medium">
                            {rejoinData.fromBatch || 'Not Set'}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            The batch the student is currently in
                        </p>
                    </div>

                    {/* New Batch Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Rejoin to Batch <span className="text-red-500">*</span>
                        </label>
                        {batchesLoading ? (
                            <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
                                Loading batches...
                            </div>
                        ) : (
                            <select
                                value={rejoinData.toBatch}
                                onChange={(e) => setRejoinData(prev => ({ ...prev, toBatch: e.target.value }))}
                                required
                                disabled={loading}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            >
                                <option value="">Select Batch to Rejoin</option>
                                {batches.map((batch, idx) => (
                                    <option key={batch.id || idx} value={batch.name}>
                                        {batch.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Select the batch the student will rejoin
                        </p>
                    </div>

                    {/* Remarks */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Remarks <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={rejoinData.remarks}
                            onChange={(e) => setRejoinData(prev => ({ ...prev, remarks: e.target.value }))}
                            placeholder="Enter the reason for rejoining (e.g., Rejoined after medical leave, Rejoined after financial issues resolved, etc.)"
                            rows="4"
                            required
                            disabled={loading}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {rejoinData.remarks.length} characters
                        </p>
                    </div>

                    {/* Summary */}
                    {rejoinData.toBatch && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-blue-900 mb-2">Rejoin Summary</h4>
                            <div className="space-y-1 text-sm text-blue-800">
                                <p>
                                    <span className="font-medium">Student:</span> {student?.student_name}
                                </p>
                                <p>
                                    <span className="font-medium">Admission Number:</span> {student?.admission_number}
                                </p>
                                <p>
                                    <span className="font-medium">Batch Change:</span> {rejoinData.fromBatch} → {rejoinData.toBatch}
                                </p>
                                <p>
                                    <span className="font-medium">New Status:</span> Regular (Rejoined)
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t border-gray-200 shrink-0 mt-4 pb-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-6 py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold shadow-lg hover:from-blue-700 hover:to-indigo-800 transition-all transform hover:scale-105 active:scale-95 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                            disabled={loading || !rejoinData.toBatch || !rejoinData.remarks}
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="animate-spin" size={16} />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Confirm Rejoin
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RejoinModal;

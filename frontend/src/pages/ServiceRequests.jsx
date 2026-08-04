import React, { useEffect, useState } from 'react';
import { serviceService } from '../services/serviceService';
import { toast } from 'react-hot-toast';
import { Clock, CheckCircle, AlertCircle, Calendar, Filter, MessageSquare, ArrowRight, Download, CreditCard, Printer, X, Plus } from 'lucide-react';
import api from '../config/api';

const ServiceRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');

    // Action State
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionType, setActionType] = useState(null); // 'ready', 'close', 'edit_student', 'create_request'
    const [actionData, setActionData] = useState({ collect_date: '', admin_note: '' });
    const [previewUrl, setPreviewUrl] = useState(null);
    const [editingStudent, setEditingStudent] = useState(null);
    const [studentForm, setStudentForm] = useState({});

    // Create Request State
    const [services, setServices] = useState([]);
    const [createForm, setCreateForm] = useState({});

    // Define Schemas for each Template Type
    // This defines EXACTLY what blanks are shown to the user based on the backend templates
    const TEMPLATE_SCHEMAS = {
        study_certificate: [
            {
                section: 'Student Details', fields: [
                    { name: 'admission_number', label: 'Admission Number', type: 'text', required: true, autoFocus: true, placeholder: 'Enter & Tab' },
                    { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                    { name: 'father_name', label: 'Father\'s Name', type: 'text', required: true }, // Used as S/o, D/o
                ]
            },
            {
                section: 'Academic Details', fields: [
                    { name: 'course', label: 'Program', type: 'text', placeholder: 'e.g. B.Tech' },
                    { name: 'branch', label: 'Branch', type: 'text', placeholder: 'e.g. CSE' },
                    { name: 'current_year', label: 'Year', type: 'number', className: 'w-1/2' },
                    { name: 'current_semester', label: 'Semester', type: 'number', className: 'w-1/2' },
                    { name: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-2025' } // Crucial for Study Cert
                ]
            },
            {
                section: 'Certificate Details', fields: [
                    { name: 'purpose', label: 'Purpose', type: 'text', required: true, placeholder: 'e.g. Scholarship Application' }
                ]
            }
        ],
        custodian_certificate: [
            {
                section: 'Student Details', fields: [
                    { name: 'admission_number', label: 'Admission Number', type: 'text', required: true, autoFocus: true, placeholder: 'Enter & Tab' },
                    { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                    { name: 'father_name', label: 'Father\'s Name', type: 'text', required: true }, // Used as S/o
                ]
            },
            {
                section: 'Academic Details', fields: [
                    { name: 'course', label: 'Course', type: 'text', required: true, placeholder: 'e.g. B.Tech' },
                    { name: 'branch', label: 'Branch', type: 'text', required: true, placeholder: 'e.g. CSE' }
                ]
            },
            {
                section: 'Certificate Details', fields: [
                    { name: 'custody_list', label: 'Certificates in Custody', type: 'textarea', required: true, placeholder: 'e.g. S.S.C, Intermediate, Transfer Certificate' },
                    { name: 'purpose', label: 'Purpose', type: 'text', required: true, placeholder: 'e.g. Verification' }
                ]
            }
        ],
        refund_application: [
            {
                section: 'Student Details', fields: [
                    { name: 'admission_number', label: 'Admission Number', type: 'text', required: true, autoFocus: true, placeholder: 'Enter & Tab' },
                    { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                    // Father name not explicitly used in Refund App top block, but good for record.
                    { name: 'father_name', label: 'Father\'s Name', type: 'text' },
                ]
            },
            {
                section: 'Academic Details', fields: [
                    { name: 'course', label: 'Program', type: 'text', placeholder: 'e.g. B.Tech' },
                    { name: 'branch', label: 'Branch', type: 'text', placeholder: 'e.g. CSE' },
                    { name: 'current_year', label: 'Year', type: 'number', className: 'w-1/2' },
                    { name: 'current_semester', label: 'Semester', type: 'number', className: 'w-1/2' },
                ]
            },
            {
                section: 'Refund Details', fields: [
                    { name: 'reason', label: 'Reason for Refund', type: 'text', required: true, placeholder: 'e.g. Discontinued course' },
                    { name: 'excess_amount', label: 'Excess Amount (Rs.)', type: 'text', required: true, placeholder: 'e.g. 5000' },
                    { name: 'amount_in_words', label: 'Amount in Words', type: 'text', required: true, placeholder: 'e.g. Five Thousand Only' }
                ]
            }
        ],
        // Default Fallback
        default: [
            {
                section: 'Request Details', fields: [
                    { name: 'admission_number', label: 'Admission Number', type: 'text', required: true, autoFocus: true },
                    { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                    { name: 'father_name', label: 'Father\'s Name', type: 'text' },
                    { name: 'purpose', label: 'Purpose/Note', type: 'text' }
                ]
            }
        ]
    };

    // Helper to determine dynamic fields based on service type
    const getTemplateFields = (serviceId) => {
        if (!serviceId) return [];
        const service = services.find(s => s.id == serviceId);
        if (!service) return TEMPLATE_SCHEMAS.default;

        // 1. check for admin_fields from DB
        if (service.admin_fields && Array.isArray(service.admin_fields) && service.admin_fields.length > 0) {
            // If DB provides fields, we wrap them in a generic schema
            return [{
                section: 'Details',
                fields: [
                    { name: 'admission_number', label: 'Admission Number', type: 'text', required: true },
                    { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                    ...service.admin_fields // Mix in the configured fields
                ]
            }];
        }

        // 2. heuristic matching
        const name = (service.name || '').toLowerCase();
        const type = service.template_type || '';

        if (type === 'study_certificate' || name.includes('study')) return TEMPLATE_SCHEMAS.study_certificate;
        if (type === 'custodian_certificate' || name.includes('custodian')) return TEMPLATE_SCHEMAS.custodian_certificate;
        if (type === 'refund_application' || name.includes('refund')) return TEMPLATE_SCHEMAS.refund_application;

        return TEMPLATE_SCHEMAS.default;
    };

    // Auto-fill helper (optional, non-blocking)
    const handleAdmissionBlur = async () => {
        if (!createForm.admission_number) return;
        try {
            const response = await api.get(`/students/${createForm.admission_number}`);
            if (response.data && response.data.data) {
                const s = response.data.data;
                // Merge found data into form, preserving existing inputs if user typed them
                setCreateForm(prev => ({
                    ...prev,
                    student_name: s.student_name || prev.student_name || '',
                    father_name: s.father_name || prev.father_name || '',
                    course: s.course || prev.course || '',
                    branch: s.branch || prev.branch || '',
                    current_year: s.current_year || prev.current_year || '',
                    current_semester: s.current_semester || prev.current_semester || '',
                    academic_year: s.academic_year || prev.academic_year || '', // Try to fill if exists
                    gender: s.gender || prev.gender || '', // Keep hidden fields just in case
                }));
                console.log('Student loaded:', s);
            }
        } catch (e) {
            // No error if not found, just let them type
        }
    };

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const response = await serviceService.getRequests({ status: filterStatus });
            setRequests(response.data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    const fetchServices = async () => {
        try {
            const res = await serviceService.getAllServices();
            setServices(res.data || []);
        } catch (error) {
            console.error(error);
        }
    }

    useEffect(() => {
        fetchRequests();
        fetchServices();
    }, [filterStatus]);

    const handleUpdateStatus = async () => {
        try {
            if (actionType === 'ready') {
                if (!actionData.collect_date || !actionData.admin_note) {
                    toast.error('Please provide collect date and notification note');
                    return;
                }
                await serviceService.updateRequestStatus(selectedRequest.id, {
                    status: 'ready_to_collect',
                    ...actionData
                });
                toast.success('Request marked as Ready to Collect');
            } else if (actionType === 'close') {
                await serviceService.updateRequestStatus(selectedRequest.id, {
                    status: 'closed'
                });
                toast.success('Request Closed');
            } else if (actionType === 'processing') {
                await serviceService.updateRequestStatus(selectedRequest.id, {
                    status: 'processing'
                });
                toast.success('Request marked as Processing');
            }

            setSelectedRequest(null);
            setActionType(null);
            setActionData({ collect_date: '', admin_note: '' });
            fetchRequests();
        } catch (error) {
            console.error(error);
            toast.error('Update failed');
        }
    };

    const openActionModal = (req, type) => {
        setSelectedRequest(req);
        setActionType(type);
        // Pre-fill text for convenience
        if (type === 'ready') {
            setActionData({
                collect_date: new Date().toISOString().split('T')[0],
                admin_note: `Your ${req.service_name} is ready. Please collect it from the admin office.`
            });
        }
    };

    const handlePayment = async (request) => {
        if (!window.confirm(`Mark payment of ₹${request.service_price} as received?`)) return;

        try {
            await serviceService.processPayment(request.id);
            toast.success('Payment marked as received');
            fetchRequests();
        } catch (error) {
            console.error(error);
            toast.error('Payment update failed');
        }
    };

    // New Flow: 1. Click Print -> 2. Fetch Student -> 3. Show Edit Modal -> 4. Update -> 5. Generate
    const handleVerifyAndPrint = async (request) => {
        try {
            const toastId = toast.loading('Fetching details...');
            // Fetch student based on admission number key in the request or student_id
            const response = await api.get(`/students/${request.admission_number}`);

            toast.dismiss(toastId);

            if (response.data && response.data.data) {
                const student = response.data.data;
                setEditingStudent(student);
                // Initialize form with student data 
                setStudentForm({
                    student_name: student.student_name || '',
                    father_name: student.father_name || '',
                    dob: student.dob ? new Date(student.dob).toISOString().split('T')[0] : '',
                    gender: student.gender || '',
                    caste: student.caste || '',
                    student_mobile: student.student_mobile || '',
                    course: student.course || '',
                    branch: student.branch || '',
                    current_year: student.current_year || '',
                    current_semester: student.current_semester || '',
                    student_address: student.student_address || '',
                    admission_number: student.admission_number,
                    academic_year: student.academic_year || ''
                });
                setSelectedRequest(request);
                setActionType('edit_student'); // Open the edit modal
            } else {
                toast.error('Student details not found');
            }
        } catch (error) {
            console.error(error);
            toast.dismiss();
            toast.error('Failed to fetch student details. They may have been deleted.');
        }
    };

    const handleUpdateStudentAndPrint = async () => {
        try {
            const toastId = toast.loading('Updating student info...');

            // Update student
            await api.put(`/students/${studentForm.admission_number}`, studentForm);

            toast.dismiss(toastId);
            toast.success('Student updated');

            // Close edit modal
            setEditingStudent(null);
            setActionType(null);

            // Proceed to print
            await generatePreview(selectedRequest);

        } catch (error) {
            console.error(error);
            toast.dismiss();
            toast.error('Update failed');
        }
    };

    const generatePreview = async (request) => {
        try {
            const toastId = toast.loading('Generating preview...');
            const response = await api.get(`/services/requests/${request.id}/download`, {
                responseType: 'blob'
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            setPreviewUrl(url); // Set preview URL to open modal

            toast.dismiss(toastId);
        } catch (error) {
            console.error(error);
            toast.error('Preview failed. Check if payment is cleared.');
        }
    };

    // Helper to just print if user skips editing
    const handleDirectPrint = (request) => {
        generatePreview(request);
    };

    const handleCreateRequest = async (e) => {
        e.preventDefault();
        // Basic validation: Service ID, Admission No, and Student Name are bare minimum
        if (!createForm.service_id || !createForm.admission_number || !createForm.student_name) {
            toast.error('Service, Admission Number and Student Name are required');
            return;
        }

        try {
            const res = await serviceService.createRequestByAdmin({
                ...createForm
            });

            toast.success('Service Created & Paid');

            setCreateForm({});

            setActionType(null);
            fetchRequests();

            // Immediately trigger verify & print
            const mockRequest = {
                id: res.requestId,
                admission_number: res.student?.admission_number || createForm.admission_number,
                student_name: res.student_name,
                service_id: createForm.service_id,
                service_name: res.service_name || 'Service',
                status: 'pending',
                payment_status: 'paid',
                request_data: {} // Data is already in DB, verify fetch will pull student data
            };

            // Small delay to allow DB commit
            setTimeout(() => handleVerifyAndPrint(mockRequest), 500);

        } catch (error) {
            console.error(error);
            toast.error('Failed to create request');
        }
    }

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-yellow-100 text-yellow-800',
            processing: 'bg-blue-100 text-blue-800',
            ready_to_collect: 'bg-purple-100 text-purple-800',
            closed: 'bg-green-100 text-green-800',
            rejected: 'bg-red-100 text-red-800'
        };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${styles[status] || 'bg-gray-100'}`}>
                {status.replace(/_/g, ' ')}
            </span>
        );
    };

    return (
        <div className="p-6 space-y-6 animate-fade-in relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Service Requests</h1>
                    <p className="text-gray-500">Manage student service requests</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setActionType('create_request')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium shadow-sm"
                    >
                        <Plus size={18} /> Issue Service
                    </button>

                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200">
                        <Filter size={16} className="text-gray-400 ml-2" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-transparent border-none text-sm font-medium focus:ring-0 text-gray-700 py-1"
                        >
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="ready_to_collect">Ready to Collect</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Request Info</th>
                                <th className="px-6 py-4">Student</th>
                                <th className="px-6 py-4">Mobile</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Payment</th>
                                <th className="px-6 py-4">Dates</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="5" className="p-8 text-center">Loading...</td></tr>
                            ) : requests.length === 0 ? (
                                <tr><td colSpan="5" className="p-8 text-center text-gray-500">No requests found</td></tr>
                            ) : (
                                requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900">{req.service_name}</span>
                                                <span className="text-xs text-gray-500">ID: #{req.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-900">{req.student_name}</span>
                                                <span className="text-xs text-gray-500">{req.admission_number} | {req.course}-{req.branch}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {req.student_mobile || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${req.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                {req.payment_status || 'pending'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            <div>Req: {new Date(req.request_date).toLocaleDateString()}</div>
                                            {req.collect_date && (
                                                <div className="text-purple-600 font-medium">Col: {new Date(req.collect_date).toLocaleDateString()}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {req.payment_status === 'pending' && (
                                                    <button
                                                        onClick={() => handlePayment(req)}
                                                        className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded hover:bg-green-100 flex items-center gap-1"
                                                    >
                                                        <CreditCard size={12} /> Mark Paid
                                                    </button>
                                                )}
                                                {req.payment_status === 'paid' && (
                                                    <button
                                                        onClick={() => handleVerifyAndPrint(req)}
                                                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded hover:bg-gray-200 flex items-center gap-1"
                                                        title="Verify details & Print"
                                                    >
                                                        <Printer size={12} /> Verify & Print
                                                    </button>
                                                )}
                                                {req.status === 'pending' && (
                                                    <button
                                                        onClick={() => { setSelectedRequest(req); setActionType('processing'); handleUpdateStatus(); }}
                                                        className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded hover:bg-blue-100"
                                                    >
                                                        Process
                                                    </button>
                                                )}
                                                {(req.status === 'pending' || req.status === 'processing') && (
                                                    <button
                                                        onClick={() => openActionModal(req, 'ready')}
                                                        className="px-3 py-1.5 bg-purple-50 text-purple-600 text-xs font-semibold rounded hover:bg-purple-100 flex items-center gap-1"
                                                    >
                                                        Mark Ready
                                                    </button>
                                                )}
                                                {req.status === 'ready_to_collect' && (
                                                    <button
                                                        onClick={() => { setSelectedRequest(req); setActionType('close'); }}
                                                        className="px-3 py-1.5 bg-green-50 text-green-600 text-xs font-semibold rounded hover:bg-green-100 flex items-center gap-1"
                                                    >
                                                        Close
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Request Modal - Dynamic Form */}
            {actionType === 'create_request' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-xl animate-scale-in max-h-[95vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Issue New Service</h2>
                            <button onClick={() => { setActionType(null); }} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateRequest} className="space-y-6">

                            {/* 1. Service Selection */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-sm font-bold text-gray-900 mb-2">Select Certificate / Service <span className="text-red-500">*</span></label>
                                <select
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-lg"
                                    value={createForm.service_id || ''}
                                    onChange={e => setCreateForm(prev => ({ ...prev, service_id: e.target.value }))}
                                >
                                    <option value="">-- Choose Template --</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} (₹{s.price})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Dynamic Fields Section */}
                            {createForm.service_id && (
                                <div className="animate-fade-in space-y-6">

                                    {getTemplateFields(createForm.service_id).map((section, secIdx) => (
                                        <div key={secIdx} className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                                            <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs">{secIdx + 1}</span>
                                                {section.section}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {section.fields.map((field, fIdx) => (
                                                    <div
                                                        key={fIdx}
                                                        className={`${field.type === 'textarea' || field.name === 'custody_list' ? 'md:col-span-2 lg:col-span-3' : ''} ${field.className || ''}`}
                                                    >
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            {field.label} {field.required && <span className="text-red-500">*</span>}
                                                        </label>

                                                        {field.type === 'textarea' ? (
                                                            <textarea
                                                                required={field.required}
                                                                rows="3"
                                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                                placeholder={field.placeholder || ''}
                                                                value={createForm[field.name] || ''}
                                                                onChange={e => setCreateForm({ ...createForm, [field.name]: e.target.value })}
                                                            />
                                                        ) : (
                                                            <input
                                                                type={field.type || 'text'}
                                                                required={field.required}
                                                                autoFocus={field.autoFocus}
                                                                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${field.name === 'admission_number' ? 'bg-yellow-50 font-medium uppercase' : ''}`}
                                                                placeholder={field.placeholder || ''}
                                                                value={createForm[field.name] || ''}
                                                                onChange={e => setCreateForm({ ...createForm, [field.name]: e.target.value })}
                                                                onBlur={field.name === 'admission_number' ? handleAdmissionBlur : undefined}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 mt-4 shadow-lg text-lg flex items-center justify-center gap-2"
                                    >
                                        <Printer size={20} /> Issue & Generate
                                    </button>
                                </div>
                            )}

                            {!createForm.service_id && (
                                <div className="text-center py-10 text-gray-400">
                                    <div className="text-6xl mb-4">📄</div>
                                    <p>Select a template above to start</p>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Student Edit Modal (Before Printing) */}
            {selectedRequest && actionType === 'edit_student' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Verify Details</h2>
                                <p className="text-sm text-gray-500">Ensure details are correct before printing.</p>
                            </div>
                            <button onClick={() => { setActionType(null); setEditingStudent(null); }} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Student Name</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.student_name}
                                    onChange={e => setStudentForm({ ...studentForm, student_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Father's / Guardian's Name</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.father_name}
                                    onChange={e => setStudentForm({ ...studentForm, father_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                                <input
                                    type="text"
                                    disabled
                                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
                                    value={studentForm.admission_number}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.academic_year || ''}
                                    onChange={e => setStudentForm({ ...studentForm, academic_year: e.target.value })}
                                    placeholder="2024-2025"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.dob}
                                    onChange={e => setStudentForm({ ...studentForm, dob: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.gender}
                                    onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}
                                >
                                    <option value="">Select...</option>
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Caste</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.caste}
                                    onChange={e => setStudentForm({ ...studentForm, caste: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.student_mobile}
                                    onChange={e => setStudentForm({ ...studentForm, student_mobile: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.course}
                                    onChange={e => setStudentForm({ ...studentForm, course: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={studentForm.branch}
                                    onChange={e => setStudentForm({ ...studentForm, branch: e.target.value })}
                                />
                            </div>
                            <div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                        <input
                                            type="number"
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={studentForm.current_year}
                                            onChange={e => setStudentForm({ ...studentForm, current_year: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sem</label>
                                        <input
                                            type="number"
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={studentForm.current_semester}
                                            onChange={e => setStudentForm({ ...studentForm, current_semester: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <textarea
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    rows="2"
                                    value={studentForm.student_address}
                                    onChange={e => setStudentForm({ ...studentForm, student_address: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => handleDirectPrint(selectedRequest)}
                                className="px-6 py-2.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200"
                            >
                                Skip & Print
                            </button>
                            <div className="flex-1"></div>
                            <button
                                onClick={() => { setActionType(null); setEditingStudent(null); }}
                                className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateStudentAndPrint}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2"
                            >
                                <CheckCircle size={18} /> Update & Generate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Modal */}
            {selectedRequest && actionType === 'ready' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Mark as Ready to Collect</h2>
                        <div className="space-y-4">
                            {/* Dynamic Admin Fields */}
                            {selectedRequest?.admin_fields && selectedRequest.admin_fields.length > 0 && (
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-2">
                                    <h3 className="text-sm font-bold text-blue-800 mb-2">Required Information</h3>
                                    <div className="space-y-3">
                                        {(typeof selectedRequest.admin_fields === 'string'
                                            ? JSON.parse(selectedRequest.admin_fields)
                                            : selectedRequest.admin_fields
                                        ).map((field, idx) => (
                                            <div key={idx}>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    {field.label}
                                                </label>
                                                {field.type === 'select' ? (
                                                    <select
                                                        className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={actionData[field.name] || ''}
                                                        onChange={e => setActionData({ ...actionData, [field.name]: e.target.value })}
                                                    >
                                                        <option value="">Select...</option>
                                                        {(field.options || []).map((opt) => (
                                                            <option key={opt} value={opt.id || opt}>{opt.name || opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                                        className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={actionData[field.name] || ''}
                                                        onChange={e => setActionData({ ...actionData, [field.name]: e.target.value })}
                                                        placeholder={`Enter ${field.label}`}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Collect Date</label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={actionData.collect_date}
                                    onChange={e => setActionData({ ...actionData, collect_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notification to Student</label>
                                <textarea
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    rows="3"
                                    value={actionData.admin_note}
                                    onChange={e => setActionData({ ...actionData, admin_note: e.target.value })}
                                    placeholder="Enter message for student..."
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setSelectedRequest(null)} className="flex-1 py-2.5 bg-gray-100 rounded-lg font-medium text-gray-700">Cancel</button>
                                <button onClick={handleUpdateStatus} className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Confirmation Modal */}
            {selectedRequest && actionType === 'close' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-scale-in text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                            <CheckCircle size={24} />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Close Request?</h2>
                        <p className="text-gray-500 mb-6">This will mark the service as completed and closed.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setSelectedRequest(null)} className="flex-1 py-2.5 bg-gray-100 rounded-lg font-medium text-gray-700">Cancel</button>
                            <button onClick={handleUpdateStatus} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium">Yes, Close it</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Print Preview Modal */}
            {previewUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-scale-in">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Printer className="text-blue-600" /> Certificate Preview
                            </h2>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        const iframe = document.getElementById('pdf-preview-frame');
                                        if (iframe) iframe.contentWindow.print();
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2"
                                >
                                    <Printer size={18} /> Print Certificate
                                </button>
                                <button
                                    onClick={() => setPreviewUrl(null)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition"
                                >
                                    <X size={24} className="text-gray-500" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-gray-100 p-4">
                            <iframe
                                id="pdf-preview-frame"
                                src={previewUrl}
                                className="w-full h-full rounded-lg shadow-inner bg-white"
                                title="Certificate Preview"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceRequests;

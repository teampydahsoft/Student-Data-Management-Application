import React, { useEffect, useState } from 'react';
import { serviceService } from '../../services/serviceService';
import { toast } from 'react-hot-toast';
import { FileText, Clock, CheckCircle, AlertCircle, Download, CreditCard, X, Plus, Trash2 } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import api from '../../config/api';
import useAuthStore from '../../store/authStore';

const Services = () => {
    const [services, setServices] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('available'); // 'available' or 'history'

    // Modal state
    const [selectedService, setSelectedService] = useState(null);
    const [requestForm, setRequestForm] = useState({ purpose: '' });
    const [submitting, setSubmitting] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [servicesRes, requestsRes] = await Promise.all([
                serviceService.getAllServices(),
                serviceService.getRequests()
            ]);
            setServices(servicesRes.data || []);
            setRequests(requestsRes.data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRequest = async (e) => {
        e.preventDefault();
        if (!selectedService) return;

        try {
            setSubmitting(true);
            await serviceService.requestService({
                service_id: selectedService.id,
                ...requestForm
            });
            toast.success('Request submitted successfully');
            setSelectedService(null);
            setRequestForm({ purpose: '' });
            setActiveTab('history');
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Request failed');
        } finally {
            setSubmitting(false);
        }
    };

    // Load Razorpay Script
    const loadRazorpayScript = () => {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handlePayment = async (request) => {
        if (!window.confirm(`Proceed to pay ₹${request.service_price} for ${request.service_name}?`)) return;

        try {
            const toastId = toast.loading('Initializing payment...');

            const resScript = await loadRazorpayScript();
            if (!resScript) {
                toast.dismiss(toastId);
                toast.error('Razorpay SDK failed to load');
                return;
            }

            // 1. Create Order
            const orderResponse = await api.post('/payments/create-order', {
                studentId: user?.admission_number,
                amount: request.service_price,
                remarks: `Service Request Payment: ${request.service_name} (Ref: ${request.id})`,
                serviceRequestId: request.id,
                serviceName: request.service_name,
                studentYear: user?.current_year,
                semester: user?.current_semester
            });

            if (!orderResponse.data.success) {
                toast.dismiss(toastId);
                toast.error(orderResponse.data.message || 'Order creation failed');
                return;
            }

            const { order, key_id, studentDetails } = orderResponse.data;

            // 2. Open Razorpay
            const options = {
                key: key_id,
                amount: order.amount,
                currency: order.currency,
                name: 'Pydah Group',
                description: `Payment for ${request.service_name}`,
                order_id: order.id,
                handler: async (response) => {
                    try {
                        toast.loading('Verifying payment...', { id: toastId });
                        // 3. Verify Payment
                        const verifyRes = await api.post('/payments/verify', {
                            ...response,
                            studentId: user?.admission_number,
                            amount: request.service_price,
                            remarks: `Service Request Payment: ${request.service_name} (Ref: ${request.id})`,
                            serviceRequestId: request.id,
                            studentYear: user?.current_year,
                            semester: user?.current_semester
                        });

                        if (verifyRes.data.success) {
                            toast.success('Payment successful!', { id: toastId });
                            fetchData(); // Refresh to update status
                        } else {
                            toast.error(verifyRes.data.message || 'Verification failed', { id: toastId });
                        }
                    } catch (err) {
                        console.error(err);
                        toast.error('Payment verification failed', { id: toastId });
                    }
                },
                prefill: {
                    name: studentDetails?.name || user?.name || '',
                    email: studentDetails?.email || '',
                    contact: studentDetails?.contact || ''
                },
                theme: {
                    color: '#2563EB'
                }
            };

            const paymentObject = new window.Razorpay(options);
            paymentObject.open();

        } catch (error) {
            console.error(error);
            toast.error('Payment initialization failed');
        }
    };

    const handleDelete = async (request) => {
        if (!window.confirm(`Are you sure you want to delete the request for ${request.service_name}?`)) return;

        try {
            const toastId = toast.loading('Deleting request...');
            await serviceService.deleteRequest(request.id);
            toast.dismiss(toastId);
            toast.success('Request deleted successfully');
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Delete failed');
        }
    };

    const handleDownload = async (request) => {
        try {
            const toastId = toast.loading('Generating certificate...');

            // Use authenticated fetch for blob
            const response = await api.get(`/services/requests/${request.id}/download`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Certificate_${request.admission_number || 'download'}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            toast.dismiss(toastId);
            toast.success('Downloaded successfully');

        } catch (error) {
            console.error(error);
            toast.error('Download failed. Please try again.');
        }
    };

    const StatusBadge = ({ status, paymentStatus }) => {
        if (status === 'ready_to_collect') {
            return <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium"><CheckCircle size={12} /> Ready to Collect</span>;
        }
        if (status === 'completed' || status === 'closed') {
            return <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium"><CheckCircle size={12} /> Completed</span>;
        }
        if (paymentStatus === 'pending') {
            return <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium"><AlertCircle size={12} /> Payment Pending</span>;
        }
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium"><Clock size={12} /> {status.replace(/_/g, ' ')}</span>;
    };

    return (
        <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2">Campus Services</h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] items-center flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        Request Resources & Track Status
                    </p>
                </div>

                <div className="bg-white/60 backdrop-blur-md rounded-[1.5rem] p-1.5 shadow-xl shadow-slate-200/50 border border-white flex gap-1 w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('available')}
                        className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all duration-300 ${activeTab === 'available' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600 hover:bg-white/80'}`}
                    >
                        Catalogs
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all duration-300 ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600 hover:bg-white/80'}`}
                    >
                        Active Requests
                    </button>
                </div>
            </div>

            {activeTab === 'available' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-56 flex flex-col justify-between animate-pulse">
                                <div className="flex justify-between items-start mb-4">
                                    <SkeletonBox height="h-12" width="w-12" className="rounded-lg" />
                                    <SkeletonBox height="h-6" width="w-16" />
                                </div>
                                <div className="space-y-2">
                                    <SkeletonBox height="h-6" width="w-3/4" />
                                    <SkeletonBox height="h-4" width="w-full" />
                                </div>
                                <SkeletonBox height="h-10" width="w-full" className="rounded-lg" />
                            </div>
                        ))
                    ) : services.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                            No services available at the moment.
                        </div>
                    ) : (
                        services.map(service => (
                            <div key={service.id} className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.02] transition-all duration-500 group relative overflow-hidden flex flex-col h-full">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-50/50 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-100/50 transition-all duration-700"></div>
                                <div className="flex justify-between items-start mb-8 relative z-10">
                                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-[1.5rem] border border-indigo-100 shadow-sm transition-transform group-hover:scale-110 duration-500">
                                        <FileText size={28} />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="font-black text-2xl text-slate-900 tracking-tighter">₹{service.price}</span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Processing Fee</span>
                                    </div>
                                </div>
                                <div className="relative z-10 flex-1">
                                    <h3 className="text-2xl font-black text-slate-800 mb-3 leading-tight tracking-tight group-hover:text-indigo-600 transition-colors">{service.name}</h3>
                                    <p className="text-slate-400 text-sm mb-10 line-clamp-2 font-bold italic opacity-80">{service.description}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedService(service)}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 font-black uppercase tracking-widest text-[11px] relative z-10 transform hover:-translate-y-0.5 active:scale-95"
                                >
                                    Initiate Process
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden group">
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Request ID</th>
                                    <th className="px-6 py-4">Service</th>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Purpose</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Payment</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-16" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-32" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-24" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-40" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-6" width="w-24" className="rounded-full" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-24" className="rounded-full" /></td>
                                            <td className="px-6 py-4"><SkeletonBox height="h-4" width="w-20" /></td>
                                        </tr>
                                    ))
                                ) : requests.length === 0 ? (
                                    <tr><td colSpan="7" className="p-12 text-center text-gray-500">No requests found</td></tr>
                                ) : (
                                    requests.map(req => (
                                        <tr key={req.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-mono text-gray-600 text-sm">#{req.id}</td>
                                            <td className="px-6 py-4 font-medium text-gray-900">{req.service_name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {new Date(req.request_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                {(() => {
                                                    try {
                                                        const data = typeof req.request_data === 'string' ? JSON.parse(req.request_data) : req.request_data;
                                                        return data?.purpose || '-';
                                                    } catch (e) { return '-'; }
                                                })()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <StatusBadge status={req.status} paymentStatus={req.payment_status} />
                                            </td>
                                            <td className="px-6 py-4">
                                                {req.payment_status === 'paid' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">
                                                        Paid
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-bold uppercase">
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {/* Actions handled by Admin now. Student just views status */}
                                                {req.payment_status === 'pending' ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleDelete(req)}
                                                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                                            title="Delete Request"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handlePayment(req)}
                                                            className="inline-flex items-center gap-1 text-xs text-white font-medium bg-blue-600 px-3 py-1.5 rounded hover:bg-blue-700 transition shadow-sm"
                                                        >
                                                            <CreditCard size={12} /> Pay Now
                                                        </button>
                                                    </div>
                                                ) : req.status === 'ready_to_collect' ? (
                                                    <span className="text-xs text-purple-600 font-medium">Ready for Collection</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Processing</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden">
                        {loading ? (
                            <div className="space-y-4 animate-pulse">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="p-4 bg-white rounded-lg border border-gray-100 space-y-3">
                                        <div className="flex justify-between">
                                            <SkeletonBox height="h-4" width="w-1/3" />
                                            <SkeletonBox height="h-4" width="w-1/4" />
                                        </div>
                                        <SkeletonBox height="h-3" width="w-2/3" />
                                        <div className="flex justify-between pt-2">
                                            <SkeletonBox height="h-5" width="w-20" className="rounded-full" />
                                            <SkeletonBox height="h-5" width="w-16" className="rounded-md" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="p-12 text-center text-gray-500 text-sm">No requests found</div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {requests.map(req => (
                                    <div key={req.id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-semibold text-gray-900 text-sm">{req.service_name}</h3>
                                                <span className="text-xs font-mono text-gray-400">#{req.id}</span>
                                            </div>
                                            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                                {new Date(req.request_date).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                                            {(() => {
                                                try {
                                                    const data = typeof req.request_data === 'string' ? JSON.parse(req.request_data) : req.request_data;
                                                    return data?.purpose || 'No purpose specified';
                                                } catch (e) { return '-'; }
                                            })()}
                                        </p>

                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                                            <div className="flex gap-2">
                                                <StatusBadge status={req.status} paymentStatus={req.payment_status} />
                                                {req.payment_status === 'paid' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase">
                                                        Paid
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase">
                                                        Pending
                                                    </span>
                                                )}
                                            </div>

                                            {req.payment_status === 'pending' ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDelete(req)}
                                                        className="text-xs text-red-600 font-medium bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition shadow-sm flex items-center gap-1"
                                                    >
                                                        <Trash2 size={12} /> Delete
                                                    </button>
                                                    <button
                                                        onClick={() => handlePayment(req)}
                                                        className="text-xs text-white font-medium bg-blue-600 px-3 py-1.5 rounded hover:bg-blue-700 transition shadow-sm flex items-center gap-1"
                                                    >
                                                        <CreditCard size={12} /> Pay Now
                                                    </button>
                                                </div>
                                            ) : req.status === 'ready_to_collect' ? (
                                                <span className="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-1 rounded">Ready</span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400 font-medium bg-gray-50 px-2 py-1 rounded">Processing</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Request Modal */}
            {selectedService && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{selectedService.name}</h2>
                                <p className="text-sm text-gray-500">Fee: ₹{selectedService.price}</p>
                            </div>
                            <button onClick={() => setSelectedService(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleRequest} className="space-y-4">
                            {(selectedService.template_type === 'refund_application' || selectedService.name.toLowerCase().includes('refund')) ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Refund</label>
                                        <textarea
                                            required
                                            placeholder="e.g. Paid twice, Scholarship received, etc."
                                            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                            value={requestForm.purpose}
                                            onChange={e => setRequestForm({ ...requestForm, purpose: e.target.value, reason: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Excess Amount (Rs.)</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. 5000"
                                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={requestForm.excess_amount || ''}
                                                onChange={e => setRequestForm({ ...requestForm, excess_amount: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount in Words</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Five Thousand Only"
                                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={requestForm.amount_in_words || ''}
                                                onChange={e => setRequestForm({ ...requestForm, amount_in_words: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose of Certificate</label>
                                    <textarea
                                        required
                                        placeholder="e.g. For Scholarship Application, Visa, etc."
                                        className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                                        value={requestForm.purpose}
                                        onChange={e => setRequestForm({ ...requestForm, purpose: e.target.value })}
                                    />
                                </div>
                            )}

                            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                Note: Certificate generated will include your current academic details from the database. Please ensure your profile is up to date.
                            </p>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {submitting ? 'Submitting...' : 'Confirm Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Services;

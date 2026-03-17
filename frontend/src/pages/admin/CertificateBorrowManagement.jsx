import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  RotateCcw,
  ArrowRight,
  ChevronRight,
  Calendar,
  MoreVertical,
  AlertCircle,
  Loader2,
  Download,
  Eye,
  Settings2,
  User,
  GitBranch,
  BookOpen
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { formatDate } from '../../utils/dateUtils';
import LoadingAnimation from '../../components/LoadingAnimation';
import { hasPermission, BACKEND_MODULES, isFullAccessRole } from '../../constants/rbac';
import useAuthStore from '../../store/authStore';

const CertificateBorrowManagement = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [editReturnDate, setEditReturnDate] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/certificate-borrow/admin/all-requests');
      if (response.data.success) {
        setRequests(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching borrow requests:', error);
      toast.error('Failed to load borrow requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleUpdateStatus = async (status) => {
    if (!selectedRequest) return;

    try {
      setUpdating(true);
      const response = await api.put(`/certificate-borrow/admin/update-status/${selectedRequest.id}`, {
        status,
        remarks: adminRemarks,
        returnDate: editReturnDate
      });

      if (response.data.success) {
        toast.success(`Request marked as ${status}`);
        setShowStatusModal(false);
        setAdminRemarks('');
        fetchRequests();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update request status');
    } finally {
      setUpdating(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.admission_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.certificate_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Clock size={12} /> Pending Approval</span>;
      case 'approved':
        return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> Approved</span>;
      case 'issued':
        return <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><ShieldCheck size={12} /> Issued</span>;
      case 'returned':
        return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><RotateCcw size={12} /> Returned</span>;
      case 'rejected':
        return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><XCircle size={12} /> Rejected</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  if (!isFullAccessRole(user?.role) && !hasPermission(user?.permissions, BACKEND_MODULES.SERVICES, 'manage_certificate_borrow')) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
        <p className="text-gray-500 mt-2">You do not have permission to manage certificate borrow requests.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 heading-font">Certificate Borrow Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage issuance and return of original student certificates.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" />
            <div>
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Active Requests</p>
              <p className="text-lg font-bold text-indigo-900 leading-tight">
                {requests.filter(r => ['pending', 'approved', 'issued'].includes(r.status)).length}
              </p>
            </div>
          </div>
          <button 
            onClick={fetchRequests}
            className="p-3 bg-gray-50 text-gray-600 rounded-2xl hover:bg-gray-100 transition-all border border-gray-100"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Search by student name, admission number or certificate..."
            className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            className="w-full pl-12 pr-10 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved (Wait for issuance)</option>
            <option value="issued">Issued (Currently with student)</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 rotate-90" size={16} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600 mb-4" size={40} />
            <p className="text-gray-500 font-medium">Loading requests...</p>
          </div>
        ) : filteredRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student Details</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Certificate</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dates</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-gray-900">{req.student_name}</p>
                        <p className="text-xs font-mono text-gray-500">{req.admission_number}</p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-indigo-600 uppercase">
                          <span>{req.course}</span>
                          <span className="text-gray-300">•</span>
                          <span>{req.branch}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                          <FileText size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{req.certificate_name}</p>
                          <p className="text-[11px] text-gray-500 line-clamp-1 italic">"{req.purpose || 'No purpose stated'}"</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          <Calendar size={12} />
                          <span>Requested: {formatDate(req.request_date)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 text-[11px] font-bold ${new Date(req.return_date) < new Date() && req.status === 'issued' ? 'text-red-500' : 'text-amber-600'}`}>
                          <Calendar size={12} />
                          <span>Return by: {formatDate(req.return_date)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          setSelectedRequest(req);
                          setAdminRemarks(req.admin_remarks || '');
                          if (req.return_date) {
                            setEditReturnDate(new Date(req.return_date).toISOString().split('T')[0]);
                          } else {
                            setEditReturnDate('');
                          }
                          setShowStatusModal(true);
                        }}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      >
                        <Settings2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={32} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">No requests found</h3>
            <p className="text-gray-500 mt-2">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {showStatusModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Manage Request</h3>
                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">{selectedRequest.student_name} • {selectedRequest.admission_number}</p>
              </div>
              <button onClick={() => setShowStatusModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-start gap-4">
                <div className="p-3 bg-white rounded-xl text-indigo-600 shadow-sm">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Borrowing</p>
                  <h4 className="font-bold text-gray-800 text-lg">{selectedRequest.certificate_name}</h4>
                  <p className="text-sm text-gray-500 mt-1 italic">"{selectedRequest.purpose}"</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Admin Remarks (Internal)</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  placeholder="Add any internal notes here..."
                  value={adminRemarks}
                  onChange={e => setAdminRemarks(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Expected Return Date</label>
                <input 
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  value={editReturnDate}
                  onChange={e => setEditReturnDate(e.target.value)}
                  disabled={selectedRequest.status === 'returned' || selectedRequest.status === 'rejected'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {selectedRequest.status === 'pending' && (
                  <>
                    <button 
                      onClick={() => handleUpdateStatus('rejected')}
                      disabled={updating}
                      className="py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                    >
                      Reject Request
                    </button>
                    <button 
                      onClick={() => handleUpdateStatus('approved')}
                      disabled={updating}
                      className="py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      Approve Request
                    </button>
                  </>
                )}

                {selectedRequest.status === 'approved' && (
                  <>
                    <button 
                      onClick={() => handleUpdateStatus('issued')}
                      disabled={updating}
                      className="col-span-2 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck size={20} /> Mark as Issued (Handed to student)
                    </button>
                  </>
                )}

                {selectedRequest.status === 'issued' && (
                  <>
                    <button 
                      onClick={() => handleUpdateStatus('returned')}
                      disabled={updating}
                      className="col-span-2 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={20} /> Mark as Returned
                    </button>
                  </>
                )}

                {(selectedRequest.status === 'returned' || selectedRequest.status === 'rejected') && (
                  <p className="col-span-2 text-center text-sm font-medium text-gray-400 py-2">
                    This request has been finalized as <span className="font-bold uppercase tracking-tight">{selectedRequest.status}</span>.
                  </p>
                )}
              </div>
            </div>
            
            {updating && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificateBorrowManagement;

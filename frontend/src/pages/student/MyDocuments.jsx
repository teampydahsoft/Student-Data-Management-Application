import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ArrowRight, 
  Calendar, 
  Info,
  ChevronRight,
  Loader2,
  Download,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { getCourseType, getCertificatesForCourse } from '../../config/certificateConfig';
import { formatDate } from '../../utils/dateUtils';

const MyDocuments = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [submittedCerts, setSubmittedCerts] = useState([]);
  const [borrowHistory, setBorrowHistory] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedCert, setSelectedCert] = useState(null);
  const [requestData, setRequestData] = useState({
    purpose: '',
    returnDate: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [certConfig, setCertConfig] = useState(null);

  const fetchDocumentData = async () => {
    try {
      setLoading(true);
      if (!user?.admission_number) return;

      const [submittedRes, historyRes, configRes] = await Promise.all([
        api.get(`/certificate-borrow/student/submitted-certificates/${user.admission_number}`),
        api.get(`/certificate-borrow/student/history/${user.admission_number}`),
        api.get('/settings/certificates').catch(() => null)
      ]);

      if (submittedRes.data.success) {
        setSubmittedCerts(submittedRes.data.data);
      }
      if (historyRes.data.success) {
        setBorrowHistory(historyRes.data.data);
      }
      if (configRes && configRes.data.success) {
        setCertConfig(configRes.data.data);
      }
    } catch (error) {
      console.error('Error fetching document data:', error);
      toast.error('Failed to load document information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocumentData();
  }, [user]);

  const handleOpenRequest = (certKey, certLabel) => {
    // Check if there's already an active request for this certificate
    const activeRequest = borrowHistory.find(
      r => r.certificate_key === certKey && ['pending', 'approved', 'issued'].includes(r.status)
    );

    if (activeRequest) {
      toast.error('You already have an active request for this certificate');
      return;
    }

    setSelectedCert({ key: certKey, label: certLabel });
    setShowRequestModal(true);
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestData.purpose || !requestData.returnDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const response = await api.post('/certificate-borrow/student/request', {
        admissionNumber: user.admission_number,
        certificateKey: selectedCert.key,
        certificateName: selectedCert.label,
        purpose: requestData.purpose,
        returnDate: requestData.returnDate
      });

      if (response.data.success) {
        toast.success('Borrow request submitted successfully');
        setShowRequestModal(false);
        setRequestData({ purpose: '', returnDate: '' });
        fetchDocumentData();
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error(error.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> Pending</span>;
      case 'approved':
        return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} /> Approved</span>;
      case 'issued':
        return <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><ShieldCheck size={12} /> Issued</span>;
      case 'returned':
        return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><RotateCcw size={12} /> Returned</span>;
      case 'rejected':
        return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> Rejected</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit">{status}</span>;
    }
  };

  const courseType = getCourseType(user?.course || '');
  
  // Use dynamic config if available, otherwise fallback to static config
  const configCerts = React.useMemo(() => {
    const rawCerts = (certConfig && certConfig[courseType.toLowerCase()]) || getCertificatesForCourse(courseType);
    return rawCerts.map(c => ({
      key: c.id || c.key,
      label: c.name || c.label
    }));
  }, [certConfig, courseType]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 heading-font">My Documents</h1>
          <p className="text-gray-500 mt-2">Manage your submitted original certificates and borrow requests.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 p-4 rounded-2xl flex items-center gap-3 border border-indigo-100">
            <div className="p-2 bg-indigo-600 text-white rounded-xl">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Level</p>
              <p className="text-lg font-bold text-indigo-900">{courseType || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Submitted Certificates */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-indigo-600" />
              Submitted Originals
            </h2>
            <div className="text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
              {submittedCerts.length} Documents Found
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-2xl border border-gray-100"></div>
              ))}
            </div>
          ) : submittedCerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configCerts
                .filter(c => submittedCerts.includes(c.key))
                .map(cert => (
                  <div key={cert.key} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group border-l-4 border-l-green-500">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-green-50 text-green-600 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
                        <FileText size={20} />
                      </div>
                      <div className="text-[10px] font-bold text-green-600 uppercase tracking-widest bg-green-50 px-2 py-1 rounded-full">
                        Verified
                      </div>
                    </div>
                    <h3 className="font-bold text-gray-800 mb-4 line-clamp-1">{cert.label}</h3>
                    <button 
                      onClick={() => handleOpenRequest(cert.key, cert.label)}
                      className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      Request Original <ArrowRight size={16} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-10 text-center border-2 border-dashed border-gray-200">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-600">No original certificates submitted</h3>
              <p className="text-gray-400 mt-2 max-w-xs mx-auto text-sm">Once you submit your original documents to the office, they will appear here for borrowing requests.</p>
            </div>
          )}
        </div>

        {/* Info & Recent History */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Info size={20} />
              </div>
              <h3 className="font-bold text-lg">Borrowing Guidelines</h3>
            </div>
            <ul className="space-y-3 text-sm text-indigo-100">
              <li className="flex items-start gap-2">
                <ChevronRight size={16} className="mt-1 flex-shrink-0" />
                Originals can be borrowed for valid purposes only.
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight size={16} className="mt-1 flex-shrink-0" />
                Requests must specify a return date.
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight size={16} className="mt-1 flex-shrink-0" />
                Late returns may affect future borrowing privileges.
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Recent Requests</h2>
            <button onClick={fetchDocumentData} className="text-indigo-600 text-xs font-bold hover:underline">Refresh</button>
          </div>

          <div className="space-y-4">
            {borrowHistory.length > 0 ? (
              borrowHistory.slice(0, 5).map(request => (
                <div key={request.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-sm text-gray-800 line-clamp-1">{request.certificate_name}</h4>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                    <Calendar size={12} />
                    <span>Req: {formatDate(request.request_date)}</span>
                    <span className="text-gray-200">|</span>
                    <span className={new Date(request.return_date) < new Date() && request.status === 'issued' ? 'text-red-500 font-bold' : ''}>
                      Return: {formatDate(request.return_date)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-2xl border border-gray-100">
                <Clock size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">No recent requests</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Request Original</h3>
                <p className="text-xs text-indigo-600 font-bold">{selectedCert?.label}</p>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Purpose of Borrowing</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="E.g., Passport verification, Job interview, etc."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none outline-none text-sm"
                  value={requestData.purpose}
                  onChange={e => setRequestData({...requestData, purpose: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Return Date</label>
                <div className="relative">
                  <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    required
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-sm"
                    value={requestData.returnDate}
                    onChange={e => setRequestData({...requestData, returnDate: e.target.value})}
                  />
                </div>
                <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1 font-medium">
                  <AlertCircle size={10} />
                  Please ensure to return the original by this date.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDocuments;

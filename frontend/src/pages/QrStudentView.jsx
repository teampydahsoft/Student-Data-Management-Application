import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, Eye, EyeOff, QrCode, CheckCircle, AlertCircle, Loader, ChevronDown, Info, X, ShieldCheck } from 'lucide-react';

// API base URL from environment or default
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Canonical field ordering for display
const FIELD_ORDER = [
    'student_name', 'admission_no', 'college', 'batch', 'course', 'branch',
    'current_year', 'current_semester', 'stud_type', 'student_status',
    'gender', 'dob', 'adhar_no', 'apaar', 'pin_no',
    'father_name', 'mother_name', 'caste', 'scholar_status',
    'student_mobile', 'parent_mobile1', 'parent_mobile2',
    'student_address', 'city_village', 'mandal_name', 'district', 'state', 'pincode',
    'remarks', 'previous_college',
];

// Sort fields by canonical order, append unknown ones
const sortFields = (fieldObj) => {
    if (!fieldObj) return [];
    const ordered = FIELD_ORDER
        .filter(key => fieldObj[key] !== undefined)
        .map(key => ({ key, ...fieldObj[key] }));
    const remaining = Object.keys(fieldObj)
        .filter(k => !FIELD_ORDER.includes(k) && k !== 'student_photo')
        .map(k => ({ key: k, ...fieldObj[k] }));
    return [...ordered, ...remaining];
};

// A single field card
const FieldCard = ({ label, value }) => (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-gray-900 break-words">{String(value) || '—'}</p>
    </div>
);

// Credential input form (used in Get More Info modal)
const CredentialForm = ({ onSubmit, loading, error, onCancel }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(username.trim(), password.trim()); }} className="space-y-4">
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle size={15} className="flex-shrink-0" />
                    {error}
                </div>
            )}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none"
                        disabled={loading}
                        autoComplete="username"
                        autoFocus
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none"
                        disabled={loading}
                        autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>
            </div>
            <div className="flex gap-2 pt-1">
                <button type="button" onClick={onCancel} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" disabled={loading || !username || !password} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-lg font-medium text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors">
                    {loading ? <><Loader size={14} className="animate-spin" /> Verifying...</> : <><ShieldCheck size={14} /> Get Info</>}
                </button>
            </div>
        </form>
    );
};

export default function QrStudentView() {
    const { qrToken } = useParams();

    // Public data state
    const [publicLoading, setPublicLoading] = useState(true);
    const [publicData, setPublicData] = useState(null); // { student, hasPrivateView }
    const [publicError, setPublicError] = useState('');

    // Private data state
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [privateLoading, setPrivateLoading] = useState(false);
    const [privateData, setPrivateData] = useState(null); // { privateFields, scannedBy }
    const [privateError, setPrivateError] = useState('');

    // Fetch public data on mount
    useEffect(() => {
        if (!qrToken) return;
        const load = async () => {
            try {
                setPublicLoading(true);
                const res = await axios.get(`${API_BASE}/qr/public/${encodeURIComponent(qrToken.trim())}`);
                if (res.data.success) {
                    setPublicData(res.data.data);
                } else {
                    setPublicError(res.data.message || 'Student not found');
                }
            } catch (e) {
                setPublicError(e.response?.data?.message || 'Student not found or server error');
            } finally {
                setPublicLoading(false);
            }
        };
        load();
    }, [qrToken]);


    const handleGetMoreInfo = async (username, password) => {
        if (!username || !password) return;
        setPrivateLoading(true);
        setPrivateError('');
        try {
            // Use the qrToken from the URL (or from the public data response)
            const token = publicData?.qrToken || qrToken;
            const res = await axios.post(`${API_BASE}/qr/verify`, {
                qrToken: token,
                username,
                password
            });
            if (res.data.success) {
                setPrivateData(res.data.data);
                setShowLoginModal(false);
            } else {
                setPrivateError(res.data.message || 'Verification failed');
            }
        } catch (e) {
            setPrivateError(e.response?.data?.message || 'Invalid credentials');
        } finally {
            setPrivateLoading(false);
        }
    };


    const publicFields = sortFields(publicData?.student);
    const privateFields = sortFields(privateData?.privateFields);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-teal-50/40 flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-lg">

                {/* Header */}
                <div className="text-center mb-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-100 mb-3 shadow-sm">
                        <QrCode size={28} className="text-teal-600" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Student Information</h1>
                    <p className="text-xs text-gray-500 mt-1">Scan verified via Pydah Student Management System</p>
                </div>

                {/* Loading */}
                {publicLoading && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-3 border-teal-500 border-t-transparent rounded-full animate-spin border-[3px]" />
                        <p className="text-sm text-gray-500">Loading student information...</p>
                    </div>
                )}

                {/* Error: student not found */}
                {!publicLoading && publicError && (
                    <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 flex flex-col items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertCircle size={22} className="text-red-500" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900">Not Found</h2>
                        <p className="text-sm text-gray-500">{publicError}</p>
                    </div>
                )}

                {/* Public Data Card */}
                {!publicLoading && publicData && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                        {/* Student Photo + Name Header */}
                        <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-4">
                            <div className="flex items-center gap-4">
                                {publicData.student?.student_photo?.value ? (
                                    <img
                                        src={publicData.student.student_photo.value}
                                        alt="Student"
                                        className="w-16 h-16 rounded-xl border-2 border-white/40 object-cover flex-shrink-0"
                                        onError={e => { e.target.style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-xl border-2 border-white/30 bg-white/20 flex items-center justify-center flex-shrink-0">
                                        <User size={26} className="text-white/70" />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-white leading-tight truncate">
                                        {publicData.student?.student_name?.value || 'Student'}
                                    </h2>
                                    {publicData.student?.admission_no?.value && (
                                        <p className="text-teal-100 text-sm mt-0.5">{publicData.student.admission_no.value}</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-300"></div>
                                        <span className="text-[11px] text-teal-100 font-medium">Public Information</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Public Fields Grid */}
                        <div className="p-4">
                            {publicFields.filter(f => f.key !== 'student_photo' && f.key !== 'student_name' && f.key !== 'admission_no').length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {publicFields.filter(f => f.key !== 'student_photo').map(field => (
                                        <FieldCard key={field.key} label={field.label} value={field.value} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-sm text-gray-400 py-4">Basic information displayed above.</p>
                            )}
                        </div>

                        {/* Private Data (If authenticated) */}
                        {privateData && privateFields.length > 0 && (
                            <div className="border-t border-dashed border-slate-200 mx-4 mb-4">
                                <div className="flex items-center gap-2 py-3">
                                    <ShieldCheck size={14} className="text-slate-500" />
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Staff View — {privateData.scannedBy?.roleLabel || 'Authenticated'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {privateFields.map(field => (
                                        <FieldCard key={field.key} label={field.label} value={field.value} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* No additional private fields message */}
                        {privateData && privateFields.length === 0 && (
                            <div className="mx-4 mb-4 border-t border-dashed border-slate-200 pt-3">
                                <p className="text-xs text-center text-gray-400">No additional private fields configured for your role.</p>
                            </div>
                        )}

                        {/* Get More Info Button */}
                        {!privateData && (
                            <div className="px-4 pb-4">
                                <div className="border border-dashed border-slate-200 rounded-xl p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                            <Lock size={14} className="text-slate-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-slate-700">Restricted Details</p>
                                            <p className="text-[10px] text-slate-400">Requires staff credentials</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowLoginModal(true)}
                                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 transition-colors"
                                    >
                                        <Info size={12} />
                                        Get More Info
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <p className="text-center text-[10px] text-gray-400 mt-5">
                    Pydah Student Management System — Secure QR Verification
                </p>
            </div>

            {/* ── GET MORE INFO MODAL ── */}
            {showLoginModal && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowLoginModal(false); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <ShieldCheck size={18} className="text-slate-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">Staff Authentication</h3>
                                    <p className="text-[11px] text-gray-500">Enter your RBAC credentials</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowLoginModal(false); setPrivateError(''); }}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-5 pb-5">
                            <CredentialForm
                                onSubmit={handleGetMoreInfo}
                                loading={privateLoading}
                                error={privateError}
                                onCancel={() => { setShowLoginModal(false); setPrivateError(''); }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

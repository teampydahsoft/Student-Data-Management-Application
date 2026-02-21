import React, { useState, useEffect } from 'react';
import {
    History,
    User,
    Clock,
    AlertCircle,
    RefreshCw,
    CheckCircle2,
    XCircle,
    ArrowRight,
    Shield,
    FileText,
    TrendingUp,
    KeyRound,
    Upload,
    Edit3,
    UserPlus,
    Trash2,
    Star,
    CreditCard,
    LogIn,
    ArrowRightLeft
} from 'lucide-react';
import api from '../../config/api';
import { formatDate } from '../../utils/dateUtils';

// ─── Skeleton Loader ────────────────────────────────────────────────────────
const SkeletonPulse = ({ className = '' }) => (
    <div className={`animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded ${className}`} />
);

const LogSkeleton = () => (
    <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full animate-pulse bg-gray-200 flex-shrink-0" />
                    <div className="w-0.5 flex-1 bg-gray-100 mt-2" />
                </div>
                <div className="flex-1 pb-4">
                    <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <SkeletonPulse className="h-6 w-20 rounded-full" />
                                <SkeletonPulse className="h-4 w-32" />
                            </div>
                            <SkeletonPulse className="h-4 w-28" />
                        </div>
                        <SkeletonPulse className="h-3 w-full" />
                        <SkeletonPulse className="h-3 w-3/4" />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

// ─── Action Config ────────────────────────────────────────────────────────────
const ACTION_CONFIG = {
    CREATE: { label: 'Student Created', icon: UserPlus, dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    UPDATE: { label: 'Profile Updated', icon: Edit3, dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-100' },
    UPDATE_PIN_NUMBER: { label: 'PIN Updated', icon: KeyRound, dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-100' },
    PROMOTE: { label: 'Promoted', icon: TrendingUp, dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-100' },
    COURSE_COMPLETED: { label: 'Course Completed', icon: Star, dot: 'bg-yellow-500', badge: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
    DELETE: { label: 'Record Deleted', icon: Trash2, dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-100' },
    BULK_UPLOAD: { label: 'Bulk Upload', icon: Upload, dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700 border-teal-100' },
    STATUS_CHANGE: { label: 'Status Changed', icon: RefreshCw, dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-100' },
    UPDATE_FEE_STATUS: { label: 'Fee Updated', icon: CreditCard, dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 border-rose-100' },
    UPDATE_REGISTRATION_STATUS: { label: 'Reg. Status Updated', icon: Star, dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-100' },
    REJOIN: { label: 'Student Rejoined', icon: LogIn, dot: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    TRANSFER: { label: 'College Transfer', icon: ArrowRightLeft, dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
    DEFAULT: { label: 'Action', icon: FileText, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-700 border-gray-100' },
};

const getActionConfig = (type) => ACTION_CONFIG[type?.toUpperCase()] || ACTION_CONFIG.DEFAULT;

// ─── Human readable field labels ─────────────────────────────────────────────
const FIELD_LABELS = {
    student_name: 'Student Name', father_name: 'Father Name', student_mobile: 'Mobile Number',
    parent_mobile1: 'Parent Mobile 1', parent_mobile2: 'Parent Mobile 2', student_address: 'Address',
    student_status: 'Status', fee_status: 'Fee Status', certificates_status: 'Certificate Status',
    scholar_status: 'Scholar Status', registration_status: 'Registration Status',
    current_year: 'Current Year', current_semester: 'Current Semester', batch: 'Batch',
    course: 'Course', branch: 'Branch', stud_type: 'Student Type', gender: 'Gender',
    dob: 'Date of Birth', adhar_no: 'Aadhar Number', caste: 'Caste',
    pin_no: 'PIN Number', student_photo: 'Photo', remarks: 'Remarks',
    city_village: 'City/Village', mandal_name: 'Mandal', district: 'District',
};

const friendlyField = (key) => FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ─── Detail Renderer ─────────────────────────────────────────────────────────
const LogDetails = ({ log }) => {
    const raw = log.details;
    if (!raw) return null;

    let d = raw;
    if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch { return <p className="text-sm text-gray-600 mt-2 italic">{d}</p>; }
    }

    if (!d || typeof d !== 'object') return null;

    const type = log.action_type?.toUpperCase();

    // PROMOTE: from → to
    if ((type === 'PROMOTE' || type === 'COURSE_COMPLETED') && (d.from || d.to)) {
        return (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {d.from && (
                    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-medium">
                        Year {d.from.year || d.from.current_year} &bull; Sem {d.from.semester || d.from.current_semester}
                    </span>
                )}
                {d.from && d.to && <ArrowRight className="w-4 h-4 text-gray-400" />}
                {d.to && (
                    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-semibold border border-purple-100">
                        Year {d.to.year || d.to.current_year} &bull; Sem {d.to.semester || d.to.current_semester}
                    </span>
                )}
                {d.student_status && (
                    <span className="ml-1 bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full border border-emerald-100">
                        {d.student_status}
                    </span>
                )}
            </div>
        );
    }

    if (type === 'UPDATE_PIN_NUMBER') {
        return (
            <div className="mt-3 flex items-center gap-2 text-sm">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-gray-600">PIN number updated{d.pinNumber ? ` to ` : ''}</span>
                {d.pinNumber && <span className="font-mono font-semibold text-gray-900 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded">{d.pinNumber}</span>}
            </div>
        );
    }

    // UPDATE_FEE_STATUS
    if (type === 'UPDATE_FEE_STATUS') {
        return (
            <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${['no due', 'no_due', 'permitted', 'completed'].includes(d.fee_status?.toLowerCase())
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                        {d.fee_status}
                    </span>
                    {d.permit_ending_date && (
                        <span className="text-xs text-gray-500">
                            Permit until: <span className="font-semibold text-gray-700">{formatDate(d.permit_ending_date)}</span>
                        </span>
                    )}
                </div>
                {d.permit_remarks && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 italic">
                        "{d.permit_remarks}"
                    </p>
                )}
            </div>
        );
    }

    // UPDATE_REGISTRATION_STATUS
    if (type === 'UPDATE_REGISTRATION_STATUS') {
        return (
            <div className="mt-3">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${d.registration_status?.toLowerCase() === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                    {d.registration_status}
                </span>
            </div>
        );
    }

    // REJOIN
    if (type === 'REJOIN') {
        return (
            <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">{d.fromBatch}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-bold border border-emerald-100">{d.toBatch}</span>
                </div>
                {d.remarks && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 italic">
                        "{d.remarks}"
                    </p>
                )}
            </div>
        );
    }

    // TRANSFER
    if (type === 'TRANSFER') {
        const diffs = [];
        if (d.from?.college !== d.to?.college) diffs.push({ label: 'College', from: d.from?.college, to: d.to?.college });
        if (d.from?.course !== d.to?.course) diffs.push({ label: 'Course', from: d.from?.course, to: d.to?.course });
        if (d.from?.branch !== d.to?.branch) diffs.push({ label: 'Branch', from: d.from?.branch, to: d.to?.branch });
        if (d.from?.batch !== d.to?.batch) diffs.push({ label: 'Batch', from: d.from?.batch, to: d.to?.batch });

        return (
            <div className="mt-3 space-y-2">
                <div className="grid grid-cols-1 gap-2">
                    {diffs.map(diff => (
                        <div key={diff.label} className="flex items-center gap-2 text-xs">
                            <span className="w-16 font-bold text-gray-400 uppercase tracking-tighter">{diff.label}</span>
                            <span className="px-2 py-1 bg-gray-50 text-gray-500 rounded-lg border border-gray-100 truncate max-w-[120px]" title={diff.from}>{diff.from || '—'}</span>
                            <ArrowRight className="w-3 h-3 text-gray-300" />
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 font-bold truncate max-w-[120px]" title={diff.to}>{diff.to || '—'}</span>
                        </div>
                    ))}
                </div>
                {(d.from?.year !== d.to?.year || d.from?.semester !== d.to?.semester) && (
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 mt-1">
                        <TrendingUp className="w-3 h-3 text-purple-400" />
                        STAGE: {d.from?.year}.{d.from?.semester} → {d.to?.year}.{d.to?.semester}
                    </div>
                )}
            </div>
        );
    }

    // NEW FORMAT: changes with {from, to} per field
    if (d.changes && typeof d.changes === 'object') {
        const entries = Object.entries(d.changes).filter(([k]) => k !== 'student_data' && k !== 'student_photo');
        const photoUpdated = d.photo_updated || d.changes?.student_photo;
        if (entries.length === 0 && !photoUpdated) {
            return <p className="text-xs text-gray-400 italic mt-2">No trackable fields changed.</p>;
        }
        return (
            <div className="mt-3 space-y-2">
                {photoUpdated && (
                    <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-lg w-fit font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> Photo updated
                    </div>
                )}
                {entries.length > 0 && (
                    <div className="rounded-2xl border border-gray-200 overflow-hidden text-xs shadow-sm bg-white">
                        {/* Header */}
                        <div className="flex items-center bg-gray-50/80 border-b border-gray-200 px-4 py-2.5 gap-2 font-bold uppercase tracking-widest text-[10px] text-gray-400">
                            <span className="w-[100px] flex-shrink-0">Field Name</span>
                            <span className="flex-1 text-red-500/80">From</span>
                            <span className="w-6 flex-shrink-0" />
                            <span className="flex-1 text-emerald-600/80">To</span>
                        </div>
                        {/* Rows */}
                        <div className="divide-y divide-gray-100">
                            {entries.map(([key, change]) => (
                                <div key={key} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                                    <span className="w-[100px] flex-shrink-0 font-bold text-gray-700 truncate" title={friendlyField(key)}>
                                        {friendlyField(key)}
                                    </span>
                                    <span className="flex-1 min-w-0 text-red-700 bg-red-50/50 border border-red-100/50 px-2.5 py-1.5 rounded-xl truncate" title={String(change?.from ?? '')}>
                                        {String(change?.from ?? '—') || '—'}
                                    </span>
                                    <div className="w-6 flex flex-col items-center flex-shrink-0">
                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                                    </div>
                                    <span className="flex-1 min-w-0 text-emerald-800 bg-emerald-50/50 border border-emerald-100/50 px-2.5 py-1.5 rounded-xl font-bold truncate" title={String(change?.to ?? '')}>
                                        {String(change?.to ?? '—') || '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // LEGACY: flat fields list (older logs that don't have {from, to})
    const metaKeys = new Set(['student_data', 'student_photo', 'message', 'updated_by', 'updated_at', 'admission_number', 'id', 'photo_updated', 'fields_changed', 'total_changed']);
    const legacyFields = Object.keys(d).filter(k => !metaKeys.has(k));
    const photoUpdatedLegacy = d.photo_updated || d.student_photo;

    if (legacyFields.length === 0 && !photoUpdatedLegacy) {
        if (d.message) return <p className="mt-2 text-sm text-gray-600">{d.message}</p>;
        return null;
    }

    return (
        <div className="mt-3 space-y-2">
            {photoUpdatedLegacy && (
                <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-lg w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Photo updated
                </div>
            )}
            {legacyFields.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {legacyFields.map(key => (
                        <span key={key} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-800 text-xs px-2.5 py-1.5 rounded-lg font-medium">
                            {friendlyField(key)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Registration Stages (5 stages) ──────────────────────────────────────────
const RegistrationSnapshot = ({ student }) => {
    if (!student) return null;
    const sd = typeof student.student_data === 'string'
        ? (() => { try { return JSON.parse(student.student_data); } catch { return {}; } })()
        : (student.student_data || {});

    const stages = [
        {
            label: 'Student Mobile Verified', icon: CheckCircle2,
            done: sd.is_student_mobile_verified === true,
            desc: sd.is_student_mobile_verified === true ? 'Verified ✓' : 'Not verified'
        },
        {
            label: 'Parent Mobile Verified', icon: CheckCircle2,
            done: sd.is_parent_mobile_verified === true,
            desc: sd.is_parent_mobile_verified === true ? 'Verified ✓' : 'Not verified'
        },
        {
            label: 'Certificate Status', icon: FileText,
            done: ['verified', 'submitted', 'originals returned'].includes((student.certificates_status || '').toLowerCase()),
            desc: student.certificates_status || 'Pending'
        },
        {
            label: 'Fee Status', icon: Shield,
            done: ['no due', 'no_due', 'permitted'].includes((student.fee_status || '').toLowerCase()),
            desc: student.fee_status || 'Pending'
        },
        {
            label: 'Overall Registration', icon: Star,
            done: (student.registration_status || '').toLowerCase() === 'completed',
            desc: student.registration_status || 'Pending'
        },
    ];

    const completedCount = stages.filter(s => s.done).length;
    const allDone = completedCount === stages.length;

    return (
        <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-2 ${allDone ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Registration Progress</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-700'}`}>
                    {completedCount}/{stages.length} Complete
                </span>
            </div>
            <div className="divide-y divide-gray-50 bg-white">
                {stages.map((stage, i) => {
                    const Ic = stage.icon;
                    return (
                        <div key={stage.label} className="flex items-center gap-3 px-3 py-2.5">
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${stage.done ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                                <Ic className={`w-3.5 h-3.5 ${stage.done ? 'text-emerald-600' : 'text-gray-400'}`} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800">{i + 1}. {stage.label}</p>
                                <p className="text-xs text-gray-500 truncate capitalize">{stage.desc}</p>
                            </div>
                            <div className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${stage.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {stage.done ? 'Done' : 'Pending'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Role Badge ────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
    super_admin: 'Super Admin', admin: 'Admin', college_principal: 'Principal',
    hod: 'HOD', ao: 'Admin Officer', cashier: 'Cashier', faculty: 'Faculty',
};

const RoleBadge = ({ role }) => {
    if (!role) return null;
    return (
        <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
            <Shield className="w-3 h-3" />
            {ROLE_LABELS[role] || role}
        </span>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const StudentHistoryLogs = ({ student }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLogs = async (isRefresh = false) => {
        if (!student?.admission_number) return;
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const response = await api.get('/logs', {
                params: { entityType: 'STUDENT', entityId: student.admission_number, limit: 200 }
            });
            if (response.data?.success) {
                // Latest first
                const sorted = [...(response.data.data || [])].sort(
                    (a, b) => new Date(b.created_at) - new Date(a.created_at)
                );
                setLogs(sorted);
            } else {
                throw new Error(response.data?.message || 'Failed to fetch history');
            }
        } catch (err) {
            console.error('Error fetching student history logs:', err);
            setError('Could not load edit history. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchLogs(); }, [student?.admission_number]);

    // ── Loading state ──
    if (loading) {
        return (
            <div className="p-4 sm:p-6 h-full">
                <div className="mb-5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl animate-pulse bg-indigo-100" />
                    <div className="space-y-1.5">
                        <SkeletonPulse className="h-4 w-40" />
                        <SkeletonPulse className="h-3 w-56" />
                    </div>
                </div>
                <LogSkeleton />
            </div>
        );
    }

    // ── Error state ──
    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                    <p className="font-semibold text-gray-800">Failed to load history</p>
                    <p className="text-sm text-gray-500 mt-0.5">{error}</p>
                </div>
                <button
                    onClick={() => fetchLogs(true)}
                    className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                    <RefreshCw className="w-4 h-4" /> Try Again
                </button>
            </div>
        );
    }

    // ── Build timeline entries ──
    const allEntries = [...logs];

    return (
        <div className="flex flex-col h-full">
            {/* Header / Summary Bar */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                        <History className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 text-xs uppercase tracking-widest">History Log</h3>
                        <p className="text-[10px] text-gray-500 font-bold">
                            {logs.length} EVENTS RECORDED
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => fetchLogs(true)}
                    disabled={refreshing}
                    className="p-2.5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Timeline */}
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-0">
                {allEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
                            <History className="w-7 h-7 text-gray-300" />
                        </div>
                        <p className="text-gray-500 text-sm">No edit history found for this student.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {allEntries.map((log, idx) => {
                            const cfg = getActionConfig(log.action_type);
                            const IconComp = cfg.icon;
                            const isFirst = idx === 0;
                            const isCreate = log.action_type?.toUpperCase() === 'CREATE';
                            const performerName = log.admin_full_name || log.admin_username || 'System';
                            const performerRole = log.admin_role;

                            return (
                                <div key={log.id} className="flex gap-3 group">
                                    {/* Dot + Line */}
                                    <div className="flex flex-col items-center flex-shrink-0 pt-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md ring-4 ring-white ${cfg.dot} flex-shrink-0 z-10 scale-90`}>
                                            <IconComp className="w-4 h-4 text-white" strokeWidth={3} />
                                        </div>
                                        {idx < allEntries.length - 1 && (
                                            <div className="w-0.5 flex-1 bg-gray-100 mt-2 min-h-[40px] rounded-full" />
                                        )}
                                    </div>

                                    {/* Card */}
                                    <div className={`flex-1 mb-2 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${isFirst ? 'ring-2 ring-indigo-500/10 border-indigo-100' : ''}`}>
                                        {isFirst && (
                                            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500" />
                                        )}
                                        <div className="p-4">
                                            {/* Top row: badge + time */}
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${cfg.badge}`}>
                                                        <IconComp className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                        {cfg.label}
                                                    </span>
                                                    {isFirst && (
                                                        <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full font-medium">Latest</span>
                                                    )}
                                                </div>
                                                <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium whitespace-nowrap">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {formatDate(log.created_at)}
                                                </span>
                                            </div>

                                            {/* Performer row */}
                                            <div className="flex items-center gap-2 mt-2.5">
                                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                                                    <User className="w-3.5 h-3.5 text-gray-600" />
                                                </div>
                                                <span className="text-sm font-semibold text-gray-800">{performerName}</span>
                                                {performerRole && <RoleBadge role={performerRole} />}
                                            </div>

                                            {/* Details */}
                                            <LogDetails log={log} />

                                            {/* Show registration snapshot on first CREATE */}
                                            {isCreate && (
                                                <RegistrationSnapshot student={student} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentHistoryLogs;

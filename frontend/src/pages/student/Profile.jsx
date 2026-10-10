import React, { useEffect, useState, useCallback } from 'react';
import api, { getStaticFileUrlDirect } from '../../config/api';
import { User, Mail, Phone, MapPin, Calendar, Book, Hash, Lock, Shield, Clock, CheckCircle, Building2, GraduationCap } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import useAuthStore from '../../store/authStore';
import { VerifyProfileDialog } from '../../components/student/VerifyProfileDialog';
import { toast } from 'react-hot-toast';

const Profile = () => {
    const { user } = useAuthStore();
    const [studentData, setStudentData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showVerifyProfile, setShowVerifyProfile] = useState(false);

    // Change Password State
    const [showChangePassModal, setShowChangePassModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [changePassLoading, setChangePassLoading] = useState(false);


    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!newPassword) return;

        setChangePassLoading(true);
        try {
            const response = await api.post('/students/change-password', { newPassword });
            if (response.data.success) {
                toast.success('Password updated successfully');
                setShowChangePassModal(false);
                setNewPassword('');
            } else {
                toast.error(response.data.message || 'Failed to update password');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update password');
        } finally {
            setChangePassLoading(false);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await api.get(`/students/${user.admission_number}`);

                if (response.data.success) {
                    setStudentData(response.data.data);
                }
            } catch (error) {
                console.error('Error fetching profile:', error);
                toast.error('Failed to load profile details');
            } finally {
                setLoading(false);
            }
        };

        if (user?.admission_number) {
            fetchProfile();
        }
    }, [user]);

    // Keep these before any early return so hook count is stable every render
    const displayData = studentData || user;
    const getStudentData = useCallback((key, fallback = 'N/A') => {
        if (!displayData || !displayData.student_data) return fallback;
        const dataKeys = Object.keys(displayData.student_data);
        const foundKey = dataKeys.find(k => k.toLowerCase() === key.toLowerCase());
        const val = foundKey ? displayData.student_data[foundKey] : undefined;
        return val !== undefined && val !== null && val !== '' ? val : fallback;
    }, [displayData]);



    const formatDate = (rawDate) => {
        if (!rawDate || rawDate === 'N/A' || rawDate === '—') return 'N/A';
        try {
            const str = rawDate.toString().trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
                const parts = str.split('T')[0].split('-');
                if (parts.length === 3) {
                    const [y, m, d] = parts;
                    return `${d}/${m}/${y}`;
                }
            }
            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                const day = String(parsed.getDate()).padStart(2, '0');
                const month = String(parsed.getMonth() + 1).padStart(2, '0');
                const year = parsed.getFullYear();
                return `${day}/${month}/${year}`;
            }
        } catch (e) {}
        return rawDate;
    };

    if (loading) {
        return (
            <div className="space-y-4 lg:space-y-6 flex flex-col p-1 w-full max-w-full overflow-x-hidden animate-pulse">
                {/* Header Skeleton */}
                <div className="relative mb-6 shrink-0">
                    <SkeletonBox height="h-28 lg:h-32" className="rounded-2xl" />
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-14 lg:-mt-16 relative z-10">
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 lg:p-5 flex flex-col md:flex-row items-center md:items-end gap-5">
                            <SkeletonBox height="h-28 w-28 lg:h-32 lg:w-32" className="rounded-full border-[5px] border-white shrink-0" />
                            <div className="flex-1 text-center md:text-left pb-1 space-y-2">
                                <SkeletonBox height="h-8" width="w-48" className="mx-auto md:mx-0" />
                                <SkeletonBox height="h-4" width="w-32" className="mx-auto md:mx-0" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pb-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl shadow border border-gray-100 p-4 h-64 flex flex-col gap-4">
                            <div className="flex items-center gap-3 border-b border-gray-50 pb-2">
                                <SkeletonBox height="h-8" width="w-8" className="rounded-lg" />
                                <SkeletonBox height="h-4" width="w-32" />
                            </div>
                            <div className="space-y-3 flex-1">
                                {Array.from({ length: 4 }).map((_, j) => (
                                    <div key={j} className="space-y-1">
                                        <SkeletonBox height="h-3" width="w-24" />
                                        <SkeletonBox height="h-4" width="w-32" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Helpers used only after loading (no hooks below)
    const getCertificateStatus = () => {
        const status = displayData.certificates_status || getStudentData('Certificates Status') || 'Pending';
        return status;
    };

    const profileActionBtn =
        'inline-flex items-center justify-center gap-1.5 sm:gap-2 min-w-0 w-full px-2 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-widest shadow-lg transition-all hover:-translate-y-0.5 active:scale-95 whitespace-nowrap';

    return (
        <div className="space-y-5 sm:space-y-6 lg:space-y-8 flex flex-col p-1 sm:p-2 w-full max-w-full overflow-x-hidden scroll-smooth bg-slate-100/80">
            {/* Header */}
            <div className="relative mb-1 shrink-0">
                <div className="h-28 sm:h-36 lg:h-44 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-r from-[#0b63e5] via-[#024ebd] to-[#013fae] shadow-xl overflow-hidden relative">
                    <div className="absolute inset-0 bg-white/5" />
                    <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
                    <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
                </div>

                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 -mt-16 sm:-mt-20 lg:-mt-24 relative z-10">
                    <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl shadow-slate-300/40 border border-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6 lg:gap-8 min-w-0">
                            {/* Profile Image (Circle) */}
                            <div className="relative group shrink-0 -mt-10 sm:-mt-14 lg:-mt-16">
                                <div className="h-24 w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-full border-4 border-white bg-white shadow-xl overflow-hidden flex items-center justify-center">
                                    {displayData.student_photo ? (
                                        <img
                                            src={displayData.student_photo}
                                            alt={displayData.student_name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <User size={48} className="text-gray-200 sm:w-16 sm:h-16" />
                                    )}
                                </div>
                            </div>

                            {/* Name & Details */}
                            <div className="flex-1 min-w-0 text-center sm:text-left pb-0 sm:pb-1 w-full">
                                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight tracking-tight mb-1 break-words">
                                    {displayData.student_name || user.name}
                                </h1>
                                <div className="flex flex-row items-center justify-center sm:justify-start gap-2 sm:gap-3 text-[11px] sm:text-xs font-black tracking-wide my-1.5 flex-nowrap whitespace-nowrap">
                                    <span className="bg-blue-50 text-blue-700 px-2.5 sm:px-3 py-1 rounded-xl border border-blue-100 shadow-xs shrink-0">
                                        Adm: {displayData.admission_number || user?.admission_number || '20230353'}
                                    </span>
                                    <span className="bg-indigo-50 text-indigo-700 px-2.5 sm:px-3 py-1 rounded-xl border border-indigo-100 shadow-xs shrink-0">
                                        Pin: {displayData.pin_no || displayData.pin_number || displayData.pin || getStudentData('PIN') || getStudentData('Pin Number') || getStudentData('Pin No') || 'Not Assigned'}
                                    </span>
                                    {(displayData.roll_number || getStudentData('Temporary Roll Number') || getStudentData('Temp Roll No') || getStudentData('temporary_roll_number') || getStudentData('Roll Number')) && (
                                        <span className="bg-purple-50 text-purple-700 px-2.5 sm:px-3 py-1 rounded-xl border border-purple-100 shadow-xs shrink-0">
                                            Temp Roll: {displayData.roll_number || getStudentData('Temporary Roll Number') || getStudentData('Temp Roll No') || getStudentData('temporary_roll_number') || getStudentData('Roll Number')}
                                        </span>
                                    )}
                                </div>

                                {/* College, Branch & Year side-by-side with Lucide Icons */}
                                <div className="mt-3 flex flex-row flex-wrap items-center justify-center sm:justify-start gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-700 font-bold bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-100 w-full">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Building2 size={14} className="text-blue-600 shrink-0" />
                                        <span className="truncate">{displayData.college || getStudentData('College') || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <GraduationCap size={14} className="text-emerald-600 shrink-0" />
                                        <span className="truncate">
                                            {(() => {
                                                const c = displayData.course || getStudentData('Program') || getStudentData('Course');
                                                const b = displayData.branch || getStudentData('Branch') || getStudentData('Branch Name');
                                                if (c && b && c !== b) return `${c} - ${b}`;
                                                return c || b || '—';
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Calendar size={14} className="text-amber-600 shrink-0" />
                                        <span>Year {displayData.current_year || getStudentData('Year') || '—'} / Sem {displayData.current_semester || getStudentData('Semister') || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions — always one horizontal row */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full min-w-0 border-t border-slate-100 pt-4 sm:pt-5">
                            <button
                                type="button"
                                onClick={() => setShowVerifyProfile(true)}
                                className={`${profileActionBtn} bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/80`}
                            >
                                <CheckCircle size={16} className="shrink-0 sm:w-5 sm:h-5" />
                                <span className="truncate">Authenticate</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowChangePassModal(true)}
                                className={`${profileActionBtn} bg-slate-900 hover:bg-slate-800 text-white shadow-slate-300/80`}
                            >
                                <Lock size={16} className="shrink-0 sm:w-5 sm:h-5" />
                                <span className="truncate">Change Password</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Cards — Personal Card & Connect Card Stacked Vertically */}
            <div className="flex flex-col gap-4 sm:gap-5 flex-1 min-h-0 pb-2">
                {/* Personal Information Card */}
                <div className="bg-blue-50/90 rounded-2xl shadow-sm border border-blue-100 p-3 sm:p-5 hover:shadow-md transition-all flex flex-col min-w-0">
                    <div className="flex items-center gap-2.5 mb-3 sm:mb-4 shrink-0 border-b border-blue-100/80 pb-2.5">
                        <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                            <User size={18} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-blue-900 uppercase tracking-widest">Personal Details</h2>
                    </div>

                    <div className="space-y-3 flex-1">
                        {/* Row 1: Father Name | Gender | Date of Birth (3 columns side-by-side) */}
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                            <InfoItem label="Father" value={displayData.father_name || getStudentData('Father Name')} />
                            <InfoItem label="Gender" value={displayData.gender || getStudentData('Gender')} />
                            <InfoItem label="DOB" value={formatDate(displayData.dob || getStudentData('DOB'))} />
                        </div>

                        {/* Row 2: Caste/Subcaste | Aadhar Number (2 columns side-by-side) */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3 border-t border-dashed border-slate-200/80 pt-2.5">
                            <InfoItem label="Caste / Subcaste" value={displayData.caste || getStudentData('Caste')} />
                            <InfoItem label="Aadhar Number" value={displayData.adhar_no || getStudentData('Adhar No')} />
                        </div>
                    </div>
                </div>

                {/* Connect / Contact Information Card */}
                <div className="bg-amber-50/90 rounded-2xl shadow-sm border border-amber-100 p-3 sm:p-5 hover:shadow-md transition-all flex flex-col min-w-0">
                    <div className="flex items-center gap-2.5 mb-3 sm:mb-4 shrink-0 border-b border-amber-100/80 pb-2.5">
                        <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                            <MapPin size={18} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-amber-900 uppercase tracking-widest">Connect Details</h2>
                    </div>

                    <div className="space-y-3 flex-1">
                        {/* Row 1: Student Mobile | Parent Mobile 1 | Parent Mobile 2 (3 columns side-by-side) */}
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                            <InfoItem label="Student" value={displayData.student_mobile || getStudentData('Student Mobile number')} />
                            <InfoItem label="Parent 1" value={displayData.parent_mobile1 || getStudentData('Parent Mobile Number 1')} />
                            <InfoItem label="Parent 2" value={displayData.parent_mobile2 || getStudentData('Parent Mobile Number 2')} />
                        </div>

                        {/* Row 2: Full Address | City/Village (2 columns side-by-side) */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3 border-t border-dashed border-slate-200/80 pt-2.5">
                            <InfoItem label="Full Address" value={displayData.student_address || getStudentData('Student Address')} />
                            <InfoItem label="City / Village" value={displayData.city_village || getStudentData('City')} />
                        </div>

                        {/* Row 3: Mandal | District (2 columns side-by-side) */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3 border-t border-dashed border-slate-200/80 pt-2.5">
                            <InfoItem label="Mandal" value={displayData.mandal_name || getStudentData('Mandal')} />
                            <InfoItem label="District" value={displayData.district || getStudentData('District')} />
                        </div>
                    </div>
                </div>
            </div>


            {/* Change Password Modal */}
            {showChangePassModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in duration-200 border border-gray-100">
                        <button
                            onClick={() => setShowChangePassModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 hover:bg-gray-100 rounded-full p-1"
                        >
                            <span className="text-xl font-bold px-2">&times;</span>
                        </button>

                        <div className="mb-6 text-center">
                            <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Lock size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Change Password</h3>
                            <p className="text-sm text-gray-500 mt-1">Protect your account with a strong password</p>
                        </div>

                        <form onSubmit={handleChangePassword}>
                            <div className="mb-5">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all bg-gray-50 focus:bg-white text-sm"
                                    placeholder="Min. 6 characters"
                                    minLength={6}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={changePassLoading}
                                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 transform active:scale-95 transition-all shadow-md hover:shadow-lg"
                            >
                                {changePassLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Verify Profile Dialog */}
            <VerifyProfileDialog
                isOpen={showVerifyProfile}
                onClose={() => setShowVerifyProfile(false)}
                studentData={displayData}
            />
        </div>
    );
};

const InfoItem = ({ label, value }) => (
    <div className="flex flex-col bg-white/70 p-2 sm:p-2.5 rounded-xl border border-slate-200/50 hover:bg-white transition-colors min-w-0">
        <dt className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 leading-tight truncate">{label}</dt>
        <dd className="text-slate-900 font-extrabold text-xs sm:text-sm break-words leading-tight" title={value?.toString()}>
            {value || 'N/A'}
        </dd>
    </div>
);

export default Profile;



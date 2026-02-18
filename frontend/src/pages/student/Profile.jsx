import React, { useEffect, useState, useCallback } from 'react';
import api, { getStaticFileUrlDirect } from '../../config/api';
import { User, Mail, Phone, MapPin, Calendar, Book, Hash, Lock, Shield, Clock, CreditCard, Download, X } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import DigitalStudentCard from '../../components/DigitalStudentCard';
import useAuthStore from '../../store/authStore';
import { toast } from 'react-hot-toast';

const Profile = () => {
    const { user } = useAuthStore();
    const [studentData, setStudentData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Change Password State
    const [showChangePassModal, setShowChangePassModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [changePassLoading, setChangePassLoading] = useState(false);

    // Digital Student ID Card: view modal and download
    const [showIdCardModal, setShowIdCardModal] = useState(false);
    const [idCardPdfLoading, setIdCardPdfLoading] = useState(false);

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

    const handleDownloadIdCardPDF = useCallback(async () => {
        if (!displayData) return;
        setIdCardPdfLoading(true);
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF('p', 'mm', [74, 105]);
            const cardW = 74;
            const cardH = 105;
            const redBarW = 12;
            const red = [160, 30, 40];

            const name = displayData.student_name || getStudentData('Student Name') || '—';
            // User requested Pin No instead of Roll No
            const pinNumber = displayData.pin_no || getStudentData('PIN NO') || getStudentData('pin_no') || displayData.admission_number || getStudentData('Admission Number') || '—';
            const college = displayData.college || getStudentData('College') || '—';
            const program = displayData.course || getStudentData('Program') || '—';
            const branch = displayData.branch || getStudentData('Branch') || '—';
            const batch = displayData.batch || getStudentData('Batch') || '—';
            const addressRaw = displayData.student_address || getStudentData('Student Address') || getStudentData('Address') || '';
            const address = String(addressRaw).trim() || '—';
            const phoneRaw = displayData.student_mobile || getStudentData('Student Mobile number') || getStudentData('Phone') || getStudentData('Student Mobile') || '';
            const phone = String(phoneRaw).trim() || '—';
            const bloodGroup = displayData.blood_group || getStudentData('Blood Group') || getStudentData('B.Group') || '—';
            const course = [program, branch].filter(Boolean).join(' - ') || '—';

            doc.setFillColor(...red);
            doc.rect(0, 0, redBarW, cardH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22); // Significantly increased size
            const letters = ['P', 'Y', 'D', 'A', 'H'];
            const startY = (cardH - (letters.length * 12)) / 2 + 8; // Adjust centering for larger font
            letters.forEach((letter, i) => {
                doc.text(letter, redBarW / 2, startY + i * 14, { align: 'center' }); // Increase vertical gap
            });

            let x = redBarW + 3;
            let y = 8;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10); // Slightly larger header
            // User requested to remove "Pydah" from header since it's on the side
            const displayCollege = college.replace(/^Pydah\s+/i, '');
            doc.text(displayCollege.length > 32 ? displayCollege.substring(0, 31) + '…' : displayCollege, (redBarW + cardW) / 2, y, { align: 'center' });
            y += 7;

            // Updated Photo dimensions: 35x35mm centered square
            const photoW = 35;
            const photoH = 35;
            const photoX = x + (cardW - redBarW - 6 - photoW) / 2;
            doc.setFillColor(...red);
            doc.rect(photoX - 1, y - 1, photoW + 2, photoH + 2, 'F'); // Border

            const photo = displayData.student_photo;
            const photoUrl = photo
                ? (photo.startsWith('http') || photo.startsWith('data:')) ? photo : getStaticFileUrlDirect(photo)
                : '';
            if (photoUrl && photoUrl.startsWith('data:')) {
                try {
                    doc.addImage(photoUrl, 'JPEG', photoX, y, photoW, photoH);
                } catch {
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(7);
                    doc.text('Photo', photoX + photoW / 2 - 4, y + photoH / 2 + 2);
                }
            } else {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.text('Photo', photoX + photoW / 2 - 4, y + photoH / 2 + 2);
            }
            doc.setTextColor(0, 0, 0);
            y += photoH + 5;

            // Add Digital ID Card label
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.text('DIGITAL STUDENT ID CARD', (redBarW + cardW) / 2, y, { align: 'center' });
            y += 6;

            doc.setFontSize(7);
            const detailLineH = 3.5;
            const colonX = x + 12; // Fixed X position for colons
            const valueX = colonX + 3; // Fixed X position for values

            const row = (label, value) => {
                const str = String(value);
                doc.setFont('helvetica', 'bold');
                doc.text(label, x, y);
                doc.text(':', colonX, y); // Aligned colon
                doc.setFont('helvetica', 'normal');

                const maxWidth = cardW - valueX - 3;
                const lines = doc.splitTextToSize(str, maxWidth);
                doc.text(lines, valueX, y);

                y += Math.max(lines.length, 1) * detailLineH + 1.2;
            };

            row('PIN No', pinNumber);
            row('Name', name);
            row('Batch', batch);
            row('Course', course);
            row('Address', address);
            row('Phone', phone);
            // row('B.Group', bloodGroup); // Removed as requested

            doc.setFillColor(...red);
            doc.rect(0, cardH - 10, cardW, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.text('Yanam Road, Patavala, Kakinada. Ph: 0884-2315333', cardW / 2, cardH - 4, { align: 'center' });

            doc.save(`student_id_${pinNumber || 'card'}.pdf`);
            toast.success('Digital student ID card downloaded');
        } catch (err) {
            console.error('Failed to generate ID card PDF:', err);
            toast.error('Failed to download PDF');
        } finally {
            setIdCardPdfLoading(false);
        }
    }, [displayData, getStudentData]);

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4 pb-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl shadow border border-gray-100 p-4 h-64 flex flex-col gap-4">
                            <div className="flex items-center gap-3 border-b border-gray-50 pb-2">
                                <SkeletonBox height="h-8" width="w-8" className="rounded-lg" />
                                <SkeletonBox height="h-4" width="w-32" />
                            </div>
                            <div className="space-y-3 flex-1">
                                {Array.from({ length: 5 }).map((_, j) => (
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
    const get = (path, fallback = 'N/A') => {
        if (!displayData) return fallback;
        return displayData[path] || fallback;
    };
    const getCertificateStatus = () => {
        const status = displayData.certificates_status || getStudentData('Certificates Status') || 'Pending';
        return status;
    };

    return (
        <div className="space-y-4 lg:space-y-6 flex flex-col p-1 w-full max-w-full overflow-x-hidden">
            {/* Premium Header Section */}
            <div className="relative mb-6 shrink-0">
                <div className="h-28 lg:h-32 rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-800 shadow-xl overflow-hidden relative">
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px]"></div>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_50%)]"></div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-14 lg:-mt-16 relative z-10">
                    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 p-4 lg:p-5 flex flex-col md:flex-row items-center md:items-end gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Profile Image */}
                        <div className="relative group shrink-0">
                            <div className="h-28 w-28 lg:h-32 lg:w-32 rounded-full border-[5px] border-white bg-white shadow-xl overflow-hidden flex items-center justify-center relative z-10">
                                {displayData.student_photo ? (
                                    <img
                                        src={displayData.student_photo}
                                        alt={displayData.student_name}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                ) : (
                                    <User size={64} className="text-gray-300" />
                                )}
                            </div>
                            <div className="absolute bottom-2 right-2 z-20 transform translate-x-1 translate-y-1">
                                {getCertificateStatus().toLowerCase().includes('verified') ? (
                                    <div className="bg-green-500 text-white p-1.5 rounded-full border-[3px] border-white shadow-sm" title="Verified Student">
                                        <Shield size={16} fill="currentColor" />
                                    </div>
                                ) : (
                                    <div className="bg-yellow-500 text-white p-1.5 rounded-full border-[3px] border-white shadow-sm" title="Verification Pending">
                                        <Clock size={16} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Name & Details */}
                        <div className="flex-1 text-center md:text-left pb-1">
                            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 leading-tight tracking-tight">{displayData.student_name || user.name}</h1>
                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 mt-1 text-gray-500">
                                <span className="font-semibold text-blue-600 tracking-wide">{displayData.admission_number || user.admission_number}</span>
                            </div>

                            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-wider shadow-sm border ${getCertificateStatus().toLowerCase().includes('verified')
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    }`}>
                                    <span className={`w-2 h-2 rounded-full mr-2 ${getCertificateStatus().toLowerCase().includes('verified') ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                                    {getCertificateStatus()}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] lg:text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 uppercase tracking-wider shadow-sm">
                                    {displayData.stud_type || getStudentData('StudType') || 'Student'}
                                </span>
                            </div>
                        </div>

                        {/* Digital ID Card button + Change Password */}
                        <div className="w-full md:w-auto mt-2 md:mt-0 flex flex-wrap items-center justify-center md:justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowIdCardModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                            >
                                <CreditCard size={18} />
                                Digital ID Card
                            </button>
                            <button
                                onClick={() => setShowChangePassModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg group active:scale-95"
                            >
                                <Lock size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                                Change Password
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0 pb-2">
                {/* Personal Information */}
                <div className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-100 p-4 hover:shadow-lg transition-all duration-300 flex flex-col border-t-4 border-t-blue-500 min-w-0">
                    <div className="flex items-center gap-3 mb-3 shrink-0 border-b border-gray-50 pb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <User size={18} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800 tracking-tight">Personal Data</h3>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Father's Name" value={displayData.father_name || getStudentData('Father Name')} />
                        <InfoItem label="Gender" value={displayData.gender || getStudentData('Gender')} />
                        <InfoItem label="Date of Birth" value={displayData.dob || getStudentData('DOB')} />
                        <InfoItem label="Caste/Category" value={displayData.caste || getStudentData('Caste')} />
                        <InfoItem label="Aadhar Number" value={displayData.adhar_no || getStudentData('Adhar No')} />
                    </div>
                </div>

                {/* Contact Information */}
                <div className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-100 p-4 hover:shadow-lg transition-all duration-300 flex flex-col border-t-4 border-t-green-500 min-w-0">
                    <div className="flex items-center gap-3 mb-3 shrink-0 border-b border-gray-50 pb-2">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <Phone size={18} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800 tracking-tight">Contact Details</h3>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Student Mobile" value={displayData.student_mobile || getStudentData('Student Mobile number')} />
                        <InfoItem label="Parent Mobile 1" value={displayData.parent_mobile1 || getStudentData('Parent Mobile Number 1')} />
                        <InfoItem label="Parent Mobile 2" value={displayData.parent_mobile2 || getStudentData('Parent Mobile Number 2')} />
                    </div>
                </div>

                {/* Academic Information */}
                <div className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-100 p-4 hover:shadow-lg transition-all duration-300 flex flex-col border-t-4 border-t-purple-500 min-w-0">
                    <div className="flex items-center gap-3 mb-3 shrink-0 border-b border-gray-50 pb-2">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Book size={18} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800 tracking-tight">Academic Info</h3>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="College" value={displayData.college || getStudentData('College')} />
                        <InfoItem label="Program" value={displayData.course || getStudentData('Program')} />
                        <InfoItem label="Branch" value={displayData.branch || getStudentData('Branch')} />
                        <div className="grid grid-cols-2 gap-3">
                            <InfoItem label="Year" value={displayData.current_year || getStudentData('Year')} />
                            <InfoItem label="Semester" value={displayData.current_semester || getStudentData('Semister')} />
                        </div>
                        <InfoItem label="Batch" value={displayData.batch || getStudentData('Batch')} />
                    </div>
                </div>

                {/* Address & Other Details */}
                <div className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-100 p-4 hover:shadow-lg transition-all duration-300 flex flex-col border-t-4 border-t-red-500 min-w-0">
                    <div className="flex items-center gap-3 mb-3 shrink-0 border-b border-gray-50 pb-2">
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                            <MapPin size={18} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800 tracking-tight">Address & Location</h3>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Full Address" value={displayData.student_address || getStudentData('Student Address')} />
                        <InfoItem label="City/Village" value={displayData.city_village || getStudentData('City')} />
                        <InfoItem label="Mandal" value={displayData.mandal_name || getStudentData('Mandal')} />
                        <InfoItem label="District" value={displayData.district || getStudentData('District')} />
                    </div>
                </div>
            </div>

            {/* View Digital Student ID Card Modal */}
            {showIdCardModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-200 border border-gray-100">
                        <button
                            onClick={() => setShowIdCardModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 z-10"
                            aria-label="Close"
                        >
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-lg font-bold text-gray-900">Digital Student ID Card</h3>
                        </div>
                        <div className="flex justify-center">
                            <DigitalStudentCard student={displayData} getStudentData={getStudentData} />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowIdCardModal(false)}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={async () => { await handleDownloadIdCardPDF(); setShowIdCardModal(false); }}
                                disabled={idCardPdfLoading}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                            >
                                <Download size={16} />
                                {idCardPdfLoading ? 'Downloading…' : 'Download PDF'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
        </div>
    );
};

const InfoItem = ({ label, value }) => (
    <div className="flex flex-col border-b border-dashed border-gray-100 py-2 last:border-0 last:pb-0 hover:bg-gray-50 transition-colors rounded-lg px-2 -mx-2">
        <dt className="text-[10px] lg:text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 min-w-0 truncate">{label}</dt>
        <dd className="text-gray-900 font-semibold text-sm truncate leading-tight min-w-0" title={value?.toString()}>
            {value || 'N/A'}
        </dd>
    </div>
);

export default Profile;



import React, { useEffect, useState, useCallback } from 'react';
import api, { getStaticFileUrlDirect } from '../../config/api';
import { User, Mail, Phone, MapPin, Calendar, Book, Hash, Lock, Shield, Clock, CreditCard, Download, X, CheckCircle } from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import DigitalStudentCard from '../../components/DigitalStudentCard';
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

            // Same dimensions as DigitalStudentCard rendered at 380px wide
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [90, 140] });
            const W = 90, H = 140;

            // Helper field access
            const get = (key) => displayData[key] || getStudentData(key) || '';
            const name = get('student_name') || '—';
            const pinNumber = get('pin_no') || get('admission_number') || '—';
            const college = get('college') || '—';
            const program = get('course') || '—';
            const branch = get('branch') || '';
            const batch = get('batch') || '—';
            const studentMobile = get('student_mobile') || getStudentData('Student Mobile number') || '—';
            const parentMobile = get('parent_mobile1') || getStudentData('Parent Mobile Number 1') || '—';
            const addressParts = [get('student_address'), get('city_village'), get('district')].filter(Boolean);
            const address = addressParts.join(', ') || '—';
            const photo = displayData.student_photo;
            const photoSrc = photo && (photo.startsWith('data:') || photo.startsWith('http')) ? photo : '';

            // ── BACKGROUND ──
            doc.setFillColor(248, 249, 250);
            doc.rect(0, 0, W, H, 'F');

            // ── RED TOP SHAPES (mirrors DigitalStudentCard SVG) ──
            doc.setFillColor(185, 28, 28); // #b91c1c dark red
            doc.triangle(0, 0, W, 0, W, 12, 'F');
            doc.triangle(0, 0, W, 12, 45, 30, 'F');
            doc.triangle(0, 0, 45, 30, 0, 10, 'F');
            // lighter red accent triangle
            doc.setFillColor(239, 68, 68); // #ef4444
            doc.triangle(W, 12, W, 22, 55, 40, 'F');

            // ── LOGO PILL ──
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(W / 2 - 18, 5, 36, 22, 3, 3, 'F');
            try {
                const logoResp = await fetch('/logo.png');
                const logoBlob = await logoResp.blob();
                const logoDataUrl = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.readAsDataURL(logoBlob);
                });
                doc.addImage(logoDataUrl, 'PNG', W / 2 - 16, 6, 32, 20, undefined, 'FAST');
            } catch (_) { }

            // ── PHOTO BOX (left side) ──
            const photoX = 7, photoY = 40, photoW = 27, photoH = 36;
            doc.setFillColor(248, 248, 248);
            doc.setDrawColor(230, 230, 230);
            doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, 'FD');
            if (photoSrc) {
                try {
                    doc.addImage(photoSrc, 'JPEG', photoX, photoY, photoW, photoH, undefined, 'FAST');
                } catch (_) {
                    try { doc.addImage(photoSrc, 'PNG', photoX, photoY, photoW, photoH, undefined, 'FAST'); } catch (__) { }
                }
            }

            // ── RIGHT COLUMN FIELDS ──
            const infoX = photoX + photoW + 4;
            const infoW = W - infoX - 4;
            let iy = 42;
            const fieldsToShow = [
                ['NAME', name.toUpperCase()],
                ['PROGRAM', program],
                ...(branch ? [['BRANCH', branch]] : []),
                ['PIN', pinNumber],
                ['BATCH', batch],
                ['STUDENT', studentMobile],
                ['PARENT', parentMobile],
            ];
            doc.setFontSize(5.5);
            fieldsToShow.forEach(([label, value]) => {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(150, 150, 150);
                doc.text(label, infoX, iy);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                const lines = doc.splitTextToSize(String(value || '—'), infoW - 17);
                doc.text(lines[0] || '—', infoX + 17, iy);
                iy += 4.8;
            });

            // ── DASHED DIVIDER ──
            const divY = Math.max(photoY + photoH + 3, iy + 2);
            doc.setDrawColor(200, 200, 200);
            doc.setLineDashPattern([1, 1], 0);
            doc.line(7, divY, W - 7, divY);
            doc.setLineDashPattern([], 0);

            // ── ADDRESS TEXT ──
            doc.setFontSize(5);
            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'bold');
            doc.text('ADDRESS', 9, divY + 5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(70, 70, 70);
            const addrLines = doc.splitTextToSize(address, 48);
            addrLines.slice(0, 3).forEach((ln, i) => doc.text(ln, 9, divY + 9 + i * 3.8));

            // ── QR CODE (from DOM or generate new vCard) ──
            const qrX = W - 26, qrY = divY + 2, qrSize = 20;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(210, 210, 210);
            doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'FD');
            try {
                // Pull the QR SVG from the existing DigitalStudentCard in the modal
                const qrEl = document.querySelector('.digital-id-card-qr svg') ||
                    document.querySelector('[data-qr-admission] svg') ||
                    document.querySelector('#qr-id-card svg');
                if (qrEl) {
                    const svgData = new XMLSerializer().serializeToString(qrEl);
                    const canvas = document.createElement('canvas');
                    canvas.width = 100; canvas.height = 100;
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    await new Promise(resolve => {
                        img.onload = () => { ctx.drawImage(img, 0, 0, 100, 100); resolve(); };
                        img.onerror = () => resolve();
                        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    });
                    doc.addImage(canvas.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);
                } else {
                    // Render a QR via qrcode.react approach using canvas API
                    const { QRCodeCanvas } = await import('qrcode.react').catch(() => ({}));
                    if (!QRCodeCanvas) throw new Error('no qr');
                    const tempDiv = document.createElement('div');
                    tempDiv.style.position = 'fixed'; tempDiv.style.left = '-9999px';
                    document.body.appendChild(tempDiv);
                    const { createRoot } = await import('react-dom/client');
                    const { createElement } = await import('react');
                    const root = createRoot(tempDiv);
                    const admNo = displayData.admission_number || displayData.admission_no || pinNumber;
                    const qrValue = `${window.location.origin}/qr/${encodeURIComponent(admNo)}`;
                    root.render(createElement(QRCodeCanvas, { value: qrValue, size: 100, id: '__pdf_qr_tmp__' }));
                    await new Promise(r => setTimeout(r, 200));
                    const canvasEl = tempDiv.querySelector('canvas');
                    if (canvasEl) doc.addImage(canvasEl.toDataURL(), 'PNG', qrX, qrY, qrSize, qrSize);
                    root.unmount();
                    document.body.removeChild(tempDiv);
                }
            } catch (_) { }

            // ── RED FOOTER BAR ──
            doc.setFillColor(185, 28, 28);
            doc.roundedRect(0, H - 9, W, 11, 3, 3, 'F');
            doc.rect(0, H - 9, W, 5, 'F'); // flatten top rounded corners
            doc.setFontSize(5.5);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            const collegeTrunc = college.length > 48 ? college.substring(0, 45) + '...' : college;
            doc.text(collegeTrunc.toUpperCase(), W / 2, H - 3, { align: 'center' });

            doc.save(`ID_Card_${pinNumber || name}.pdf`);
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 pb-2">
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

    const profileActionBtn =
        'inline-flex items-center justify-center gap-1.5 sm:gap-2 min-w-0 w-full px-2 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-widest shadow-lg transition-all hover:-translate-y-0.5 active:scale-95 whitespace-nowrap';

    return (
        <div className="space-y-5 sm:space-y-6 lg:space-y-8 flex flex-col p-1 sm:p-2 w-full max-w-full overflow-x-hidden bg-slate-100/80">
            {/* Header */}
            <div className="relative mb-1 shrink-0">
                <div className="h-28 sm:h-36 lg:h-44 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-500 shadow-xl overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/40 to-emerald-600/30" />
                    <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
                    <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
                </div>

                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 -mt-16 sm:-mt-20 lg:-mt-24 relative z-10">
                    <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl shadow-slate-300/40 border border-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6 lg:gap-8 min-w-0">
                            {/* Profile Image */}
                            <div className="relative group shrink-0">
                                <div className="h-24 w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-2xl sm:rounded-[2rem] border-4 border-white bg-white shadow-xl overflow-hidden flex items-center justify-center">
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
                                <div className="absolute bottom-1 right-1 z-20">
                                    {getCertificateStatus().toLowerCase().includes('verified') ? (
                                        <div className="bg-green-500 text-white p-1 rounded-full border-2 border-white shadow-sm" title="Verified Student">
                                            <Shield size={14} fill="currentColor" />
                                        </div>
                                    ) : (
                                        <div className="bg-yellow-500 text-white p-1 rounded-full border-2 border-white shadow-sm" title="Verification Pending">
                                            <Clock size={14} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Name & Details */}
                            <div className="flex-1 min-w-0 text-center sm:text-left pb-0 sm:pb-1 w-full">
                                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight tracking-tight mb-1 break-words">
                                    {displayData.student_name || user.name}
                                </h1>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                    <span className="font-extrabold text-indigo-600 tracking-widest text-xs sm:text-sm">
                                        {displayData.admission_number || user.admission_number}
                                    </span>
                                    {displayData.roll_number && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-extrabold tracking-wide">
                                            {displayData.roll_number}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-3 mt-3">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest border-2 ${getCertificateStatus().toLowerCase().includes('verified')
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        : 'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${getCertificateStatus().toLowerCase().includes('verified') ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        {getCertificateStatus()}
                                    </span>
                                    <span className="inline-flex items-center px-3 py-1 rounded-lg text-[9px] sm:text-[10px] font-black text-slate-600 bg-slate-50 border-2 border-slate-100 uppercase tracking-widest">
                                        {displayData.stud_type || getStudentData('StudType') || 'Student'} Core
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 text-[11px] sm:text-xs text-slate-600 font-bold bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 w-full sm:w-max max-w-full">
                                    <div className="flex items-center justify-center sm:justify-start gap-2 min-w-0">
                                        <Book size={14} className="text-indigo-500 shrink-0" />
                                        <span className="truncate">{displayData.college || getStudentData('College') || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                        <Hash size={14} className="text-emerald-500 shrink-0" />
                                        <span className="truncate">{displayData.course || getStudentData('Program') || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                        <Calendar size={14} className="text-amber-500 shrink-0" />
                                        <span>Year {displayData.current_year || getStudentData('Year') || '—'} / Sem {displayData.current_semester || getStudentData('Semister') || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions — always one horizontal row */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full min-w-0 border-t border-slate-100 pt-4 sm:pt-5">
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
                                onClick={() => setShowIdCardModal(true)}
                                className={`${profileActionBtn} bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/80`}
                            >
                                <CreditCard size={16} className="shrink-0 sm:w-5 sm:h-5" />
                                <span className="truncate">Digital ID</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowChangePassModal(true)}
                                className={`${profileActionBtn} bg-slate-900 hover:bg-slate-800 text-white shadow-slate-300/80`}
                            >
                                <Lock size={16} className="shrink-0 sm:w-5 sm:h-5" />
                                <span className="truncate">Security</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 flex-1 min-h-0 pb-2">
                {/* Personal Information */}
                <div className="bg-blue-50/90 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-blue-100/60 border border-blue-100 p-5 sm:p-6 lg:p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col min-w-0 group">
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5 shrink-0 border-b border-blue-100/80 pb-3 sm:pb-4">
                        <div className="p-2.5 sm:p-3 bg-blue-600 text-white rounded-xl sm:rounded-2xl shadow-md shadow-blue-200">
                            <User size={22} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-blue-900 uppercase tracking-widest">Personal</h2>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Father's Name" value={displayData.father_name || getStudentData('Father Name')} />
                        <InfoItem label="Gender" value={displayData.gender || getStudentData('Gender')} />
                        <InfoItem label="Date of Birth" value={displayData.dob || getStudentData('DOB')} />
                        <InfoItem label="Caste/Subcaste" value={displayData.caste || getStudentData('Caste')} />
                        <InfoItem label="Aadhar Number" value={displayData.adhar_no || getStudentData('Adhar No')} />
                    </div>
                </div>

                {/* Contact & Address */}
                <div className="bg-amber-50/90 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-amber-100/60 border border-amber-100 p-5 sm:p-6 lg:p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col min-w-0 group">
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5 shrink-0 border-b border-amber-100/80 pb-3 sm:pb-4">
                        <div className="p-2.5 sm:p-3 bg-amber-500 text-white rounded-xl sm:rounded-2xl shadow-md shadow-amber-200">
                            <MapPin size={22} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-amber-900 uppercase tracking-widest">Connect</h2>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Student Mobile" value={displayData.student_mobile || getStudentData('Student Mobile number')} />
                        <InfoItem label="Parent Mobile 1" value={displayData.parent_mobile1 || getStudentData('Parent Mobile Number 1')} />
                        <InfoItem label="Parent Mobile 2" value={displayData.parent_mobile2 || getStudentData('Parent Mobile Number 2')} />
                        <InfoItem label="Full Address" value={displayData.student_address || getStudentData('Student Address')} />
                        <InfoItem label="City/Village" value={displayData.city_village || getStudentData('City')} />
                        <InfoItem label="Mandal" value={displayData.mandal_name || getStudentData('Mandal')} />
                        <InfoItem label="District" value={displayData.district || getStudentData('District')} />
                    </div>
                </div>

                {/* Academic Information */}
                <div className="bg-emerald-50/90 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-emerald-100/60 border border-emerald-100 p-5 sm:p-6 lg:p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col min-w-0 group">
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5 shrink-0 border-b border-emerald-100/80 pb-3 sm:pb-4">
                        <div className="p-2.5 sm:p-3 bg-emerald-600 text-white rounded-xl sm:rounded-2xl shadow-md shadow-emerald-200">
                            <Book size={22} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-emerald-900 uppercase tracking-widest">Academic</h2>
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

                {/* Additional Details */}
                <div className="bg-violet-50/90 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-violet-100/60 border border-violet-100 p-5 sm:p-6 lg:p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col min-w-0 group sm:col-span-2 xl:col-span-1">
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5 shrink-0 border-b border-violet-100/80 pb-3 sm:pb-4">
                        <div className="p-2.5 sm:p-3 bg-violet-600 text-white rounded-xl sm:rounded-2xl shadow-md shadow-violet-200">
                            <Shield size={22} />
                        </div>
                        <h2 className="text-xs sm:text-sm font-black text-violet-900 uppercase tracking-widest">Metadata</h2>
                    </div>

                    <div className="space-y-1 flex-1">
                        <InfoItem label="Certificate Status" value={getCertificateStatus()} />
                        <InfoItem label="Student Type" value={displayData.stud_type || getStudentData('StudType')} />
                        <InfoItem label="Regulation" value={displayData.regulation || getStudentData('Regulation')} />
                    </div>
                </div>
            </div>

            {/* Digital ID Card CTA */}
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-indigo-100/50 border border-indigo-100/50 p-10 flex flex-col md:flex-row items-center justify-between gap-10 mb-10 w-full max-w-full overflow-hidden relative">
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl"></div>

                <div className="flex-1 space-y-4 text-center md:text-left relative z-10">
                    <div className="inline-flex items-center justify-center p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-lg shadow-indigo-200 shrink-0 mx-auto md:mx-0">
                        <CreditCard size={32} />
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900">Academic Credential</h3>
                    <p className="text-sm text-gray-500 max-w-lg">
                        Click <strong>View ID Card</strong> to see your digital student card, or download it as a PDF for offline access.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start pt-1">
                        <button
                            type="button"
                            onClick={() => setShowIdCardModal(true)}
                            className="inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700 hover:-translate-y-1 active:scale-95"
                        >
                            <CreditCard size={18} />
                            Inspect Credential
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadIdCardPDF}
                            disabled={idCardPdfLoading}
                            className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 transition-all hover:bg-slate-800 hover:-translate-y-1 active:scale-95 disabled:opacity-60"
                        >
                            <Download size={18} />
                            {idCardPdfLoading ? 'Transmitting…' : 'Export PDF'}
                        </button>
                    </div>
                </div>

                {/* Mini card preview illustration */}
                <div className="shrink-0 hidden lg:flex items-center justify-center relative z-10">
                    <div className="w-32 h-44 rounded-3xl bg-white border-2 border-indigo-50 shadow-2xl rotate-3 group-hover:rotate-0 transition-all duration-700 overflow-white relative">
                        {/* Indigo top */}
                        <div className="absolute top-0 left-0 right-0 h-14 bg-indigo-600" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 40%, 50% 100%, 0 60%)' }} />
                        {/* Logo dot */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-7 bg-white rounded-lg shadow-sm flex items-center justify-center">
                            <img src="/logo.png" alt="" className="h-5 w-auto object-contain" />
                        </div>
                        {/* Photo placeholder */}
                        <div className="absolute top-14 left-2 w-9 h-11 rounded-lg bg-gray-200 border border-white flex items-center justify-center overflow-hidden">
                            {displayData.student_photo
                                ? <img src={displayData.student_photo} alt="" className="w-full h-full object-cover" />
                                : <User size={16} className="text-gray-400" />}
                        </div>
                        {/* Lines */}
                        <div className="absolute top-14 left-13 right-2 space-y-1" style={{ left: '46px' }}>
                            {[70, 60, 50, 40].map((w, i) => (
                                <div key={i} className="h-1.5 bg-gray-200 rounded-full" style={{ width: `${w}%` }} />
                            ))}
                        </div>
                        {/* Indigo footer */}
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-indigo-600 flex items-center justify-center">
                            <div className="h-1 w-20 bg-white/50 rounded-full" />
                        </div>
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
    <div className="flex flex-col border-b border-dashed border-slate-200/70 py-2 last:border-0 last:pb-0 hover:bg-white/50 transition-colors rounded-lg px-2 -mx-2">
        <dt className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 min-w-0 truncate">{label}</dt>
        <dd className="text-slate-900 font-semibold text-sm break-words leading-tight min-w-0" title={value?.toString()}>
            {value || 'N/A'}
        </dd>
    </div>
);

export default Profile;



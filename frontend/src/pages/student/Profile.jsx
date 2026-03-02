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

                            {/* NEW: Display Academic Snapshot below the badges */}
                            <div className="mt-4 flex flex-col md:flex-row md:items-center gap-1 md:gap-3 text-xs md:text-sm text-gray-600 font-medium bg-gray-50/80 p-3 rounded-xl border border-gray-100/50 w-full md:w-max">
                                <div className="flex items-center gap-1.5 whitespace-nowrap"><Book size={14} className="text-indigo-500" /> {displayData.college || getStudentData('College') || '—'}</div>
                                <span className="hidden md:inline text-gray-300">•</span>
                                <div className="flex items-center gap-1.5 whitespace-nowrap">{displayData.course || getStudentData('Program') || '—'}</div>
                                <span className="hidden md:inline text-gray-300">•</span>
                                <div className="flex items-center gap-1.5 whitespace-nowrap">Year {displayData.current_year || getStudentData('Year') || '—'} <span>/</span> Sem {displayData.current_semester || getStudentData('Semister') || '—'}</div>
                            </div>
                        </div>

                        {/* Digital ID Card button + Change Password + Verify Profile */}
                        <div className="w-full md:w-auto mt-2 md:mt-0 flex flex-wrap items-center justify-center md:justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowVerifyProfile(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                            >
                                <CheckCircle size={18} />
                                Verify Profile
                            </button>
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

            {/* Digital ID Card CTA — card is shown in modal only */}
            <div className="bg-gradient-to-br from-red-50/60 to-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-red-100 p-6 flex flex-col md:flex-row items-center justify-between gap-6 mb-8 w-full max-w-full overflow-hidden">
                <div className="flex-1 space-y-3 text-center md:text-left">
                    <div className="inline-flex items-center justify-center p-2.5 bg-red-100 text-red-700 rounded-xl shrink-0 mx-auto md:mx-0">
                        <CreditCard size={24} />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-gray-900">Your Digital ID Card</h3>
                    <p className="text-sm text-gray-500 max-w-lg">
                        Click <strong>View ID Card</strong> to see your digital student card, or download it as a PDF for offline access.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start pt-1">
                        <button
                            type="button"
                            onClick={() => setShowIdCardModal(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-700 text-white rounded-xl text-sm font-bold hover:bg-red-800 transition-all shadow-md active:scale-95"
                        >
                            <CreditCard size={16} />
                            View ID Card
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadIdCardPDF}
                            disabled={idCardPdfLoading}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-60 transition-all shadow-md active:scale-95"
                        >
                            <Download size={16} />
                            {idCardPdfLoading ? 'Downloading…' : 'Download PDF'}
                        </button>
                    </div>
                </div>

                {/* Mini card preview illustration (static, not interactive) */}
                <div className="shrink-0 hidden md:flex items-center justify-center">
                    <div className="w-28 h-40 rounded-2xl bg-[#f8f9fa] border-2 border-red-200 shadow-lg overflow-hidden relative">
                        {/* Red top */}
                        <div className="absolute top-0 left-0 right-0 h-12 bg-red-700" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 40%, 50% 100%, 0 60%)' }} />
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
                        {/* Red footer */}
                        <div className="absolute bottom-0 left-0 right-0 h-5 bg-red-700 flex items-center justify-center">
                            <div className="h-1 w-16 bg-white/50 rounded-full" />
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
    <div className="flex flex-col border-b border-dashed border-gray-100 py-2 last:border-0 last:pb-0 hover:bg-gray-50 transition-colors rounded-lg px-2 -mx-2">
        <dt className="text-[10px] lg:text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 min-w-0 truncate">{label}</dt>
        <dd className="text-gray-900 font-semibold text-sm truncate leading-tight min-w-0" title={value?.toString()}>
            {value || 'N/A'}
        </dd>
    </div>
);

export default Profile;



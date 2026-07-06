import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    Phone,
    ShieldCheck,
    ArrowRight,
    CheckCircle,
    Loader2,
    Smartphone,
    BookOpen,
    RefreshCw,
    FileText,
    Zap,
    AlertCircle,
    X,
    Award
} from 'lucide-react';
import { SkeletonBox } from '../../components/SkeletonLoader';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import api from '../../config/api';
import {
  isStudentMobileVerifiedForCycle,
  isParentMobileVerifiedForCycle
} from '../../config/registrationCycle';
import {
  computeRegistrationStageDisplays,
  RegistrationStageBadge
} from '../../config/registrationStages.jsx';
import { usesSemesterWiseScholarshipStatus } from '../../config/scholarshipConfig';

const SemesterRegistration = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false); // Action loading
    const [initialLoading, setInitialLoading] = useState(true);
    const [studentData, setStudentData] = useState(null);
    const [scholarshipData, setScholarshipData] = useState(null);
    const [activeStepId, setActiveStepId] = useState(null); // For Modal

    // Step 1 State: Verification
    const [verificationState, setVerificationState] = useState({
        studentMobile: '',
        parentMobile: '',
        studentOtpSent: false,
        parentOtpSent: false,
        studentOtp: '',
        parentOtp: '',
        studentVerified: false,
        parentVerified: false
    });

    // Fetch student details
    const fetchStudentDetails = async () => {
        try {
            if (!user?.admission_number) return;
            // setInitialLoading(true); // Don't full reload UI on refresh
            const response = await api.get(`/students/${user.admission_number}`);
            const scholarshipResponse = await api.get(`/student-scholarship/${encodeURIComponent(user.admission_number)}`);

            if (response.data.success) {
                const student = response.data.data;
                const sData = student.student_data || {};
                const parsedData = typeof sData === 'string'
                  ? (() => { try { return JSON.parse(sData || '{}'); } catch { return {}; } })()
                  : sData;
                const studentVerified = isStudentMobileVerifiedForCycle(
                  parsedData,
                  student.current_year,
                  student.current_semester
                );
                const parentVerified = isParentMobileVerifiedForCycle(
                  parsedData,
                  student.current_year,
                  student.current_semester
                );

                setStudentData(student);
                setVerificationState(prev => ({
                    ...prev,
                    studentMobile: student.student_mobile || '',
                    parentMobile: student.parent_mobile1 || student.parent_mobile2 || '',
                    studentVerified,
                    parentVerified
                }));
            }

            if (scholarshipResponse.data?.success) {
                setScholarshipData(scholarshipResponse.data.data);
            } else {
                setScholarshipData(null);
            }
        } catch (error) {
            console.error('Error fetching student details:', error);
            toast.error('Failed to load student details');
        } finally {
            setInitialLoading(false);
        }
    };

    useEffect(() => {
        fetchStudentDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // ------------ LOGIC HANDLERS ------------

    const handleSendOTP = async (type) => {
        const mobile = type === 'student' ? verificationState.studentMobile : verificationState.parentMobile;
        if (!mobile || mobile.length < 10) {
            toast.error(`Invalid ${type} mobile number`);
            return;
        }
        setLoading(true);
        try {
            const response = await api.post('/students/otp/send', {
                admissionNumber: user.admission_number,
                mobileNumber: mobile,
                year: studentData?.current_year || 'N/A',
                semester: studentData?.current_semester || 'N/A',
                type: type.charAt(0).toUpperCase() + type.slice(1)
            });
            if (response.data.success) {
                setVerificationState(prev => ({
                    ...prev,
                    [type === 'student' ? 'studentOtpSent' : 'parentOtpSent']: true
                }));
                toast.success(`OTP sent to ${mobile.slice(-4).padStart(10, '*')}`);
            } else {
                toast.error(response.data.message || 'Failed to send OTP');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (type) => {
        const otp = type === 'student' ? verificationState.studentOtp : verificationState.parentOtp;
        const mobile = type === 'student' ? verificationState.studentMobile : verificationState.parentMobile;

        if (!otp || otp.length !== 6) {
            toast.error('Enter valid 6-digit OTP');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/students/otp/verify', {
                admissionNumber: user.admission_number,
                mobileNumber: mobile,
                otp: otp,
                type: type // 'student' or 'parent'
            });
            if (response.data.success) {
                setVerificationState(prev => ({
                    ...prev,
                    [type === 'student' ? 'studentVerified' : 'parentVerified']: true
                }));
                toast.success('Mobile verified successfully!');
                // Automatically refresh data - backend will auto-complete if this was the last step
                fetchStudentDetails();
            } else {
                toast.error(response.data.message || 'Invalid OTP');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    // ------------ STATUS CHECKERS ------------

    const registrationStages = useMemo(
      () => computeRegistrationStageDisplays(studentData, scholarshipData),
      [studentData, scholarshipData]
    );

    const getStepStatus = (id) => {
        if (!studentData) return 'pending';

        switch (id) {
            case 1:
                return registrationStages.verification.completed ? 'completed' : 'pending';
            case 2:
                return registrationStages.certificates.completed ? 'completed' : 'pending';
            case 3:
                return registrationStages.fee.completed ? 'completed' : 'pending';
            case 4:
                return registrationStages.promotion.completed ? 'completed' : 'pending';
            case 5:
                return registrationStages.scholarship.completed ? 'completed' : 'pending';
            default:
                return 'pending';
        }
    };

    const isStepCompleted = (id) => getStepStatus(id) === 'completed';

    const canFinalize = () => {
        // All 5 stages must be complete for registration to finalize.
        // Step 5 (scholarship) uses isScholarshipRegistrationComplete which respects
        // semester-wise (2026+) vs legacy logic — see registrationStages.jsx.
        return isStepCompleted(1) && isStepCompleted(2) && isStepCompleted(3) && isStepCompleted(4) && isStepCompleted(5);
    };

    const autoFinalizedRef = React.useRef(false);

    // Auto-completion effect — fires once when all 5 stages become complete
    useEffect(() => {
        // Already completed — nothing to do
        if ((studentData?.registration_status || '').toLowerCase() === 'completed') {
            autoFinalizedRef.current = false; // reset so future cycles can re-trigger
            return;
        }
        // Guard: don't run during loading or before data is ready
        if (initialLoading || loading || !studentData) return;
        // Guard: don't re-trigger if we already finalized this cycle
        if (autoFinalizedRef.current) return;
        // All 5 stages must be complete
        if (!canFinalize()) return;

        autoFinalizedRef.current = true;
        const autoFinalize = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/students/${user.admission_number}`);
                if (response.data?.success) {
                    setStudentData(response.data.data);
                    toast.success('Registration finalized automatically!');
                }
            } catch (e) {
                console.error('Auto-finalize sync error:', e);
                autoFinalizedRef.current = false;
            } finally {
                setLoading(false);
            }
        };
        autoFinalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLoading, scholarshipData, verificationState, registrationStages]);

    // ------------ DATA & CONFIG ------------

    const steps = [
        {
            id: 1,
            title: 'Verification',
            description: 'Verify student and parent mobile numbers.',
            icon: ShieldCheck,
            color: 'blue'
        },
        {
            id: 2,
            title: 'Certificates',
            description: 'Check certificate verification status.',
            icon: FileText,
            color: 'purple'
        },
        {
            id: 3,
            title: 'Fee Status',
            description: 'View fee payment status.',
            icon: BookOpen,
            color: 'green'
        },
        {
            id: 4,
            title: 'Promotion',
            description: 'Your current academic year and semester placement.',
            icon: Zap,
            color: 'orange'
        },
        {
            id: 5,
            title: 'Scholarship',
            description: 'Scholarship status must be assigned (Required).',
            icon: Award,
            color: 'indigo'
        }
    ];

    if (initialLoading) {
        return (
            <div className="max-w-6xl mx-auto space-y-8 animate-pulse pb-20">
                <div className="space-y-2">
                    <SkeletonBox height="h-8" width="w-64" />
                    <SkeletonBox height="h-4" width="w-96" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl p-6 border-l-4 border-gray-200 h-48 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <SkeletonBox height="h-12" width="w-12" className="rounded-xl" />
                                <SkeletonBox height="h-6" width="w-20" className="rounded-full" />
                            </div>
                            <div className="space-y-2">
                                <SkeletonBox height="h-6" width="w-32" />
                                <SkeletonBox height="h-4" width="w-full" />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg lg:pl-64">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <div className="space-y-1">
                            <SkeletonBox height="h-4" width="w-32" />
                            <SkeletonBox height="h-3" width="w-48" />
                        </div>
                        <SkeletonBox height="h-12" width="w-48" className="rounded-lg" />
                    </div>
                </div>
            </div>
        );
    }

    // Already Completed View — show if DB says completed OR all 5 stages are verified complete
    const regStatus = (studentData?.registration_status || '').toLowerCase();
    const isActuallyComplete = regStatus === 'completed' || (!initialLoading && canFinalize());
    if (isActuallyComplete) {
        return (
            <div className="max-w-4xl mx-auto py-10 animate-fade-in">
                <div className="bg-green-600 rounded-3xl p-10 text-white shadow-sm relative overflow-hidden">
                    <div className="relative z-10 text-center">
                        <div className="mx-auto w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-6 backdrop-blur-sm">
                            <CheckCircle size={40} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-bold mb-4">You're All Set!</h1>
                        <p className="text-emerald-100 text-lg mb-8 max-w-xl mx-auto">
                            Your semester registration is complete. You can access your dashboard and courses now.
                        </p>
                        <button
                            onClick={() => navigate('/student/dashboard')}
                            className="bg-white text-green-700 px-8 py-3 rounded-xl font-bold hover:bg-green-50 transition-colors shadow-lg"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                    {/* Decor elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -ml-16 -mb-16"></div>
                </div>
            </div>
        );
    }

    const currentYear = studentData?.current_year ?? '1';
    const currentSemester = studentData?.current_semester ?? '1';

    const stageSummaryItems = [
        { id: 1, title: 'Mobile Verification', stage: registrationStages.verification },
        { id: 2, title: 'Certificate Status', stage: registrationStages.certificates },
        { id: 3, title: 'Fee Payment', stage: registrationStages.fee },
        { id: 4, title: 'Promotion Status', stage: registrationStages.promotion },
        { id: 5, title: 'Scholarship Status', stage: registrationStages.scholarship }
    ];

    const getStageForStep = (stepId) => {
        const item = stageSummaryItems.find((entry) => entry.id === stepId);
        return item?.stage;
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 heading-font">Semester Registration</h1>
                <p className="text-gray-500 mt-1">Complete the steps below to register for the upcoming semester.</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2 w-fit">
                    <BookOpen size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="font-medium">Current:</span>
                    <span>Year {currentYear}, Semester {currentSemester}</span>
                </div>
            </div>

            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide px-1">
                    Registration Stages
                </h2>
                <div className="grid grid-cols-1 gap-3">
                    {stageSummaryItems.map((item) => (
                        <div
                            key={item.id}
                            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{item.id}. {item.title}</p>
                                {item.id === 1 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Student: {verificationState.studentMobile || 'No number'} • Parent: {verificationState.parentMobile || 'No number'}
                                    </p>
                                )}
                                {item.id === 2 && (
                                    <p className="text-xs text-gray-500 mt-1 capitalize">
                                        Current Status: {registrationStages.certStatus || 'Pending'}
                                    </p>
                                )}
                                {item.id === 3 && (
                                    <p className="text-xs text-gray-500 mt-1 capitalize">
                                        Current Status: {registrationStages.feeStatus || 'Pending'}
                                    </p>
                                )}
                                {item.id === 4 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Year {currentYear} • Sem {currentSemester}
                                    </p>
                                )}
                                {item.id === 5 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        {usesSemesterWiseScholarshipStatus(studentData?.batch, currentYear)
                                            ? `Year ${currentYear} • Sem ${currentSemester} from scholarship records`
                                            : `Year ${currentYear} status from scholarship records`}
                                    </p>
                                )}
                            </div>
                            <RegistrationStageBadge display={item.stage.display} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Steps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {steps.map(step => {
                    const isComplete = isStepCompleted(step.id);
                    const Icon = step.icon;
                    const stage = getStageForStep(step.id);

                    return (
                        <div
                            key={step.id}
                            onClick={() => setActiveStepId(step.id)}
                            className={`
                                relative bg-white rounded-2xl p-6 border-l-4 transition-all duration-300 cursor-pointer hover:shadow-md hover:-translate-y-1 group shadow-sm
                                ${isComplete
                                    ? 'border-l-green-500 border-gray-100 bg-green-50/10'
                                    : 'border-l-red-500 border-red-50 bg-white hover:bg-red-50/10'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl ${isComplete ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                    <Icon size={24} />
                                </div>
                                {isComplete ? (
                                    <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                        <CheckCircle size={12} />
                                        DONE
                                    </div>
                                ) : (
                                    <div className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                                        <AlertCircle size={12} />
                                        PENDING
                                    </div>
                                )}
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                {step.title}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {step.description}
                            </p>
                            {stage && (
                                <div className="mt-3">
                                    <RegistrationStageBadge display={stage.display} />
                                </div>
                            )}

                            <div className="mt-4 flex items-center text-blue-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                View Details <ArrowRight size={16} className="ml-1" />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Final Action Bar */}
            {/* Footer replaced with Status Info */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-30 lg:pl-64">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-900">Registration Status</p>
                        <p className="text-xs text-gray-500">Your registration will be automatically finalized once all steps are completed.</p>
                    </div>
                    <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                        <Zap size={16} className="animate-pulse" />
                        Automated System Active
                    </div>
                </div>
            </div>

            {/* Modal Overlay */}
            {activeStepId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                {React.createElement(steps.find(s => s.id === activeStepId).icon, { className: 'text-blue-600' })}
                                {steps.find(s => s.id === activeStepId).title}
                            </h2>
                            <button
                                onClick={() => setActiveStepId(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Content - Scrollable */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Content based on Step ID */}

                            {/* STEP 1: VERIFICATION */}
                            {activeStepId === 1 && (
                                <div className="space-y-6">
                                    <div className="flex justify-center">
                                        <RegistrationStageBadge display={registrationStages.verification.display} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Student Mobile</label>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Smartphone size={18} className="text-gray-400" />
                                                <span className="font-mono text-gray-700">{verificationState.studentMobile || 'Not Found'}</span>
                                            </div>
                                            {!verificationState.studentVerified ? (
                                                verificationState.studentOtpSent ? (
                                                    <div className="flex gap-2">
                                                        <input
                                                            className="w-full p-2 border rounded text-center font-mono"
                                                            placeholder="OTP"
                                                            maxLength={6}
                                                            value={verificationState.studentOtp}
                                                            onChange={e => setVerificationState({ ...verificationState, studentOtp: e.target.value })}
                                                        />
                                                        <button onClick={() => handleVerifyOTP('student')} className="bg-green-600 text-white px-3 rounded hover:bg-green-700">Verify</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => handleSendOTP('student')} disabled={loading} className="w-full py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium text-sm">Send OTP</button>
                                                )
                                            ) : (
                                                <div className="w-full py-2 bg-green-100 text-green-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm"><CheckCircle size={16} /> Verified</div>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Parent Mobile</label>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Phone size={18} className="text-gray-400" />
                                                <span className="font-mono text-gray-700">{verificationState.parentMobile || 'Not Found'}</span>
                                            </div>
                                            {!verificationState.parentVerified ? (
                                                verificationState.parentOtpSent ? (
                                                    <div className="flex gap-2">
                                                        <input
                                                            className="w-full p-2 border rounded text-center font-mono"
                                                            placeholder="OTP"
                                                            maxLength={6}
                                                            value={verificationState.parentOtp}
                                                            onChange={e => setVerificationState({ ...verificationState, parentOtp: e.target.value })}
                                                        />
                                                        <button onClick={() => handleVerifyOTP('parent')} className="bg-green-600 text-white px-3 rounded hover:bg-green-700">Verify</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => handleSendOTP('parent')} disabled={loading} className="w-full py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium text-sm">Send OTP</button>
                                                )
                                            ) : (
                                                <div className="w-full py-2 bg-green-100 text-green-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm"><CheckCircle size={16} /> Verified</div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-gray-400">Both verifications are required to proceed.</p>
                                </div>
                            )}

                            {/* STEP 2: CERTIFICATES */}
                            {activeStepId === 2 && (
                                <div className="text-center">
                                    <div className="flex justify-center mb-6">
                                        <RegistrationStageBadge display={registrationStages.certificates.display} />
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6 capitalize">
                                        Current Status: {studentData?.certificates_status || 'Pending'}
                                    </p>
                                    {!isStepCompleted(2) && (
                                        <div className="bg-yellow-50 text-yellow-800 p-6 rounded-xl text-left border border-yellow-100">
                                            <h4 className="font-bold mb-3 flex items-center gap-2"><AlertCircle size={18} /> Action Required</h4>
                                            <p className="mb-4 text-sm">Please submit the original copies of the following documents to the administration office:</p>
                                            <ul className="list-disc list-inside space-y-2 text-sm ml-2">
                                                <li>SSC / 10th Class Certificate</li>
                                                <li>Intermediate / Diploma Certificate</li>
                                                <li>Aadhar Card & Photos</li>
                                                <li>Study Certificates</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STEP 3: FEE STATUS */}
                            {activeStepId === 3 && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="font-bold text-gray-700">Current Fee Status</h3>
                                        <button onClick={fetchStudentDetails} className="text-blue-600 text-sm hover:underline flex items-center gap-1"><RefreshCw size={14} /> Refresh</button>
                                    </div>

                                    <div className={`p-6 rounded-xl border text-center ${isStepCompleted(3) ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                        <div className="flex justify-center mb-3">
                                            <RegistrationStageBadge display={registrationStages.fee.display} />
                                        </div>
                                        <span className={`text-lg font-medium ${isStepCompleted(3) ? 'text-green-700' : 'text-red-700'} capitalize block`}>
                                            {studentData?.fee_status ? studentData.fee_status.replace(/_/g, ' ') : 'Pending'}
                                        </span>
                                        <p className="text-gray-500 text-sm mt-2">
                                            {isStepCompleted(3) ? 'You are cleared for registration.' : 'Please clear your dues to proceed.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* STEP 4: PROMOTION */}
                            {activeStepId === 4 && (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                                        <p className="text-sm text-gray-500 uppercase tracking-wider font-bold">Current Academic Stand</p>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-3xl font-bold text-gray-900">Year {studentData?.current_year || 1}</span>
                                            <span className="text-xl text-gray-600">Semester {studentData?.current_semester || 1}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                            Year {studentData?.current_year || 1} • Sem {studentData?.current_semester || 1}
                                        </span>
                                        <RegistrationStageBadge display={registrationStages.promotion.display} />
                                    </div>
                                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex items-start gap-3">
                                        <Zap className="text-blue-600 mt-1 flex-shrink-0" />
                                        <div>
                                            <h4 className="font-bold text-blue-900">Current semester placement</h4>
                                            <p className="text-blue-800 text-sm mt-1">
                                                You are registered for the year and semester shown above.
                                                Complete the other registration steps to finish semester registration.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STEP 5: SCHOLARSHIP */}
                            {activeStepId === 5 && (
                                <div className="text-center py-8">
                                    <Award size={48} className="text-indigo-200 mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-gray-900">Scholarship Status</h3>
                                    <p className="text-xs text-gray-400 mb-2">
                                        {usesSemesterWiseScholarshipStatus(studentData?.batch, studentData?.current_year || 1)
                                            ? `Year ${studentData?.current_year || 1} • Semester ${studentData?.current_semester || 1}`
                                            : `Year ${studentData?.current_year || 1}`}
                                    </p>
                                    <div className="flex justify-center my-4">
                                        <RegistrationStageBadge display={registrationStages.scholarship.display} />
                                    </div>
                                    {!registrationStages.scholarship.completed && (
                                        <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-left">
                                            <p className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
                                                <AlertCircle size={16} /> Pending Action
                                            </p>
                                            <p className="text-sm text-yellow-700 mt-1">
                                                Your scholarship status for this semester has not been set yet.
                                                Please contact the admin office to get it assigned.
                                            </p>
                                        </div>
                                    )}
                                    {registrationStages.scholarship.completed && (
                                        <p className="text-gray-500 text-sm mt-2">
                                            Your scholarship status is recorded. No further action needed.
                                        </p>
                                    )}
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={async () => {
                                    if (activeStepId === 4 && user?.admission_number) {
                                        try {
                                            await api.post(`/students/${encodeURIComponent(user.admission_number)}/registration/acknowledge-promotion`);
                                            await fetchStudentDetails();
                                        } catch (error) {
                                            console.error('Promotion acknowledge error:', error);
                                            toast.error(error.response?.data?.message || 'Failed to save promotion acknowledgement');
                                            return;
                                        }
                                    }
                                    setActiveStepId(null);
                                }}
                                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SemesterRegistration;

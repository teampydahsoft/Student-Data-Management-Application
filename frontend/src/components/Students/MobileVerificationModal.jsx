import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Shield, AlertCircle, Send, KeyRound, Smartphone } from 'lucide-react';
import api from '../../config/api';
import { toast } from 'react-hot-toast';

const MobileVerificationModal = ({ isOpen, onClose, student, onVerificationComplete }) => {
    const [loading, setLoading] = useState(false);
    const [selectedType, setSelectedType] = useState('student'); // 'student' or 'parent'
    const [otpSent, setOtpSent] = useState(false);
    const [otp, setOtp] = useState('');
    const [timer, setTimer] = useState(0);

    // Reset state when type changes or modal opens
    useEffect(() => {
        if (isOpen) {
            setOtpSent(false);
            setOtp('');
            setTimer(0);
        }
    }, [isOpen, selectedType]);

    // Timer countdown
    useEffect(() => {
        let interval;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [timer]);

    if (!isOpen || !student) return null;

    const studentMobile = student.student_mobile || student.student_data?.student_mobile;
    const parentMobile = student.parent_mobile1 || student.student_data?.parent_mobile1;

    const isStudentVerified = student.student_data?.is_student_mobile_verified === true;
    const isParentVerified = student.student_data?.is_parent_mobile_verified === true;

    const getCurrentMobile = () => {
        return selectedType === 'student' ? studentMobile : parentMobile;
    };

    const isCurrentVerified = () => {
        return selectedType === 'student' ? isStudentVerified : isParentVerified;
    };

    const handleSendOtp = async () => {
        const mobile = getCurrentMobile();
        if (!mobile) {
            toast.error('No mobile number available');
            return;
        }

        try {
            setLoading(true);
            const response = await api.post('/students/otp/send', {
                admissionNumber: student.admission_number,
                mobileNumber: mobile,
                type: selectedType,
                year: student.current_year || '1', // Default or fallback
                semester: student.current_semester || '1'
            });

            if (response.data.success) {
                toast.success('OTP sent successfully');
                setOtpSent(true);
                setTimer(60); // 60 seconds cooldown
            } else {
                toast.error(response.data.message || 'Failed to send OTP');
            }
        } catch (error) {
            console.error('Send OTP error:', error);
            toast.error(error.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            toast.error('Please enter a valid 6-digit OTP');
            return;
        }

        const mobile = getCurrentMobile();

        try {
            setLoading(true);
            const response = await api.post('/students/otp/verify', {
                admissionNumber: student.admission_number,
                mobileNumber: mobile,
                otp: otp,
                type: selectedType
            });

            if (response.data.success) {
                toast.success('Mobile verified successfully');

                // Construct the updated status object to pass back
                const updatedStatus = {
                    [selectedType === 'student' ? 'is_student_mobile_verified' : 'is_parent_mobile_verified']: true
                };

                onVerificationComplete(updatedStatus);

                // Reset check to see if we should close or switch
                setOtpSent(false);
                setOtp('');

                // If the other one is already verified, close modal?
                // Or just let user close it.
            } else {
                toast.error(response.data.message || 'Invalid OTP');
            }
        } catch (error) {
            console.error('Verify OTP error:', error);
            toast.error(error.response?.data?.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const maskMobile = (number) => {
        if (!number) return 'No Number';
        if (number.length < 4) return number;
        return number.slice(0, 2) + '******' + number.slice(-2);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Mobile Verification</h3>
                            <p className="text-xs text-gray-500">OTP-based verification</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    <div className="space-y-4">
                        {/* Type Selection */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setSelectedType('student'); setOtpSent(false); }}
                                className={`relative p-3 rounded-lg border-2 text-left transition-all ${selectedType === 'student'
                                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                {isStudentVerified && (
                                    <div className="absolute top-2 right-2 text-green-600 bg-white rounded-full">
                                        <CheckCircle size={16} fill="currentColor" className="text-white" />
                                        <CheckCircle size={16} className="absolute inset-0 text-green-600" />
                                    </div>
                                )}
                                <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</span>
                                <span className="block font-medium text-gray-900 mt-0.5 truncate">
                                    {studentMobile || 'No Number'}
                                </span>
                                <span className={`text-xs mt-2 inline-block px-1.5 py-0.5 rounded ${isStudentVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {isStudentVerified ? 'Verified' : 'Pending'}
                                </span>
                            </button>

                            <button
                                onClick={() => { setSelectedType('parent'); setOtpSent(false); }}
                                className={`relative p-3 rounded-lg border-2 text-left transition-all ${selectedType === 'parent'
                                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                {isParentVerified && (
                                    <div className="absolute top-2 right-2 text-green-600 bg-white rounded-full">
                                        <CheckCircle size={16} fill="currentColor" className="text-white" />
                                        <CheckCircle size={16} className="absolute inset-0 text-green-600" />
                                    </div>
                                )}
                                <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent</span>
                                <span className="block font-medium text-gray-900 mt-0.5 truncate">
                                    {parentMobile || 'No Number'}
                                </span>
                                <span className={`text-xs mt-2 inline-block px-1.5 py-0.5 rounded ${isParentVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {isParentVerified ? 'Verified' : 'Pending'}
                                </span>
                            </button>
                        </div>

                        {/* Action Area */}
                        <div className="pt-2">
                            {isCurrentVerified() ? (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                        <CheckCircle size={24} className="text-green-600" />
                                    </div>
                                    <h4 className="font-semibold text-green-800">Verified Successfully</h4>
                                    <p className="text-sm text-green-600 mt-1">
                                        The {selectedType} mobile number is verified.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {!otpSent ? (
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center space-y-4">
                                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                                <Smartphone size={24} className="text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600 mb-1">Send OTP to verify</p>
                                                <p className="font-semibold text-gray-900 text-lg tracking-wider">
                                                    {maskMobile(getCurrentMobile())}
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleSendOtp}
                                                disabled={loading || !getCurrentMobile()}
                                                className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                            >
                                                {loading ? (
                                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <Send size={16} /> Send OTP
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="text-center">
                                                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                                    <KeyRound size={24} className="text-purple-600" />
                                                </div>
                                                <h4 className="font-medium text-gray-900">Enter OTP</h4>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Sent to {maskMobile(getCurrentMobile())}
                                                </p>
                                            </div>

                                            <input
                                                type="text"
                                                value={otp}
                                                onChange={(e) => {
                                                    // Only allow numbers and max 6 digits
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                    setOtp(val);
                                                }}
                                                placeholder="- - - - - -"
                                                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                                                maxLength={6}
                                                disabled={loading}
                                                autoFocus
                                            />

                                            <button
                                                onClick={handleVerifyOtp}
                                                disabled={loading || otp.length < 6}
                                                className="w-full py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                            >
                                                {loading ? (
                                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    'Verify OTP'
                                                )}
                                            </button>

                                            <div className="text-center">
                                                {timer > 0 ? (
                                                    <p className="text-xs text-gray-400">
                                                        Resend in {timer}s
                                                    </p>
                                                ) : (
                                                    <button
                                                        onClick={handleSendOtp}
                                                        disabled={loading}
                                                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                                                    >
                                                        Resend OTP
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setOtpSent(false)}
                                                    className="block w-full mt-2 text-xs text-gray-400 hover:text-gray-600"
                                                >
                                                    Change Number
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default MobileVerificationModal;

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Loader2, Eye, EyeOff, Users } from 'lucide-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

import { motion } from 'framer-motion';

import { getMainAppLoginUrl } from '../utils/mainAppUrl';

const Login = ({ isStudent = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, userType } = useAuthStore();
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Use prop or fallback to route check (though prop is preferred now)
    const isStudentLogin = isStudent || location.pathname.startsWith('/student/login');

    useEffect(() => {
        if (isAuthenticated) {
            if (userType === 'student' || userType === 'requester') {
                navigate('/student/my-tickets');
            } else {
                navigate('/tickets');
            }
        }
    }, [isAuthenticated, navigate, userType, isStudentLogin]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.username || !formData.password) {
            toast.error('Please fill in all fields');
            return;
        }

        setLoading(true);

        const result = await login(formData.username, formData.password);

        setLoading(false);

        if (result.success) {
            toast.success('Login successful!');
            navigate(result.redirectPath);
        } else {
            toast.error(result.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-0 overflow-hidden">
            {/* Main Card Container */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-5xl bg-white rounded-none xl:rounded-2xl shadow-2xl overflow-hidden flex min-h-screen xl:min-h-[600px]"
            >

                {/* Left Side - Blue Panel (Hidden on mobile and tablet) */}
                <div
                    className="login-left-panel hidden xl:flex xl:w-1/2 bg-[#1A2517] text-white flex-col justify-between p-12 relative overflow-hidden"
                >

                    {/* Background Pattern/Accents */}
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl" />
                        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white rounded-full blur-3xl" />
                    </div>

                    {/* Top Content */}
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center mb-8 cursor-pointer hover:bg-white/30 transition-all">
                            <Users size={20} className="text-white" />
                        </div>
                        <h2 className="text-4xl font-bold mb-4">Support &<br />Ticket System</h2>
                        <p className="text-[#A3B18A] text-lg opacity-90">
                            Streamline your requests and track status in real-time.
                        </p>
                    </div>

                    {/* Center Illustration Placeholder */}
                    <div className="relative z-10 flex-1 flex items-center justify-center my-8">
                        <div className="relative w-64 h-64">
                            {/* Abstract representation using CSS/Logo */}
                            <div className="absolute inset-0 bg-white/10 rounded-full animate-pulse-subtle" />
                            <img
                                src={isStudentLogin ? "/logo.png" : "/logo.png"} // TODO: Use student-specific logo if available, e.g. /student-logo.png
                                alt="Illustration"
                                className="relative w-full h-full object-contain drop-shadow-2xl"
                                onError={(e) => e.target.style.display = 'none'}
                            />
                        </div>
                    </div>

                    {/* Bottom Content */}
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                            <div className="w-10 h-10 rounded-full bg-[#FAFAF5] flex items-center justify-center shadow-lg">
                                <Users size={18} className="text-[#1A2517]" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-[#A3B18A] uppercase tracking-wider">Connect With Us</p>
                                <p className="text-sm font-semibold">24/7 Support Center</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="w-full xl:w-1/2 p-6 sm:p-8 md:p-12 flex flex-col justify-center bg-white relative">
                    <div className="max-w-sm mx-auto w-full">
                        {/* Mobile Logo - Only show on larger mobile screens */}
                        <img
                            src="/logo.png"
                            alt="Logo"
                            className="h-12 sm:h-16 w-auto mx-auto mb-4 sm:mb-6 xl:hidden object-contain"
                        />

                        <div className="text-center mb-6 sm:mb-8">
                            <h2 className="text-xl sm:text-2xl xl:text-3xl font-bold text-gray-900 mb-2">
                                Welcome Back
                            </h2>
                            <p className="text-gray-500 text-xs sm:text-sm">
                                Sign in to your account to continue
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                            <div>
                                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                                    Username / Admission No / Employee ID
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 group-focus-within:text-[#1A2517] transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleChange}
                                        className="block w-full pl-9 sm:pl-10 pr-3 py-2.5 sm:py-3 bg-[#FAFAF5]/50 border border-gray-200 rounded-xl text-sm sm:text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A2517]/20 focus:border-[#1A2517] transition-all"
                                        placeholder="Enter Username, Admission No, or Employee ID"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                                    Password
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <LogIn className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 group-focus-within:text-[#1A2517] transition-colors" />
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="block w-full pl-9 sm:pl-10 pr-10 py-2.5 sm:py-3 bg-[#FAFAF5]/50 border border-gray-200 rounded-xl text-sm sm:text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A2517]/20 focus:border-[#1A2517] transition-all"
                                        placeholder="Enter your password"
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Eye size={16} className="sm:w-[18px] sm:h-[18px]" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center items-center py-2.5 sm:py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-[#1A2517] hover:bg-[#11180F] active:bg-[#11180F] transition-all transform hover:-translate-y-0.5"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        Sign In
                                    </>
                                )
                                }
                            </button>
                        </form>

                        <div className="mt-6 sm:mt-8 text-center space-y-3 sm:space-y-4">
                            <p className="text-xs text-gray-500 leading-relaxed px-2">
                                Staff &amp; students already signed in to the Student Portal should open{' '}
                                <span className="font-semibold text-gray-700">Maintenance</span> from the portal
                                sidebar (Workspace) — no second login needed.
                            </p>
                            <a
                                href={getMainAppLoginUrl(isStudentLogin)}
                                className="inline-flex text-xs sm:text-sm font-medium text-[#1A2517] hover:text-[#11180F] underline underline-offset-2"
                            >
                                Go to Student Portal
                            </a>
                            <button
                                type="button"
                                onClick={() => toast('Please contact administrator to reset password')}
                                className="block mx-auto text-xs sm:text-sm font-medium text-[#1A2517] hover:text-[#11180F] transition-colors"
                            >
                                Forgot Password?
                            </button>

                            <p className="text-[10px] sm:text-xs text-gray-400">
                                © {new Date().getFullYear()} Student Management System
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;

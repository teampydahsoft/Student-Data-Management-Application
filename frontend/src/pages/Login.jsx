import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { LogIn, Loader2, Eye, EyeOff, Users, Home, ArrowLeft } from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import api, { CRM_BACKEND_URL, CRM_FRONTEND_URL } from '../config/api';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, loginFromSSO, isAuthenticated, userType } = useAuthStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginType, setLoginType] = useState('student');

  // SSO state
  const [isVerifying, setIsVerifying] = useState(false);
  const [ssoError, setSsoError] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [userTypeReset, setUserTypeReset] = useState('student');

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotMobile) return;

    setForgotLoading(true);
    try {
      // Determine endpoint based on selection or context
      const targetUserType = isStudentLogin ? 'student' : userTypeReset;
      const endpoint = targetUserType === 'staff' ? '/auth/rbac/forgot-password' : '/students/forgot-password';

      const response = await api.post(endpoint, { mobileNumber: forgotMobile });
      if (response.data.success) {
        toast.success(response.data.message);
        setShowForgotModal(false);
        setForgotMobile('');
      } else {
        toast.error(response.data.message || 'Failed to clean password');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send password. Try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Determine if this is a student login based on route
  const isStudentLogin = location.pathname.startsWith('/student/login');

  const handleSSOLogin = useCallback(async (encryptedToken) => {
    setIsVerifying(true);
    setSsoError(null);
    try {
      const verifyRes = await fetch(`${CRM_BACKEND_URL}/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedToken }),
      });
      const text = await verifyRes.text();
      if (!text || !text.trim()) {
        throw new Error(`CRM verify-token returned empty response (status ${verifyRes.status}). Is the CRM backend running?`);
      }
      let verifyResult;
      try {
        verifyResult = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`CRM verify-token returned invalid JSON (status ${verifyRes.status}). Check CRM /auth/verify-token.`);
      }

      if (!verifyResult.success || !verifyResult.valid) {
        throw new Error(verifyResult.message || 'Token validation failed');
      }

      const { userId, role, portalId, expiresAt } = verifyResult.data || {};
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        throw new Error('Token has expired');
      }

      const sessionRes = await api.post('/auth/sso-session', {
        userId,
        role,
        portalId,
        ssoToken: encryptedToken,
      });

      if (!sessionRes.data?.success || !sessionRes.data?.token || !sessionRes.data?.user) {
        throw new Error('Failed to create local session');
      }

      const { token, user } = sessionRes.data;
      const result = loginFromSSO(token, user);
      toast.success('Login successful!');
      navigate(result.redirectPath, { replace: true });
    } catch (err) {
      console.error('SSO login error:', err);
      const msg = err.response?.data?.message || err.message || 'SSO login failed';
      setSsoError(msg);
      setShowLoginForm(true);
      toast.error(msg);
      setSearchParams({});
    } finally {
      setIsVerifying(false);
    }
  }, [navigate, loginFromSSO, setSearchParams]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleSSOLogin(token);
    } else {
      setShowLoginForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; token from URL
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isVerifying) {
      if (userType === 'student' || isStudentLogin) {
        navigate('/student/dashboard');
      } else {
        navigate('/');
      }
    }
  }, [isAuthenticated, navigate, userType, isStudentLogin, isVerifying]);

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

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-neutral-bg to-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!showLoginForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in overflow-x-hidden relative login-stars-optimized">
      {/* Home Button - Mobile Only (Desktop has it in the left panel) */}
      <button
        onClick={() => navigate('/', { replace: true })}
        className="lg:hidden absolute top-6 left-6 z-[100] flex items-center justify-center w-11 h-11 bg-white rounded-xl text-primary shadow-lg border border-primary/10 hover:bg-primary hover:text-white transition-all active:scale-90 cursor-pointer"
        title="Go to Home"
      >
        <Home size={22} />
      </button>

      {/* Main Card Container */}
      <div className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row lg:min-h-[800px] animate-fade-in-up border border-gray-100">

        {/* Left Side - Animation Panel */}
        <div className="hidden lg:flex lg:w-1/2 bg-[#1a2e1d] text-white flex-col justify-center p-12 relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />

          {/* Top Content: Home Button replaces Users icon */}
          <div className="absolute top-12 left-12 z-[50]">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center mb-8 cursor-pointer hover:bg-white/20 hover:scale-110 active:scale-95 transition-all group relative overflow-visible"
              title="Return Home"
            >
              <Home size={22} className="text-white group-hover:rotate-[-10deg] transition-transform" />
              {/* Tooltip hint on hover */}
              <span className="absolute -bottom-10 left-0 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Go to Landing
              </span>
            </button>
          </div>

          {/* Center Illustration: Lottie Animation */}
          <div className="relative z-10 flex-1 flex items-center justify-center p-4">
            <div className="w-full h-full max-w-[1200px] max-h-[850px] transform transition-transform duration-700 hover:scale-[1.02]">
              <DotLottieReact
                src="https://lottie.host/17e18e77-e03b-482f-9c53-dddbb979c260/Y5u2X2eTNf.lottie"
                loop
                autoplay
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-12 flex flex-col justify-center bg-white relative">
          {/* SSO error banner */}
          {ssoError && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-sm text-amber-800">{ssoError}</p>
              <a
                href={CRM_FRONTEND_URL}
                className="text-sm font-medium text-primary hover:text-primary-dark whitespace-nowrap"
              >
                Return to CRM Portal
              </a>
            </div>
          )}

          <div className="max-w-sm mx-auto w-full">
            {/* Branding Logo - Always on top for right side */}
            <div className="mb-10 flex flex-col items-center">
              <div className="p-4 bg-primary/5 rounded-3xl border border-primary/10 shadow-sm mb-4 group hover:bg-primary/10 transition-colors">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-16 w-auto object-contain transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 leading-tight">
                  Welcome Back
                </h2>
                <p className="text-gray-500 text-xs sm:text-sm font-medium">
                  Signin to access your portal
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username / Admission No
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 bg-neutral-bg/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Enter Username or Admission No"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LogIn className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-10 py-3 bg-neutral-bg/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-primary hover:bg-primary-dark active:bg-primary-dark transition-all transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center space-y-4">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
              >
                Forgot Password?
              </button>

              <p className="text-xs text-gray-400">
                © {new Date().getFullYear()} Student Management System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <EyeOff size={20} className="hidden" /> {/* Dummy icon usage to prevent unused err if I removed imports? No, I'll use X if available or text */}
              <span className="text-xl font-bold">&times;</span>
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">Enter your registered mobile number. We'll send you a new password via SMS.</p>

            {/* User Type Selection */}
            {!isStudentLogin && (
              <div className="flex gap-4 mb-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="userTypeReset"
                    checked={userTypeReset === 'student'}
                    onChange={() => setUserTypeReset('student')}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Student</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="userTypeReset"
                    checked={userTypeReset === 'staff'}
                    onChange={() => setUserTypeReset('staff')}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Staff / Admin</span>
                </label>
              </div>
            )}

            <form onSubmit={handleForgotSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input
                  type="tel"
                  value={forgotMobile}
                  onChange={(e) => setForgotMobile(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Enter mobile number"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {forgotLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                {forgotLoading ? 'Sending...' : 'Send New Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div >
  );
};

export default Login;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { LogIn, Loader2, Eye, EyeOff, Users, Home, Clock, User, ArrowRight, Phone, ShieldCheck } from 'lucide-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import api, { CRM_BACKEND_URL, CRM_FRONTEND_URL } from '../config/api';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    login,
    loginFromSSO,
    isAuthenticated,
    userType,
    sendParentOtp,
    verifyParentOtp,
    selectParentStudent
  } = useAuthStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const getTabFromPath = () => {
    if (location.pathname.startsWith('/parent/login')) return 'parent';
    if (location.pathname.startsWith('/student/login')) return 'student';
    return 'staff';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromPath());

  const [parentMobile, setParentMobile] = useState('');
  const [parentOtp, setParentOtp] = useState('');
  const [parentStep, setParentStep] = useState('mobile');
  const [parentLoading, setParentLoading] = useState(false);
  const [selectionToken, setSelectionToken] = useState(null);
  const [linkedStudents, setLinkedStudents] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // SSO state
  const [isVerifying, setIsVerifying] = useState(false);
  const [ssoError, setSsoError] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(false);

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotContact, setForgotContact] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [userTypeReset, setUserTypeReset] = useState('student');

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    const contact = forgotContact.trim();
    if (!contact) return;

    setForgotLoading(true);
    try {
      const targetUserType = isStudentLogin ? 'student' : userTypeReset;
      const endpoint = targetUserType === 'staff' ? '/auth/rbac/forgot-password' : '/students/forgot-password';

      const payload =
        targetUserType === 'staff'
          ? contact.includes('@')
            ? { email: contact }
            : { mobileNumber: contact }
          : { mobileNumber: contact };

      const response = await api.post(endpoint, payload);
      if (response.data.success) {
        toast.success(response.data.message);
        setShowForgotModal(false);
        setForgotContact('');
      } else {
        toast.error(response.data.message || 'Failed to send password');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send password. Try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const isStudentLogin = activeTab === 'student';
  const isParentLogin = activeTab === 'parent';

  useEffect(() => {
    setActiveTab(getTabFromPath());
  }, [location.pathname]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setParentStep('mobile');
    setParentOtp('');
    setSelectionToken(null);
    setLinkedStudents([]);
    if (tab === 'parent') navigate('/parent/login', { replace: true });
    else if (tab === 'student') navigate('/student/login', { replace: true });
    else navigate('/login', { replace: true });
  };

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
        throw new Error(`CRM verify-token returned empty response`);
      }
      let verifyResult;
      try {
        verifyResult = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`CRM verify-token returned invalid JSON`);
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
  }, [handleSSOLogin]);

  useEffect(() => {
    if (isAuthenticated && !isVerifying) {
      if (userType === 'parent') {
        navigate('/parent/dashboard');
      } else if (userType === 'student' || isStudentLogin) {
        navigate('/student/dashboard');
      } else {
        navigate('/');
      }
    }
  }, [isAuthenticated, navigate, userType, isStudentLogin, isVerifying]);

  const handleParentSendOtp = async (e) => {
    e.preventDefault();
    if (!parentMobile.trim()) {
      toast.error('Enter your registered mobile number');
      return;
    }
    setParentLoading(true);
    try {
      const result = await sendParentOtp(parentMobile.trim());
      if (result.success) {
        toast.success(result.message || 'OTP sent');
        setParentStep('otp');
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Request timed out or failed. Please try again.');
    } finally {
      setParentLoading(false);
    }
  };

  const handleParentVerifyOtp = async (e) => {
    e.preventDefault();
    if (!parentOtp.trim()) {
      toast.error('Enter the OTP');
      return;
    }
    setParentLoading(true);
    try {
      const result = await verifyParentOtp(parentMobile.trim(), parentOtp.trim());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.requiresSelection) {
        setSelectionToken(result.selectionToken);
        setLinkedStudents(result.students || []);
        setParentStep('select');
        toast.success('Select your child to continue');
        return;
      }
      toast.success('Login successful!');
      navigate(result.redirectPath);
    } catch {
      toast.error('Verification failed. Please try again.');
    } finally {
      setParentLoading(false);
    }
  };

  const handleParentSelectStudent = async (studentId) => {
    setParentLoading(true);
    try {
      const result = await selectParentStudent(selectionToken, studentId);
      if (result.success) {
        toast.success('Login successful!');
        navigate(result.redirectPath);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Could not complete login. Please try again.');
    } finally {
      setParentLoading(false);
    }
  };

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
    <div
      className="min-h-screen flex items-center justify-center p-2 sm:p-4 animate-fade-in overflow-x-hidden relative login-stars-optimized"
      style={{
        backgroundImage: "url('/images/login_background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#f8fafc'
      }}
    >
      {/* Home Button - Mobile Only */}
      <button
        onClick={() => navigate('/', { replace: true })}
        className="lg:hidden absolute top-6 left-6 z-[100] flex items-center justify-center w-11 h-11 bg-white rounded-xl text-primary shadow-lg border border-primary/10 hover:bg-primary hover:text-white transition-all active:scale-90 cursor-pointer"
        title="Go to Home"
      >
        <Home size={22} />
      </button>

      {/* Main Card Container */}
      <div className="w-full max-w-4xl bg-white/95 backdrop-blur-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row lg:min-h-[750px] animate-fade-in-up border border-white/20">

        {/* Left Side - Illustration Panel (Seamless White Integration) */}
        <div className="hidden lg:flex lg:w-1/2 bg-white/50 flex-col justify-center relative overflow-visible z-20">
          {/* Top Content: Home Button */}
          <div className="absolute top-12 left-12 z-[50]">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-12 h-12 bg-white/80 backdrop-blur-md shadow-sm border border-gray-100 rounded-xl flex items-center justify-center cursor-pointer hover:bg-white hover:scale-110 active:scale-95 transition-all group relative overflow-visible"
              title="Return Home"
            >
              <Home size={22} className="text-primary group-hover:rotate-[-10deg] transition-transform" />
            </button>
          </div>

          {/* Bottom-Aligned Illustration: Dynamic Image & Clock */}
          <div className="absolute inset-0 flex items-end justify-center px-0 pb-0">
            <div className="relative w-full h-full flex items-center justify-center transform translate-x-[5%]">
              {/* Main Illustration - Maximized (v5) */}
              <div className="relative w-full h-full pointer-events-none">
                <img
                  src="/images/login_illustration_v5.png"
                  alt="Login Illustration"
                  className="w-full h-full object-contain object-bottom opacity-100 scale-[1.5] origin-bottom transition-all duration-700 hover:scale-[1.55]"
                />
              </div>

              {/* Dynamic HUD Clock - Higher and more to the left */}
              <div className="absolute top-[47.5%] left-[37.8%] transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none group hover:scale-110 transition-all duration-700 z-30">
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <div className="flex flex-col items-center">
                    <span className="text-[28px] sm:text-[32px] font-black text-white tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).split(' ')[0]}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-black text-gray-100 uppercase tracking-[0.15em]">
                        {currentTime.toLocaleTimeString([], { second: '2-digit', hour12: true }).split(' ')[0]} {currentTime.toLocaleTimeString([], { hour12: true }).split(' ')[1]}
                      </span>
                    </div>
                  </div>
                  <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/50 to-transparent my-2 shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
                  <span className="text-[9px] font-bold text-gray-100 uppercase tracking-[0.35em] drop-shadow-md">
                    {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form (With higher z-index for 3D depth) */}
        <div className="w-full lg:w-1/2 p-8 sm:p-12 md:p-16 flex flex-col justify-center relative bg-white lg:bg-transparent">
          {/* SSO error banner */}
          {ssoError && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-50">
              <p className="text-sm text-amber-800">{ssoError}</p>
              <a href={CRM_FRONTEND_URL} className="text-sm font-medium text-primary hover:text-primary-dark">Return to CRM Portal</a>
            </div>
          )}

          {/* Form Content Wrapper - Stays above the overlapping illustration - Z-40 */}
          <div className="relative z-40 w-full max-w-sm mx-auto">
            <div className="text-center lg:text-left mb-10">
              <div className="flex justify-center lg:justify-start mb-6">
                <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100 group hover:scale-105 transition-all duration-300">
                  <img src="/logo.png" alt="College Logo" className="h-[70px] w-auto object-contain" />
                </div>
              </div>
              <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                Welcome Back
              </h1>
              <p className="text-gray-500 font-medium text-sm tracking-wide">
                Signin to access your portal
              </p>
            </div>

            <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
              {[
                { id: 'staff', label: 'Staff' },
                { id: 'student', label: 'Student' },
                { id: 'parent', label: 'Parent' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {isParentLogin ? (
              <div className="space-y-6">
                {parentStep === 'mobile' && (
                  <form onSubmit={handleParentSendOtp} className="space-y-5">
                    <div className="group">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Parent Mobile Number</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Phone size={18} className="text-gray-400" />
                        </div>
                        <input
                          type="tel"
                          required
                          placeholder="10-digit mobile number"
                          className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium"
                          value={parentMobile}
                          onChange={(e) => setParentMobile(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Use the mobile number registered as parent contact</p>
                    </div>
                    <button
                      type="submit"
                      disabled={parentLoading}
                      className="w-full h-12 bg-primary text-white rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {parentLoading ? <Loader2 className="animate-spin" size={20} /> : <>Send OTP <ArrowRight size={18} /></>}
                    </button>
                  </form>
                )}

                {parentStep === 'otp' && (
                  <form onSubmit={handleParentVerifyOtp} className="space-y-5">
                    <div className="group">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Enter OTP</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <ShieldCheck size={18} className="text-gray-400" />
                        </div>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          placeholder="6-digit OTP"
                          className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium tracking-widest"
                          value={parentOtp}
                          onChange={(e) => setParentOtp(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={parentLoading}
                      className="w-full h-12 bg-primary text-white rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {parentLoading ? <Loader2 className="animate-spin" size={20} /> : <>Verify & Login <ArrowRight size={18} /></>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setParentStep('mobile')}
                      className="w-full text-sm font-bold text-gray-500 hover:text-primary"
                    >
                      Change mobile number
                    </button>
                  </form>
                )}

                {parentStep === 'select' && (
                  <div className="space-y-4">
                    <p className="text-sm font-bold text-gray-700">Select student</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {linkedStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={parentLoading}
                          onClick={() => handleParentSelectStudent(s.id)}
                          className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-60"
                        >
                          <p className="font-bold text-gray-900">{s.student_name}</p>
                          <p className="text-xs text-gray-500 mt-1">{s.admission_number} · {s.course} · {s.branch}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
                  Parent session stays active for 15 days
                </p>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="block text-sm font-bold text-gray-700 mb-2 group-focus-within:text-primary transition-colors">
                    Username / Admission No
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Users size={18} className="text-gray-400 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      type="text"
                      name="username"
                      required
                      placeholder="Enter your id"
                      className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      value={formData.username}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-sm font-bold text-gray-700 mb-2 group-focus-within:text-primary transition-colors">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <LogIn size={18} className="text-gray-400 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      required
                      placeholder="••••••••"
                      className="block w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} className="text-gray-400" /> : <Eye size={18} className="text-gray-400" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-primary text-white rounded-xl font-black text-base hover:bg-primary-dark hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-70 group"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col items-center gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-sm font-bold text-gray-600 hover:text-primary transition-colors"
                >
                  Forgot Password?
                </button>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  © {new Date().getFullYear()} Student Management System
                </p>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">
              {(!isStudentLogin && userTypeReset === 'staff')
                ? "Enter your registered email or mobile number. We'll send a new password to your email (and SMS if available)."
                : "Enter your registered mobile number. We'll send you a new password via SMS."}
            </p>

            {!isStudentLogin && (
              <div className="flex gap-4 mb-4">
                {['student', 'staff'].map(type => (
                  <label key={type} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="userTypeReset"
                      checked={userTypeReset === type}
                      onChange={() => {
                        setUserTypeReset(type);
                        setForgotContact('');
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700 capitalize">{type === 'staff' ? 'Staff / Admin' : type}</span>
                  </label>
                ))}
              </div>
            )}

            <form onSubmit={handleForgotSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(!isStudentLogin && userTypeReset === 'staff') ? 'Email or Mobile Number' : 'Mobile Number'}
                </label>
                <input
                  type={(!isStudentLogin && userTypeReset === 'staff') ? 'text' : 'tel'}
                  value={forgotContact}
                  onChange={(e) => setForgotContact(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder={
                    (!isStudentLogin && userTypeReset === 'staff')
                      ? 'Enter email or mobile number'
                      : 'Enter mobile number'
                  }
                  required
                />
              </div>
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {forgotLoading && <Loader2 className="animate-spin" size={16} />}
                {forgotLoading ? 'Sending...' : 'Send New Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;

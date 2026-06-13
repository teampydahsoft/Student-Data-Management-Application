import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore, { resolveUserType } from '../store/authStore';
import api from '../config/api';
import toast from 'react-hot-toast';
import { resolveSafeRedirect } from '../utils/safeRedirect';

const applyAuthSession = (token, user) => {
    const userType = resolveUserType(user);

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userType', userType);

    useAuthStore.setState({
        user,
        token,
        isAuthenticated: true,
        userType,
        isLoading: false
    });

    return userType;
};

const AuthCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const processAuth = async () => {
            const token = searchParams.get('token');
            const from = searchParams.get('from');
            const fromHrms = from === 'hrms';

            if (!token) {
                navigate('/login', { replace: true });
                return;
            }

            try {
                let sessionToken = token;
                let user = null;

                if (fromHrms) {
                    // HRMS inbound SSO — exchange HRMS JWT for ticket-app session
                    const exchangeResponse = await api.post('/auth/hrms-sso-session', { token });
                    if (!exchangeResponse.data?.success) {
                        throw new Error(exchangeResponse.data?.message || 'HRMS SSO exchange failed');
                    }
                    sessionToken = exchangeResponse.data.token;
                    user = exchangeResponse.data.user;
                } else {
                    localStorage.setItem('token', token);

                    // Portal / pass-through when token is already a ticket-app JWT
                    try {
                        const verifyResponse = await api.get('/auth/verify');
                        if (verifyResponse.data.success && verifyResponse.data.user) {
                            user = verifyResponse.data.user;
                        }
                    } catch (verifyError) {
                        const exchangeResponse = await api.post('/auth/hrms-sso-session', { token });
                        if (!exchangeResponse.data?.success) {
                            throw verifyError;
                        }
                        sessionToken = exchangeResponse.data.token;
                        user = exchangeResponse.data.user;
                    }
                }

                if (!user) {
                    throw new Error('Verification failed');
                }

                applyAuthSession(sessionToken, user);
                toast.success(fromHrms ? 'Signed in from HRMS' : 'Signed in from Portal');

                const redirectParam = searchParams.get('redirect');
                const defaultPath =
                    fromHrms || user.role === 'student' || resolveUserType(user) === 'requester'
                        ? '/student/my-tickets'
                        : '/dashboard';

                const destination = resolveSafeRedirect(redirectParam, { defaultPath });

                // Replace history entry so token is stripped from the URL
                navigate(destination, { replace: true });
            } catch (error) {
                console.error('Auth Callback Error:', error);
                toast.error(error.response?.data?.message || error.message || 'Session invalid or expired');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('userType');
                navigate('/login', { replace: true });
            }
        };

        processAuth();
    }, [searchParams, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <h2 className="text-lg font-semibold text-gray-700">Verifying Session...</h2>
            </div>
        </div>
    );
};

export default AuthCallback;

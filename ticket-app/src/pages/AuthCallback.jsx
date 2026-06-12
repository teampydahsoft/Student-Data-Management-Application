import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore, { resolveUserType } from '../store/authStore';
import api from '../config/api';
import toast from 'react-hot-toast';

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
            const fromHrms = searchParams.get('from') === 'hrms';

            if (!token) {
                navigate('/login', { replace: true });
                return;
            }

            localStorage.setItem('token', token);

            try {
                let sessionToken = token;
                let user = null;

                // 1) Pass-through SSO when token is already signed with shared JWT_SECRET
                try {
                    const verifyResponse = await api.get('/auth/verify');
                    if (verifyResponse.data.success && verifyResponse.data.user) {
                        user = verifyResponse.data.user;
                    }
                } catch (verifyError) {
                    // 2) Exchange HRMS / portal token for a ticket-app session
                    const exchangeResponse = await api.post('/auth/hrms-sso-session', { token });
                    if (!exchangeResponse.data.success) {
                        throw verifyError;
                    }
                    sessionToken = exchangeResponse.data.token;
                    user = exchangeResponse.data.user;
                    localStorage.setItem('token', sessionToken);
                }

                if (!user) {
                    throw new Error('Verification failed');
                }

                const userType = applyAuthSession(sessionToken, user);
                toast.success(fromHrms ? 'Signed in from HRMS' : 'Signed in from Portal');

                const redirect = searchParams.get('redirect');
                const safeRedirect =
                    redirect && redirect.startsWith('/') && !redirect.startsWith('//')
                        ? redirect
                        : null;

                if (safeRedirect) {
                    navigate(safeRedirect, { replace: true });
                } else if (userType === 'student' || userType === 'requester') {
                    navigate('/student/my-tickets', { replace: true });
                } else {
                    navigate('/dashboard', { replace: true });
                }
            } catch (error) {
                console.error('Auth Callback Error:', error);
                toast.error(error.response?.data?.message || 'Session invalid or expired');
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

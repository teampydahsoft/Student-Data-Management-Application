import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../config/api';
import toast from 'react-hot-toast';

const AuthCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuthStore(); // We might use login or manual state update

    useEffect(() => {
        const processAuth = async () => {
            const token = searchParams.get('token');
            // If checking from portal, we might not have user object, so we verify token

            if (token) {
                try {
                    // Set token temporarily to allow api request
                    localStorage.setItem('token', token);

                    // Verify token with backend to get user details
                    const response = await api.get('/auth/verify');

                    if (response.data.success && response.data.user) {
                        const user = response.data.user;
                        const userType = user.role === 'student' ? 'student' : 'admin';

                        // Store in localStorage
                        localStorage.setItem('token', token);
                        localStorage.setItem('user', JSON.stringify(user));
                        localStorage.setItem('userType', userType);

                        // Update Store
                        useAuthStore.setState({
                            user,
                            token,
                            isAuthenticated: true,
                            userType,
                            isLoading: false
                        });

                        toast.success('Signed in from Portal');

                        const redirect = searchParams.get('redirect');
                        const safeRedirect =
                            redirect && redirect.startsWith('/') && !redirect.startsWith('//')
                                ? redirect
                                : null;

                        if (safeRedirect) {
                            navigate(safeRedirect, { replace: true });
                        } else if (userType === 'student') {
                            navigate('/student/my-tickets', { replace: true });
                        } else {
                            navigate('/dashboard', { replace: true });
                        }
                    } else {
                        throw new Error('Verification failed');
                    }
                } catch (error) {
                    console.error("Auth Callback Error:", error);
                    toast.error("Session invalid or expired");
                    localStorage.removeItem('token');
                    navigate('/login', { replace: true });
                }
            } else {
                // No token, redirect to login
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

import { create } from 'zustand';
import api from '../config/api';
import { queryClient } from '../config/queryClient';
import {
  MODULE_ROUTE_MAP,
  getModuleKeyForPath,
  getAllowedFrontendModules,
  isFullAccessRole,
  FRONTEND_MODULES
} from '../constants/rbac';

// Re-export for backward compatibility
export { MODULE_ROUTE_MAP, getModuleKeyForPath };

const resolveDefaultRoute = (user, userType = null) => {
  if (!user) return '/login';

  if (userType === 'parent' || user.role === 'parent') {
    return '/parent/dashboard';
  }

  // Student users go to student dashboard
  if (userType === 'student' || user.role === 'student' || (user.admission_number && user.role !== 'parent')) {
    return '/student/dashboard';
  }

  // Super admin and legacy admin have full access - go to dashboard
  if (isFullAccessRole(user.role)) return '/';

  // For RBAC users, check permissions and find first allowed route
  if (user.permissions) {
    const allowedModules = getAllowedFrontendModules(user.permissions);

    if (allowedModules.includes(FRONTEND_MODULES.DASHBOARD)) {
      return '/';
    }

    for (const moduleKey of allowedModules) {
      const route = MODULE_ROUTE_MAP[moduleKey];
      if (route) {
        return route;
      }
    }
  }

  // Club-only users should land on a page granted by their club assignment.
  if (Array.isArray(user.clubRoles) && user.clubRoles.length > 0) {
    const pageRoutes = {
      management: '/clubs',
      students: '/clubs/students',
      settings: '/clubs/settings'
    };
    const availablePages = user.clubRoles.flatMap(clubRole =>
      Array.isArray(clubRole.pages) ? clubRole.pages : Object.keys(pageRoutes)
    );
    const firstClubRoute = availablePages.map(page => pageRoutes[page]).find(Boolean);
    if (firstClubRoute) return firstClubRoute;
  }

  // Legacy staff users with modules array
  const modules = Array.isArray(user.modules) ? user.modules : [];
  for (const moduleKey of modules) {
    const route = MODULE_ROUTE_MAP[moduleKey];
    if (route) {
      return route;
    }
  }

  return '/';
};

const useAuthStore = create((set) => {
  // Initialize from localStorage
  const storedUser = localStorage.getItem('user');
  const storedToken = localStorage.getItem('token');
  const storedUserType = localStorage.getItem('userType');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    isAuthenticated: !!storedToken,
    userType: storedUserType || null, // 'admin' or 'student'

    login: async (username, password, expectedRole) => {
      try {
        const response = await api.post('/auth/unified-login', { username, password, expectedRole });

        // Check if response has success flag
        if (!response.data.success) {
          return {
            success: false,
            message: response.data.message || 'Login failed'
          };
        }

        const { token, user } = response.data;

        if (!token || !user) {
          return {
            success: false,
            message: 'Invalid response from server'
          };
        }

        const userType = user.role === 'parent' ? 'parent' : (user.role === 'student' ? 'student' : 'admin');

        // Client-side role enforcement check
        if (expectedRole) {
          const normExpected = String(expectedRole).toLowerCase().trim();
          if ((normExpected === 'staff' || normExpected === 'employee' || normExpected === 'admin') && userType === 'student') {
            return {
              success: false,
              message: 'Student credentials cannot be used for Employee login. Please use the Student Login page.'
            };
          }
          if (normExpected === 'student' && userType !== 'student') {
            return {
              success: false,
              message: 'Employee credentials cannot be used for Student login. Please use the Staff/Employee Login page.'
            };
          }
        }

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('userType', userType);
        localStorage.removeItem('admin');

        set({ user, token, isAuthenticated: true, userType });
        return { success: true, redirectPath: resolveDefaultRoute(user, userType) };
      } catch (error) {
        console.error('Login error:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Login failed. Please check your credentials.';
        return {
          success: false,
          message: errorMessage
        };
      }
    },

    // Kept for backward compatibility but routes to unified login logic internally or just fails gracefully if used directly
    loginAsStudent: async (username, password) => {
      // Use the unified login instead with 'student' role restriction
      return useAuthStore.getState().login(username, password, 'student');
    },

    setAuth: (user, token, userType = 'student') => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userType', userType);
      set({ user, token, isAuthenticated: true, userType });
    },

    /** SSO: store token/user from sso-session and return redirect path */
    loginFromSSO: (token, user) => {
      const userType = user.role === 'parent' ? 'parent' : (user.role === 'student' ? 'student' : 'admin');
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userType', userType);
      localStorage.removeItem('admin');
      set({ user, token, isAuthenticated: true, userType });
      return { success: true, redirectPath: resolveDefaultRoute(user, userType) };
    },

    sendParentOtp: async (mobileNumber) => {
      try {
        const response = await api.post('/auth/parent/otp/send', { mobileNumber }, { timeout: 20000 });
        if (!response.data.success) {
          return { success: false, message: response.data.message || 'Failed to send OTP' };
        }
        return { success: true, message: response.data.message, studentCount: response.data.studentCount };
      } catch (error) {
        return {
          success: false,
          message: error.response?.data?.message || 'Failed to send OTP'
        };
      }
    },

    verifyParentOtp: async (mobileNumber, otp) => {
      try {
        const response = await api.post('/auth/parent/otp/verify', { mobileNumber, otp }, { timeout: 20000 });
        if (!response.data.success) {
          return { success: false, message: response.data.message || 'Invalid OTP' };
        }
        const data = response.data;
        if (data.requiresSelection) {
          return {
            success: true,
            requiresSelection: true,
            selectionToken: data.selectionToken,
            students: data.students
          };
        }
        const { token, user } = data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('userType', 'parent');
        set({ user, token, isAuthenticated: true, userType: 'parent' });
        return { success: true, redirectPath: resolveDefaultRoute(user, 'parent') };
      } catch (error) {
        return {
          success: false,
          message: error.response?.data?.message || 'Failed to verify OTP'
        };
      }
    },

    selectParentStudent: async (selectionToken, studentId) => {
      try {
        const response = await api.post('/auth/parent/select-student', { selectionToken, studentId }, { timeout: 20000 });
        if (!response.data.success) {
          return { success: false, message: response.data.message || 'Failed to select student' };
        }
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('userType', 'parent');
        set({ user, token, isAuthenticated: true, userType: 'parent' });
        return { success: true, redirectPath: resolveDefaultRoute(user, 'parent') };
      } catch (error) {
        return {
          success: false,
          message: error.response?.data?.message || 'Failed to complete login'
        };
      }
    },

    updateUser: (userData) => set((state) => {
      const updatedUser = { ...state.user, ...userData };
      // Persist the updated user to localStorage so hard refreshes reflect the change
      try {
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } catch (e) {
        console.warn('Failed to persist user update to localStorage:', e);
      }
      return { user: updatedUser };
    }),

    logout: () => {
      // Clear all React Query cache immediately
      queryClient.clear();

      // Clear all localStorage items (comprehensive cleanup)
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userType');
      localStorage.removeItem('admin');

      // Clear any other potential cache/data items
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('react-query') || key.startsWith('cache') || key.startsWith('app-'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        console.warn('Error during localStorage cleanup:', error);
      }

      // Clear state
      set({ user: null, token: null, isAuthenticated: false, userType: null });
    },

    verifyToken: async () => {
      try {
        const response = await api.get('/auth/verify');
        const { user } = response.data || {};
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.removeItem('admin');
          const persistedType = localStorage.getItem('userType');
          const type = persistedType || (user.role === 'parent' ? 'parent' : (user.role === 'student' ? 'student' : 'admin'));

          set({ user, isAuthenticated: true, userType: type });
          return true;
        }
        throw new Error('Invalid response');
      } catch (error) {
        set({ user: null, token: null, isAuthenticated: false, userType: null });
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        return false;
      }
    }
  }
});

export default useAuthStore;

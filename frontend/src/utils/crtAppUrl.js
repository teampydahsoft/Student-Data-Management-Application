import api from '../config/api';

const HOSTED_CRT_APP_URL = 'https://crt.pydahsoft.in';
const LOCAL_CRT_APP_URL = 'http://localhost:5176';

const isLocalhostUrl = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);

/** Resolve CRT training app base URL — never use localhost in production builds. */
export const resolveCrtAppUrl = (rawUrl = import.meta.env.VITE_CRT_APP_URL) => {
  if (import.meta.env.PROD) {
    if (isLocalhostUrl(rawUrl)) {
      return HOSTED_CRT_APP_URL;
    }
    return rawUrl || HOSTED_CRT_APP_URL;
  }
  return rawUrl || LOCAL_CRT_APP_URL;
};

export const CRT_APP_URL = resolveCrtAppUrl();

const isStudentSession = () => {
  const userType = localStorage.getItem('userType');
  if (userType === 'student') return true;
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user?.role === 'student';
  } catch {
    return false;
  }
};

const buildDirectCrtUrl = (path = '/student/dashboard') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${CRT_APP_URL.replace(/\/$/, '')}${normalizedPath}`;
};

/**
 * Fetch CRT SSO redirect URL from SDMS backend (student only).
 * CRT contract: https://crt.pydahsoft.in/sso?token=<HS256 jwt with exp + student id>
 */
export const fetchCrtSsoUrl = async () => {
  const { data } = await api.get('/auth/crt-sso');
  if (!data?.success || !data?.url) {
    throw new Error(data?.message || 'Failed to get CRT SSO link');
  }
  return data.url;
};

/** @deprecated Use navigateToCrtApp — CRT SSO tokens must be issued server-side. */
export const getCrtAppUrl = (path = '/student/dashboard') => buildDirectCrtUrl(path);

export const navigateToCrtApp = async (path = '/student/dashboard') => {
  if (isStudentSession()) {
    try {
      const url = await fetchCrtSsoUrl();
      window.location.href = url;
      return;
    } catch (err) {
      console.error('CRT SSO failed:', err);
    }
  }

  window.location.href = buildDirectCrtUrl(path);
};

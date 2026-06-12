const HOSTED_MAIN_APP_URL = 'https://sdms.pydah.edu.in';
const LOCAL_MAIN_APP_URL = 'http://localhost:5173';

const isLocalhostUrl = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);

/** Student Database portal base URL (production: sdms.pydah.edu.in). */
export const resolveMainAppUrl = (rawUrl = import.meta.env.VITE_MAIN_APP_URL) => {
  if (import.meta.env.PROD && isLocalhostUrl(rawUrl)) {
    return HOSTED_MAIN_APP_URL;
  }
  if (rawUrl && !isLocalhostUrl(rawUrl) && !rawUrl.includes('pydahgroup.com')) {
    return rawUrl.replace(/\/$/, '');
  }
  if (import.meta.env.PROD) {
    return HOSTED_MAIN_APP_URL;
  }
  return rawUrl?.replace(/\/$/, '') || LOCAL_MAIN_APP_URL;
};

export const MAIN_APP_URL = resolveMainAppUrl();

/** SSO return link from ticket app → Student Database portal. */
export const getMainAppReturnUrl = ({
  token,
  role = 'student',
  path = '/student/dashboard',
  baseUrl = MAIN_APP_URL,
} = {}) => {
  const root = (baseUrl || MAIN_APP_URL).replace(/\/$/, '');
  if (token) {
    const params = new URLSearchParams();
    params.set('token', token);
    params.set('role', role);
    params.set('from', 'ticket_app');
    return `${root}/auth-callback?${params.toString()}`;
  }
  return `${root}${path}`;
};

export const getMainAppLoginUrl = (isStudent = false) =>
  `${MAIN_APP_URL}${isStudent ? '/student/login' : '/login'}`;

const HOSTED_TICKET_APP_URL = 'https://maintenance.pydah.edu.in';
const LOCAL_TICKET_APP_URL = 'http://localhost:5174';

const LEGACY_TICKET_APP_HOSTS = ['ticket-maintenance-backend.pydah.edu.in'];

const isLocalhostUrl = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);

const isLegacyTicketAppUrl = (url) =>
  !!url && LEGACY_TICKET_APP_HOSTS.some((host) => url.includes(host));

/** Resolve ticket app base URL — never use localhost or legacy DNS in production builds. */
export const resolveTicketAppUrl = (rawUrl = import.meta.env.VITE_TICKET_APP_URL) => {
  const normalized = typeof rawUrl === 'string' ? rawUrl.trim().replace(/\/$/, '') : '';

  if (import.meta.env.PROD) {
    if (!normalized || isLocalhostUrl(normalized) || isLegacyTicketAppUrl(normalized)) {
      return HOSTED_TICKET_APP_URL;
    }
    return normalized;
  }

  if (normalized && !isLocalhostUrl(normalized) && !isLegacyTicketAppUrl(normalized)) {
    return normalized;
  }

  return normalized || LOCAL_TICKET_APP_URL;
};

export const getTicketAppBaseUrl = () => resolveTicketAppUrl();

export const TICKET_APP_URL = getTicketAppBaseUrl();

export const TICKET_APP_STUDENT_PATHS = ['/student/my-tickets', '/student/raise-ticket'];

export const isTicketAppPath = (path) => TICKET_APP_STUDENT_PATHS.includes(path);

/** Map SDMS portal paths to ticket-app post-SSO routes. */
export const resolveTicketAppRedirectPath = (path = '/student/my-tickets') => {
  if (path === '/tickets' || path === '/task-management') {
    return '/task-management';
  }
  if (path.startsWith('/student/')) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
};

export const getTicketAppUrl = (path = '/student/my-tickets') => {
  const token = localStorage.getItem('token');
  let userStr = localStorage.getItem('user');

  try {
    const userObj = JSON.parse(userStr);
    if (userObj) {
      const { student_photo, ...safeUser } = userObj;
      userStr = JSON.stringify(safeUser);
    }
  } catch {
    /* keep original userStr */
  }

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (userStr) params.set('user', userStr);
  params.set('redirect', resolveTicketAppRedirectPath(path));

  return `${getTicketAppBaseUrl()}/auth-callback?${params.toString()}`;
};

export const navigateToTicketApp = (path = '/student/my-tickets') => {
  window.location.href = getTicketAppUrl(path);
};

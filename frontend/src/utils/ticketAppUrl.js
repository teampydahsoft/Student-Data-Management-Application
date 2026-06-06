const HOSTED_TICKET_APP_URL = 'https://ticket-maintenance-backend.pydah.edu.in';
const LOCAL_TICKET_APP_URL = 'http://localhost:5174';

const isLocalhostUrl = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);

/** Resolve ticket app base URL — never use localhost in production builds. */
export const resolveTicketAppUrl = (rawUrl = import.meta.env.VITE_TICKET_APP_URL) => {
  if (import.meta.env.PROD) {
    if (isLocalhostUrl(rawUrl)) {
      return HOSTED_TICKET_APP_URL;
    }
    return rawUrl || HOSTED_TICKET_APP_URL;
  }
  return rawUrl || LOCAL_TICKET_APP_URL;
};

export const TICKET_APP_URL = resolveTicketAppUrl();

export const TICKET_APP_STUDENT_PATHS = ['/student/my-tickets', '/student/raise-ticket'];

export const isTicketAppPath = (path) => TICKET_APP_STUDENT_PATHS.includes(path);

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
  params.set('redirect', path);

  return `${TICKET_APP_URL}/auth-callback?${params.toString()}`;
};

export const navigateToTicketApp = (path = '/student/my-tickets') => {
  window.location.href = getTicketAppUrl(path);
};

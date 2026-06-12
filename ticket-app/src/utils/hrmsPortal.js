import { MAIN_APP_URL, getMainAppReturnUrl } from './mainAppUrl';

export const HRMS_PORTAL_URL =
    import.meta.env.VITE_HRMS_PORTAL_URL || 'https://hrms.pydah.edu.in';

export const TICKET_APP_URL =
    import.meta.env.VITE_TICKET_APP_URL || window.location.origin;

export { MAIN_APP_URL, getMainAppReturnUrl };

/**
 * URL HRMS should redirect to for passwordless ticket-app login.
 * HRMS must sign `token` with JWT_SECRET (shared) or use POST exchange via hrms-sso-session.
 */
export const buildHrmsToTicketSsoUrl = ({
    token,
    redirect = '/student/my-tickets',
    ticketAppUrl = TICKET_APP_URL
} = {}) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('from', 'hrms');
    if (redirect) params.set('redirect', redirect);
    return `${ticketAppUrl}/auth-callback?${params.toString()}`;
};

/** HRMS ticket-only session (no linked rbac_users row). */
export const isHrmsOnlyTicketUser = (user) =>
    !!(user?.is_hrms_session && !user?.id);

/** User exists in both HRMS and rbac_users / User Management. */
export const isLinkedHrmsRbacUser = (user) =>
    !!(user?.id && (user?.hrmsId || user?.is_hrms_user));

/** Any HRMS-authenticated ticket user. */
export const isHrmsTicketUser = (user) =>
    isHrmsOnlyTicketUser(user) || isLinkedHrmsRbacUser(user);

/** Can open the Student Database portal from the ticket app. */
export const hasStudentDatabasePortalAccess = (user) =>
    !user?.is_worker && (!isHrmsTicketUser(user) || isLinkedHrmsRbacUser(user));

/**
 * HRMS portal base URL (login page fallback when SSO URL cannot be minted).
 */
export const getHrmsPortalUrl = () => HRMS_PORTAL_URL;

/** Return link metadata for HRMS-only ticket sessions. */
export const getHrmsOnlyReturnLink = () => ({
    id: 'hrms-return',
    label: 'Back to HRMS',
    shortLabel: 'HRMS',
    href: getHrmsPortalUrl(),
    external: true,
    usesSso: true,
});

/**
 * Fetch a signed SSO URL from ticket-backend and redirect to HRMS (auto-login).
 * Falls back to plain HRMS portal URL if SSO minting fails.
 */
export const navigateToHrmsPortal = async (api) => {
    try {
        const response = await api.get('/auth/hrms-return-url');
        if (response.data?.success && response.data?.url) {
            window.location.href = response.data.url;
            return;
        }
    } catch (error) {
        console.error('HRMS return SSO failed:', error);
    }
    window.location.href = getHrmsPortalUrl();
};

export const getWorkspaceLinks = (user, { mainAppUrl, token } = {}) => {
    const links = [];

    // HRMS-only ticket sessions: no outbound HRMS link (user arrived via HRMS SSO; use browser back).
    if (isLinkedHrmsRbacUser(user)) {
        links.push({
            id: 'hrms',
            label: 'HRMS Portal',
            href: getHrmsPortalUrl(),
            external: true,
        });
    }

    if (hasStudentDatabasePortalAccess(user)) {
        const role = user?.role === 'student' ? 'student' : (user?.role || 'admin');
        links.push({
            id: 'student-database',
            label: 'Student Database',
            href: getMainAppReturnUrl({
                token,
                role,
                baseUrl: mainAppUrl || MAIN_APP_URL,
                path: role === 'student' ? '/student/dashboard' : '/',
            }),
            external: true,
        });
    }

    return links;
};

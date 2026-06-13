const ALLOWED_PREFIXES = [
    '/student/my-tickets',
    '/student/raise-ticket',
    '/student/dashboard',
    '/student/',
    '/dashboard',
    '/task-management',
    '/tickets',
    '/configuration',
    '/employees',
];

/**
 * Allowlist internal ticket-app paths for post-SSO redirect (open-redirect safe).
 */
export const resolveSafeRedirect = (redirect, { defaultPath = '/student/my-tickets' } = {}) => {
    if (!redirect || typeof redirect !== 'string') {
        return defaultPath;
    }

    const path = redirect.trim();
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
        return defaultPath;
    }

    const allowed = ALLOWED_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(prefix)
    );

    return allowed ? path : defaultPath;
};

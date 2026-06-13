const jwt = require('jsonwebtoken');

function getHrmsReturnSigningSecret() {
    return process.env.HRMS_SSO_SECRET || process.env.JWT_SECRET || 'secret_key';
}

function normalizeRedirectPath(path) {
    const value = path || process.env.HRMS_RETURN_REDIRECT_PATH || '/dashboard';
    return value.startsWith('/') ? value : `/${value}`;
}

/**
 * HRMS has no /auth-callback route (404). Use /login or land token on /dashboard directly.
 * Modes: login (default) | dashboard | callback (legacy)
 */
function resolveHrmsReturnMode() {
    return (process.env.HRMS_SSO_RETURN_MODE || 'login').toLowerCase();
}

function buildHrmsReturnPayload(user, redirectPath) {
    const hrmsId = user.hrmsId || user.hrms_id;
    if (!hrmsId) {
        return null;
    }

    return {
        hrmsId: String(hrmsId),
        hrms_id: String(hrmsId),
        role: user.role || 'faculty',
        username: user.username,
        name: user.name,
        email: user.email,
        from: 'ticket_app',
        redirect: normalizeRedirectPath(redirectPath),
    };
}

function mintHrmsReturnToken(user, redirectPath) {
    const payload = buildHrmsReturnPayload(user, redirectPath);
    if (!payload) {
        return null;
    }

    const expiresIn = process.env.HRMS_RETURN_SSO_EXPIRES_IN || '5m';
    return jwt.sign(payload, getHrmsReturnSigningSecret(), {
        algorithm: 'HS256',
        expiresIn,
    });
}

function buildHrmsReturnUrl(user, options = {}) {
    const token = options.token || mintHrmsReturnToken(user, options.redirectPath);
    if (!token) {
        return null;
    }

    const base = (process.env.HRMS_PORTAL_URL || 'https://hrms.pydah.edu.in').replace(/\/$/, '');
    const redirectPath = normalizeRedirectPath(options.redirectPath);
    const mode = options.mode || resolveHrmsReturnMode();

    const params = new URLSearchParams();
    params.set('token', token);
    params.set('from', 'ticket_app');
    params.set('redirect', redirectPath);

    if (mode === 'callback') {
        const callbackPath = process.env.HRMS_SSO_CALLBACK_PATH || '/auth-callback';
        return `${base}${callbackPath}?${params.toString()}`;
    }

    if (mode === 'dashboard') {
        return `${base}${redirectPath}?${params.toString()}`;
    }

    // Default: HRMS /login handles ?token= then navigates to redirect (/dashboard)
    return `${base}/login?${params.toString()}`;
}

module.exports = {
    buildHrmsReturnPayload,
    mintHrmsReturnToken,
    buildHrmsReturnUrl,
    normalizeRedirectPath,
    resolveHrmsReturnMode,
};

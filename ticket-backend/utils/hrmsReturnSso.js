const jwt = require('jsonwebtoken');

function getHrmsReturnSigningSecret() {
    return process.env.HRMS_SSO_SECRET || process.env.JWT_SECRET || 'secret_key';
}

function buildHrmsReturnPayload(user) {
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
    };
}

function mintHrmsReturnToken(user) {
    const payload = buildHrmsReturnPayload(user);
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
    const token = mintHrmsReturnToken(user);
    if (!token) {
        return null;
    }

    const base = (process.env.HRMS_PORTAL_URL || 'https://hrms.pydah.edu.in').replace(/\/$/, '');
    const callbackPath = process.env.HRMS_SSO_CALLBACK_PATH || '/auth-callback';
    const redirectPath = options.redirectPath
        || process.env.HRMS_RETURN_REDIRECT_PATH
        || '/dashboard';

    const params = new URLSearchParams();
    params.set('token', token);
    params.set('from', 'ticket_app');
    if (redirectPath) {
        params.set('redirect', redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`);
    }

    return `${base}${callbackPath}?${params.toString()}`;
}

module.exports = {
    buildHrmsReturnPayload,
    mintHrmsReturnToken,
    buildHrmsReturnUrl,
};

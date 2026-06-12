const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'No token provided. Access denied.'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided. Access denied.'
            });
        }

        // Verify token using the Shared Secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach to request
        // Note: The main backend provides 'id' (MongoDB ID or MySQL ID) and 'role'
        // FIX: Map admissionNumber (camelCase from token) to admission_number (snake_case expected by controllers)
        if (decoded.admissionNumber && !decoded.admission_number) {
            decoded.admission_number = decoded.admissionNumber;
        }
        if (decoded.hrmsId && !decoded.is_hrms_session) {
            decoded.is_hrms_session = true;
        }

        req.user = decoded;
        // Legacy support for admin checks if needed
        req.admin = decoded;

        next();
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token.'
        });
    }
};

module.exports = authMiddleware;

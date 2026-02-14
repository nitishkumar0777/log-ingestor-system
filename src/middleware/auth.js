const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Mock user database (replace with real database)
const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2a$10$X8qPXH5vZ9Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z', // password: admin123
        role: 'admin'
    },
    {
        id: 2,
        username: 'viewer',
        password: '$2a$10$Y9qPXH5vZ9Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z', // password: viewer123
        role: 'viewer'
    }
];

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Authorization middleware
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden: Insufficient permissions',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
}

module.exports = { authenticate, authorize, users, JWT_SECRET };
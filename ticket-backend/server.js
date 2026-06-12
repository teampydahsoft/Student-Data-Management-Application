const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { testConnection } = require('./config/database');
const { getHRMSConnection } = require('./config/mongoConfig');

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Allow Ticket App and Main App (development + production)
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:5174',
        'http://localhost:5173',
        'https://maintenance.pydah.edu.in',
        'https://sdms.pydah.edu.in',
        'https://pydahsdms-tickets.vercel.app',
        'https://student-data-management-app.vercel.app'
    ];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Static folder for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const ticketRoutes = require('./routes/ticketRoutes');
const complaintCategoryRoutes = require('./routes/complaintCategoryRoutes');
const authRoutes = require('./routes/authRoutes');
const rbacUserRoutes = require('./routes/rbacUserRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const pushRoutes = require('./routes/pushRoutes');
const roleRoutes = require('./routes/roleRoutes');

app.use('/api/tickets', ticketRoutes);
app.use('/api/complaint-categories', complaintCategoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rbac/users', rbacUserRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/roles', roleRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ticket-backend' });
});

// Root API route
app.get('/api', (req, res) => {
    res.json({
        message: 'Student Data Management - Ticket API',
        version: '1.0.0',
        status: 'running'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start Server
const startServer = async () => {
    const isConnected = await testConnection();
    if (!isConnected) {
        console.error('Failed to connect to database. Server not started.');
        process.exit(1);
    }

    getHRMSConnection();

    const server = require('http').createServer({
        maxHttpHeaderSize: 32768
    }, app);

    server.listen(PORT, () => {
        console.log(`\n✅ Ticket Backend Service running on port ${PORT}`);
        console.log(`🌐 API available at: http://localhost:${PORT}/api`);
    });

    // Run migrations in the background so API is available immediately
    console.log('\n📦 Checking for pending migrations (background)...');
    (async () => {
        try {
            const { runMigrations } = require('./migrations/migrate');
            await runMigrations();
            try {
                const { backfillStaffRequesterNames } = require('./utils/requesterNames');
                getHRMSConnection();
                await backfillStaffRequesterNames();
            } catch (backfillError) {
                console.warn('⚠️  Requester name backfill skipped:', backfillError.message);
            }
        } catch (error) {
            console.warn('⚠️  Migration check failed:', error.message);
        }
    })();
};

startServer();

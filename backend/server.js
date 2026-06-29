const express = require("express");
process.env.TZ = "Asia/Kolkata"; // Enforce IST Timezone
const cors = require("cors");
const bodyParser = require("body-parser");
const compression = require("compression");
require("dotenv").config();

const { testConnection } = require("./config/database");
const { createDefaultForm } = require("./scripts/createDefaultForm");
const mysql = require("mysql2/promise");

// Import routes
const authRoutes = require("./routes/authRoutes");
const formRoutes = require("./routes/formRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const studentRoutes = require("./routes/studentRoutes");
const courseRoutes = require("./routes/courseRoutes");
const collegeRoutes = require("./routes/collegeRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const logRoutes = require("./routes/logRoutes");
const userRoutes = require("./routes/userRoutes");
const rbacUserRoutes = require("./routes/rbacUserRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const academicYearRoutes = require("./routes/academicYearRoutes");
const semesterRoutes = require("./routes/semesterRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const feeRoutes = require("./routes/feeRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const complaintCategoryRoutes = require("./routes/complaintCategoryRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const certificateTemplateRoutes = require("./routes/certificateTemplateRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const parentRoutes = require("./routes/parentRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Allow multiple origins via FRONTEND_URLS env var (comma separated), or single FRONTEND_URL
const rawFrontendUrls =
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000";
const allowedOrigins = rawFrontendUrls
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

// Compression middleware for faster responses
app.use(
  compression({
    level: 6, // Compression level (1-9, 6 is a good balance)
    filter: (req, res) => {
      // Compress all responses except if explicitly disabled
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === "development") {
        callback(null, true);
      } else {
        console.log("CORS blocked for origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Request logging middleware
app.use((req, res, next) => {
  next();
});

// app.get('/', (req, res) => {
//   console.log('🌐 Root endpoint accessed');
//   res.sendFile(path.resolve(__dirname, 'test.html'));
// });

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    corsOrigins: allowedOrigins,
    database: process.env.DB_NAME || "student_database",
    port: PORT,
    uptime: process.uptime(),
  });
});

// DB health endpoint
app.get("/health/db", async (req, res) => {
  const { masterPool, stagingPool } = require("./config/database");
  const status = { master: "pending", staging: "pending" };

  try {
    const m = await masterPool.getConnection();
    m.release();
    status.master = "ok";
  } catch (e) {
    status.master = `error: ${e.message}`;
  }

  try {
    const s = await stagingPool.getConnection();
    s.release();
    status.staging = "ok";
  } catch (e) {
    status.staging = `error: ${e.message}`;
  }

  const isHealthy = status.master === "ok";
  res.status(isHealthy ? 200 : 500).json({
    success: isHealthy,
    ...status
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rbac/users", rbacUserRoutes);
const roleConfigRoutes = require("./routes/roleConfigRoutes");
app.use("/api/rbac/role-config", roleConfigRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/academic-years", academicYearRoutes);
app.use("/api/semesters", semesterRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/complaint-categories", complaintCategoryRoutes);
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/polls", require("./routes/pollRoutes"));
app.use("/api/services", serviceRoutes);
app.use("/api/certificate-templates", certificateTemplateRoutes);
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/student-history", require("./routes/studentHistoryRoutes"));
app.use("/api/student-scholarship", require("./routes/studentScholarshipRoutes"));
app.use("/api/sms-templates", require("./routes/smsTemplateRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes")); // [NEW] Notification Routes
app.use("/api/feedback-forms", require("./routes/feedbackRoutes")); // [NEW] Feedback Form Routes
// app.use('/api/notifications', require('./routes/pushRoutes')); // Old push routes (commented/replaced or co-exists?)
// Keeping pushRoutes if needed for push notifications, but avoiding conflict on same path if problematic.
// The user request was "notification icon ... inside notification center", implying web notifications.
// pushRoutes uses /api/notifications in original file (line 135 in step 16 viewer).
// Let's CHECK line 135 of server.js again.
// Line 135: app.use('/api/notifications', require('./routes/pushRoutes'));
// I should use a different path for web notifications OR rename the old one if it's strictly VAPID push.
// The old one serves /vapid-public-key, /subscribe, /broadcast.
// I will use `/api/web-notifications` to avoid conflict, OR merge them?
// The plan said: "Register the new notificationRoutes under /api/notifications".
// If I assume reuse, I should probably use a distinct endpoint or merge.
// Merging routes files might be messy.
// Let's use `/api/alerts` or `/api/web-notifications`.
// OR, I can check what `pushRoutes` does. It seems to be for Service Worker Push API.
// "check the student portal and add a notification icon where the all the push notifications and events and other are needed to be store on that"
// So this is likely a persistent store for what was sent via push + others.
// I will rename the route path for the NEW routes to `/api/web-notifications` to be safe/clear.
app.use("/api/push", require("./routes/pushRoutes")); // Renaming old /notifications to /push to free up /notifications name?
// Or just use `/api/student-notifications`.
// Let's use `/api/web-notifications` for the new internal notification center.
app.use("/api/web-notifications", require("./routes/notificationRoutes"));
app.use("/api/clubs", require("./routes/clubRoutes"));
app.use("/api/transport", require("./routes/transportRoutes"));
app.use("/api/payments", paymentRoutes);
app.use("/api/previous-colleges", require("./routes/previousCollegeRoutes"));
app.use("/api/quotas", require("./routes/quotaRoutes"));
app.use("/api/faculty", require("./routes/facultyRoutes"));
app.use("/api/period-slots", require("./routes/periodSlotsRoutes"));
app.use("/api/timetable", require("./routes/timetableRoutes"));
app.use("/api/subjects", require("./routes/subjectsRoutes"));
app.use("/api/hourly-attendance", require("./routes/hourlyAttendanceRoutes"));
app.use("/api/academic-content", require("./routes/academicContentRoutes"));
app.use("/api/internal-marks", require("./routes/internalMarksRoutes"));
app.use("/api/versant/test-results", require("./routes/versantTestResultsRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/internship", require("./internship/internshipRoutes"));
app.use("/api/profile-changes", require("./routes/profileChangeRoutes"));
app.use("/api/certificate-borrow", require("./routes/certificateBorrowRoutes"));
app.use("/api/qr", require("./routes/qrRoutes")); // Public QR verify endpoint

// Legacy route support for direct API access (without /api prefix)
app.use("/auth", authRoutes);
app.use("/parent", parentRoutes);
app.use("/forms", formRoutes);
app.use("/submissions", submissionRoutes);
app.use("/students", studentRoutes);
app.use("/courses", courseRoutes);
app.use("/colleges", collegeRoutes);
app.use("/attendance", attendanceRoutes);
app.use("/logs", logRoutes);
app.use("/users", userRoutes);
app.use("/rbac/users", rbacUserRoutes);
app.use("/rbac/role-config", roleConfigRoutes);
app.use("/calendar", calendarRoutes);
app.use("/academic-years", academicYearRoutes);
app.use("/semesters", semesterRoutes);
app.use("/settings", settingsRoutes);
app.use("/fees", feeRoutes);
app.use("/tickets", ticketRoutes);
app.use("/complaint-categories", complaintCategoryRoutes);
// When reverse proxy uses e.g. `location /api/ { proxy_pass http://upstream/; }`, Node sees paths
// without the `/api` prefix. Mirror `/api/*` mounts here so those requests still match.
app.use("/announcements", require("./routes/announcementRoutes"));
app.use("/polls", require("./routes/pollRoutes"));
app.use("/services", serviceRoutes);
app.use("/certificate-templates", certificateTemplateRoutes);
app.use("/events", require("./routes/eventRoutes"));
app.use("/student-history", require("./routes/studentHistoryRoutes"));
app.use("/sms-templates", require("./routes/smsTemplateRoutes"));
app.use("/notifications", require("./routes/notificationRoutes"));
app.use("/feedback-forms", require("./routes/feedbackRoutes"));
app.use("/push", require("./routes/pushRoutes"));
app.use("/web-notifications", require("./routes/notificationRoutes"));
app.use("/clubs", require("./routes/clubRoutes"));
app.use("/transport", require("./routes/transportRoutes"));
app.use("/payments", paymentRoutes);
app.use("/previous-colleges", require("./routes/previousCollegeRoutes"));
app.use("/quotas", require("./routes/quotaRoutes"));
app.use("/faculty", require("./routes/facultyRoutes"));
app.use("/period-slots", require("./routes/periodSlotsRoutes"));
app.use("/timetable", require("./routes/timetableRoutes"));
app.use("/subjects", require("./routes/subjectsRoutes"));
app.use("/hourly-attendance", require("./routes/hourlyAttendanceRoutes"));
app.use("/academic-content", require("./routes/academicContentRoutes"));
app.use("/internal-marks", require("./routes/internalMarksRoutes"));
app.use("/versant/test-results", require("./routes/versantTestResultsRoutes"));
app.use("/chat", require("./routes/chatRoutes"));
app.use("/internship", require("./internship/internshipRoutes"));
app.use("/profile-changes", require("./routes/profileChangeRoutes"));
app.use("/certificate-borrow", require("./routes/certificateBorrowRoutes"));
app.use("/qr", require("./routes/qrRoutes"));

// Root API endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Pydah Student Database Management API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      forms: "/api/forms",
      submissions: "/api/submissions",
      students: "/api/students",
      courses: "/api/courses",
      logs: "/api/logs",
      users: "/api/users",
    },
  });
});

// Catch all non-API routes to return proper 404 (must be after all routes)
app.use("/api/*", (req, res) => {
  console.log("API route not found:", req.method, req.path);
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.path}`,
    availableRoutes: [
      "GET /api/auth/verify",
      "POST /api/auth/login",
      "POST /api/auth/change-password",
      "GET /api/forms",
      "POST /api/forms",
      "GET /api/forms/public/:formId",
      "GET /api/submissions",
      "POST /api/submissions/generate-admission-series",
      "GET /api/students",
      "GET /api/students/stats",
      "GET /api/students/dashboard-stats",
    ],
  });
});

// Debug route to check if routes are registered
app.get("/api/debug/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((layer) => {
    if (layer.route) {
      routes.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      });
    }
  });
  res.json({ routes });
});

// Small debug/health endpoint - non-sensitive
app.get("/api/debug/health", async (req, res) => {
  const { masterPool } = require("./config/database");
  const jwtPresent = !!process.env.JWT_SECRET;
  // basic DB check (fast)
  let dbStatus = "unknown";
  try {
    const conn = await masterPool.getConnection();
    conn.release();
    dbStatus = "ok";
  } catch (e) {
    dbStatus = "error";
  }

  res.json({
    success: true,
    allowedOrigins: allowedOrigins,
    jwtPresent,
    dbStatus,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// Scheduled Tasks
const { initScheduledJobs } = require("./services/schedulerService");

// Initialize 4 PM Daily Report & 12 AM IST Birthday (push + SMS) Scheduler
initScheduledJobs();

// Process chat scheduled messages every minute
setInterval(() => {
  const chatController = require("./controllers/chatController");
  if (typeof chatController.processScheduledMessages === "function") {
    chatController.processScheduledMessages();
  }
}, 60 * 1000);

// Process chat auto-delete (messages older than channel setting, default 30 days) every day
setInterval(() => {
  const chatController = require("./controllers/chatController");
  if (typeof chatController.processAutoDeleteMessages === "function") {
    chatController.processAutoDeleteMessages();
  }
}, 24 * 60 * 60 * 1000);

// Start server
const startServer = async () => {
  try {
    console.log("🔄 Starting server...");

    // Start the server FIRST (before DB connection test)
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on: http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // Connect to MongoDB
    const { connectDB, getHRMSConnection } = require("./config/mongoConfig");
    await connectDB();
    getHRMSConnection();

    // Test database and S3 connections AFTER server starts (async)
    setTimeout(async () => {
      try {
        const dbConnected = await testConnection();

        if (!dbConnected) {
          console.error("❌ Database connection failed!");
          console.error("❌ API calls may fail but server is running");
        } else {
          // Create a default form if none exists
          try {
            await createDefaultForm();
          } catch (formError) {
            console.error("⚠️  Form creation warning:", formError.message);
          }
        }
      } catch (dbError) {
        console.error("❌ Database test error:", dbError.message);
      }
    }, 1000); // Wait 1 second after server starts

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("🛑 SIGTERM received, shutting down gracefully");
      server.close(() => {
        console.log("✅ Process terminated");
      });
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Stack trace:", error.stack);
    process.exit(1);
  }
};

startServer();

module.exports = app;

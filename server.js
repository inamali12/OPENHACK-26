const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const config = require('./src/config');
const { getDatabase } = require('./src/db/database');
const { seedDatabase } = require('./src/db/seed');
const { initSSE } = require('./src/services/sseService');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/error');

// Import routes
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const casesRoutes = require('./src/routes/cases');
const bedsRoutes = require('./src/routes/beds');
const doctorsRoutes = require('./src/routes/doctors');
const ambulancesRoutes = require('./src/routes/ambulances');
const allocationsRoutes = require('./src/routes/allocations');
const settingsRoutes = require('./src/routes/settings');
const auditRoutes = require('./src/routes/audit');

const app = express();

// Initialize database & run idempotent seed
const db = getDatabase();
seedDatabase(false);
initSSE();

// HTTP Security with Helmet (Allowing necessary local resources & CDNs for Chart.js)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdn.jsdelivr.net',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session configuration
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/beds', bedsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/ambulances', ambulancesRoutes);
app.use('/api/allocations', allocationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit-logs', auditRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    application: 'Smart Hospital Emergency Resource Manager (SHERM)',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// SPA route fallback (Express 5 compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handling
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`================================================================`);
    console.log(`🏥 SMART HOSPITAL EMERGENCY RESOURCE MANAGER (SHERM)`);
    console.log(`🚀 Server running on: http://localhost:${config.PORT}`);
    console.log(`📊 Mode: ${config.NODE_ENV} | Database: ${config.DB_FILE}`);
    console.log(`🔑 Demo Accounts:`);
    console.log(`   - Admin:       admin / admin123`);
    console.log(`   - Coordinator: coordinator / coord123`);
    console.log(`   - Staff:       staff / staff123`);
    console.log(`================================================================`);
  });
}

module.exports = app;

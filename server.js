/**
 * SAL Portal – Main Entry Point
 * File: server.js
 *
 * Changes from original:
 *  1. CORS Security    – reads CORS_ORIGIN env; rejects unlisted origins; no more
 *                        "allow all" fallback in production.
 *  2. Middleware order – all app.use() calls placed AFTER `const app = express()`.
 *  3. Production Logging – morgan replaced / complemented by Winston logger.
 *  4. Static placement  – express.static() is correctly positioned after
 *                         all other middleware.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
// import mongoSanitize from 'express-mongo-sanitize';

import { connectDB } from './src/config/db.js';
import { ensureSuperAdmin } from './src/seed/superAdmin.js';
import authRoutes from './src/routes/auth.routes.js';
import superRoutes from './src/routes/super.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import hodRoutes from './src/routes/hod.routes.js';
import teacherRoutes from './src/routes/teacher.routes.js';
import studentRoutes from './src/routes/student.routes.js';
import filesRoutes from './src/routes/files.routes.js';
import { notFound, errorHandler } from './src/middleware/error.js';

// Winston logger (file: src/utils/logger.js)
import logger from './src/utils/logger.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// ── 1. Production environment guard ─────────────────────────────────────────
function requireProductionEnv() {
  if (!isProduction) return;

  const required = [
    'MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
    'CORS_ORIGIN', 'SUPER_ADMIN_EMAIL', 'SUPER_ADMIN_PASSWORD',
  ];
  const missing = required.filter(key => !process.env[key]);

  const weakSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SUPER_ADMIN_PASSWORD']
    .filter(key => {
      const value = process.env[key] || '';
      return value.length < 32 || /change_me|replace_with|dev_/i.test(value);
    });

  if (missing.length || weakSecrets.length) {
    const details = [
      missing.length      ? `missing: ${missing.join(', ')}`              : '',
      weakSecrets.length  ? `weak/default secrets: ${weakSecrets.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`Production environment is not deploy-ready (${details}).`);
  }
}

// ── 2. Secure CORS options ───────────────────────────────────────────────────
/**
 * FIX: Previous implementation used `return callback(null, true)` unconditionally
 * which allowed EVERY origin. Now:
 *   - Reads allowed origins from CORS_ORIGIN env variable (comma-separated).
 *   - Allows requests with no origin (Postman, mobile apps, server-to-server).
 *   - Returns a proper CORS error for unlisted browser origins.
 *   - In development with no CORS_ORIGIN set → allows all (dev convenience).
 *   - In production with no CORS_ORIGIN set → blocks all cross-origin requests.
 */
function buildCorsOptions() {
  const configured = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, '')) // drop any trailing slash — browsers never send one in Origin
    .filter(Boolean);

  // Render sets this automatically on every deploy — trust it too, so a
  // single-service deployment (this app serves both the frontend and the
  // API from one process) works without needing CORS_ORIGIN configured by
  // hand. Still explicit/opt-in for any other host env var name.
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (renderUrl) configured.push(renderUrl);

  // optionsDelegate form — gives us the full `req`, so we can recognize a
  // genuinely same-origin request (frontend and API on the same host,
  // exactly this app's deployment model) and always allow it, regardless of
  // CORS_ORIGIN. Modern browsers attach an Origin header even to same-origin
  // POST/PUT/DELETE requests (not just cross-origin ones), so without this,
  // a strict "block everything unless listed" fallback would incorrectly
  // reject the app's own frontend calling its own API.
  return function corsOptionsDelegate(req, callback) {
    const origin = req.headers.origin;

    if (!origin) {
      // No Origin header at all — server-to-server, curl, Postman, mobile apps.
      return callback(null, { origin: true, credentials: true });
    }

    const sameOrigin = `${req.protocol}://${req.headers.host}`;
    if (origin === sameOrigin || configured.includes(origin)) {
      return callback(null, { origin, credentials: true });
    }

    if (!configured.length && !isProduction) {
      // Dev convenience: nothing configured, not in production — allow it.
      return callback(null, { origin, credentials: true });
    }

    logger.warn('CORS_REJECTED', { origin, sameOrigin });
    return callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
  };
}

// ── 3. Run env guard before anything touches app ────────────────────────────
requireProductionEnv();

// ── 4. Create express app ────────────────────────────────────────────────────
//  FIX: All app.use() calls MUST come after this line.
//  Original code had express.static() referenced before app was created.
const app = express();

// ── 5. Security headers ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── 6. CORS (secure, configured) ────────────────────────────────────────────
app.use(cors(buildCorsOptions()));

// Trust first proxy (needed for rate-limit IP detection behind Nginx/Render)
app.set('trust proxy', 1);

// ── 7. Global API rate limiter ───────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// ── 8. Body parsers & sanitisation ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB injection prevention (strips $ and . from user input keys)
//app.use(mongoSanitize());

// ── 9. HTTP request logging ──────────────────────────────────────────────────
// In production: structured JSON stream → Winston (file + stdout)
// In development: colourised morgan → stdout (quick DX)
// In test: disabled entirely
if (process.env.NODE_ENV !== 'test') {
  if (isProduction) {
    // Morgan streams one-liners into Winston so they land in combined.log
    const morganStream = {
      write: (message) => logger.http(message.trim()),
    };
    app.use(morgan('combined', { stream: morganStream }));
  } else {
    app.use(morgan('dev'));
  }
}

// ── 10. API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/super',   superRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/hod',     hodRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/files',   filesRoutes);

app.get('/api/health', (_req, res) =>
  res.json({
    success: true,
    env: process.env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date(),
  })
);

// ── 11. Static Frontends ─────────────────────────────────────────────────────
// FIX: express.static() is placed AFTER all API routes and middleware.
// No-cache headers for HTML/JS/CSS to prevent stale front-end loads.
const noCache = {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
};

app.use('/shared',         express.static(path.join(__dirname, 'shared'),         noCache));
app.use('/login',          express.static(path.join(__dirname, 'login'),          noCache));
app.use('/super-admin',    express.static(path.join(__dirname, 'super-admin'),    noCache));
app.use('/admin',          express.static(path.join(__dirname, 'admin'),          noCache));
app.use('/hod',            express.static(path.join(__dirname, 'hod'),            noCache));
app.use('/teacher',        express.static(path.join(__dirname, 'teacher'),        noCache));
app.use('/student',        express.static(path.join(__dirname, 'student-parent'), noCache));
app.use('/student-parent', express.static(path.join(__dirname, 'student-parent'), noCache));

// Root redirect
app.get('/', (_req, res) => res.redirect('/login'));
app.get(['/parent', '/parent/', '/parents', '/parents/'], (_req, res) => res.redirect('/student/'));

// SPA fallback for each frontend
const spa = (dir) => (_req, res) =>
  res.sendFile(path.join(__dirname, dir, 'index.html'));

[
  ['super-admin',    'super-admin'],
  ['admin',          'admin'],
  ['hod',            'hod'],
  ['teacher',        'teacher'],
  ['student',        'student-parent'],
  ['student-parent', 'student-parent'],
].forEach(([route, dir]) => {
  app.get('/' + route,           (_req, res) => res.redirect('/' + route + '/'));
  app.get(`/${route}/*path`,     spa(dir));
});
app.get('/login/*path', spa('login'));

// 404 for unknown API routes
app.use('/api', notFound);
app.use(errorHandler);

// ── 12. Start server ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

connectDB()
  .then(async () => {
    await ensureSuperAdmin().catch(err =>
      logger.error('Super admin seed failed', { message: err.message })
    );

    app.listen(PORT, '0.0.0.0', () => {
      logger.info('SAL Portal started', {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        superAdmin: process.env.SUPER_ADMIN_EMAIL || 'superadmin@sal.com',
      });

      // Keep the developer-friendly banner in non-production only
      if (!isProduction) {
        console.log('\n' + '━━━'.repeat(20));
        console.log('  🚀  SAL College Management System  v4.0');
        console.log('━━━'.repeat(20));
        console.log('  App      →  http://localhost:' + PORT);
        console.log('  Login    →  http://localhost:' + PORT + '/login');
        console.log('  Health   →  http://localhost:' + PORT + '/api/health');
        console.log('  Super    →  http://localhost:' + PORT + '/super-admin');
        console.log('  Admin    →  http://localhost:' + PORT + '/admin');
        console.log('  HOD      →  http://localhost:' + PORT + '/hod');
        console.log('  Teacher  →  http://localhost:' + PORT + '/teacher');
        console.log('  Student  →  http://localhost:' + PORT + '/student');
        console.log('━━━'.repeat(20) + '\n');
      }
    });

    const shutdown = (signal) => {
      logger.info(`${signal} received – shutting down`);
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  })
  .catch(err => {
    logger.error('MongoDB connection failed', { message: err.message });
    console.error('  Ensure MongoDB is running and MONGO_URI is correct in .env');
    process.exit(1);
  });

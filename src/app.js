import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.routes.js';
import superRoutes from './routes/super.routes.js';
import adminRoutes from './routes/admin.routes.js';
import hodRoutes from './routes/hod.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import studentRoutes from './routes/student.routes.js';
import { notFound, errorHandler } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { ok: false, message: 'Too many attempts.' } });
const apiLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 });

app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/super',   apiLimiter,  superRoutes);
app.use('/api/admin',   apiLimiter,  adminRoutes);
app.use('/api/hod',     apiLimiter,  hodRoutes);
app.use('/api/teacher', apiLimiter,  teacherRoutes);
app.use('/api/student', apiLimiter,  studentRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'running', timestamp: new Date() }));

// Static files — shared lib
app.use('/shared', express.static(path.join(root, 'shared')));

// Role dashboards
app.use('/login',         express.static(path.join(root, 'login')));
app.use('/super-admin',   express.static(path.join(root, 'super-admin')));
app.use('/admin',         express.static(path.join(root, 'admin')));
app.use('/hod',           express.static(path.join(root, 'hod')));
app.use('/teacher',       express.static(path.join(root, 'teacher')));
app.use('/student',       express.static(path.join(root, 'student-parent')));
app.use('/student-parent',express.static(path.join(root, 'student-parent')));

app.get('/', (_req, res) => res.redirect('/login'));

// SPA fallbacks
const spa = (dir) => (_req, res) => res.sendFile(path.join(root, dir, 'index.html'));
app.get('/super-admin/*path', spa('super-admin'));
app.get('/admin/*path',       spa('admin'));
app.get('/hod/*path',         spa('hod'));
app.get('/teacher/*path',     spa('teacher'));
app.get('/student/*path',     spa('student-parent'));
app.get('/student-parent/*path', spa('student-parent'));

app.use('/api', notFound);
app.use(errorHandler);

export default app;

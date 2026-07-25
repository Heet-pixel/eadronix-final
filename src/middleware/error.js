/**
 * SAL Portal – Error Middleware
 * File: src/middleware/error.js
 *
 * Changes from original:
 *  6. Production Logging – console.error replaced with Winston logger so
 *     errors are captured in logs/error.log and logs/combined.log.
 *  7. Security Audit – error responses in production no longer leak internal
 *     error details (stack traces, raw Mongoose messages) to the client.
 *     Internal details are logged server-side only.
 */

import { logError } from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    success: false,
    message: `Route ${req.method} ${req.path} not found.`,
  });
}

export function errorHandler(err, req, res, _next) {
  // Log full error server-side (Winston – lands in error.log + combined.log)
  logError(err, {
    method:  req.method,
    url:     req.originalUrl,
    ip:      req.ip,
    user:    req.user?.id,
  });

  const status = err.status || err.statusCode || 500;

  // ── Mongoose validation errors ──────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const msgs = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ ok: false, success: false, message: msgs });
  }

  // ── Mongoose duplicate key ──────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      ok: false,
      success: false,
      message: `${field} already exists.`,
    });
  }

  // ── JWT errors ──────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Invalid or expired token.',
    });
  }

  // ── CORS errors ─────────────────────────────────────────────────────────────
  if (err.message && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({
      ok: false,
      success: false,
      message: 'CORS: origin not allowed.',
    });
  }

  // ── Generic errors ──────────────────────────────────────────────────────────
  // In production: never send internal error details to clients
  const clientMessage = isProduction && status === 500
    ? 'An internal server error occurred.'
    : (err.message || 'Internal server error');

  res.status(status).json({ ok: false, success: false, message: clientMessage });
}

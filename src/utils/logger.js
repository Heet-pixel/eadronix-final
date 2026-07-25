/**
 * SAL Portal – Production Logger
 * File: src/utils/logger.js
 *
 * Uses Winston with:
 *  - Console transport (colourised in dev, plain JSON in production)
 *  - File transports: logs/error.log  (errors only)
 *                     logs/combined.log (all levels)
 *  - Structured JSON format so logs can be ingested by any log aggregator
 */

import { createLogger, format, transports } from 'winston';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.resolve(__dirname, '../../../logs');

// Ensure logs/ directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const isProduction = process.env.NODE_ENV === 'production';

// ── Formats ──────────────────────────────────────────────────────────────────

const baseFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat()
);

const jsonFormat = format.combine(
  baseFormat,
  format.json()
);

const prettyFormat = format.combine(
  baseFormat,
  format.colorize(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  })
);

// ── Transports ────────────────────────────────────────────────────────────────

const consoleTransport = new transports.Console({
  format: isProduction ? jsonFormat : prettyFormat,
  // Suppress noisy logs during tests
  silent: process.env.NODE_ENV === 'test',
});

const errorFileTransport = new transports.File({
  filename: path.join(LOG_DIR, 'error.log'),
  level: 'error',
  format: jsonFormat,
  maxsize: 10 * 1024 * 1024,   // 10 MB
  maxFiles: 5,
  tailable: true,
});

const combinedFileTransport = new transports.File({
  filename: path.join(LOG_DIR, 'combined.log'),
  format: jsonFormat,
  maxsize: 20 * 1024 * 1024,   // 20 MB
  maxFiles: 10,
  tailable: true,
});

// ── Logger instance ───────────────────────────────────────────────────────────

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transports: [consoleTransport, errorFileTransport, combinedFileTransport],
  exitOnError: false,
});

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Log a successful login attempt.
 * @param {string} email
 * @param {string} role
 * @param {string} ip
 */
export function logLogin(email, role, ip) {
  logger.info('AUTH_LOGIN_SUCCESS', { email, role, ip });
}

/**
 * Log a failed login attempt.
 * @param {string} email
 * @param {string} reason  - 'bad_password' | 'account_locked' | 'inactive' | …
 * @param {string} ip
 */
export function logLoginFailed(email, reason, ip) {
  logger.warn('AUTH_LOGIN_FAILED', { email, reason, ip });
}

/**
 * Log an OTP send / verify event.
 * @param {'sent'|'verified'|'failed'} event
 * @param {string} email
 * @param {string} purpose
 */
export function logOtp(event, email, purpose) {
  logger.info(`AUTH_OTP_${event.toUpperCase()}`, { email, purpose });
}

/**
 * Log an application-level error (not HTTP 4xx user errors).
 * @param {Error|string} err
 * @param {object} [context]
 */
export function logError(err, context = {}) {
  logger.error(err instanceof Error ? err.message : err, {
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  });
}

export default logger;

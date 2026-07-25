/**
 * SAL Portal – Auth Routes
 * File: src/routes/auth.routes.js
 *
 * Changes from original:
 *  3. OTP Rate Limiting – two-tier rate limiter applied to /send-otp:
 *       • Tier 1: max 3 requests per 5 minutes (burst protection)
 *       • Tier 2: max 10 requests per hour (sustained abuse protection)
 *     Both limiters use keyed-by-IP + email so one user can't burn another's
 *     quota (uses req.body.email in the key when available).
 */

import { Router }    from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import * as auth     from '../controllers/auth.controller.js';

const router = Router();

// ── OTP Rate Limiters ──────────────────────────────────────────────────────
/**
 * Key function: combines IP + email so that:
 *  - one IP cannot spam OTPs for many different emails rapidly
 *  - one email cannot receive too many OTPs from any IP
 * Falls back to IP-only if email not yet available in body.
 */
const otpKeyGenerator = (req) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const ip = ipKeyGenerator(req);
  return email ? `otp:${ip}:${email}` : `otp:${ip}`;
};

const otpRateLimitMessage = {
  success: false,
  message: 'Too many OTP requests. Please try again later.',
};

/**
 * Tier 1 – Burst limiter: max 3 OTP requests per 5 minutes.
 * Stops a single attacker from hammering the endpoint in rapid succession.
 */
const otpBurstLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 3,
  keyGenerator: otpKeyGenerator,
  message: otpRateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Tier 2 – Sustained limiter: max 10 OTP requests per hour.
 * Prevents accumulated abuse even at a slower rate.
 */
const otpHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10,
  keyGenerator: otpKeyGenerator,
  message: otpRateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Convenience: stack both limiters as a middleware array
const otpLimiters = [otpBurstLimiter, otpHourlyLimiter];
 
// ── Public (no auth) ───────────────────────────────────────────────────────
router.post('/check-email',     auth.checkEmail);
router.post('/send-otp',        ...otpLimiters, auth.sendOtp);   // ← rate limited
router.post('/verify-otp',      auth.verifyOtp);
router.post('/create-password', auth.createPassword);
router.post('/login',           auth.login);
router.post('/refresh',         auth.refresh);

// ── Protected ──────────────────────────────────────────────────────────────
router.get ('/me',              requireAuth, auth.me);
router.put ('/profile',         requireAuth, auth.updateProfile);
router.post('/change-password', requireAuth, auth.changePassword);
router.post('/logout',          requireAuth, auth.logout);

export default router;

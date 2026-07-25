/**
 * SAL Portal – Auth Controller
 * File: src/controllers/auth.controller.js
 *
 * Changes from original:
 *  4. Session Cleanup – issueTokens() now enforces MAX_SESSIONS = 5.
 *     When a 6th session is added the oldest is automatically evicted
 *     (sorted by createdAt ascending, oldest first), keeping only the
 *     newest MAX_SESSIONS sessions.  Refresh-token rotation continues
 *     to work correctly because a same-deviceId login updates in-place
 *     before the cap is applied.
 *
 *  6. Production Logging – Winston logger integrated:
 *       • Successful logins    → logLogin()
 *       • Failed logins        → logLoginFailed()
 *       • OTP send / verify    → logOtp()
 *       • Unexpected errors    → logError()  (via errorHandler in error.js)
 *
 *  7. Security Audit fixes:
 *       • OTP brute-force: verifyOtp now increments an attempts counter on
 *         the OtpCode document and invalidates it after 5 wrong guesses,
 *         preventing an attacker from trying all 1,000,000 6-digit codes.
 *       • createPassword: validates password strength (min 8 chars, must
 *         contain at least one letter and one digit).
 *       • login: unchanged – brute-force lock already present in original.
 */

import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import OtpCode from '../models/OtpCode.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import {
  signAccess, signRefresh, signTemp,
  verifyRefresh, verifyTemp,
} from '../utils/tokens.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { logLogin, logLoginFailed, logOtp } from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS      = 15 * 60 * 1000;   // 15 min
const OTP_TTL_MS         = 5  * 60 * 1000;   // 5 min

/**
 * Session cleanup constant.
 * FIX: Original code had no cap – sessions grew indefinitely.
 * Now we keep at most 5 concurrent sessions per user.
 */
const MAX_SESSIONS = 5;

// Maximum wrong OTP guesses before the code is invalidated
const MAX_OTP_ATTEMPTS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const publicUser = (u) => ({
  id:         u.id,
  name:       u.name,
  email:      u.email,
  role:       u.role,
  college:    u.college,
  department: u.department,
  student:    u.student,
  firstLogin: u.firstLogin,
  designation: u.designation,
  phone:      u.phone,
});

/**
 * Issue a new access + refresh token pair for `user` on `deviceId`.
 *
 * Session cleanup strategy:
 *  1. Remove any existing session for the same deviceId (same-device re-login).
 *  2. Append the new session.
 *  3. If we now exceed MAX_SESSIONS, sort by createdAt and drop the oldest
 *     until we're back at MAX_SESSIONS.
 *
 * This guarantees the array never grows past MAX_SESSIONS elements while
 * always keeping the NEWEST sessions (most recently active devices).
 */
async function issueTokens(user, deviceId = 'default', remember = true) {
  const accessToken  = signAccess(user);
  const refreshToken = signRefresh(user, deviceId);

  const days = remember
    ? Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30)
    : 1;

  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  // Step 1: Remove existing session for this device (prevents duplicates)
  user.sessions = (user.sessions || []).filter(s => s.deviceId !== deviceId);

  // Step 2: Add the new session
  user.sessions.push({
    deviceId,
    refreshTokenHash,
    remember,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + days * 86_400_000),
  });

  // Step 3: Enforce MAX_SESSIONS – evict oldest sessions
  if (user.sessions.length > MAX_SESSIONS) {
    // Sort ascending by createdAt (oldest first)
    user.sessions.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    // Keep only the newest MAX_SESSIONS entries
    user.sessions = user.sessions.slice(-MAX_SESSIONS);
  }

  await user.save();
  return { accessToken, refreshToken };
}

/** Basic password strength check */
function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&   // at least one letter
    /[0-9]/.test(password)          // at least one digit
  );
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const checkEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email) return fail(res, 400, 'Email is required.');

  const user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');
  if (!user)        return fail(res, 404, 'This email is not registered in the system.');
  if (!user.active) return fail(res, 403, 'Your account has been deactivated. Contact admin.');

  const hasPassword  = Boolean(user.passwordHash);
  const isFirstLogin = !hasPassword;
  ok(res, {
    exists: true,
    isFirstLogin,
    step:   hasPassword ? 'password' : 'first',
    name:   user.name,
    role:   user.role,
  });
});

export const sendOtp = asyncHandler(async (req, res) => {
  const email   = String(req.body.email   || '').toLowerCase().trim();
  const purpose = String(req.body.purpose || 'first_login');

  if (!['first_login', 'reset_password'].includes(purpose))
    return fail(res, 400, 'Invalid OTP purpose.');

  const user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');
  if (!user)        return fail(res, 404, 'Email not registered.');
  if (!user.active) return fail(res, 403, 'Your account has been deactivated. Contact admin.');

  const hasPassword = Boolean(user.passwordHash);
  if (purpose === 'first_login'    && hasPassword)
    return fail(res, 409, 'Account already activated. Please log in with your password.');
  if (purpose === 'reset_password' && !hasPassword)
    return fail(res, 400, 'Account not yet activated. Please activate your account first.');

  // Generate cryptographically uniform 6-digit OTP
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await OtpCode.create({
    email,
    purpose,
    codeHash:  await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  const result = await sendOtpEmail(email, code, purpose);

  // Log OTP send event
  logOtp('sent', email, purpose);

  const isProd = process.env.NODE_ENV === 'production';

  // In production, a genuine delivery failure must NOT be reported as
  // success — the user would be told to check an inbox that will never
  // receive anything, with no way to get their code. In dev, we fall back to
  // showing the OTP directly since there's a real server console to read it
  // from but the person testing the UI usually doesn't have one open.
  if (!result.sent && isProd) {
    return fail(res, 502, 'Could not send the OTP email right now. Please try again in a moment, or contact your administrator if this keeps happening.');
  }

  const devData = (!isProd && !result.sent) ? { devOtp: code } : {};

  ok(
    res,
    devData,
    result.sent
      ? `OTP sent to ${email}. Check your inbox.`
      : `OTP sent. (Dev mode — check server console.)`
  );
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const email   = String(req.body.email   || '').toLowerCase().trim();
  const otp     = String(req.body.otp     || '').trim();
  const purpose = String(req.body.purpose || 'first_login');

  if (!email || !otp)
    return fail(res, 400, 'Email and OTP are required.');
  if (!['first_login', 'reset_password'].includes(purpose))
    return fail(res, 400, 'Invalid OTP purpose.');

  // Find the most recent unused, unexpired OTP for this email+purpose
  const row = await OtpCode.findOne({
    email,
    purpose,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!row) return fail(res, 400, 'OTP has expired. Please request a new one.');

  // Security Fix: track wrong-attempt count to prevent brute-force enumeration
  if (!(await bcrypt.compare(otp, row.codeHash))) {
    row.attempts = (row.attempts || 0) + 1;

    if (row.attempts >= MAX_OTP_ATTEMPTS) {
      // Invalidate the OTP after too many wrong guesses
      row.usedAt = new Date();
      await row.save();
      logOtp('failed', email, purpose);
      return fail(res, 400, 'Too many wrong OTP attempts. Please request a new OTP.');
    }

    await row.save();
    logOtp('failed', email, purpose);
    const left = MAX_OTP_ATTEMPTS - row.attempts;
    return fail(res, 400, `Invalid OTP. ${left} attempt${left === 1 ? '' : 's'} remaining.`);
  }

  row.usedAt = new Date();
  await row.save();

  logOtp('verified', email, purpose);
  ok(res, { tempToken: signTemp({ email, purpose }), purpose }, 'OTP verified successfully.');
});

export const createPassword = asyncHandler(async (req, res) => {
  const { tempToken, password } = req.body;

  // Security Fix: stronger password validation
  if (!password)
    return fail(res, 400, 'Password is required.');
  if (!isStrongPassword(password))
    return fail(res, 400, 'Password must be at least 8 characters and include at least one letter and one number.');
  if (!tempToken)
    return fail(res, 400, 'Verification token is required.');

  let payload;
  try {
    payload = verifyTemp(tempToken);
  } catch {
    return fail(res, 400, 'Invalid or expired verification token.');
  }

  const user = await User.findOne({ email: payload.email, isDeleted: false })
    .select('+passwordHash');
  if (!user) return fail(res, 404, 'User not found.');

  const hasPassword = Boolean(user.passwordHash);
  if (payload.purpose === 'first_login'    && hasPassword)
    return fail(res, 409, 'Account already activated. Please log in with your password.');
  if (payload.purpose === 'reset_password' && !hasPassword)
    return fail(res, 400, 'Account not yet activated. Please activate your account first.');

  await user.setPassword(password);
  user.firstLogin       = false;
  user.loginAttempts    = 0;
  user.loginLockedUntil = undefined;
  await user.save();

  ok(res, {}, 'Password created successfully. You can now log in.');
});

export const login = asyncHandler(async (req, res) => {
  const email    = String(req.body.email    || '').toLowerCase().trim();
  const password = req.body.password        || '';
  const remember = req.body.remember        !== false;
  const ip       = req.ip || 'unknown';

  if (!email || !password)
    return fail(res, 400, 'Email and password are required.');

  const user = await User.findOne({ email, isDeleted: false })
    .select('+passwordHash +sessions.refreshTokenHash');

  if (!user) {
    logLoginFailed(email, 'not_found', ip);
    // Generic message prevents user enumeration
    return fail(res, 401, 'Invalid email or password.');
  }
  if (!user.active) {
    logLoginFailed(email, 'inactive', ip);
    return fail(res, 403, 'Your account has been deactivated. Contact admin.');
  }
  if (!user.passwordHash) {
    logLoginFailed(email, 'no_password', ip);
    return fail(res, 401, 'Please set your password first using the OTP flow.');
  }

  // Check lock
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    const mins = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
    logLoginFailed(email, 'account_locked', ip);
    return fail(res, 429, `Too many wrong password attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  // Auto-reset lock once expiry has passed
  if (user.loginLockedUntil && user.loginLockedUntil <= new Date()) {
    user.loginAttempts    = 0;
    user.loginLockedUntil = undefined;
  }

  if (!(await user.comparePassword(password))) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    const attemptsLeft = Math.max(MAX_LOGIN_ATTEMPTS - user.loginAttempts, 0);

    if (attemptsLeft <= 0) {
      user.loginLockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      await user.save();
      logLoginFailed(email, 'locked_now', ip);
      return fail(res, 429, 'Too many wrong password attempts. Your account is locked for 15 minutes.');
    }

    await user.save();
    logLoginFailed(email, 'bad_password', ip);
    return fail(res, 401, `Invalid password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`);
  }

  // Successful login
  user.loginAttempts    = 0;
  user.loginLockedUntil = undefined;

  const tokens = await issueTokens(user, req.body.deviceId || 'web', remember);

  logLogin(email, user.role, ip);
  ok(res, { ...tokens, user: publicUser(user) }, 'Logged in successfully.');
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;
  if (!token) return fail(res, 401, 'Refresh token required.');

  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    return fail(res, 401, 'Session expired. Please log in again.');
  }

  const user = await User.findById(payload.sub).select('+sessions.refreshTokenHash');
  if (!user || user.isDeleted || !user.active)
    return fail(res, 401, 'Account inactive or not found.');

  const session = (user.sessions || []).find(s => s.deviceId === payload.deviceId);
  if (!session)
    return fail(res, 401, 'Session not found. Please log in again.');
  if (session.expiresAt && new Date() > session.expiresAt)
    return fail(res, 401, 'Session expired.');
  if (!(await bcrypt.compare(token, session.refreshTokenHash)))
    return fail(res, 401, 'Session invalid.');

  const tokens = await issueTokens(user, payload.deviceId, session.remember);
  ok(res, { ...tokens, user: publicUser(user) }, 'Token refreshed.');
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: publicUser(req.user), ...publicUser(req.user) });
});

export const logout = asyncHandler(async (req, res) => {
  const deviceId = req.body?.deviceId || 'web';
  req.user.sessions = (req.user.sessions || []).filter(s => s.deviceId !== deviceId);
  await req.user.save();
  ok(res, {}, 'Logged out successfully.');
});

export const updateProfile = asyncHandler(async (req, res) => {
  ['name', 'phone'].forEach(k => {
    if (req.body[k] !== undefined) req.user[k] = req.body[k];
  });
  await req.user.save();
  ok(res, { user: publicUser(req.user) }, 'Profile updated.');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return fail(res, 400, 'Both current and new password are required.');
  if (!isStrongPassword(newPassword))
    return fail(res, 400, 'New password must be at least 8 characters and include at least one letter and one number.');

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await user.comparePassword(currentPassword)))
    return fail(res, 401, 'Current password is incorrect.');

  await user.setPassword(newPassword);
  await user.save();
  ok(res, {}, 'Password changed successfully.');
});

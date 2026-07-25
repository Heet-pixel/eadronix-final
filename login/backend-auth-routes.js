// ============================================================
// backend-auth-routes.js
// Reference implementation for all /api/auth/* endpoints.
//
// Framework: Express.js
// Database:  Any (pseudocode db calls — adapt to your ORM/DB)
// Deps:      bcrypt, jsonwebtoken, crypto
//
// CRITICAL FIX IMPLEMENTED:
//   /check-email now returns step='password' when
//   user.password_hash OR user.is_password_created is truthy.
//   Previously this was returning step='first' for all users,
//   causing the activation screen to show after logout.
// ============================================================

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const router  = express.Router();

const SALT_ROUNDS     = 12;
const OTP_TTL_MS      = 10 * 60 * 1000; // 10 minutes
const TEMP_TOKEN_TTL  = 15 * 60;         // 15 minutes (seconds for JWT)
const ACCESS_TTL      = '15m';
const REFRESH_TTL     = '7d';

// ── In-memory OTP store (replace with Redis/DB in production) ─
const otpStore = new Map(); // key: `${email}:${purpose}` → { otp, expiresAt }

// ────────────────────────────────────────────────────────────
// POST /api/auth/check-email
//
// THE CORE FIX IS HERE.
//
// Returns step='password' if user already has a password set.
// Returns step='first'    if user has never set a password.
//
// A user who logs out still has password_hash and
// is_password_created=true in the DB. Logout only destroys the
// session token — it does NOT reset password fields.
// ────────────────────────────────────────────────────────────
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email is required.' });

    const user = await db.users.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json({ success: false, message: 'Email not found in the system.' });

    // ── THE FIX ──────────────────────────────────────────────
    // Check BOTH fields for backwards compatibility:
    //   - password_hash: the actual bcrypt hash
    //   - is_password_created: boolean flag (belt-and-suspenders)
    //
    // OLD (BROKEN) CODE:
    //   const step = user.firstLogin ? 'first' : 'password';
    //   (or any logic that doesn't check password_hash)
    //
    // NEW (CORRECT) CODE:
    const step = (user.password_hash || user.is_password_created) ? 'password' : 'first';
    // ─────────────────────────────────────────────────────────

    return res.json({
      success: true,
      data: {
        name: user.name,
        role: user.role,
        step,          // 'password' → returning user,  'first' → new user
      },
    });
  } catch (err) {
    console.error('/check-email error:', err);
    return res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/send-otp
//
// Guards against sending activation OTP to already-activated accounts.
// purpose: 'first_login' | 'reset_password'
// ────────────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return res.json({ success: false, message: 'email and purpose are required.' });
    if (!['first_login', 'reset_password'].includes(purpose)) {
      return res.json({ success: false, message: 'Invalid OTP purpose.' });
    }

    const user = await db.users.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json({ success: false, message: 'Email not found.' });

    // ── Guard: block activation OTP for users who already have a password ──
    if (purpose === 'first_login' && (user.password_hash || user.is_password_created)) {
      return res.json({
        success: false,
        message: 'Account already activated. Use Forgot Password to reset your password.',
      });
    }

    // ── Guard: only allow reset_password for users who HAVE a password ──
    if (purpose === 'reset_password' && !user.password_hash && !user.is_password_created) {
      return res.json({
        success: false,
        message: 'Account not yet activated. Please activate your account first.',
      });
    }

    // Generate 6-digit OTP
    const otp       = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + OTP_TTL_MS;
    otpStore.set(`${email}:${purpose}`, { otp, expiresAt });

    // Send OTP via email (adapt to your email provider)
    await emailService.send({
      to:      email,
      subject: purpose === 'first_login' ? 'Activate your Eadronix account' : 'Reset your Eadronix password',
      text:    `Your OTP is: ${otp}\n\nThis OTP expires in 10 minutes. Do not share it with anyone.`,
    });

    const response = { success: true, message: 'OTP sent successfully.' };

    // Dev mode: echo OTP in response (REMOVE in production)
    if (process.env.NODE_ENV === 'development') {
      response.data = { devOtp: otp };
    } else {
      response.data = {};
    }

    return res.json(response);
  } catch (err) {
    console.error('/send-otp error:', err);
    return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Returns a short-lived tempToken on success.
// ────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose: requestedPurpose } = req.body;
    if (!email || !otp) return res.json({ success: false, message: 'email and otp are required.' });
    if (requestedPurpose && !['first_login', 'reset_password'].includes(requestedPurpose)) {
      return res.json({ success: false, message: 'Invalid OTP purpose.' });
    }

    const purposesToCheck = requestedPurpose ? [requestedPurpose] : ['first_login', 'reset_password'];
    let matchedPurpose = null;
    for (const purpose of purposesToCheck) {
      const record = otpStore.get(`${email}:${purpose}`);
      if (record && record.otp === otp) {
        matchedPurpose = purpose;
        // Check expiry
        if (Date.now() > record.expiresAt) {
          otpStore.delete(`${email}:${purpose}`);
          return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }
        otpStore.delete(`${email}:${purpose}`); // one-time use
        break;
      }
    }

    if (!matchedPurpose) {
      return res.json({ success: false, message: 'Invalid OTP. Please check and try again.' });
    }

    // Issue a short-lived tempToken (email + purpose bound)
    const tempToken = jwt.sign(
      { email: email.toLowerCase().trim(), purpose: matchedPurpose },
      process.env.JWT_SECRET,
      { expiresIn: TEMP_TOKEN_TTL }
    );

    return res.json({ success: true, data: { tempToken, purpose: matchedPurpose } });
  } catch (err) {
    console.error('/verify-otp error:', err);
    return res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/create-password
//
// Sets or resets the password.
// ALWAYS sets is_password_created = true.
// NEVER called without a valid tempToken.
// ────────────────────────────────────────────────────────────
router.post('/create-password', async (req, res) => {
  try {
    const { tempToken, password } = req.body;
    if (!tempToken || !password) {
      return res.json({ success: false, message: 'tempToken and password are required.' });
    }
    if (password.length < 8) {
      return res.json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Validate tempToken
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.json({ success: false, message: 'Verification token is invalid or expired. Please start over.' });
    }

    const { email, purpose } = payload;
    const user = await db.users.findOne({ email });
    if (!user) return res.json({ success: false, message: 'User not found.' });
    if (purpose === 'first_login' && (user.password_hash || user.is_password_created)) {
      return res.json({ success: false, message: 'Account already activated. Please log in with your password.' });
    }
    if (purpose === 'reset_password' && !user.password_hash && !user.is_password_created) {
      return res.json({ success: false, message: 'Account not yet activated. Please activate your account first.' });
    }

    // Hash and save password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // ── THE FIX: always set is_password_created = true ───────
    await db.users.update(
      { email },
      {
        password_hash,
        is_password_created: true,   // permanent flag — never reset on logout
      }
    );

    return res.json({ success: true, message: 'Password saved successfully.' });
  } catch (err) {
    console.error('/create-password error:', err);
    return res.json({ success: false, message: 'Failed to save password. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'email and password are required.' });

    const user = await db.users.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password_hash) {
      return res.json({ success: false, message: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.json({ success: false, message: 'Invalid email or password.' });

    const accessToken  = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Store refresh token in DB (hashed for security)
    await db.refreshTokens.create({
      user_id:    user.id,
      token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    console.error('/login error:', err);
    return res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.json({ success: false, message: 'refreshToken is required.' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record    = await db.refreshTokens.findOne({ token_hash: tokenHash });

    if (!record || new Date() > record.expires_at) {
      if (record) await db.refreshTokens.delete({ token_hash: tokenHash });
      return res.json({ success: false, message: 'Refresh token expired or invalid.' });
    }

    const user        = await db.users.findOne({ id: record.user_id });
    const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    await db.refreshTokens.update(
      { token_hash: tokenHash },
      {
        token_hash: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    );

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    console.error('/refresh error:', err);
    return res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/auth/logout
//
// THE FIX: Only destroys the session token.
// Does NOT touch password_hash or is_password_created.
// After logout, the user will correctly reach step-password
// (not step-first) on their next login attempt.
// ────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      // Remove ONLY the refresh token — no other DB fields are touched
      await db.refreshTokens.delete({ token_hash: tokenHash });
    }

    // ── What we do NOT do on logout ──────────────────────────
    // ✗  user.password_hash = null
    // ✗  user.is_password_created = false
    // ✗  user.firstLogin = true
    // ─────────────────────────────────────────────────────────

    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    console.error('/logout error:', err);
    return res.json({ success: false, message: 'Server error during logout.' });
  }
});

module.exports = router;

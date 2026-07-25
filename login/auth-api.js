// ============================================================
// login/auth-api.js
// All network calls to /api/auth/*.
// Returns { ok, data, message } — never touches the DOM.
// ============================================================

const API = '/api/auth';

async function _post(path, body) {
  try {
    const res  = await fetch(API + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    return { ok: json.success === true, data: json.data || {}, message: json.message || '' };
  } catch (err) {
    return { ok: false, data: {}, message: 'Cannot reach server. Check your connection.' };
  }
}

// ── Check if email exists and whether user has a password ────
// Backend MUST return:
//   { success: true, data: { name, role, step: 'password' | 'first' } }
//
//   step = 'password'  → user has password_hash OR is_password_created = true
//   step = 'first'     → user exists but has never set a password
//
// Backend logic (pseudocode):
//   const user = await db.findByEmail(email);
//   if (!user) return { success: false, message: 'Email not found.' };
//   const step = (user.password_hash || user.is_password_created) ? 'password' : 'first';
//   return { success: true, data: { name: user.name, role: user.role, step } };
async function apiCheckEmail(email) {
  return _post('/check-email', { email });
}

// ── Send OTP for first_login or reset_password ───────────────
// purpose must be 'first_login' or 'reset_password'
// Backend MUST reject purpose='first_login' if user already has a password:
//   if (purpose === 'first_login' && (user.password_hash || user.is_password_created)) {
//     return { success: false, message: 'Account already activated. Use Forgot Password.' };
//   }
async function apiSendOtp(email, purpose) {
  return _post('/send-otp', { email, purpose });
}

// ── Verify 6-digit OTP, returns tempToken on success ─────────
async function apiVerifyOtp(email, otp, purpose) {
  return _post('/verify-otp', { email, otp, purpose });
}

// ── Set / reset password using tempToken ─────────────────────
// Backend MUST:
//   1. Validate tempToken
//   2. Hash the new password
//   3. Save: password_hash = hash, is_password_created = true
//   4. Invalidate the tempToken so it cannot be reused
async function apiCreatePassword(tempToken, password) {
  return _post('/create-password', { tempToken, password });
}

// ── Password login ───────────────────────────────────────────
async function apiLogin(email, password) {
  return _post('/login', { email, password });
}

// ── Refresh access token using stored refresh token ──────────
async function apiRefresh(refreshToken) {
  return _post('/refresh', { refreshToken });
}

// ── Logout — invalidates refresh token on the server ─────────
// Backend MUST:
//   1. Revoke / delete the refresh token from DB
//   2. Do NOT touch password_hash or is_password_created
async function apiLogout(refreshToken) {
  return _post('/logout', { refreshToken });
}

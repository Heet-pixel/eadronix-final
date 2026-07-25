// ============================================================
// login/auth-state.js
// Shared mutable state, constants, and storage helpers.
// All other modules read/write this object — never duplicate.
// ============================================================

const STATE = {
  email:     '',   // email entered by user
  name:      '',   // user's display name (from /check-email)
  role:      '',   // user's role (from /check-email)
  purpose:   '',   // 'first_login' | 'reset_password'
  tempToken: '',   // short-lived token after OTP verify
};

// ── Role → dashboard URL ─────────────────────────────────────
const ROLE_REDIRECT = {
  super_admin:  '/super-admin/',
  superadmin:   '/super-admin/',
  admin:        '/admin/',
  principal:    '/admin/',
  hod:          '/hod/',
  co_hod:       '/hod/',
  teacher:      '/teacher/',
  student:      '/student/',
  parent:       '/student/',
};

// ── Session persistence (localStorage) ──────────────────────
function saveSession(accessToken, refreshToken, user) {
  localStorage.setItem('sal_at',      accessToken);
  localStorage.setItem('sal_rt',      refreshToken);
  localStorage.setItem('sal_token',   accessToken);   // legacy key
  localStorage.setItem('sal_refresh', refreshToken);  // legacy key
  localStorage.setItem('sal_user',    JSON.stringify(user));
}

// ── Clear ONLY session tokens — never touches password state ─
function clearSession() {
  ['sal_at','sal_rt','sal_token','sal_refresh','sal_user'].forEach(k => localStorage.removeItem(k));
  // NOTE: sal_activated_emails is intentionally NOT cleared here.
  // It persists across logouts so returning users always get the password screen.
}

function getSavedRefreshToken() {
  return localStorage.getItem('sal_rt') || localStorage.getItem('sal_refresh') || null;
}

function getSavedUser() {
  try { return JSON.parse(localStorage.getItem('sal_user')); } catch { return null; }
}

function roleRedirect(role) {
  window.location.replace(ROLE_REDIRECT[role] || '/login');
}

// ── Password-activated email cache ───────────────────────────
// Stores emails that are known to have a password set.
// This is a frontend safety net: if the backend incorrectly returns
// step='first' for a returning user (the bug being fixed), we
// override it and show the password screen instead.
//
// Entries are written when a user successfully logs in with a password
// OR when they complete the set-password flow.
// Entries are NEVER removed on logout.

function markEmailAsActivated(email) {
  try {
    const key     = 'sal_activated_emails';
    const stored  = localStorage.getItem(key);
    const emails  = stored ? JSON.parse(stored) : [];
    const norm    = email.toLowerCase().trim();
    if (!emails.includes(norm)) {
      emails.push(norm);
      localStorage.setItem(key, JSON.stringify(emails));
    }
  } catch {}
}

function isEmailKnownActivated(email) {
  try {
    const stored = localStorage.getItem('sal_activated_emails');
    if (!stored) return false;
    const emails = JSON.parse(stored);
    return emails.includes(email.toLowerCase().trim());
  } catch { return false; }
}

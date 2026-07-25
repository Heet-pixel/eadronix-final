// ============================================================
// logout-helper.js
// Drop this script into any dashboard page that has a Logout button.
//
// Usage in your dashboard HTML:
//   <script src="/login/logout-helper.js"></script>
//   <button onclick="salLogout()">Logout</button>
//
// Or wire it up manually:
//   document.getElementById('btn-logout').addEventListener('click', salLogout);
// ============================================================

async function salLogout() {
  const refreshToken =
    localStorage.getItem('sal_rt') || localStorage.getItem('sal_refresh');

  // Tell the server to invalidate the refresh token
  // Fire-and-forget: we clear the session client-side regardless
  if (refreshToken) {
    fetch('/api/auth/logout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    }).catch(() => {}); // silently ignore network errors
  }

  // ── Clear ONLY session tokens from localStorage ───────────
  // NEVER delete password_hash or is_password_created here —
  // those live server-side only and must not be touched on logout.
  [
    'sal_at',
    'sal_rt',
    'sal_token',    // legacy key
    'sal_refresh',  // legacy key
    'sal_user',
  ].forEach(k => localStorage.removeItem(k));

  // Clear any session cookies if applicable
  document.cookie = 'sal_session=; Max-Age=0; path=/;';

  // Redirect to login — user will see Email step.
  // After entering their email, they will reach the Password step
  // (NOT the activation step) because their password_hash is intact.
  window.location.replace('/login');
}

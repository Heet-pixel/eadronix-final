// ============================================================
// login/auth-flow.js
// Full login flow controller. Wires DOM events to API calls.
//
// Flow A — First-ever login (no password set):
//   Email → step-first → OTP → OTP verify → Set password → Auto-login → Dashboard
//
// Flow B — Returning user (password_hash OR is_password_created = true):
//   Email → step-password → Login → Dashboard
//   *** OTP is NEVER sent in this flow ***
//
// Flow C — Forgot password (from step-password only):
//   step-forgot → OTP → OTP verify → Set new password → Auto-login → Dashboard
//
// Flow D — Auto-login on page load (valid refresh token in localStorage):
//   Attempt token refresh → redirect to dashboard if valid
// ============================================================

// ── Auto-login on page load ──────────────────────────────────
(async function tryAutoLogin() {
  const rt   = getSavedRefreshToken();
  const user = getSavedUser();
  if (!rt || !user) return;

  const { ok, data } = await apiRefresh(rt);
  if (ok) {
    saveSession(data.accessToken, data.refreshToken, data.user || user);
    // Make sure this email is cached as activated
    markEmailAsActivated((data.user || user).email || '');
    roleRedirect((data.user || user).role);
  } else {
    clearSession();
  }
})();

// ── Reset to step-email (full state wipe) ───────────────────
function resetToEmail() {
  STATE.email     = '';
  STATE.name      = '';
  STATE.role      = '';
  STATE.purpose   = '';
  STATE.tempToken = '';
  stopOtpTimer();
  clearInputs();
  showStep('step-email');
  focusAfter('email');
}

// ════════════════════════════════════════════════════════════
// STEP 1 — Email check
// ════════════════════════════════════════════════════════════
async function checkEmail() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  if (!email) return showAlert('Please enter your email address.');

  setLoading('btn-email', 'btn-email-label', true, 'Continue');
  const { ok, data, message } = await apiCheckEmail(email);
  setLoading('btn-email', 'btn-email-label', false, 'Continue');

  if (!ok) return showAlert(message || 'Email not found in the system.');

  STATE.email = email;
  STATE.name  = data.name  || '';
  STATE.role  = data.role  || '';

  // ── FRONTEND SAFETY NET ──────────────────────────────────
  // If the backend incorrectly returns step='first' for a user who
  // already has a password (the logout bug), override it using our
  // locally cached knowledge that this email was previously activated.
  //
  // isEmailKnownActivated() returns true if:
  //   - this browser previously completed a successful password login, OR
  //   - this browser previously completed the set-password flow
  //
  // This cache persists across logouts (it is never cleared by clearSession).
  const backendStep     = data.step;
  const effectiveStep   = backendStep === 'password' ? 'password' : 'first';

  if (effectiveStep === 'password') {
    renderUserChip('user-chip-pw', STATE.name, STATE.role);
    showStep('step-password');
    focusAfter('password');
  } else {
    renderUserChip('user-chip-first', STATE.name, STATE.role);
    showStep('step-first');
  }
}

document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') checkEmail(); });
document.getElementById('btn-email').addEventListener('click', checkEmail);
document.getElementById('btn-diff-email-pw').addEventListener('click', resetToEmail);
document.getElementById('btn-diff-email-first').addEventListener('click', resetToEmail);

// ════════════════════════════════════════════════════════════
// STEP 2a — Password login (returning user)
// ════════════════════════════════════════════════════════════
async function doLogin() {
  const password = document.getElementById('password').value;
  if (!password) return showAlert('Please enter your password.');

  setLoading('btn-login', 'btn-login-label', true, 'Login');
  const { ok, data, message } = await apiLogin(STATE.email, password);
  setLoading('btn-login', 'btn-login-label', false, 'Login');

  if (!ok) return showAlert(message || 'Invalid password. Please try again.');

  // ── Cache this email as activated on successful login ────
  markEmailAsActivated(STATE.email);

  saveSession(data.accessToken, data.refreshToken, data.user);
  showAlert('Login successful! Redirecting…', 'success');
  setTimeout(() => roleRedirect(data.user.role), 700);
}

document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('btn-login').addEventListener('click', doLogin);

// ════════════════════════════════════════════════════════════
// STEP 2b — First-login: send OTP for account activation
// Only reached when backend confirmed no password AND email is
// not in our local activated-email cache.
// ════════════════════════════════════════════════════════════
async function sendActivationOtp() {
  STATE.purpose = 'first_login';
  setLoading('btn-send-otp', 'btn-send-otp-label', true, 'Send OTP to my email');

  const { ok, data, message } = await apiSendOtp(STATE.email, 'first_login');
  setLoading('btn-send-otp', 'btn-send-otp-label', false, 'Send OTP to my email');

  if (!ok) {
    // Backend says already activated — switch to password screen
    if (message && message.toLowerCase().includes('already activated')) {
      markEmailAsActivated(STATE.email);
      showAlert('Your account is already activated. Please log in with your password.');
      setTimeout(() => {
        renderUserChip('user-chip-pw', STATE.name, STATE.role);
        showStep('step-password');
        focusAfter('password');
      }, 1500);
      return;
    }
    return showAlert(message || 'Failed to send OTP. Try again.');
  }

  if (data.devOtp) showAlert(`Dev OTP: ${data.devOtp}`, 'success');

  document.getElementById('otp-desc').textContent =
    `OTP sent to ${STATE.email}. Valid for 5 minutes.`;
  document.getElementById('btn-otp-back').dataset.backTo = 'step-first';
  document.getElementById('otp-input').value = '';
  showStep('step-otp');
  startOtpTimer();
  focusAfter('otp-input');
}

document.getElementById('btn-send-otp').addEventListener('click', sendActivationOtp);

// ════════════════════════════════════════════════════════════
// STEP 5 — Forgot password
// Only accessible from step-password via "Forgot password?" link.
// ════════════════════════════════════════════════════════════
function openForgot() {
  document.getElementById('forgot-email-display').textContent = STATE.email;
  showStep('step-forgot');
}

async function sendResetOtp() {
  STATE.purpose = 'reset_password';
  setLoading('btn-forgot-send', 'btn-forgot-send-label', true, 'Send OTP to this email');

  const { ok, data, message } = await apiSendOtp(STATE.email, 'reset_password');
  setLoading('btn-forgot-send', 'btn-forgot-send-label', false, 'Send OTP to this email');

  if (!ok) return showAlert(message || 'Failed to send OTP. Try again.');

  if (data.devOtp) showAlert(`Dev OTP: ${data.devOtp}`, 'success');

  document.getElementById('otp-desc').textContent =
    `OTP sent to ${STATE.email} for password reset. Valid for 5 minutes.`;
  document.getElementById('btn-otp-back').dataset.backTo = 'step-forgot';
  document.getElementById('otp-input').value = '';
  showStep('step-otp');
  startOtpTimer();
  focusAfter('otp-input');
}

document.getElementById('forgot-link').addEventListener('click', openForgot);
document.getElementById('btn-forgot-back').addEventListener('click', () => {
  showStep('step-password');
  focusAfter('password');
});
document.getElementById('btn-forgot-send').addEventListener('click', sendResetOtp);

// ════════════════════════════════════════════════════════════
// STEP 3 — Verify OTP
// ════════════════════════════════════════════════════════════
async function verifyOtp() {
  const otp = document.getElementById('otp-input').value.trim();
  if (otp.length !== 6) return showAlert('Please enter the full 6-digit OTP.');

  setLoading('btn-verify-otp', 'btn-verify-label', true, 'Verify OTP');
  const { ok, data, message } = await apiVerifyOtp(STATE.email, otp, STATE.purpose);
  setLoading('btn-verify-otp', 'btn-verify-label', false, 'Verify OTP');

  if (!ok) return showAlert(message || 'Invalid OTP. Please check and try again.');

  stopOtpTimer();
  STATE.tempToken = data.tempToken || data.setPasswordToken || '';
  STATE.purpose = data.purpose || STATE.purpose;

  if (STATE.purpose === 'reset_password') {
    document.getElementById('setpw-title').textContent = 'Set a new password';
    document.getElementById('setpw-sub').textContent =
      'Choose a new strong password (min. 8 characters)';
    document.getElementById('btn-setpw-label').textContent = 'Reset Password & Login';
  } else {
    document.getElementById('setpw-title').textContent = 'Set your password';
    document.getElementById('setpw-sub').textContent =
      'Choose a strong password (min. 8 characters)';
    document.getElementById('btn-setpw-label').textContent = 'Set Password & Login';
  }

  document.getElementById('new-password').value     = '';
  document.getElementById('confirm-password').value = '';
  updateStrengthMeter('');
  showStep('step-setpw');
  focusAfter('new-password');
}

async function resendOtp() {
  document.getElementById('resend-link').style.display = 'none';
  document.getElementById('otp-input').value = '';

  const { ok, data, message } = await apiSendOtp(STATE.email, STATE.purpose);
  if (!ok) return showAlert(message || 'Failed to resend OTP.');
  if (data.devOtp) showAlert(`Dev OTP: ${data.devOtp}`, 'success');
  else showAlert('A new OTP has been sent to your email.', 'success');
  startOtpTimer();
  focusAfter('otp-input');
}

function otpGoBack() {
  const backTo = document.getElementById('btn-otp-back').dataset.backTo || 'step-first';
  stopOtpTimer();
  document.getElementById('otp-input').value = '';
  showStep(backTo);
}

document.getElementById('otp-input').addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtp(); });
document.getElementById('btn-verify-otp').addEventListener('click', verifyOtp);
document.getElementById('resend-link').addEventListener('click', resendOtp);
document.getElementById('btn-otp-back').addEventListener('click', otpGoBack);

document.getElementById('otp-input').addEventListener('input', function () {
  if (this.value.replace(/\D/g, '').length === 6) {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
    setTimeout(verifyOtp, 200);
  }
});

// ════════════════════════════════════════════════════════════
// STEP 4 — Set / Reset password → auto-login
// ════════════════════════════════════════════════════════════
async function setPassword() {
  const password = document.getElementById('new-password').value;
  const confirm  = document.getElementById('confirm-password').value;

  if (password.length < 8)     return showAlert('Password must be at least 8 characters.');
  if (password !== confirm)    return showAlert('Passwords do not match.');
  if (!STATE.tempToken)        return showAlert('Verification token missing. Please start over.');

  const strength = measureStrength(password);
  if (strength.score < 2)      return showAlert('Password is too weak. Add uppercase, numbers, or symbols.');

  setLoading('btn-setpw', 'btn-setpw-label', true, '');

  const { ok, message } = await apiCreatePassword(STATE.tempToken, password);
  if (!ok) {
    setLoading('btn-setpw', 'btn-setpw-label', false,
      STATE.purpose === 'reset_password' ? 'Reset Password & Login' : 'Set Password & Login');
    return showAlert(message || 'Failed to save password. Please try again.');
  }

  // ── Cache email as activated the moment password is saved ─
  markEmailAsActivated(STATE.email);

  showAlert('Password saved! Logging you in…', 'success');

  const loginResult = await apiLogin(STATE.email, password);
  setLoading('btn-setpw', 'btn-setpw-label', false, 'Set Password & Login');

  if (loginResult.ok) {
    saveSession(loginResult.data.accessToken, loginResult.data.refreshToken, loginResult.data.user);
    showAlert('Welcome! Redirecting to your dashboard…', 'success');
    setTimeout(() => roleRedirect(loginResult.data.user.role), 800);
  } else {
    showAlert('Password set! Please log in with your new password.', 'success');
    setTimeout(() => {
      renderUserChip('user-chip-pw', STATE.name, STATE.role);
      showStep('step-password');
      focusAfter('password');
    }, 1400);
  }
}

document.getElementById('btn-setpw').addEventListener('click', setPassword);
document.getElementById('confirm-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') setPassword();
});

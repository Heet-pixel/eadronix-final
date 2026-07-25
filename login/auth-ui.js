// ============================================================
// login/auth-ui.js
// Pure UI helpers — step switching, alerts, loading states,
// password visibility, strength meter, user chip.
// No API calls here.
// ============================================================

let _otpTimer = null;

// ── Alert ────────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  if (type !== 'success') setTimeout(() => el.classList.remove('show'), 6000);
}

function hideAlert() {
  document.getElementById('alert').classList.remove('show');
}

// ── Step switcher ────────────────────────────────────────────
function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  hideAlert();
}

// ── Loading state on button ──────────────────────────────────
function setLoading(btnId, labelId, loading, label = '') {
  const btn = document.getElementById(btnId);
  const lbl = document.getElementById(labelId);
  if (!btn || !lbl) return;
  btn.disabled = loading;
  lbl.innerHTML = loading
    ? '<div class="spinner"></div>'
    : label;
}

// ── Toggle password visibility ───────────────────────────────
function togglePw(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ── User chip (shows name + role above password/OTP steps) ───
const ROLE_LABELS = {
  super_admin: 'Super Admin', superadmin: 'Super Admin',
  admin: 'Principal', principal: 'Principal',
  hod: 'HOD', co_hod: 'Co-HOD',
  teacher: 'Teacher', student: 'Student', parent: 'Parent',
};

function renderUserChip(containerId, name, role) {
  const initials = (name || '?')
    .split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
  const label = ROLE_LABELS[role] || role || '';
  document.getElementById(containerId).innerHTML = `
    <div class="user-chip-avatar">${initials}</div>
    <div>
      <div class="user-chip-name">${name}</div>
      <div class="user-chip-role">${label}</div>
    </div>`;
}

// ── Password strength meter ──────────────────────────────────
function measureStrength(pw) {
  let score = 0;
  if (!pw) return { score: 0, label: '', color: '' };
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: 'Very weak',  color: '#f85149', pct: 15 },
    { label: 'Weak',       color: '#f0883e', pct: 30 },
    { label: 'Fair',       color: '#d29922', pct: 55 },
    { label: 'Good',       color: '#3fb950', pct: 75 },
    { label: 'Strong',     color: '#00d4aa', pct: 100 },
  ];
  return { ...map[Math.min(score, 4)], score };
}

function updateStrengthMeter(pw) {
  const wrap  = document.getElementById('pw-strength');
  const fill  = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!wrap) return;
  if (!pw) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const { pct, color, label: lbl } = measureStrength(pw);
  fill.style.width = pct + '%';
  fill.style.background = color;
  label.textContent = lbl;
  label.style.color = color;
}

// ── OTP countdown timer ──────────────────────────────────────
function startOtpTimer(onExpire) {
  clearInterval(_otpTimer);
  let secs = 300;
  const timerEl  = document.getElementById('otp-timer');
  const resendEl = document.getElementById('resend-link');
  resendEl.style.display = 'none';

  function tick() {
    if (secs <= 0) {
      clearInterval(_otpTimer);
      timerEl.textContent = 'OTP has expired.';
      resendEl.style.display = 'block';
      if (onExpire) onExpire();
      return;
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    timerEl.textContent = `Expires in ${m}:${String(s).padStart(2, '0')}`;
    secs--;
  }
  tick();
  _otpTimer = setInterval(tick, 1000);
}

function stopOtpTimer() {
  clearInterval(_otpTimer);
  _otpTimer = null;
}

// ── Clear all inputs ─────────────────────────────────────────
function clearInputs() {
  ['email','password','otp-input','new-password','confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateStrengthMeter('');
}

// ── Focus helper ─────────────────────────────────────────────
function focusAfter(id, delay = 120) {
  setTimeout(() => { const el = document.getElementById(id); if (el) el.focus(); }, delay);
}

// ── Password strength: wire up live listener ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  const npEl = document.getElementById('new-password');
  if (npEl) npEl.addEventListener('input', () => updateStrengthMeter(npEl.value));
});

// js/app.js — Bootstrap + navigation + settings
async function bootstrap() {
  try {
    const me = await apiJson('/api/auth/me');
    const user = me.user || me;
    const nameEl = document.getElementById('sb-name');
    const avEl = document.getElementById('sb-av');
    const emailEl = document.getElementById('sb-email');
    const collegeEl = document.getElementById('sb-college');
    if (nameEl) nameEl.textContent = user.name || 'Principal';
    if (avEl) avEl.textContent = UI.initials(user.name);
    if (emailEl) emailEl.textContent = user.email || '';
    if (collegeEl && user.college) collegeEl.textContent = user.college.name || '';
    const subEl = document.getElementById('pg-subtitle');
    if (subEl) subEl.textContent = 'Welcome back, ' + (user.name || 'Principal');
    // Set welcome greeting
    const h = new Date().getHours();
    const greetEl = document.getElementById('welcome-greeting');
    if (greetEl) greetEl.textContent = (h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening') + ', ' + (user.name?.split(' ')[0] || 'Principal') + ' 👋';
  } catch (e) { console.error('Bootstrap error:', e); }
  // Load initial page
  Dashboard.load();
}

function navTo(section) {
  const loaders = {
    dashboard: () => Dashboard.load(),
    departments: () => Departments.load(),
    courses: () => Courses.load(),
    subjects: () => Subjects.load(),
    hod: () => HOD.load(),
    teachers: () => Teachers.load(),
    students: () => Students.load(),
    notices: () => Notices.load(),
    settings: () => loadSettings(),
  };
  if (loaders[section]) loaders[section]();
}

// Settings
async function loadSettings() {
  UI.setNav('settings');
  try {
    const d = await apiJson('/api/admin/settings');
    const s = d.data || d;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('setting-college-name', s.collegeName);
    set('setting-inst-code', s.institutionCode);
    set('setting-acad-year', s.academicYear);
  } catch { /* silently fail */ }
  try {
    const me = await apiJson('/api/auth/me');
    const u = me.user || me;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('setting-principal-name', u.name);
    set('setting-email', u.email);
    set('setting-phone', u.phone || u.mobile);
  } catch { /* silently fail */ }
}

async function saveSettings() {
  const get = id => document.getElementById(id)?.value.trim();
  try {
    await apiJson('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ collegeName: get('setting-college-name'), institutionCode: get('setting-inst-code'), academicYear: get('setting-acad-year') }) });
    UI.toast('Settings saved');
  } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
}

async function saveProfile() {
  const get = id => document.getElementById(id)?.value.trim();
  const body = { name: get('setting-principal-name'), phone: get('setting-phone') };
  const curPwd = get('setting-cur-pwd');
  const newPwd = get('setting-new-pwd');
  if (curPwd && newPwd) { body.currentPassword = curPwd; body.newPassword = newPwd; }
  try {
    await apiJson('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) });
    UI.toast('Profile updated');
  } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
}


function showLoader(show) {
  const el = document.getElementById('page-loader');
  if (el) el.style.opacity = show ? '1' : '0';
}

document.addEventListener('DOMContentLoaded', function () {
  bootstrap();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeAll(); });
  // Logout
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    el.onclick = async () => {
      try { await apiJson('/api/auth/logout', { method: 'POST' }); } catch {}
      localStorage.clear();
      window.location.replace('/login');
    };
  });
});

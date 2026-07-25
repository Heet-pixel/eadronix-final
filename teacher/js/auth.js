// teacher/js/auth.js — Auth Guard: teacher role ONLY
// Runs immediately before DOMContentLoaded to block unauthorised access
(function () {
  const ALLOWED_ROLES = ['teacher', 'hod', 'co_hod'];  // multi-role support

  function readUser() {
    try { return JSON.parse(localStorage.getItem('sal_user') || 'null'); } catch (_) { return null; }
  }

  const token = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const user  = readUser();

  if (!token || !user || !ALLOWED_ROLES.includes(user.role)) {
    window.location.replace('/login');
    return;
  }

  window.SAL_USER  = user;
  window.SAL_TOKEN = token;

  window.salApi = async function (path, opts) {
    const headers = { 'Content-Type': 'application/json', ...((opts && opts.headers) ? opts.headers : {}) };
    const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
    if (at) headers.Authorization = 'Bearer ' + at;
    const res = await fetch(path, { ...(opts || {}), headers });
    if (res.status === 401) { localStorage.clear(); window.location.replace('/login'); return { success: false }; }
    return res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
  };

  window.salLogout = async function () {
    try { await window.salApi('/api/auth/logout', { method: 'POST' }); } catch (_) { }
    localStorage.clear();
    window.location.replace('/login');
  };

  // Populate identity fields as soon as DOM is ready
  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[onclick*="logout" i]').forEach(function (el) {
      if ((el.textContent || '').toLowerCase().includes('logout') || (el.textContent || '').toLowerCase().includes('sign'))
        el.onclick = window.salLogout;
    });
    const initials = user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
    ['sidebarAv', 'headerAv', 'sb-av'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = initials;
    });
    ['sidebarName', 'headerName', 'sb-name'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = user.name || '';
    });
  });
})();

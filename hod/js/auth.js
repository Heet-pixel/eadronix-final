// hod/js/auth.js — Auth Guard & Session Bootstrap
// Runs immediately (before DOMContentLoaded) to protect the page
(function () {
  const allowedRoles = ['hod', 'co_hod'];
  function readUser() {
    try { return JSON.parse(localStorage.getItem('sal_user') || 'null'); } catch (_) { return null; }
  }
  const token = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const user = readUser();
  if (!token || !user || !allowedRoles.includes(user.role)) {
    window.location.replace('/login');
    return;
  }
  window.SAL_USER = user;
  window.SAL_TOKEN = token;

  window.salApi = async function (path, opts) {
    const headers = { 'Content-Type': 'application/json', ...((opts && opts.headers) ? opts.headers : {}) };
    const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
    if (at) headers.Authorization = 'Bearer ' + at;
    const res = await fetch(path, { ...(opts || {}), headers });
    if (res.status === 401) { localStorage.clear(); window.location.replace('/login'); return { success: false }; }
    return res.json().catch(function () { return { success: false, message: 'Invalid server response' }; });
  };

  window.salLogout = async function () {
    try { await window.salApi('/api/auth/logout', { method: 'POST' }); } catch (_) { }
    localStorage.clear();
    window.location.replace('/login');
  };

  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[onclick*="logout" i], [onclick*="sign" i]').forEach(function (el) {
      if ((el.textContent || '').toLowerCase().includes('sign') || (el.textContent || '').toLowerCase().includes('logout'))
        el.onclick = window.salLogout;
    });
    ['sidebarName', 'sb-name', 'navName', 'userName', 'profileName'].forEach(function (id) {
      const el = document.getElementById(id); if (el && user.name) el.textContent = user.name;
    });
    ['sidebarDept', 'sb-email', 'navEmail', 'userEmail'].forEach(function (id) {
      const el = document.getElementById(id); if (el && user.email) el.textContent = user.email;
    });
    ['sidebarAvatar', 'navInitial', 'sb-av'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el && user.name) el.textContent = user.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    });
  });
})();

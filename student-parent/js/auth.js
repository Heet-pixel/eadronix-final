// ============================================================
//  student/js/auth.js
//  Runs BEFORE DOMContentLoaded — blocks page if not a student
// ============================================================

(function () {
  const ALLOWED_ROLES = ['student', 'parent'];

  /* ── read helpers ── */
  function getToken() {
    return localStorage.getItem('sal_at') || localStorage.getItem('sal_token') || null;
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('sal_user') || 'null'); } catch (_) { return null; }
  }

  const token = getToken();
  const user  = getUser();

  /* ── guard ── */
  if (!token || !user || !ALLOWED_ROLES.includes(user.role)) {
    window.location.replace('/login');
    return;
  }

  /* ── expose globally so other files can read them ── */
  window.SAL_TOKEN = token;
  window.SAL_USER  = user;

  /* ── singleton in-flight refresh — see teacher/js/api.js for the full
     explanation of why concurrent 401s racing independent refresh calls
     caused random logouts ── */
  let _refreshPromise = null;
  function _doRefresh(rt) {
    if (!_refreshPromise) {
      _refreshPromise = fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).then(async (rr) => {
        if (!rr.ok) throw new Error('refresh failed');
        const rd = await rr.json();
        localStorage.setItem('sal_at', rd.accessToken);
        if (rd.refreshToken) localStorage.setItem('sal_rt', rd.refreshToken);
        return rd;
      }).finally(() => { _refreshPromise = null; });
    }
    return _refreshPromise;
  }

  /* ── central API helper (used by api.js and anywhere needed) ── */
  window.salApi = async function (path, opts = {}) {
    const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (at) headers['Authorization'] = 'Bearer ' + at;

    let res = await fetch(path, { ...opts, headers });

    /* auto-refresh on 401 */
    if (res.status === 401) {
      const rt = localStorage.getItem('sal_rt');
      if (rt) {
        try {
          const rd = await _doRefresh(rt);
          headers['Authorization'] = 'Bearer ' + rd.accessToken;
          res = await fetch(path, { ...opts, headers });
        } catch (_) {
          _logout();
          return { success: false };
        }
      } else {
        _logout();
        return { success: false };
      }
    }

    return res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
  };

  window.salLogout = function () { _logout(); };

  function _logout() {
    salApi('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.clear();
    window.location.replace('/login');
  }

  /* ── fill identity fields once DOM is ready ── */
  window.addEventListener('DOMContentLoaded', function () {
    const name     = user.name  || '';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

    _set('student-name',    name);
    _set('student-initials', initials);
    _set('student-email',   user.email || '');

    // bind logout buttons
    document.querySelectorAll('[data-action="logout"]').forEach(el => {
      el.addEventListener('click', window.salLogout);
    });
  });

  function _set(id, val) {
    document.querySelectorAll('#' + id + ', .' + id).forEach(el => { el.textContent = val; });
  }
})();

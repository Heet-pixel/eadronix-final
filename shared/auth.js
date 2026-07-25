// ============================================================
// shared/auth.js — Persistent Session + Auto Token Refresh
// Include this FIRST in every role frontend's index.html
// Compatible with Web (localStorage) and Mobile (AsyncStorage pattern)
// ============================================================

const SAL_AUTH = (() => {
  // Storage helpers — uses localStorage for persistence
  const store = {
    get: k    => localStorage.getItem(k),
    set: (k,v)=> localStorage.setItem(k, v),
    del: k    => localStorage.removeItem(k),
    clear: () => { ['sal_at','sal_rt','sal_token','sal_refresh','sal_user','sal_remember'].forEach(k=>localStorage.removeItem(k)); },
  };

  let _refreshing = null; // singleton promise to avoid parallel refresh calls

  async function refreshToken() {
    if (_refreshing) return _refreshing;
    _refreshing = (async () => {
      const rt = store.get('sal_rt') || store.get('sal_refresh');
      if (!rt) return false;
      try {
        const res  = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        const data = await res.json();
        if (data.success) {
          store.set('sal_at',      data.accessToken);
          store.set('sal_rt',      data.refreshToken);
          store.set('sal_token',   data.accessToken);
          store.set('sal_refresh', data.refreshToken);
          return true;
        }
        return false;
      } catch { return false; }
      finally  { _refreshing = null; }
    })();
    return _refreshing;
  }

  async function apiRequest(method, url, body) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${store.get('sal_at') || store.get('sal_token') || ''}`,
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res = await fetch(url, opts);

    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${store.get('sal_at') || store.get('sal_token')}`;
        res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      } else {
        store.clear();
        window.location.href = '/login';
        return { ok: false, data: { message: 'Session expired. Please log in again.' } };
      }
    }

    try {
      const data = await res.json();
      return { ok: !!data.success, data, status: res.status };
    } catch {
      return { ok: false, data: { message: 'Invalid server response.' }, status: res.status };
    }
  }

  function getUser()  { try { return JSON.parse(store.get('sal_user') || 'null'); } catch { return null; } }
  function getToken() { return store.get('sal_at') || store.get('sal_token'); }

  function saveSession(accessToken, refreshToken, user) {
    store.set('sal_at',      accessToken);
    store.set('sal_rt',      refreshToken);
    store.set('sal_token',   accessToken);
    store.set('sal_refresh', refreshToken);
    store.set('sal_user',    JSON.stringify(user));
  }

  function logout() {
    apiRequest('POST', '/api/auth/logout').catch(() => {});
    store.clear();
    window.location.href = '/login';
  }

  // Guard: call at top of each role page
  // requiredRole: string or array of allowed roles
  async function guard(requiredRoles) {
    const token = store.get('sal_at') || store.get('sal_token');
    const user  = getUser();
    if (!token || !user) {
      window.location.href = '/login';
      return false;
    }
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    if (!roles.includes(user.role)) {
      window.location.href = '/login';
      return false;
    }
    // Silently refresh token in background to keep session alive
    refreshToken().catch(() => {});
    return true;
  }

  // Set up auto token refresh every 12 minutes (access token = 15 min)
  function startAutoRefresh() {
    setInterval(() => {
      if (store.get('sal_rt') || store.get('sal_refresh')) refreshToken().catch(() => {});
    }, 12 * 60 * 1000);
  }

  return { apiRequest, getUser, getToken, saveSession, logout, guard, startAutoRefresh, store };
})();

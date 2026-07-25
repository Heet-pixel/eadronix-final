// hod/js/api.js — API Client: salFetch, REST helpers & HAPI endpoint map

// Singleton in-flight refresh — see teacher/js/api.js for the full explanation
// of why concurrent 401s racing independent refresh calls caused random logouts.
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
      localStorage.setItem('sal_token', rd.accessToken);
      if (rd.refreshToken) {
        localStorage.setItem('sal_rt', rd.refreshToken);
        localStorage.setItem('sal_refresh', rd.refreshToken);
      }
      return rd;
    }).finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

async function salFetch(m, p, b = null, retry = false) {
  const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const h = { 'Content-Type': 'application/json' };
  if (at) h['Authorization'] = 'Bearer ' + at;
  const o = { method: m, headers: h };
  if (b) o.body = JSON.stringify(b);
  let r = await fetch('/api' + p, o);
  if (r.status === 401 && !retry) {
    const rt = localStorage.getItem('sal_rt') || localStorage.getItem('sal_refresh');
    if (rt) {
      try {
        await _doRefresh(rt);
        return salFetch(m, p, b, true);
      } catch (_) {
        // fall through to logout below
      }
    }
    localStorage.clear();
    window.location.href = '/login';
    return { success: false };
  }
  return r.json();
}

const get = (p) => salFetch('GET', p);
const post = (p, b) => salFetch('POST', p, b);
const put = (p, b) => salFetch('PUT', p, b);
const del = (p) => salFetch('DELETE', p);

// Downloads a binary file (PDF, etc.) from an authenticated API endpoint.
// Plain <a href> links can't carry the Bearer token, so we fetch as a blob
// and trigger the save manually.
async function downloadFile(path, filename) {
  const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const headers = {};
  if (at) headers['Authorization'] = 'Bearer ' + at;
  const res = await fetch('/api' + path, { headers });
  if (!res.ok) {
    let msg = 'Download failed.';
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const HAPI = {
  me:             ()       => get('/auth/me'),
  logout:         ()       => post('/auth/logout'),
  overview:       ()       => get('/hod/overview'),
  getStudents:    (q = '') => get('/hod/students' + (q ? '?' + q : '')),
  addStudent:     (b)      => post('/hod/students', b),
  editStudent:    (id, b)  => put('/hod/students/' + id, b),
  deleteStudent:  (id)     => del('/hod/students/' + id),
  promoteStudents:(b)      => post('/hod/students/promote', b),
  getTeachers:    (q = '') => get('/hod/teachers' + (q ? '?' + q : '')),
  addTeacher:     (b)      => post('/hod/teachers', b),
  editTeacher:    (id, b)  => put('/hod/teachers/' + id, b),
  deleteTeacher:  (id)     => del('/hod/teachers/' + id),
  getSubjects:    ()       => get('/hod/subjects'),
  getAttReport:   (q = '') => get('/hod/attendance-report' + (q ? '?' + q : '')),
  getMarksReport: (q = '') => get('/hod/marks-report' + (q ? '?' + q : '')),
  getAnnouncements: ()     => get('/hod/announcements'),
  postAnnouncement: (b)    => post('/hod/announcements', b),
  getMarks:       (q = '') => get('/hod/marks' + (q ? '?' + q : '')),
  saveMarks:      (b)      => post('/hod/marks', b),
  saveMarksBulk:  (b)      => post('/hod/marks/bulk-upsert', b),
  getSchedule:    (q = '') => get('/hod/schedule' + (q ? '?' + q : '')),
  saveSchedule:   (b)      => post('/hod/schedule', b),
};


// ── Alias for backward compatibility ──
// Some HOD modules use `API` instead of `HAPI`
const API = {
  ...HAPI,
  getNotices:       ()       => get('/hod/announcements'),
  postNotice:       (b)      => post('/hod/announcements', b),
  deleteNotice:     (id)     => del('/hod/announcements/' + id),
  getMarks:         (q = '') => get('/hod/marks' + (q ? '?' + q : '')),
  saveMarks:        (b)      => post('/hod/marks', b),
  deleteMarks:      (id)     => del('/hod/marks/' + id),
};

// teacher/js/api.js — API Client: salFetch, REST helpers & TAPI endpoint map

// Singleton in-flight refresh — if several requests 401 at nearly the same
// time (common when a page fires multiple API calls on load), they must all
// wait on the SAME refresh call instead of each calling /auth/refresh
// independently. Refresh tokens rotate on use, so a second concurrent call
// using the now-stale token would fail and wipe localStorage, logging the
// person out even though their session was actually still valid — this was
// the cause of "I get logged out when I click something quickly."
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

async function salFetch(m, p, b = null, retry = false) {
  const at = localStorage.getItem('sal_at');
  const h  = { 'Content-Type': 'application/json' };
  if (at) h['Authorization'] = 'Bearer ' + at;
  const o = { method: m, headers: h };
  if (b) o.body = JSON.stringify(b);
  let r = await fetch('/api' + p, o);
  if (r.status === 401 && !retry) {
    const rt = localStorage.getItem('sal_rt');
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

const get  = (p)    => salFetch('GET',  p);
const post = (p, b) => salFetch('POST', p, b);
const put  = (p, b) => salFetch('PUT',  p, b);
const del  = (p)    => salFetch('DELETE', p);

// Downloads a binary file (PDF, etc.) from an authenticated API endpoint.
// Plain <a href> links can't carry the Bearer token, so we fetch as a blob
// and trigger the save manually.
async function downloadFile(path, filename) {
  const at = localStorage.getItem('sal_at');
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

// ─── Teacher API Endpoints ───
const TAPI = {
  me:              ()     => get('/auth/me'),
  logout:          ()     => post('/auth/logout'),

  // Returns teacher's assigned subjects & student lists
  getSubjects:     ()     => get('/teacher/subjects'),
  getClasses:      ()     => get('/teacher/classes'),
  getMyClasses:    ()     => get('/teacher/my-classes'),
  sendNotice:      (b)    => post('/teacher/notices', b),

  // GET /teacher/students?course=BCA&semester=2   → { success, students[], subjects[], mySubjects[], attendanceSummary{} }
  // GET /teacher/students/:id/attendance?course=BCA&semester=2 → { success, student{}, subjects[{name,present,absent,total}] }
  // GET /teacher/students/:id/attendance/subject?subject=Java → { success, attendance:{lectures[{date,status}], present, absent, total} }
  getStudents:     (q='') => get('/teacher/students'      + (q ? '?' + q : '')),

  saveAttendance:  (b)    => post('/teacher/attendance', b),
  getAttendance:   (q='') => get('/teacher/attendance'   + (q ? '?' + q : '')),

  // Attendance report — scoped to classes THIS teacher has marked.
  getAttReport:    (q='') => get('/teacher/attendance-report' + (q ? '?' + q : '')),

  // Attendance History (spec item 4): list every lecture, view/edit one.
  getAttHistory:   (q='') => get('/teacher/attendance/history' + (q ? '?' + q : '')),
  getAttSession:   (key)  => get('/teacher/attendance/session/' + encodeURIComponent(key)),
  editAttSession:  (key, records) => put('/teacher/attendance/session/' + encodeURIComponent(key), { records }),

  saveSyllabus:    (b)    => post('/teacher/syllabus', b),
  getSyllabus:     (q='') => get('/teacher/syllabus'     + (q ? '?' + q : '')),

  getAnnouncements: ()    => get('/teacher/announcements'),

  // Teacher's own weekly timetable, built by HOD — grouped by day.
  getSchedule:      ()    => get('/teacher/schedule'),

  // My Profile (spec item 7)
  getProfile:       ()    => get('/teacher/profile'),
  updateProfile:    (b)   => put('/teacher/profile', b),
  uploadPhoto:      (uri) => post('/teacher/profile/photo', { image: uri }),

  // ── Marks (Add Marks page) ──
  // getMyClasses() (above) already gives {course, semesters[]} for classes
  // this teacher directly teaches; CC semesters come from currentTeacher.ccAssignments.
  getMarksAccess:  (course, semester) => get(`/teacher/marks/access?course=${encodeURIComponent(course)}&semester=${semester}`),
  getMarksGrid:    (course, semester, examType) => get(`/teacher/marks/grid?course=${encodeURIComponent(course)}&semester=${semester}&examType=${encodeURIComponent(examType)}`),
  saveMarksGrid:   (records) => post('/teacher/marks/grid-upsert', { records }),
  publishMarks:    (course, semester, examType, publish, subjectIds) =>
    salFetch('PATCH', '/teacher/marks/publish', { course, semester, examType, publish, subjectIds }),
};

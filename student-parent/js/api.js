// ============================================================
//  student/js/api.js
//  All API calls in one place — change base URL here only
// ============================================================

// Downloads a binary file (PDF, etc.) from an authenticated API endpoint.
// salApi() always parses JSON, so binary downloads need their own fetch —
// plain <a href> links can't carry the Bearer token either.
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

const API = (() => {
  const BASE = '/api';

  /* ── low-level fetch (GET / POST / PUT / DELETE) ── */
  async function req(method, path, body = null) {
    // Parent accounts can have more than one child — once one is selected
    // (see ChildSwitcher in app.js), every /student/* call carries it so the
    // backend knows which child's data to return.
    if (path.startsWith('/student/') && window.selectedChildId) {
      path += (path.includes('?') ? '&' : '?') + 'studentId=' + encodeURIComponent(window.selectedChildId);
    }
    return salApi(BASE + path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  const GET    = path       => req('GET',    path);
  const POST   = (path, b)  => req('POST',   path, b);
  const PUT    = (path, b)  => req('PUT',    path, b);
  const DELETE = path       => req('DELETE', path);

  /* ──────────────────────────────────────────────
     AUTH
  ────────────────────────────────────────────── */
  const auth = {
    me:      ()  => GET('/auth/me'),
    logout:  ()  => POST('/auth/logout'),
    refresh: (rt)=> POST('/auth/refresh', { refreshToken: rt }),
  };

  /* ──────────────────────────────────────────────
     STUDENT — all endpoints your backend exposes
  ────────────────────────────────────────────── */
  const student = {
    // Dashboard summary (total subjects, avg attendance, upcoming etc.)
    dashboard:     ()         => GET('/student/dashboard'),

    // Full profile (name, roll, dept, college, dob, address …)
    profile:       ()         => GET('/student/profile'),

    // Upload/replace the student's own profile photo (data URI). Student-only —
    // a linked Parent account can view but not change this.
    uploadPhoto:   (dataUri)  => POST('/student/profile/photo', { image: dataUri }),

    // Attendance — summary list + per-subject session log
    attendance:    ()         => GET('/student/attendance'),
    // Attendance PDF certificate — binary, use downloadFile('/student/attendance/pdf', filename) directly, not GET()

    // Subjects the student is enrolled in
    subjects:      ()         => GET('/student/subjects'),

    // Syllabus entries posted by teachers (covered topics)
    syllabus:      (subjectId)=> GET('/student/syllabus' + (subjectId ? '?subjectId=' + subjectId : '')),

    // Notices / announcements from HOD or admin
    notices:       ()         => GET('/student/notices'),

    // Internal marks / exam results
    marks:         ()         => GET('/student/marks'),

    // Timetable / schedule
    timetable:     ()         => GET('/student/timetable'),

    // Parent accounts only — lists every child linked to this parent login
    // (siblings sharing one parent email all show up here).
    myChildren:    ()         => GET('/student/my-children'),
  };

  return { auth, student };
})();

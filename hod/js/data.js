// hod/js/data.js — Global State & Data Layer (fully dynamic, no mock data)

/* ═══ SESSION STATE ═══ */
let currentHOD = null, SUBJECTS = {}, HOD_COURSES = [], SEM_COUNT = 6;
let currentUsername = '';
let allStudents = [], allTeachers = [];
let stuReports = [], tchrReports = [];
let activeStuCourse = null, activeStuSem = null, activeStuAllSems = false;
let stuDeleteMode = false, tchrDeleteMode = false, activeTchrCourse = null;
let stuPromoteMode = false;
let openSchedSem = {};
let announcements = [];
let rptCourse = null, rptType = null, rptView = null, rptSem = null;
let rptDateFrom = "", rptDateTo = "", rptDuration = "";
let annCourse = null, annSem = null, annTarget = "students";
let currentStuId = null, currentTchrId = null;
let stuEditMode = false, tchrEditMode = false;
let tchrViewMode = 'list', tchrFilterCourse = '', tchrFilterSem = '';

/* ═══ SUBJECT HELPER ═══ */
function getSubjNames(course, sem) {
  if (!SUBJECTS[course] || !SUBJECTS[course][sem]) return [];
  return SUBJECTS[course][sem].map(s => typeof s === 'object' ? s.name : s);
}

// Like getSubjNames, but returns { id, name } pairs so callers (e.g. marks
// persistence) can resolve a subject's Mongo ObjectId, not just its display name.
function getSubjObjects(course, sem) {
  if (!SUBJECTS[course] || !SUBJECTS[course][sem]) return [];
  return SUBJECTS[course][sem].map(s => typeof s === 'object' ? { id: s.id || s._id, name: s.name } : { id: null, name: s });
}

/* ═══ REPORT BUILDERS (fetches real data from the attendance/marks APIs) ═══ */
// Cache of the last attendance-report summary per "course|sem" key, so we don't
// re-fetch every time the report screen re-renders during wizard navigation.
let _attReportCache = {};

async function buildStuReports(course, sem, forceFresh = false) {
  // If no course/sem given yet (wizard not far enough along), fall back to a
  // lightweight placeholder list so student counts still show in step 1/2 option cards.
  if (!course) {
    stuReports = allStudents.map(s => ({ ...s, subjects: [], overallTotal: 0, overallAtt: 0, percentage: null, status: 'N/A' }));
    return stuReports;
  }
  const cacheKey = course + '|' + (sem ?? 'all');
  let summary;
  if (!forceFresh && _attReportCache[cacheKey]) {
    summary = _attReportCache[cacheKey];
  } else {
    const qs = new URLSearchParams({ course });
    if (sem) qs.set('semester', sem);
    const data = await apiJson('/api/hod/attendance-report?' + qs.toString());
    summary = data.summary || [];
    _attReportCache[cacheKey] = summary;
  }
  // Map server summary (keyed by student) onto the full student list for this course/sem,
  // so students with zero attendance records still appear (with 0%, not missing).
  const byStudentId = {};
  for (const row of summary) {
    const sid = String(row.student?._id || row.student);
    byStudentId[sid] = row;
  }
  const cohort = allStudents.filter(s => s.course === course && (!sem || s.sem === Number(sem)));
  stuReports = cohort.map(s => {
    const row = byStudentId[String(s.id || s._id)];
    if (!row) return { ...s, subjects: [], overallTotal: 0, overallAtt: 0, percentage: 0, status: 'Shortage' };
    const subjects = row.subjects.map(sub => ({ subject: sub.name, attended: sub.present, total: sub.total, pct: sub.percentage }));
    return {
      ...s,
      subjects,
      overallTotal: row.total,
      overallAtt: row.present,
      percentage: row.percentage,
      status: row.percentage >= 75 ? 'Regular' : 'Shortage'
    };
  });
  return stuReports;
}

function invalidateAttReportCache() { _attReportCache = {}; }

async function buildTchrReports() {
  tchrReports = allTeachers.map(t => ({
    ...t,
    totalLectures: t.totalLectures || null,
    taken: t.lecturesTaken || null,
    syllabusCompleted: t.syllabusCompleted || null,
    avgLectureTime: t.avgLectureTime || null,
    teacherAttendance: t.teacherAttendance || null
  }));
  return tchrReports;
}

/* ═══ API HELPERS ═══ */
async function apiJson(url, opts) {
  const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const headers = { 'Content-Type': 'application/json', ...((opts || {}).headers || {}) };
  if (at) headers['Authorization'] = 'Bearer ' + at;
  const res = await fetch(url, { ...(opts || {}), headers });
  if (res.status === 401) {
    localStorage.clear();
    window.location.replace('/login');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

async function refreshStudents() {
  const data = await apiJson('/api/hod/students');
  allStudents = (data.students || []).map(s => {
    const id = s._id || s.id;
    const sem = Number(s.sem || s.semester || 1);
    const course = s.course || s.courseName || '';
    const address = typeof s.address === 'object' && s.address ? s.address : {};
    return {
      ...s,
      id,
      _id: s._id || id,
      roll: s.roll || s.rollNo || s.rollNumber || '',
      rollNo: s.rollNo || s.roll || s.rollNumber || '',
      rollNumber: s.rollNumber || s.roll || s.rollNo || '',
      sem,
      semester: sem,
      course,
      courseName: s.courseName || course,
      phone: s.phone || s.mobile || '',
      mobile: s.mobile || s.phone || '',
      city: s.city || address.city || '',
      state: s.state || address.state || '',
      pincode: s.pincode || address.pincode || '',
      address: typeof s.address === 'string' ? s.address : (address.street || '')
    };
  });
  invalidateAttReportCache();
  await buildStuReports();
}

async function refreshTeachers() {
  const data = await apiJson('/api/hod/teachers');
  allTeachers = (data.teachers || []).map(t => ({
    ...t,
    id: t._id || t.id,
    _id: t._id || t.id,
    course: t.course || '',
    subject: t.subject || '',
    phone: t.phone || t.mobile || '',
    mobile: t.mobile || t.phone || '',
    designation: t.designation || (['hod','co_hod'].includes(t.role) ? 'HOD' : 'Teacher')
  }));
  await buildTchrReports();
}

async function refreshSubjects() {
  try {
    const data = await apiJson('/api/hod/subjects');
    // Backend returns subjects as a grouped map: { CourseName: { sem: [subjects] } }
    if (data.subjects && typeof data.subjects === 'object' && !Array.isArray(data.subjects)) {
      SUBJECTS = data.subjects;
    }
    // Also store flat list for easy lookup
    if (data.subjectsList) window._subjectsList = data.subjectsList;
  } catch (e) {
    // subjects may come embedded in HOD profile — handled in bootstrap
    console.warn('refreshSubjects failed:', e.message);
  }
}

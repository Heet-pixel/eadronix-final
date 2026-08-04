// teacher/js/app.js — App Bootstrap: populate identity from API, init all modules
// currentTeacher holds the logged-in teacher's data — single source of truth, no switching.

let currentTeacher = {
  name: "",
  dept: "",
  initials: "",
  avatar: "",
  assignedSubjects: [], // array of subject names (strings) or objects with {name, course, semester}
  timetable: {},
  isClassTeacher: false,
  classTeacherOf: null,
  // Real Class Coordinator data (see hod/js/cc.js for how HOD assigns this).
  // NOTE: isClassTeacher/classTeacherOf above are legacy fields the backend
  // never actually populates — they'll always read false/null. ccAssignments
  // is the real, working mechanism; used by teacher/js/marks.js.
  ccAssignments: [],
};

// ─── State shared across modules ───
let selectedSub = "";
let gridSeats = [];
let currentAttCourse = "";
let currentAttSem = 0;
let syllabusList = [];
let attLogs = [];
let stuFilterCourse = "";
let stuFilterSem = "";
let teacherClasses = [];
let myTeacherClasses = []; // only classes this teacher actually teaches — used for "Send Notice"
// Cache of the roster for the currently selected course+semester, used to
// populate the Practical roll-range <select> dropdowns (attendance.js) so a
// teacher picks an existing student's roll number instead of typing one.
let attClassStudentsCache = { key: "", students: [] };

async function init() {
  // Apply saved theme first
  Theme.init();

  // Set today's date on date inputs, and cap them so a future date can
  // never be picked — attendance can only be marked for a lecture that has
  // already happened.
  const today = new Date().toISOString().split("T")[0];
  ["attDate", "sylDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = today;
      el.max = today;
    }
  });

  // Load teacher profile from API → populate all identity elements
  try {
    const d = await TAPI.me();
    if (d.success && d.user) {
      const u = d.user;
      currentTeacher.name = u.name || "Teacher";
      currentTeacher.dept = u.department?.name || u.college?.name || "";
      currentTeacher.initials = UI.initials(u.name);
      currentTeacher.avatar = u.avatar || "";
      // subjects may be objects {name, course, semester} or plain strings
      currentTeacher.assignedSubjects =
        Array.isArray(u.subjects) && u.subjects.length
          ? u.subjects
          : u.subject
            ? [u.subject]
            : [];
      currentTeacher.timetable = u.timetable || {};
      currentTeacher.isClassTeacher = u.isClassTeacher || false;
      currentTeacher.classTeacherOf = u.classTeacherOf || null;
      currentTeacher.ccAssignments = Array.isArray(u.ccAssignments)
        ? u.ccAssignments
        : [];
      currentTeacher.course = u.course || "";
    }
  } catch (_) {
    // Fallback — use whatever SAL_USER has (set by auth.js)
    const u = window.SAL_USER || {};
    currentTeacher.name = u.name || "Teacher";
    currentTeacher.dept = u.email || "";
    currentTeacher.initials = UI.initials(u.name);
  }

  // /auth/me returns a leaner payload than /teacher/profile and doesn't
  // carry `avatar` — if it came back empty, fetch the fuller profile just
  // for the photo so the sidebar/header don't sit on initials until the
  // person happens to open the Profile page.
  if (!currentTeacher.avatar) {
    try {
      const pd = await TAPI.getProfile();
      if (pd.success && pd.profile?.avatar) {
        currentTeacher.avatar = pd.profile.avatar;
      }
    } catch (_) {
      // non-critical — initials stay as the fallback
    }
  }

  // The identity endpoint above (/auth/me) doesn't carry a timetable — the
  // real HOD-built weekly schedule comes from /teacher/schedule, grouped by
  // day, which matches exactly what schedule.js expects to render.
  try {
    const sd = await TAPI.getSchedule();
    if (sd.success && sd.timetable) currentTeacher.timetable = sd.timetable;
  } catch (_) {
    // Leave currentTeacher.timetable as-is (empty) — schedule.js already
    // renders a friendly "No timetable available" empty state for this.
  }

  try {
    const sd = await TAPI.getSubjects();
    const subjects = sd.subjects || sd.data || [];
    if (Array.isArray(subjects) && subjects.length)
      currentTeacher.assignedSubjects = subjects;
  } catch (_) {
    /* keep subjects from profile if the subjects endpoint is unavailable */
  }

  try {
    const cd = await TAPI.getClasses();
    teacherClasses = Array.isArray(cd.classes) ? cd.classes : [];
  } catch (_) {
    teacherClasses = classesFromSubjects(currentTeacher.assignedSubjects);
  }
  try {
    const myCd = await TAPI.getMyClasses();
    myTeacherClasses = Array.isArray(myCd.classes) ? myCd.classes : [];
  } catch (_) {
    myTeacherClasses = [];
  }
  populateClassSelectors();

  // Render identity into the UI
  _applyIdentity();

  // Pre-load existing syllabus entries from backend
  try {
    const sd = await TAPI.getSyllabus();

    if (sd.success) {
      syllabusList = sd.entries || sd.data || [];
      renderSylList(); // <-- ADD THIS LINE
    }
  } catch (_) {}
  // Pre-load attendance log count from backend
  try {
    const ad = await TAPI.getAttendance();
    if (ad.success) attLogs = ad.logs || ad.data || [];
  } catch (_) {
    /* non-critical */
  }

  // Responsive syllabus layout
  fixSylLayout();
  window.addEventListener("resize", fixSylLayout);

  // Start on dashboard
  goToPage("home");
}

function _applyIdentity() {
  const { name, dept, initials, avatar } = currentTeacher;

  // Update text
  const textIds = {
    sidebarName: name,
    headerName: name,
    sidebarDept: dept,
  };

  Object.entries(textIds).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });

  // Update all avatars
  ["sidebarAv", "headerAv", "sb-av", "profAv"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = avatar
      ? `<img src="${avatar}" alt="${name}"
                 style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : initials;
  });
}

document.addEventListener("DOMContentLoaded", init);

function classesFromSubjects(subjects) {
  const map = new Map();
  (subjects || []).forEach((sub) => {
    if (typeof sub === "string") return;
    const course = sub.course || sub.courseName;
    if (!course) return;
    const semester = Number(sub.semester ?? sub.sem ?? 1);
    if (!map.has(course)) map.set(course, new Set());
    map.get(course).add(semester);
  });
  return [...map.entries()].map(([course, sems]) => ({
    course,
    semesters: [...sems].filter(Boolean).sort((a, b) => a - b),
  }));
}

function populateClassSelectors() {
  const courses = [
    ...new Set((teacherClasses || []).map((c) => c.course).filter(Boolean)),
  ];
  const courseOptions =
    '<option value="">-- Course --</option>' +
    courses
      .map((c) => `<option value="${htmlEscape(c)}">${htmlEscape(c)}</option>`)
      .join("");
  ["attCourse", "stuCourse", "sylCourse"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.innerHTML = courseOptions.replace(
        "-- Course --",
        id === "stuCourse" ? "-- Select Course --" : "-- Course --",
      );
  });
  updateSemOptions("attCourse", "attSem", false);
  updateSemOptions("stuCourse", "stuSem", false);
  updateSemOptions("sylCourse", "sylSem", false);

  // Notice composer only offers classes this teacher actually teaches
  const myCourses = [
    ...new Set((myTeacherClasses || []).map((c) => c.course).filter(Boolean)),
  ];
  const tnCourseEl = document.getElementById("tnCourse");
  if (tnCourseEl) {
    tnCourseEl.innerHTML =
      '<option value="">-- Course --</option>' +
      myCourses
        .map(
          (c) => `<option value="${htmlEscape(c)}">${htmlEscape(c)}</option>`,
        )
        .join("");
  }
  updateSemOptionsFrom(myTeacherClasses, "tnCourse", "tnSem");
}

function updateSemOptions(courseId, semId, allowAll) {
  _updateSemOptionsFromList(teacherClasses, courseId, semId, allowAll);
}

function updateSemOptionsFrom(list, courseId, semId, allowAll) {
  _updateSemOptionsFromList(list, courseId, semId, allowAll);
}

function _updateSemOptionsFromList(list, courseId, semId, allowAll) {
  const course = document.getElementById(courseId)?.value || "";
  const semEl = document.getElementById(semId);
  if (!semEl) return;
  if (semEl.dataset.course === course) return;
  const previous = semEl.value;
  const cls = (list || []).find((c) => c.course === course);
  const sems = cls?.semesters?.length ? cls.semesters : [1, 2, 3, 4, 5, 6];
  const first = allowAll
    ? '<option value="">-- All Semesters --</option>'
    : '<option value="">-- Select Semester --</option>';
  semEl.innerHTML =
    first + sems.map((s) => `<option value="${s}">${s}</option>`).join("");
  semEl.dataset.course = course;
  if ([...semEl.options].some((o) => o.value === previous))
    semEl.value = previous;
}

function htmlEscape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

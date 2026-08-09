// hod/js/dashboard.js — Dashboard Stats, All-Students & All-Teachers Overlays

/* ═══ DASHBOARD ═══ */
function loadDashboard() {
  if (!currentHOD) return;
  const total = allStudents.length;
  const totalT = allTeachers.length;
  const totalSubjects = HOD_COURSES.reduce(
    (a, c) => a + (SUBJECTS[c] ? Object.values(SUBJECTS[c]).flat().length : 0),
    0,
  );

  let html = `<div class="stat-grid">
    <div class="stat-card clickable" onclick="openAllStudents()" title="Click to view all students">
      <div class="stat-icon">🎓</div><div class="stat-label">Total Students</div>
      <div class="stat-val">${total}</div><div class="stat-sub">Across all courses ↗</div>
    </div>
    <div class="stat-card clickable" onclick="openAllTeachers()" title="Click to view all teachers">
      <div class="stat-icon">🧑‍🏫</div><div class="stat-label">Total Teachers</div>
      <div class="stat-val">${totalT}</div><div class="stat-sub">Active faculty ↗</div>
    </div>
    <div class="stat-card clickable" onclick="showSection('schedule')" title="View schedule">
      <div class="stat-icon">📚</div><div class="stat-label">Courses</div>
      <div class="stat-val">${HOD_COURSES.length}</div>
      <div class="stat-sub">${HOD_COURSES.join(" · ") || "—"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📄</div><div class="stat-label">Semesters</div>
      <div class="stat-val">${SEM_COUNT}</div><div class="stat-sub">Per course</div>
    </div>
  </div>`;

  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;">`;
  HOD_COURSES.forEach((c) => {
    const s = allStudents.filter((x) => x.course === c).length;
    const t = allTeachers.filter((x) => x.course === c).length;
    const subCount = SUBJECTS[c] ? Object.values(SUBJECTS[c]).flat().length : 0;
    html += `<div class="card">
      <div class="card-title"><span class="ct-icon">🏛️</span>${c}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;"
          onclick="openAllStudents('${c}')" title="View ${c} students">
          <span style="font-size:13px;color:var(--text2);font-weight:600;">Students</span>
          <span style="font-size:19px;font-weight:800;color:var(--text);">${s} <small style="font-size:11px;color:var(--accent);">↗</small></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;"
          onclick="openAllTeachers('${c}')" title="View ${c} teachers">
          <span style="font-size:13px;color:var(--text2);font-weight:600;">Teachers</span>
          <span style="font-size:19px;font-weight:800;color:var(--text);">${t} <small style="font-size:11px;color:var(--accent);">↗</small></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:13px;color:var(--text2);font-weight:600;">Semesters</span>
          <span style="font-size:19px;font-weight:800;color:var(--text);">${SEM_COUNT}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
          <span style="font-size:13px;color:var(--text2);font-weight:600;">Subjects</span>
          <span style="font-size:19px;font-weight:800;color:var(--text);">${subCount}</span>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  document.getElementById("dashCards").innerHTML = html;
}

/* ═══ ALL STUDENTS OVERLAY ═══ */
function openAllStudents(filterCourse) {
  let data = filterCourse
    ? allStudents.filter((s) => s.course === filterCourse)
    : allStudents;
  document.getElementById("allStuTitle").textContent = filterCourse
    ? `${filterCourse} — All Students (${data.length})`
    : `All Students Across All Branches (${data.length})`;

  let html = "";
  if (!filterCourse) {
    HOD_COURSES.forEach((c) => {
      const cs = allStudents.filter((s) => s.course === c);
      html += `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(79,156,249,.08);border-radius:8px;border:1px solid rgba(79,156,249,.2);font-size:13px;font-weight:700;color:var(--accent);">🏛️ ${c} — ${cs.length} Students</div>`;
      cs.forEach((s) => {
        html += miniStuRow(s);
      });
    });
  } else {
    for (let sem = 1; sem <= SEM_COUNT; sem++) {
      const ss = data.filter((s) => s.sem === sem || s.sem === String(sem));
      if (!ss.length) continue;
      html += `<div style="margin-bottom:8px;padding:7px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text2);">Semester ${sem} — ${ss.length} students</div>`;
      ss.forEach((s) => {
        html += miniStuRow(s);
      });
    }
  }
  document.getElementById("allStuBody").innerHTML =
    html ||
    '<div class="empty-state"><div class="e-icon">📄</div><p>No students found.</p></div>';
  document.getElementById("allStuOverlay").classList.add("open");
}

function miniStuRow(s) {
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&size=80&background=random`;
  const avatar = s.avatar || fallbackAvatar;
  return `<div class="student-row" style="margin-bottom:6px;" onclick="openStudentModal('${s.id}')">
    <img class="student-avatar" src="${avatar}" alt="" style="cursor:pointer;" onerror="this.onerror=null;this.src='${fallbackAvatar}';">
    <div class="student-info">
      <div class="sname">${s.name}</div>
      <span><b>Roll:</b> ${s.roll || s.rollNo || "—"}</span>
      <span><b>Course:</b> ${s.course} Sem${s.sem}</span>
      <span><b>Phone:</b> ${s.phone || "—"}</span>
      <span><b>Status:</b> <span class="badge badge-green">${s.status || "Active"}</span></span>
    </div>
  </div>`;
}
function closeAllStu() {
  document.getElementById("allStuOverlay").classList.remove("open");
}

/* ═══ ALL TEACHERS OVERLAY ═══ */
function openAllTeachers(filterCourse) {
  let data = filterCourse
    ? allTeachers.filter((t) => t.course === filterCourse)
    : allTeachers;
  document.getElementById("allTchrTitle").textContent = filterCourse
    ? `${filterCourse} — All Teachers (${data.length})`
    : `All Teachers Across All Branches (${data.length})`;

  let html = "";
  if (!filterCourse) {
    HOD_COURSES.forEach((c) => {
      const ct = allTeachers.filter((t) => t.course === c);
      html += `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(56,224,184,.08);border-radius:8px;border:1px solid rgba(56,224,184,.2);font-size:13px;font-weight:700;color:var(--accent2);">🏛️ ${c} — ${ct.length} Teachers</div>`;
      ct.forEach((t) => {
        html += miniTchrRow(t);
      });
    });
  } else {
    data.forEach((t) => {
      html += miniTchrRow(t);
    });
  }
  document.getElementById("allTchrBody").innerHTML =
    html ||
    '<div class="empty-state"><div class="e-icon">📄</div><p>No teachers found.</p></div>';
  document.getElementById("allTchrOverlay").classList.add("open");
}

function miniTchrRow(t) {
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&size=80&background=random`;
  const avatar = t.avatar || fallbackAvatar;
  return `<div class="student-row" style="margin-bottom:6px;" onclick="openTeacherModal('${t.id}')">
    <img class="student-avatar" src="${avatar}" alt="" style="cursor:pointer;" onerror="this.onerror=null;this.src='${fallbackAvatar}';">
    <div class="student-info">
      <div class="sname">${t.name}</div>
      <span><b>Subject:</b> ${t.subject || "—"}</span>
      <span><b>Course:</b> ${t.course}</span>
      <span><b>Designation:</b> ${t.designation || "—"}</span>
      <span><b>Status:</b> <span class="badge badge-green">${t.status || "Active"}</span></span>
    </div>
  </div>`;
}
function closeAllTchr() {
  document.getElementById("allTchrOverlay").classList.remove("open");
}

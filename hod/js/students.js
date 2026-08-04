// hod/js/students.js - Students Section: List, Add, Edit, Delete, Search, Pagination

function loadStudentsSection() {
  activeStuCourse = null;
  activeStuSem = null;
  activeStuAllSems = false;
  stuDeleteMode = false;
  stuPromoteMode = false;
  renderStuCourseCards();
  if (HOD_COURSES.length) {
    const firstWithStudents =
      HOD_COURSES.find((c) => allStudents.some((s) => s.course === c)) ||
      HOD_COURSES[0];
    selectStuCourse(firstWithStudents);
    selectStuAllSems();
  } else {
    document.getElementById("stuSemTabs").style.display = "none";
    document.getElementById("stuContent").innerHTML =
      '<div class="empty-state"><div class="e-icon">No data</div><p>No students found.</p></div>';
  }
}

function renderStuCourseCards() {
  let html = `<div class="cpick ${activeStuCourse === "__REMOVED__" ? "active" : ""}" onclick="selectRemovedSection()" style="border-color:var(--danger)"><h4>🗂 Removed</h4><p>View &amp; recover</p></div>`;
  HOD_COURSES.forEach((c) => {
    let cnt = allStudents.filter((s) => s.course === c).length;
    html += `<div class="cpick ${activeStuCourse === c ? "active" : ""}" onclick="selectStuCourse('${_esc(c)}')"><h4>${c}</h4><p>${cnt} Students</p></div>`;
  });
  document.getElementById("stuCourseCards").innerHTML = html;
}

function selectStuCourse(c) {
  activeStuCourse = c;
  activeStuSem = null;
  activeStuAllSems = false;
  stuDeleteMode = false;
  stuPromoteMode = false;
  renderStuCourseCards();
  let tabs = document.getElementById("stuSemTabs");
  tabs.style.display = "flex";
  let html = `<div class="sem-tab select-all" onclick="selectStuAllSems()">All Sems</div>`;
  for (let s = 1; s <= SEM_COUNT; s++)
    html += `<div class="sem-tab" onclick="selectStuSem(${s})">Sem ${s}</div>`;
  tabs.innerHTML = html;
  document.getElementById("stuContent").innerHTML = "";
}

function selectStuAllSems() {
  activeStuAllSems = true;
  activeStuSem = null;
  stuDeleteMode = false;
  stuPromoteMode = false;
  document.querySelectorAll("#stuSemTabs .sem-tab").forEach((t, i) => {
    t.classList.toggle("active", i === 0);
  });
  renderStudentList();
}

function selectStuSem(sem) {
  activeStuSem = sem;
  activeStuAllSems = false;
  stuDeleteMode = false;
  stuPromoteMode = false;
  document
    .querySelectorAll("#stuSemTabs .sem-tab")
    .forEach((t, i) => t.classList.toggle("active", i === sem));
  renderStudentList();
}

let stuSearchQuery = "";

function renderStudentList() {
  let base = allStudents.filter(
    (s) =>
      s.course === activeStuCourse &&
      (activeStuAllSems || s.sem === activeStuSem),
  );
  let q = stuSearchQuery.trim().toLowerCase();
  let data = q
    ? base.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.roll || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q),
      )
    : base;

  let html = `<div class="toolbar student-toolbar">
    <button class="btn btn-ghost" onclick="downloadStudentTemplate()">Download Student Template</button>
    <label class="upload-excel-btn" title="Upload Excel"><input type="file" accept=".xlsx,.xls,.csv" onchange="handleStuExcel(event)">Upload Excel</label>
    <button class="btn btn-primary" onclick="toggleAddStudentForm()">+ Add Student</button>
    ${!activeStuAllSems && activeStuSem ? `<button class="btn btn-success" onclick="toggleStuPromoteMode()">${stuPromoteMode ? "Cancel" : "🎓 Promote Sem"}</button>` : ""}
    ${stuPromoteMode ? `<button class="btn btn-warn" onclick="openPromotePanel()">Promote Selected</button><span class="selected-count" id="stuPromoteSelectedCount">0 selected</span><button class="btn btn-ghost btn-sm" onclick="selectAllForPromote()">Select All</button>` : ""}
    <button class="btn btn-danger" onclick="toggleStuDeleteMode()">${stuDeleteMode ? "Cancel" : "Delete"}</button>
    ${stuDeleteMode ? `<button class="btn btn-warn" onclick="openDeletePanel()">Open Delete Panel</button><span class="selected-count" id="stuSelectedCount">0 selected</span>` : ""}
  </div>
  <div class="search-bar">
    <span>Search</span>
    <input type="text" id="stuSearchInput" placeholder="Search by name, roll no, email"
      value="${_html(stuSearchQuery)}"
      oninput="stuSearchQuery=this.value;renderStudentList()">
    ${stuSearchQuery ? `<span onclick="stuSearchQuery='';renderStudentList()" style="cursor:pointer;color:var(--danger);font-size:14px;" title="Clear">Clear</span>` : ""}
  </div>
  <div class="student-list-meta">
    Showing <b>${data.length}</b> of ${base.length} students
  </div>
  <div class="add-form-wrap" id="addStudentForm">
    <div class="card-title" style="margin-bottom:14px;"><span class="ct-icon">Student</span> Add New Student</div>
    <div class="form-grid">
      <div class="form-group"><label>Full Name</label><input id="newStuName" placeholder="Full Name"></div>
      <div class="form-group"><label>Roll No</label><input id="newStuRoll" placeholder="Roll No"></div>
      <div class="form-group"><label>Course</label><input value="${_html(activeStuCourse || "— Select a course tab first —")}" readonly></div>
      <div class="form-group"><label>Semester</label><select id="newStuSem">${Array.from({ length: SEM_COUNT }, (_, i) => `<option value="${i + 1}" ${(activeStuSem || 1) === i + 1 ? "selected" : ""}>Semester ${i + 1}</option>`).join("")}</select></div>
      <div class="form-group"><label>Phone</label><input id="newStuPhone" placeholder="Phone"></div>
      <div class="form-group"><label>Email <span style="color:var(--danger)">*</span></label><input id="newStuEmail" type="email" placeholder="Required — becomes the student's login email"></div>
      <div class="form-group"><label>Gender</label><select id="newStuGender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
      <div class="form-group"><label>Parent Name</label><input id="newStuParent" placeholder="Parent Name"></div>
      <div class="form-group"><label>Parent Phone</label><input id="newStuParentPhone" placeholder="Parent Phone"></div>
      <div class="form-group"><label>Parent Email (optional)</label><input id="newStuParentEmail" type="email" placeholder="Optional — becomes the parent's login email if provided"></div>
      <div class="form-group"><label>Address</label><input id="newStuAddress" placeholder="Address"></div>
    </div>
    <div class="student-form-actions"><button class="btn btn-success" onclick="addStudent()">Save Student</button><button class="btn btn-ghost" onclick="toggleAddStudentForm(false)">Cancel</button></div>
  </div>
  <div class="scroll-list"><div class="student-grid" id="studentGrid">`;
  if (!data.length) {
    html += `<div class="empty-state"><div class="e-icon">No data</div><p>${q ? 'No students match "' + _html(q) + '"' : "No students found."}</p></div>`;
  } else {
    data.forEach((s) => {
      html += studentRowHTML(s);
    });
  }
  html += `</div></div>`;
  document.getElementById("stuContent").innerHTML = html;
  if (q) {
    const si = document.getElementById("stuSearchInput");
    if (si) {
      si.focus();
      si.selectionStart = si.selectionEnd = si.value.length;
    }
  }
}

function studentRowHTML(s) {
  const initials = (s.name || "ST")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  const status = s.status || "Active";
  const avatarHtml = s.avatar
    ? `<img class="student-avatar" src="${s.avatar}" alt="${_html(s.name || "Student")}" onclick="openStudentModal('${s.id}')">`
    : `<div class="student-avatar student-avatar-initials" onclick="openStudentModal('${s.id}')">${initials}</div>`;
  return `<div class="student-row" id="srow_${s.id}">
    <div class="chk-col ${stuDeleteMode || stuPromoteMode ? "show" : ""}"><input type="checkbox" onchange="${stuPromoteMode ? "updateStuPromoteSelectedCount()" : "updateStuSelectedCount()"}" id="chk_${s.id}"></div>
    ${avatarHtml}
    <div class="student-info">
      <div class="sname">${_html(s.name || "Student")}</div>
      <span><b>Roll:</b> ${_html(s.roll || "-")}</span>
      <span><b>Course:</b> ${_html(s.course || "—")} - Sem ${s.sem || 1}</span>
      <span><b>Phone:</b> ${_html(s.phone || "-")}</span>
      <span><b>Gender:</b> ${_html(s.gender || "-")}</span>
      <span><b>Email:</b> ${_html(s.email || "-")}</span>
      <span><b>Status:</b> <span class="badge badge-green">${_html(status)}</span></span>
    </div>
    <div class="student-card-actions">
      <button class="btn btn-ghost btn-sm" onclick="openStudentModal('${s.id}')">Details</button>
      <button class="btn btn-warn btn-sm" onclick="openRemoveStudentConfirm('${s.id}','${_esc(s.name || "")}')">Remove</button>
      <button class="btn btn-danger btn-sm" onclick="openDeleteStudentConfirm('${s.id}','${_esc(s.name || "")}')">Delete</button>
    </div>
  </div>`;
}

// ─── Remove (reversible) ───────────────────────────────────────────────
function openRemoveStudentConfirm(id, name) {
  if (
    !confirm(
      `Move "${name}" to Removed? Their record and all data stay intact — you can bring them back into their same course/semester any time from the Removed section.`,
    )
  )
    return;
  apiJson("/api/hod/students/remove", {
    method: "POST",
    body: JSON.stringify({ ids: [id] }),
  })
    .then(() => {
      showToast("Student moved to Removed.");
      refreshStudents().then(renderStudentList);
    })
    .catch((e) => showToast(e.message || "Failed", true));
}

// ─── Delete (permanent) — requires typing the student's exact full name ──
function openDeleteStudentConfirm(id, name) {
  confirmDeleteModal({
    itemLabel: "student",
    name,
    onConfirm: () => {
      apiJson("/api/hod/students/" + id, { method: "DELETE" })
        .then(() => {
          showToast("Student permanently deleted.");
          refreshStudents().then(renderStudentList);
        })
        .catch((e) => showToast(e.message || "Failed", true));
    },
  });
}

function toggleStuDeleteMode() {
  stuDeleteMode = !stuDeleteMode;
  if (stuDeleteMode) stuPromoteMode = false;
  renderStudentList();
}
function updateStuSelectedCount() {
  let cnt = document.querySelectorAll(
    "#studentGrid input[type=checkbox]:checked",
  ).length;
  let el = document.getElementById("stuSelectedCount");
  if (el) el.textContent = cnt + " selected";
}

function toggleStuPromoteMode() {
  stuPromoteMode = !stuPromoteMode;
  if (stuPromoteMode) stuDeleteMode = false;
  renderStudentList();
}
function updateStuPromoteSelectedCount() {
  let cnt = document.querySelectorAll(
    "#studentGrid input[type=checkbox]:checked",
  ).length;
  let el = document.getElementById("stuPromoteSelectedCount");
  if (el) el.textContent = cnt + " selected";
}
function selectAllForPromote() {
  document
    .querySelectorAll("#studentGrid input[type=checkbox]")
    .forEach((c) => (c.checked = true));
  updateStuPromoteSelectedCount();
}

// Opens the confirmation panel for promoting selected students to the next
// semester (or graduating them, if they're already in the course's final sem).
function openPromotePanel() {
  let checked = [
    ...document.querySelectorAll("#studentGrid input[type=checkbox]:checked"),
  ];
  if (!checked.length) {
    showToast("Select students first.", true);
    return;
  }
  let ids = checked.map((c) => c.id.split("_").slice(1).join("_"));
  let sel = allStudents.filter((s) => ids.includes(s.id));
  const nextSem = (activeStuSem || 1) + 1;
  const isFinal = nextSem > SEM_COUNT;
  document.getElementById("promoteDesc").textContent = isFinal
    ? `These students are in the final semester and will be marked as Graduated:`
    : `These students will be advanced from Sem ${activeStuSem} to Sem ${nextSem}:`;
  document.getElementById("promotePanelList").innerHTML = sel
    .map(
      (s) =>
        `<div class="delete-item"><div class="student-avatar student-avatar-initials">${(
          s.name || "ST"
        )
          .split(" ")
          .map((w) => w[0])
          .join("")
          .substring(0, 2)
          .toUpperCase()}</div><div><b style="color:var(--text);">${_html(s.name)}</b><br>${_html(s.roll)} | ${_html(s.course)} Sem ${s.sem}</div></div>`,
    )
    .join("");
  document.getElementById("promoteCount").textContent = sel.length;
  document.getElementById("promoteOverlay").classList.add("open");
  window._toPromoteIds = ids;
}

async function confirmPromote() {
  if (!window._toPromoteIds || !window._toPromoteIds.length) {
    closePromotePanel();
    return;
  }
  try {
    const data = await apiJson("/api/hod/students/promote", {
      method: "POST",
      body: JSON.stringify({
        course: activeStuCourse,
        semester: activeStuSem,
        studentIds: window._toPromoteIds,
      }),
    });
    await refreshStudents();
    closePromotePanel();
    stuPromoteMode = false;
    renderStudentList();
    renderStuCourseCards();
    loadDashboard();
    showToast(data.message || "Students promoted.");
  } catch (e) {
    showToast(e.message || "Promotion failed", true);
  }
}

function closePromotePanel() {
  document.getElementById("promoteOverlay").classList.remove("open");
}

function toggleAddStudentForm(f) {
  let el = document.getElementById("addStudentForm");
  if (!el) return;
  el.classList.toggle(
    "open",
    f !== undefined ? f : !el.classList.contains("open"),
  );
}

async function addStudent() {
  let name = document.getElementById("newStuName").value.trim(),
    roll = document.getElementById("newStuRoll").value.trim();
  if (!name || !roll) {
    showToast("Name and Roll No required!", true);
    return;
  }
  if (!activeStuCourse) {
    showToast("Select a course tab before adding a student.", true);
    return;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentEmail = document.getElementById("newStuEmail").value.trim();
  if (!studentEmail) {
    showToast("Student email is required.", true);
    return;
  }
  if (!emailRe.test(studentEmail)) {
    showToast("Student email is not a valid email address.", true);
    return;
  }
  const parentEmail = document.getElementById("newStuParentEmail").value.trim();
  if (parentEmail && !emailRe.test(parentEmail)) {
    showToast("Parent email is not a valid email address.", true);
    return;
  }
  const sem = Number(
    document.getElementById("newStuSem")?.value || activeStuSem || 1,
  );
  try {
    await apiJson("/api/hod/students", {
      method: "POST",
      body: JSON.stringify({
        name,
        roll,
        course: activeStuCourse,
        courseName: activeStuCourse,
        sem,
        semester: sem,
        phone: document.getElementById("newStuPhone").value || "",
        email: studentEmail,
        gender: document.getElementById("newStuGender").value || "",
        parentName: document.getElementById("newStuParent").value || "",
        parentPhone: document.getElementById("newStuParentPhone").value || "",
        parentEmail,
        address: document.getElementById("newStuAddress").value || "",
        status: "Active",
      }),
    });
    await refreshStudents();
    if (!activeStuAllSems) activeStuSem = sem;
    renderStudentList();
    renderStuCourseCards();
    loadDashboard();
    showToast("Student added successfully!");
    toggleAddStudentForm(false);
  } catch (e) {
    showToast(e.message || "Add failed", true);
  }
}

function openDeletePanel() {
  let checked = [
    ...document.querySelectorAll("#studentGrid input[type=checkbox]:checked"),
  ];
  if (!checked.length) {
    showToast("Select students first.", true);
    return;
  }
  let ids = checked.map((c) => c.id.split("_").slice(1).join("_"));
  let sel = allStudents.filter((s) => ids.includes(s.id));
  document.getElementById("deletePanelList").innerHTML = sel
    .map(
      (s) =>
        `<div class="delete-item"><div class="student-avatar student-avatar-initials">${(
          s.name || "ST"
        )
          .split(" ")
          .map((w) => w[0])
          .join("")
          .substring(0, 2)
          .toUpperCase()}</div><div><b style="color:var(--text);">${_html(s.name)}</b><br>${_html(s.roll)} | ${_html(s.course)} Sem ${s.sem}</div></div>`,
    )
    .join("");
  document.getElementById("deleteCount").textContent = sel.length;
  document.getElementById("deleteOverlay").classList.add("open");
  window._toDeleteIds = ids;
}

async function confirmDelete() {
  if (!window._toDeleteIds || !window._toDeleteIds.length) {
    closeDeletePanel();
    return;
  }
  try {
    await apiJson("/api/hod/students", {
      method: "DELETE",
      body: JSON.stringify({ ids: window._toDeleteIds }),
    });
    await refreshStudents();
    closeDeletePanel();
    stuDeleteMode = false;
    renderStudentList();
    renderStuCourseCards();
    loadDashboard();
    showToast("Students deleted.");
  } catch (e) {
    showToast(e.message || "Delete failed", true);
  }
}

function closeDeletePanel() {
  document.getElementById("deleteOverlay").classList.remove("open");
}

function mField(label, val, key, type = "text") {
  return `<div class="modal-field" id="mf_${key}"><label>${label}</label><span>${val || "N/A"}</span><input type="${type}" value="${val || ""}" data-key="${key}"></div>`;
}
function mFieldSel(label, val, key, opts) {
  return `<div class="modal-field" id="mf_${key}"><label>${label}</label><span>${val || "N/A"}</span><select data-key="${key}">${opts.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
}

function closeLecHist() {
  document.getElementById("lecHistModal").classList.remove("open");
}

function toggleStuEdit() {
  stuEditMode = !stuEditMode;
  document
    .querySelectorAll("#studentModal .modal-field")
    .forEach((f) => f.classList.toggle("editing", stuEditMode));
  document.getElementById("stuEditBtn").style.display = stuEditMode
    ? "none"
    : "";
  document.getElementById("stuDoneBtn").style.display = stuEditMode
    ? ""
    : "none";
}

async function saveStuEdit() {
  let s = allStudents.find((x) => String(x.id) === String(currentStuId));
  if (!s) return;
  const patch = {};
  document.querySelectorAll("#studentModal .modal-field").forEach((f) => {
    let inp = f.querySelector("input,select");
    if (inp) {
      let k = inp.dataset.key;
      if (k) patch[k] = inp.type === "number" ? Number(inp.value) : inp.value;
    }
  });
  try {
    await apiJson(`/api/hod/students/${s._id || s.id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    await refreshStudents();
    s = allStudents.find((x) => x.id === currentStuId) || s;
    document
      .querySelectorAll("#studentModal .modal-field span")
      .forEach((sp) => {
        let inp = sp.parentElement.querySelector("input,select");
        if (inp) sp.textContent = inp.value || "N/A";
      });
    document.getElementById("modalName").textContent = s.name;
    toggleStuEdit();
    document.getElementById("stuEditSuccess").style.display = "block";
    setTimeout(
      () => (document.getElementById("stuEditSuccess").style.display = "none"),
      3000,
    );
    renderStudentList();
    renderStuCourseCards();
    loadDashboard();
    showToast("Student updated!");
  } catch (e) {
    showToast(e.message || "Update failed", true);
  }
}

function closeStudentModal() {
  document.getElementById("studentModal").classList.remove("open");
  stuEditMode = false;
}

function _esc(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}
function _html(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

// ═══════════════════════════════════════════════════════════
// REMOVED SECTION — reversible off-boarding. Students here keep every field
// (course, semester, attendance, marks — nothing touched); recovering them
// just flips status back to Active, landing them right back in the course
// and semester they already had.
// ═══════════════════════════════════════════════════════════
let removedStudents = [];
let removedRecoverMode = false;

async function selectRemovedSection() {
  activeStuCourse = "__REMOVED__";
  activeStuSem = null;
  activeStuAllSems = false;
  stuDeleteMode = false;
  stuPromoteMode = false;
  removedRecoverMode = false;
  renderStuCourseCards();
  document.getElementById("stuSemTabs").style.display = "none";
  document.getElementById("stuContent").innerHTML =
    '<div class="loading-msg">Loading removed students…</div>';
  try {
    const data = await apiJson("/api/hod/students?status=Removed");
    removedStudents = data.students || data.data?.students || [];
    renderRemovedList();
  } catch (e) {
    document.getElementById("stuContent").innerHTML =
      `<div class="empty-state"><p>${e.message || "Failed to load"}</p></div>`;
  }
}

function renderRemovedList() {
  let html = `<div class="toolbar student-toolbar">
    <button class="btn ${removedRecoverMode ? "btn-ghost" : "btn-success"}" onclick="toggleRemovedRecoverMode()">${removedRecoverMode ? "Cancel" : "↩ Recover"}</button>
    ${removedRecoverMode ? `<button class="btn btn-primary" onclick="confirmRecoverSelected()">Recover Selected</button><span class="selected-count" id="removedSelectedCount">0 selected</span><button class="btn btn-ghost btn-sm" onclick="selectAllRemoved()">Select All</button>` : ""}
  </div>
  <div class="student-list-meta">Showing <b>${removedStudents.length}</b> removed student(s)</div>
  <div class="scroll-list"><div class="student-grid">`;
  if (!removedStudents.length) {
    html += `<div class="empty-state"><div class="e-icon">🗂</div><p>No removed students. Anyone moved to Removed shows up here.</p></div>`;
  } else {
    removedStudents.forEach((s) => {
      const initials = (s.name || "ST")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      const avatarHtml = s.avatar
        ? `<img class="student-avatar" src="${s.avatar}" alt="${_html(s.name || "Student")}">`
        : `<div class="student-avatar student-avatar-initials">${initials}</div>`;
      html += `<div class="student-row">
        <div class="chk-col ${removedRecoverMode ? "show" : ""}"><input type="checkbox" onchange="updateRemovedSelectedCount()" id="rchk_${s.id}"></div>
        ${avatarHtml}
        <div class="student-info">
          <div class="sname">${_html(s.name || "Student")}</div>
          <span><b>Roll:</b> ${_html(s.roll || "-")}</span>
          <span><b>Course:</b> ${_html(s.course || "—")} - Sem ${s.sem || 1}</span>
          <span><b>Email:</b> ${_html(s.email || "-")}</span>
        </div>
      </div>`;
    });
  }
  html += `</div></div>`;
  document.getElementById("stuContent").innerHTML = html;
}

function toggleRemovedRecoverMode() {
  removedRecoverMode = !removedRecoverMode;
  renderRemovedList();
}

function selectAllRemoved() {
  document
    .querySelectorAll("#stuContent .chk-col.show input[type=checkbox]")
    .forEach((c) => (c.checked = true));
  updateRemovedSelectedCount();
}

function updateRemovedSelectedCount() {
  const n = document.querySelectorAll(
    "#stuContent .chk-col.show input[type=checkbox]:checked",
  ).length;
  const el = document.getElementById("removedSelectedCount");
  if (el) el.textContent = `${n} selected`;
}

function confirmRecoverSelected() {
  const ids = removedStudents
    .filter((s) => document.getElementById("rchk_" + s.id)?.checked)
    .map((s) => s.id);
  if (!ids.length) {
    showToast("Select at least one student to recover.", true);
    return;
  }
  const names = removedStudents
    .filter((s) => ids.includes(s.id))
    .map((s) => `${s.name} (${s.course} Sem ${s.sem})`)
    .join("\n");
  if (
    !confirm(
      `Recover ${ids.length} student(s) back into their original course/semester?\n\n${names}`,
    )
  )
    return;
  apiJson("/api/hod/students/recover", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
    .then(async () => {
      showToast(`${ids.length} student(s) recovered.`);
      await refreshStudents();
      selectRemovedSection();
      renderStuCourseCards();
    })
    .catch((e) => showToast(e.message || "Failed", true));
}

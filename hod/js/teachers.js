// hod/js/teachers.js — Teachers Section: List, Cards, Add, Edit, Delete, Search

/* ═══ TEACHERS ═══ */
function loadTeachersSection() {
  activeTchrCourse = null;
  tchrDeleteMode = false;
  tchrViewMode = "cards";
  tchrFilterCourse = "";
  tchrFilterSem = "";
  tchrSearchQuery = "";
  renderTchrCourseCards();
  renderAllTeacherCards();
}
function renderTchrCourseCards() {
  let html = HOD_COURSES.map((c) => {
    let cnt = allTeachers.filter((t) => t.course === c).length;
    return `<div class="cpick ${activeTchrCourse === c ? "active" : ""}" onclick="selectTchrCourse('${c}')"><h4>${c}</h4><p>${cnt} Teachers</p></div>`;
  }).join("");
  html += `<div class="cpick ${tchrViewMode === "cards" ? "active" : ""}" style="border-color:var(--accent2);" onclick="showAllTeachers()"><h4 style="color:var(--accent2);">👤</h4><p>All Teachers</p></div>`;
  document.getElementById("tchrCourseCards").innerHTML = html;
}
function selectTchrCourse(c) {
  activeTchrCourse = c;
  tchrDeleteMode = false;
  tchrViewMode = "list";
  tchrSearchQuery = "";
  renderTchrCourseCards();
  renderTeacherList();
}
function showAllTeachers() {
  tchrViewMode = "cards";
  activeTchrCourse = null;
  renderTchrCourseCards();
  tchrFilterCourse = "";
  tchrFilterSem = "";
  renderAllTeacherCards();
}
/* Teacher filter state */
let tchrSearchQuery = "";

function renderAllTeacherCards() {
  let courseSel = `<select onchange="tchrFilterCourse=this.value;renderAllTeacherCards()"><option value="">All Courses</option>${HOD_COURSES.map((c) => `<option ${tchrFilterCourse === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
  /* Apply all filters: course + name/subject search */
  let q = tchrSearchQuery.trim().toLowerCase();
  let filtered = allTeachers.filter((t) => {
    let courseOk = !tchrFilterCourse || t.course === tchrFilterCourse;
    let searchOk =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.designation.toLowerCase().includes(q);
    return courseOk && searchOk;
  });
  let html = `
  <div class="tchr-filter-bar" style="flex-wrap:wrap;gap:8px;">
    <span style="font-weight:700;font-size:13px;color:var(--text2);">Filter:</span>
    ${courseSel}
    <button class="btn btn-ghost btn-sm" onclick="tchrFilterCourse='';tchrSearchQuery='';renderAllTeacherCards()">Reset</button>
    <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--accent);">${filtered.length} teachers</span>
  </div>
  <!-- Teacher search bar -->
  <div class="search-bar">
    <span>🔍</span>
    <input type="text" id="tchrSearchInput" placeholder="Search by name or subject¦"
      value="${tchrSearchQuery}"
      oninput="tchrSearchQuery=this.value;renderAllTeacherCards()">
    ${tchrSearchQuery ? `<span onclick="tchrSearchQuery='';renderAllTeacherCards()" style="cursor:pointer;color:var(--danger);font-size:14px;" title="Clear">✕</span>` : ""}
  </div>
  <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px;font-weight:600;">
    Showing <b style="color:var(--accent)">${filtered.length}</b> of ${allTeachers.length} teachers
  </div>
  <div class="teacher-card-grid">`;
  if (!filtered.length) {
    html += `</div><div class="empty-state"><div class="e-icon">🔍</div><p>${q ? 'No teachers match "' + q + '"' : "No teachers found."}</p></div>`;
  } else {
    filtered.forEach((t) => {
      html += `<div class="teacher-card" onclick="openTeacherModal('${t.id}')">
        <img src="${t.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(t.name) + "&size=150&background=random"}" alt="">
        <div class="tc-name">${t.name}</div>
        <div class="tc-sub">${t.subject}</div>
        <span class="tc-course">${t.course}</span>
        <div style="margin-top:5px;font-size:11px;color:var(--text3);">${t.designation}</div>
      </div>`;
    });
    html += `</div>`;
  }
  document.getElementById("tchrContent").innerHTML = html;
  /* Keep search input focused */
  if (q) {
    const si = document.getElementById("tchrSearchInput");
    if (si) {
      si.focus();
      si.selectionStart = si.selectionEnd = si.value.length;
    }
  }
}
function renderTeacherList() {
  let base = allTeachers.filter((t) => t.course === activeTchrCourse);
  // NOTE: this must NOT be named the same as the <input id="tchrListSearch">
  // below. Browsers auto-expose any element with an `id` as a same-named
  // property on `window`, so `window.tchrListSearch` would resolve to the
  // <input> DOM element itself (not a string) before anything was ever
  // typed — causing `.toLowerCase()` to be called on the element and crash
  // with "(window.tchrListSearch || "").toLowerCase is not a function".
  let q = (window._tchrListSearchQuery || "").toLowerCase();
  let data = q
    ? base.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q),
      )
    : base;
  let html = `<div class="toolbar">
    <button class="btn btn-ghost" onclick="downloadTeacherTemplate()">Download Teacher Template</button>
    <label class="upload-excel-btn" title="Upload Excel"><input type="file" accept=".xlsx,.xls,.csv" onchange="handleTchrExcel(event)">📄 Upload Excel</label>
    <button class="btn btn-primary" onclick="toggleAddTeacherForm()">👨‍🏫‹ Add Teacher</button>
    <button class="btn btn-danger" onclick="toggleTchrDeleteMode()">${tchrDeleteMode ? "✕ Cancel" : "🗑 Delete"}</button>
    ${tchrDeleteMode ? `<button class="btn btn-warn" onclick="openTchrDeletePanel()">Open Delete Panel</button><span class="selected-count" id="tchrSelectedCount">0 selected</span>` : ""}
  </div>
  <div class="search-bar"><span>🔍</span>
    <input type="text" id="tchrListSearch" placeholder="Search teacher by name or subject¦" value="${q}"
      oninput="window._tchrListSearchQuery=this.value;renderTeacherList()">
    ${q ? `<span onclick="window._tchrListSearchQuery='';renderTeacherList()" style="cursor:pointer;color:var(--danger);" title="Clear">✕</span>` : ""}
  </div>
  <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px;font-weight:600;">
    Showing <b style="color:var(--accent)">${data.length}</b> of ${base.length} teachers
  </div>
  <div class="add-form-wrap" id="addTeacherForm">
    <div class="card-title" style="margin-bottom:14px;"><span class="ct-icon">🧑‍🏫</span> Add New Teacher</div>
    <div class="form-grid">
      <div class="form-group"><label>Full Name</label><input id="newTchrName" placeholder="Full Name"></div>
      <div class="form-group"><label>Subject</label><input id="newTchrSubject" placeholder="Subject"></div>
      <div class="form-group"><label>Phone</label><input id="newTchrPhone" placeholder="Phone"></div>
      <div class="form-group"><label>Email</label><input id="newTchrEmail" placeholder="Email"></div>
      <div class="form-group"><label>Designation</label><select id="newTchrDesig"><option value="">Select</option><option>Assistant Professor</option><option>Associate Professor</option><option>Professor</option></select></div>
    </div>
    <div style="display:flex;gap:10px;"><button class="btn btn-success" onclick="addTeacher()">✅ Save Teacher</button><button class="btn btn-ghost" onclick="toggleAddTeacherForm(false)">Cancel</button></div>
  </div>
  <div class="scroll-list"><div class="student-grid" id="teacherGrid">`;
  data.forEach((t) => {
    html += teacherRowHTML(t);
  });
  html += `</div></div>`;
  document.getElementById("tchrContent").innerHTML = html;
}
function teacherRowHTML(t) {
  return `<div class="student-row" id="trow_${t.id}"><div class="chk-col ${tchrDeleteMode ? "show" : ""}"><input type="checkbox" onchange="updateTchrSelectedCount()" id="tchk_${t.id}"></div><img class="student-avatar" src="${t.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(t.name) + "&size=150&background=random"}" onclick="openTeacherModal('${t.id}')" alt=""><div class="student-info"><div class="sname">${t.name}</div><span><b>Subject:</b> ${t.subject}</span><span><b>Course:</b> ${t.course}</span><span><b>Phone:</b> ${t.phone}</span><span><b>Designation:</b> ${t.designation}</span><span><b>Email:</b> ${t.email}</span><span><b>Status:</b> <span class="badge badge-green">${t.status}</span></span></div><div class="student-card-actions"><button class="btn btn-ghost btn-sm" onclick="openTeacherModal('${t.id}')">Details</button><button class="btn btn-danger btn-sm" onclick="openDeleteTeacherConfirm('${t.id}','${_esc(t.name || "")}')">Delete</button></div></div>`;
}

// Same pattern as student deletion — permanent, requires typing the exact
// full name to confirm, so it can never happen from a stray click.
function openDeleteTeacherConfirm(id, name) {
  confirmDeleteModal({
    itemLabel: "teacher",
    name,
    onConfirm: () => {
      apiJson("/api/hod/teachers/" + id, { method: "DELETE" })
        .then(() => {
          showToast("Teacher permanently deleted.");
          refreshTeachers().then(() => {
            renderTeacherList();
            renderTchrCourseCards();
          });
        })
        .catch((e) => showToast(e.message || "Failed", true));
    },
  });
}
function toggleTchrDeleteMode() {
  tchrDeleteMode = !tchrDeleteMode;
  renderTeacherList();
}
function updateTchrSelectedCount() {
  let cnt = document.querySelectorAll(
    "#teacherGrid input[type=checkbox]:checked",
  ).length;
  let el = document.getElementById("tchrSelectedCount");
  if (el) el.textContent = cnt + " selected";
}
function toggleAddTeacherForm(f) {
  let el = document.getElementById("addTeacherForm");
  if (!el) return;
  el.classList.toggle(
    "open",
    f !== undefined ? f : !el.classList.contains("open"),
  );
}
async function addTeacher() {
  let name = document.getElementById("newTchrName").value.trim(),
    subject = document.getElementById("newTchrSubject").value.trim();
  if (!name || !subject) {
    showToast("Name and Subject required!", true);
    return;
  }
  try {
    await apiJson("/api/hod/teachers", {
      method: "POST",
      body: JSON.stringify({
        name,
        subject,
        course: activeTchrCourse,
        phone: document.getElementById("newTchrPhone").value || "",
        email: document.getElementById("newTchrEmail").value || "",
        designation: document.getElementById("newTchrDesig").value || "",
      }),
    });
    await refreshTeachers();
    renderTeacherList();
    renderTchrCourseCards();
    loadDashboard();
    showToast("Teacher added successfully!");
    toggleAddTeacherForm(false);
  } catch (e) {
    showToast(e.message || "Add failed", true);
  }
}
function openTchrDeletePanel() {
  let checked = [
    ...document.querySelectorAll("#teacherGrid input[type=checkbox]:checked"),
  ];
  if (!checked.length) {
    showToast("Select teachers first.", true);
    return;
  }
  let ids = checked.map((c) => c.id.split("_").slice(1).join("_"));
  let sel = allTeachers.filter((t) => ids.includes(t.id));
  document.getElementById("deleteTchrPanelList").innerHTML = sel
    .map(
      (t) =>
        `<div class="delete-item"><img src="${t.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(t.name) + "&size=80&background=random"}"><div><b style="color:var(--text);">${t.name}</b><br>${t.subject} | ${t.course}</div></div>`,
    )
    .join("");
  document.getElementById("deleteTchrCount").textContent = sel.length;
  document.getElementById("deleteTchrOverlay").classList.add("open");
  window._toDeleteTchrIds = ids;
}
async function confirmDeleteTchr() {
  if (!window._toDeleteTchrIds || !window._toDeleteTchrIds.length) {
    closeTchrDeletePanel();
    return;
  }
  try {
    await apiJson("/api/hod/teachers", {
      method: "DELETE",
      body: JSON.stringify({ ids: window._toDeleteTchrIds }),
    });
    await refreshTeachers();
    closeTchrDeletePanel();
    tchrDeleteMode = false;
    renderTeacherList();
    renderTchrCourseCards();
    loadDashboard();
    showToast("Teachers deleted.");
  } catch (e) {
    showToast(e.message || "Delete failed", true);
  }
}
function closeTchrDeletePanel() {
  document.getElementById("deleteTchrOverlay").classList.remove("open");
}

/* TEACHER MODAL */

function toggleTchrEdit() {
  tchrEditMode = !tchrEditMode;
  document
    .querySelectorAll("#teacherModal .modal-field")
    .forEach((f) => f.classList.toggle("editing", tchrEditMode));
  document.getElementById("tchrEditBtn").style.display = tchrEditMode
    ? "none"
    : "";
  document.getElementById("tchrDoneBtn").style.display = tchrEditMode
    ? ""
    : "none";
}
async function saveTchrEdit() {
  let t = allTeachers.find((x) => String(x.id) === String(currentTchrId));
  if (!t) return;
  const keyMap = {
    tphone: "phone",
    temail: "email",
    tcourse: "course",
    tstatus: "status",
    tdesig: "designation",
    tsubject: "subject",
    tqualification: "qualification",
    texperience: "experience",
    tjoinDate: "joinDate",
    temergency: "emergencyContact",
  };
  const patch = {};
  document.querySelectorAll("#teacherModal .modal-field").forEach((f) => {
    let inp = f.querySelector("input,select");
    if (inp) {
      let k = keyMap[inp.dataset.key];
      if (k) patch[k] = inp.value;
    }
  });
  if ("emergencyContact" in patch) {
    const digits = String(patch.emergencyContact || "")
      .trim()
      .replace(/[\s\-()]/g, "");
    if (!digits) {
      showToast("Emergency contact number is required.", true);
      return;
    }
    if (!/^\+?\d{10,15}$/.test(digits)) {
      showToast(
        "Emergency contact must be a valid mobile number (10-15 digits).",
        true,
      );
      return;
    }
  }
  try {
    await apiJson(`/api/hod/teachers/${t._id || t.id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    await refreshTeachers();
    t = allTeachers.find((x) => x.id === currentTchrId) || t;
    document
      .querySelectorAll("#teacherModal .modal-field span")
      .forEach((sp) => {
        let inp = sp.parentElement.querySelector("input,select");
        if (inp) sp.textContent = inp.value || "N/A";
      });
    document.getElementById("tModalName").textContent = t.name;
    document.getElementById("tModalMeta").textContent =
      `${t.designation} | ${t.course}`;
    toggleTchrEdit();
    document.getElementById("tchrEditSuccess").style.display = "block";
    setTimeout(
      () => (document.getElementById("tchrEditSuccess").style.display = "none"),
      3000,
    );
    renderTchrCourseCards();
    loadDashboard();
    showToast("Teacher updated!");
  } catch (e) {
    showToast(e.message || "Update failed", true);
  }
}
function closeTeacherModal() {
  document.getElementById("teacherModal").classList.remove("open");
  tchrEditMode = false;
}

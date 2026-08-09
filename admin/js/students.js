// js/students.js - Students list with search
const Students = {
  _page: 1,
  _search: "",

  async load() {
    UI.setNav("students");
    Students._bindSearch();
    await Students._fetch();
  },

  _bindSearch() {
    const si = document.getElementById("student-search");
    if (!si || si._b) return;
    si._b = true;
    let t;
    si.addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        Students._search = e.target.value;
        Students._page = 1;
        Students._fetch();
      }, 350);
    });
  },

  async _fetch() {
    const tbody = document.getElementById("student-tbody");
    tbody.innerHTML = `<tr><td colspan="9">${UI.sk(4, 38)}</td></tr>`;
    const q = [
      `page=${Students._page}`,
      "limit=20",
      "role=student",
      Students._search ? `search=${encodeURIComponent(Students._search)}` : "",
    ]
      .filter(Boolean)
      .join("&");
    try {
      const d = await apiJson("/api/admin/students?" + q);
      const list = d.data || d.students || [];
      const meta = d.meta || {};
      document.getElementById("student-count").textContent =
        `(${UI.num(meta.total || list.length)})`;
      tbody.innerHTML = list.length
        ? list
            .map(
              (s, i) => `
        <tr>
          <td>${(Students._page - 1) * 20 + i + 1}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            ${s.avatar ? `<img class="av" src="${s.avatar}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover" onerror="avatarFallback(this, '${UI.initials(s.name)}')">` : `<div class="av">${UI.initials(s.name)}</div>`}
            <div><div style="font-weight:500">${s.name}</div>
            <div style="font-size:11px;color:var(--text3)">${s.email || "-"}</div></div>
          </div></td>
          <td><code style="color:var(--accent);font-size:11px">${s.rollNo || s.roll || "-"}</code></td>
          <td>${s.department?.name || s.dept || "-"}</td>
          <td>${s.course?.name || s.courseName || s.course || "—"}</td>
          <td>${s.semester || s.sem || 1}</td>
          <td>${s.mobile || "-"}</td>
          <td><span class="badge ${s.isActive !== false ? "bg" : "br"}">${s.isActive !== false ? "Active" : "Inactive"}</span></td>
          <td>
            <button class="ibtn" title="${s.isActive ? "Deactivate" : "Activate"}" onclick="Students.toggle('${s._id || s.id}','${s.name}',${s.isActive !== false})">${s.isActive !== false ? "Pause" : "Play"}</button>
            <button class="ibtn del" title="Delete" onclick="Students.del('${s._id || s.id}','${s.name}')">Del</button>
          </td>
        </tr>`,
            )
            .join("")
        : UI.emptyRow(
            9,
            Students._search
              ? `No students matching "${Students._search}"`
              : "No students found.",
          );
      Students._renderPager(meta);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
    }
  },

  _renderPager(meta) {
    const el = document.getElementById("student-pager");
    if (!meta || meta.totalPages <= 1) {
      if (el) el.innerHTML = "";
      return;
    }
    el.innerHTML =
      `<button class="pb${meta.page <= 1 ? " dis" : ""}" onclick="Students._page=${meta.page - 1};Students._fetch()">&lt;</button>` +
      Array.from(
        { length: meta.totalPages },
        (_, i) =>
          `<button class="pb${i + 1 === meta.page ? " act" : ""}" onclick="Students._page=${i + 1};Students._fetch()">${i + 1}</button>`,
      ).join("") +
      `<button class="pb${meta.page >= meta.totalPages ? " dis" : ""}" onclick="Students._page=${meta.page + 1};Students._fetch()">&gt;</button>`;
  },

  async openAddModal() {
    document.getElementById("student-form").reset();
    try {
      const d = await apiJson("/api/admin/departments");
      const list = d.data || d.departments || [];
      const deptEl = document.getElementById("stu-dept");
      if (deptEl) {
        deptEl.innerHTML =
          '<option value="">-- Select Department --</option>' +
          list
            .map(
              (dep) =>
                `<option value="${dep._id || dep.id}">${dep.name}</option>`,
            )
            .join("");
        if (!deptEl._courseBound) {
          deptEl._courseBound = true;
          deptEl.addEventListener("change", () =>
            Students._loadCourses(deptEl.value),
          );
        }
      }
      await Students._loadCourses("");
    } catch {
      /* silently fail */
    }
    UI.openModal("modal-student");
  },

  async _loadCourses(deptId) {
    const courseEl = document.getElementById("stu-course");
    if (!courseEl) return;
    courseEl.innerHTML = '<option value="">— Select Course —</option>';
    if (!deptId) return;
    try {
      const d = await apiJson(
        "/api/admin/courses?department=" + encodeURIComponent(deptId),
      );
      const list = d.data || d.courses || [];
      courseEl.innerHTML =
        '<option value="">— Select Course —</option>' +
        list
          .map((c) => `<option value="${c.name}">${c.name}</option>`)
          .join("");
    } catch {
      /* keep placeholder */
    }
  },

  async add() {
    const name = [
      document.getElementById("stu-fname").value.trim(),
      document.getElementById("stu-lname").value.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const email = document.getElementById("stu-email").value.trim();
    const mobile = document.getElementById("stu-mobile").value.trim();
    const dept = document.getElementById("stu-dept").value;
    const course = document.getElementById("stu-course")?.value || "";
    const sem = Number(document.getElementById("stu-sem")?.value || 1);
    const roll = document.getElementById("stu-roll").value.trim();
    const pName = document.getElementById("parent-name").value.trim();
    const pEmail = document.getElementById("parent-email").value.trim();
    const pMobile = document.getElementById("parent-mobile").value.trim();
    if (!name || !email) {
      UI.toast("Name and email required", "error");
      return;
    }
    if (!dept) {
      UI.toast("Department is required.", "error");
      return;
    }
    if (!course) {
      UI.toast("Course is required.", "error");
      return;
    }
    if (!pEmail) {
      UI.toast("Parent email is required.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pEmail)) {
      UI.toast("Parent email is not a valid email address.", "error");
      return;
    }
    if (pEmail.toLowerCase() === email.toLowerCase()) {
      UI.toast(
        "Parent email cannot be the same as the student email.",
        "error",
      );
      return;
    }
    try {
      await apiJson("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          mobile,
          departmentId: dept,
          course,
          courseName: course,
          sem,
          semester: sem,
          rollNo: roll,
          parentName: pName,
          parentEmail: pEmail,
          parentMobile: pMobile,
        }),
      });
      UI.toast("Student added");
      UI.closeAll();
      document.getElementById("student-form").reset();
      await Students._fetch();
    } catch (e) {
      UI.toast(e.message || "Failed", "error");
    }
  },

  async toggle(id, name, active) {
    if (!confirm(`${active ? "Deactivate" : "Activate"} ${name}?`)) return;
    try {
      await apiJson("/api/admin/users/" + id + "/toggle", { method: "POST" });
      UI.toast(active ? "Deactivated" : "Activated");
      await Students._fetch();
    } catch (e) {
      UI.toast(e.message || "Failed", "error");
    }
  },

  async del(id, name) {
    UI.confirmDelete({
      itemLabel: "student",
      name,
      onConfirm: async () => {
        try {
          await apiJson("/api/admin/users/" + id, { method: "DELETE" });
          UI.toast("Permanently deleted");
          await Students._fetch();
        } catch (e) {
          UI.toast(e.message || "Failed", "error");
        }
      },
    });
  },
};

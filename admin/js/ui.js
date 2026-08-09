// js/ui.js — UI helpers + dark mode
const UI = {
  toast(msg, type = "success") {
    let c = document.getElementById("toasts");
    if (!c) {
      c = document.createElement("div");
      c.id = "toasts";
      document.body.appendChild(c);
    }
    const t = document.createElement("div");
    t.className = "toast toast-" + type;
    t.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 4000);
  },
  openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("open");
      document.body.style.overflow = "hidden";
    }
  },
  closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("open");
      document.body.style.overflow = "";
    }
  },
  closeAll() {
    document
      .querySelectorAll(".modal.open")
      .forEach((m) => m.classList.remove("open"));
    document.body.style.overflow = "";
  },
  setNav(s) {
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.toggle("active", b.dataset.s === s));
    document
      .querySelectorAll(".pg")
      .forEach((p) => p.classList.toggle("hidden", p.id !== "pg-" + s));
    const titles = {
      dashboard: "Dashboard",
      departments: "Departments",
      courses: "Courses",
      subjects: "Subjects",
      teachers: "Teachers",
      students: "Students",
      notices: "Notices",
      reports: "Reports & Analytics",
      settings: "Settings",
    };
    const el = document.getElementById("pg-title");
    if (el) el.textContent = titles[s] || s;
    if (window.innerWidth < 768) UI.closeSb();
  },
  toggleSb() {
    document.getElementById("sb").classList.toggle("open");
    document.getElementById("ov").classList.toggle("show");
  },
  closeSb() {
    document.getElementById("sb")?.classList.remove("open");
    document.getElementById("ov")?.classList.remove("show");
  },
  fmt(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return "—";
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${dt.getFullYear()}`;
  },
  fmtDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return "—";
    const time = dt.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${UI.fmt(d)} ${time}`;
  },
  num(n) {
    return (n || 0).toLocaleString("en-IN");
  },
  initials(n) {
    return (
      (n || "")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "?"
    );
  },
  sk(n = 4, h = 44) {
    return Array(n)
      .fill(
        `<div class="sk" style="height:${h}px;border-radius:6px;margin-bottom:8px"></div>`,
      )
      .join("");
  },
  emptyRow(cols, msg) {
    return `<tr><td colspan="${cols}" class="empty">${msg || "No data found."}</td></tr>`;
  },

  // Dark mode
  initDarkMode() {
    const saved = localStorage.getItem("sal_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    UI._updateToggleIcon(saved);
  },
  toggleDarkMode() {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("sal_theme", next);
    UI._updateToggleIcon(next);
  },
  _updateToggleIcon(theme) {
    const btn = document.getElementById("dark-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  },
};

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) UI.closeAll();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") UI.closeAll();
});
document.addEventListener("DOMContentLoaded", () => UI.initDarkMode());

// Shared avatar photo → initials fallback. Wired as the onerror handler on
// every avatar <img> below — if the photo URL fails to load, this swaps it
// for the plain initials avatar instead of a broken image / raw alt-text.
function avatarFallback(imgEl, initials) {
  if (!imgEl) return;
  const parent = imgEl.parentElement;
  if (parent && parent.children.length === 1) {
    parent.textContent = initials || "?";
    return;
  }
  const div = document.createElement("div");
  div.className = imgEl.className || "";
  if (imgEl.getAttribute("style"))
    div.setAttribute("style", imgEl.getAttribute("style"));
  div.textContent = initials || "?";
  imgEl.replaceWith(div);
}

// Shared avatar-cell renderer — photo if present, else initials circle.
// Used across hod.js / teachers.js / students.js so every person-list row
// looks consistent whether they have a profile photo on file or not.
function avatarCell(person) {
  const photo = person?.avatar || person?.photo || person?.profilePhoto || "";
  const name = person?.name || person?.facultyName || "";
  const initials = UI.initials(name);
  if (photo) {
    return `<img class="av" src="${photo}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover" onerror="avatarFallback(this, '${initials}')">`;
  }
  return `<div class="av">${initials}</div>`;
}

// Spec item 5: hard delete only, no soft delete — every delete action must
// show a clear "this is permanent" warning and require the person to type
// the exact name before the Delete button will do anything. This replaces
// plain confirm()/UI.confirm() calls for destructive delete actions
// specifically (deactivate/toggle actions are reversible and keep their
// simple confirm()).
UI.confirmDelete = function ({
  title = "Delete",
  name,
  itemLabel = "record",
  onConfirm,
}) {
  document.getElementById("confirmDeleteOverlay")?.remove();
  const safeName = String(name || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
  const html = `
    <div class="modal open" id="confirmDeleteOverlay" style="display:flex;align-items:center;justify-content:center" onclick="if(event.target===this) this.remove()">
      <div class="modal-card" style="max-width:420px;background:var(--surface,#fff);border-radius:12px;padding:24px">
        <h3 style="margin:0 0 8px;color:#dc2626">⚠ Permanently Delete ${itemLabel}</h3>
        <p style="margin:0 0 14px;font-size:14px">This will permanently delete <strong>${safeName}</strong> from the system. This cannot be undone.</p>
        <p style="margin:0 0 6px;font-size:13px">Type <strong>${safeName}</strong> to confirm:</p>
        <input type="text" id="confirmDeleteInput" style="width:100%;padding:9px;border:1px solid var(--border,#ccc);border-radius:8px;margin-bottom:14px" autocomplete="off">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="document.getElementById('confirmDeleteOverlay').remove()">Cancel</button>
          <button class="btn btn-danger" id="confirmDeleteBtn" disabled style="opacity:.5;cursor:not-allowed">Permanently Delete</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const input = document.getElementById("confirmDeleteInput");
  const btn = document.getElementById("confirmDeleteBtn");
  input.addEventListener("input", () => {
    const match = input.value === name;
    btn.disabled = !match;
    btn.style.opacity = match ? "1" : ".5";
    btn.style.cursor = match ? "pointer" : "not-allowed";
  });
  btn.addEventListener("click", async () => {
    document.getElementById("confirmDeleteOverlay")?.remove();
    await onConfirm();
  });
  input.focus();
};
